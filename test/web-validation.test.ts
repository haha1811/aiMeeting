import test from "node:test";
import assert from "node:assert/strict";
import {
  assertSafeSessionId,
  validateAgentHealthCheckRequest,
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

test("validateAgentHealthCheckRequest rejects invalid URL", () => {
  assert.throws(
    () => validateAgentHealthCheckRequest({ url: "not-a-url" }),
    /url must be a valid http or https URL/
  );
});

test("validateAgentHealthCheckRequest accepts respond URL", () => {
  assert.deepEqual(
    validateAgentHealthCheckRequest({ url: "http://10.100.1.21:4101/respond" }),
    { url: "http://10.100.1.21:4101/respond" }
  );
});
