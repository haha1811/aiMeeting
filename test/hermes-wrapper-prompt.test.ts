import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

test("real Hermes wrapper prompt explains runner workspace ownership", async () => {
  const source = await readFile("agents/hermes-http-real.js", "utf8");

  assert.match(source, /產出檔案都由 runner/);
  assert.match(source, /不要嘗試在 agent 本機檔案系統檢查/);
  assert.match(source, /run_command action/);
  assert.match(source, /executionResults/);
});
