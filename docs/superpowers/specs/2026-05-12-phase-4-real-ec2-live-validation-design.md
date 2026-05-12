# Phase 4: Real EC2 Live Monitor Validation & Hardening Design

## Purpose

Phase 4 validates `v0.3.0` in a real three-EC2 deployment and defines the minimum hardening needed before treating the Web Live Monitor as operationally reliable.

The phase is validation-first. Code changes are optional and should only be made when real EC2 testing exposes a concrete usability or reliability gap.

## Scope

Phase 4 covers:

- Runner EC2 running the Web Runner Console.
- Hermes A EC2 running the planner wrapper.
- Hermes B EC2 running the builder wrapper.
- Browser-based execution from the runner Web UI.
- Live Monitor verification through Server-Sent Events.
- Persisted replay verification through `sessions/<sessionId>/*`.
- Workspace artifact verification through `workspaces/<sessionId>/repo`.
- A short hardening backlog for issues found during validation.

## Non-Scope

Phase 4 does not include:

- WebSocket migration.
- Login, authentication, or user management.
- Multi-session dashboard views.
- Durable SSE event replay buffer.
- Remote agent registry.
- Multi-run scheduling.
- Production deployment automation.

Those items are candidates for a later `v0.4.0` or Phase 5.

## Current Baseline

The baseline is `v0.3.0`.

Implemented capabilities:

- `POST /api/sessions/jobs` creates a background session job.
- `GET /api/sessions/:sessionId/events` streams live events over SSE.
- The Web UI shows live status, active speaker, live event count, timeline messages, and execution results.
- The Web UI loads persisted replay after completion.
- Late SSE subscribers receive the current job status.

## Architecture Under Test

```text
Browser
  -> runner EC2 Web Console
  -> runner LiveSessionJobRegistry
  -> hermes-a /respond
  -> hermes-b /respond
  -> runner action executor
  -> sessions/<sessionId>/*
  -> workspaces/<sessionId>/repo
```

Live data path:

```text
Discussion lifecycle hooks
  -> LiveEventBus
  -> SSE response
  -> Browser EventSource
  -> Live Monitor UI
```

Durable data path:

```text
DiscussionService
  -> messages.jsonl
  -> events.jsonl
  -> actions.jsonl
  -> execution-results.jsonl
  -> result.json
  -> replay API
  -> Browser replay view
```

## Validation Success Criteria

Phase 4 is complete when all required checks below pass on real EC2 instances:

- Runner Web Console starts with `HOST=0.0.0.0 PORT=3000 npm run web`.
- Browser can open `http://<runner-public-ip>:3000`.
- Planner URL health check shows success.
- Builder URL health check shows success.
- `Run Session` creates a live job.
- Live status changes during the run and reaches `completed`.
- Active speaker changes when Hermes A and Hermes B are called.
- Meeting Timeline receives messages before final replay loading.
- Execution panel receives results when actions are produced.
- Final replay loads after completion.
- `sessions/<sessionId>/result.json` exists and reports completed status.
- `sessions/<sessionId>/messages.jsonl` contains Hermes A and Hermes B messages.
- `sessions/<sessionId>/execution-results.jsonl` exists when actions are produced.
- `workspaces/<sessionId>/repo` contains expected artifacts when actions write files.

## Failure Classification

If validation fails, classify the failure as one of:

- Runner Web startup failure.
- Browser network access failure.
- Hermes wrapper health failure.
- Hermes CLI response failure.
- Runner-to-agent network failure.
- Live SSE connection failure.
- Live UI rendering failure.
- Action execution failure.
- Replay loading failure.
- Workspace artifact failure.

Each failure should record the session id, command output, relevant JSONL file, and observed browser symptom.

## Hardening Backlog

Only implement these if validation shows they are needed:

- Show current `sessionId` in the live status strip.
- Show failed job reason directly in the Web UI.
- Give a clearer SSE interruption message that tells the user to open replay.
- Keep `Run Session` disabled while a live run is active.
- Add explicit endpoint health timeout messaging.
- Add a read-only job status API if browser recovery needs it.

## Versioning Decision

Use this rule after validation:

- No code changes: keep `v0.3.0`; commit validation record only.
- Small operational fixes: release `v0.3.1`.
- New recovery model or API shape: plan `v0.4.0`.

## Deliverables

Phase 4 produces:

- `docs/PHASE_4_REAL_EC2_LIVE_VALIDATION_RUNBOOK.md`
- `docs/step_15_phase_4_real_ec2_live_validation_2026_05_12.md`
- Updated validation notes after the real EC2 run.

## Review Checklist

- The plan validates the exact `v0.3.0` Web Live Monitor behavior.
- The validation can be run manually by one operator with browser access.
- The success criteria are observable without reading application internals.
- Failures have enough classification to guide a follow-up fix.
- The scope avoids turning validation into a larger feature release.
