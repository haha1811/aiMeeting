# Multi-Hermes Discussion Core

A small TypeScript/Node core for running two or more in-process Hermes agents in a moderated meeting-room discussion.

## Versions

- `v0.1.0`: CLI discussion runner, JSONL persistence, and real Hermes execution MVP.
- `v0.2.0`: Web Runner Console replay MVP.

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

## Start a Phase 2 Execution Smoke Test

The repository includes a mock execution setup that writes a file inside an isolated workspace and runs an allowlisted command.

```bash
npm run session:execute
```

The command reads `hermes-agents.execution.config.json`, writes output under `sessions/<sessionId>/`, and creates a workspace under `workspaces/<sessionId>/`.

## Start Web Runner Console

```bash
npm run web
```

The command starts a runner-hosted Web console for launching sessions and replaying messages, actions, execution results, and workspace files.

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

## Real Hermes Validation Record

See [docs/step_11_real_hermes_agent_setup_guide_2026_05_06.md](docs/step_11_real_hermes_agent_setup_guide_2026_05_06.md) for the real AWS EC2 + Hermes CLI validation notes.

## Phase 2 Execution Design

See [docs/PHASE_2_EXECUTION_DESIGN.md](docs/PHASE_2_EXECUTION_DESIGN.md) for the proposed autonomous execution design, action schema, workspace model, and MVP implementation order.

## Phase 2 Real Hermes Execution Runbook

See [docs/PHASE_2_REAL_HERMES_EXECUTION_RUNBOOK.md](docs/PHASE_2_REAL_HERMES_EXECUTION_RUNBOOK.md) for ordered runner / hermes-a / hermes-b EC2 steps to validate real Hermes action execution.

## Phase 2 Real Hermes Execution Validation

See [docs/step_12_phase_2_real_hermes_execution_validation_2026_05_07.md](docs/step_12_phase_2_real_hermes_execution_validation_2026_05_07.md) for the completed three-EC2 validation record, including the successful `executionResultCount: 10` session.

## Phase 3 Web Runner Console Design

See [docs/PHASE_3_WEB_RUNNER_CONSOLE_DESIGN.md](docs/PHASE_3_WEB_RUNNER_CONSOLE_DESIGN.md) for the proposed Web runner console, replay viewer, and later live monitor design.

## Phase 3A Web Runner Console Runbook

See [docs/PHASE_3A_WEB_RUNNER_CONSOLE_RUNBOOK.md](docs/PHASE_3A_WEB_RUNNER_CONSOLE_RUNBOOK.md) for runner EC2 startup and browser validation steps.

## Phase 3A Web Runner Console User Guide

See [docs/PHASE_3A_WEB_RUNNER_CONSOLE_USER_GUIDE.md](docs/PHASE_3A_WEB_RUNNER_CONSOLE_USER_GUIDE.md) for a user-facing guide to running sessions and reading replay results in the browser.

## Hermes Agent Guide

See [docs/HERMES_AGENT_GUIDE.md](docs/HERMES_AGENT_GUIDE.md) for an agent-oriented runbook that explains how a Hermes agent can set up, verify, integrate, and use this repository by itself.
