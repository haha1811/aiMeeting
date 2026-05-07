import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { Executor, WorkspaceManager, type ExecutionActionInput } from "../src/index.js";

const fixedDate = new Date("2026-05-05T00:00:00.000Z");

async function createExecutor() {
  const rootDir = await mkdtemp(join(tmpdir(), "hermes-workspaces-"));
  const workspace = await new WorkspaceManager(rootDir).initialize("session");
  let id = 0;
  const executor = new Executor(workspace, {
    now: () => fixedDate,
    idFactory: () => `id-${++id}`
  });
  return { executor, workspace };
}

function action(executor: Executor, input: ExecutionActionInput) {
  return executor.createAction(input, "session", "agent", "message");
}

test("write_file writes inside the workspace", async () => {
  const { executor, workspace } = await createExecutor();
  const result = await executor.execute(action(executor, {
    type: "write_file",
    path: "src/App.tsx",
    content: "hello"
  }));

  assert.equal(result.status, "succeeded");
  assert.equal(await readFile(join(workspace.repoPath, "src", "App.tsx"), "utf8"), "hello");
});

test("read_file rejects paths that escape the workspace", async () => {
  const { executor } = await createExecutor();
  const result = await executor.execute(action(executor, {
    type: "read_file",
    path: "../secret.txt"
  }));

  assert.equal(result.status, "failed");
  assert.match(result.error ?? "", /escapes the workspace/);
});

test("run_command rejects commands outside the allowlist", async () => {
  const { executor } = await createExecutor();
  const result = await executor.execute(action(executor, {
    type: "run_command",
    command: "sudo",
    args: ["whoami"]
  }));

  assert.equal(result.status, "failed");
  assert.match(result.error ?? "", /allowlist/);
});
