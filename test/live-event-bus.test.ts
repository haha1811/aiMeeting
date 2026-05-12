import test from "node:test";
import assert from "node:assert/strict";
import { LiveEventBus } from "../src/web/live-event-bus.js";
import type { LiveSessionEvent } from "../src/web/live-types.js";

function event(sessionId: string, id = "event-1"): LiveSessionEvent<"session.started"> {
  return {
    id,
    sessionId,
    type: "session.started",
    createdAt: "2026-05-11T00:00:00.000Z",
    data: { status: "running" }
  };
}

test("LiveEventBus publishes to subscribers for the same session", () => {
  const bus = new LiveEventBus();
  const received: LiveSessionEvent[] = [];

  bus.subscribe("session-1", (item) => received.push(item));
  bus.publish(event("session-1"));

  assert.equal(received.length, 1);
  assert.equal(received[0]?.id, "event-1");
});

test("LiveEventBus does not leak events across sessions", () => {
  const bus = new LiveEventBus();
  const received: LiveSessionEvent[] = [];

  bus.subscribe("session-1", (item) => received.push(item));
  bus.publish(event("session-2"));

  assert.equal(received.length, 0);
});

test("LiveEventBus unsubscribe stops future delivery", () => {
  const bus = new LiveEventBus();
  const received: LiveSessionEvent[] = [];

  const unsubscribe = bus.subscribe("session-1", (item) => received.push(item));
  unsubscribe();
  bus.publish(event("session-1"));

  assert.equal(received.length, 0);
  assert.equal(bus.subscriberCount("session-1"), 0);
});

test("LiveEventBus stale unsubscribe does not remove later subscription", () => {
  const bus = new LiveEventBus();
  const received: LiveSessionEvent[] = [];

  const unsubscribe = bus.subscribe("session-1", () => {
    throw new Error("stale subscriber should not be called");
  });
  unsubscribe();
  bus.subscribe("session-1", (item) => received.push(item));
  unsubscribe();

  bus.publish(event("session-1"));

  assert.equal(received.length, 1);
  assert.equal(bus.subscriberCount("session-1"), 1);
});

test("LiveEventBus publish uses a snapshot of current subscribers", () => {
  const bus = new LiveEventBus();
  const received: string[] = [];
  let unsubscribeB: () => void = () => {};

  const subscriberC = (item: LiveSessionEvent) => received.push(`c:${item.id}`);
  const subscriberA = (item: LiveSessionEvent) => {
    received.push(`a:${item.id}`);
    unsubscribeB();
    bus.subscribe("session-1", subscriberC);
  };
  const subscriberB = (item: LiveSessionEvent) => received.push(`b:${item.id}`);

  bus.subscribe("session-1", subscriberA);
  unsubscribeB = bus.subscribe("session-1", subscriberB);

  bus.publish(event("session-1", "event-1"));
  bus.publish(event("session-1", "event-2"));

  assert.deepEqual(received, [
    "a:event-1",
    "b:event-1",
    "a:event-2",
    "c:event-2"
  ]);
});
