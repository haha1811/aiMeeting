import type { LiveSessionEvent } from "./live-types.js";

export type LiveEventSubscriber = (event: LiveSessionEvent) => void;

export class LiveEventBus {
  private readonly subscribers = new Map<string, Set<LiveEventSubscriber>>();

  publish(event: LiveSessionEvent): void {
    const subscribers = this.subscribers.get(event.sessionId);
    if (!subscribers) {
      return;
    }

    for (const subscriber of [...subscribers]) {
      subscriber(event);
    }
  }

  subscribe(sessionId: string, subscriber: LiveEventSubscriber): () => void {
    const subscribers = this.subscribers.get(sessionId) ?? new Set<LiveEventSubscriber>();
    subscribers.add(subscriber);
    this.subscribers.set(sessionId, subscribers);

    let active = true;
    return () => {
      if (!active) {
        return;
      }
      active = false;
      subscribers.delete(subscriber);
      if (subscribers.size === 0 && this.subscribers.get(sessionId) === subscribers) {
        this.subscribers.delete(sessionId);
      }
    };
  }

  subscriberCount(sessionId: string): number {
    return this.subscribers.get(sessionId)?.size ?? 0;
  }
}
