import type {
  DiscussionMessage,
  ExecutionAction,
  ExecutionResult
} from "../types.js";
import type { WebRunSessionRequest } from "./types.js";

export type LiveSessionStatus = "queued" | "running" | "completed" | "failed";

export type LiveSessionEventType =
  | "session.queued"
  | "session.started"
  | "speaker.active"
  | "message.appended"
  | "action.created"
  | "execution.result"
  | "session.completed"
  | "session.failed";

export interface LiveSessionJob {
  sessionId: string;
  status: LiveSessionStatus;
  topic: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface WebCreateSessionJobResponse {
  sessionId: string;
  status: LiveSessionStatus;
  eventsUrl: string;
}

export type LiveSessionRunner = (request: WebRunSessionRequest) => Promise<LiveSessionJob>;

export interface SpeakerActiveData {
  agentId: string;
  agentName: string;
  role?: string;
  round: number;
}

export interface MessageAppendedData {
  message: DiscussionMessage;
}

export interface ActionCreatedData {
  action: ExecutionAction;
}

export interface ExecutionResultData {
  result: ExecutionResult;
}

export interface SessionFailedData {
  error: string;
}

export interface LiveSessionEventDataByType {
  "session.queued": { status: "queued" };
  "session.started": { status: "running" };
  "speaker.active": SpeakerActiveData;
  "message.appended": MessageAppendedData;
  "action.created": ActionCreatedData;
  "execution.result": ExecutionResultData;
  "session.completed": { status: "completed" };
  "session.failed": SessionFailedData;
}

export type LiveSessionEvent<TType extends LiveSessionEventType = LiveSessionEventType> =
  TType extends LiveSessionEventType
    ? {
        id: string;
        sessionId: string;
        type: TType;
        createdAt: string;
        data: LiveSessionEventDataByType[TType];
      }
    : never;
