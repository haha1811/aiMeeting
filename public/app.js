const state = {
  defaultConfig: undefined,
  selectedSessionId: undefined
};

const $ = (id) => document.getElementById(id);

window.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadDefaults();
    await loadSessions();
    $("run-form").addEventListener("submit", runSession);
    $("resetButton").addEventListener("click", applyDefaults);
  } catch (error) {
    setStatus(error.message, "failed");
  }
});

async function loadDefaults() {
  state.defaultConfig = await fetchJson("/api/default-config");
  applyDefaults();
}

function applyDefaults() {
  const config = state.defaultConfig;
  if (!config) return;
  $("topic").value = config.topic ?? "";
  $("maxRounds").value = String(config.maxRounds ?? 2);
  $("enableExecution").checked = Boolean(config.enableExecution);
  $("plannerUrl").value = config.agents?.[0]?.url ?? "";
  $("builderUrl").value = config.agents?.[1]?.url ?? "";
}

async function runSession(event) {
  event.preventDefault();
  setStatus("Running session...", "running");
  $("runButton").disabled = true;

  try {
    const request = {
      topic: $("topic").value,
      maxRounds: Number($("maxRounds").value),
      enableExecution: $("enableExecution").checked,
      agents: [
        {
          id: "hermes-a",
          name: "Hermes A",
          role: "planner",
          type: "http",
          url: $("plannerUrl").value,
          timeoutMs: 300000
        },
        {
          id: "hermes-b",
          name: "Hermes B",
          role: "builder",
          type: "http",
          url: $("builderUrl").value,
          timeoutMs: 300000
        }
      ]
    };
    const result = await fetchJson("/api/sessions/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request)
    });
    setStatus(`Completed session ${result.sessionId}`, "completed");
    await loadSessions();
    await loadReplay(result.sessionId);
  } catch (error) {
    setStatus(error.message, "failed");
  } finally {
    $("runButton").disabled = false;
  }
}

async function loadSessions() {
  const sessions = await fetchJson("/api/sessions");
  $("session-list").innerHTML = sessions.map((session) => `
    <button class="session-item" data-session-id="${escapeHtml(session.sessionId)}">
      <strong>${escapeHtml(session.status)}</strong>
      <span>${escapeHtml(session.topic)}</span>
      <small>${escapeHtml(session.updatedAt)}</small>
    </button>
  `).join("");
  document.querySelectorAll("[data-session-id]").forEach((button) => {
    button.addEventListener("click", () => loadReplay(button.dataset.sessionId));
  });
}

async function loadReplay(sessionId) {
  state.selectedSessionId = sessionId;
  const replay = await fetchJson(`/api/sessions/${encodeURIComponent(sessionId)}`);
  renderSummary(replay);
  renderTimeline(replay);
  renderExecution(replay);
  renderWorkspaceFiles(replay.workspaceFiles);
}

function renderSummary(replay) {
  const result = replay.result;
  const session = replay.session;
  $("summary").innerHTML = [
    ["Session", session.sessionId],
    ["Status", result?.status ?? session.status],
    ["Messages", String(replay.messages.length)],
    ["Actions", String(replay.actions.length)],
    ["Execution Results", String(replay.executionResults.length)],
    ["Workspace", session.workspace?.repoPath ?? ""]
  ].map(([label, value]) => `
    <article class="summary-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `).join("");
}

function renderTimeline(replay) {
  $("timeline").innerHTML = replay.messages.map((message) => {
    const assignments = message.taskAssignments ?? [];
    const actions = message.executionActions ?? [];
    const results = message.executionResults ?? [];
    return `
      <article class="message-card ${escapeHtml(message.senderRole ?? "")}">
        <header>
          <strong>${escapeHtml(message.senderName)}</strong>
          <span>${escapeHtml(message.senderRole ?? "agent")}</span>
          <small>round ${message.round}</small>
        </header>
        <p>${escapeHtml(message.content)}</p>
        ${renderMiniList("Assignments", assignments.map((item) => item.title))}
        ${renderMiniList("Actions", actions.map((item) => `${item.type} ${item.path ?? item.command ?? ""}`))}
        ${renderMiniList("Results", results.map((item) => `${item.status}: ${item.summary}`))}
      </article>
    `;
  }).join("");
}

function renderExecution(replay) {
  const succeeded = replay.executionResults.filter((item) => item.status === "succeeded").length;
  const failed = replay.executionResults.filter((item) => item.status === "failed").length;
  $("execution").innerHTML = `
    <div class="execution-counts">
      <span>${succeeded} succeeded</span>
      <span>${failed} failed</span>
    </div>
    ${replay.executionResults.map((result) => `
      <article class="execution-result ${escapeHtml(result.status)}">
        <strong>${escapeHtml(result.status)}</strong>
        <p>${escapeHtml(result.summary)}</p>
        ${result.outputPreview ? `<pre>${escapeHtml(result.outputPreview)}</pre>` : ""}
        ${result.error ? `<pre>${escapeHtml(result.error)}</pre>` : ""}
      </article>
    `).join("")}
  `;
}

function renderWorkspaceFiles(files) {
  $("workspace-files").innerHTML = files.length
    ? files.map((file) => `<div class="file-row"><span>${escapeHtml(file.path)}</span><small>${file.size} bytes</small></div>`).join("")
    : `<p class="empty">No workspace files found.</p>`;
}

function renderMiniList(title, items) {
  if (!items.length) return "";
  return `<div class="mini-list"><strong>${escapeHtml(title)}</strong>${items.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`;
}

function setStatus(message, status) {
  const banner = $("status-banner");
  banner.textContent = message;
  banner.className = `status-banner ${status}`;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(parsed.error ?? `Request failed with ${response.status}`);
  }
  return parsed;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
