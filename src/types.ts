export type DiscussionStatus = "created" | "running" | "completed" | "failed";

export interface HermesAgent {
  id: string;
  name: string;
  role?: string;
  respond(context: AgentDiscussionContext): Promise<AgentResponse>;
}

export interface AgentDescriptor {
  id: string;
  name: string;
  role?: string;
}

export interface AgentDiscussionContext {
  sessionId: string;
  topic: string;
  round: number;
  speaker: AgentDescriptor;
  agents: AgentDescriptor[];
  messages: DiscussionMessage[];
  taskAssignments: TaskAssignment[];
  executionResults?: ExecutionResult[];
  workspace?: WorkspaceDescriptor;
}

export interface AgentResponse {
  content: string;
  taskAssignments?: TaskAssignmentInput[];
  actions?: ExecutionActionInput[];
}

export interface TaskAssignmentInput {
  assignedAgentId: string;
  title: string;
  detail: string;
  dependencies?: string[];
  confidence?: number;
  rationale?: string;
}

export interface TaskAssignment extends TaskAssignmentInput {
  id: string;
  createdAt: string;
  sourceMessageId?: string;
}

export interface DiscussionMessage {
  id: string;
  sessionId: string;
  sequence: number;
  round: number;
  senderId: string;
  senderName: string;
  senderRole?: string;
  content: string;
  createdAt: string;
  taskAssignments?: TaskAssignment[];
  executionActions?: ExecutionAction[];
  executionResults?: ExecutionResult[];
}

export interface DiscussionEvent {
  id: string;
  sessionId: string;
  type: string;
  createdAt: string;
  data?: Record<string, unknown>;
}

export interface DiscussionSession {
  sessionId: string;
  topic: string;
  agents: AgentDescriptor[];
  messages: DiscussionMessage[];
  status: DiscussionStatus;
  maxRounds: number;
  taskAssignments: TaskAssignment[];
  executionResults: ExecutionResult[];
  workspace?: WorkspaceDescriptor;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface DiscussionResult {
  sessionId: string;
  topic: string;
  status: DiscussionStatus;
  completedAt: string;
  taskAssignments: TaskAssignment[];
  executionResults: ExecutionResult[];
  workspace?: WorkspaceDescriptor;
  messageCount: number;
  roundsCompleted: number;
}

export interface CreateSessionInput {
  topic: string;
  agents: HermesAgent[];
  maxRounds?: number;
}

export interface AppendMessageInput {
  round?: number;
  senderId: string;
  senderName: string;
  senderRole?: string;
  content: string;
  taskAssignments?: TaskAssignmentInput[];
}

export interface WorkspaceDescriptor {
  root: string;
  repoPath: string;
}

export type ExecutionActionType =
  | "read_file"
  | "write_file"
  | "mkdir"
  | "run_command"
  | "git_status"
  | "git_diff"
  | "git_commit";

export type ExecutionActionInput =
  | ReadFileActionInput
  | WriteFileActionInput
  | MakeDirectoryActionInput
  | RunCommandActionInput
  | GitStatusActionInput
  | GitDiffActionInput
  | GitCommitActionInput;

export interface BaseExecutionActionInput {
  type: ExecutionActionType;
}

export interface ReadFileActionInput extends BaseExecutionActionInput {
  type: "read_file";
  path: string;
}

export interface WriteFileActionInput extends BaseExecutionActionInput {
  type: "write_file";
  path: string;
  content: string;
}

export interface MakeDirectoryActionInput extends BaseExecutionActionInput {
  type: "mkdir";
  path: string;
}

export interface RunCommandActionInput extends BaseExecutionActionInput {
  type: "run_command";
  command: string;
  args?: string[];
  timeoutMs?: number;
}

export interface GitStatusActionInput extends BaseExecutionActionInput {
  type: "git_status";
}

export interface GitDiffActionInput extends BaseExecutionActionInput {
  type: "git_diff";
}

export interface GitCommitActionInput extends BaseExecutionActionInput {
  type: "git_commit";
  message: string;
}

export type ExecutionAction = ExecutionActionInput & {
  id: string;
  sessionId: string;
  agentId: string;
  messageId: string;
  createdAt: string;
};

export type ExecutionStatus = "succeeded" | "failed" | "skipped";

export interface ExecutionResult {
  id: string;
  actionId: string;
  sessionId: string;
  agentId: string;
  status: ExecutionStatus;
  startedAt: string;
  completedAt: string;
  summary: string;
  exitCode?: number;
  stdoutPath?: string;
  stderrPath?: string;
  outputPreview?: string;
  error?: string;
}
