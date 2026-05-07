import { mkdtemp, writeFile } from "node:fs/promises";
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
