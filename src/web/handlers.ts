import { access } from "node:fs/promises";
import { createHermesAgentFromConfig } from "../adapters.js";
import { loadDiscussionRunnerConfig } from "../config.js";
import { DiscussionService } from "../service.js";
import type { DiscussionResult, HermesAgent, HttpHermesAgentConfig } from "../index.js";
import { listSessions, readSessionReplay } from "./session-reader.js";
import { validateAgentHealthCheckRequest, validateRunSessionRequest } from "./validation.js";
import { projectReplayVisualState } from "./visual-state.js";
import type { LiveSessionJobRegistry } from "./live-session-jobs.js";
import type { WebCreateSessionJobResponse } from "./live-types.js";
import type {
  WebAgentHealthCheckResponse,
  WebDefaultConfig,
  WebRunSessionRequest,
  WebRunSessionResponse,
  WebSessionListItem,
  WebSessionReplay,
  VisualWorkbenchState
} from "./types.js";

export interface WebHandlerOptions {
  rootDir: string;
  workspaceRootDir: string;
}

export interface RunSessionHandlerOptions extends WebHandlerOptions {
  request: unknown;
  agentFactory?: (agent: HttpHermesAgentConfig) => HermesAgent;
}

export interface CreateLiveSessionJobOptions {
  registry: LiveSessionJobRegistry;
  request: unknown;
}

export async function getDefaultConfig(configPath = "hermes-agents.real-execution.config.json"): Promise<WebDefaultConfig> {
  if (await exists(configPath)) {
    return loadDiscussionRunnerConfig(configPath);
  }

  return {
    topic: "請 Hermes A 與 Hermes B 共同完成一個產品介紹網站 MVP 的最小可執行雛形。",
    maxRounds: 2,
    rootDir: "sessions",
    enableExecution: true,
    workspaceRootDir: "workspaces",
    agents: [
      {
        id: "hermes-a",
        name: "Hermes A",
        role: "planner",
        type: "http",
        url: "http://10.100.1.21:4101/respond",
        timeoutMs: 300000
      },
      {
        id: "hermes-b",
        name: "Hermes B",
        role: "builder",
        type: "http",
        url: "http://10.100.1.32:4102/respond",
        timeoutMs: 300000
      }
    ]
  };
}

export async function runSessionFromWebRequest(options: RunSessionHandlerOptions): Promise<WebRunSessionResponse> {
  const request = validateRunSessionRequest(options.request);
  const rootDir = request.rootDir ?? options.rootDir;
  const workspaceRootDir = request.workspaceRootDir ?? options.workspaceRootDir;
  const service = new DiscussionService({
    rootDir,
    workspaceRootDir,
    enableExecution: request.enableExecution
  });
  const agents = request.agents.map((agent) =>
    options.agentFactory ? options.agentFactory(agent) : createHermesAgentFromConfig(agent)
  );

  const session = await service.createSession({
    topic: request.topic,
    agents,
    maxRounds: request.maxRounds
  });
  const result = await service.runSession(session.sessionId);

  return summarizeRunResult(request, result);
}

export async function createLiveSessionJob(
  options: CreateLiveSessionJobOptions
): Promise<WebCreateSessionJobResponse> {
  const job = await options.registry.createJob(options.request);
  return {
    sessionId: job.sessionId,
    status: job.status,
    eventsUrl: `/api/sessions/${job.sessionId}/events`
  };
}

export function summarizeRunResult(
  request: WebRunSessionRequest,
  result: DiscussionResult
): WebRunSessionResponse {
  return {
    sessionId: result.sessionId,
    status: result.status,
    topic: request.topic,
    messageCount: result.messageCount,
    roundsCompleted: result.roundsCompleted,
    taskAssignmentCount: result.taskAssignments.length,
    executionResultCount: result.executionResults.length
  };
}

export async function listSessionSummaries(rootDir: string): Promise<WebSessionListItem[]> {
  return listSessions(rootDir);
}

export async function getSessionReplay(options: WebHandlerOptions & { sessionId: string }): Promise<WebSessionReplay> {
  return readSessionReplay(options);
}

export async function getSessionVisualState(
  options: WebHandlerOptions & { sessionId: string }
): Promise<VisualWorkbenchState> {
  const replay = await readSessionReplay(options);
  return projectReplayVisualState(replay);
}

export async function checkAgentHealth(request: unknown): Promise<WebAgentHealthCheckResponse> {
  const { url } = validateAgentHealthCheckRequest(request);
  const healthUrl = deriveHealthUrl(url);
  const started = Date.now();

  try {
    const response = await fetch(healthUrl, { method: "GET" });
    const raw = await response.text();
    const parsed = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    if (!response.ok) {
      return {
        ok: false,
        healthUrl,
        latencyMs: Date.now() - started,
        error: `HTTP ${response.status}: ${raw}`
      };
    }

    return {
      ok: Boolean(parsed.ok),
      healthUrl,
      latencyMs: Date.now() - started,
      agentId: stringField(parsed.agentId),
      agentName: stringField(parsed.agentName),
      agentRole: stringField(parsed.agentRole),
      wrapperVersion: stringField(parsed.wrapperVersion)
    };
  } catch (error) {
    return {
      ok: false,
      healthUrl,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export function deriveHealthUrl(respondUrl: string): string {
  const parsed = new URL(respondUrl);
  parsed.pathname = "/health";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
