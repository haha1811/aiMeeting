const state = {
  defaultConfig: undefined,
  selectedSessionId: undefined,
  liveSource: undefined,
  liveEventCount: 0,
  timelineMessages: [],
  expandedMessages: new Set()
};

const $ = (id) => document.getElementById(id);

window.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadDefaults();
    await loadSessions();
    $("run-form").addEventListener("submit", runSession);
    $("resetButton").addEventListener("click", applyDefaults);
    $("checkPlannerButton").addEventListener("click", () => checkEndpoint("planner"));
    $("checkBuilderButton").addEventListener("click", () => checkEndpoint("builder"));
    $("collapseAllButton").addEventListener("click", collapseAllMessages);
    $("expandAllButton").addEventListener("click", expandAllMessages);
    $("latestButton").addEventListener("click", scrollTimelineToLatest);
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
  resetEndpointHealth();
}

async function checkEndpoint(kind) {
  const urlInput = kind === "planner" ? $("plannerUrl") : $("builderUrl");
  const button = kind === "planner" ? $("checkPlannerButton") : $("checkBuilderButton");
  const status = kind === "planner" ? $("plannerHealth") : $("builderHealth");

  setEndpointHealth(status, "checking", "...");
  button.disabled = true;

  try {
    const result = await fetchJson("/api/agents/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: urlInput.value })
    });
    if (!result.ok) {
      setEndpointHealth(status, "failed", "X", result.error ?? "Connection failed");
      return;
    }
    const agentLabel = [result.agentName, result.agentId].filter(Boolean).join(" / ");
    setEndpointHealth(status, "ok", "✓", agentLabel || "Connected");
  } catch (error) {
    setEndpointHealth(status, "failed", "X", error.message);
  } finally {
    button.disabled = false;
  }
}

function resetEndpointHealth() {
  setEndpointHealth($("plannerHealth"), "idle", "-", "Not checked");
  setEndpointHealth($("builderHealth"), "idle", "-", "Not checked");
}

function setEndpointHealth(element, status, text, title = "") {
  element.textContent = text;
  element.title = title;
  element.className = `health-status ${status}`;
  element.setAttribute("aria-label", title || text);
}

async function runSession(event) {
  event.preventDefault();
  setStatus("Creating live session...", "running");
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
    closeLiveSource();
    resetLiveView();
    state.expandedMessages.clear();
    const result = await fetchJson("/api/sessions/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request)
    });
    state.selectedSessionId = result.sessionId;
    setLiveStatus(result.status);
    setStatus(`Running session ${result.sessionId}`, "running");
    await loadSessions();
    connectLiveEvents(result.sessionId, result.eventsUrl);
  } catch (error) {
    setStatus(error.message, "failed");
  } finally {
    $("runButton").disabled = false;
  }
}

async function loadSessions() {
  const sessions = await fetchJson("/api/sessions");
  renderSessionList(sessions);
}

function renderSessionList(sessions) {
  $("session-list").innerHTML = sessions.map((session) => `
    <button class="session-item ${session.sessionId === state.selectedSessionId ? "selected" : ""}" data-session-id="${escapeHtml(session.sessionId)}">
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
  closeLiveSource();
  state.selectedSessionId = sessionId;
  state.expandedMessages.clear();
  const replay = await fetchJson(`/api/sessions/${encodeURIComponent(sessionId)}`);
  renderSummary(replay);
  renderTimeline(replay);
  renderExecution(replay);
  renderWorkspaceFiles(replay.workspaceFiles);
  document.querySelectorAll("[data-session-id]").forEach((button) => {
    button.classList.toggle("selected", button.dataset.sessionId === sessionId);
  });
}

function connectLiveEvents(sessionId, eventsUrl) {
  closeLiveSource();
  const source = new EventSource(eventsUrl);
  state.liveSource = source;

  const handle = (event) => {
    const payload = JSON.parse(event.data);
    state.liveEventCount += 1;
    $("liveEventCount").textContent = String(state.liveEventCount);
    handleLiveEvent(sessionId, payload);
  };

  [
    "session.queued",
    "session.started",
    "speaker.active",
    "message.appended",
    "action.created",
    "execution.result",
    "session.completed",
    "session.failed"
  ].forEach((eventType) => {
    source.addEventListener(eventType, handle);
  });

  source.onerror = () => {
    setStatus("Live event connection interrupted.", "failed");
  };
}

function handleLiveEvent(sessionId, event) {
  if (sessionId !== state.selectedSessionId) {
    return;
  }

  if (event.type === "session.started") {
    setLiveStatus("running");
    setStatus(`Running session ${sessionId}`, "running");
    return;
  }

  if (event.type === "speaker.active") {
    const speaker = event.data;
    $("activeSpeaker").textContent = `${speaker.agentName ?? speaker.agentId} (${speaker.role ?? "agent"})`;
    return;
  }

  if (event.type === "message.appended") {
    appendLiveMessage(event.data.message);
    return;
  }

  if (event.type === "execution.result") {
    appendLiveExecutionResult(event.data.result);
    return;
  }

  if (event.type === "session.completed") {
    setLiveStatus("completed");
    setStatus(`Completed session ${sessionId}`, "completed");
    closeLiveSource();
    loadSessions().then(() => loadReplay(sessionId)).catch((error) => setStatus(error.message, "failed"));
    return;
  }

  if (event.type === "session.failed") {
    setLiveStatus("failed");
    setStatus(event.data.error ?? `Session ${sessionId} failed`, "failed");
    closeLiveSource();
  }
}

function appendLiveMessage(message) {
  const shouldScroll = isTimelineNearBottom();
  const container = $("timeline");
  const wrapper = document.createElement("div");
  state.timelineMessages.push(message);
  wrapper.innerHTML = renderMessageCard(message);
  container.appendChild(wrapper.firstElementChild);
  attachMessageToggleHandlers(container.lastElementChild);
  if (shouldScroll) {
    scrollTimelineToLatest();
  }
}

function appendLiveExecutionResult(result) {
  const container = $("execution");
  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderExecutionResult(result);
  container.appendChild(wrapper.firstElementChild);
}

function closeLiveSource() {
  if (state.liveSource) {
    state.liveSource.close();
    state.liveSource = undefined;
  }
}

function resetLiveView() {
  state.liveEventCount = 0;
  state.timelineMessages = [];
  state.expandedMessages.clear();
  $("liveEventCount").textContent = "0";
  $("activeSpeaker").textContent = "none";
  setLiveStatus("queued");
  $("timeline").innerHTML = "";
  $("execution").innerHTML = "";
  $("workspace-files").innerHTML = "";
  $("summary").innerHTML = "";
}

function setLiveStatus(status) {
  $("liveStatus").textContent = status;
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
  state.timelineMessages = replay.messages ?? [];
  $("timeline").innerHTML = state.timelineMessages.map(renderMessageCard).join("");
  attachMessageToggleHandlers();
}

function renderMessageCard(message) {
  const assignments = message.taskAssignments ?? [];
  const actions = message.executionActions ?? [];
  const results = message.executionResults ?? [];
  const messageId = message.id ?? `${message.senderId ?? message.senderName}-${message.round}`;
  const content = message.content || "(empty message)";
  const preview = getMessagePreview(content);
  const isExpandable = preview !== content;
  const isExpanded = state.expandedMessages.has(messageId);
  const visibleContent = isExpanded || !isExpandable ? content : preview;
  const contentClass = isExpandable && !isExpanded ? "message-content collapsed" : "message-content";
  const bodyId = `message-body-${escapeAttribute(messageId)}`;

  return `
    <article class="message-card ${escapeHtml(message.senderRole ?? "")}" data-message-id="${escapeAttribute(messageId)}">
      <header>
        <div class="message-meta">
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
              data-message-id="${escapeAttribute(messageId)}"
              aria-expanded="${String(isExpanded)}"
              aria-controls="${bodyId}"
            >${isExpanded ? "Collapse" : "Expand"}</button>
          ` : ""}
        </div>
      </header>
      <p id="${bodyId}" class="${contentClass}">${escapeHtml(visibleContent)}</p>
      ${isExpandable && !isExpanded ? `<p class="message-preview-note">Preview shown. Expand to read the full response.</p>` : ""}
      ${renderMiniList("Assignments", assignments.map((item) => item.title))}
      ${renderMiniList("Actions", actions.map((item) => `${item.type} ${item.path ?? item.command ?? ""}`))}
      ${renderMiniList("Results", results.map((item) => `${item.status}: ${item.summary}`))}
    </article>
  `;
}

function getMessagePreview(content) {
  const normalized = String(content ?? "");
  const maxLength = 520;
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function renderCountBadge(label, count) {
  if (!count) return "";
  return `<span class="count-badge" title="${escapeAttribute(`${label}: ${count}`)}">${count} ${escapeHtml(label)}</span>`;
}

function attachMessageToggleHandlers(root = document) {
  root.querySelectorAll(".message-toggle").forEach((button) => {
    button.addEventListener("click", () => toggleMessageExpanded(button.dataset.messageId));
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
  state.timelineMessages.forEach((message) => {
    const messageId = message.id ?? `${message.senderId ?? message.senderName}-${message.round}`;
    state.expandedMessages.add(messageId);
  });
  rerenderCurrentTimeline();
}

function rerenderCurrentTimeline() {
  const container = $("timeline");
  const shouldScroll = isTimelineNearBottom();
  container.innerHTML = state.timelineMessages.map(renderMessageCard).join("");
  attachMessageToggleHandlers();
  if (shouldScroll) {
    scrollTimelineToLatest();
  }
}

function isTimelineNearBottom() {
  const container = $("timeline");
  if (!container) return false;
  const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
  return distance < 80;
}

function scrollTimelineToLatest() {
  const container = $("timeline");
  if (!container) return;
  container.scrollTop = container.scrollHeight;
}

function renderExecution(replay) {
  const succeeded = replay.executionResults.filter((item) => item.status === "succeeded").length;
  const failed = replay.executionResults.filter((item) => item.status === "failed").length;
  $("execution").innerHTML = `
    <div class="execution-counts">
      <span>${succeeded} succeeded</span>
      <span>${failed} failed</span>
    </div>
    ${replay.executionResults.map(renderExecutionResult).join("")}
  `;
}

function renderExecutionResult(result) {
  return `
    <article class="execution-result ${escapeHtml(result.status)}">
      <strong>${escapeHtml(result.status)}</strong>
      <p>${escapeHtml(result.summary)}</p>
      ${result.outputPreview ? `<pre>${escapeHtml(result.outputPreview)}</pre>` : ""}
      ${result.error ? `<pre>${escapeHtml(result.error)}</pre>` : ""}
    </article>
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

function escapeAttribute(value) {
  return escapeHtml(value);
}
