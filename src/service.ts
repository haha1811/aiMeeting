import { randomUUID } from "node:crypto";
import { JsonlDiscussionStore } from "./storage.js";
import { Moderator } from "./moderator.js";
import type {
  AppendMessageInput,
  CreateSessionInput,
  DiscussionEvent,
  DiscussionMessage,
  DiscussionResult,
  DiscussionSession,
  HermesAgent,
  TaskAssignment,
  TaskAssignmentInput
} from "./types.js";

export interface DiscussionServiceOptions {
  rootDir?: string;
  store?: JsonlDiscussionStore;
  moderator?: Moderator;
  now?: () => Date;
  idFactory?: () => string;
}

export class DiscussionService {
  private readonly store: JsonlDiscussionStore;
  private readonly moderator: Moderator;
  private readonly now: () => Date;
  private readonly idFactory: () => string;
  private readonly agentsBySession = new Map<string, HermesAgent[]>();

  constructor(options: DiscussionServiceOptions = {}) {
    this.store = options.store ?? new JsonlDiscussionStore(options.rootDir);
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? randomUUID;
    this.moderator = options.moderator ?? new Moderator({ now: this.now, idFactory: this.idFactory });
  }

  async createSession(input: CreateSessionInput): Promise<DiscussionSession> {
    if (input.agents.length < 2) {
      throw new Error("A discussion session requires at least 2 Hermes agents.");
    }

    const createdAt = this.timestamp();
    const session: DiscussionSession = {
      sessionId: this.idFactory(),
      topic: input.topic,
      agents: input.agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        role: agent.role
      })),
      messages: [],
      status: "created",
      maxRounds: input.maxRounds ?? 3,
      taskAssignments: [],
      createdAt,
      updatedAt: createdAt
    };

    this.agentsBySession.set(session.sessionId, input.agents);
    await this.store.initializeSession(session);
    await this.appendEvent(session.sessionId, "session.created", {
      topic: session.topic,
      agentIds: session.agents.map((agent) => agent.id),
      maxRounds: session.maxRounds
    });
    return session;
  }

  async runSession(sessionId: string): Promise<DiscussionResult> {
    const session = await this.getSession(sessionId);
    const agents = this.agentsBySession.get(sessionId);

    if (!agents) {
      throw new Error(`No in-process Hermes agents are registered for session ${sessionId}.`);
    }

    await this.appendEvent(sessionId, "session.started");
    try {
      const result = await this.moderator.run(
        session,
        agents,
        async (message) => {
          await this.store.appendMessage(message);
        },
        async (updatedSession) => {
          await this.store.writeSession(updatedSession);
        }
      );
      await this.store.writeResult(result);
      await this.appendEvent(sessionId, "session.completed", {
        messageCount: result.messageCount,
        taskAssignmentCount: result.taskAssignments.length
      });
      return result;
    } catch (error) {
      session.status = "failed";
      session.error = error instanceof Error ? error.message : String(error);
      session.updatedAt = this.timestamp();
      await this.store.writeSession(session);
      await this.appendEvent(sessionId, "session.failed", { error: session.error });
      throw error;
    }
  }

  async appendMessage(sessionId: string, input: AppendMessageInput): Promise<DiscussionMessage> {
    const session = await this.getSession(sessionId);
    const createdAt = this.timestamp();
    const messageId = this.idFactory();
    const taskAssignments = this.createTaskAssignments(input.taskAssignments ?? [], createdAt, messageId);
    const message: DiscussionMessage = {
      id: messageId,
      sessionId,
      sequence: session.messages.length + 1,
      round: input.round ?? 0,
      senderId: input.senderId,
      senderName: input.senderName,
      senderRole: input.senderRole,
      content: input.content,
      createdAt,
      taskAssignments
    };

    session.messages.push(message);
    session.taskAssignments.push(...taskAssignments);
    session.updatedAt = createdAt;
    await this.store.appendMessage(message);
    await this.store.writeSession(session);
    await this.appendEvent(sessionId, "message.appended", { messageId });
    return message;
  }

  async getSession(sessionId: string): Promise<DiscussionSession> {
    const session = await this.store.readSession(sessionId);
    session.messages = await this.store.readMessages(sessionId);
    return session;
  }

  async getResult(sessionId: string): Promise<DiscussionResult> {
    return this.store.readResult(sessionId);
  }

  private createTaskAssignments(
    assignments: TaskAssignmentInput[],
    createdAt: string,
    sourceMessageId: string
  ): TaskAssignment[] {
    return assignments.map((assignment) => ({
      ...assignment,
      id: this.idFactory(),
      createdAt,
      sourceMessageId
    }));
  }

  private async appendEvent(
    sessionId: string,
    type: string,
    data?: Record<string, unknown>
  ): Promise<DiscussionEvent> {
    const event: DiscussionEvent = {
      id: this.idFactory(),
      sessionId,
      type,
      createdAt: this.timestamp(),
      data
    };
    await this.store.appendEvent(event);
    return event;
  }

  private timestamp(): string {
    return this.now().toISOString();
  }
}
