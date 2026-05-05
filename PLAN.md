# Multi-Hermes Agent Discussion Feature

## Summary
Build a TypeScript/Node v1 feature where two or more Hermes agent instances can join the same meeting-room session, discuss under a moderator-controlled turn loop, and produce task assignments at the end. Since the current workspace is empty, implement this as a small standalone core module that can later be wired into an API or UI.

## Key Changes
- Add a `HermesAgent` interface with `id`, `name`, optional `role`, and an async `respond(context)` method.
- Add a `DiscussionSession` model containing `sessionId`, `topic`, `agents`, `messages`, `status`, `maxRounds`, and final `taskAssignments`.
- Add a `Moderator`/scheduler that:
  - starts a session with 2+ agents,
  - controls speaker order,
  - injects the latest discussion context into each agent,
  - stops after `maxRounds` or when enough task assignments are produced,
  - generates final assignments per agent.
- Persist discussion records as append-only JSONL files:
  - `sessions/<sessionId>/messages.jsonl`
  - `sessions/<sessionId>/events.jsonl`
  - `sessions/<sessionId>/result.json`
- Expose a simple service API:
  - `createSession({ topic, agents, maxRounds })`
  - `runSession(sessionId)`
  - `appendMessage(sessionId, message)`
  - `getSession(sessionId)`
  - `getResult(sessionId)`

## Behavior
- Use a meeting-room discussion model, not direct private messages.
- Use moderator-controlled turns as the default coordination strategy.
- Run all Hermes agents as multiple instances inside the same Node process for v1.
- Final output should prioritize task assignments, including:
  - assigned agent,
  - task title,
  - task detail,
  - dependencies if any,
  - confidence or rationale if useful.
- Keep the design adapter-friendly so future versions can support remote agents over HTTP/WebSocket without changing session semantics.

## Test Plan
- Unit test that a session rejects fewer than 2 agents.
- Unit test that moderator turn order is deterministic.
- Unit test that messages are appended to JSONL in order.
- Unit test that `maxRounds` stops the discussion.
- Unit test that final task assignments are written to `result.json`.
- Integration test with 2-3 fake Hermes agents returning deterministic responses.

## Assumptions
- Implementation target is TypeScript/Node.
- v1 does not require a browser UI.
- v1 persistence uses files, not a database.
- v1 agents run in the same process; remote agent support is a later adapter layer.
- Since no existing repo files are present, this plan assumes a new standalone module can be created in the current workspace.
