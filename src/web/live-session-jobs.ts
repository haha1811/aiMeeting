import { randomUUID } from "node:crypto";
import { createHermesAgentFromConfig } from "../adapters.js";
import { DiscussionService } from "../service.js";
import type { HttpHermesAgentConfig } from "../config.js";
import type { DiscussionLifecycleHooks, HermesAgent } from "../types.js";
import { validateRunSessionRequest } from "./validation.js";
import type {
  ActionCreatedData,
  ExecutionResultData,
  LiveSessionEvent,
  LiveSessionEventDataByType,
  LiveSessionEventType,
  LiveSessionJob,
  MessageAppendedData,
  SessionFailedData,
  SpeakerActiveData
} from "./live-types.js";
import { LiveEventBus } from "./live-event-bus.js";

export interface LiveSessionJobRegistryOptions {
  rootDir: string;
  workspaceRootDir: string;
  eventBus: LiveEventBus;
  agentFactory?: (agent: HttpHermesAgentConfig) => HermesAgent;
  now?: () => Date;
  idFactory?: () => string;
}

export class LiveSessionJobRegistry {
  private readonly jobs = new Map<string, LiveSessionJob>();
  private readonly jobPromises = new Map<string, Promise<void>>();
  private readonly rootDir: string;
  private readonly workspaceRootDir: string;
  private readonly eventBus: LiveEventBus;
  private readonly agentFactory?: (agent: HttpHermesAgentConfig) => HermesAgent;
  private readonly now: () => Date;
  private readonly idFactory: () => string;

  constructor(options: LiveSessionJobRegistryOptions) {
    this.rootDir = options.rootDir;
    this.workspaceRootDir = options.workspaceRootDir;
    this.eventBus = options.eventBus;
    this.agentFactory = options.agentFactory;
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? randomUUID;
  }

  async createJob(rawRequest: unknown): Promise<LiveSessionJob> {
    const request = validateRunSessionRequest(rawRequest);
    const service = new DiscussionService({
      rootDir: request.rootDir ?? this.rootDir,
      workspaceRootDir: request.workspaceRootDir ?? this.workspaceRootDir,
      enableExecution: request.enableExecution,
      lifecycleHooks: this.createLifecycleHooks()
    });
    const agents = request.agents.map((agent) =>
      this.agentFactory ? this.agentFactory(agent) : createHermesAgentFromConfig(agent)
    );
    const session = await service.createSession({
      topic: request.topic,
      agents,
      maxRounds: request.maxRounds
    });
    const job: LiveSessionJob = {
      sessionId: session.sessionId,
      status: "queued",
      topic: request.topic,
      createdAt: this.timestamp()
    };
    this.jobs.set(job.sessionId, job);
    this.publish(job.sessionId, "session.queued", { status: "queued" });

    const promise = new Promise<void>((resolve) => {
      setTimeout(() => {
        this.runJob(service, job.sessionId).then(resolve, resolve);
      }, 0);
    });
    this.jobPromises.set(job.sessionId, promise);
    return job;
  }

  getJob(sessionId: string): LiveSessionJob | undefined {
    return this.jobs.get(sessionId);
  }

  listJobs(): LiveSessionJob[] {
    return [...this.jobs.values()];
  }

  async waitForJob(sessionId: string): Promise<void> {
    const promise = this.jobPromises.get(sessionId);
    if (!promise) {
      throw new Error(`No live session job found for session ${sessionId}.`);
    }
    await promise;
  }

  private async runJob(service: DiscussionService, sessionId: string): Promise<void> {
    const job = this.jobs.get(sessionId);
    if (!job) {
      return;
    }

    try {
      job.status = "running";
      job.startedAt = this.timestamp();
      await service.runSession(sessionId);
      job.status = "completed";
      job.completedAt = this.timestamp();
    } catch (error) {
      job.status = "failed";
      job.completedAt = this.timestamp();
      job.error = error instanceof Error ? error.message : String(error);
    }
  }

  private createLifecycleHooks(): DiscussionLifecycleHooks {
    return {
      onSessionStarted: (sessionId) => {
        this.publish(sessionId, "session.started", { status: "running" });
      },
      onSpeakerActive: (data) => {
        this.publish<"speaker.active">(data.sessionId, "speaker.active", {
          agentId: data.agentId,
          agentName: data.agentName,
          role: data.role,
          round: data.round
        });
      },
      onMessageAppended: (message) => {
        this.publish<"message.appended">(message.sessionId, "message.appended", { message });
      },
      onActionCreated: ({ sessionId, action }) => {
        this.publish<"action.created">(sessionId, "action.created", { action });
      },
      onExecutionResult: ({ sessionId, result }) => {
        this.publish<"execution.result">(sessionId, "execution.result", { result });
      },
      onSessionCompleted: (sessionId) => {
        this.publish(sessionId, "session.completed", { status: "completed" });
      },
      onSessionFailed: ({ sessionId, error }) => {
        this.publish<"session.failed">(sessionId, "session.failed", { error });
      }
    };
  }

  private publish<TType extends LiveSessionEventType>(
    sessionId: string,
    type: TType,
    data: LiveSessionEventDataByType[TType]
  ): void {
    const event = {
      id: this.idFactory(),
      sessionId,
      type,
      createdAt: this.timestamp(),
      data
    } as LiveSessionEvent<TType>;
    this.eventBus.publish(event);
  }

  private timestamp(): string {
    return this.now().toISOString();
  }
}
