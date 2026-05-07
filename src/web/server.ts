#!/usr/bin/env node
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import {
  getDefaultConfig,
  getSessionReplay,
  listSessionSummaries,
  runSessionFromWebRequest
} from "./handlers.js";

export interface WebServerOptions {
  rootDir: string;
  workspaceRootDir: string;
  publicDir: string;
}

export function createWebServer(options: WebServerOptions): http.Server {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");

      if (req.method === "GET" && url.pathname === "/api/default-config") {
        await sendJson(res, 200, await getDefaultConfig());
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/sessions") {
        await sendJson(res, 200, await listSessionSummaries(options.rootDir));
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/sessions/run") {
        const body = await readJsonBody(req);
        await sendJson(res, 200, await runSessionFromWebRequest({
          rootDir: options.rootDir,
          workspaceRootDir: options.workspaceRootDir,
          request: body
        }));
        return;
      }

      const replayMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
      if (req.method === "GET" && replayMatch?.[1]) {
        await sendJson(res, 200, await getSessionReplay({
          rootDir: options.rootDir,
          workspaceRootDir: options.workspaceRootDir,
          sessionId: replayMatch[1]
        }));
        return;
      }

      if (req.method === "GET") {
        await serveStatic(res, options.publicDir, url.pathname);
        return;
      }

      await sendJson(res, 404, { error: "not found" });
    } catch (error) {
      await sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  let body = "";
  req.setEncoding("utf8");
  for await (const chunk of req) {
    body += chunk;
  }
  return body ? JSON.parse(body) : {};
}

async function serveStatic(res: http.ServerResponse, publicDir: string, pathname: string): Promise<void> {
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const normalized = normalize(relativePath);
  if (normalized.startsWith("..")) {
    await sendJson(res, 404, { error: "not found" });
    return;
  }

  try {
    const filePath = join(publicDir, normalized);
    const content = await readFile(filePath);
    res.writeHead(200, { "content-type": contentType(filePath) });
    res.end(content);
  } catch {
    await sendJson(res, 404, { error: "not found" });
  }
}

async function sendJson(res: http.ServerResponse, status: number, value: unknown): Promise<void> {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(`${JSON.stringify(value)}\n`);
}

function contentType(path: string): string {
  switch (extname(path)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  const host = process.env.HOST ?? "0.0.0.0";
  const rootDir = process.env.SESSIONS_ROOT ?? "sessions";
  const workspaceRootDir = process.env.WORKSPACES_ROOT ?? "workspaces";
  const publicDir = process.env.PUBLIC_DIR ?? "public";
  const server = createWebServer({ rootDir, workspaceRootDir, publicDir });
  server.listen(port, host, () => {
    console.log(`Web runner console listening on http://${host}:${port}`);
  });
}
