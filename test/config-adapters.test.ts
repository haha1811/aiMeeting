import test from "node:test";
import assert from "node:assert/strict";
import { createHermesAgentFromConfig } from "../src/adapters.js";
import { validateDiscussionRunnerConfig } from "../src/config.js";
import type { AgentDiscussionContext } from "../src/index.js";

const context: AgentDiscussionContext = {
  sessionId: "session",
  topic: "topic",
  round: 1,
  speaker: { id: "a", name: "A" },
  agents: [
    { id: "a", name: "A" },
    { id: "b", name: "B" }
  ],
  messages: [],
  taskAssignments: []
};

test("validates config requires at least two agents", () => {
  assert.throws(
    () =>
      validateDiscussionRunnerConfig({
        topic: "topic",
        agents: [{ id: "a", name: "A", type: "mock" }]
      }),
    /at least 2 agents/
  );
});

test("validates config rejects duplicate agent ids", () => {
  assert.throws(
    () =>
      validateDiscussionRunnerConfig({
        topic: "topic",
        agents: [
          { id: "a", name: "A", type: "mock" },
          { id: "a", name: "A2", type: "mock" }
        ]
      }),
    /Duplicate agent id/
  );
});

test("mock adapter returns configured responses in order", async () => {
  const agent = createHermesAgentFromConfig({
    id: "a",
    name: "A",
    type: "mock",
    responses: [{ content: "first" }, { content: "second" }]
  });

  assert.equal((await agent.respond(context)).content, "first");
  assert.equal((await agent.respond(context)).content, "second");
  assert.equal((await agent.respond(context)).content, "second");
});
