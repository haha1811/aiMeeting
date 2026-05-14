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
