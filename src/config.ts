import { readFile } from "node:fs/promises";
import type { AgentResponse } from "./types.js";

export type HermesAgentConfig = MockHermesAgentConfig | CommandHermesAgentConfig | HttpHermesAgentConfig;

export interface DiscussionRunnerConfig {
  topic: string;
  agents: HermesAgentConfig[];
  maxRounds?: number;
  rootDir?: string;
  enableExecution?: boolean;
  workspaceRootDir?: string;
}

export interface BaseHermesAgentConfig {
  id: string;
  name: string;
  role?: string;
  type: "mock" | "command" | "http";
}

export interface MockHermesAgentConfig extends BaseHermesAgentConfig {
  type: "mock";
  responses?: AgentResponse[];
}

export interface CommandHermesAgentConfig extends BaseHermesAgentConfig {
  type: "command";
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface HttpHermesAgentConfig extends BaseHermesAgentConfig {
  type: "http";
  url: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export async function loadDiscussionRunnerConfig(path: string): Promise<DiscussionRunnerConfig> {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as DiscussionRunnerConfig;
  validateDiscussionRunnerConfig(parsed);
  return parsed;
}

export function validateDiscussionRunnerConfig(config: DiscussionRunnerConfig): void {
  if (!config.topic || typeof config.topic !== "string") {
    throw new Error("Config field 'topic' must be a non-empty string.");
  }

  if (!Array.isArray(config.agents) || config.agents.length < 2) {
    throw new Error("Config field 'agents' must contain at least 2 agents.");
  }

  const seenIds = new Set<string>();
  for (const agent of config.agents) {
    if (!agent.id || !agent.name || !agent.type) {
      throw new Error("Every agent config must include id, name, and type.");
    }

    if (seenIds.has(agent.id)) {
      throw new Error(`Duplicate agent id '${agent.id}'.`);
    }
    seenIds.add(agent.id);

    if (agent.type === "command" && !agent.command) {
      throw new Error(`Command agent '${agent.id}' must include command.`);
    }

    if (agent.type === "http" && !agent.url) {
      throw new Error(`HTTP agent '${agent.id}' must include url.`);
    }
  }
}
