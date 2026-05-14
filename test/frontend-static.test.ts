import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

test("frontend keeps live APIs and adds timeline collapse helpers", async () => {
  const app = await readFile("public/app.js", "utf8");
  const html = await readFile("public/index.html", "utf8");
  const css = await readFile("public/styles.css", "utf8");

  assert.match(app, /\/api\/sessions\/jobs/);
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
  assert.match(css, /message-content\.collapsed/);
  assert.match(css, /message-card-actions/);
});

test("frontend displays session timestamps in Taiwan time", async () => {
  const app = await readFile("public/app.js", "utf8");
  const html = await readFile("public/index.html", "utf8");

  assert.match(app, /function formatSessionTime/);
  assert.match(app, /timeZone:\s*"Asia\/Taipei"/);
  assert.match(app, /UTC:\s*\$\{escapeAttribute\(session\.updatedAt\)\}/);
  assert.match(app, /formatSessionTime\(session\.updatedAt\)/);
  assert.match(html, /Asia\/Taipei \(UTC\+08:00\)/);
});
