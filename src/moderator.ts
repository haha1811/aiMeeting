import { randomUUID } from "node:crypto";
import type {
  AgentDiscussionContext,
  DiscussionLifecycleHooks,
  DiscussionMessage,
  DiscussionResult,
  DiscussionSession,
  ExecutionAction,
  ExecutionResult,
  HermesAgent,
  TaskAssignment,
  TaskAssignmentInput
} from "./types.js";
import { Executor } from "./executor.js";

export interface ModeratorOptions {
  now?: () => Date;
  idFactory?: () => string;
  executorFactory?: (session: DiscussionSession) => Executor | undefined;
  lifecycleHooks?: DiscussionLifecycleHooks;
}

export class Moderator {
  private readonly now: () => Date;
  private readonly idFactory: () => string;
  private readonly executorFactory?: (session: DiscussionSession) => Executor | undefined;
  private readonly lifecycleHooks: DiscussionLifecycleHooks;

  constructor(options: ModeratorOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? randomUUID;
    this.executorFactory = options.executorFactory;
    this.lifecycleHooks = options.lifecycleHooks ?? {};
  }

  async run(
    session: DiscussionSession,
    agents: HermesAgent[],
    appendMessage: (message: DiscussionMessage) => Promise<void>,
    persistSession: (session: DiscussionSession) => Promise<void>,
    appendAction?: (action: ExecutionAction) => Promise<void>,
    appendExecutionResult?: (result: ExecutionResult) => Promise<void>
  ): Promise<DiscussionResult> {
    this.assertRunnable(session, agents);
    session.status = "running";
    session.updatedAt = this.timestamp();
    await persistSession(session);
    await this.notifyLifecycle(() => this.lifecycleHooks.onSessionStarted?.(session.sessionId));

    for (let round = 1; round <= session.maxRounds; round += 1) {
      for (const agent of agents) {
        await this.notifyLifecycle(() => this.lifecycleHooks.onSpeakerActive?.({
          sessionId: session.sessionId,
          agentId: agent.id,
          agentName: agent.name,
          role: agent.role,
          round
        }));
        const response = await agent.respond(this.createContext(session, agent, round));
        const message = this.createMessage(session, agent, round, response.content, response.taskAssignments);
        const executor = this.executorFactory?.(session);
        const actions = (response.actions ?? []).map((action) => executor?.createAction(
          action,
          session.sessionId,
          agent.id,
          message.id
        )).filter((action): action is ExecutionAction => Boolean(action));
        const executionResults: ExecutionResult[] = [];

        for (const action of actions) {
          await appendAction?.(action);
          await this.notifyLifecycle(() => this.lifecycleHooks.onActionCreated?.({
            sessionId: session.sessionId,
            action: this.snapshot(action)
          }));
          if (!executor) {
            continue;
          }
          const result = await executor.execute(action);
          executionResults.push(result);
          session.executionResults.push(result);
          await appendExecutionResult?.(result);
          await this.notifyLifecycle(() => this.lifecycleHooks.onExecutionResult?.({
            sessionId: session.sessionId,
            result: this.snapshot(result)
          }));
        }

        message.executionActions = actions;
        message.executionResults = executionResults;
        session.messages.push(message);
        session.taskAssignments.push(...(message.taskAssignments ?? []));
        session.updatedAt = message.createdAt;
        await appendMessage(message);
        await persistSession(session);
        await this.notifyLifecycle(() => this.lifecycleHooks.onMessageAppended?.(this.snapshot(message)));

        if (this.hasEnoughAssignments(session)) {
          return this.complete(session, round, persistSession);
        }
      }
    }

    return this.complete(session, session.maxRounds, persistSession);
  }

  private assertRunnable(session: DiscussionSession, agents: HermesAgent[]): void {
    if (agents.length < 2) {
      throw new Error("A discussion session requires at least 2 Hermes agents.");
    }

    if (session.status === "running") {
      throw new Error(`Session ${session.sessionId} is already running.`);
    }

    if (session.status === "completed") {
      throw new Error(`Session ${session.sessionId} has already completed.`);
    }
  }

  private createContext(session: DiscussionSession, agent: HermesAgent, round: number): AgentDiscussionContext {
    return {
      sessionId: session.sessionId,
      topic: session.topic,
      round,
      speaker: { id: agent.id, name: agent.name, role: agent.role },
      agents: session.agents,
      messages: [...session.messages],
      taskAssignments: [...session.taskAssignments],
      executionResults: [...session.executionResults],
      workspace: session.workspace
    };
  }

  private createMessage(
    session: DiscussionSession,
    agent: HermesAgent,
    round: number,
    content: string,
    assignmentInputs: TaskAssignmentInput[] = []
  ): DiscussionMessage {
    const createdAt = this.timestamp();
    const messageId = this.idFactory();
    const taskAssignments = assignmentInputs.map((assignment) =>
      this.createTaskAssignment(assignment, createdAt, messageId)
    );

    return {
      id: messageId,
      sessionId: session.sessionId,
      sequence: session.messages.length + 1,
      round,
      senderId: agent.id,
      senderName: agent.name,
      senderRole: agent.role,
      content,
      createdAt,
      taskAssignments
    };
  }

  private createTaskAssignment(
    assignment: TaskAssignmentInput,
    createdAt: string,
    sourceMessageId?: string
  ): TaskAssignment {
    return {
      ...assignment,
      id: this.idFactory(),
      createdAt,
      sourceMessageId
    };
  }

  private hasEnoughAssignments(session: DiscussionSession): boolean {
    const assignedAgentIds = new Set(session.taskAssignments.map((assignment) => assignment.assignedAgentId));
    return session.agents.every((agent) => assignedAgentIds.has(agent.id));
  }

  private async complete(
    session: DiscussionSession,
    roundsCompleted: number,
    persistSession: (session: DiscussionSession) => Promise<void>
  ): Promise<DiscussionResult> {
    session.taskAssignments = this.fillMissingAssignments(session);
    session.status = "completed";
    session.updatedAt = this.timestamp();
    await persistSession(session);

    return {
      sessionId: session.sessionId,
      topic: session.topic,
      status: session.status,
      completedAt: session.updatedAt,
      taskAssignments: session.taskAssignments,
      executionResults: session.executionResults,
      workspace: session.workspace,
      messageCount: session.messages.length,
      roundsCompleted
    };
  }

  private fillMissingAssignments(session: DiscussionSession): TaskAssignment[] {
    const assignedAgentIds = new Set(session.taskAssignments.map((assignment) => assignment.assignedAgentId));
    const generatedAt = this.timestamp();
    const generated = session.agents
      .filter((agent) => !assignedAgentIds.has(agent.id))
      .map((agent) =>
        this.createTaskAssignment(
          {
            assignedAgentId: agent.id,
            title: `Follow up on ${session.topic}`,
            detail: `Review the discussion and identify the next concrete action for ${agent.name}.`,
            rationale: "Generated by the moderator because the discussion ended without an explicit assignment for this agent."
          },
          generatedAt
        )
      );

    return [...session.taskAssignments, ...generated];
  }

  private async notifyLifecycle(hook: (() => void | Promise<void>) | undefined): Promise<void> {
    try {
      await hook?.();
    } catch {
      // Lifecycle observers must not affect core session execution.
    }
  }

  private snapshot<T>(value: T): T {
    return structuredClone(value);
  }

  private timestamp(): string {
    return this.now().toISOString();
  }
}
