import test from "node:test";
import assert from "node:assert/strict";
import { formatSseEvent } from "../src/web/sse.js";
import type { LiveSessionEvent } from "../src/web/live-types.js";

test("formatSseEvent renders event and JSON data", () => {
  const event: LiveSessionEvent<"speaker.active"> = {
    id: "event-1",
    sessionId: "session-1",
    type: "speaker.active",
    createdAt: "2026-05-11T00:00:00.000Z",
    data: { agentId: "hermes-a", agentName: "Hermes A", role: "planner", round: 1 }
  };

  assert.equal(
    formatSseEvent(event),
    [
      "id: event-1",
      "event: speaker.active",
      "data: {\"id\":\"event-1\",\"sessionId\":\"session-1\",\"type\":\"speaker.active\",\"createdAt\":\"2026-05-11T00:00:00.000Z\",\"data\":{\"agentId\":\"hermes-a\",\"agentName\":\"Hermes A\",\"role\":\"planner\",\"round\":1}}",
      "",
      ""
    ].join("\n")
  );
});

test("formatSseEvent JSON-encodes newline payloads as a single data line", () => {
  const event: LiveSessionEvent<"session.failed"> = {
    id: "event-2",
    sessionId: "session-1",
    type: "session.failed",
    createdAt: "2026-05-11T00:00:01.000Z",
    data: { error: "first line\nsecond line" }
  };

  const formatted = formatSseEvent(event);

  assert.match(formatted, /^id: event-2\n/);
  assert.match(formatted, /\nevent: session.failed\n/);
  assert.equal(formatted.split("\n").filter((line) => line.startsWith("data: ")).length, 1);
  assert.match(formatted, /"error":"first line\\nsecond line"/);
  assert.match(formatted, /\n\n$/);
});
