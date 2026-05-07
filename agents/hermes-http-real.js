import http from "node:http";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = Number.parseInt(process.env.PORT ?? "4101", 10);
const agentId = process.env.AGENT_ID ?? "hermes-a";
const agentName = process.env.AGENT_NAME ?? "Hermes A";
const agentRole = process.env.AGENT_ROLE ?? "planner";
const hermesTimeoutMs = Number.parseInt(process.env.HERMES_TIMEOUT_MS ?? "300000", 10);
const wrapperVersion = "real-hermes-wrapper-action-json-v3";

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function execFileAsync(command, args, options) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }

      resolve(stdout.trim());
    });
  });
}

async function runHermes(prompt) {
  const dir = await mkdtemp(join(tmpdir(), "hermes-prompt-"));
  const promptPath = join(dir, "prompt.txt");

  try {
    await writeFile(promptPath, prompt, "utf8");
    return await execFileAsync(
      "bash",
      ["-lc", `hermes -z "$(cat ${shellQuote(promptPath)})" chat`],
      { timeout: hermesTimeoutMs }
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function normalizeHermesOutput(output) {
  const jsonText = extractJsonObject(output);
  if (!jsonText) {
    return {
      content: output.trim() || "Hermes returned an empty response.",
      taskAssignments: [],
      actions: []
    };
  }

  try {
    const parsed = JSON.parse(jsonText);
    return {
      content: typeof parsed.content === "string" && parsed.content.trim()
        ? parsed.content
        : output.trim(),
      taskAssignments: Array.isArray(parsed.taskAssignments) ? parsed.taskAssignments : [],
      actions: Array.isArray(parsed.actions) ? parsed.actions : []
    };
  } catch {
    return {
      content: output.trim() || "Hermes returned an unparsable response.",
      taskAssignments: [],
      actions: []
    };
  }
}

function extractJsonObject(output) {
  const trimmed = output.trim();
  if (!trimmed) {
    return undefined;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    return fenced[1].trim();
  }

  const start = trimmed.indexOf("{");
  if (start === -1) {
    return undefined;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < trimmed.length; index += 1) {
    const char = trimmed[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return trimmed.slice(start, index + 1);
      }
    }
  }

  return undefined;
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function buildPrompt(context) {
  const previousMessages = (context.messages ?? [])
    .map((message) => `${message.senderName ?? message.senderId}: ${message.content}`)
    .join("\n\n");

  const existingAssignments = JSON.stringify(context.taskAssignments ?? [], null, 2);
  const executionResults = JSON.stringify(context.executionResults ?? [], null, 2);
  const workspace = JSON.stringify(context.workspace ?? null, null, 2);

  return `
你是 ${agentName}，角色是 ${agentRole}。

本次討論主題：
${context.topic}

目前輪次：
${context.round}

參與 Agents：
${(context.agents ?? []).map((agent) => `- ${agent.id}: ${agent.name} (${agent.role ?? "no role"})`).join("\n")}

前面其他 Agent 的發言：
${previousMessages || "目前沒有前面發言。"}

目前已存在的任務分派：
${existingAssignments}

目前執行結果：
${executionResults}

可用 workspace：
${workspace}

你正在參與一個 moderated meeting-room discussion。請根據你的角色回覆。

請務必只輸出一個 JSON object，不要使用 markdown code block，不要輸出 JSON 以外的文字。

JSON 格式：
{
  "content": "繁體中文說明。描述你做了什麼、為什麼，以及下一步。",
  "taskAssignments": [
    {
      "assignedAgentId": "hermes-a 或 hermes-b",
      "title": "任務標題",
      "detail": "任務細節",
      "dependencies": [],
      "confidence": 0.8,
      "rationale": "分派理由"
    }
  ],
  "actions": [
    {
      "type": "mkdir",
      "path": "docs"
    },
    {
      "type": "write_file",
      "path": "docs/web-mvp-plan.md",
      "content": "# Web MVP Plan\\n..."
    },
    {
      "type": "run_command",
      "command": "ls",
      "args": ["docs"]
    }
  ]
}

actions 只能使用以下型別：
- mkdir: { "type": "mkdir", "path": "relative/path" }
- write_file: { "type": "write_file", "path": "relative/path.md", "content": "file content" }
- read_file: { "type": "read_file", "path": "relative/path.md" }
- run_command: { "type": "run_command", "command": "ls", "args": ["docs"] }
- git_status: { "type": "git_status" }
- git_diff: { "type": "git_diff" }

安全限制：
- path 必須是相對路徑，不可使用絕對路徑或 ..
- run_command 僅使用簡單 allowlisted command，例如 ls、cat、pwd、mkdir、node、npm、git
- 如果你是 builder，而且 workspace 還沒有 docs/web-mvp-plan.md，請優先回傳 mkdir、write_file、run_command actions 來建立並驗證它。
- 如果你看到 executionResults 已成功，請根據結果做下一輪協作，不要重複相同 action。
`;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      wrapperVersion,
      agentId,
      agentName,
      agentRole,
      port
    }));
    return;
  }

  if (req.method !== "POST" || req.url !== "/respond") {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
    return;
  }

  try {
    const context = await readJson(req);
    const prompt = buildPrompt(context);
    const content = await runHermes(prompt);
    const response = normalizeHermesOutput(content);
    console.log(JSON.stringify({
      event: "respond.completed",
      wrapperVersion,
      sessionId: context.sessionId,
      round: context.round,
      agentId,
      actionCount: response.actions.length,
      taskAssignmentCount: response.taskAssignments.length,
      contentLength: response.content.length
    }));

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(response));
  } catch (error) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({
      error: error instanceof Error ? error.message : String(error)
    }));
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`${agentId} ${wrapperVersion} listening on 0.0.0.0:${port}`);
});
