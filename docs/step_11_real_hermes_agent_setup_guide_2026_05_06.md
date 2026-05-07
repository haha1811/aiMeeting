# Step 11：將 Mock Agent 升級成真正 Hermes AI Agent（詳細操作紀錄）

## 目標

原本的：

```text
runner
→ mock HTTP endpoint
→ 固定 JSON 回覆
```

升級成：

```text
runner
→ HTTP wrapper
→ 真正 Hermes Agent
→ GPT-5.5 / GPT-5.3-Codex
→ AI 真實討論
```

最終架構：

```text
runner EC2
  ↓
Hermes A EC2（planner / GPT-5.5）
  ↓
Hermes B EC2（builder / GPT-5.3-Codex）
```

---

# 1. 確認 Hermes Agent 可正常使用

在 hermes-a 與 hermes-b EC2 都執行：

```bash
which hermes
hermes --version
hermes -z "請用繁體中文簡短回答：你現在可以正常回覆嗎？" chat
```

注意：Hermes Agent v0.12.0 的 prompt 參數是全域參數，格式是 `hermes -z "..." chat`。如果執行 `hermes chat "..."`，會出現 `unrecognized arguments`。

確認：

- Hermes CLI 存在
- Hermes 可正常呼叫模型
- Hermes 可正常輸出回覆

---

# 2. 備份原本 mock endpoint

在 hermes-a 與 hermes-b：

```bash
cd ~/projects/aiMeeting
cp agents/hermes-http-mock.js agents/hermes-http-mock.backup.js
```

---

# 3. 建立真正 Hermes HTTP Wrapper

在 hermes-a 與 hermes-b：

```bash
cat > agents/hermes-http-real.js <<'EOF'
import http from "node:http";
import { execFile } from "node:child_process";

const port = Number.parseInt(process.env.PORT ?? "4101", 10);
const agentId = process.env.AGENT_ID ?? "hermes-a";
const agentName = process.env.AGENT_NAME ?? "Hermes A";
const agentRole = process.env.AGENT_ROLE ?? "planner";

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", chunk => body += chunk);
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

function runHermes(prompt) {
  return new Promise((resolve, reject) => {
    execFile(
      "hermes",
      ["-z", prompt, "chat"],
      { timeout: 120000 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }

        resolve(stdout.trim());
      }
    );
  });
}

function buildPrompt(context) {
  const previousMessages = (context.messages ?? [])
    .map(m => `${m.senderName ?? m.senderId}: ${m.content}`)
    .join("\n\n");

  return `
你是 ${agentName}，角色是 ${agentRole}。

本次討論主題：
${context.topic}

目前輪次：
${context.round}

前面其他 Agent 的發言：
${previousMessages || "目前沒有前面發言。"}

請根據你的角色回覆。
請使用繁體中文。
請輸出清楚的建議、下一步行動與可分派任務。
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

    const response = {
      content,
      taskAssignments: []
    };

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
  console.log(`${agentId} real Hermes wrapper listening on 0.0.0.0:${port}/respond`);
});
EOF
```

---

# 4. 啟動 Hermes A

在 hermes-a EC2：

```bash
cd ~/projects/aiMeeting
PORT=4101 \
AGENT_ID=hermes-a \
AGENT_NAME="Hermes A" \
AGENT_ROLE="planner" \
node agents/hermes-http-real.js
```

成功訊息：

```text
hermes-a real Hermes wrapper listening on 0.0.0.0:4101/respond
```

---

# 5. 啟動 Hermes B

在 hermes-b EC2：

```bash
cd ~/projects/aiMeeting
PORT=4102 \
AGENT_ID=hermes-b \
AGENT_NAME="Hermes B" \
AGENT_ROLE="builder" \
node agents/hermes-http-real.js
```

成功訊息：

```text
hermes-b real Hermes wrapper listening on 0.0.0.0:4102/respond
```

---

# 6. runner 測試 Hermes A

在 runner EC2：

```bash
curl -s "http://10.100.1.21:4101/respond" \
  -H 'content-type: application/json' \
  -d '{"topic":"Web 站台開發：規劃一個產品介紹網站的 MVP","round":1,"messages":[],"taskAssignments":[]}'
```

驗證：

- Hermes A 有真正 AI 回覆
- planner 角色內容正確
- 非固定 mock JSON

---

# 7. runner 測試 Hermes B

```bash
curl -s "http://10.100.1.32:4102/respond" \
  -H 'content-type: application/json' \
  -d '{"topic":"Web 站台開發：規劃一個產品介紹網站的 MVP","round":1,"messages":[{"senderName":"Hermes A","content":"請規劃產品介紹網站 MVP。"}],"taskAssignments":[]}'
```

驗證：

- Hermes B 有真正 AI 回覆
- builder 角色內容正確
- Hermes B 有讀到 Hermes A context

---

# 8. 修正 timeout 問題

原本：

```json
"timeoutMs": 60000
```

可能會 timeout。

改成：

```json
"timeoutMs": 300000
```

並先測：

```json
"maxRounds": 1
```

避免長時間等待。

---

# 9. 啟動真正 AI 多 Agent Session

在 runner EC2：

```bash
npm run session -- --config hermes-agents.aws.config.json
```

成功時：

```json
{
  "status": "completed"
}
```

並產生：

```text
sessions/<sessionId>/
```

---

# 10. 查看 AI 討論內容

## 查看對話內容

```bash
cat sessions/<sessionId>/messages.jsonl
```

## 查看最終結果

```bash
cat sessions/<sessionId>/result.json
```

## 查看事件紀錄

```bash
cat sessions/<sessionId>/events.jsonl
```

## 即時觀看 AI 討論

```bash
tail -f sessions/<sessionId>/messages.jsonl
```

---

# 11. 目前完成狀態

目前已完成：

```text
AWS EC2 分散式 AI Multi-Agent Prototype
```

包含：

- runner orchestration
- distributed HTTP agents
- Hermes AI wrapper
- planner / builder role separation
- AI ↔ AI context propagation
- session persistence
- event log
- task assignment
- real LLM discussion

---

# 12. 下一步可進化方向

## 12.1 AI Team 擴充

新增：

```text
Hermes C → QA / Reviewer
Hermes D → Ops / Infra
Hermes E → Product / PM
```

---

## 12.2 自動化開發流程

未來可加入：

```text
GitHub Issue
Git commit
PR
CI/CD
自動測試
```

---

## 12.3 Web UI

可建立：

```text
AI Team Dashboard
AI Chat UI
Task Board
Live Discussion Monitor
```

---

## 12.4 長時間協作

未來可加入：

```text
memory
long-running session
persistent context
knowledge base
```

---

# 13. 本階段總結

本階段已經從：

```text
Mock JSON 測試
```

進化成：

```text
真正 AI ↔ AI 討論
```

這代表：

```text
分散式 AI Team Prototype
已成功建立
```

---

# 14. Multi-Agent 真實討論驗證（2026-05-06）

## 驗證目標

驗證：

```text
Hermes A（planner）
+
Hermes B（builder）
```

是否能：

- 真正互相閱讀 context
- 多輪討論
- 根據前一輪內容收斂與修正
- 完成 session orchestration
- 成功產出結果

---

## 測試設定

runner config：

```json
{
  "maxRounds": 3,
  "timeoutMs": 300000
}
```

測試主題：

```text
請 Hermes A 與 Hermes B 共同完成一份「產品介紹網站 MVP 實作方案」。

角色分工：
- Hermes A 是 planner，負責定義需求、頁面架構、驗收標準、風險與任務切分。
- Hermes B 是 builder，負責根據 Hermes A 的規劃提出技術實作方案、檔案結構、開發步驟與可交付產出。

討論目標：
經過 3 輪討論後，請收斂出一份可執行的 MVP 方案，包含：
1. 網站目標
2. 頁面區塊
3. 技術選型
4. 開發任務清單
5. 驗收標準
6. 最終交付物

請兩位 Agent 不要只各自回答，要根據前一位 Agent 的內容補充、修正或收斂。
```

---

## 初期問題

### 問題 1：CLI argument 過長

原本 wrapper：

```js
execFile("hermes", ["-z", prompt, "chat"])
```

在前 1-2 輪尚可運作。

但第 3 輪因為：

```text
context 越來越長
```

導致：

```text
shell quoting
CLI argument
prompt escaping
```

發生問題。

錯誤：

```text
HTTP agent 'hermes-a' failed with 500
Command failed: hermes -z ... chat
```

---

### 問題 2：stdin pipe 方式失敗

後續改用：

```js
spawn("hermes", ["chat"])
child.stdin.write(prompt)
```

但 Hermes CLI 不支援從 stdin 讀取 prompt。

因此出現：

```text
Error: write EPIPE
```

原因：

```text
Node.js 還在寫 stdin
但 hermes chat 已提前結束
```

---

## 最終穩定方案

最終改成：

```text
temp file + hermes -z "$(cat promptfile)" chat
```

流程：

```text
1. Node.js 建立 temp directory
2. 將 prompt 寫入 prompt.txt
3. 使用 bash -lc 執行：
   hermes -z "$(cat prompt.txt)" chat
4. 執行完成後刪除 temp file
```

此方案可穩定處理：

- 長 prompt
- 多輪 context
- 多 agent 討論
- shell escaping
- Unicode / 中文內容

---

## 最終驗證結果

成功 session：

```text
sessionId:
c38b323f-d93b-4bab-98d1-d610776c0fe0
```

runner 結果：

```json
{
  "status": "completed",
  "messageCount": 6,
  "roundsCompleted": 3,
  "taskAssignmentCount": 2
}
```

---

## 成功驗證的能力

目前已成功驗證：

### AI 協作能力

```text
Hermes A ↔ Hermes B
真實 AI 討論成功
```

包含：

- context propagation
- planner / builder role separation
- 多輪討論
- 根據前輪內容修正與補充
- session orchestration
- distributed AI agents
- AI discussion persistence

---

### INFRA / 系統能力

包含：

- AWS EC2 distributed architecture
- HTTP agent communication
- runner orchestration
- session persistence
- events logging
- discussion storage
- timeout control
- long prompt handling
- temp file prompt strategy

---

## 尚未完成的部份

目前：

```text
AI 已完成「討論與規劃」
```

但尚未：

```text
真正自動完成 Web 開發
```

目前 Hermes Agent：

```text
會討論
會規劃
會協作
```

但尚未：

- 真正建立 Next.js 專案
- 真正修改檔案
- 真正 git commit
- 真正 npm build
- 真正 deploy

---

## 目前系統定位

目前已完成：

```text
Phase 1
AI Team Discussion System
```

但尚未進入：

```text
Phase 2
AI Autonomous Execution System
```

---

## 下一階段方向

下一步可加入：

```text
1. shell tool
2. file write tool
3. git tool
4. workspace isolation
5. autonomous coding
6. test execution
7. build validation
8. deployment automation
9. GitHub PR flow
```

讓：

```text
Hermes B
```

不只是：

```text
builder discussion agent
```

而是：

```text
autonomous coding agent
```

---

## 本次 milestone 意義

這次代表：

```text
真正分散式 AI Team
已成功建立 prototype
```

而且是：

```text
AWS EC2
+
真實 Hermes Agent
+
真實 LLM
+
多輪 AI 協作
```

不再只是：

```text
單一 AI chatbot
```

而是：

```text
AI Team Orchestration Prototype
```
