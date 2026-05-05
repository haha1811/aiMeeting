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
}

export interface AgentResponse {
  content: string;
  taskAssignments?: TaskAssignmentInput[];
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
