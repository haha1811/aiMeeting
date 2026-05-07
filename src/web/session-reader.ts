import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type {
  DiscussionMessage,
  DiscussionResult,
  DiscussionSession,
  ExecutionAction,
  ExecutionResult
} from "../index.js";
import { assertSafeSessionId } from "./validation.js";
import type { WebSessionListItem, WebSessionReplay, WebWorkspaceFile } from "./types.js";

export interface ReadSessionReplayOptions {
  rootDir: string;
  workspaceRootDir: string;
  sessionId: string;
}

export async function listSessions(rootDir: string): Promise<WebSessionListItem[]> {
  const entries = await readdir(rootDir, { withFileTypes: true }).catch(() => []);
  const sessions: WebSessionListItem[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const sessionId = entry.name;
    try {
      assertSafeSessionId(sessionId);
      const session = await readJson<DiscussionSession>(join(rootDir, sessionId, "session.json"));
      const messages = await readJsonl<DiscussionMessage>(join(rootDir, sessionId, "messages.jsonl"));
      const executionResults = await readJsonl<ExecutionResult>(join(rootDir, sessionId, "execution-results.jsonl"));
      sessions.push({
        sessionId,
        topic: session.topic,
        status: session.status,
        updatedAt: session.updatedAt,
        messageCount: messages.length,
        executionResultCount: executionResults.length
      });
    } catch {
      continue;
    }
  }

  return sessions.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function readSessionReplay(options: ReadSessionReplayOptions): Promise<WebSessionReplay> {
  assertSafeSessionId(options.sessionId);
  const sessionDir = join(options.rootDir, options.sessionId);
  const session = await readJson<DiscussionSession>(join(sessionDir, "session.json"));
  const result = await readOptionalJson<DiscussionResult>(join(sessionDir, "result.json"));
  const messages = await readJsonl<DiscussionMessage>(join(sessionDir, "messages.jsonl"));
  const actions = await readJsonl<ExecutionAction>(join(sessionDir, "actions.jsonl"));
  const executionResults = await readJsonl<ExecutionResult>(join(sessionDir, "execution-results.jsonl"));
  const workspaceFiles = await listWorkspaceFiles(options.workspaceRootDir, options.sessionId);

  return {
    session,
    result,
    messages,
    actions,
    executionResults,
    workspaceFiles
  };
}

export async function listWorkspaceFiles(workspaceRootDir: string, sessionId: string): Promise<WebWorkspaceFile[]> {
  assertSafeSessionId(sessionId);
  const repoPath = join(workspaceRootDir, sessionId, "repo");
  const files: WebWorkspaceFile[] = [];

  async function walk(currentPath: string): Promise<void> {
    const entries = await readdir(currentPath, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const fullPath = join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }

      const relativePath = relative(repoPath, fullPath).split(sep).join("/");
      if (relativePath.startsWith("..") || relativePath.startsWith("/")) {
        continue;
      }
      const fileStat = await stat(fullPath);
      files.push({ path: relativePath, size: fileStat.size });
    }
  }

  await walk(repoPath);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function readOptionalJson<T>(path: string): Promise<T | undefined> {
  try {
    return await readJson<T>(path);
  } catch {
    return undefined;
  }
}

async function readJsonl<T>(path: string): Promise<T[]> {
  const raw = await readFile(path, "utf8").catch(() => "");
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}
