import { spawn } from "node:child_process";
import type {
  AgentDiscussionContext,
  AgentResponse,
  HermesAgent
} from "./types.js";
import type {
  CommandHermesAgentConfig,
  HermesAgentConfig,
  HttpHermesAgentConfig,
  MockHermesAgentConfig
} from "./config.js";

export function createHermesAgentFromConfig(config: HermesAgentConfig): HermesAgent {
  if (config.type === "mock") {
    return createMockHermesAgent(config);
  }

  if (config.type === "command") {
    return createCommandHermesAgent(config);
  }

  if (config.type === "http") {
    return createHttpHermesAgent(config);
  }

  throw new Error(`Unsupported Hermes agent type '${(config as { type?: string }).type}'.`);
}

export function createMockHermesAgent(config: MockHermesAgentConfig): HermesAgent {
  let index = 0;
  const responses = config.responses?.length
    ? config.responses
    : [{ content: `${config.name} received the context and has no configured response.` }];

  return {
    id: config.id,
    name: config.name,
    role: config.role,
    async respond() {
      const response = responses[Math.min(index, responses.length - 1)];
      index += 1;
      return response;
    }
  };
}

export function createCommandHermesAgent(config: CommandHermesAgentConfig): HermesAgent {
  return {
    id: config.id,
    name: config.name,
    role: config.role,
    async respond(context) {
      const stdout = await runCommandAgent(config, context);
      return parseAgentResponse(stdout, config.id);
    }
  };
}

export function createHttpHermesAgent(config: HttpHermesAgentConfig): HermesAgent {
  return {
    id: config.id,
    name: config.name,
    role: config.role,
    async respond(context) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 60_000);

      try {
        const response = await fetch(config.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(config.headers ?? {})
          },
          body: JSON.stringify(context),
          signal: controller.signal
        });

        const body = await response.text();
        if (!response.ok) {
          throw new Error(`HTTP agent '${config.id}' failed with ${response.status}: ${body}`);
        }

        return parseAgentResponse(body, config.id);
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}

function runCommandAgent(
  config: CommandHermesAgentConfig,
  context: AgentDiscussionContext
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(config.command, config.args ?? [], {
      cwd: config.cwd,
      env: {
        ...process.env,
        ...(config.env ?? {})
      },
      stdio: ["pipe", "pipe", "pipe"]
    });

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Command agent '${config.id}' timed out after ${config.timeoutMs ?? 60_000}ms.`));
    }, config.timeoutMs ?? 60_000);

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(new Error(`Command agent '${config.id}' exited with code ${code}: ${stderr || stdout}`));
    });

    child.stdin.end(JSON.stringify(context));
  });
}

function parseAgentResponse(raw: string, agentId: string): AgentResponse {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { content: `Agent '${agentId}' returned an empty response.` };
  }

  try {
    const parsed = JSON.parse(trimmed) as AgentResponse;
    if (!parsed.content || typeof parsed.content !== "string") {
      throw new Error("Response JSON must include a string content field.");
    }
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { content: trimmed };
    }
    throw error;
  }
}
