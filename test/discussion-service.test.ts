import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { DiscussionService, type HermesAgent } from "../src/index.js";

const fixedDate = new Date("2026-05-05T00:00:00.000Z");

function createService(rootDir: string): DiscussionService {
  let id = 0;
  return new DiscussionService({
    rootDir,
    now: () => fixedDate,
    idFactory: () => `id-${++id}`
  });
}

function fakeAgent(id: string, responses: string[]): HermesAgent {
  let index = 0;
  return {
    id,
    name: `Agent ${id}`,
    role: "test",
    async respond() {
      return {
        content: responses[index++] ?? `${id} done`
      };
    }
  };
}

test("rejects sessions with fewer than 2 agents", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "hermes-discussion-"));
  const service = createService(rootDir);

  await assert.rejects(
    () =>
      service.createSession({
        topic: "single agent",
        agents: [fakeAgent("a", ["hello"])]
      }),
    /at least 2 Hermes agents/
  );
});

test("moderator speaker order is deterministic", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "hermes-discussion-"));
  const service = createService(rootDir);
  const session = await service.createSession({
    topic: "ordering",
    agents: [fakeAgent("a", ["a1", "a2"]), fakeAgent("b", ["b1", "b2"])],
    maxRounds: 2
  });

  await service.runSession(session.sessionId);
  const updated = await service.getSession(session.sessionId);

  assert.deepEqual(
    updated.messages.map((message) => message.senderId),
    ["a", "b", "a", "b"]
  );
  assert.deepEqual(
    updated.messages.map((message) => message.sequence),
    [1, 2, 3, 4]
  );
});

test("appends messages to JSONL in order", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "hermes-discussion-"));
  const service = createService(rootDir);
  const session = await service.createSession({
    topic: "jsonl",
    agents: [fakeAgent("a", []), fakeAgent("b", [])]
  });

  await service.appendMessage(session.sessionId, {
    senderId: "human",
    senderName: "Human",
    content: "first"
  });
  await service.appendMessage(session.sessionId, {
    senderId: "human",
    senderName: "Human",
    content: "second"
  });

  const raw = await readFile(join(rootDir, session.sessionId, "messages.jsonl"), "utf8");
  const messages = raw
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line) as { content: string; sequence: number });

  assert.deepEqual(
    messages.map((message) => [message.sequence, message.content]),
    [
      [1, "first"],
      [2, "second"]
    ]
  );
});

test("maxRounds stops the discussion", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "hermes-discussion-"));
  const service = createService(rootDir);
  const session = await service.createSession({
    topic: "round limit",
    agents: [fakeAgent("a", ["a1"]), fakeAgent("b", ["b1"])],
    maxRounds: 1
  });

  const result = await service.runSession(session.sessionId);

  assert.equal(result.roundsCompleted, 1);
  assert.equal(result.messageCount, 2);
});

test("writes final task assignments to result.json", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "hermes-discussion-"));
  const service = createService(rootDir);
  const assigner: HermesAgent = {
    id: "a",
    name: "Agent a",
    async respond() {
      return {
        content: "assigning work",
        taskAssignments: [
          {
            assignedAgentId: "a",
            title: "Draft plan",
            detail: "Create the first draft.",
            confidence: 0.9
          },
          {
            assignedAgentId: "b",
            title: "Review plan",
            detail: "Review the draft.",
            dependencies: ["Draft plan"]
          }
        ]
      };
    }
  };

  const session = await service.createSession({
    topic: "assignments",
    agents: [assigner, fakeAgent("b", ["reviewing"])],
    maxRounds: 3
  });
  const result = await service.runSession(session.sessionId);
  const resultFromDisk = JSON.parse(
    await readFile(join(rootDir, session.sessionId, "result.json"), "utf8")
  ) as typeof result;

  assert.equal(result.status, "completed");
  assert.equal(result.messageCount, 1);
  assert.equal(resultFromDisk.taskAssignments.length, 2);
  assert.deepEqual(
    resultFromDisk.taskAssignments.map((assignment) => assignment.title),
    ["Draft plan", "Review plan"]
  );
});

test("integration with 3 fake agents produces deterministic transcript and assignments", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "hermes-discussion-"));
  const service = createService(rootDir);
  const agents: HermesAgent[] = [
    fakeAgent("planner", ["Plan the work"]),
    fakeAgent("builder", ["Build the feature"]),
    {
      id: "reviewer",
      name: "Reviewer",
      async respond() {
        return {
          content: "Assign review tasks",
          taskAssignments: [
            {
              assignedAgentId: "planner",
              title: "Prepare implementation checklist",
              detail: "List the implementation steps."
            },
            {
              assignedAgentId: "builder",
              title: "Implement module",
              detail: "Build the core module."
            },
            {
              assignedAgentId: "reviewer",
              title: "Verify behavior",
              detail: "Run tests and inspect output."
            }
          ]
        };
      }
    }
  ];

  const session = await service.createSession({ topic: "ship v1", agents, maxRounds: 2 });
  const result = await service.runSession(session.sessionId);

  assert.deepEqual(
    (await service.getSession(session.sessionId)).messages.map((message) => message.senderId),
    ["planner", "builder", "reviewer"]
  );
  assert.equal(result.taskAssignments.length, 3);
});
