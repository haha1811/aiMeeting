# Phase 3A Web Runner Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runner-hosted Web console that can start a Hermes execution session from a browser form and replay messages, actions, execution results, assignments, and workspace files.

**Architecture:** Add a small Node built-in `http` server under `src/web/` and static frontend assets under `public/`. The server reuses existing `DiscussionService`, `createHermesAgentFromConfig`, and `JsonlDiscussionStore`; Phase 3A is synchronous run-and-replay, with Live/SSE left for Phase 3B.

**Tech Stack:** TypeScript, Node built-in `http`, Node test runner, native browser HTML/CSS/JavaScript, existing JSONL persistence.

---

## File Structure

- Create `src/web/types.ts`: Web API request/response types and constants shared by handlers and tests.
- Create `src/web/validation.ts`: request validation, URL validation, sessionId guard.
- Create `src/web/session-reader.ts`: read existing sessions, JSONL files, result files, and workspace file lists.
- Create `src/web/handlers.ts`: API handlers as testable functions that do not own the HTTP server.
- Create `src/web/server.ts`: HTTP routing, static file serving, JSON helpers, server startup.
- Create `public/index.html`: single-page operational dashboard shell.
- Create `public/app.js`: browser behavior for defaults, run session, list sessions, load replay.
- Create `public/styles.css`: dashboard styling.
- Modify `package.json`: add `web` script.
- Modify `README.md`: add Web console usage.
- Test `test/web-validation.test.ts`: validation and path guard tests.
- Test `test/web-session-reader.test.ts`: replay and workspace listing tests.
- Test `test/web-handlers.test.ts`: API handler integration with mock agents.

## Task 1: Web API Types and Validation

**Files:**
- Create: `src/web/types.ts`
- Create: `src/web/validation.ts`
- Create: `test/web-validation.test.ts`

- [ ] **Step 1: Write validation tests**

Create `test/web-validation.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  assertSafeSessionId,
  validateRunSessionRequest
} from "../src/web/validation.js";

test("validateRunSessionRequest rejects empty topic", () => {
  assert.throws(
    () => validateRunSessionRequest({
      topic: "",
      maxRounds: 2,
      enableExecution: true,
      agents: [
        { id: "hermes-a", name: "Hermes A", role: "planner", type: "http", url: "http://10.0.0.1:4101/respond" },
        { id: "hermes-b", name: "Hermes B", role: "builder", type: "http", url: "http://10.0.0.2:4102/respond" }
      ]
    }),
    /topic must be a non-empty string/
  );
});

test("validateRunSessionRequest rejects invalid maxRounds", () => {
  assert.throws(
    () => validateRunSessionRequest({
      topic: "topic",
      maxRounds: 0,
      enableExecution: true,
      agents: [
        { id: "hermes-a", name: "Hermes A", role: "planner", type: "http", url: "http://10.0.0.1:4101/respond" },
        { id: "hermes-b", name: "Hermes B", role: "builder", type: "http", url: "http://10.0.0.2:4102/respond" }
      ]
    }),
    /maxRounds must be a positive integer/
  );
});

test("validateRunSessionRequest rejects invalid agent URL", () => {
  assert.throws(
    () => validateRunSessionRequest({
      topic: "topic",
      maxRounds: 2,
      enableExecution: true,
      agents: [
        { id: "hermes-a", name: "Hermes A", role: "planner", type: "http", url: "not-a-url" },
        { id: "hermes-b", name: "Hermes B", role: "builder", type: "http", url: "http://10.0.0.2:4102/respond" }
      ]
    }),
    /agent 'hermes-a' url must be a valid http or https URL/
  );
});

test("validateRunSessionRequest only accepts http agents", () => {
  assert.throws(
    () => validateRunSessionRequest({
      topic: "topic",
      maxRounds: 2,
      enableExecution: true,
      agents: [
        { id: "hermes-a", name: "Hermes A", role: "planner", type: "command", command: "echo" },
        { id: "hermes-b", name: "Hermes B", role: "builder", type: "http", url: "http://10.0.0.2:4102/respond" }
      ]
    }),
    /only supports http agents/
  );
});

test("assertSafeSessionId rejects path traversal", () => {
  assert.throws(() => assertSafeSessionId("../secret"), /Invalid sessionId/);
  assert.throws(() => assertSafeSessionId("abc/def"), /Invalid sessionId/);
  assert.doesNotThrow(() => assertSafeSessionId("d9377c90-a800-401d-8029-f1ba3793ea95"));
});
```

- [ ] **Step 2: Run validation tests and verify failure**

Run:

```bash
npm test -- --test-name-pattern web
```

Expected: TypeScript build fails because `src/web/validation.ts` does not exist.

- [ ] **Step 3: Add Web API types**

Create `src/web/types.ts`:

```ts
import type {
  DiscussionMessage,
  DiscussionResult,
  DiscussionRunnerConfig,
  DiscussionSession,
  ExecutionAction,
  ExecutionResult,
  HttpHermesAgentConfig
} from "../index.js";

export interface WebRunSessionRequest {
  topic: string;
  maxRounds: number;
  enableExecution: boolean;
  rootDir?: string;
  workspaceRootDir?: string;
  agents: HttpHermesAgentConfig[];
}

export interface WebRunSessionResponse {
  sessionId: string;
  status: string;
  topic: string;
  messageCount: number;
  roundsCompleted: number;
  taskAssignmentCount: number;
  executionResultCount: number;
}

export interface WebSessionListItem {
  sessionId: string;
  topic: string;
  status: string;
  updatedAt: string;
  messageCount: number;
  executionResultCount: number;
}

export interface WebWorkspaceFile {
  path: string;
  size: number;
}

export interface WebSessionReplay {
  session: DiscussionSession;
  result?: DiscussionResult;
  messages: DiscussionMessage[];
  actions: ExecutionAction[];
  executionResults: ExecutionResult[];
  workspaceFiles: WebWorkspaceFile[];
}

export type WebDefaultConfig = DiscussionRunnerConfig;
```

- [ ] **Step 4: Add validation implementation**

Create `src/web/validation.ts`:

```ts
import type { HttpHermesAgentConfig } from "../config.js";
import type { WebRunSessionRequest } from "./types.js";

export function validateRunSessionRequest(value: unknown): WebRunSessionRequest {
  if (!isRecord(value)) {
    throw new Error("Request body must be a JSON object.");
  }

  if (typeof value.topic !== "string" || !value.topic.trim()) {
    throw new Error("topic must be a non-empty string.");
  }

  if (!Number.isInteger(value.maxRounds) || value.maxRounds < 1) {
    throw new Error("maxRounds must be a positive integer.");
  }

  if (typeof value.enableExecution !== "boolean") {
    throw new Error("enableExecution must be a boolean.");
  }

  if (!Array.isArray(value.agents) || value.agents.length < 2) {
    throw new Error("agents must contain at least 2 http agents.");
  }

  const seen = new Set<string>();
  const agents = value.agents.map((agent) => validateHttpAgent(agent));
  for (const agent of agents) {
    if (seen.has(agent.id)) {
      throw new Error(`Duplicate agent id '${agent.id}'.`);
    }
    seen.add(agent.id);
  }

  return {
    topic: value.topic.trim(),
    maxRounds: value.maxRounds,
    enableExecution: value.enableExecution,
    rootDir: typeof value.rootDir === "string" && value.rootDir.trim() ? value.rootDir.trim() : undefined,
    workspaceRootDir: typeof value.workspaceRootDir === "string" && value.workspaceRootDir.trim()
      ? value.workspaceRootDir.trim()
      : undefined,
    agents
  };
}

export function assertSafeSessionId(sessionId: string): void {
  if (!/^[a-zA-Z0-9._-]+$/.test(sessionId) || sessionId.includes("..")) {
    throw new Error(`Invalid sessionId '${sessionId}'.`);
  }
}

function validateHttpAgent(value: unknown): HttpHermesAgentConfig {
  if (!isRecord(value)) {
    throw new Error("Each agent must be a JSON object.");
  }

  if (value.type !== "http") {
    throw new Error("Phase 3A Web runner only supports http agents.");
  }

  const id = readNonEmptyString(value, "id");
  const name = readNonEmptyString(value, "name");
  const url = readNonEmptyString(value, "url");
  assertHttpUrl(url, id);

  const timeoutMs = value.timeoutMs === undefined ? undefined : Number(value.timeoutMs);
  if (timeoutMs !== undefined && (!Number.isInteger(timeoutMs) || timeoutMs < 1)) {
    throw new Error(`agent '${id}' timeoutMs must be a positive integer.`);
  }

  return {
    id,
    name,
    role: typeof value.role === "string" && value.role.trim() ? value.role.trim() : undefined,
    type: "http",
    url,
    timeoutMs
  };
}

function assertHttpUrl(url: string, agentId: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
  } catch {
    throw new Error(`agent '${agentId}' url must be a valid http or https URL.`);
  }
}

function readNonEmptyString(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== "string" || !field.trim()) {
    throw new Error(`agent ${key} must be a non-empty string.`);
  }
  return field.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
```

- [ ] **Step 5: Run validation tests**

Run:

```bash
npm test -- --test-name-pattern web
```

Expected: validation tests pass; other web tests do not exist yet.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/web/types.ts src/web/validation.ts test/web-validation.test.ts
git commit -m "add web runner request validation"
```

## Task 2: Session Replay Reader

**Files:**
- Create: `src/web/session-reader.ts`
- Create: `test/web-session-reader.test.ts`

- [ ] **Step 1: Write replay reader tests**

Create `test/web-session-reader.test.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
import {
  listSessions,
  readSessionReplay,
  listWorkspaceFiles
} from "../src/web/session-reader.js";

test("readSessionReplay returns ordered messages, actions, and execution results", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "web-sessions-"));
  const workspaceRootDir = await mkdtemp(join(tmpdir(), "web-workspaces-"));
  const sessionId = "session-1";
  const sessionDir = join(rootDir, sessionId);
  await mkdir(sessionDir, { recursive: true });
  await writeFile(join(sessionDir, "session.json"), JSON.stringify({
    sessionId,
    topic: "topic",
    agents: [],
    messages: [],
    status: "completed",
    maxRounds: 1,
    taskAssignments: [],
    executionResults: [],
    createdAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:01.000Z"
  }));
  await writeFile(join(sessionDir, "result.json"), JSON.stringify({
    sessionId,
    topic: "topic",
    status: "completed",
    completedAt: "2026-05-07T00:00:01.000Z",
    taskAssignments: [],
    executionResults: [],
    messageCount: 1,
    roundsCompleted: 1
  }));
  await writeFile(join(sessionDir, "messages.jsonl"), `${JSON.stringify({ id: "m1", sessionId, sequence: 1, round: 1, senderId: "a", senderName: "A", content: "hello", createdAt: "now" })}\n`);
  await writeFile(join(sessionDir, "actions.jsonl"), `${JSON.stringify({ id: "act1", sessionId, agentId: "a", messageId: "m1", type: "mkdir", path: "docs", createdAt: "now" })}\n`);
  await writeFile(join(sessionDir, "execution-results.jsonl"), `${JSON.stringify({ id: "r1", actionId: "act1", sessionId, agentId: "a", status: "succeeded", startedAt: "now", completedAt: "now", summary: "ok" })}\n`);
  await mkdir(join(workspaceRootDir, sessionId, "repo", "docs"), { recursive: true });
  await writeFile(join(workspaceRootDir, sessionId, "repo", "docs", "web-mvp-plan.md"), "plan");

  const replay = await readSessionReplay({ rootDir, workspaceRootDir, sessionId });

  assert.equal(replay.messages[0]?.id, "m1");
  assert.equal(replay.actions[0]?.id, "act1");
  assert.equal(replay.executionResults[0]?.id, "r1");
  assert.deepEqual(replay.workspaceFiles, [{ path: "docs/web-mvp-plan.md", size: 4 }]);
});

test("listSessions returns sessions sorted by updatedAt descending", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "web-sessions-"));
  for (const [sessionId, updatedAt] of [["older", "2026-05-07T00:00:00.000Z"], ["newer", "2026-05-07T01:00:00.000Z"]]) {
    const sessionDir = join(rootDir, sessionId);
    await mkdir(sessionDir, { recursive: true });
    await writeFile(join(sessionDir, "session.json"), JSON.stringify({
      sessionId,
      topic: sessionId,
      agents: [],
      messages: [],
      status: "completed",
      maxRounds: 1,
      taskAssignments: [],
      executionResults: [],
      createdAt: updatedAt,
      updatedAt
    }));
    await writeFile(join(sessionDir, "messages.jsonl"), "");
    await writeFile(join(sessionDir, "execution-results.jsonl"), "");
  }

  const sessions = await listSessions(rootDir);

  assert.deepEqual(sessions.map((session) => session.sessionId), ["newer", "older"]);
});

test("listWorkspaceFiles only lists files inside workspace repo", async () => {
  const workspaceRootDir = await mkdtemp(join(tmpdir(), "web-workspaces-"));
  await mkdir(join(workspaceRootDir, "safe", "repo", "nested"), { recursive: true });
  await writeFile(join(workspaceRootDir, "safe", "repo", "nested", "file.txt"), "content");

  assert.deepEqual(await listWorkspaceFiles(workspaceRootDir, "safe"), [
    { path: "nested/file.txt", size: 7 }
  ]);
  await assert.rejects(() => listWorkspaceFiles(workspaceRootDir, "../unsafe"), /Invalid sessionId/);
});
```

- [ ] **Step 2: Run replay reader tests and verify failure**

Run:

```bash
npm test -- --test-name-pattern "readSessionReplay|listSessions|listWorkspaceFiles"
```

Expected: TypeScript build fails because `src/web/session-reader.ts` does not exist.

- [ ] **Step 3: Implement replay reader**

Create `src/web/session-reader.ts`:

```ts
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type {
  DiscussionMessage,
  DiscussionResult,
  DiscussionSession,
  ExecutionAction,
  ExecutionResult
} from "../index.js";
import { assertSafeSessionId } from "./validation.js";
import type { WebSessionListItem, WebSessionReplay, WebWorkspaceFile } from "./types.js";

export interface ReadSessionReplayOptions {
  rootDir: string;
  workspaceRootDir: string;
  sessionId: string;
}

export async function listSessions(rootDir: string): Promise<WebSessionListItem[]> {
  const entries = await readdir(rootDir, { withFileTypes: true }).catch(() => []);
  const sessions: WebSessionListItem[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const sessionId = entry.name;
    try {
      assertSafeSessionId(sessionId);
      const session = await readJson<DiscussionSession>(join(rootDir, sessionId, "session.json"));
      const messages = await readJsonl<DiscussionMessage>(join(rootDir, sessionId, "messages.jsonl"));
      const executionResults = await readJsonl<ExecutionResult>(join(rootDir, sessionId, "execution-results.jsonl"));
      sessions.push({
        sessionId,
        topic: session.topic,
        status: session.status,
        updatedAt: session.updatedAt,
        messageCount: messages.length,
        executionResultCount: executionResults.length
      });
    } catch {
      continue;
    }
  }

  return sessions.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function readSessionReplay(options: ReadSessionReplayOptions): Promise<WebSessionReplay> {
  assertSafeSessionId(options.sessionId);
  const sessionDir = join(options.rootDir, options.sessionId);
  const session = await readJson<DiscussionSession>(join(sessionDir, "session.json"));
  const result = await readOptionalJson<DiscussionResult>(join(sessionDir, "result.json"));
  const messages = await readJsonl<DiscussionMessage>(join(sessionDir, "messages.jsonl"));
  const actions = await readJsonl<ExecutionAction>(join(sessionDir, "actions.jsonl"));
  const executionResults = await readJsonl<ExecutionResult>(join(sessionDir, "execution-results.jsonl"));
  const workspaceFiles = await listWorkspaceFiles(options.workspaceRootDir, options.sessionId);

  return {
    session,
    result,
    messages,
    actions,
    executionResults,
    workspaceFiles
  };
}

export async function listWorkspaceFiles(workspaceRootDir: string, sessionId: string): Promise<WebWorkspaceFile[]> {
  assertSafeSessionId(sessionId);
  const repoPath = join(workspaceRootDir, sessionId, "repo");
  const files: WebWorkspaceFile[] = [];

  async function walk(currentPath: string): Promise<void> {
    const entries = await readdir(currentPath, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const fullPath = join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }

      const relativePath = relative(repoPath, fullPath).split(sep).join("/");
      if (relativePath.startsWith("..") || relativePath.startsWith("/")) {
        continue;
      }
      const fileStat = await stat(fullPath);
      files.push({ path: relativePath, size: fileStat.size });
    }
  }

  await walk(repoPath);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function readOptionalJson<T>(path: string): Promise<T | undefined> {
  try {
    return await readJson<T>(path);
  } catch {
    return undefined;
  }
}

async function readJsonl<T>(path: string): Promise<T[]> {
  const raw = await readFile(path, "utf8").catch(() => "");
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}
```

- [ ] **Step 4: Run replay reader tests**

Run:

```bash
npm test -- --test-name-pattern "readSessionReplay|listSessions|listWorkspaceFiles"
```

Expected: tests pass.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/web/session-reader.ts test/web-session-reader.test.ts
git commit -m "add web session replay reader"
```

## Task 3: Web API Handlers

**Files:**
- Create: `src/web/handlers.ts`
- Create: `test/web-handlers.test.ts`

- [ ] **Step 1: Write handler tests**

Create `test/web-handlers.test.ts`:

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  getDefaultConfig,
  getSessionReplay,
  listSessionSummaries,
  runSessionFromWebRequest
} from "../src/web/handlers.js";

test("runSessionFromWebRequest completes a mock-backed web session", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "web-sessions-"));
  const workspaceRootDir = await mkdtemp(join(tmpdir(), "web-workspaces-"));

  const result = await runSessionFromWebRequest({
    rootDir,
    workspaceRootDir,
    request: {
      topic: "web run",
      maxRounds: 1,
      enableExecution: true,
      agents: [
        {
          id: "hermes-a",
          name: "Hermes A",
          role: "planner",
          type: "http",
          url: "mock://hermes-a",
          timeoutMs: 300000
        },
        {
          id: "hermes-b",
          name: "Hermes B",
          role: "builder",
          type: "http",
          url: "mock://hermes-b",
          timeoutMs: 300000
        }
      ]
    },
    agentFactory: (agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      async respond() {
        return {
          content: `${agent.id} responded`,
          actions: agent.id === "hermes-a"
            ? [{ type: "write_file", path: "docs/web.md", content: "web" }]
            : []
        };
      }
    })
  });

  assert.equal(result.status, "completed");
  assert.equal(result.messageCount, 2);
  assert.equal(result.executionResultCount, 1);

  const replay = await getSessionReplay({ rootDir, workspaceRootDir, sessionId: result.sessionId });
  assert.equal(replay.messages.length, 2);
  assert.equal(replay.actions.length, 1);
  assert.equal(replay.workspaceFiles[0]?.path, "docs/web.md");
});

test("listSessionSummaries returns completed web sessions", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "web-sessions-"));
  const workspaceRootDir = await mkdtemp(join(tmpdir(), "web-workspaces-"));
  await runSessionFromWebRequest({
    rootDir,
    workspaceRootDir,
    request: {
      topic: "web list",
      maxRounds: 1,
      enableExecution: false,
      agents: [
        { id: "a", name: "A", role: "planner", type: "http", url: "mock://a" },
        { id: "b", name: "B", role: "builder", type: "http", url: "mock://b" }
      ]
    },
    agentFactory: (agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      async respond() {
        return { content: `${agent.id} ok` };
      }
    })
  });

  const sessions = await listSessionSummaries(rootDir);

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.topic, "web list");
});

test("getDefaultConfig reads existing config when present", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "web-config-"));
  const configPath = join(rootDir, "config.json");
  await import("node:fs/promises").then(({ writeFile }) => writeFile(configPath, JSON.stringify({
    topic: "from file",
    maxRounds: 2,
    enableExecution: true,
    agents: [
      { id: "a", name: "A", type: "http", url: "http://10.0.0.1/respond" },
      { id: "b", name: "B", type: "http", url: "http://10.0.0.2/respond" }
    ]
  })));

  const config = await getDefaultConfig(configPath);

  assert.equal(config.topic, "from file");
});
```

- [ ] **Step 2: Run handler tests and verify failure**

Run:

```bash
npm test -- --test-name-pattern "runSessionFromWebRequest|listSessionSummaries|getDefaultConfig"
```

Expected: TypeScript build fails because `src/web/handlers.ts` does not exist.

- [ ] **Step 3: Implement handlers**

Create `src/web/handlers.ts`:

```ts
import { access } from "node:fs/promises";
import { createHermesAgentFromConfig } from "../adapters.js";
import { loadDiscussionRunnerConfig } from "../config.js";
import { DiscussionService } from "../service.js";
import type { HermesAgent, HttpHermesAgentConfig } from "../index.js";
import { listSessions, readSessionReplay } from "./session-reader.js";
import { validateRunSessionRequest } from "./validation.js";
import type {
  WebDefaultConfig,
  WebRunSessionRequest,
  WebRunSessionResponse,
  WebSessionListItem,
  WebSessionReplay
} from "./types.js";

export interface WebHandlerOptions {
  rootDir: string;
  workspaceRootDir: string;
}

export interface RunSessionHandlerOptions extends WebHandlerOptions {
  request: unknown;
  agentFactory?: (agent: HttpHermesAgentConfig) => HermesAgent;
}

export async function getDefaultConfig(configPath = "hermes-agents.real-execution.config.json"): Promise<WebDefaultConfig> {
  if (await exists(configPath)) {
    return loadDiscussionRunnerConfig(configPath);
  }

  return {
    topic: "請 Hermes A 與 Hermes B 共同完成一個產品介紹網站 MVP 的最小可執行雛形。",
    maxRounds: 2,
    rootDir: "sessions",
    enableExecution: true,
    workspaceRootDir: "workspaces",
    agents: [
      {
        id: "hermes-a",
        name: "Hermes A",
        role: "planner",
        type: "http",
        url: "http://10.100.1.21:4101/respond",
        timeoutMs: 300000
      },
      {
        id: "hermes-b",
        name: "Hermes B",
        role: "builder",
        type: "http",
        url: "http://10.100.1.32:4102/respond",
        timeoutMs: 300000
      }
    ]
  };
}

export async function runSessionFromWebRequest(options: RunSessionHandlerOptions): Promise<WebRunSessionResponse> {
  const request = validateRunSessionRequest(options.request);
  const rootDir = request.rootDir ?? options.rootDir;
  const workspaceRootDir = request.workspaceRootDir ?? options.workspaceRootDir;
  const service = new DiscussionService({
    rootDir,
    workspaceRootDir,
    enableExecution: request.enableExecution
  });
  const agents = request.agents.map((agent) =>
    options.agentFactory ? options.agentFactory(agent) : createHermesAgentFromConfig(agent)
  );

  const session = await service.createSession({
    topic: request.topic,
    agents,
    maxRounds: request.maxRounds
  });
  const result = await service.runSession(session.sessionId);

  return summarizeRunResult(request, result);
}

export function summarizeRunResult(
  request: WebRunSessionRequest,
  result: Awaited<ReturnType<DiscussionService["runSession"]>>
): WebRunSessionResponse {
  return {
    sessionId: result.sessionId,
    status: result.status,
    topic: request.topic,
    messageCount: result.messageCount,
    roundsCompleted: result.roundsCompleted,
    taskAssignmentCount: result.taskAssignments.length,
    executionResultCount: result.executionResults.length
  };
}

export async function listSessionSummaries(rootDir: string): Promise<WebSessionListItem[]> {
  return listSessions(rootDir);
}

export async function getSessionReplay(options: WebHandlerOptions & { sessionId: string }): Promise<WebSessionReplay> {
  return readSessionReplay(options);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run handler tests**

Run:

```bash
npm test -- --test-name-pattern "runSessionFromWebRequest|listSessionSummaries|getDefaultConfig"
```

Expected: tests pass.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/web/handlers.ts test/web-handlers.test.ts
git commit -m "add web runner api handlers"
```

## Task 4: HTTP Server and Static Routing

**Files:**
- Create: `src/web/server.ts`
- Modify: `package.json`
- Test: `test/web-server.test.ts`

- [ ] **Step 1: Write server route tests**

Create `test/web-server.test.ts`:

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { createWebServer } from "../src/web/server.js";

test("web server serves default config and rejects unknown routes", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "web-sessions-"));
  const workspaceRootDir = await mkdtemp(join(tmpdir(), "web-workspaces-"));
  const server = createWebServer({ rootDir, workspaceRootDir, publicDir: "public" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  const port = typeof address === "object" && address ? address.port : 0;

  try {
    const configResponse = await fetch(`http://127.0.0.1:${port}/api/default-config`);
    assert.equal(configResponse.status, 200);
    const config = await configResponse.json() as { topic: string };
    assert.equal(typeof config.topic, "string");

    const missingResponse = await fetch(`http://127.0.0.1:${port}/missing`);
    assert.equal(missingResponse.status, 404);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
```

- [ ] **Step 2: Run server tests and verify failure**

Run:

```bash
npm test -- --test-name-pattern "web server"
```

Expected: TypeScript build fails because `src/web/server.ts` does not exist.

- [ ] **Step 3: Implement HTTP server**

Create `src/web/server.ts`:

```ts
#!/usr/bin/env node
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import {
  getDefaultConfig,
  getSessionReplay,
  listSessionSummaries,
  runSessionFromWebRequest
} from "./handlers.js";

export interface WebServerOptions {
  rootDir: string;
  workspaceRootDir: string;
  publicDir: string;
}

export function createWebServer(options: WebServerOptions): http.Server {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");

      if (req.method === "GET" && url.pathname === "/api/default-config") {
        await sendJson(res, 200, await getDefaultConfig());
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/sessions") {
        await sendJson(res, 200, await listSessionSummaries(options.rootDir));
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/sessions/run") {
        const body = await readJsonBody(req);
        await sendJson(res, 200, await runSessionFromWebRequest({
          rootDir: options.rootDir,
          workspaceRootDir: options.workspaceRootDir,
          request: body
        }));
        return;
      }

      const replayMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
      if (req.method === "GET" && replayMatch?.[1]) {
        await sendJson(res, 200, await getSessionReplay({
          rootDir: options.rootDir,
          workspaceRootDir: options.workspaceRootDir,
          sessionId: replayMatch[1]
        }));
        return;
      }

      if (req.method === "GET") {
        await serveStatic(res, options.publicDir, url.pathname);
        return;
      }

      await sendJson(res, 404, { error: "not found" });
    } catch (error) {
      await sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  let body = "";
  req.setEncoding("utf8");
  for await (const chunk of req) {
    body += chunk;
  }
  return body ? JSON.parse(body) : {};
}

async function serveStatic(res: http.ServerResponse, publicDir: string, pathname: string): Promise<void> {
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const normalized = normalize(relativePath);
  if (normalized.startsWith("..")) {
    await sendJson(res, 404, { error: "not found" });
    return;
  }

  try {
    const filePath = join(publicDir, normalized);
    const content = await readFile(filePath);
    res.writeHead(200, { "content-type": contentType(filePath) });
    res.end(content);
  } catch {
    await sendJson(res, 404, { error: "not found" });
  }
}

async function sendJson(res: http.ServerResponse, status: number, value: unknown): Promise<void> {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(`${JSON.stringify(value)}\n`);
}

function contentType(path: string): string {
  switch (extname(path)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  const host = process.env.HOST ?? "0.0.0.0";
  const rootDir = process.env.SESSIONS_ROOT ?? "sessions";
  const workspaceRootDir = process.env.WORKSPACES_ROOT ?? "workspaces";
  const publicDir = process.env.PUBLIC_DIR ?? "public";
  const server = createWebServer({ rootDir, workspaceRootDir, publicDir });
  server.listen(port, host, () => {
    console.log(`Web runner console listening on http://${host}:${port}`);
  });
}
```

- [ ] **Step 4: Add npm script**

Modify `package.json` scripts:

```json
"web": "npm run build && node dist/src/web/server.js"
```

Keep existing scripts unchanged.

- [ ] **Step 5: Run server tests**

Run:

```bash
npm test -- --test-name-pattern "web server"
```

Expected: tests pass.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/web/server.ts test/web-server.test.ts package.json package-lock.json
git commit -m "add web runner http server"
```

## Task 5: Static Web Console UI

**Files:**
- Create: `public/index.html`
- Create: `public/app.js`
- Create: `public/styles.css`

- [ ] **Step 1: Create HTML shell**

Create `public/index.html`:

```html
<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Hermes Runner Console</title>
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
    <main class="app-shell">
      <aside class="runner-panel">
        <header>
          <p class="eyebrow">Runner</p>
          <h1>Hermes Console</h1>
        </header>
        <form id="run-form" class="control-form">
          <label>
            Topic
            <textarea id="topic" rows="8" required></textarea>
          </label>
          <div class="form-row">
            <label>
              Max rounds
              <input id="maxRounds" type="number" min="1" value="2">
            </label>
            <label class="toggle-row">
              <input id="enableExecution" type="checkbox" checked>
              Execute actions
            </label>
          </div>
          <label>
            Planner URL
            <input id="plannerUrl" type="url" required>
          </label>
          <label>
            Builder URL
            <input id="builderUrl" type="url" required>
          </label>
          <button id="runButton" type="submit">Run Session</button>
          <button id="resetButton" type="button" class="secondary">Reset Defaults</button>
        </form>
        <section>
          <h2>Sessions</h2>
          <div id="session-list" class="session-list"></div>
        </section>
      </aside>
      <section class="main-panel">
        <div id="status-banner" class="status-banner">Ready</div>
        <section id="summary" class="summary-grid"></section>
        <section class="content-grid">
          <div>
            <h2>Meeting Timeline</h2>
            <div id="timeline" class="timeline"></div>
          </div>
          <aside class="execution-panel">
            <h2>Execution</h2>
            <div id="execution"></div>
            <h2>Workspace Files</h2>
            <div id="workspace-files"></div>
          </aside>
        </section>
      </section>
    </main>
    <script src="/app.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Create browser JavaScript**

Create `public/app.js`:

```js
const state = {
  defaultConfig: undefined,
  selectedSessionId: undefined
};

const $ = (id) => document.getElementById(id);

window.addEventListener("DOMContentLoaded", async () => {
  await loadDefaults();
  await loadSessions();
  $("run-form").addEventListener("submit", runSession);
  $("resetButton").addEventListener("click", applyDefaults);
});

async function loadDefaults() {
  state.defaultConfig = await fetchJson("/api/default-config");
  applyDefaults();
}

function applyDefaults() {
  const config = state.defaultConfig;
  if (!config) return;
  $("topic").value = config.topic ?? "";
  $("maxRounds").value = String(config.maxRounds ?? 2);
  $("enableExecution").checked = Boolean(config.enableExecution);
  $("plannerUrl").value = config.agents?.[0]?.url ?? "";
  $("builderUrl").value = config.agents?.[1]?.url ?? "";
}

async function runSession(event) {
  event.preventDefault();
  setStatus("Running session...", "running");
  $("runButton").disabled = true;

  try {
    const request = {
      topic: $("topic").value,
      maxRounds: Number($("maxRounds").value),
      enableExecution: $("enableExecution").checked,
      agents: [
        {
          id: "hermes-a",
          name: "Hermes A",
          role: "planner",
          type: "http",
          url: $("plannerUrl").value,
          timeoutMs: 300000
        },
        {
          id: "hermes-b",
          name: "Hermes B",
          role: "builder",
          type: "http",
          url: $("builderUrl").value,
          timeoutMs: 300000
        }
      ]
    };
    const result = await fetchJson("/api/sessions/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request)
    });
    setStatus(`Completed session ${result.sessionId}`, "completed");
    await loadSessions();
    await loadReplay(result.sessionId);
  } catch (error) {
    setStatus(error.message, "failed");
  } finally {
    $("runButton").disabled = false;
  }
}

async function loadSessions() {
  const sessions = await fetchJson("/api/sessions");
  $("session-list").innerHTML = sessions.map((session) => `
    <button class="session-item" data-session-id="${escapeHtml(session.sessionId)}">
      <strong>${escapeHtml(session.status)}</strong>
      <span>${escapeHtml(session.topic)}</span>
      <small>${escapeHtml(session.updatedAt)}</small>
    </button>
  `).join("");
  document.querySelectorAll("[data-session-id]").forEach((button) => {
    button.addEventListener("click", () => loadReplay(button.dataset.sessionId));
  });
}

async function loadReplay(sessionId) {
  state.selectedSessionId = sessionId;
  const replay = await fetchJson(`/api/sessions/${encodeURIComponent(sessionId)}`);
  renderSummary(replay);
  renderTimeline(replay);
  renderExecution(replay);
  renderWorkspaceFiles(replay.workspaceFiles);
}

function renderSummary(replay) {
  const result = replay.result;
  const session = replay.session;
  $("summary").innerHTML = [
    ["Session", session.sessionId],
    ["Status", result?.status ?? session.status],
    ["Messages", String(replay.messages.length)],
    ["Actions", String(replay.actions.length)],
    ["Execution Results", String(replay.executionResults.length)],
    ["Workspace", session.workspace?.repoPath ?? ""]
  ].map(([label, value]) => `
    <article class="summary-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `).join("");
}

function renderTimeline(replay) {
  $("timeline").innerHTML = replay.messages.map((message) => {
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
  }).join("");
}

function renderExecution(replay) {
  const succeeded = replay.executionResults.filter((item) => item.status === "succeeded").length;
  const failed = replay.executionResults.filter((item) => item.status === "failed").length;
  $("execution").innerHTML = `
    <div class="execution-counts">
      <span>${succeeded} succeeded</span>
      <span>${failed} failed</span>
    </div>
    ${replay.executionResults.map((result) => `
      <article class="execution-result ${escapeHtml(result.status)}">
        <strong>${escapeHtml(result.status)}</strong>
        <p>${escapeHtml(result.summary)}</p>
        ${result.outputPreview ? `<pre>${escapeHtml(result.outputPreview)}</pre>` : ""}
        ${result.error ? `<pre>${escapeHtml(result.error)}</pre>` : ""}
      </article>
    `).join("")}
  `;
}

function renderWorkspaceFiles(files) {
  $("workspace-files").innerHTML = files.length
    ? files.map((file) => `<div class="file-row"><span>${escapeHtml(file.path)}</span><small>${file.size} bytes</small></div>`).join("")
    : `<p class="empty">No workspace files found.</p>`;
}

function renderMiniList(title, items) {
  if (!items.length) return "";
  return `<div class="mini-list"><strong>${escapeHtml(title)}</strong>${items.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`;
}

function setStatus(message, status) {
  const banner = $("status-banner");
  banner.textContent = message;
  banner.className = `status-banner ${status}`;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(parsed.error ?? `Request failed with ${response.status}`);
  }
  return parsed;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
```

- [ ] **Step 3: Create dashboard styles**

Create `public/styles.css` with concise operational styling:

```css
:root {
  color-scheme: light;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #1d2433;
  background: #eef2f6;
}

* { box-sizing: border-box; }
body { margin: 0; }
button, input, textarea { font: inherit; }

.app-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(320px, 380px) 1fr;
}

.runner-panel {
  background: #ffffff;
  border-right: 1px solid #d8dee8;
  padding: 24px;
  overflow: auto;
}

.eyebrow {
  margin: 0 0 4px;
  text-transform: uppercase;
  font-size: 12px;
  color: #697386;
}

h1, h2 { margin: 0 0 16px; }
h1 { font-size: 28px; }
h2 { font-size: 18px; }

.control-form {
  display: grid;
  gap: 14px;
  margin-bottom: 28px;
}

label {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: #3d4758;
}

input, textarea {
  width: 100%;
  border: 1px solid #cbd3df;
  border-radius: 6px;
  padding: 10px 12px;
  background: #ffffff;
  color: #1d2433;
}

textarea { resize: vertical; }

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.toggle-row {
  align-content: end;
  grid-template-columns: auto 1fr;
  align-items: center;
}

button {
  border: 0;
  border-radius: 6px;
  padding: 10px 12px;
  background: #2454d6;
  color: #ffffff;
  cursor: pointer;
}

button:disabled { opacity: 0.6; cursor: wait; }
button.secondary { background: #e7ebf3; color: #243047; }

.session-list {
  display: grid;
  gap: 8px;
}

.session-item {
  display: grid;
  gap: 4px;
  text-align: left;
  background: #f6f8fb;
  color: #243047;
  border: 1px solid #d8dee8;
}

.session-item span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.main-panel {
  padding: 24px;
  overflow: auto;
}

.status-banner {
  border-radius: 6px;
  padding: 12px 14px;
  background: #e7ebf3;
  margin-bottom: 16px;
}

.status-banner.running { background: #dfeaff; color: #173d8f; }
.status-banner.completed { background: #dcf7e8; color: #17633a; }
.status-banner.failed { background: #fde2e2; color: #8f1d1d; }

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

.summary-card {
  background: #ffffff;
  border: 1px solid #d8dee8;
  border-radius: 6px;
  padding: 14px;
}

.summary-card span {
  display: block;
  color: #697386;
  font-size: 12px;
  margin-bottom: 6px;
}

.summary-card strong {
  display: block;
  overflow-wrap: anywhere;
}

.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 20px;
}

.timeline, .execution-panel {
  display: grid;
  gap: 12px;
}

.message-card, .execution-result, .file-row {
  background: #ffffff;
  border: 1px solid #d8dee8;
  border-radius: 6px;
  padding: 14px;
}

.message-card.planner { border-left: 4px solid #5865d8; }
.message-card.builder { border-left: 4px solid #179c8d; }

.message-card header {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.message-card header span,
.message-card header small {
  color: #697386;
}

.message-card p {
  white-space: pre-wrap;
  line-height: 1.5;
}

.mini-list {
  display: grid;
  gap: 6px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #edf0f5;
}

.mini-list span {
  background: #f6f8fb;
  border-radius: 4px;
  padding: 6px 8px;
  overflow-wrap: anywhere;
}

.execution-counts {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.execution-counts span {
  background: #ffffff;
  border: 1px solid #d8dee8;
  border-radius: 6px;
  padding: 8px 10px;
}

.execution-result.succeeded { border-left: 4px solid #1f9d55; }
.execution-result.failed { border-left: 4px solid #d64545; }

pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: #111827;
  color: #eef2ff;
  padding: 10px;
  border-radius: 6px;
}

.file-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.file-row span { overflow-wrap: anywhere; }
.empty { color: #697386; }

@media (max-width: 980px) {
  .app-shell,
  .content-grid {
    grid-template-columns: 1fr;
  }

  .runner-panel {
    border-right: 0;
    border-bottom: 1px solid #d8dee8;
  }

  .summary-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 4: Smoke-check static files through server**

Run:

```bash
npm run build
PORT=3100 node dist/src/web/server.js
```

In a second terminal:

```bash
curl -s http://127.0.0.1:3100/ | head
curl -s http://127.0.0.1:3100/app.js | head
curl -s http://127.0.0.1:3100/styles.css | head
```

Expected: each command returns the corresponding file content. Stop server with Ctrl-C.

- [ ] **Step 5: Commit Task 5**

```bash
git add public/index.html public/app.js public/styles.css
git commit -m "add web runner console ui"
```

## Task 6: Documentation and Manual Runner Instructions

**Files:**
- Modify: `README.md`
- Create: `docs/PHASE_3A_WEB_RUNNER_CONSOLE_RUNBOOK.md`

- [ ] **Step 1: Add runbook**

Create `docs/PHASE_3A_WEB_RUNNER_CONSOLE_RUNBOOK.md`:

```md
# Phase 3A Web Runner Console Runbook

## Goal

Run the Web runner console on the runner EC2 and use a browser to start and replay a real Hermes execution session.

## Start Server

On runner EC2:

\`\`\`bash
cd ~/projects/aiMeeting
git pull
npm install
npm test
HOST=0.0.0.0 PORT=3000 npm run web
\`\`\`

Open:

\`\`\`text
http://<runner-public-ip>:3000
\`\`\`

## Hermes Endpoints

Use:

\`\`\`text
Planner URL: http://10.100.1.21:4101/respond
Builder URL: http://10.100.1.32:4102/respond
\`\`\`

Verify health first:

\`\`\`bash
curl -s http://10.100.1.21:4101/health
curl -s http://10.100.1.32:4102/health
\`\`\`

Both should show:

\`\`\`text
real-hermes-wrapper-action-json-v3
\`\`\`

## Run Session

In the Web form:

- Enter topic.
- Set maxRounds to 2.
- Enable execution.
- Confirm planner and builder URLs.
- Click Run Session.

Expected:

- Status banner changes to Running.
- After completion, Session Summary appears.
- Meeting Timeline shows Hermes A and Hermes B messages.
- Execution panel shows actions and execution results.
- Workspace Files shows files created under `workspaces/<sessionId>/repo`.

## Troubleshooting

If the Web request fails:

- Confirm runner can curl hermes-a and hermes-b health endpoints.
- Confirm `HOST=0.0.0.0 PORT=3000 npm run web` is still running.
- Confirm runner security group allows inbound access to port 3000 from your IP.
- Check terminal logs for HTTP 500 error messages.
```

- [ ] **Step 2: Update README**

Add after Phase 3 design section:

```md
## Phase 3A Web Runner Console Runbook

See [docs/PHASE_3A_WEB_RUNNER_CONSOLE_RUNBOOK.md](docs/PHASE_3A_WEB_RUNNER_CONSOLE_RUNBOOK.md) for runner EC2 startup and browser validation steps.
```

Also add under install/run commands:

```md
## Start Web Runner Console

```bash
npm run web
```
```

- [ ] **Step 3: Run tests**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit Task 6**

```bash
git add README.md docs/PHASE_3A_WEB_RUNNER_CONSOLE_RUNBOOK.md
git commit -m "document web runner console runbook"
```

## Task 7: Full Local Verification

**Files:**
- No source changes unless verification finds a bug.

- [ ] **Step 1: Run full test suite**

Run:

```bash
npm test
```

Expected:

```text
# fail 0
```

- [ ] **Step 2: Start local Web server**

Run:

```bash
PORT=3100 npm run web
```

Expected:

```text
Web runner console listening on http://0.0.0.0:3100
```

- [ ] **Step 3: Verify API endpoints**

In a second terminal:

```bash
curl -s http://127.0.0.1:3100/api/default-config
curl -s http://127.0.0.1:3100/api/sessions
curl -I http://127.0.0.1:3100/
```

Expected:

- default config returns JSON with `topic`.
- sessions returns a JSON array.
- `/` returns HTTP 200 with HTML content type.

- [ ] **Step 4: Verify browser manually**

Open:

```text
http://127.0.0.1:3100
```

Expected:

- Runner form is visible.
- Session list is visible.
- Default planner/builder URLs are populated.
- Page has no console errors on load.

- [ ] **Step 5: Commit fixes if needed**

If any bug was fixed during verification:

```bash
git add <changed-files>
git commit -m "fix web runner console verification issues"
```

If no bug was found, do not create an empty commit.

## Task 8: Phase 3A EC2 Validation Document

**Files:**
- Create after real EC2 validation: `docs/step_13_phase_3a_web_runner_console_validation_2026_05_07.md`

- [ ] **Step 1: Run on runner EC2**

On runner EC2:

```bash
cd ~/projects/aiMeeting
git pull
npm install
npm test
HOST=0.0.0.0 PORT=3000 npm run web
```

- [ ] **Step 2: Validate browser run**

From browser:

```text
http://<runner-public-ip>:3000
```

Use:

```text
Planner URL: http://10.100.1.21:4101/respond
Builder URL: http://10.100.1.32:4102/respond
maxRounds: 2
enableExecution: true
```

Expected:

- Web session completes.
- Replay shows Hermes A / Hermes B messages.
- Execution panel shows execution results.
- Workspace files list is not empty.

- [ ] **Step 3: Write validation document**

Create `docs/step_13_phase_3a_web_runner_console_validation_2026_05_07.md` with this structure:

```md
# Step 13：Phase 3A Web Runner Console 驗證紀錄

## 1. 驗證目標

確認 runner EC2 可以透過 Web console 啟動 real Hermes execution session，並在瀏覽器中 replay 對話與 execution 結果。

## 2. 環境

- runner:
- hermes-a:
- hermes-b:
- web URL:
- commit:

## 3. Health Checks

\`\`\`bash
curl -s http://10.100.1.21:4101/health
curl -s http://10.100.1.32:4102/health
\`\`\`

## 4. Web Session Result

- sessionId:
- status:
- messageCount:
- executionResultCount:
- workspace files:

## 5. 結論

Phase 3A Web Runner Console MVP 驗證通過。
```

- [ ] **Step 4: Commit validation document**

```bash
git add docs/step_13_phase_3a_web_runner_console_validation_2026_05_07.md
git commit -m "document phase 3a web runner validation"
git push origin main
```

## Self-Review

Spec coverage:

- Web form fields are covered by Tasks 5 and 6.
- Web-triggered session execution is covered by Tasks 3 and 4.
- Replay data loading is covered by Task 2.
- Session list is covered by Tasks 2, 3, and 5.
- Workspace file list is covered by Tasks 2 and 5.
- Security boundaries are covered by Task 1 and Task 2 path guards.
- Tests are covered by Tasks 1 through 4 and Task 7.
- EC2 validation record is covered by Task 8.

Implementation scope intentionally excludes:

- Live SSE monitor.
- WebSocket.
- Multi-user authentication.
- Browser-side file preview.
- Arbitrary command entry.

