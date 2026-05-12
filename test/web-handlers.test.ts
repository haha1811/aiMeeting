import { mkdtemp, writeFile } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { LiveEventBus } from "../src/web/live-event-bus.js";
import { LiveSessionJobRegistry } from "../src/web/live-session-jobs.js";
import {
  checkAgentHealth,
  createLiveSessionJob,
  deriveHealthUrl,
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
          url: "http://mock.local/hermes-a",
          timeoutMs: 300000
        },
        {
          id: "hermes-b",
          name: "Hermes B",
          role: "builder",
          type: "http",
          url: "http://mock.local/hermes-b",
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
        { id: "a", name: "A", role: "planner", type: "http", url: "http://mock.local/a" },
        { id: "b", name: "B", role: "builder", type: "http", url: "http://mock.local/b" }
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
  await writeFile(configPath, JSON.stringify({
    topic: "from file",
    maxRounds: 2,
    enableExecution: true,
    agents: [
      { id: "a", name: "A", type: "http", url: "http://10.0.0.1/respond" },
      { id: "b", name: "B", type: "http", url: "http://10.0.0.2/respond" }
    ]
  }));

  const config = await getDefaultConfig(configPath);

  assert.equal(config.topic, "from file");
});

test("deriveHealthUrl converts respond URL to health URL", () => {
  assert.equal(
    deriveHealthUrl("http://10.100.1.21:4101/respond"),
    "http://10.100.1.21:4101/health"
  );
});

test("checkAgentHealth returns wrapper metadata for healthy endpoint", async () => {
  const server = http.createServer((req, res) => {
    assert.equal(req.url, "/health");
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      wrapperVersion: "real-hermes-wrapper-action-json-v3",
      agentId: "hermes-a",
      agentName: "Hermes A",
      agentRole: "planner"
    }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  try {
    const result = await checkAgentHealth({ url: `http://127.0.0.1:${port}/respond` });
    assert.equal(result.ok, true);
    assert.equal(result.wrapperVersion, "real-hermes-wrapper-action-json-v3");
    assert.equal(result.agentId, "hermes-a");
    assert.equal(result.healthUrl, `http://127.0.0.1:${port}/health`);
    assert.equal(typeof result.latencyMs, "number");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("checkAgentHealth returns ok false for failed endpoint", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not ready" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  try {
    const result = await checkAgentHealth({ url: `http://127.0.0.1:${port}/respond` });
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /HTTP 500/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
