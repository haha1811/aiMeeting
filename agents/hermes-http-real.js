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

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function buildPrompt(context) {
  const previousMessages = (context.messages ?? [])
    .map((message) => `${message.senderName ?? message.senderId}: ${message.content}`)
    .join("\n\n");

  const existingAssignments = JSON.stringify(context.taskAssignments ?? [], null, 2);

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

請根據你的角色回覆。
請使用繁體中文。
請輸出清楚的建議、下一步行動與可分派任務。
如果你能明確分派任務，請在自然語言中清楚寫出建議分工。
`;
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/respond") {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
    return;
  }

  try {
    const context = await readJson(req);
    const prompt = buildPrompt(context);
    const content = await runHermes(prompt);

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      content,
      taskAssignments: []
    }));
  } catch (error) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({
      error: error instanceof Error ? error.message : String(error)
    }));
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`${agentId} real Hermes wrapper listening on 0.0.0.0:${port}/respond`);
});
