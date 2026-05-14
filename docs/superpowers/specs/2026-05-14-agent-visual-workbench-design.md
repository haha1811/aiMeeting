# Agent Visual Workbench Design

## Summary

Phase 5 adds a visual workbench to the existing Web Runner Console. The first release, `v0.4.0`, shows Runner, Planner, and Builder as work participants with deterministic status cards driven by session events. This is a 2D web feature first. It does not introduce Electron, Three.js, Claw3D, or a separate desktop runtime in the first implementation.

## Goals

- Make Hermes agent work visible without requiring the user to read the full timeline.
- Show who is currently active, who last responded, who is executing an action, and whether the session completed or failed.
- Reuse the existing runner event model so Live and Replay views remain consistent.
- Keep the design compatible with a future Claw3D gateway adapter by defining a clean visual state projection layer.

## Non-Goals For v0.4.0

- No 3D office scene.
- No draggable office layout or avatar editor.
- No Electron desktop shell.
- No Claw3D gateway protocol implementation.
- No new Hermes agent behavior. Agent wrappers and discussion semantics remain unchanged.

## Architecture

The workbench is a projection of existing runner events and replay records:

```text
Discussion session data
  -> Visual State Projector
  -> VisualWorkbenchState
  -> Web API / Frontend live state
  -> 2D Workbench UI
```

The projector is a pure TypeScript module. It accepts the same information the runner already persists or streams and returns deterministic visual state. The frontend can use the same state shape for Replay and Live, which prevents separate rules from drifting over time.

## Visual State Model

```ts
export type AgentVisualStatus =
  | "idle"
  | "thinking"
  | "speaking"
  | "executing"
  | "reviewing"
  | "completed"
  | "failed";

export interface AgentVisualState {
  agentId: string;
  name: string;
  role?: string;
  status: AgentVisualStatus;
  currentActivity: string;
  lastMessagePreview?: string;
  lastActionSummary?: string;
  lastExecutionSummary?: string;
  updatedAt: string;
}

export interface RunnerVisualState {
  status: "idle" | "queued" | "running" | "completed" | "failed";
  currentActivity: string;
  updatedAt?: string;
}

export interface VisualWorkbenchState {
  sessionId: string;
  topic: string;
  runner: RunnerVisualState;
  agents: AgentVisualState[];
}
```

## Event Mapping

The first implementation uses deterministic event rules:

| Input | Result |
| --- | --- |
| Session exists without live events | Runner status is based on session status and agents start from `idle`. |
| `session.started` | Runner becomes `running`; all agents become `idle`. |
| `speaker.active` | Matching agent becomes `thinking`; all other non-terminal agents become `idle`. |
| `message.appended` | Sender becomes `speaking`; `lastMessagePreview` updates. |
| `action.created` | Action owner becomes `executing`; `lastActionSummary` updates. |
| `execution.result` with `succeeded` | Result owner becomes `reviewing`; `lastExecutionSummary` updates. |
| `execution.result` with `failed` | Result owner becomes `failed`; `lastExecutionSummary` updates. |
| `session.completed` | Runner and all non-failed agents become `completed`. |
| `session.failed` | Runner becomes `failed`; active or all known agents become `failed`. |

Replay projection uses session records plus persisted messages, actions, and execution results. Since historic JSONL does not currently persist every live event, the replay projector derives the final state from persisted records and session status. Live projection applies each SSE event incrementally in the browser.

## Web API

Add:

```http
GET /api/sessions/:sessionId/visual-state
```

Response:

```json
{
  "sessionId": "example-session",
  "topic": "Build a web MVP",
  "runner": {
    "status": "completed",
    "currentActivity": "Session completed",
    "updatedAt": "2026-05-14T02:00:00.000Z"
  },
  "agents": [
    {
      "agentId": "hermes-a",
      "name": "Hermes A",
      "role": "planner",
      "status": "completed",
      "currentActivity": "Session completed",
      "lastMessagePreview": "Planner summary...",
      "lastActionSummary": "write_file docs/plan.md",
      "lastExecutionSummary": "succeeded: Wrote docs/plan.md.",
      "updatedAt": "2026-05-14T02:00:00.000Z"
    }
  ]
}
```

The route uses the existing safe session-id validation through `readSessionReplay` and does not accept arbitrary file paths.

## Frontend UI

Add a Workbench tab next to Timeline:

```text
[Timeline] [Workbench]
```

The first view is a compact operational dashboard:

```text
Agent Visual Workbench

Runner
Status: Running / Completed / Failed
Current activity: Coordinating session...

Planner Card
Status: Thinking / Speaking / Executing / Completed
Current activity
Last message preview
Last action/result summary

Builder Card
Status: Thinking / Speaking / Executing / Completed
Current activity
Last message preview
Last action/result summary
```

Cards use color and subtle animation for state:

- `thinking`: blue pulse
- `speaking`: teal border
- `executing`: amber pulse
- `reviewing`: violet accent
- `completed`: green
- `failed`: red
- `idle`: neutral

The UI remains inside the existing Web Runner Console and uses vanilla JavaScript and CSS.

## Live Behavior

When a new live session starts:

- Reset the frontend workbench state.
- Initialize Runner, Planner, and Builder from the form inputs.
- Apply each SSE event through a frontend visual-state helper.
- Re-render the workbench cards after each relevant event.

When a session completes:

- Load replay as today.
- Also load `/api/sessions/:sessionId/visual-state`.
- Render the final state from the replay API.

## Replay Behavior

When a user selects an existing session:

- Existing summary, timeline, execution, and workspace file panels still load as before.
- The frontend calls the visual-state API.
- The Workbench tab renders the final projected state.

## Version Control Plan

Use branch:

```bash
feature/phase-5-agent-visual-workbench
```

Use version:

```text
v0.4.0
```

Keep commits small and reviewable:

1. `add-phase-5-visual-workbench-design`
2. `add-visual-state-domain-tests`
3. `add-visual-state-projector`
4. `add-visual-state-web-api`
5. `add-workbench-static-ui-test`
6. `add-workbench-ui-shell`
7. `add-live-workbench-updates`
8. `document-phase-5-workbench`
9. `release-v0.4.0-agent-visual-workbench`

Merge strategy:

- Keep the feature branch until tests and browser smoke pass.
- Merge back to `main` after the release commit.
- Tag `v0.4.0` on the final merged release commit.
- Do not squash, because the feature crosses domain logic, API, frontend UI, docs, and release metadata.

## Test Strategy

Add tests at four levels:

1. Domain tests for the visual state projector.
2. Web handler tests for the new visual-state API.
3. Frontend static tests for the Workbench UI and helper functions.
4. Browser smoke test for loading a replay session and seeing Runner, Planner, and Builder cards.

Required verification before release:

```bash
node --check public/app.js
npm test
```

Browser smoke:

1. Start the Web Runner Console.
2. Open `http://127.0.0.1:3000`.
3. Select an existing session.
4. Confirm Timeline still renders.
5. Open Workbench.
6. Confirm Runner, Planner, and Builder visual cards render with non-empty status text.

## Risk Controls

- Keep visual state deterministic. Do not use LLM inference for status.
- Keep Workbench UI independent from Timeline rendering.
- Keep persisted UTC and JSONL formats unchanged.
- Keep Claw3D integration as a later adapter phase after the internal visual-state contract stabilizes.
