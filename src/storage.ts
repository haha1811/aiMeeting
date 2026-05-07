import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  DiscussionEvent,
  DiscussionMessage,
  DiscussionResult,
  DiscussionSession,
  ExecutionAction,
  ExecutionResult
} from "./types.js";

export class JsonlDiscussionStore {
  constructor(private readonly rootDir = "sessions") {}

  sessionDir(sessionId: string): string {
    return join(this.rootDir, sessionId);
  }

  messagesPath(sessionId: string): string {
    return join(this.sessionDir(sessionId), "messages.jsonl");
  }

  eventsPath(sessionId: string): string {
    return join(this.sessionDir(sessionId), "events.jsonl");
  }

  resultPath(sessionId: string): string {
    return join(this.sessionDir(sessionId), "result.json");
  }

  actionsPath(sessionId: string): string {
    return join(this.sessionDir(sessionId), "actions.jsonl");
  }

  executionResultsPath(sessionId: string): string {
    return join(this.sessionDir(sessionId), "execution-results.jsonl");
  }

  sessionPath(sessionId: string): string {
    return join(this.sessionDir(sessionId), "session.json");
  }

  async initializeSession(session: DiscussionSession): Promise<void> {
    await mkdir(this.sessionDir(session.sessionId), { recursive: true });
    await this.writeSession(session);
    await this.ensureFile(this.messagesPath(session.sessionId));
    await this.ensureFile(this.eventsPath(session.sessionId));
    await this.ensureFile(this.actionsPath(session.sessionId));
    await this.ensureFile(this.executionResultsPath(session.sessionId));
  }

  async writeSession(session: DiscussionSession): Promise<void> {
    await this.writeJson(this.sessionPath(session.sessionId), session);
  }

  async readSession(sessionId: string): Promise<DiscussionSession> {
    const raw = await readFile(this.sessionPath(sessionId), "utf8");
    return JSON.parse(raw) as DiscussionSession;
  }

  async appendMessage(message: DiscussionMessage): Promise<void> {
    await appendFile(this.messagesPath(message.sessionId), `${JSON.stringify(message)}\n`, "utf8");
  }

  async readMessages(sessionId: string): Promise<DiscussionMessage[]> {
    return this.readJsonl<DiscussionMessage>(this.messagesPath(sessionId));
  }

  async appendEvent(event: DiscussionEvent): Promise<void> {
    await appendFile(this.eventsPath(event.sessionId), `${JSON.stringify(event)}\n`, "utf8");
  }

  async readEvents(sessionId: string): Promise<DiscussionEvent[]> {
    return this.readJsonl<DiscussionEvent>(this.eventsPath(sessionId));
  }

  async appendAction(action: ExecutionAction): Promise<void> {
    await appendFile(this.actionsPath(action.sessionId), `${JSON.stringify(action)}\n`, "utf8");
  }

  async readActions(sessionId: string): Promise<ExecutionAction[]> {
    return this.readJsonl<ExecutionAction>(this.actionsPath(sessionId));
  }

  async appendExecutionResult(result: ExecutionResult): Promise<void> {
    await appendFile(this.executionResultsPath(result.sessionId), `${JSON.stringify(result)}\n`, "utf8");
  }

  async readExecutionResults(sessionId: string): Promise<ExecutionResult[]> {
    return this.readJsonl<ExecutionResult>(this.executionResultsPath(sessionId));
  }

  async writeResult(result: DiscussionResult): Promise<void> {
    await this.writeJson(this.resultPath(result.sessionId), result);
  }

  async readResult(sessionId: string): Promise<DiscussionResult> {
    const raw = await readFile(this.resultPath(sessionId), "utf8");
    return JSON.parse(raw) as DiscussionResult;
  }

  private async ensureFile(path: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, "", "utf8");
  }

  private async writeJson(path: string, value: unknown): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }

  private async readJsonl<T>(path: string): Promise<T[]> {
    const raw = await readFile(path, "utf8");
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as T);
  }
}
