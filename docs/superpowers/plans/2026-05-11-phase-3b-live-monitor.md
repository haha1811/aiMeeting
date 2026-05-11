# Phase 3B Live Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Background Job + Server-Sent Events live monitoring to the Web Runner Console so users can see active speaker, messages, actions, and execution results while a Hermes session is running.

**Architecture:** Keep the existing Phase 3A synchronous replay path intact, then add a live path beside it. The live path uses in-memory `LiveEventBus` and `LiveSessionJobRegistry`, lifecycle hooks in the existing moderator/service flow, `POST /api/sessions/jobs` for background execution, and `GET /api/sessions/:sessionId/events` for SSE updates.

**Tech Stack:** TypeScript, Node built-in `http`, Node test runner, native browser `EventSource`, existing JSONL persistence.

---

## File Structure

- Create `src/web/live-types.ts`: live status/event/job API types.
- Create `src/web/sse.ts`: SSE formatting and HTTP streaming helpers.
- Create `src/web/live-event-bus.ts`: in-memory pub/sub per `sessionId`.
- Create `src/web/live-session-jobs.ts`: background job registry and live session runner orchestration.
- Modify `src/types.ts`: add `DiscussionLifecycleHooks`.
- Modify `src/moderator.ts`: call lifecycle hooks for active speaker, message, action, and execution result events.
- Modify `src/service.ts`: accept lifecycle hooks and publish started/completed/failed hook points.
- Modify `src/web/handlers.ts`: add `createLiveSessionJob()` and export live registry support.
- Modify `src/web/server.ts`: instantiate live registry, add jobs API and SSE endpoint.
- Modify `public/index.html`: add live status and active speaker elements.
- Modify `public/app.js`: switch Run Session to background job flow and handle `EventSource` events.
- Modify `public/styles.css`: style live status and active speaker indicators.
- Modify `CHANGELOG.md`: add `v0.3.0` entry.
- Modify `docs/PHASE_3A_WEB_RUNNER_CONSOLE_USER_GUIDE.md`: add Phase 3B live monitoring usage notes.
- Create `docs/PHASE_3B_LIVE_MONITOR_RUNBOOK.md`: operator runbook for local and EC2 validation.
- Create `docs/step_14_phase_3b_live_monitor_validation_2026_05_11.md`: validation record template to fill during implementation verification.
- Test `test/live-event-bus.test.ts`: event bus behavior.
- Test `test/sse.test.ts`: SSE formatting.
- Test `test/moderator-lifecycle.test.ts`: lifecycle hooks in discussion flow.
- Test `test/live-session-jobs.test.ts`: job registry status transitions.
- Modify `test/web-server.test.ts`: HTTP job and SSE endpoint behavior.
- Modify `test/web-handlers.test.ts`: live job handler behavior with mock agents.

## Task 1: Live Types and SSE Formatter

**Files:**
- Create: `src/web/live-types.ts`
- Create: `src/web/sse.ts`
- Test: `test/sse.test.ts`

- [ ] **Step 1: Write failing SSE tests**

Create `test/sse.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { formatSseEvent } from "../src/web/sse.js";
import type { LiveSessionEvent } from "../src/web/live-types.js";

test("formatSseEvent renders event and JSON data", () => {
  const event: LiveSessionEvent = {
    id: "event-1",
    sessionId: "session-1",
    type: "speaker.active",
    createdAt: "2026-05-11T00:00:00.000Z",
    data: { agentId: "hermes-a", agentName: "Hermes A", role: "planner" }
  };

  assert.equal(
    formatSseEvent(event),
    [
      "id: event-1",
      "event: speaker.active",
      "data: {\"id\":\"event-1\",\"sessionId\":\"session-1\",\"type\":\"speaker.active\",\"createdAt\":\"2026-05-11T00:00:00.000Z\",\"data\":{\"agentId\":\"hermes-a\",\"agentName\":\"Hermes A\",\"role\":\"planner\"}}",
      "",
      ""
    ].join("\n")
  );
});

test("formatSseEvent emits one data line per line of JSON payload", () => {
  const event: LiveSessionEvent = {
    id: "event-2",
    sessionId: "session-1",
    type: "session.failed",
    createdAt: "2026-05-11T00:00:01.000Z",
    data: { error: "first line\nsecond line" }
  };

  const formatted = formatSseEvent(event);

  assert.match(formatted, /^id: event-2\n/);
  assert.match(formatted, /\nevent: session.failed\n/);
  assert.match(formatted, /\ndata: /);
  assert.match(formatted, /\n\n$/);
});
```

- [ ] **Step 2: Run tests and verify red**

Run:

```bash
npm run build && node --test dist/test/sse.test.js
```

Expected: TypeScript build fails because `src/web/sse.ts` and `src/web/live-types.ts` do not exist.

- [ ] **Step 3: Add live types**

Create `src/web/live-types.ts`:

```ts
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

export interface LiveSessionEvent<TData = unknown> {
  id: string;
  sessionId: string;
  type: LiveSessionEventType;
  createdAt: string;
  data: TData;
}

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
```

- [ ] **Step 4: Add SSE formatter**

Create `src/web/sse.ts`:

```ts
import http from "node:http";
import type { LiveSessionEvent } from "./live-types.js";

export function formatSseEvent(event: LiveSessionEvent): string {
  const data = JSON.stringify(event);
  const dataLines = data.split("\n").map((line) => `data: ${line}`);
  return [
    `id: ${event.id}`,
    `event: ${event.type}`,
    ...dataLines,
    "",
    ""
  ].join("\n");
}

export function writeSseHeaders(res: http.ServerResponse): void {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no"
  });
}

export function writeSseEvent(res: http.ServerResponse, event: LiveSessionEvent): void {
  res.write(formatSseEvent(event));
}
```

- [ ] **Step 5: Run tests and verify green**

Run:

```bash
npm run build && node --test dist/test/sse.test.js
```

Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/web/live-types.ts src/web/sse.ts test/sse.test.ts
git commit -m add-live-session-types-and-sse-formatting
```

## Task 2: Live Event Bus

**Files:**
- Create: `src/web/live-event-bus.ts`
- Test: `test/live-event-bus.test.ts`

- [ ] **Step 1: Write failing event bus tests**

Create `test/live-event-bus.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { LiveEventBus } from "../src/web/live-event-bus.js";
import type { LiveSessionEvent } from "../src/web/live-types.js";

function event(sessionId: string, id = "event-1"): LiveSessionEvent {
  return {
    id,
    sessionId,
    type: "session.started",
    createdAt: "2026-05-11T00:00:00.000Z",
    data: { status: "running" }
  };
}

test("LiveEventBus publishes to subscribers for the same session", () => {
  const bus = new LiveEventBus();
  const received: LiveSessionEvent[] = [];

  bus.subscribe("session-1", (item) => received.push(item));
  bus.publish(event("session-1"));

  assert.equal(received.length, 1);
  assert.equal(received[0]?.id, "event-1");
});

test("LiveEventBus does not leak events across sessions", () => {
  const bus = new LiveEventBus();
  const received: LiveSessionEvent[] = [];

  bus.subscribe("session-1", (item) => received.push(item));
  bus.publish(event("session-2"));

  assert.equal(received.length, 0);
});

test("LiveEventBus unsubscribe stops future delivery", () => {
  const bus = new LiveEventBus();
  const received: LiveSessionEvent[] = [];

  const unsubscribe = bus.subscribe("session-1", (item) => received.push(item));
  unsubscribe();
  bus.publish(event("session-1"));

  assert.equal(received.length, 0);
  assert.equal(bus.subscriberCount("session-1"), 0);
});
```

- [ ] **Step 2: Run tests and verify red**

Run:

```bash
npm run build && node --test dist/test/live-event-bus.test.js
```

Expected: TypeScript build fails because `LiveEventBus` does not exist.

- [ ] **Step 3: Implement event bus**

Create `src/web/live-event-bus.ts`:

```ts
import type { LiveSessionEvent } from "./live-types.js";

export type LiveEventSubscriber = (event: LiveSessionEvent) => void;

export class LiveEventBus {
  private readonly subscribers = new Map<string, Set<LiveEventSubscriber>>();

  publish(event: LiveSessionEvent): void {
    const subscribers = this.subscribers.get(event.sessionId);
    if (!subscribers) {
      return;
    }

    for (const subscriber of subscribers) {
      subscriber(event);
    }
  }

  subscribe(sessionId: string, subscriber: LiveEventSubscriber): () => void {
    const subscribers = this.subscribers.get(sessionId) ?? new Set<LiveEventSubscriber>();
    subscribers.add(subscriber);
    this.subscribers.set(sessionId, subscribers);

    return () => {
      subscribers.delete(subscriber);
      if (subscribers.size === 0) {
        this.subscribers.delete(sessionId);
      }
    };
  }

  subscriberCount(sessionId: string): number {
    return this.subscribers.get(sessionId)?.size ?? 0;
  }
}
```

- [ ] **Step 4: Run tests and verify green**

Run:

```bash
npm run build && node --test dist/test/live-event-bus.test.js
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/web/live-event-bus.ts test/live-event-bus.test.ts
git commit -m add-live-event-bus
```

## Task 3: Discussion Lifecycle Hooks

**Files:**
- Modify: `src/types.ts`
- Modify: `src/moderator.ts`
- Modify: `src/service.ts`
- Modify: `src/index.ts`
- Test: `test/moderator-lifecycle.test.ts`

- [ ] **Step 1: Write failing lifecycle tests**

Create `test/moderator-lifecycle.test.ts`:

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { DiscussionService } from "../src/service.js";
import type { DiscussionLifecycleHooks, HermesAgent } from "../src/types.js";

test("DiscussionService emits lifecycle hooks during a session", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "lifecycle-sessions-"));
  const events: string[] = [];
  const hooks: DiscussionLifecycleHooks = {
    onSessionStarted: (sessionId) => events.push(`started:${sessionId}`),
    onSpeakerActive: ({ agentId, round }) => events.push(`speaker:${agentId}:${round}`),
    onMessageAppended: (message) => events.push(`message:${message.senderId}`),
    onSessionCompleted: (sessionId) => events.push(`completed:${sessionId}`)
  };
  const agents: HermesAgent[] = [
    {
      id: "hermes-a",
      name: "Hermes A",
      role: "planner",
      async respond() {
        return { content: "planner response" };
      }
    },
    {
      id: "hermes-b",
      name: "Hermes B",
      role: "builder",
      async respond() {
        return { content: "builder response" };
      }
    }
  ];
  const service = new DiscussionService({ rootDir, lifecycleHooks: hooks });
  const session = await service.createSession({ topic: "hook test", agents, maxRounds: 1 });

  await service.runSession(session.sessionId);

  assert.deepEqual(events, [
    `started:${session.sessionId}`,
    "speaker:hermes-a:1",
    "message:hermes-a",
    "speaker:hermes-b:1",
    "message:hermes-b",
    `completed:${session.sessionId}`
  ]);
});

test("DiscussionService emits action and execution result hooks", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "lifecycle-action-sessions-"));
  const workspaceRootDir = await mkdtemp(join(tmpdir(), "lifecycle-workspaces-"));
  const events: string[] = [];
  const hooks: DiscussionLifecycleHooks = {
    onActionCreated: ({ action }) => events.push(`action:${action.type}:${action.path ?? ""}`),
    onExecutionResult: ({ result }) => events.push(`result:${result.status}`)
  };
  const agents: HermesAgent[] = [
    {
      id: "hermes-a",
      name: "Hermes A",
      role: "planner",
      async respond() {
        return {
          content: "write file",
          actions: [{ type: "write_file", path: "docs/live.md", content: "live" }]
        };
      }
    },
    {
      id: "hermes-b",
      name: "Hermes B",
      role: "builder",
      async respond() {
        return { content: "builder response" };
      }
    }
  ];
  const service = new DiscussionService({
    rootDir,
    workspaceRootDir,
    enableExecution: true,
    lifecycleHooks: hooks
  });
  const session = await service.createSession({ topic: "action hook test", agents, maxRounds: 1 });

  await service.runSession(session.sessionId);

  assert.deepEqual(events, [
    "action:write_file:docs/live.md",
    "result:succeeded"
  ]);
});

test("DiscussionService emits failed lifecycle hook", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "lifecycle-failed-sessions-"));
  const events: string[] = [];
  const hooks: DiscussionLifecycleHooks = {
    onSessionFailed: ({ sessionId, error }) => events.push(`failed:${sessionId}:${error}`)
  };
  const agents: HermesAgent[] = [
    {
      id: "hermes-a",
      name: "Hermes A",
      async respond() {
        throw new Error("agent unavailable");
      }
    },
    {
      id: "hermes-b",
      name: "Hermes B",
      async respond() {
        return { content: "builder response" };
      }
    }
  ];
  const service = new DiscussionService({ rootDir, lifecycleHooks: hooks });
  const session = await service.createSession({ topic: "failed hook test", agents, maxRounds: 1 });

  await assert.rejects(() => service.runSession(session.sessionId), /agent unavailable/);

  assert.deepEqual(events, [`failed:${session.sessionId}:agent unavailable`]);
});
```

- [ ] **Step 2: Run tests and verify red**

Run:

```bash
npm run build && node --test dist/test/moderator-lifecycle.test.js
```

Expected: TypeScript build fails because `DiscussionLifecycleHooks` and `lifecycleHooks` option do not exist.

- [ ] **Step 3: Add hook types**

Modify `src/types.ts` after `DiscussionResult`:

```ts
export interface DiscussionLifecycleHooks {
  onSessionStarted?: (sessionId: string) => void | Promise<void>;
  onSpeakerActive?: (context: {
    sessionId: string;
    agentId: string;
    agentName: string;
    role?: string;
    round: number;
  }) => void | Promise<void>;
  onMessageAppended?: (message: DiscussionMessage) => void | Promise<void>;
  onActionCreated?: (context: {
    sessionId: string;
    action: ExecutionAction;
  }) => void | Promise<void>;
  onExecutionResult?: (context: {
    sessionId: string;
    result: ExecutionResult;
  }) => void | Promise<void>;
  onSessionCompleted?: (sessionId: string) => void | Promise<void>;
  onSessionFailed?: (context: {
    sessionId: string;
    error: string;
  }) => void | Promise<void>;
}
```

- [ ] **Step 4: Wire hooks into moderator**

Modify `src/moderator.ts`.

Add `DiscussionLifecycleHooks` to imports:

```ts
  DiscussionLifecycleHooks,
```

Extend `ModeratorOptions`:

```ts
export interface ModeratorOptions {
  now?: () => Date;
  idFactory?: () => string;
  executorFactory?: (session: DiscussionSession) => Executor | undefined;
  lifecycleHooks?: DiscussionLifecycleHooks;
}
```

Add class field and constructor assignment:

```ts
  private readonly lifecycleHooks: DiscussionLifecycleHooks;
```

```ts
    this.lifecycleHooks = options.lifecycleHooks ?? {};
```

In `run()`, after `await persistSession(session);`, add:

```ts
    await this.lifecycleHooks.onSessionStarted?.(session.sessionId);
```

Before `agent.respond(...)`, add:

```ts
        await this.lifecycleHooks.onSpeakerActive?.({
          sessionId: session.sessionId,
          agentId: agent.id,
          agentName: agent.name,
          role: agent.role,
          round
        });
```

After `await appendAction?.(action);`, add:

```ts
          await this.lifecycleHooks.onActionCreated?.({
            sessionId: session.sessionId,
            action
          });
```

After `await appendExecutionResult?.(result);`, add:

```ts
          await this.lifecycleHooks.onExecutionResult?.({
            sessionId: session.sessionId,
            result
          });
```

After `await appendMessage(message);`, add:

```ts
        await this.lifecycleHooks.onMessageAppended?.(message);
```

In `complete()`, after `await persistSession(session);`, add:

```ts
    await this.lifecycleHooks.onSessionCompleted?.(session.sessionId);
```

- [ ] **Step 5: Wire hooks into service**

Modify `src/service.ts`.

Add `DiscussionLifecycleHooks` to type imports.

Extend `DiscussionServiceOptions`:

```ts
  lifecycleHooks?: DiscussionLifecycleHooks;
```

When constructing `Moderator`, pass hooks:

```ts
      lifecycleHooks: options.lifecycleHooks,
```

In the `catch` block in `runSession()`, after `await this.appendEvent(sessionId, "session.failed", { error: session.error });`, add:

```ts
      await this.moderatorLifecycleFailure(sessionId, session.error);
```

Add a private helper to avoid exposing the moderator internals:

```ts
  private async moderatorLifecycleFailure(sessionId: string, error: string): Promise<void> {
    await this.lifecycleHooks.onSessionFailed?.({ sessionId, error });
  }
```

Also add a private field:

```ts
  private readonly lifecycleHooks: DiscussionLifecycleHooks;
```

And constructor assignment:

```ts
    this.lifecycleHooks = options.lifecycleHooks ?? {};
```

The service should still append durable `session.failed` events as it does today.

- [ ] **Step 6: Export hook type from public index**

Modify `src/index.ts` and add `DiscussionLifecycleHooks` to the type export list from `./types.js`:

```ts
  DiscussionLifecycleHooks,
```

- [ ] **Step 7: Run lifecycle tests**

Run:

```bash
npm run build && node --test dist/test/moderator-lifecycle.test.js
```

Expected: 3 tests pass.

- [ ] **Step 8: Run existing service/moderator tests**

Run:

```bash
npm run build && node --test dist/test/discussion-service.test.js
```

Expected: existing discussion service tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/types.ts src/moderator.ts src/service.ts src/index.ts test/moderator-lifecycle.test.ts
git commit -m add-discussion-lifecycle-hooks
```

## Task 4: Live Session Job Registry

**Files:**
- Create: `src/web/live-session-jobs.ts`
- Test: `test/live-session-jobs.test.ts`

- [ ] **Step 1: Write failing job registry tests**

Create `test/live-session-jobs.test.ts`:

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { LiveEventBus } from "../src/web/live-event-bus.js";
import { LiveSessionJobRegistry } from "../src/web/live-session-jobs.js";
import type { WebRunSessionRequest } from "../src/web/types.js";

function request(): WebRunSessionRequest {
  return {
    topic: "live job",
    maxRounds: 1,
    enableExecution: false,
    agents: [
      { id: "hermes-a", name: "Hermes A", role: "planner", type: "http", url: "http://mock.local/a" },
      { id: "hermes-b", name: "Hermes B", role: "builder", type: "http", url: "http://mock.local/b" }
    ]
  };
}

test("LiveSessionJobRegistry creates a queued job and completes it", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "live-job-sessions-"));
  const workspaceRootDir = await mkdtemp(join(tmpdir(), "live-job-workspaces-"));
  const bus = new LiveEventBus();
  const registry = new LiveSessionJobRegistry({
    rootDir,
    workspaceRootDir,
    eventBus: bus,
    agentFactory: (agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      async respond() {
        return { content: `${agent.id} live` };
      }
    })
  });

  const job = await registry.createJob(request());
  assert.equal(job.status, "queued");
  assert.equal(registry.getJob(job.sessionId)?.status, "queued");

  await registry.waitForJob(job.sessionId);

  assert.equal(registry.getJob(job.sessionId)?.status, "completed");
});

test("LiveSessionJobRegistry publishes live events", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "live-job-events-sessions-"));
  const workspaceRootDir = await mkdtemp(join(tmpdir(), "live-job-events-workspaces-"));
  const bus = new LiveEventBus();
  const registry = new LiveSessionJobRegistry({
    rootDir,
    workspaceRootDir,
    eventBus: bus,
    agentFactory: (agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      async respond() {
        return { content: `${agent.id} live` };
      }
    })
  });
  const received: string[] = [];

  const job = await registry.createJob(request());
  bus.subscribe(job.sessionId, (event) => received.push(event.type));
  await registry.waitForJob(job.sessionId);

  assert.ok(received.includes("session.started"));
  assert.ok(received.includes("speaker.active"));
  assert.ok(received.includes("message.appended"));
  assert.ok(received.includes("session.completed"));
});

test("LiveSessionJobRegistry marks failed jobs", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "live-job-failed-sessions-"));
  const workspaceRootDir = await mkdtemp(join(tmpdir(), "live-job-failed-workspaces-"));
  const bus = new LiveEventBus();
  const registry = new LiveSessionJobRegistry({
    rootDir,
    workspaceRootDir,
    eventBus: bus,
    agentFactory: (agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      async respond() {
        throw new Error("mock failure");
      }
    })
  });

  const job = await registry.createJob(request());
  await registry.waitForJob(job.sessionId);

  const completed = registry.getJob(job.sessionId);
  assert.equal(completed?.status, "failed");
  assert.match(completed?.error ?? "", /mock failure/);
});
```

- [ ] **Step 2: Run tests and verify red**

Run:

```bash
npm run build && node --test dist/test/live-session-jobs.test.js
```

Expected: build fails because `LiveSessionJobRegistry` does not exist.

- [ ] **Step 3: Implement job registry**

Create `src/web/live-session-jobs.ts`:

```ts
import { randomUUID } from "node:crypto";
import { createHermesAgentFromConfig } from "../adapters.js";
import { DiscussionService } from "../service.js";
import type { HermesAgent, HttpHermesAgentConfig } from "../index.js";
import type { DiscussionLifecycleHooks } from "../types.js";
import { validateRunSessionRequest } from "./validation.js";
import type { WebRunSessionRequest } from "./types.js";
import type {
  ActionCreatedData,
  ExecutionResultData,
  LiveSessionEvent,
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

    const promise = this.runJob(service, job.sessionId);
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
    await this.jobPromises.get(sessionId);
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
        this.publish<SpeakerActiveData>(data.sessionId, "speaker.active", {
          agentId: data.agentId,
          agentName: data.agentName,
          role: data.role,
          round: data.round
        });
      },
      onMessageAppended: (message) => {
        this.publish<MessageAppendedData>(message.sessionId, "message.appended", { message });
      },
      onActionCreated: ({ sessionId, action }) => {
        this.publish<ActionCreatedData>(sessionId, "action.created", { action });
      },
      onExecutionResult: ({ sessionId, result }) => {
        this.publish<ExecutionResultData>(sessionId, "execution.result", { result });
      },
      onSessionCompleted: (sessionId) => {
        this.publish(sessionId, "session.completed", { status: "completed" });
      },
      onSessionFailed: ({ sessionId, error }) => {
        this.publish<SessionFailedData>(sessionId, "session.failed", { error });
      }
    };
  }

  private publish<TData>(sessionId: string, type: LiveSessionEvent<TData>["type"], data: TData): void {
    this.eventBus.publish({
      id: this.idFactory(),
      sessionId,
      type,
      createdAt: this.timestamp(),
      data
    });
  }

  private timestamp(): string {
    return this.now().toISOString();
  }
}
```

Implementation note: `createJob()` is intentionally async because `DiscussionService.createSession()` initializes workspace and session files.

- [ ] **Step 4: Run job registry tests**

Run:

```bash
npm run build && node --test dist/test/live-session-jobs.test.js
```

Expected: 3 tests pass.

- [ ] **Step 5: Run full live unit set**

Run:

```bash
npm run build && node --test dist/test/live-event-bus.test.js dist/test/live-session-jobs.test.js dist/test/moderator-lifecycle.test.js dist/test/sse.test.js
```

Expected: all live unit tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/web/live-session-jobs.ts test/live-session-jobs.test.ts
git commit -m add-live-session-job-registry
```

## Task 5: Web Handler and Server APIs

**Files:**
- Modify: `src/web/handlers.ts`
- Modify: `src/web/server.ts`
- Test: `test/web-handlers.test.ts`
- Test: `test/web-server.test.ts`

- [ ] **Step 1: Add failing handler test**

Add to `test/web-handlers.test.ts`:

```ts
import { LiveEventBus } from "../src/web/live-event-bus.js";
import { LiveSessionJobRegistry } from "../src/web/live-session-jobs.js";
import { createLiveSessionJob } from "../src/web/handlers.js";

test("createLiveSessionJob returns session id and events URL", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "web-live-handler-sessions-"));
  const workspaceRootDir = await mkdtemp(join(tmpdir(), "web-live-handler-workspaces-"));
  const registry = new LiveSessionJobRegistry({
    rootDir,
    workspaceRootDir,
    eventBus: new LiveEventBus(),
    agentFactory: (agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      async respond() {
        return { content: `${agent.id} ok` };
      }
    })
  });

  const response = await createLiveSessionJob({
    registry,
    request: {
      topic: "web live",
      maxRounds: 1,
      enableExecution: false,
      agents: [
        { id: "a", name: "A", role: "planner", type: "http", url: "http://mock.local/a" },
        { id: "b", name: "B", role: "builder", type: "http", url: "http://mock.local/b" }
      ]
    }
  });

  assert.equal(response.status, "queued");
  assert.match(response.sessionId, /^[0-9a-f-]{36}$/);
  assert.equal(response.eventsUrl, `/api/sessions/${response.sessionId}/events`);

  await registry.waitForJob(response.sessionId);
});
```

- [ ] **Step 2: Add failing server tests**

Add to `test/web-server.test.ts`:

```ts
test("web server creates live session jobs", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "web-live-server-sessions-"));
  const workspaceRootDir = await mkdtemp(join(tmpdir(), "web-live-server-workspaces-"));
  const server = createWebServer({
    rootDir,
    workspaceRootDir,
    publicDir: "public",
    agentFactory: (agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      async respond() {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { content: `${agent.id} live` };
      }
    })
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/sessions/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        topic: "server live",
        maxRounds: 1,
        enableExecution: false,
        agents: [
          { id: "a", name: "A", role: "planner", type: "http", url: "http://mock.local/a" },
          { id: "b", name: "B", role: "builder", type: "http", url: "http://mock.local/b" }
        ]
      })
    });
    const body = await response.json() as { sessionId: string; status: string; eventsUrl: string };

    assert.equal(response.status, 200);
    assert.equal(body.status, "queued");
    assert.equal(body.eventsUrl, `/api/sessions/${body.sessionId}/events`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("web server streams live events for a session", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "web-live-sse-sessions-"));
  const workspaceRootDir = await mkdtemp(join(tmpdir(), "web-live-sse-workspaces-"));
  const server = createWebServer({
    rootDir,
    workspaceRootDir,
    publicDir: "public",
    agentFactory: (agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      async respond() {
        return { content: `${agent.id} live` };
      }
    })
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  try {
    const jobResponse = await fetch(`http://127.0.0.1:${port}/api/sessions/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        topic: "server sse",
        maxRounds: 1,
        enableExecution: false,
        agents: [
          { id: "a", name: "A", role: "planner", type: "http", url: "http://mock.local/a" },
          { id: "b", name: "B", role: "builder", type: "http", url: "http://mock.local/b" }
        ]
      })
    });
    const job = await jobResponse.json() as { eventsUrl: string };
    const eventResponse = await fetch(`http://127.0.0.1:${port}${job.eventsUrl}`);
    const reader = eventResponse.body?.getReader();
    assert.equal(eventResponse.status, 200);
    assert.match(eventResponse.headers.get("content-type") ?? "", /text\/event-stream/);
    assert.ok(reader);
    const chunk = await reader.read();
    const text = new TextDecoder().decode(chunk.value);
    await reader.cancel();

    assert.match(text, /event: /);
    assert.match(text, /data: /);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
```

- [ ] **Step 3: Run tests and verify red**

Run:

```bash
npm run build && node --test dist/test/web-handlers.test.js dist/test/web-server.test.js
```

Expected: build fails because server options and handler do not exist.

- [ ] **Step 4: Add handler function**

Modify `src/web/handlers.ts`.

Add imports:

```ts
import type { LiveSessionJobRegistry } from "./live-session-jobs.js";
import type { WebCreateSessionJobResponse } from "./live-types.js";
```

Add interface:

```ts
export interface CreateLiveSessionJobOptions {
  registry: LiveSessionJobRegistry;
  request: unknown;
}
```

Add function:

```ts
export async function createLiveSessionJob(
  options: CreateLiveSessionJobOptions
): Promise<WebCreateSessionJobResponse> {
  const job = await options.registry.createJob(options.request);
  return {
    sessionId: job.sessionId,
    status: job.status,
    eventsUrl: `/api/sessions/${job.sessionId}/events`
  };
}
```

- [ ] **Step 5: Wire server registry and routes**

Modify `src/web/server.ts`.

Add imports:

```ts
import { createHermesAgentFromConfig } from "../adapters.js";
import type { HermesAgent, HttpHermesAgentConfig } from "../index.js";
import { LiveEventBus } from "./live-event-bus.js";
import { LiveSessionJobRegistry } from "./live-session-jobs.js";
import { writeSseEvent, writeSseHeaders } from "./sse.js";
```

Extend `WebServerOptions`:

```ts
  agentFactory?: (agent: HttpHermesAgentConfig) => HermesAgent;
```

Inside `createWebServer(options)`, before `return http.createServer(...)`, add:

```ts
  const eventBus = new LiveEventBus();
  const liveJobs = new LiveSessionJobRegistry({
    rootDir: options.rootDir,
    workspaceRootDir: options.workspaceRootDir,
    eventBus,
    agentFactory: options.agentFactory ?? createHermesAgentFromConfig
  });
```

Add route before `/api/sessions/run`:

```ts
      if (req.method === "POST" && url.pathname === "/api/sessions/jobs") {
        const body = await readJsonBody(req);
        await sendJson(res, 200, await createLiveSessionJob({ registry: liveJobs, request: body }));
        return;
      }
```

Add SSE route before static handling:

```ts
      const eventsMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/events$/);
      if (req.method === "GET" && eventsMatch?.[1]) {
        const sessionId = eventsMatch[1];
        writeSseHeaders(res);
        const unsubscribe = eventBus.subscribe(sessionId, (event) => {
          writeSseEvent(res, event);
        });
        req.on("close", unsubscribe);
        return;
      }
```

Ensure `createLiveSessionJob` is imported from `./handlers.js`.

- [ ] **Step 6: Run handler and server tests**

Run:

```bash
npm run build && node --test dist/test/web-handlers.test.js dist/test/web-server.test.js
```

Expected: all web handler/server tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/web/handlers.ts src/web/server.ts test/web-handlers.test.ts test/web-server.test.ts
git commit -m add-live-session-job-and-sse-routes
```

## Task 6: Frontend Live Mode

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/styles.css`

- [ ] **Step 1: Add live UI containers**

Modify `public/index.html`.

Replace:

```html
        <div id="status-banner" class="status-banner">Ready</div>
        <section id="summary" class="summary-grid"></section>
```

With:

```html
        <div id="status-banner" class="status-banner">Ready</div>
        <section class="live-strip">
          <div>
            <span>Live status</span>
            <strong id="liveStatus">idle</strong>
          </div>
          <div>
            <span>Active speaker</span>
            <strong id="activeSpeaker">none</strong>
          </div>
          <div>
            <span>Live events</span>
            <strong id="liveEventCount">0</strong>
          </div>
        </section>
        <section id="summary" class="summary-grid"></section>
```

- [ ] **Step 2: Update frontend state and run flow**

Modify the top of `public/app.js`:

```js
const state = {
  defaultConfig: undefined,
  selectedSessionId: undefined,
  liveSource: undefined,
  liveEventCount: 0
};
```

In `runSession(event)`, replace the fetch target and completion handling.

Replace:

```js
    const result = await fetchJson("/api/sessions/run", {
```

With:

```js
    closeLiveSource();
    resetLiveView();
    const result = await fetchJson("/api/sessions/jobs", {
```

Replace:

```js
    setStatus(`Completed session ${result.sessionId}`, "completed");
    await loadSessions();
    await loadReplay(result.sessionId);
```

With:

```js
    state.selectedSessionId = result.sessionId;
    setLiveStatus(result.status);
    setStatus(`Running session ${result.sessionId}`, "running");
    await loadSessions();
    connectLiveEvents(result.sessionId, result.eventsUrl);
```

Keep the `finally` block enabling `runButton` after the job has been created.

- [ ] **Step 3: Add EventSource helpers**

Add to `public/app.js` after `loadReplay()`:

```js
function connectLiveEvents(sessionId, eventsUrl) {
  closeLiveSource();
  const source = new EventSource(eventsUrl);
  state.liveSource = source;

  const handle = (event) => {
    const payload = JSON.parse(event.data);
    state.liveEventCount += 1;
    $("liveEventCount").textContent = String(state.liveEventCount);
    handleLiveEvent(sessionId, payload);
  };

  [
    "session.queued",
    "session.started",
    "speaker.active",
    "message.appended",
    "action.created",
    "execution.result",
    "session.completed",
    "session.failed"
  ].forEach((eventType) => {
    source.addEventListener(eventType, handle);
  });

  source.onerror = () => {
    setStatus("Live event connection interrupted.", "failed");
  };
}

function handleLiveEvent(sessionId, event) {
  if (sessionId !== state.selectedSessionId) {
    return;
  }

  if (event.type === "session.started") {
    setLiveStatus("running");
    setStatus(`Running session ${sessionId}`, "running");
    return;
  }

  if (event.type === "speaker.active") {
    const speaker = event.data;
    $("activeSpeaker").textContent = `${speaker.agentName ?? speaker.agentId} (${speaker.role ?? "agent"})`;
    return;
  }

  if (event.type === "message.appended") {
    appendLiveMessage(event.data.message);
    return;
  }

  if (event.type === "execution.result") {
    appendLiveExecutionResult(event.data.result);
    return;
  }

  if (event.type === "session.completed") {
    setLiveStatus("completed");
    setStatus(`Completed session ${sessionId}`, "completed");
    closeLiveSource();
    loadSessions().then(() => loadReplay(sessionId)).catch((error) => setStatus(error.message, "failed"));
    return;
  }

  if (event.type === "session.failed") {
    setLiveStatus("failed");
    setStatus(event.data.error ?? `Session ${sessionId} failed`, "failed");
    closeLiveSource();
  }
}

function appendLiveMessage(message) {
  const container = $("timeline");
  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderMessageCard(message);
  container.appendChild(wrapper.firstElementChild);
}

function appendLiveExecutionResult(result) {
  const container = $("execution");
  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderExecutionResult(result);
  container.appendChild(wrapper.firstElementChild);
}

function closeLiveSource() {
  if (state.liveSource) {
    state.liveSource.close();
    state.liveSource = undefined;
  }
}

function resetLiveView() {
  state.liveEventCount = 0;
  $("liveEventCount").textContent = "0";
  $("activeSpeaker").textContent = "none";
  setLiveStatus("queued");
  $("timeline").innerHTML = "";
  $("execution").innerHTML = "";
  $("workspace-files").innerHTML = "";
  $("summary").innerHTML = "";
}

function setLiveStatus(status) {
  $("liveStatus").textContent = status;
}
```

- [ ] **Step 4: Refactor existing render helpers for reuse**

In `public/app.js`, replace `renderTimeline()` implementation with:

```js
function renderTimeline(replay) {
  $("timeline").innerHTML = replay.messages.map(renderMessageCard).join("");
}
```

Add helper:

```js
function renderMessageCard(message) {
  const assignments = message.taskAssignments ?? [];
  const actions = message.executionActions ?? [];
  const results = message.executionResults ?? [];
  return `
    <article class="message-card ${escapeHtml(message.senderRole ?? "")}">
      <header>
        <strong>${escapeHtml(message.senderName)}</strong>
        <span>${escapeHtml(message.senderRole ?? "agent")}</span>
        <small>round ${message.round}</small>
      </header>
      <p>${escapeHtml(message.content)}</p>
      ${renderMiniList("Assignments", assignments.map((item) => item.title))}
      ${renderMiniList("Actions", actions.map((item) => `${item.type} ${item.path ?? item.command ?? ""}`))}
      ${renderMiniList("Results", results.map((item) => `${item.status}: ${item.summary}`))}
    </article>
  `;
}
```

In `renderExecution()`, replace the per-result template with `renderExecutionResult(result)` and add:

```js
function renderExecutionResult(result) {
  return `
    <article class="execution-result ${escapeHtml(result.status)}">
      <strong>${escapeHtml(result.status)}</strong>
      <p>${escapeHtml(result.summary)}</p>
      ${result.outputPreview ? `<pre>${escapeHtml(result.outputPreview)}</pre>` : ""}
      ${result.error ? `<pre>${escapeHtml(result.error)}</pre>` : ""}
    </article>
  `;
}
```

In `loadReplay(sessionId)`, add at the top:

```js
  closeLiveSource();
```

- [ ] **Step 5: Add live styles**

Add to `public/styles.css`:

```css
.live-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(120px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.live-strip div {
  background: #ffffff;
  border: 1px solid #d8dee8;
  border-radius: 6px;
  padding: 10px 12px;
}

.live-strip span {
  display: block;
  color: #697386;
  font-size: 12px;
  margin-bottom: 4px;
}

.live-strip strong {
  display: block;
  overflow-wrap: anywhere;
}
```

Inside the existing `@media (max-width: 980px)` block, add:

```css
  .live-strip {
    grid-template-columns: 1fr;
  }
```

- [ ] **Step 6: Run build and static smoke**

Run:

```bash
npm run build
grep -q "/api/sessions/jobs" public/app.js
grep -q "EventSource" public/app.js
grep -q "liveStatus" public/index.html
```

Expected: build passes and all grep checks succeed.

- [ ] **Step 7: Commit**

```bash
git add public/index.html public/app.js public/styles.css
git commit -m add-web-live-monitor-ui
```

## Task 7: Documentation and Version Notes

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `README.md`
- Modify: `docs/PHASE_3A_WEB_RUNNER_CONSOLE_USER_GUIDE.md`
- Create: `docs/PHASE_3B_LIVE_MONITOR_RUNBOOK.md`
- Create: `docs/step_14_phase_3b_live_monitor_validation_2026_05_11.md`

- [ ] **Step 1: Update changelog**

Add to the top of `CHANGELOG.md`:

```markdown
## v0.3.0 - Phase 3B Live Monitor

Released: 2026-05-11

### Added

- Added background Web session jobs through `POST /api/sessions/jobs`.
- Added Server-Sent Events live stream through `GET /api/sessions/:sessionId/events`.
- Added live Web UI updates for active speaker, messages, and execution results.
- Added live job registry and in-memory event bus.

### Preserved

- Phase 3A replay APIs remain available.
- Synchronous `POST /api/sessions/run` remains available for compatibility.
```

- [ ] **Step 2: Update README links**

Add after the Phase 3A guide section in `README.md`:

```markdown
## Phase 3B Live Monitor Runbook

See:

```text
docs/PHASE_3B_LIVE_MONITOR_RUNBOOK.md
```
```

- [ ] **Step 3: Update user guide**

Add near the Phase 3A limitations section in `docs/PHASE_3A_WEB_RUNNER_CONSOLE_USER_GUIDE.md`:

```markdown
## Phase 3B Live Monitor

Phase 3B adds live monitoring to the Web Runner Console.

When you click Run Session, the browser now creates a background runner job and subscribes to live updates. During execution, the page shows:

- live session status
- active speaker
- planner / builder messages as they arrive
- execution results as they complete

After completion, the page still loads the persisted replay from `sessions/<sessionId>/*`.
```

- [ ] **Step 4: Add Phase 3B runbook**

Create `docs/PHASE_3B_LIVE_MONITOR_RUNBOOK.md`:

```markdown
# Phase 3B Live Monitor Runbook

## Goal

Run the Web Runner Console and verify that Hermes session progress appears live while the session is still running.

## Start Server

On runner EC2:

```bash
cd ~/projects/aiMeeting
git pull
npm install
npm test
HOST=0.0.0.0 PORT=3000 npm run web
```

Open:

```text
http://<runner-public-ip>:3000
```

## Verify Hermes Endpoints

Use the Check buttons beside Planner URL and Builder URL.

Expected:

```text
Planner URL: green ✓
Builder URL: green ✓
```

## Run Live Session

1. Enter a topic.
2. Set `Max rounds` to `2`.
3. Enable `Execute actions`.
4. Click `Run Session`.
5. Confirm the Live status changes from `queued` to `running`.
6. Confirm Active speaker changes when Hermes A or Hermes B is called.
7. Confirm Meeting Timeline receives messages before the final replay loads.
8. Confirm Execution receives results if actions are produced.
9. Confirm final status becomes `completed`.

## Fallback Verification

If live updates stop, check persisted replay:

```bash
ls sessions/<sessionId>
cat sessions/<sessionId>/messages.jsonl
cat sessions/<sessionId>/execution-results.jsonl
```

The live stream is in-memory. Persisted JSONL files remain the source of truth.
```

- [ ] **Step 5: Add validation record template**

Create `docs/step_14_phase_3b_live_monitor_validation_2026_05_11.md`:

```markdown
# Step 14：Phase 3B Live Monitor 驗證紀錄

## Environment

- Runner:
- Hermes A:
- Hermes B:
- Version: v0.3.0

## Commands

```bash
npm test
HOST=0.0.0.0 PORT=3000 npm run web
```

## Web Validation

- Planner URL Check:
- Builder URL Check:
- Session ID:
- Live status observed:
- Active speaker observed:
- Message live updates observed:
- Execution result live updates observed:
- Final replay loaded:

## Result

Phase 3B Live Monitor validation:
```

- [ ] **Step 6: Commit**

```bash
git add CHANGELOG.md README.md docs/PHASE_3A_WEB_RUNNER_CONSOLE_USER_GUIDE.md docs/PHASE_3B_LIVE_MONITOR_RUNBOOK.md docs/step_14_phase_3b_live_monitor_validation_2026_05_11.md
git commit -m document-phase-3b-live-monitor
```

## Task 8: Release Version and Final Verification

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Bump version**

Run:

```bash
npm version 0.3.0 --no-git-tag-version
```

Expected: `package.json` and `package-lock.json` version become `0.3.0`.

- [ ] **Step 2: Run full test suite**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Run HTTP smoke**

Run:

```bash
PORT=3100 HOST=127.0.0.1 npm run web
```

In another terminal:

```bash
curl -fsS http://127.0.0.1:3100/api/default-config
curl -fsS http://127.0.0.1:3100/
curl -fsS -X POST http://127.0.0.1:3100/api/agents/check \
  -H 'content-type: application/json' \
  -d '{"url":"http://127.0.0.1:9/respond"}'
```

Expected:

- Default config returns JSON.
- `/` returns HTML containing `Hermes Runner Console`.
- Agent check returns JSON containing `"ok":false` and derived `/health` URL.

- [ ] **Step 4: Run live API smoke with mock endpoints if available**

If local mock Hermes wrappers are available, run a live session through the Web UI.

Minimum server-side API smoke:

```bash
curl -fsS -X POST http://127.0.0.1:3100/api/sessions/jobs \
  -H 'content-type: application/json' \
  -d @hermes-agents.config.json
```

Expected:

- Response contains `sessionId`.
- Response contains `status`.
- Response contains `eventsUrl`.

- [ ] **Step 5: Browser smoke**

Open:

```text
http://127.0.0.1:3100/
```

Verify visible UI contains:

- `Live status`
- `Active speaker`
- `Live events`
- `Planner URL`
- `Builder URL`
- `Run Session`

- [ ] **Step 6: Commit release bump**

```bash
git add package.json package-lock.json
git commit -m release-v0.3.0-live-monitor
```

## Final Completion

After all tasks pass:

1. Run `npm test` again on the final branch.
2. Review `git status --short`.
3. Use the finishing-a-development-branch workflow.
4. If approved, merge to `main`, tag `v0.3.0`, and push `main` plus tag to GitHub.
