import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { createWebServer } from "../src/web/server.js";

test("web server serves default config and rejects unknown routes", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "web-sessions-"));
  const workspaceRootDir = await mkdtemp(join(tmpdir(), "web-workspaces-"));
  const server = createWebServer({ rootDir, workspaceRootDir, publicDir: "public" });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  const port = typeof address === "object" && address ? address.port : 0;

  try {
    const configResponse = await fetch(`http://127.0.0.1:${port}/api/default-config`);
    assert.equal(configResponse.status, 200);
    const config = await configResponse.json() as { topic: string };
    assert.equal(typeof config.topic, "string");

    const missingResponse = await fetch(`http://127.0.0.1:${port}/missing`);
    assert.equal(missingResponse.status, 404);

    const headResponse = await fetch(`http://127.0.0.1:${port}/`, { method: "HEAD" });
    assert.equal(headResponse.status, 200);
    assert.match(headResponse.headers.get("content-type") ?? "", /text\/html/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
