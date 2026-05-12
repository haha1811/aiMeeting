import { randomUUID } from "node:crypto";
import { JsonlDiscussionStore } from "./storage.js";
import { Moderator } from "./moderator.js";
import { WorkspaceManager } from "./workspace.js";
import { Executor } from "./executor.js";
import type {
  AppendMessageInput,
  CreateSessionInput,
  DiscussionEvent,
  DiscussionLifecycleHooks,
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
  workspaceRootDir?: string;
  enableExecution?: boolean;
  now?: () => Date;
  idFactory?: () => string;
  lifecycleHooks?: DiscussionLifecycleHooks;
}

export class DiscussionService {
  private readonly store: JsonlDiscussionStore;
  private readonly moderator: Moderator;
  private readonly workspaceManager?: WorkspaceManager;
  private readonly now: () => Date;
  private readonly idFactory: () => string;
  private readonly lifecycleHooks: DiscussionLifecycleHooks;
  private readonly agentsBySession = new Map<string, HermesAgent[]>();

  constructor(options: DiscussionServiceOptions = {}) {
    if (options.moderator && options.lifecycleHooks) {
      throw new Error(
        "DiscussionService cannot combine a custom moderator with lifecycleHooks. " +
          "Pass lifecycleHooks to the Moderator instead."
      );
    }

    this.store = options.store ?? new JsonlDiscussionStore(options.rootDir);
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? randomUUID;
    this.lifecycleHooks = options.lifecycleHooks ?? {};
    this.workspaceManager = options.enableExecution ? new WorkspaceManager(options.workspaceRootDir) : undefined;
    this.moderator = options.moderator ?? new Moderator({
      now: this.now,
      idFactory: this.idFactory,
      executorFactory: (session) => session.workspace ? new Executor(session.workspace, {
        now: this.now,
        idFactory: this.idFactory
      }) : undefined,
      lifecycleHooks: this.lifecycleHooks
    });
  }

  async createSession(input: CreateSessionInput): Promise<DiscussionSession> {
    if (input.agents.length < 2) {
      throw new Error("A discussion session requires at least 2 Hermes agents.");
    }

    const createdAt = this.timestamp();
    const sessionId = this.idFactory();
    const session: DiscussionSession = {
      sessionId,
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
      executionResults: [],
      workspace: this.workspaceManager ? await this.workspaceManager.initialize(sessionId) : undefined,
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
        },
        async (action) => {
          await this.store.appendAction(action);
        },
        async (executionResult) => {
          await this.store.appendExecutionResult(executionResult);
        }
      );
      await this.store.writeResult(result);
      await this.appendEvent(sessionId, "session.completed", {
        messageCount: result.messageCount,
        taskAssignmentCount: result.taskAssignments.length
      });
      await this.notifyLifecycle(() => this.lifecycleHooks.onSessionCompleted?.(sessionId));
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      session.status = "failed";
      session.error = errorMessage;
      session.updatedAt = this.timestamp();
      await this.store.writeSession(session);
      await this.appendEvent(sessionId, "session.failed", { error: errorMessage });
      await this.notifyLifecycle(() => this.lifecycleHooks.onSessionFailed?.({ sessionId, error: errorMessage }));
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
    session.executionResults = await this.store.readExecutionResults(sessionId);
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

  private async notifyLifecycle(hook: (() => void | Promise<void>) | undefined): Promise<void> {
    try {
      await hook?.();
    } catch {
      // Lifecycle observers must not affect core session execution.
    }
  }

  private timestamp(): string {
    return this.now().toISOString();
  }
}
