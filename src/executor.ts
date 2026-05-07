import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, relative } from "node:path";
import type {
  ExecutionAction,
  ExecutionActionInput,
  ExecutionResult,
  WorkspaceDescriptor
} from "./types.js";

export interface ExecutorOptions {
  now?: () => Date;
  idFactory?: () => string;
  allowedCommands?: string[];
  defaultTimeoutMs?: number;
  outputPreviewLength?: number;
}

export class Executor {
  private readonly now: () => Date;
  private readonly idFactory: () => string;
  private readonly allowedCommands: Set<string>;
  private readonly defaultTimeoutMs: number;
  private readonly outputPreviewLength: number;

  constructor(private readonly workspace: WorkspaceDescriptor, options: ExecutorOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? randomUUID;
    this.allowedCommands = new Set(options.allowedCommands ?? ["npm", "node", "git", "ls", "cat", "pwd", "mkdir", "cp"]);
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 120_000;
    this.outputPreviewLength = options.outputPreviewLength ?? 2_000;
  }

  createAction(
    input: ExecutionActionInput,
    sessionId: string,
    agentId: string,
    messageId: string
  ): ExecutionAction {
    return {
      ...input,
      id: this.idFactory(),
      sessionId,
      agentId,
      messageId,
      createdAt: this.timestamp()
    };
  }

  async execute(action: ExecutionAction): Promise<ExecutionResult> {
    const startedAt = this.timestamp();
    try {
      const result = await this.executeAction(action, startedAt);
      return result;
    } catch (error) {
      return {
        id: this.idFactory(),
        actionId: action.id,
        sessionId: action.sessionId,
        agentId: action.agentId,
        status: "failed",
        startedAt,
        completedAt: this.timestamp(),
        summary: `Action ${action.type} failed.`,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async executeAction(action: ExecutionAction, startedAt: string): Promise<ExecutionResult> {
    if (action.type === "read_file") {
      const path = this.resolveWorkspacePath(action.path);
      const content = await readFile(path, "utf8");
      return this.success(action, startedAt, `Read ${action.path}.`, content);
    }

    if (action.type === "write_file") {
      const path = this.resolveWorkspacePath(action.path);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, action.content, "utf8");
      return this.success(action, startedAt, `Wrote ${action.path}.`);
    }

    if (action.type === "mkdir") {
      const path = this.resolveWorkspacePath(action.path);
      await mkdir(path, { recursive: true });
      return this.success(action, startedAt, `Created directory ${action.path}.`);
    }

    if (action.type === "run_command") {
      return this.runCommand(action, startedAt, action.command, action.args ?? [], action.timeoutMs);
    }

    if (action.type === "git_status") {
      return this.runCommand(action, startedAt, "git", ["status", "--short"]);
    }

    if (action.type === "git_diff") {
      return this.runCommand(action, startedAt, "git", ["diff"]);
    }

    if (action.type === "git_commit") {
      const add = await this.runCommand(action, startedAt, "git", ["add", "."]);
      if (add.status === "failed") {
        return add;
      }
      return this.runCommand(action, startedAt, "git", ["commit", "-m", action.message]);
    }

    return {
      id: this.idFactory(),
      actionId: (action as ExecutionAction).id,
      sessionId: (action as ExecutionAction).sessionId,
      agentId: (action as ExecutionAction).agentId,
      status: "skipped",
      startedAt,
      completedAt: this.timestamp(),
      summary: `Unsupported action type ${(action as { type: string }).type}.`
    };
  }

  private resolveWorkspacePath(path: string): string {
    const resolved = resolve(this.workspace.repoPath, path);
    const rel = relative(this.workspace.repoPath, resolved);
    if (rel.startsWith("..") || rel === ".." || resolve(rel) === rel) {
      throw new Error(`Path '${path}' escapes the workspace.`);
    }
    return resolved;
  }

  private runCommand(
    action: ExecutionAction,
    startedAt: string,
    command: string,
    args: string[],
    timeoutMs = this.defaultTimeoutMs
  ): Promise<ExecutionResult> {
    if (!this.allowedCommands.has(command)) {
      return Promise.resolve({
        id: this.idFactory(),
        actionId: action.id,
        sessionId: action.sessionId,
        agentId: action.agentId,
        status: "failed",
        startedAt,
        completedAt: this.timestamp(),
        summary: `Command '${command}' is not allowed.`,
        error: `Command '${command}' is not in the executor allowlist.`
      });
    }

    return new Promise((resolveResult) => {
      const child = spawn(command, args, {
        cwd: this.workspace.repoPath,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"]
      });

      let stdout = "";
      let stderr = "";
      let settled = false;
      const timeout = setTimeout(() => {
        settled = true;
        child.kill("SIGTERM");
        resolveResult({
          id: this.idFactory(),
          actionId: action.id,
          sessionId: action.sessionId,
          agentId: action.agentId,
          status: "failed",
          startedAt,
          completedAt: this.timestamp(),
          summary: `Command '${command}' timed out after ${timeoutMs}ms.`,
          error: `Command '${command}' timed out after ${timeoutMs}ms.`
        });
      }, timeoutMs);

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("error", (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        resolveResult({
          id: this.idFactory(),
          actionId: action.id,
          sessionId: action.sessionId,
          agentId: action.agentId,
          status: "failed",
          startedAt,
          completedAt: this.timestamp(),
          summary: `Command '${command}' failed to start.`,
          error: error.message
        });
      });
      child.on("close", async (code) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);

        const stdoutPath = stdout ? await this.writeOutput(action, "stdout", stdout) : undefined;
        const stderrPath = stderr ? await this.writeOutput(action, "stderr", stderr) : undefined;
        const combined = stdout || stderr;

        resolveResult({
          id: this.idFactory(),
          actionId: action.id,
          sessionId: action.sessionId,
          agentId: action.agentId,
          status: code === 0 ? "succeeded" : "failed",
          startedAt,
          completedAt: this.timestamp(),
          summary: `Command '${command} ${args.join(" ")}' exited with code ${code}.`,
          exitCode: code ?? undefined,
          stdoutPath,
          stderrPath,
          outputPreview: this.preview(combined),
          error: code === 0 ? undefined : this.preview(stderr || stdout)
        });
      });
    });
  }

  private async writeOutput(action: ExecutionAction, kind: "stdout" | "stderr", content: string): Promise<string> {
    const path = resolve(this.workspace.root, "execution", kind, `${action.id}.log`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf8");
    return path;
  }

  private success(
    action: ExecutionAction,
    startedAt: string,
    summary: string,
    output?: string
  ): ExecutionResult {
    return {
      id: this.idFactory(),
      actionId: action.id,
      sessionId: action.sessionId,
      agentId: action.agentId,
      status: "succeeded",
      startedAt,
      completedAt: this.timestamp(),
      summary,
      outputPreview: output ? this.preview(output) : undefined
    };
  }

  private preview(value: string): string {
    return value.length > this.outputPreviewLength
      ? `${value.slice(0, this.outputPreviewLength)}...`
      : value;
  }

  private timestamp(): string {
    return this.now().toISOString();
  }
}
