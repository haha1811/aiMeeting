# Timeline Usability Design

## Purpose

Improve the Web Runner Console when Planner and Builder produce long responses.

Today, every message card renders the full response inline. Long Planner / Builder messages make the page very tall, so the user must scroll down to see the latest information and scroll back up to operate Runner Control.

This design keeps the current Live Monitor and Replay behavior, but adds better information density and local scrolling.

## Scope

This is a frontend-only UI hardening change.

Files expected to change during implementation:

- `public/index.html`
- `public/app.js`
- `public/styles.css`

No backend API, session model, SSE event shape, persistence, Hermes wrapper, or action executor change is required.

## Goals

- Reduce page-height growth caused by long agent responses.
- Keep Runner Control easy to access during long sessions.
- Let users quickly scan message summaries.
- Let users expand a specific Planner or Builder response when detail is needed.
- Preserve the existing chronological timeline order.
- Preserve existing replay and live event behavior.

## Non-Goals

- Do not reverse timeline order.
- Do not add search or filtering in this version.
- Do not add a multi-session dashboard.
- Do not change how messages are stored.
- Do not summarize with an LLM; use deterministic truncation only.

## Recommended UI Behavior

### Page Layout

Keep the existing two-column layout:

```text
Runner Control | Main Panel
```

On desktop:

- The left runner panel remains independently scrollable.
- The right main panel becomes a bounded vertical workspace.
- Status, live strip, and summary remain at the top of the right panel.
- The content area below becomes the primary scrollable area.

On mobile:

- Keep the existing stacked layout.
- Avoid sticky panels that would consume too much vertical space.

### Timeline Container

The Meeting Timeline should have its own scroll area instead of forcing the entire page to grow.

Expected behavior:

- Timeline scrolls independently.
- Execution / Workspace area remains visible beside it on desktop.
- The page no longer requires long full-page scrolling to reach new messages.

### Message Card Collapse

Each message card should support collapsed and expanded states.

Default state:

- Collapsed.
- Show header: sender, role, round.
- Show a deterministic preview of the response.
- Show counts for assignments, actions, and results.
- Show an `Expand` button when the full response is longer than the preview.

Expanded state:

- Show full message content.
- Show current assignments / actions / results detail.
- Show a `Collapse` button.

Preview rule:

- Use a deterministic client-side preview.
- Recommended threshold: first 600 characters or first 6 lines, whichever is shorter.
- Preserve whitespace with `white-space: pre-wrap`.
- Do not mutate stored message content.

### Live Auto-Scroll

When a live message arrives:

- If the user is already near the bottom of the timeline, auto-scroll to the new message.
- If the user is reading older content, do not force scroll.
- Optionally show a small `New messages` button or indicator that scrolls to bottom.

This prevents the UI from jumping while the user is reading an earlier response.

### Controls

Minimum controls:

- Per-card `Expand`.
- Per-card `Collapse`.

Optional controls if implementation remains simple:

- `Expand all`.
- `Collapse all`.
- `Scroll to latest`.

The optional controls should not block the first implementation.

## Data Flow

Replay:

```text
GET /api/sessions/:sessionId
  -> renderTimeline(replay)
  -> renderMessageCard(message, collapsed)
```

Live:

```text
SSE message.appended
  -> appendLiveMessage(message)
  -> renderMessageCard(message, collapsed)
  -> auto-scroll only when user is near bottom
```

Collapse state is client-only. It should not be persisted to session files.

## Accessibility

Buttons should be actual `<button>` elements.

Each expand/collapse button should:

- Have text label `Expand` or `Collapse`.
- Set `aria-expanded`.
- Target the related message body with `aria-controls` when practical.

The message preview should remain readable without relying on color alone.

## Error Handling

If JavaScript fails while rendering a message card:

- Do not lose the raw message.
- Fall back to rendering escaped full content.

If a message has no content:

- Render a short empty-state text inside the card.

## Testing Strategy

Add focused frontend smoke checks where possible:

- `public/app.js` contains collapse/expand helpers.
- `public/app.js` still uses `/api/sessions/jobs` and `EventSource`.
- `node --check public/app.js` passes.
- Existing `npm test` passes.

Manual browser validation:

- Start `npm run web`.
- Open the Web console.
- Load or run a session with long Planner / Builder responses.
- Confirm message cards are collapsed by default.
- Expand a card and verify full text appears.
- Collapse a card and verify preview returns.
- Confirm timeline scrolls independently.
- Confirm Runner Control remains easy to reach.

## Versioning

This should be a patch release if implemented without backend changes.

Recommended version:

```text
v0.3.3
```

## Acceptance Criteria

- Long Planner / Builder responses no longer force full-page scrolling.
- Each long message can be expanded and collapsed.
- Existing replay sessions still render correctly.
- Live messages append correctly in collapsed state.
- Existing tests pass.
- Browser smoke confirms the UI is usable during long responses.
