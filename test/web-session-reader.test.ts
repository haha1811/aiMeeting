import { mkdir, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  listSessions,
  readSessionReplay,
  listWorkspaceFiles
} from "../src/web/session-reader.js";

test("readSessionReplay returns ordered messages, actions, and execution results", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "web-sessions-"));
  const workspaceRootDir = await mkdtemp(join(tmpdir(), "web-workspaces-"));
  const sessionId = "session-1";
  const sessionDir = join(rootDir, sessionId);
  await mkdir(sessionDir, { recursive: true });
  await writeFile(join(sessionDir, "session.json"), JSON.stringify({
    sessionId,
    topic: "topic",
    agents: [],
    messages: [],
    status: "completed",
    maxRounds: 1,
    taskAssignments: [],
    executionResults: [],
    createdAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:01.000Z"
  }));
  await writeFile(join(sessionDir, "result.json"), JSON.stringify({
    sessionId,
    topic: "topic",
    status: "completed",
    completedAt: "2026-05-07T00:00:01.000Z",
    taskAssignments: [],
    executionResults: [],
    messageCount: 1,
    roundsCompleted: 1
  }));
  await writeFile(join(sessionDir, "messages.jsonl"), `${JSON.stringify({ id: "m1", sessionId, sequence: 1, round: 1, senderId: "a", senderName: "A", content: "hello", createdAt: "now" })}\n`);
  await writeFile(join(sessionDir, "actions.jsonl"), `${JSON.stringify({ id: "act1", sessionId, agentId: "a", messageId: "m1", type: "mkdir", path: "docs", createdAt: "now" })}\n`);
  await writeFile(join(sessionDir, "execution-results.jsonl"), `${JSON.stringify({ id: "r1", actionId: "act1", sessionId, agentId: "a", status: "succeeded", startedAt: "now", completedAt: "now", summary: "ok" })}\n`);
  await mkdir(join(workspaceRootDir, sessionId, "repo", "docs"), { recursive: true });
  await writeFile(join(workspaceRootDir, sessionId, "repo", "docs", "web-mvp-plan.md"), "plan");

  const replay = await readSessionReplay({ rootDir, workspaceRootDir, sessionId });

  assert.equal(replay.messages[0]?.id, "m1");
  assert.equal(replay.actions[0]?.id, "act1");
  assert.equal(replay.executionResults[0]?.id, "r1");
  assert.deepEqual(replay.workspaceFiles, [{ path: "docs/web-mvp-plan.md", size: 4 }]);
});

test("listSessions returns sessions sorted by updatedAt descending", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "web-sessions-"));
  for (const [sessionId, updatedAt] of [["older", "2026-05-07T00:00:00.000Z"], ["newer", "2026-05-07T01:00:00.000Z"]]) {
    const sessionDir = join(rootDir, sessionId);
    await mkdir(sessionDir, { recursive: true });
    await writeFile(join(sessionDir, "session.json"), JSON.stringify({
      sessionId,
      topic: sessionId,
      agents: [],
      messages: [],
      status: "completed",
      maxRounds: 1,
      taskAssignments: [],
      executionResults: [],
      createdAt: updatedAt,
      updatedAt
    }));
    await writeFile(join(sessionDir, "messages.jsonl"), "");
    await writeFile(join(sessionDir, "execution-results.jsonl"), "");
  }

  const sessions = await listSessions(rootDir);

  assert.deepEqual(sessions.map((session) => session.sessionId), ["newer", "older"]);
});

test("listWorkspaceFiles only lists files inside workspace repo", async () => {
  const workspaceRootDir = await mkdtemp(join(tmpdir(), "web-workspaces-"));
  await mkdir(join(workspaceRootDir, "safe", "repo", "nested"), { recursive: true });
  await writeFile(join(workspaceRootDir, "safe", "repo", "nested", "file.txt"), "content");

  assert.deepEqual(await listWorkspaceFiles(workspaceRootDir, "safe"), [
    { path: "nested/file.txt", size: 7 }
  ]);
  await assert.rejects(() => listWorkspaceFiles(workspaceRootDir, "../unsafe"), /Invalid sessionId/);
});
