#!/usr/bin/env node
import { resolve } from "node:path";
import { createHermesAgentFromConfig } from "./adapters.js";
import { loadDiscussionRunnerConfig } from "./config.js";
import { DiscussionService } from "./service.js";

interface CliOptions {
  configPath: string;
  topic?: string;
  maxRounds?: number;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const config = await loadDiscussionRunnerConfig(options.configPath);
  const service = new DiscussionService({ rootDir: config.rootDir ?? "sessions" });
  const agents = config.agents.map(createHermesAgentFromConfig);

  const session = await service.createSession({
    topic: options.topic ?? config.topic,
    agents,
    maxRounds: options.maxRounds ?? config.maxRounds
  });

  const result = await service.runSession(session.sessionId);
  const rootDir = config.rootDir ?? "sessions";

  console.log(JSON.stringify({
    sessionId: result.sessionId,
    status: result.status,
    topic: result.topic,
    messageCount: result.messageCount,
    roundsCompleted: result.roundsCompleted,
    taskAssignmentCount: result.taskAssignments.length,
    files: {
      messages: `${rootDir}/${result.sessionId}/messages.jsonl`,
      events: `${rootDir}/${result.sessionId}/events.jsonl`,
      session: `${rootDir}/${result.sessionId}/session.json`,
      result: `${rootDir}/${result.sessionId}/result.json`
    },
    taskAssignments: result.taskAssignments
  }, null, 2));
}

function parseArgs(args: string[]): CliOptions {
  let configPath = "hermes-agents.config.json";
  let topic: string | undefined;
  let maxRounds: number | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--config" && next) {
      configPath = next;
      index += 1;
      continue;
    }

    if (arg === "--topic" && next) {
      topic = next;
      index += 1;
      continue;
    }

    if (arg === "--max-rounds" && next) {
      maxRounds = Number.parseInt(next, 10);
      if (!Number.isInteger(maxRounds) || maxRounds < 1) {
        throw new Error("--max-rounds must be a positive integer.");
      }
      index += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    throw new Error(`Unknown or incomplete argument '${arg}'.`);
  }

  return {
    configPath: resolve(configPath),
    topic,
    maxRounds
  };
}

function printHelp(): void {
  console.log(`Usage: npm run session -- [options]

Options:
  --config <path>       Path to Hermes discussion config. Default: hermes-agents.config.json
  --topic <topic>       Override the config topic.
  --max-rounds <count>  Override the config maxRounds.
  -h, --help            Show this help text.
`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
