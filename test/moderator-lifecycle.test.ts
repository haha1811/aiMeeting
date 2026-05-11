import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { Moderator } from "../src/moderator.js";
import { DiscussionService } from "../src/service.js";
import type { DiscussionLifecycleHooks, HermesAgent } from "../src/types.js";

test("DiscussionService emits lifecycle hooks during a session", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "lifecycle-sessions-"));
  const events: string[] = [];
  const hooks: DiscussionLifecycleHooks = {
    onSessionStarted: (sessionId) => {
      events.push(`started:${sessionId}`);
    },
    onSpeakerActive: ({ agentId, round }) => {
      events.push(`speaker:${agentId}:${round}`);
    },
    onMessageAppended: (message) => {
      events.push(`message:${message.senderId}`);
    },
    onSessionCompleted: (sessionId) => {
      events.push(`completed:${sessionId}`);
    }
  };
  const agents: HermesAgent[] = [
    {
      id: "hermes-a",
      name: "Hermes A",
      role: "planner",
      async respond() {
        return { content: "planner response" };
      }
    },
    {
      id: "hermes-b",
      name: "Hermes B",
      role: "builder",
      async respond() {
        return { content: "builder response" };
      }
    }
  ];
  const service = new DiscussionService({ rootDir, lifecycleHooks: hooks });
  const session = await service.createSession({ topic: "hook test", agents, maxRounds: 1 });

  await service.runSession(session.sessionId);

  assert.deepEqual(events, [
    `started:${session.sessionId}`,
    "speaker:hermes-a:1",
    "message:hermes-a",
    "speaker:hermes-b:1",
    "message:hermes-b",
    `completed:${session.sessionId}`
  ]);
});

test("DiscussionService emits action and execution result hooks", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "lifecycle-action-sessions-"));
  const workspaceRootDir = await mkdtemp(join(tmpdir(), "lifecycle-workspaces-"));
  const events: string[] = [];
  const hooks: DiscussionLifecycleHooks = {
    onActionCreated: ({ action }) => {
      const path = "path" in action ? action.path : "";
      events.push(`action:${action.type}:${path}`);
    },
    onExecutionResult: ({ result }) => {
      events.push(`result:${result.status}`);
    }
  };
  const agents: HermesAgent[] = [
    {
      id: "hermes-a",
      name: "Hermes A",
      role: "planner",
      async respond() {
        return {
          content: "write file",
          actions: [{ type: "write_file", path: "docs/live.md", content: "live" }]
        };
      }
    },
    {
      id: "hermes-b",
      name: "Hermes B",
      role: "builder",
      async respond() {
        return { content: "builder response" };
      }
    }
  ];
  const service = new DiscussionService({
    rootDir,
    workspaceRootDir,
    enableExecution: true,
    lifecycleHooks: hooks
  });
  const session = await service.createSession({ topic: "action hook test", agents, maxRounds: 1 });

  await service.runSession(session.sessionId);

  assert.deepEqual(events, [
    "action:write_file:docs/live.md",
    "result:succeeded"
  ]);
});

test("DiscussionService emits failed lifecycle hook", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "lifecycle-failed-sessions-"));
  const events: string[] = [];
  const hooks: DiscussionLifecycleHooks = {
    onSessionFailed: ({ sessionId, error }) => {
      events.push(`failed:${sessionId}:${error}`);
    }
  };
  const agents: HermesAgent[] = [
    {
      id: "hermes-a",
      name: "Hermes A",
      async respond() {
        throw new Error("agent unavailable");
      }
    },
    {
      id: "hermes-b",
      name: "Hermes B",
      async respond() {
        return { content: "builder response" };
      }
    }
  ];
  const service = new DiscussionService({ rootDir, lifecycleHooks: hooks });
  const session = await service.createSession({ topic: "failed hook test", agents, maxRounds: 1 });

  await assert.rejects(() => service.runSession(session.sessionId), /agent unavailable/);

  assert.deepEqual(events, [`failed:${session.sessionId}:agent unavailable`]);
});


test("observer hook failure does not prevent session completion", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "lifecycle-observer-sessions-"));
  const hooks: DiscussionLifecycleHooks = {
    onMessageAppended: () => {
      throw new Error("observer unavailable");
    }
  };
  const agents: HermesAgent[] = [
    {
      id: "hermes-a",
      name: "Hermes A",
      async respond() {
        return { content: "planner response" };
      }
    },
    {
      id: "hermes-b",
      name: "Hermes B",
      async respond() {
        return { content: "builder response" };
      }
    }
  ];
  const service = new DiscussionService({ rootDir, lifecycleHooks: hooks });
  const session = await service.createSession({ topic: "observer hook test", agents, maxRounds: 1 });

  const result = await service.runSession(session.sessionId);

  assert.equal(result.status, "completed");
});

test("failed lifecycle hook failure does not mask original session error", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "lifecycle-failed-observer-sessions-"));
  const hooks: DiscussionLifecycleHooks = {
    onSessionFailed: () => {
      throw new Error("failed observer unavailable");
    }
  };
  const agents: HermesAgent[] = [
    {
      id: "hermes-a",
      name: "Hermes A",
      async respond() {
        throw new Error("agent unavailable");
      }
    },
    {
      id: "hermes-b",
      name: "Hermes B",
      async respond() {
        return { content: "builder response" };
      }
    }
  ];
  const service = new DiscussionService({ rootDir, lifecycleHooks: hooks });
  const session = await service.createSession({ topic: "failed observer hook test", agents, maxRounds: 1 });

  await assert.rejects(() => service.runSession(session.sessionId), /agent unavailable/);
});


test("mutating action hook payload does not corrupt execution", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "lifecycle-action-mutation-sessions-"));
  const workspaceRootDir = await mkdtemp(join(tmpdir(), "lifecycle-action-mutation-workspaces-"));
  const hooks: DiscussionLifecycleHooks = {
    onActionCreated: ({ action }) => {
      if ("path" in action) {
        action.path = "docs/corrupted.md";
      }
      throw new Error("action observer unavailable");
    }
  };
  const agents: HermesAgent[] = [
    {
      id: "hermes-a",
      name: "Hermes A",
      async respond() {
        return {
          content: "write file",
          actions: [{ type: "write_file", path: "docs/live.md", content: "live" }]
        };
      }
    },
    {
      id: "hermes-b",
      name: "Hermes B",
      async respond() {
        return { content: "builder response" };
      }
    }
  ];
  const service = new DiscussionService({
    rootDir,
    workspaceRootDir,
    enableExecution: true,
    lifecycleHooks: hooks
  });
  const session = await service.createSession({ topic: "action mutation hook test", agents, maxRounds: 1 });

  const result = await service.runSession(session.sessionId);
  const content = await readFile(join(workspaceRootDir, session.sessionId, "repo", "docs", "live.md"), "utf8");

  assert.equal(result.status, "completed");
  assert.equal(content, "live");
  await assert.rejects(
    () => readFile(join(workspaceRootDir, session.sessionId, "repo", "docs", "corrupted.md"), "utf8"),
    /ENOENT/
  );
});

test("mutating message hook payload does not corrupt persisted session", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "lifecycle-message-mutation-sessions-"));
  const hooks: DiscussionLifecycleHooks = {
    onMessageAppended: (message) => {
      message.content = "corrupted response";
      throw new Error("message observer unavailable");
    }
  };
  const agents: HermesAgent[] = [
    {
      id: "hermes-a",
      name: "Hermes A",
      async respond() {
        return { content: "planner response" };
      }
    },
    {
      id: "hermes-b",
      name: "Hermes B",
      async respond() {
        return { content: "builder response" };
      }
    }
  ];
  const service = new DiscussionService({ rootDir, lifecycleHooks: hooks });
  const session = await service.createSession({ topic: "message mutation hook test", agents, maxRounds: 1 });

  const result = await service.runSession(session.sessionId);
  const persisted = await service.getSession(session.sessionId);

  assert.equal(result.status, "completed");
  assert.equal(persisted.messages[0]?.content, "planner response");
});

test("DiscussionService rejects custom moderator with service lifecycle hooks", () => {
  assert.throws(
    () => new DiscussionService({
      moderator: new Moderator(),
      lifecycleHooks: {}
    }),
    /cannot combine a custom moderator with lifecycleHooks/
  );
});
