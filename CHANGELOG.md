# Changelog

## v0.3.2 - Runner Workspace Prompt Hardening

Released: 2026-05-13

### Changed

- Updated the real Hermes wrapper prompt to state that generated files live in the runner workspace, not on planner or builder hosts.
- Instructed planner and builder agents to use `read_file` or `run_command` actions for workspace verification.
- Documented runner workspace ownership in the Hermes agent guide and Phase 4 validation docs.

### Added

- Added a regression test for the real Hermes wrapper prompt workspace instructions.

## v0.3.1 - Phase 4 EC2 Validation Runbook

Released: 2026-05-13

### Added

- Added Phase 4 real EC2 Live Monitor validation design.
- Added Phase 4 three-EC2 validation runbook.
- Added Phase 4 validation record template.

### Changed

- Documented the required `agents/hermes-http-real.js` restore step before starting Hermes A and Hermes B wrappers.
- Documented `/health` verification to prevent running a locally modified wrapper without health-check support.

## v0.3.0 - Phase 3B Live Monitor

Released: 2026-05-11

### Added

- Added background Web session jobs through `POST /api/sessions/jobs`.
- Added Server-Sent Events live stream through `GET /api/sessions/:sessionId/events`.
- Added live Web UI updates for active speaker, messages, and execution results.
- Added live job registry and in-memory event bus.

### Preserved

- Phase 3A replay APIs remain available.
- Synchronous `POST /api/sessions/run` remains available for compatibility.

## v0.2.1 - Phase 3A.1 Web Console Usability

Released: 2026-05-11

### Added

- Added Planner URL and Builder URL health-check buttons in the Web Runner Console.
- Added runner-side `/api/agents/check` endpoint for validating Hermes wrapper connectivity.
- Added selected-session highlight in the Sessions list.

## v0.2.0 - Phase 3A Web Runner Console

Released: 2026-05-07

### Added

- Added runner-hosted Web console with `npm run web`.
- Added Web form for topic, max rounds, planner endpoint, builder endpoint, and execution toggle.
- Added replay view for session summary, planner / builder messages, task assignments, actions, execution results, and workspace files.
- Added Web API validation, safe session id guard, replay reader, API handlers, and static HTTP server.
- Added Phase 3A Web runner console runbook.

### Verified

- `npm test`: 25 passing tests.
- Local Web smoke: `/api/default-config`, `/api/sessions`, and `/` static route verified.

## v0.1.0 - Multi-Hermes Discussion and Execution MVP

Released: 2026-05-07

### Added

- Added moderated multi-Hermes discussion core.
- Added append-only JSONL persistence for messages, events, actions, and execution results.
- Added task assignment result output.
- Added Phase 2 execution workspace and executor.
- Added real Hermes HTTP wrapper and three-EC2 validation runbooks.

### Verified

- Real Hermes execution MVP completed on three EC2 instances.
- Successful validation session produced `executionResultCount: 10`.
