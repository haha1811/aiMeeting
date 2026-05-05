import { randomUUID } from "node:crypto";
import type {
  AgentDiscussionContext,
  DiscussionMessage,
  DiscussionResult,
  DiscussionSession,
  HermesAgent,
  TaskAssignment,
  TaskAssignmentInput
} from "./types.js";

export interface ModeratorOptions {
  now?: () => Date;
  idFactory?: () => string;
}

export class Moderator {
  private readonly now: () => Date;
  private readonly idFactory: () => string;

  constructor(options: ModeratorOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? randomUUID;
  }

  async run(
    session: DiscussionSession,
    agents: HermesAgent[],
    appendMessage: (message: DiscussionMessage) => Promise<void>,
    persistSession: (session: DiscussionSession) => Promise<void>
  ): Promise<DiscussionResult> {
    this.assertRunnable(session, agents);
    session.status = "running";
    session.updatedAt = this.timestamp();
    await persistSession(session);

    for (let round = 1; round <= session.maxRounds; round += 1) {
      for (const agent of agents) {
        const response = await agent.respond(this.createContext(session, agent, round));
        const message = this.createMessage(session, agent, round, response.content, response.taskAssignments);
        session.messages.push(message);
        session.taskAssignments.push(...(message.taskAssignments ?? []));
        session.updatedAt = message.createdAt;
        await appendMessage(message);
        await persistSession(session);

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
      taskAssignments: [...session.taskAssignments]
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

  private timestamp(): string {
    return this.now().toISOString();
  }
}
