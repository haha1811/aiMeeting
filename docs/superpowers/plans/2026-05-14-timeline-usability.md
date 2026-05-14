# Timeline Usability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the Web Runner Console so long Planner / Builder responses do not force full-page scrolling and each message can be expanded or collapsed.

**Architecture:** Keep the current frontend-only static app. Add deterministic message previews and client-only collapse state in `public/app.js`, then constrain scrolling through CSS layout updates in `public/styles.css`. Preserve the current API, SSE events, replay loading, and chronological timeline order.

**Tech Stack:** Static HTML, vanilla JavaScript, CSS, Node test runner, TypeScript build for existing backend tests.

---

## File Structure

- `public/index.html`: Add timeline toolbar controls for optional `Collapse all`, `Expand all`, and `Latest` actions.
- `public/app.js`: Add client-side message collapse state, preview generation, card expand/collapse handlers, timeline auto-scroll behavior, and toolbar button wiring.
- `public/styles.css`: Add bounded scroll layout, message preview styling, card control styling, and mobile-safe layout rules.
- `test/frontend-static.test.ts`: Add static checks for frontend helper names and preserved live APIs.
- `CHANGELOG.md`: Add `v0.3.3` release notes.
- `package.json` and `package-lock.json`: Bump version to `0.3.3`.

---

## Task 1: Static Frontend Regression Tests

**Files:**
- Create: `test/frontend-static.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/frontend-static.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

test("frontend keeps live APIs and adds timeline collapse helpers", async () => {
  const app = await readFile("public/app.js", "utf8");
  const html = await readFile("public/index.html", "utf8");
  const css = await readFile("public/styles.css", "utf8");

  assert.match(app, /\\/api\\/sessions\\/jobs/);
  assert.match(app, /EventSource/);
  assert.match(app, /function getMessagePreview/);
  assert.match(app, /function toggleMessageExpanded/);
  assert.match(app, /function isTimelineNearBottom/);
  assert.match(app, /function scrollTimelineToLatest/);

  assert.match(html, /timeline-toolbar/);
  assert.match(html, /collapseAllButton/);
  assert.match(html, /expandAllButton/);
  assert.match(html, /latestButton/);

  assert.match(css, /timeline-scroll/);
  assert.match(css, /message-content\\.collapsed/);
  assert.match(css, /message-card-actions/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
export PATH=/home/haha/.local/node/node-v22.22.2-linux-x64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
npm run build
node --test dist/test/frontend-static.test.js
```

Expected:

```text
not ok - frontend keeps live APIs and adds timeline collapse helpers
```

The failure should mention missing helpers such as `getMessagePreview`.

- [ ] **Step 3: Commit the failing test**

```bash
git add test/frontend-static.test.ts
git commit -m add-frontend-timeline-static-test
```

---

## Task 2: Timeline Toolbar Markup

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: Add timeline toolbar controls**

Replace this block in `public/index.html`:

```html
          <div>
            <h2>Meeting Timeline</h2>
            <div id="timeline" class="timeline"></div>
          </div>
```

With:

```html
          <div class="timeline-panel">
            <div class="section-heading">
              <h2>Meeting Timeline</h2>
              <div class="timeline-toolbar" aria-label="Timeline controls">
                <button id="collapseAllButton" type="button" class="secondary compact">Collapse all</button>
                <button id="expandAllButton" type="button" class="secondary compact">Expand all</button>
                <button id="latestButton" type="button" class="secondary compact">Latest</button>
              </div>
            </div>
            <div id="timeline" class="timeline timeline-scroll"></div>
          </div>
```

- [ ] **Step 2: Run static test**

Run:

```bash
export PATH=/home/haha/.local/node/node-v22.22.2-linux-x64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
npm run build
node --test dist/test/frontend-static.test.js
```

Expected:

```text
not ok
```

The helper assertions should still fail because `public/app.js` and `public/styles.css` are not implemented yet.

- [ ] **Step 3: Commit toolbar markup**

```bash
git add public/index.html
git commit -m add-timeline-toolbar-markup
```

---

## Task 3: Message Collapse State and Rendering

**Files:**
- Modify: `public/app.js`

- [ ] **Step 1: Extend frontend state and wire toolbar buttons**

Update the `state` object at the top of `public/app.js` to:

```js
const state = {
  defaultConfig: undefined,
  selectedSessionId: undefined,
  liveSource: undefined,
  liveEventCount: 0,
  expandedMessages: new Set()
};
```

Inside the `DOMContentLoaded` callback, after existing button event listeners, add:

```js
    $("collapseAllButton").addEventListener("click", collapseAllMessages);
    $("expandAllButton").addEventListener("click", expandAllMessages);
    $("latestButton").addEventListener("click", scrollTimelineToLatest);
```

- [ ] **Step 2: Preserve collapse state per session load**

At the top of `runSession(event)`, after `resetLiveView();`, add:

```js
    state.expandedMessages.clear();
```

At the top of `loadReplay(sessionId)`, after `state.selectedSessionId = sessionId;`, add:

```js
  state.expandedMessages.clear();
```

- [ ] **Step 3: Replace message rendering helper**

Replace the existing `renderMessageCard(message)` function with:

```js
function renderMessageCard(message) {
  const assignments = message.taskAssignments ?? [];
  const actions = message.executionActions ?? [];
  const results = message.executionResults ?? [];
  const content = message.content || "(empty message)";
  const preview = getMessagePreview(content);
  const isExpandable = preview !== content;
  const isExpanded = state.expandedMessages.has(message.id);
  const visibleContent = isExpanded || !isExpandable ? content : preview;
  const bodyId = `message-body-${escapeAttribute(message.id)}`;
  const role = escapeHtml(message.senderRole ?? "");

  return `
    <article class="message-card ${role}" data-message-id="${escapeAttribute(message.id)}">
      <header>
        <div>
          <strong>${escapeHtml(message.senderName)}</strong>
          <span>${escapeHtml(message.senderRole ?? "agent")}</span>
          <small>round ${message.round}</small>
        </div>
        <div class="message-card-actions">
          ${renderCountBadge("Assignments", assignments.length)}
          ${renderCountBadge("Actions", actions.length)}
          ${renderCountBadge("Results", results.length)}
          ${isExpandable ? `
            <button
              type="button"
              class="secondary compact message-toggle"
              data-message-toggle="${escapeAttribute(message.id)}"
              aria-expanded="${isExpanded ? "true" : "false"}"
              aria-controls="${bodyId}"
            >${isExpanded ? "Collapse" : "Expand"}</button>
          ` : ""}
        </div>
      </header>
      <p id="${bodyId}" class="message-content ${isExpanded || !isExpandable ? "expanded" : "collapsed"}">${escapeHtml(visibleContent)}</p>
      ${isExpandable && !isExpanded ? `<p class="message-preview-note">Preview shown. Expand to read the full response.</p>` : ""}
      ${isExpanded || !isExpandable ? renderMiniList("Assignments", assignments.map((item) => item.title)) : ""}
      ${isExpanded || !isExpandable ? renderMiniList("Actions", actions.map((item) => `${item.type} ${item.path ?? item.command ?? ""}`)) : ""}
      ${isExpanded || !isExpandable ? renderMiniList("Results", results.map((item) => `${item.status}: ${item.summary}`)) : ""}
    </article>
  `;
}
```

- [ ] **Step 4: Add helper functions**

Add these helper functions after `renderMessageCard(message)`:

```js
function getMessagePreview(content) {
  const maxCharacters = 600;
  const maxLines = 6;
  const lines = String(content).split("\n");
  const linePreview = lines.slice(0, maxLines).join("\n");
  const limited = linePreview.length > maxCharacters
    ? `${linePreview.slice(0, maxCharacters).trimEnd()}...`
    : linePreview;

  if (lines.length > maxLines || String(content).length > limited.length) {
    return limited.endsWith("...") ? limited : `${limited.trimEnd()}...`;
  }

  return String(content);
}

function renderCountBadge(label, count) {
  return `<span class="count-badge">${escapeHtml(label)}: ${count}</span>`;
}

function attachMessageToggleHandlers() {
  document.querySelectorAll("[data-message-toggle]").forEach((button) => {
    button.addEventListener("click", () => toggleMessageExpanded(button.dataset.messageToggle));
  });
}

function toggleMessageExpanded(messageId) {
  if (!messageId) return;
  if (state.expandedMessages.has(messageId)) {
    state.expandedMessages.delete(messageId);
  } else {
    state.expandedMessages.add(messageId);
  }
  rerenderCurrentTimeline();
}

function collapseAllMessages() {
  state.expandedMessages.clear();
  rerenderCurrentTimeline();
}

function expandAllMessages() {
  document.querySelectorAll("[data-message-id]").forEach((card) => {
    if (card.dataset.messageId) {
      state.expandedMessages.add(card.dataset.messageId);
    }
  });
  rerenderCurrentTimeline();
}

function rerenderCurrentTimeline() {
  const messages = [...document.querySelectorAll("[data-message-json]")]
    .map((element) => JSON.parse(element.textContent));
  $("timeline").innerHTML = messages.map(renderMessageCardWithState).join("");
  attachMessageToggleHandlers();
}

function renderMessageCardWithState(message) {
  return `${renderMessageCard(message)}<script type="application/json" data-message-json="${escapeAttribute(message.id)}">${escapeHtml(JSON.stringify(message))}</script>`;
}
```

- [ ] **Step 5: Update timeline render and append paths**

Replace `renderTimeline(replay)` with:

```js
function renderTimeline(replay) {
  $("timeline").innerHTML = replay.messages.map(renderMessageCardWithState).join("");
  attachMessageToggleHandlers();
}
```

Replace `appendLiveMessage(message)` with:

```js
function appendLiveMessage(message) {
  const container = $("timeline");
  const shouldAutoScroll = isTimelineNearBottom();
  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderMessageCardWithState(message);
  container.appendChild(wrapper.firstElementChild);
  container.appendChild(wrapper.lastElementChild);
  attachMessageToggleHandlers();
  if (shouldAutoScroll) {
    scrollTimelineToLatest();
  }
}
```

- [ ] **Step 6: Add scroll helpers and attribute escaping**

Add near the bottom before `escapeHtml(value)`:

```js
function isTimelineNearBottom() {
  const timeline = $("timeline");
  return timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight < 80;
}

function scrollTimelineToLatest() {
  const timeline = $("timeline");
  timeline.scrollTop = timeline.scrollHeight;
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
```

- [ ] **Step 7: Run JS syntax check and static test**

Run:

```bash
export PATH=/home/haha/.local/node/node-v22.22.2-linux-x64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
node --check public/app.js
npm run build
node --test dist/test/frontend-static.test.js
```

Expected:

```text
node --check passes
frontend-static test still fails only on CSS selectors if styles are not yet implemented
```

- [ ] **Step 8: Commit JS behavior**

```bash
git add public/app.js
git commit -m add-collapsible-timeline-message-rendering
```

---

## Task 4: Bounded Timeline Layout and Styles

**Files:**
- Modify: `public/styles.css`

- [ ] **Step 1: Add bounded desktop layout**

In `public/styles.css`, replace:

```css
.runner-panel {
  background: #ffffff;
  border-right: 1px solid #d8dee8;
  padding: 24px;
  overflow: auto;
}
```

With:

```css
.runner-panel {
  background: #ffffff;
  border-right: 1px solid #d8dee8;
  padding: 24px;
  overflow: auto;
  max-height: 100vh;
}
```

Replace:

```css
.main-panel {
  padding: 24px;
  overflow: auto;
}
```

With:

```css
.main-panel {
  min-height: 0;
  max-height: 100vh;
  padding: 24px;
  overflow: hidden;
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr);
}
```

- [ ] **Step 2: Add timeline toolbar styles**

Add after `h1, h2` rules:

```css
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.section-heading h2 {
  margin-bottom: 0;
}

.timeline-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
```

Add after `button.secondary`:

```css
button.compact {
  padding: 6px 8px;
  font-size: 12px;
}
```

- [ ] **Step 3: Add scroll and card styles**

Replace:

```css
.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 20px;
}

.timeline, .execution-panel {
  display: grid;
  gap: 12px;
}
```

With:

```css
.content-grid {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 20px;
}

.timeline-panel,
.execution-panel {
  min-height: 0;
}

.timeline,
.execution-panel {
  display: grid;
  gap: 12px;
}

.timeline-scroll {
  max-height: calc(100vh - 280px);
  overflow: auto;
  padding-right: 4px;
}
```

Replace message header styles:

```css
.message-card header {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
```

With:

```css
.message-card header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 8px;
}
```

Add after `.message-card p`:

```css
.message-content.collapsed {
  max-height: 9.5em;
  overflow: hidden;
}

.message-preview-note {
  margin: 8px 0 0;
  color: #697386;
  font-size: 12px;
}

.message-card-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.count-badge {
  background: #f6f8fb;
  border: 1px solid #d8dee8;
  border-radius: 4px;
  color: #3d4758;
  font-size: 12px;
  padding: 5px 7px;
}
```

- [ ] **Step 4: Update mobile rules**

Inside `@media (max-width: 980px)`, add:

```css
  .runner-panel,
  .main-panel {
    max-height: none;
  }

  .main-panel {
    overflow: visible;
    display: block;
  }

  .timeline-scroll {
    max-height: none;
    overflow: visible;
  }

  .section-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .message-card header {
    flex-direction: column;
  }

  .message-card-actions {
    justify-content: flex-start;
  }
```

- [ ] **Step 5: Run checks**

Run:

```bash
export PATH=/home/haha/.local/node/node-v22.22.2-linux-x64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
node --check public/app.js
npm run build
node --test dist/test/frontend-static.test.js
```

Expected:

```text
PASS
```

- [ ] **Step 6: Commit styles**

```bash
git add public/index.html public/app.js public/styles.css test/frontend-static.test.ts
git commit -m add-collapsible-timeline-ui
```

---

## Task 5: Documentation, Version, and Verification

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Bump version**

Run:

```bash
export PATH=/home/haha/.local/node/node-v22.22.2-linux-x64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
npm version 0.3.3 --no-git-tag-version
```

Expected:

```text
v0.3.3
```

- [ ] **Step 2: Update changelog**

Add this section to the top of `CHANGELOG.md`:

```markdown
## v0.3.3 - Timeline Usability

Released: 2026-05-14

### Added

- Added collapsible Planner / Builder message cards in the Web Runner Console.
- Added timeline controls for collapsing, expanding, and jumping to the latest message.

### Changed

- Constrained the Meeting Timeline to its own scroll area on desktop to reduce full-page scrolling.
- Kept long message previews deterministic and client-side only.
```

- [ ] **Step 3: Run full verification**

Run:

```bash
export PATH=/home/haha/.local/node/node-v22.22.2-linux-x64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
node --check public/app.js
npm test
```

Expected:

```text
node --check passes
npm test passes
```

- [ ] **Step 4: Commit release changes**

```bash
git add CHANGELOG.md package.json package-lock.json
git commit -m release-v0.3.3-timeline-usability
```

- [ ] **Step 5: Tag and push**

```bash
git tag -a v0.3.3 -m "v0.3.3 Timeline usability"
git push origin main
git push origin v0.3.3
```

Expected:

```text
main pushes to GitHub
v0.3.3 tag pushes to GitHub
```

---

## Final Verification Checklist

- `npm test` passes.
- `node --check public/app.js` passes.
- Long messages render collapsed by default.
- `Expand` shows full text and details.
- `Collapse` returns to preview.
- `Latest` scrolls the timeline to the bottom.
- Existing live session flow still uses `/api/sessions/jobs` and `EventSource`.
- GitHub has `main` and `v0.3.3`.
