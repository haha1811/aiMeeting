# Phase 3A.1 Web Console Usability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the Phase 3A Web Runner Console with planner/builder endpoint health checks and an obvious selected-session state.

**Architecture:** Add a runner-side health-check API so browser users can validate Hermes endpoint URLs without relying on browser-to-private-EC2 connectivity. Keep the selected session purely in the existing frontend state and render it as a highlighted session list item.

**Tech Stack:** TypeScript, Node built-in `http`, Node test runner, native browser HTML/CSS/JavaScript.

---

## File Structure

- Modify `src/web/types.ts`: add agent health check request/response types.
- Modify `src/web/validation.ts`: validate health-check URL input.
- Modify `src/web/handlers.ts`: add `checkAgentHealth()` and `/respond` to `/health` URL derivation.
- Modify `src/web/server.ts`: add `POST /api/agents/check` route.
- Modify `public/index.html`: add Check buttons and status slots beside Planner URL and Builder URL.
- Modify `public/app.js`: call health-check API, render green check / red X, and preserve selected session highlight.
- Modify `public/styles.css`: style endpoint rows, health statuses, and selected session item.
- Modify `test/web-validation.test.ts`: test invalid health-check URL.
- Modify `test/web-handlers.test.ts`: test health-check URL derivation, healthy endpoint, and failed endpoint.
- Modify `test/web-server.test.ts`: test `/api/agents/check`.
- Modify `docs/PHASE_3A_WEB_RUNNER_CONSOLE_USER_GUIDE.md`: document Check buttons and selected session.
- Modify `docs/PHASE_3A_WEB_RUNNER_CONSOLE_RUNBOOK.md`: document endpoint verification from Web UI.
- Modify `CHANGELOG.md`: add upcoming `v0.2.1` notes after implementation.

## Task 1: Agent Health Check Validation and Types

**Files:**
- Modify: `src/web/types.ts`
- Modify: `src/web/validation.ts`
- Test: `test/web-validation.test.ts`

- [ ] **Step 1: Write failing validation tests**

Add to `test/web-validation.test.ts`:

```ts
import { validateAgentHealthCheckRequest } from "../src/web/validation.js";

test("validateAgentHealthCheckRequest rejects invalid URL", () => {
  assert.throws(
    () => validateAgentHealthCheckRequest({ url: "not-a-url" }),
    /url must be a valid http or https URL/
  );
});

test("validateAgentHealthCheckRequest accepts respond URL", () => {
  assert.deepEqual(
    validateAgentHealthCheckRequest({ url: "http://10.100.1.21:4101/respond" }),
    { url: "http://10.100.1.21:4101/respond" }
  );
});
```

- [ ] **Step 2: Run tests and verify red**

Run:

```bash
npm test -- --test-name-pattern validateAgentHealthCheckRequest
```

Expected: build fails because `validateAgentHealthCheckRequest` is not exported.

- [ ] **Step 3: Add types**

Add to `src/web/types.ts`:

```ts
export interface WebAgentHealthCheckRequest {
  url: string;
}

export interface WebAgentHealthCheckResponse {
  ok: boolean;
  healthUrl: string;
  latencyMs?: number;
  agentId?: string;
  agentName?: string;
  agentRole?: string;
  wrapperVersion?: string;
  error?: string;
}
```

- [ ] **Step 4: Add validation implementation**

Add to `src/web/validation.ts`:

```ts
import type { WebAgentHealthCheckRequest } from "./types.js";

export function validateAgentHealthCheckRequest(value: unknown): WebAgentHealthCheckRequest {
  if (!isRecord(value)) {
    throw new Error("Request body must be a JSON object.");
  }

  if (typeof value.url !== "string" || !value.url.trim()) {
    throw new Error("url must be a non-empty string.");
  }

  assertHttpUrl(value.url.trim(), "agent");
  return { url: value.url.trim() };
}
```

Keep `assertHttpUrl()` private and reuse it.

- [ ] **Step 5: Run validation tests**

Run:

```bash
npm test -- --test-name-pattern validateAgentHealthCheckRequest
```

Expected: validation tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/web/types.ts src/web/validation.ts test/web-validation.test.ts
git commit -m add-agent-health-check-validation
```

## Task 2: Runner-Side Agent Health Check Handler

**Files:**
- Modify: `src/web/handlers.ts`
- Test: `test/web-handlers.test.ts`

- [ ] **Step 1: Write failing handler tests**

Add to `test/web-handlers.test.ts`:

```ts
import http from "node:http";
import { deriveHealthUrl, checkAgentHealth } from "../src/web/handlers.js";

test("deriveHealthUrl converts respond URL to health URL", () => {
  assert.equal(
    deriveHealthUrl("http://10.100.1.21:4101/respond"),
    "http://10.100.1.21:4101/health"
  );
});

test("checkAgentHealth returns wrapper metadata for healthy endpoint", async () => {
  const server = http.createServer((req, res) => {
    assert.equal(req.url, "/health");
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      wrapperVersion: "real-hermes-wrapper-action-json-v3",
      agentId: "hermes-a",
      agentName: "Hermes A",
      agentRole: "planner"
    }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  try {
    const result = await checkAgentHealth({ url: `http://127.0.0.1:${port}/respond` });
    assert.equal(result.ok, true);
    assert.equal(result.wrapperVersion, "real-hermes-wrapper-action-json-v3");
    assert.equal(result.agentId, "hermes-a");
    assert.equal(result.healthUrl, `http://127.0.0.1:${port}/health`);
    assert.equal(typeof result.latencyMs, "number");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("checkAgentHealth returns ok false for failed endpoint", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not ready" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  try {
    const result = await checkAgentHealth({ url: `http://127.0.0.1:${port}/respond` });
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /HTTP 500/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
```

- [ ] **Step 2: Run tests and verify red**

Run:

```bash
npm test -- --test-name-pattern "deriveHealthUrl|checkAgentHealth"
```

Expected: build fails because handler exports do not exist.

- [ ] **Step 3: Implement handler**

Add to `src/web/handlers.ts`:

```ts
import { validateAgentHealthCheckRequest } from "./validation.js";
import type { WebAgentHealthCheckResponse } from "./types.js";

export async function checkAgentHealth(request: unknown): Promise<WebAgentHealthCheckResponse> {
  const { url } = validateAgentHealthCheckRequest(request);
  const healthUrl = deriveHealthUrl(url);
  const started = Date.now();

  try {
    const response = await fetch(healthUrl, { method: "GET" });
    const raw = await response.text();
    const parsed = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    if (!response.ok) {
      return {
        ok: false,
        healthUrl,
        latencyMs: Date.now() - started,
        error: `HTTP ${response.status}: ${raw}`
      };
    }

    return {
      ok: Boolean(parsed.ok),
      healthUrl,
      latencyMs: Date.now() - started,
      agentId: stringField(parsed.agentId),
      agentName: stringField(parsed.agentName),
      agentRole: stringField(parsed.agentRole),
      wrapperVersion: stringField(parsed.wrapperVersion)
    };
  } catch (error) {
    return {
      ok: false,
      healthUrl,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export function deriveHealthUrl(respondUrl: string): string {
  const parsed = new URL(respondUrl);
  parsed.pathname = "/health";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
```

- [ ] **Step 4: Run handler tests**

Run:

```bash
npm test -- --test-name-pattern "deriveHealthUrl|checkAgentHealth"
```

Expected: tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/web/handlers.ts test/web-handlers.test.ts
git commit -m add-agent-health-check-handler
```

## Task 3: Health Check HTTP Route

**Files:**
- Modify: `src/web/server.ts`
- Test: `test/web-server.test.ts`

- [ ] **Step 1: Write failing server test**

Add to `test/web-server.test.ts`:

```ts
test("web server checks agent health through runner", async () => {
  const agentServer = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, wrapperVersion: "real-hermes-wrapper-action-json-v3" }));
  });
  await new Promise<void>((resolve) => agentServer.listen(0, "127.0.0.1", resolve));
  const agentAddress = agentServer.address();
  const agentPort = typeof agentAddress === "object" && agentAddress ? agentAddress.port : 0;

  const rootDir = await mkdtemp(join(tmpdir(), "web-sessions-"));
  const workspaceRootDir = await mkdtemp(join(tmpdir(), "web-workspaces-"));
  const server = createWebServer({ rootDir, workspaceRootDir, publicDir: "public" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/agents/check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: `http://127.0.0.1:${agentPort}/respond` })
    });
    const body = await response.json() as { ok: boolean; wrapperVersion: string };
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.wrapperVersion, "real-hermes-wrapper-action-json-v3");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => agentServer.close(() => resolve()));
  }
});
```

Make sure `http` is imported in this test file:

```ts
import http from "node:http";
```

- [ ] **Step 2: Run test and verify red**

Run:

```bash
npm test -- --test-name-pattern "checks agent health"
```

Expected: route returns 404 or test fails because `/api/agents/check` does not exist.

- [ ] **Step 3: Implement route**

Modify `src/web/server.ts` imports:

```ts
import {
  checkAgentHealth,
  getDefaultConfig,
  getSessionReplay,
  listSessionSummaries,
  runSessionFromWebRequest
} from "./handlers.js";
```

Add before `/api/sessions/run`:

```ts
if (req.method === "POST" && url.pathname === "/api/agents/check") {
  const body = await readJsonBody(req);
  await sendJson(res, 200, await checkAgentHealth(body));
  return;
}
```

- [ ] **Step 4: Run server test**

Run:

```bash
npm test -- --test-name-pattern "checks agent health"
```

Expected: test passes.

- [ ] **Step 5: Commit**

```bash
git add src/web/server.ts test/web-server.test.ts
git commit -m add-agent-health-check-api-route
```

## Task 4: Runner Control Check Buttons

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/styles.css`

- [ ] **Step 1: Update HTML controls**

Replace the Planner URL and Builder URL labels in `public/index.html` with:

```html
<div class="endpoint-field">
  <label>
    Planner URL
    <input id="plannerUrl" type="url" required>
  </label>
  <button id="checkPlannerButton" type="button" class="icon-button">Check</button>
  <span id="plannerHealth" class="health-status idle">-</span>
</div>
<div class="endpoint-field">
  <label>
    Builder URL
    <input id="builderUrl" type="url" required>
  </label>
  <button id="checkBuilderButton" type="button" class="icon-button">Check</button>
  <span id="builderHealth" class="health-status idle">-</span>
</div>
```

- [ ] **Step 2: Add frontend health-check behavior**

Modify `public/app.js`:

Add event listeners in `DOMContentLoaded`:

```js
$("checkPlannerButton").addEventListener("click", () => checkEndpoint("planner"));
$("checkBuilderButton").addEventListener("click", () => checkEndpoint("builder"));
```

Add functions:

```js
async function checkEndpoint(kind) {
  const inputId = kind === "planner" ? "plannerUrl" : "builderUrl";
  const healthId = kind === "planner" ? "plannerHealth" : "builderHealth";
  const buttonId = kind === "planner" ? "checkPlannerButton" : "checkBuilderButton";
  const status = $(healthId);
  const button = $(buttonId);
  status.className = "health-status checking";
  status.textContent = "Checking...";
  button.disabled = true;

  try {
    const result = await fetchJson("/api/agents/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: $(inputId).value })
    });
    if (result.ok) {
      status.className = "health-status ok";
      status.textContent = `✓ ${result.agentId ?? "OK"} ${result.wrapperVersion ?? ""}`.trim();
    } else {
      status.className = "health-status failed";
      status.textContent = `✕ ${result.error ?? "Failed"}`;
    }
  } catch (error) {
    status.className = "health-status failed";
    status.textContent = `✕ ${error.message}`;
  } finally {
    button.disabled = false;
  }
}
```

- [ ] **Step 3: Reset health states when defaults are applied**

In `applyDefaults()`, after setting URL fields:

```js
resetEndpointHealth();
```

Add:

```js
function resetEndpointHealth() {
  for (const id of ["plannerHealth", "builderHealth"]) {
    const status = $(id);
    status.className = "health-status idle";
    status.textContent = "-";
  }
}
```

- [ ] **Step 4: Add CSS**

Add to `public/styles.css`:

```css
.endpoint-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: end;
}

.endpoint-field .health-status {
  grid-column: 1 / -1;
}

.icon-button {
  min-width: 72px;
  background: #334155;
}

.health-status {
  min-height: 24px;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.health-status.idle { color: #697386; }
.health-status.checking { color: #173d8f; }
.health-status.ok { color: #17633a; }
.health-status.failed { color: #8f1d1d; }
```

- [ ] **Step 5: Build and smoke static assets**

Run:

```bash
npm run build
PORT=3100 node dist/src/web/server.js
```

In a second terminal:

```bash
curl -fsS http://127.0.0.1:3100/ | grep checkPlannerButton
curl -fsS http://127.0.0.1:3100/app.js | grep checkEndpoint
curl -fsS http://127.0.0.1:3100/styles.css | grep health-status
```

Expected: all grep commands find matching text. Stop server with Ctrl-C.

- [ ] **Step 6: Commit**

```bash
git add public/index.html public/app.js public/styles.css
git commit -m add-endpoint-health-check-controls
```

## Task 5: Selected Session Highlight

**Files:**
- Modify: `public/app.js`
- Modify: `public/styles.css`

- [ ] **Step 1: Refactor session list rendering**

Modify `loadSessions()` in `public/app.js`:

```js
async function loadSessions() {
  const sessions = await fetchJson("/api/sessions");
  renderSessionList(sessions);
}

function renderSessionList(sessions) {
  $("session-list").innerHTML = sessions.map((session) => {
    const selected = session.sessionId === state.selectedSessionId ? " selected" : "";
    return `
      <button class="session-item${selected}" data-session-id="${escapeHtml(session.sessionId)}">
        <strong>${escapeHtml(session.status)}</strong>
        <span>${escapeHtml(session.topic)}</span>
        <small>${escapeHtml(session.updatedAt)}</small>
      </button>
    `;
  }).join("");
  document.querySelectorAll("[data-session-id]").forEach((button) => {
    button.addEventListener("click", () => loadReplay(button.dataset.sessionId));
  });
}
```

- [ ] **Step 2: Refresh selected state after replay loads**

At the end of `loadReplay(sessionId)`:

```js
document.querySelectorAll("[data-session-id]").forEach((button) => {
  button.classList.toggle("selected", button.dataset.sessionId === state.selectedSessionId);
});
```

- [ ] **Step 3: Add selected CSS**

Add to `public/styles.css`:

```css
.session-item.selected {
  border-left: 4px solid #2454d6;
  background: #eef4ff;
}

.session-item.selected strong {
  color: #173d8f;
}
```

- [ ] **Step 4: Smoke static assets**

Run:

```bash
npm run build
PORT=3100 node dist/src/web/server.js
```

In a second terminal:

```bash
curl -fsS http://127.0.0.1:3100/app.js | grep renderSessionList
curl -fsS http://127.0.0.1:3100/styles.css | grep "session-item.selected"
```

Expected: both grep commands find matching text. Stop server with Ctrl-C.

- [ ] **Step 5: Commit**

```bash
git add public/app.js public/styles.css
git commit -m highlight-selected-web-session
```

## Task 6: Documentation and Version Notes

**Files:**
- Modify: `docs/PHASE_3A_WEB_RUNNER_CONSOLE_USER_GUIDE.md`
- Modify: `docs/PHASE_3A_WEB_RUNNER_CONSOLE_RUNBOOK.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update user guide**

In `docs/PHASE_3A_WEB_RUNNER_CONSOLE_USER_GUIDE.md`, add:

```md
### Endpoint Check Buttons

Planner URL and Builder URL each have a Check button.

Click Check before Run Session to ask the runner Web server to call the agent `/health` endpoint. A green `✓` means the runner can reach the agent wrapper. A red `✕` means the runner could not reach the agent or the wrapper returned an error.
```

Also update Sessions section:

```md
The currently selected session is highlighted with a blue left border and light blue background.
```

- [ ] **Step 2: Update runbook**

In `docs/PHASE_3A_WEB_RUNNER_CONSOLE_RUNBOOK.md`, add a short step before Run Session:

```md
Click Check next to Planner URL and Builder URL. Both should show a green `✓` before running the session.
```

- [ ] **Step 3: Update changelog**

Add at top of `CHANGELOG.md`:

```md
## v0.2.1 - Phase 3A.1 Web Console Usability

Released: 2026-05-11

### Added

- Added Planner URL and Builder URL health-check buttons in the Web Runner Console.
- Added selected-session highlight in the Sessions list.
```

- [ ] **Step 4: Run full tests**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add docs/PHASE_3A_WEB_RUNNER_CONSOLE_USER_GUIDE.md docs/PHASE_3A_WEB_RUNNER_CONSOLE_RUNBOOK.md CHANGELOG.md
git commit -m document-web-console-usability-improvements
```

## Task 7: Release v0.2.1

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Bump version**

Run:

```bash
npm version 0.2.1 --no-git-tag-version
```

- [ ] **Step 2: Run final verification**

Run:

```bash
npm test
PORT=3100 npm run web
```

In a second terminal:

```bash
curl -fsS http://127.0.0.1:3100/api/default-config
curl -fsS http://127.0.0.1:3100/
```

Stop server with Ctrl-C.

- [ ] **Step 3: Commit release**

```bash
git add package.json package-lock.json
git commit -m release-v0.2.1-web-console-usability
```

- [ ] **Step 4: Tag and push**

```bash
git tag v0.2.1
git push origin main --tags
```

## Self-Review

Spec coverage:

- Planner / Builder URL check buttons are covered by Tasks 1 through 4.
- Successful green check and failed red X states are covered by Task 4.
- Runner-side connectivity validation is covered by Tasks 2 and 3.
- Selected session highlight is covered by Task 5.
- User-facing documentation is covered by Task 6.
- Version separation as a patch release is covered by Task 7.

Out of scope:

- Live streaming.
- Automatic pre-run enforcement that both endpoints must pass health check.
- Browser-based E2E test framework.
- Authentication or multi-user access control.

