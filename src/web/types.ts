import type {
  DiscussionMessage,
  DiscussionResult,
  DiscussionRunnerConfig,
  DiscussionSession,
  ExecutionAction,
  ExecutionResult,
  HttpHermesAgentConfig
} from "../index.js";

export interface WebRunSessionRequest {
  topic: string;
  maxRounds: number;
  enableExecution: boolean;
  rootDir?: string;
  workspaceRootDir?: string;
  agents: HttpHermesAgentConfig[];
}

export interface WebAgentHealthCheckRequest {
  url: string;
}

export interface WebAgentHealthCheckResponse {
  ok: boolean;
  healthUrl: string;
  latencyMs?: number;
  agentId?: string;
  agentName?: string;
  agentRole?: string;
  wrapperVersion?: string;
  error?: string;
}

export interface WebRunSessionResponse {
  sessionId: string;
  status: string;
  topic: string;
  messageCount: number;
  roundsCompleted: number;
  taskAssignmentCount: number;
  executionResultCount: number;
}

export interface WebSessionListItem {
  sessionId: string;
  topic: string;
  status: string;
  updatedAt: string;
  messageCount: number;
  executionResultCount: number;
}

export interface WebWorkspaceFile {
  path: string;
  size: number;
}

export interface WebSessionReplay {
  session: DiscussionSession;
  result?: DiscussionResult;
  messages: DiscussionMessage[];
  actions: ExecutionAction[];
  executionResults: ExecutionResult[];
  workspaceFiles: WebWorkspaceFile[];
}

export type AgentVisualStatus =
  | "idle"
  | "thinking"
  | "speaking"
  | "executing"
  | "reviewing"
  | "completed"
  | "failed";

export interface AgentVisualState {
  agentId: string;
  name: string;
  role?: string;
  status: AgentVisualStatus;
  currentActivity: string;
  lastMessagePreview?: string;
  lastActionSummary?: string;
  lastExecutionSummary?: string;
  updatedAt: string;
}

export interface RunnerVisualState {
  status: "idle" | "queued" | "running" | "completed" | "failed";
  currentActivity: string;
  updatedAt?: string;
}

export interface VisualWorkbenchState {
  sessionId: string;
  topic: string;
  runner: RunnerVisualState;
  agents: AgentVisualState[];
}

export type WebDefaultConfig = DiscussionRunnerConfig;
