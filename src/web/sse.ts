import http from "node:http";
import type { LiveSessionEvent } from "./live-types.js";

export function formatSseEvent(event: LiveSessionEvent): string {
  const data = JSON.stringify(event);
  const dataLines = data.split("\n").map((line) => `data: ${line}`);
  return [
    `id: ${event.id}`,
    `event: ${event.type}`,
    ...dataLines,
    "",
    ""
  ].join("\n");
}

export function writeSseHeaders(res: http.ServerResponse): void {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no"
  });
}

export function writeSseEvent(res: http.ServerResponse, event: LiveSessionEvent): void {
  res.write(formatSseEvent(event));
}
