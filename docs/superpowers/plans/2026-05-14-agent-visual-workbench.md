# Agent Visual Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `v0.4.0` Agent Visual Workbench so the Web Runner Console can show Runner, Planner, and Builder work status in a 2D visual dashboard.

**Architecture:** Add a pure TypeScript visual-state projector under `src/web/visual-state.ts`, expose replay state through `GET /api/sessions/:sessionId/visual-state`, and add a frontend Workbench tab that uses the replay API plus live SSE event projection. Keep Timeline, Execution, JSONL storage, and Hermes wrapper semantics unchanged.

**Tech Stack:** TypeScript, Node test runner, existing Node HTTP server, vanilla JavaScript, CSS.

---

## File Structure

- Create `src/web/visual-state.ts`: owns `VisualWorkbenchState` types, replay projection, live-state initialization, and event projection.
- Create `test/visual-state.test.ts`: unit tests for deterministic status transitions.
- Modify `src/web/types.ts`: exports the visual-state response type for web handlers.
- Modify `src/web/handlers.ts`: adds `getSessionVisualState`.
- Modify `src/web/server.ts`: routes `GET /api/sessions/:sessionId/visual-state`.
- Modify `test/web-handlers.test.ts`: tests handler-level visual-state response.
- Modify `test/web-server.test.ts`: tests HTTP route.
- Modify `test/frontend-static.test.ts`: static regression checks for Workbench UI and frontend helpers.
- Modify `public/index.html`: adds Timeline / Workbench tabs and the Workbench container.
- Modify `public/app.js`: adds frontend Workbench state, replay loading, live SSE projection, rendering, and tab switching.
- Modify `public/styles.css`: styles Workbench layout, cards, status badges, and responsive behavior.
- Modify `docs/PHASE_3B_LIVE_MONITOR_RUNBOOK.md`: adds a short Workbench verification note, because Phase 5 builds on live monitor behavior.
- Modify `docs/USER_GUIDE.md`: documents how to use the Workbench tab.
- Modify `CHANGELOG.md`, `package.json`, `package-lock.json`: release `v0.4.0`.

---

## Task 1: Visual State Domain Tests

**Files:**
- Create: `test/visual-state.test.ts`

- [ ] **Step 1: Write the failing unit tests**

Create `test/visual-state.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import type { WebSessionReplay } from "../src/web/types.js";
import type { LiveSessionEvent } from "../src/web/live-types.js";
import {
  applyLiveVisualEvent,
  createLiveVisualState,
  projectReplayVisualState
} from "../src/web/visual-state.js";

const agents = [
  { id: "hermes-a", name: "Hermes A", role: "planner" },
  { id: "hermes-b", name: "Hermes B", role: "builder" }
];

test("projectReplayVisualState marks completed agents and preserves latest activity summaries", () => {
  const replay: WebSessionReplay = {
    session: {
      sessionId: "session-1",
      topic: "Build MVP",
      agents,
      messages: [],
      status: "completed",
      maxRounds: 1,
      taskAssignments: [],
      executionResults: [],
      createdAt: "2026-05-14T00:00:00.000Z",
      updatedAt: "2026-05-14T00:00:04.000Z"
    },
    result: undefined,
    messages: [
      {
        id: "m1",
        sessionId: "session-1",
        sequence: 1,
        round: 1,
        senderId: "hermes-a",
        senderName: "Hermes A",
        senderRole: "planner",
        content: "Planner wrote a long planning summary for the build.",
        createdAt: "2026-05-14T00:00:01.000Z"
      },
      {
        id: "m2",
        sessionId: "session-1",
        sequence: 2,
        round: 1,
        senderId: "hermes-b",
        senderName: "Hermes B",
        senderRole: "builder",
        content: "Builder produced implementation actions.",
        createdAt: "2026-05-14T00:00:02.000Z"
      }
    ],
    actions: [
      {
        id: "a1",
        sessionId: "session-1",
        agentId: "hermes-b",
        messageId: "m2",
        type: "write_file",
        path: "docs/web.md",
        content: "hello",
        createdAt: "2026-05-14T00:00:03.000Z"
      }
    ],
    executionResults: [
      {
        id: "r1",
        actionId: "a1",
        sessionId: "session-1",
        agentId: "hermes-b",
        status: "succeeded",
        startedAt: "2026-05-14T00:00:03.000Z",
        completedAt: "2026-05-14T00:00:04.000Z",
        summary: "Wrote docs/web.md."
      }
    ],
    workspaceFiles: []
  };

  const state = projectReplayVisualState(replay);

  assert.equal(state.runner.status, "completed");
  assert.equal(state.agents.length, 2);
  assert.equal(state.agents[0]?.status, "completed");
  assert.equal(state.agents[0]?.lastMessagePreview, "Planner wrote a long planning summary for the build.");
  assert.equal(state.agents[1]?.status, "completed");
  assert.equal(state.agents[1]?.lastActionSummary, "write_file docs/web.md");
  assert.equal(state.agents[1]?.lastExecutionSummary, "succeeded: Wrote docs/web.md.");
});

test("applyLiveVisualEvent moves active speaker through thinking, speaking, executing, and completed", () => {
  let state = createLiveVisualState({
    sessionId: "session-1",
    topic: "Build MVP",
    agents,
    createdAt: "2026-05-14T00:00:00.000Z"
  });

  state = applyLiveVisualEvent(state, event("session.started", { status: "running" }, "2026-05-14T00:00:01.000Z"));
  assert.equal(state.runner.status, "running");

  state = applyLiveVisualEvent(state, event("speaker.active", {
    agentId: "hermes-a",
    agentName: "Hermes A",
    role: "planner",
    round: 1
  }, "2026-05-14T00:00:02.000Z"));
  assert.equal(state.agents.find((agent) => agent.agentId === "hermes-a")?.status, "thinking");

  state = applyLiveVisualEvent(state, event("message.appended", {
    message: {
      id: "m1",
      sessionId: "session-1",
      sequence: 1,
      round: 1,
      senderId: "hermes-a",
      senderName: "Hermes A",
      senderRole: "planner",
      content: "Planner response",
      createdAt: "2026-05-14T00:00:03.000Z"
    }
  }, "2026-05-14T00:00:03.000Z"));
  assert.equal(state.agents.find((agent) => agent.agentId === "hermes-a")?.status, "speaking");
  assert.equal(state.agents.find((agent) => agent.agentId === "hermes-a")?.lastMessagePreview, "Planner response");

  state = applyLiveVisualEvent(state, event("action.created", {
    action: {
      id: "a1",
      sessionId: "session-1",
      agentId: "hermes-a",
      messageId: "m1",
      type: "run_command",
      command: "ls",
      args: ["docs"],
      createdAt: "2026-05-14T00:00:04.000Z"
    }
  }, "2026-05-14T00:00:04.000Z"));
  assert.equal(state.agents.find((agent) => agent.agentId === "hermes-a")?.status, "executing");
  assert.equal(state.agents.find((agent) => agent.agentId === "hermes-a")?.lastActionSummary, "run_command ls docs");

  state = applyLiveVisualEvent(state, event("session.completed", { status: "completed" }, "2026-05-14T00:00:05.000Z"));
  assert.equal(state.runner.status, "completed");
  assert.equal(state.agents.find((agent) => agent.agentId === "hermes-a")?.status, "completed");
});

test("applyLiveVisualEvent marks failed execution result as failed", () => {
  let state = createLiveVisualState({
    sessionId: "session-1",
    topic: "Build MVP",
    agents,
    createdAt: "2026-05-14T00:00:00.000Z"
  });

  state = applyLiveVisualEvent(state, event("execution.result", {
    result: {
      id: "r1",
      actionId: "a1",
      sessionId: "session-1",
      agentId: "hermes-b",
      status: "failed",
      startedAt: "2026-05-14T00:00:01.000Z",
      completedAt: "2026-05-14T00:00:02.000Z",
      summary: "Command failed.",
      error: "exit code 1"
    }
  }, "2026-05-14T00:00:02.000Z"));

  const builder = state.agents.find((agent) => agent.agentId === "hermes-b");
  assert.equal(builder?.status, "failed");
  assert.equal(builder?.lastExecutionSummary, "failed: Command failed.");
});

function event<TType extends LiveSessionEvent["type"]>(
  type: TType,
  data: Extract<LiveSessionEvent, { type: TType }>["data"],
  createdAt: string
): LiveSessionEvent {
  return {
    id: `${type}-${createdAt}`,
    sessionId: "session-1",
    type,
    createdAt,
    data
  } as LiveSessionEvent;
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
export PATH=/home/haha/.local/node/node-v22.22.2-linux-x64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
npm run build
node --test dist/test/visual-state.test.js
```

Expected:

```text
Cannot find module '../src/web/visual-state.js'
```

- [ ] **Step 3: Commit the failing tests**

```bash
git add test/visual-state.test.ts
git commit -m add-visual-state-domain-tests
```

---

## Task 2: Visual State Projector

**Files:**
- Create: `src/web/visual-state.ts`
- Modify: `src/web/types.ts`

- [ ] **Step 1: Add visual state types to `src/web/types.ts`**

Add these exports before `export type WebDefaultConfig = DiscussionRunnerConfig;`:

```ts
export type AgentVisualStatus =
  | "idle"
  | "thinking"
  | "speaking"
  | "executing"
  | "reviewing"
  | "completed"
  | "failed";

export interface AgentVisualState {
  agentId: string;
  name: string;
  role?: string;
  status: AgentVisualStatus;
  currentActivity: string;
  lastMessagePreview?: string;
  lastActionSummary?: string;
  lastExecutionSummary?: string;
  updatedAt: string;
}

export interface RunnerVisualState {
  status: "idle" | "queued" | "running" | "completed" | "failed";
  currentActivity: string;
  updatedAt?: string;
}

export interface VisualWorkbenchState {
  sessionId: string;
  topic: string;
  runner: RunnerVisualState;
  agents: AgentVisualState[];
}
```

- [ ] **Step 2: Implement `src/web/visual-state.ts`**

Create `src/web/visual-state.ts`:

```ts
import type {
  DiscussionMessage,
  DiscussionSession,
  ExecutionAction,
  ExecutionResult
} from "../types.js";
import type { LiveSessionEvent } from "./live-types.js";
import type {
  AgentVisualState,
  RunnerVisualState,
  VisualWorkbenchState,
  WebSessionReplay
} from "./types.js";

export interface CreateLiveVisualStateInput {
  sessionId: string;
  topic: string;
  agents: DiscussionSession["agents"];
  createdAt?: string;
}

export function createLiveVisualState(input: CreateLiveVisualStateInput): VisualWorkbenchState {
  const createdAt = input.createdAt ?? new Date().toISOString();
  return {
    sessionId: input.sessionId,
    topic: input.topic,
    runner: {
      status: "queued",
      currentActivity: "Session queued",
      updatedAt: createdAt
    },
    agents: input.agents.map((agent) => ({
      agentId: agent.id,
      name: agent.name,
      role: agent.role,
      status: "idle",
      currentActivity: "Waiting for runner",
      updatedAt: createdAt
    }))
  };
}

export function projectReplayVisualState(replay: WebSessionReplay): VisualWorkbenchState {
  let state = createLiveVisualState({
    sessionId: replay.session.sessionId,
    topic: replay.session.topic,
    agents: replay.session.agents,
    createdAt: replay.session.createdAt
  });

  state = {
    ...state,
    runner: runnerFromSession(replay.session)
  };

  for (const message of replay.messages) {
    state = applyMessage(state, message, message.createdAt);
  }

  for (const action of replay.actions) {
    state = applyAction(state, action, action.createdAt);
  }

  for (const result of replay.executionResults) {
    state = applyExecutionResult(state, result, result.completedAt);
  }

  if (replay.session.status === "completed") {
    return completeState(state, replay.session.updatedAt);
  }

  if (replay.session.status === "failed") {
    return failState(state, "Session failed", replay.session.updatedAt);
  }

  return state;
}

export function applyLiveVisualEvent(
  state: VisualWorkbenchState,
  event: LiveSessionEvent
): VisualWorkbenchState {
  switch (event.type) {
    case "session.queued":
      return {
        ...state,
        runner: {
          status: "queued",
          currentActivity: "Session queued",
          updatedAt: event.createdAt
        }
      };
    case "session.started":
      return {
        ...state,
        runner: {
          status: "running",
          currentActivity: "Coordinating session",
          updatedAt: event.createdAt
        },
        agents: state.agents.map((agent) =>
          terminalAgent(agent) ? agent : {
            ...agent,
            status: "idle",
            currentActivity: "Waiting for turn",
            updatedAt: event.createdAt
          }
        )
      };
    case "speaker.active":
      return {
        ...state,
        runner: {
          status: "running",
          currentActivity: `${event.data.agentName ?? event.data.agentId} is active`,
          updatedAt: event.createdAt
        },
        agents: state.agents.map((agent) => {
          if (agent.agentId === event.data.agentId) {
            return {
              ...agent,
              name: event.data.agentName ?? agent.name,
              role: event.data.role ?? agent.role,
              status: "thinking",
              currentActivity: `Round ${event.data.round}: preparing response`,
              updatedAt: event.createdAt
            };
          }
          return terminalAgent(agent) ? agent : {
            ...agent,
            status: "idle",
            currentActivity: "Waiting for turn",
            updatedAt: event.createdAt
          };
        })
      };
    case "message.appended":
      return applyMessage(state, event.data.message, event.createdAt);
    case "action.created":
      return applyAction(state, event.data.action, event.createdAt);
    case "execution.result":
      return applyExecutionResult(state, event.data.result, event.createdAt);
    case "session.completed":
      return completeState(state, event.createdAt);
    case "session.failed":
      return failState(state, event.data.error ?? "Session failed", event.createdAt);
  }
}

function runnerFromSession(session: DiscussionSession): RunnerVisualState {
  switch (session.status) {
    case "completed":
      return {
        status: "completed",
        currentActivity: "Session completed",
        updatedAt: session.updatedAt
      };
    case "failed":
      return {
        status: "failed",
        currentActivity: "Session failed",
        updatedAt: session.updatedAt
      };
    default:
      return {
        status: "running",
        currentActivity: "Session in progress",
        updatedAt: session.updatedAt
      };
  }
}

function applyMessage(
  state: VisualWorkbenchState,
  message: DiscussionMessage,
  updatedAt: string
): VisualWorkbenchState {
  return {
    ...state,
    runner: {
      status: state.runner.status === "queued" ? "running" : state.runner.status,
      currentActivity: `${message.senderName} responded`,
      updatedAt
    },
    agents: state.agents.map((agent) =>
      agent.agentId === message.senderId
        ? {
            ...agent,
            name: message.senderName,
            role: message.senderRole ?? agent.role,
            status: "speaking",
            currentActivity: `Round ${message.round}: shared response`,
            lastMessagePreview: preview(message.content),
            updatedAt
          }
        : agent
    )
  };
}

function applyAction(
  state: VisualWorkbenchState,
  action: ExecutionAction,
  updatedAt: string
): VisualWorkbenchState {
  return {
    ...state,
    runner: {
      status: state.runner.status === "queued" ? "running" : state.runner.status,
      currentActivity: `${action.agentId} created action`,
      updatedAt
    },
    agents: state.agents.map((agent) =>
      agent.agentId === action.agentId
        ? {
            ...agent,
            status: "executing",
            currentActivity: "Executing workspace action",
            lastActionSummary: summarizeAction(action),
            updatedAt
          }
        : agent
    )
  };
}

function applyExecutionResult(
  state: VisualWorkbenchState,
  result: ExecutionResult,
  updatedAt: string
): VisualWorkbenchState {
  const status = result.status === "failed" ? "failed" : "reviewing";
  return {
    ...state,
    runner: {
      status: state.runner.status === "queued" ? "running" : state.runner.status,
      currentActivity: `${result.agentId} execution ${result.status}`,
      updatedAt
    },
    agents: state.agents.map((agent) =>
      agent.agentId === result.agentId
        ? {
            ...agent,
            status,
            currentActivity: result.status === "failed" ? "Execution failed" : "Reviewing execution result",
            lastExecutionSummary: `${result.status}: ${result.summary}`,
            updatedAt
          }
        : agent
    )
  };
}

function completeState(state: VisualWorkbenchState, updatedAt: string): VisualWorkbenchState {
  return {
    ...state,
    runner: {
      status: "completed",
      currentActivity: "Session completed",
      updatedAt
    },
    agents: state.agents.map((agent) =>
      agent.status === "failed"
        ? agent
        : {
            ...agent,
            status: "completed",
            currentActivity: "Session completed",
            updatedAt
          }
    )
  };
}

function failState(
  state: VisualWorkbenchState,
  reason: string,
  updatedAt: string
): VisualWorkbenchState {
  return {
    ...state,
    runner: {
      status: "failed",
      currentActivity: reason,
      updatedAt
    },
    agents: state.agents.map((agent) =>
      agent.status === "completed"
        ? agent
        : {
            ...agent,
            status: "failed",
            currentActivity: reason,
            updatedAt
          }
    )
  };
}

function terminalAgent(agent: AgentVisualState): boolean {
  return agent.status === "completed" || agent.status === "failed";
}

function summarizeAction(action: ExecutionAction): string {
  if (action.type === "run_command") {
    return [action.type, action.command, ...(action.args ?? [])].filter(Boolean).join(" ");
  }
  return [action.type, action.path].filter(Boolean).join(" ");
}

function preview(value: string): string {
  const normalized = value.trim();
  if (normalized.length <= 180) {
    return normalized;
  }
  return `${normalized.slice(0, 180).trimEnd()}...`;
}
```

- [ ] **Step 3: Run unit tests**

Run:

```bash
export PATH=/home/haha/.local/node/node-v22.22.2-linux-x64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
npm run build
node --test dist/test/visual-state.test.js
```

Expected:

```text
# pass 3
# fail 0
```

- [ ] **Step 4: Commit projector implementation**

```bash
git add src/web/visual-state.ts src/web/types.ts
git commit -m add-visual-state-projector
```

---

## Task 3: Visual State Web API

**Files:**
- Modify: `src/web/handlers.ts`
- Modify: `src/web/server.ts`
- Modify: `test/web-handlers.test.ts`
- Modify: `test/web-server.test.ts`

- [ ] **Step 1: Add handler test**

Append this test to `test/web-handlers.test.ts`:

```ts
test("getSessionVisualState returns projected runner and agent state", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "web-visual-handler-sessions-"));
  const workspaceRootDir = await mkdtemp(join(tmpdir(), "web-visual-handler-workspaces-"));
  const result = await runSessionFromWebRequest({
    rootDir,
    workspaceRootDir,
    request: {
      topic: "visual handler",
      maxRounds: 1,
      enableExecution: false,
      agents: [
        { id: "hermes-a", name: "Hermes A", role: "planner", type: "http", url: "http://mock.local/a" },
        { id: "hermes-b", name: "Hermes B", role: "builder", type: "http", url: "http://mock.local/b" }
      ]
    },
    agentFactory: (agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      async respond() {
        return { content: `${agent.name} visual response` };
      }
    })
  });

  const visualState = await getSessionVisualState({
    rootDir,
    workspaceRootDir,
    sessionId: result.sessionId
  });

  assert.equal(visualState.sessionId, result.sessionId);
  assert.equal(visualState.runner.status, "completed");
  assert.equal(visualState.agents.length, 2);
  assert.equal(visualState.agents[0]?.status, "completed");
  assert.match(visualState.agents[0]?.lastMessagePreview ?? "", /visual response/);
});
```

Update the import list at the top of `test/web-handlers.test.ts` to include `getSessionVisualState`:

```ts
import {
  checkAgentHealth,
  createLiveSessionJob,
  deriveHealthUrl,
  getDefaultConfig,
  getSessionReplay,
  getSessionVisualState,
  listSessionSummaries,
  runSessionFromWebRequest
} from "../src/web/handlers.js";
```

- [ ] **Step 2: Run handler test to verify failure**

Run:

```bash
export PATH=/home/haha/.local/node/node-v22.22.2-linux-x64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
npm run build
```

Expected:

```text
Module '"../src/web/handlers.js"' has no exported member 'getSessionVisualState'
```

- [ ] **Step 3: Add `getSessionVisualState` handler**

In `src/web/handlers.ts`, add the import:

```ts
import { projectReplayVisualState } from "./visual-state.js";
```

Add this function after `getSessionReplay`:

```ts
export async function getSessionVisualState(
  options: WebHandlerOptions & { sessionId: string }
): Promise<VisualWorkbenchState> {
  const replay = await readSessionReplay(options);
  return projectReplayVisualState(replay);
}
```

Add `VisualWorkbenchState` to the type import from `./types.js`:

```ts
  VisualWorkbenchState,
```

- [ ] **Step 4: Run handler tests**

Run:

```bash
export PATH=/home/haha/.local/node/node-v22.22.2-linux-x64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
npm run build
node --test dist/test/web-handlers.test.js
```

Expected:

```text
# fail 0
```

- [ ] **Step 5: Add server route test**

Append this test to `test/web-server.test.ts`:

```ts
test("web server serves visual state for a replay session", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "web-visual-server-sessions-"));
  const workspaceRootDir = await mkdtemp(join(tmpdir(), "web-visual-server-workspaces-"));
  const server = createWebServer({
    rootDir,
    workspaceRootDir,
    publicDir: "public",
    agentFactory: (agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      async respond() {
        return { content: `${agent.id} visual` };
      }
    })
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  try {
    const jobResponse = await fetch(`http://127.0.0.1:${port}/api/sessions/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        topic: "server visual",
        maxRounds: 1,
        enableExecution: false,
        agents: [
          { id: "hermes-a", name: "Hermes A", role: "planner", type: "http", url: "http://mock.local/a" },
          { id: "hermes-b", name: "Hermes B", role: "builder", type: "http", url: "http://mock.local/b" }
        ]
      })
    });
    const job = await jobResponse.json() as { sessionId: string };
    const visualResponse = await fetch(`http://127.0.0.1:${port}/api/sessions/${job.sessionId}/visual-state`);
    const body = await visualResponse.json() as { runner: { status: string }; agents: unknown[] };

    assert.equal(visualResponse.status, 200);
    assert.equal(body.runner.status, "completed");
    assert.equal(body.agents.length, 2);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
```

- [ ] **Step 6: Add server route**

In `src/web/server.ts`, add `getSessionVisualState` to the handler import:

```ts
  getSessionReplay,
  getSessionVisualState,
```

Add this route before the existing replay route:

```ts
      const visualStateMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/visual-state$/);
      if (req.method === "GET" && visualStateMatch?.[1]) {
        await sendJson(res, 200, await getSessionVisualState({
          rootDir: options.rootDir,
          workspaceRootDir: options.workspaceRootDir,
          sessionId: visualStateMatch[1]
        }));
        return;
      }
```

- [ ] **Step 7: Run web tests**

Run:

```bash
export PATH=/home/haha/.local/node/node-v22.22.2-linux-x64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
npm run build
node --test dist/test/web-handlers.test.js dist/test/web-server.test.js
```

Expected:

```text
# fail 0
```

- [ ] **Step 8: Commit API implementation**

```bash
git add src/web/handlers.ts src/web/server.ts test/web-handlers.test.ts test/web-server.test.ts
git commit -m add-visual-state-web-api
```

---

## Task 4: Frontend Static Tests

**Files:**
- Modify: `test/frontend-static.test.ts`

- [ ] **Step 1: Add Workbench static regression test**

Append this test to `test/frontend-static.test.ts`:

```ts
test("frontend exposes agent visual workbench UI and helpers", async () => {
  const app = await readFile("public/app.js", "utf8");
  const html = await readFile("public/index.html", "utf8");
  const css = await readFile("public/styles.css", "utf8");

  assert.match(html, /workbenchTab/);
  assert.match(html, /workbenchPanel/);
  assert.match(html, /Agent Visual Workbench/);
  assert.match(app, /function renderWorkbench/);
  assert.match(app, /function loadWorkbench/);
  assert.match(app, /function createFrontendLiveWorkbenchState/);
  assert.match(app, /function applyFrontendVisualEvent/);
  assert.match(app, /\/api\/sessions\/\$\{encodeURIComponent\(sessionId\)\}\/visual-state/);
  assert.match(css, /workbench-grid/);
  assert.match(css, /agent-visual-card/);
  assert.match(css, /status-executing/);
});
```

- [ ] **Step 2: Run frontend static test to verify failure**

Run:

```bash
export PATH=/home/haha/.local/node/node-v22.22.2-linux-x64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
npm run build
node --test dist/test/frontend-static.test.js
```

Expected:

```text
not ok - frontend exposes agent visual workbench UI and helpers
```

- [ ] **Step 3: Commit failing frontend test**

```bash
git add test/frontend-static.test.ts
git commit -m add-workbench-static-ui-test
```

---

## Task 5: Workbench UI Shell

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/styles.css`

- [ ] **Step 1: Add Timeline / Workbench tabs and panel markup**

In `public/index.html`, replace this block:

```html
          <div class="timeline-panel">
            <div class="section-heading">
              <h2>Meeting Timeline</h2>
              <div class="timeline-toolbar" aria-label="Timeline controls">
                <button id="collapseAllButton" type="button" class="secondary compact">Collapse all</button>
                <button id="expandAllButton" type="button" class="secondary compact">Expand all</button>
                <button id="latestButton" type="button" class="secondary compact">Latest</button>
              </div>
            </div>
            <div id="timeline" class="timeline timeline-scroll"></div>
          </div>
```

With:

```html
          <div class="activity-panel">
            <div class="view-tabs" role="tablist" aria-label="Session views">
              <button id="timelineTab" type="button" class="view-tab selected" aria-controls="timelinePanel">Timeline</button>
              <button id="workbenchTab" type="button" class="view-tab" aria-controls="workbenchPanel">Workbench</button>
            </div>
            <div id="timelinePanel" class="timeline-panel">
              <div class="section-heading">
                <h2>Meeting Timeline</h2>
                <div class="timeline-toolbar" aria-label="Timeline controls">
                  <button id="collapseAllButton" type="button" class="secondary compact">Collapse all</button>
                  <button id="expandAllButton" type="button" class="secondary compact">Expand all</button>
                  <button id="latestButton" type="button" class="secondary compact">Latest</button>
                </div>
              </div>
              <div id="timeline" class="timeline timeline-scroll"></div>
            </div>
            <div id="workbenchPanel" class="workbench-panel hidden-view">
              <div class="section-heading">
                <h2>Agent Visual Workbench</h2>
              </div>
              <div id="workbench" class="workbench-grid"></div>
            </div>
          </div>
```

- [ ] **Step 2: Add frontend state keys and tab listeners**

Update `state` in `public/app.js`:

```js
const state = {
  defaultConfig: undefined,
  selectedSessionId: undefined,
  liveSource: undefined,
  liveEventCount: 0,
  timelineMessages: [],
  expandedMessages: new Set(),
  workbench: undefined,
  activeView: "timeline"
};
```

Add these listeners in the `DOMContentLoaded` callback after the existing toolbar listeners:

```js
    $("timelineTab").addEventListener("click", () => setActiveView("timeline"));
    $("workbenchTab").addEventListener("click", () => setActiveView("workbench"));
```

- [ ] **Step 3: Add static Workbench rendering helpers**

Add these functions before `renderExecution(replay)`:

```js
async function loadWorkbench(sessionId) {
  state.workbench = await fetchJson(`/api/sessions/${encodeURIComponent(sessionId)}/visual-state`);
  renderWorkbench();
}

function renderWorkbench() {
  const container = $("workbench");
  if (!state.workbench) {
    container.innerHTML = `<p class="empty">Select or run a session to see workbench state.</p>`;
    return;
  }

  const runner = state.workbench.runner;
  container.innerHTML = `
    <article class="runner-visual-card status-${escapeAttribute(runner.status)}">
      <div>
        <span class="visual-label">Runner</span>
        <strong>${escapeHtml(runner.status)}</strong>
      </div>
      <p>${escapeHtml(runner.currentActivity)}</p>
      ${runner.updatedAt ? `<small>${escapeHtml(formatSessionTime(runner.updatedAt))}</small>` : ""}
    </article>
    ${state.workbench.agents.map(renderAgentVisualCard).join("")}
  `;
}

function renderAgentVisualCard(agent) {
  return `
    <article class="agent-visual-card status-${escapeAttribute(agent.status)}">
      <header>
        <div class="agent-avatar">${escapeHtml(getInitials(agent.name))}</div>
        <div>
          <strong>${escapeHtml(agent.name)}</strong>
          <span>${escapeHtml(agent.role ?? "agent")}</span>
        </div>
      </header>
      <div class="visual-status-row">
        <span class="visual-status-dot"></span>
        <strong>${escapeHtml(agent.status)}</strong>
      </div>
      <p>${escapeHtml(agent.currentActivity)}</p>
      ${agent.lastMessagePreview ? `<small>Message: ${escapeHtml(agent.lastMessagePreview)}</small>` : ""}
      ${agent.lastActionSummary ? `<small>Action: ${escapeHtml(agent.lastActionSummary)}</small>` : ""}
      ${agent.lastExecutionSummary ? `<small>Result: ${escapeHtml(agent.lastExecutionSummary)}</small>` : ""}
      <time>${escapeHtml(formatSessionTime(agent.updatedAt))}</time>
    </article>
  `;
}

function getInitials(value) {
  return String(value)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "H";
}

function setActiveView(view) {
  state.activeView = view;
  $("timelineTab").classList.toggle("selected", view === "timeline");
  $("workbenchTab").classList.toggle("selected", view === "workbench");
  $("timelinePanel").classList.toggle("hidden-view", view !== "timeline");
  $("workbenchPanel").classList.toggle("hidden-view", view !== "workbench");
}
```

- [ ] **Step 4: Wire replay loading**

In `loadReplay(sessionId)`, after `renderWorkspaceFiles(replay.workspaceFiles);`, add:

```js
  await loadWorkbench(sessionId);
```

- [ ] **Step 5: Reset Workbench on clear**

In `resetLiveView()`, after `state.expandedMessages.clear();`, add:

```js
  state.workbench = undefined;
```

After clearing `summary`, add:

```js
  renderWorkbench();
```

- [ ] **Step 6: Add Workbench CSS**

Add this CSS after `.content-grid` rules:

```css
.activity-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-height: 0;
}

.view-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
}

.view-tab {
  background: #e7ebf3;
  color: #243047;
}

.view-tab.selected {
  background: #2454d6;
  color: #ffffff;
}

.hidden-view {
  display: none !important;
}

.workbench-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-height: 0;
}

.workbench-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(220px, 1fr));
  gap: 12px;
  align-content: start;
  max-height: calc(100vh - 330px);
  overflow: auto;
  padding-right: 4px;
}

.runner-visual-card,
.agent-visual-card {
  background: #ffffff;
  border: 1px solid #d8dee8;
  border-radius: 6px;
  padding: 14px;
}

.runner-visual-card {
  grid-column: 1 / -1;
  border-left: 4px solid #2454d6;
}

.agent-visual-card header {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
}

.agent-visual-card header span,
.visual-label,
.agent-visual-card small,
.agent-visual-card time {
  display: block;
  color: #697386;
  font-size: 12px;
}

.agent-avatar {
  display: inline-grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #eef2f8;
  color: #243047;
  font-weight: 800;
}

.visual-status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.visual-status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #697386;
}

.status-thinking { border-left: 4px solid #2f6fed; }
.status-speaking { border-left: 4px solid #179c8d; }
.status-executing { border-left: 4px solid #c47a1f; }
.status-reviewing { border-left: 4px solid #7c4dce; }
.status-completed { border-left: 4px solid #1f9d55; }
.status-failed { border-left: 4px solid #d64545; }

.status-thinking .visual-status-dot,
.status-executing .visual-status-dot {
  animation: status-pulse 1.2s ease-in-out infinite;
}

@keyframes status-pulse {
  0%, 100% { opacity: 0.45; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1); }
}
```

Inside the existing mobile media query, add:

```css
  .workbench-grid {
    grid-template-columns: 1fr;
    max-height: 65vh;
  }
```

- [ ] **Step 7: Run frontend static test**

Run:

```bash
export PATH=/home/haha/.local/node/node-v22.22.2-linux-x64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
node --check public/app.js
npm run build
node --test dist/test/frontend-static.test.js
```

Expected:

```text
# fail 0
```

- [ ] **Step 8: Commit Workbench UI shell**

```bash
git add public/index.html public/app.js public/styles.css
git commit -m add-workbench-ui-shell
```

---

## Task 6: Live Workbench Updates

**Files:**
- Modify: `public/app.js`

- [ ] **Step 1: Initialize live Workbench state when creating a job**

In `runSession(event)`, after `state.selectedSessionId = result.sessionId;`, add:

```js
    state.workbench = createFrontendLiveWorkbenchState(result.sessionId, request);
    renderWorkbench();
```

- [ ] **Step 2: Apply live events inside `handleLiveEvent`**

At the start of `handleLiveEvent(sessionId, event)`, after the session-id guard, add:

```js
  if (state.workbench) {
    state.workbench = applyFrontendVisualEvent(state.workbench, event);
    renderWorkbench();
  }
```

- [ ] **Step 3: Add frontend live projection helpers**

Add these functions before `loadWorkbench(sessionId)`:

```js
function createFrontendLiveWorkbenchState(sessionId, request) {
  const now = new Date().toISOString();
  return {
    sessionId,
    topic: request.topic,
    runner: {
      status: "queued",
      currentActivity: "Session queued",
      updatedAt: now
    },
    agents: request.agents.map((agent) => ({
      agentId: agent.id,
      name: agent.name,
      role: agent.role,
      status: "idle",
      currentActivity: "Waiting for runner",
      updatedAt: now
    }))
  };
}

function applyFrontendVisualEvent(workbench, event) {
  switch (event.type) {
    case "session.queued":
      return {
        ...workbench,
        runner: { status: "queued", currentActivity: "Session queued", updatedAt: event.createdAt }
      };
    case "session.started":
      return {
        ...workbench,
        runner: { status: "running", currentActivity: "Coordinating session", updatedAt: event.createdAt },
        agents: workbench.agents.map((agent) => terminalVisualAgent(agent) ? agent : {
          ...agent,
          status: "idle",
          currentActivity: "Waiting for turn",
          updatedAt: event.createdAt
        })
      };
    case "speaker.active":
      return {
        ...workbench,
        runner: {
          status: "running",
          currentActivity: `${event.data.agentName ?? event.data.agentId} is active`,
          updatedAt: event.createdAt
        },
        agents: workbench.agents.map((agent) => {
          if (agent.agentId === event.data.agentId) {
            return {
              ...agent,
              name: event.data.agentName ?? agent.name,
              role: event.data.role ?? agent.role,
              status: "thinking",
              currentActivity: `Round ${event.data.round}: preparing response`,
              updatedAt: event.createdAt
            };
          }
          return terminalVisualAgent(agent) ? agent : {
            ...agent,
            status: "idle",
            currentActivity: "Waiting for turn",
            updatedAt: event.createdAt
          };
        })
      };
    case "message.appended":
      return applyFrontendMessage(workbench, event.data.message, event.createdAt);
    case "action.created":
      return applyFrontendAction(workbench, event.data.action, event.createdAt);
    case "execution.result":
      return applyFrontendExecutionResult(workbench, event.data.result, event.createdAt);
    case "session.completed":
      return {
        ...workbench,
        runner: { status: "completed", currentActivity: "Session completed", updatedAt: event.createdAt },
        agents: workbench.agents.map((agent) => agent.status === "failed" ? agent : {
          ...agent,
          status: "completed",
          currentActivity: "Session completed",
          updatedAt: event.createdAt
        })
      };
    case "session.failed":
      return {
        ...workbench,
        runner: { status: "failed", currentActivity: event.data.error ?? "Session failed", updatedAt: event.createdAt },
        agents: workbench.agents.map((agent) => agent.status === "completed" ? agent : {
          ...agent,
          status: "failed",
          currentActivity: event.data.error ?? "Session failed",
          updatedAt: event.createdAt
        })
      };
    default:
      return workbench;
  }
}

function applyFrontendMessage(workbench, message, updatedAt) {
  return {
    ...workbench,
    runner: {
      status: workbench.runner.status === "queued" ? "running" : workbench.runner.status,
      currentActivity: `${message.senderName} responded`,
      updatedAt
    },
    agents: workbench.agents.map((agent) => agent.agentId === message.senderId ? {
      ...agent,
      name: message.senderName,
      role: message.senderRole ?? agent.role,
      status: "speaking",
      currentActivity: `Round ${message.round}: shared response`,
      lastMessagePreview: getShortPreview(message.content, 180),
      updatedAt
    } : agent)
  };
}

function applyFrontendAction(workbench, action, updatedAt) {
  return {
    ...workbench,
    runner: {
      status: workbench.runner.status === "queued" ? "running" : workbench.runner.status,
      currentActivity: `${action.agentId} created action`,
      updatedAt
    },
    agents: workbench.agents.map((agent) => agent.agentId === action.agentId ? {
      ...agent,
      status: "executing",
      currentActivity: "Executing workspace action",
      lastActionSummary: summarizeFrontendAction(action),
      updatedAt
    } : agent)
  };
}

function applyFrontendExecutionResult(workbench, result, updatedAt) {
  return {
    ...workbench,
    runner: {
      status: workbench.runner.status === "queued" ? "running" : workbench.runner.status,
      currentActivity: `${result.agentId} execution ${result.status}`,
      updatedAt
    },
    agents: workbench.agents.map((agent) => agent.agentId === result.agentId ? {
      ...agent,
      status: result.status === "failed" ? "failed" : "reviewing",
      currentActivity: result.status === "failed" ? "Execution failed" : "Reviewing execution result",
      lastExecutionSummary: `${result.status}: ${result.summary}`,
      updatedAt
    } : agent)
  };
}

function summarizeFrontendAction(action) {
  if (action.type === "run_command") {
    return [action.type, action.command, ...(action.args ?? [])].filter(Boolean).join(" ");
  }
  return [action.type, action.path].filter(Boolean).join(" ");
}

function terminalVisualAgent(agent) {
  return agent.status === "completed" || agent.status === "failed";
}

function getShortPreview(value, maxLength) {
  const normalized = String(value ?? "").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}
```

- [ ] **Step 4: Keep existing message preview behavior**

Update `getMessagePreview(content)` to call the shared preview helper:

```js
function getMessagePreview(content) {
  return getShortPreview(content, 520);
}
```

- [ ] **Step 5: Run frontend and full tests**

Run:

```bash
export PATH=/home/haha/.local/node/node-v22.22.2-linux-x64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
node --check public/app.js
npm test
```

Expected:

```text
# fail 0
```

- [ ] **Step 6: Commit live frontend updates**

```bash
git add public/app.js
git commit -m add-live-workbench-updates
```

---

## Task 7: Documentation

**Files:**
- Modify: `docs/USER_GUIDE.md`
- Modify: `docs/PHASE_3B_LIVE_MONITOR_RUNBOOK.md`

- [ ] **Step 1: Update user guide**

Add this section to `docs/USER_GUIDE.md` after the Web console section:

```md
## Agent Visual Workbench

The Web Runner Console includes a `Workbench` view for observing the session without reading the full timeline.

Use it when you want to quickly answer:

- Is the runner still coordinating the session?
- Which Hermes agent is currently active?
- Did Planner or Builder recently speak?
- Is an agent executing an action?
- Did the session complete or fail?

Steps:

1. Start the Web Runner Console with `npm run web`.
2. Open the console in a browser.
3. Run a session or select an existing session from `Sessions`.
4. Select the `Workbench` tab next to `Timeline`.
5. Review the Runner, Planner, and Builder cards.

The Workbench is a visual projection of the same session records and live events used by Timeline. It does not change Hermes behavior or write new workspace files.
```

- [ ] **Step 2: Update live monitor runbook**

Add this verification step to `docs/PHASE_3B_LIVE_MONITOR_RUNBOOK.md` near the existing browser verification steps:

```md
### Agent Visual Workbench Check

After selecting or running a session:

1. Click `Workbench`.
2. Confirm the Runner card has a non-empty status.
3. Confirm Planner and Builder cards are visible.
4. During a live run, confirm the active agent moves through visible states such as `thinking`, `speaking`, `executing`, or `completed`.
5. Click `Timeline` and confirm the original message timeline still renders.
```

- [ ] **Step 3: Commit docs**

```bash
git add docs/USER_GUIDE.md docs/PHASE_3B_LIVE_MONITOR_RUNBOOK.md
git commit -m document-phase-5-workbench
```

---

## Task 8: Browser Smoke Verification

**Files:**
- No source changes unless the smoke test exposes a defect.

- [ ] **Step 1: Run full test suite**

Run:

```bash
export PATH=/home/haha/.local/node/node-v22.22.2-linux-x64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
node --check public/app.js
npm test
```

Expected:

```text
# fail 0
```

- [ ] **Step 2: Start local Web Runner Console**

Run:

```bash
export PATH=/home/haha/.local/node/node-v22.22.2-linux-x64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
PORT=3000 npm run web
```

Expected:

```text
Web runner console listening on http://0.0.0.0:3000
```

- [ ] **Step 3: Browser smoke**

Open:

```text
http://127.0.0.1:3000
```

Verify:

- `Timeline` and `Workbench` tabs are visible.
- Selecting an existing session renders Timeline.
- Clicking `Workbench` renders Runner plus at least two agent cards.
- Planner and Builder cards show non-empty status text.
- Clicking back to `Timeline` preserves existing timeline behavior.

- [ ] **Step 4: Stop local Web Runner Console**

Stop the server process from the terminal that started it.

---

## Task 9: Release v0.4.0

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Bump package version**

Run:

```bash
export PATH=/home/haha/.local/node/node-v22.22.2-linux-x64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
npm version 0.4.0 --no-git-tag-version
```

Expected:

```text
v0.4.0
```

- [ ] **Step 2: Update changelog**

Add this section at the top of `CHANGELOG.md`:

```md
## v0.4.0 - Agent Visual Workbench

Released: 2026-05-14

### Added

- Added a deterministic visual-state projector for runner, planner, and builder status.
- Added `GET /api/sessions/:sessionId/visual-state` for replay Workbench state.
- Added a Web Runner Console `Workbench` view with Runner and agent visual cards.
- Added live Workbench updates driven by existing SSE session events.
- Added tests for domain projection, web API behavior, frontend static contracts, and server routing.

### Changed

- Kept Timeline and Execution behavior intact while adding Workbench as a separate view.
- Preserved UTC persistence and existing session JSONL formats.
```

- [ ] **Step 3: Run final verification**

Run:

```bash
export PATH=/home/haha/.local/node/node-v22.22.2-linux-x64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
git diff --check
node --check public/app.js
npm test
```

Expected:

```text
# fail 0
```

- [ ] **Step 4: Commit release**

```bash
git add CHANGELOG.md package.json package-lock.json
git commit -m release-v0.4.0-agent-visual-workbench
```

- [ ] **Step 5: Merge to main and tag**

Run:

```bash
git switch main
git merge --no-ff feature/phase-5-agent-visual-workbench -m merge-phase-5-agent-visual-workbench
git tag v0.4.0
git push origin main
git push origin v0.4.0
```

- [ ] **Step 6: Verify remote**

Run:

```bash
git status --short --branch
git ls-remote --heads origin main
git ls-remote --tags origin v0.4.0
```

Expected:

```text
## main...origin/main
refs/heads/main points at the merge commit
refs/tags/v0.4.0 points at the same merge commit
```
