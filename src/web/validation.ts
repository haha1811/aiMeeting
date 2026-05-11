import type { HttpHermesAgentConfig } from "../config.js";
import type { WebAgentHealthCheckRequest, WebRunSessionRequest } from "./types.js";

export function validateRunSessionRequest(value: unknown): WebRunSessionRequest {
  if (!isRecord(value)) {
    throw new Error("Request body must be a JSON object.");
  }

  if (typeof value.topic !== "string" || !value.topic.trim()) {
    throw new Error("topic must be a non-empty string.");
  }

  if (typeof value.maxRounds !== "number" || !Number.isInteger(value.maxRounds) || value.maxRounds < 1) {
    throw new Error("maxRounds must be a positive integer.");
  }

  if (typeof value.enableExecution !== "boolean") {
    throw new Error("enableExecution must be a boolean.");
  }

  if (!Array.isArray(value.agents) || value.agents.length < 2) {
    throw new Error("agents must contain at least 2 http agents.");
  }

  const seen = new Set<string>();
  const agents = value.agents.map((agent) => validateHttpAgent(agent));
  for (const agent of agents) {
    if (seen.has(agent.id)) {
      throw new Error(`Duplicate agent id '${agent.id}'.`);
    }
    seen.add(agent.id);
  }

  return {
    topic: value.topic.trim(),
    maxRounds: value.maxRounds,
    enableExecution: value.enableExecution,
    rootDir: typeof value.rootDir === "string" && value.rootDir.trim() ? value.rootDir.trim() : undefined,
    workspaceRootDir: typeof value.workspaceRootDir === "string" && value.workspaceRootDir.trim()
      ? value.workspaceRootDir.trim()
      : undefined,
    agents
  };
}

export function assertSafeSessionId(sessionId: string): void {
  if (!/^[a-zA-Z0-9._-]+$/.test(sessionId) || sessionId.includes("..")) {
    throw new Error(`Invalid sessionId '${sessionId}'.`);
  }
}

export function validateAgentHealthCheckRequest(value: unknown): WebAgentHealthCheckRequest {
  if (!isRecord(value)) {
    throw new Error("Request body must be a JSON object.");
  }

  if (typeof value.url !== "string" || !value.url.trim()) {
    throw new Error("url must be a non-empty string.");
  }

  assertHttpUrl(value.url.trim(), "agent");
  return { url: value.url.trim() };
}

function validateHttpAgent(value: unknown): HttpHermesAgentConfig {
  if (!isRecord(value)) {
    throw new Error("Each agent must be a JSON object.");
  }

  if (value.type !== "http") {
    throw new Error("Phase 3A Web runner only supports http agents.");
  }

  const id = readNonEmptyString(value, "id");
  const name = readNonEmptyString(value, "name");
  const url = readNonEmptyString(value, "url");
  assertHttpUrl(url, id);

  const timeoutMs = value.timeoutMs === undefined ? undefined : Number(value.timeoutMs);
  if (timeoutMs !== undefined && (!Number.isInteger(timeoutMs) || timeoutMs < 1)) {
    throw new Error(`agent '${id}' timeoutMs must be a positive integer.`);
  }

  return {
    id,
    name,
    role: typeof value.role === "string" && value.role.trim() ? value.role.trim() : undefined,
    type: "http",
    url,
    timeoutMs
  };
}

function assertHttpUrl(url: string, agentId: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
  } catch {
    throw new Error(`agent '${agentId}' url must be a valid http or https URL.`);
  }
}

function readNonEmptyString(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== "string" || !field.trim()) {
    throw new Error(`agent ${key} must be a non-empty string.`);
  }
  return field.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
