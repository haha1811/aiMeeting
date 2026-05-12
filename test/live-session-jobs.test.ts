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
