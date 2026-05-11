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
