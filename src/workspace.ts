import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { WorkspaceDescriptor } from "./types.js";

export class WorkspaceManager {
  constructor(private readonly rootDir = "workspaces") {}

  async initialize(sessionId: string): Promise<WorkspaceDescriptor> {
    const root = resolve(this.rootDir, sessionId);
    const repoPath = resolve(root, "repo");
    await mkdir(repoPath, { recursive: true });
    await mkdir(resolve(root, "artifacts"), { recursive: true });
    await mkdir(resolve(root, "execution", "stdout"), { recursive: true });
    await mkdir(resolve(root, "execution", "stderr"), { recursive: true });

    return {
      root,
      repoPath
    };
  }
}
