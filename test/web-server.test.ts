import { mkdtemp } from "node:fs/promises";
import http from "node:http";
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

    const headResponse = await fetch(`http://127.0.0.1:${port}/`, { method: "HEAD" });
    assert.equal(headResponse.status, 200);
    assert.match(headResponse.headers.get("content-type") ?? "", /text\/html/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("web server checks agent health through runner", async () => {
  const agentServer = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      wrapperVersion: "real-hermes-wrapper-action-json-v3",
      agentId: "hermes-a"
    }));
  });
  await new Promise<void>((resolve) => agentServer.listen(0, "127.0.0.1", resolve));
  const agentAddress = agentServer.address();
  const agentPort = typeof agentAddress === "object" && agentAddress ? agentAddress.port : 0;

  const rootDir = await mkdtemp(join(tmpdir(), "web-sessions-"));
  const workspaceRootDir = await mkdtemp(join(tmpdir(), "web-workspaces-"));
  const server = createWebServer({ rootDir, workspaceRootDir, publicDir: "public" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/agents/check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: `http://127.0.0.1:${agentPort}/respond` })
    });
    const body = await response.json() as {
      ok: boolean;
      wrapperVersion: string;
      agentId: string;
    };
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.wrapperVersion, "real-hermes-wrapper-action-json-v3");
    assert.equal(body.agentId, "hermes-a");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => agentServer.close(() => resolve()));
  }
});

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
        await new Promise((resolve) => setTimeout(resolve, 50));
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
