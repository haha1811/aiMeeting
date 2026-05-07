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

export type WebDefaultConfig = DiscussionRunnerConfig;
