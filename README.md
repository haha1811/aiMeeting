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

## Start a Discussion

The repository includes a runnable mock setup for `hermes-a` and `hermes-b`.

```bash
npm run session
```

The command reads `hermes-agents.config.json`, starts a moderated discussion, and writes output under `sessions/<sessionId>/`.

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

## User Guide

See [docs/USER_GUIDE.md](docs/USER_GUIDE.md) for a user-facing setup guide with simple from-zero usage scenarios.

## AWS EC2 Test Plan

See [docs/AWS_EC2_THREE_VM_TEST_PLAN.md](docs/AWS_EC2_THREE_VM_TEST_PLAN.md) for a three-VM runner / hermes-a / hermes-b deployment and validation walkthrough.

## Hermes Agent Guide

See [docs/HERMES_AGENT_GUIDE.md](docs/HERMES_AGENT_GUIDE.md) for an agent-oriented runbook that explains how a Hermes agent can set up, verify, integrate, and use this repository by itself.
