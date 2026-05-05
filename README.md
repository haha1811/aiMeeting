# Multi-Hermes Discussion Core

A small TypeScript/Node core for running two or more in-process Hermes agents in a moderated meeting-room discussion.

## Install

```bash
npm install
```

## Run Tests

```bash
npm test
```

## Example

```ts
import { DiscussionService, type HermesAgent } from "./src/index.js";

const planner: HermesAgent = {
  id: "planner",
  name: "Planner",
  role: "planning",
  async respond(context) {
    return {
      content: `I will break down ${context.topic}.`,
      taskAssignments: [
        {
          assignedAgentId: "builder",
          title: "Implement discussion core",
          detail: "Build the service, moderator, and file persistence."
        }
      ]
    };
  }
};

const builder: HermesAgent = {
  id: "builder",
  name: "Builder",
  role: "implementation",
  async respond() {
    return { content: "I can take the implementation task." };
  }
};

const service = new DiscussionService({ rootDir: "sessions" });
const session = await service.createSession({
  topic: "Ship multi-agent discussion v1",
  agents: [planner, builder],
  maxRounds: 3
});

const result = await service.runSession(session.sessionId);
console.log(result.taskAssignments);
```

## Persistence

Each session writes append-only discussion records under `sessions/<sessionId>/`:

- `messages.jsonl`
- `events.jsonl`
- `session.json`
- `result.json`

## Detailed Operations Guide

See [docs/OPERATIONS.md](docs/OPERATIONS.md) for WSL setup, usage scenarios, service API details, persistence format, and Hermes runtime integration guidance.
