# Multi-Hermes Discussion 使用者指南

這份文件是給「想使用多台 Hermes agent 彼此溝通討論」的使用者看的。

讀完後你會知道：

- 這個功能可以解決什麼問題。
- 你要準備哪些環境。
- 如何用預設的 `hermes-a` / `hermes-b` mock 設定先跑起來。
- 如何把 mock agent 換成真實 Hermes agent。
- 如何讓 Hermes agent 自己讀文件後完成設定與執行。

## 1. 這個功能是什麼？

這個專案提供一個 moderated meeting-room 機制，讓兩台以上 Hermes agent 可以在同一個討論 session 裡輪流發言。

它的核心概念是：

- 使用者設定討論主題。
- 使用者設定要參與的 Hermes agents。
- Moderator 依順序呼叫每個 agent。
- 每個 agent 會收到目前討論 context。
- Agent 回傳自己的發言與可選的任務分派。
- 討論結果會被保存成檔案。

v1 不是讓 agent 直接私訊彼此，而是讓它們透過 moderator 共享同一份討論上下文。

## 2. 你可以用它做什麼？

常見用途：

- 讓 Planner agent 和 Builder agent 討論需求怎麼實作。
- 讓 Product、Engineering、QA 三種角色互相審查方案。
- 讓多個 Hermes agent 針對同一個問題提出分工。
- 產出可追蹤的討論紀錄與任務分派。

輸出會放在：

```text
sessions/<sessionId>/
```

包含：

```text
messages.jsonl
events.jsonl
session.json
result.json
```

其中 `result.json` 是最終任務分派結果。

## 3. 最快開始方式

### 3.1 進入 WSL

```powershell
wsl
```

### 3.2 進入專案

```bash
cd ~/projects/aiMeeting
```

### 3.3 啟用 Node

如果你的 shell 還沒有 Node，先執行：

```bash
export PATH=/home/haha/.local/node/node-v22.22.2-linux-x64/bin:$PATH
```

確認：

```bash
node --version
npm --version
```

### 3.4 安裝依賴

```bash
npm install
```

### 3.5 跑測試

```bash
npm test
```

成功時會看到：

```text
tests 9
pass 9
fail 0
```

### 3.6 啟動預設討論

```bash
npm run session
```

這會使用預設的 `hermes-agents.config.json`，讓 mock 版 `hermes-a` 和 `hermes-b` 先跑一場討論。

成功時會輸出類似：

```json
{
  "status": "completed",
  "messageCount": 3,
  "taskAssignmentCount": 2,
  "files": {
    "result": "sessions/<sessionId>/result.json"
  }
}
```

## 4. 設定檔怎麼看？

主要設定檔是：

```text
hermes-agents.config.json
```

最小概念如下：

```json
{
  "topic": "Plan the first real Hermes-to-Hermes discussion",
  "maxRounds": 3,
  "rootDir": "sessions",
  "agents": [
    {
      "id": "hermes-a",
      "name": "Hermes A",
      "role": "planner",
      "type": "mock",
      "responses": [
        {
          "content": "I will define the work and assign the implementation task to Hermes B."
        }
      ]
    },
    {
      "id": "hermes-b",
      "name": "Hermes B",
      "role": "builder",
      "type": "mock",
      "responses": [
        {
          "content": "I can prepare the implementation approach."
        }
      ]
    }
  ]
}
```

重要欄位：

- `topic`：這次討論的主題。
- `maxRounds`：最多討論幾輪。
- `rootDir`：輸出資料夾。
- `agents`：參與討論的 Hermes agents。
- `id`：agent 的唯一代號，也是任務分派使用的代號。
- `type`：agent adapter 類型，目前支援 `mock`、`command`、`http`。

## 5. 三種 agent 類型

### 5.1 mock

適合先確認系統會跑。

```json
{
  "id": "hermes-a",
  "name": "Hermes A",
  "role": "planner",
  "type": "mock",
  "responses": [
    {
      "content": "I will assign work to Hermes B.",
      "taskAssignments": [
        {
          "assignedAgentId": "hermes-b",
          "title": "Prepare implementation approach",
          "detail": "Propose the implementation path."
        }
      ]
    }
  ]
}
```

### 5.2 command

適合你的 Hermes agent 是本機可執行程式。

```json
{
  "id": "hermes-a",
  "name": "Hermes A",
  "role": "planner",
  "type": "command",
  "command": "node",
  "args": ["./agents/hermes-a.js"],
  "timeoutMs": 60000
}
```

系統會把討論 context 用 JSON 傳到 stdin。

你的 command 需要輸出 JSON：

```json
{
  "content": "I recommend Hermes B handles implementation.",
  "taskAssignments": [
    {
      "assignedAgentId": "hermes-b",
      "title": "Implement runner",
      "detail": "Create the runnable discussion script."
    }
  ]
}
```

如果 command 只輸出純文字，也可以跑，系統會把它當成 `content`。

### 5.3 http

適合你的 Hermes agent 是 HTTP service。

```json
{
  "id": "hermes-b",
  "name": "Hermes B",
  "role": "builder",
  "type": "http",
  "url": "http://localhost:4102/respond",
  "headers": {
    "authorization": "Bearer local-token"
  },
  "timeoutMs": 60000
}
```

系統會用 HTTP POST 把討論 context 傳給 endpoint。

Endpoint 回傳格式同樣是：

```json
{
  "content": "I can implement the assigned task.",
  "taskAssignments": []
}
```

## 6. 如何讓 Hermes 自己讀文件後設定？

如果你希望 `hermes-a`、`hermes-b` 自行設定，請讓它們先讀：

```text
docs/HERMES_AGENT_GUIDE.md
```

那份文件是 agent runbook，內容比本文件更偏執行步驟，會告訴 Hermes：

- repo 在哪裡。
- 如何安裝與測試。
- 如何修改 `hermes-agents.config.json`。
- command/http adapter contract 是什麼。
- 如何執行 `npm run session`。
- 如何檢查 `sessions/<sessionId>/result.json`。

建議你對 Hermes agent 下這種任務：

```text
請閱讀 docs/HERMES_AGENT_GUIDE.md，確認你在 hermes-agents.config.json 中的 agent 設定。
如果你是本機可執行 agent，請使用 type: "command"。
如果你是 HTTP endpoint，請使用 type: "http"。
設定完成後執行 npm test 和 npm run session，確認你可以參與討論。
```

## 7. 使用情境一：從零跑起 mock 版 hermes-a / hermes-b

這個情境適合第一次使用，目標是確認環境與討論流程都正常。

### 步驟

1. 進入 WSL：

```powershell
wsl
```

2. 進入專案：

```bash
cd ~/projects/aiMeeting
```

3. 啟用 Node：

```bash
export PATH=/home/haha/.local/node/node-v22.22.2-linux-x64/bin:$PATH
```

4. 安裝依賴：

```bash
npm install
```

5. 跑測試：

```bash
npm test
```

6. 啟動討論：

```bash
npm run session
```

7. 查看結果：

```bash
cat sessions/<sessionId>/result.json
```

### 預期結果

你會看到 `hermes-a` 和 `hermes-b` 已完成一場 moderated discussion，並產生 task assignments。

這代表：

- Node 環境正常。
- 設定檔可讀。
- Moderator 可執行。
- Session output 可保存。

## 8. 使用情境二：把 mock 換成真實 Hermes HTTP agents

這個情境適合你已經有兩個 Hermes HTTP endpoint。

假設：

- Hermes A endpoint：`http://localhost:4101/respond`
- Hermes B endpoint：`http://localhost:4102/respond`

### 步驟

1. 編輯 `hermes-agents.config.json`：

```json
{
  "topic": "Discuss how to implement the next feature",
  "maxRounds": 3,
  "rootDir": "sessions",
  "agents": [
    {
      "id": "hermes-a",
      "name": "Hermes A",
      "role": "planner",
      "type": "http",
      "url": "http://localhost:4101/respond",
      "timeoutMs": 60000
    },
    {
      "id": "hermes-b",
      "name": "Hermes B",
      "role": "builder",
      "type": "http",
      "url": "http://localhost:4102/respond",
      "timeoutMs": 60000
    }
  ]
}
```

2. 確認兩個 endpoint 都能接收 POST JSON。

每個 endpoint 會收到 `AgentDiscussionContext`，並應回傳：

```json
{
  "content": "My response to the current discussion context.",
  "taskAssignments": [
    {
      "assignedAgentId": "hermes-b",
      "title": "Concrete next action",
      "detail": "Specific task detail."
    }
  ]
}
```

3. 執行：

```bash
npm run session
```

4. 查看結果：

```bash
cat sessions/<sessionId>/messages.jsonl
cat sessions/<sessionId>/result.json
```

### 預期結果

Moderator 會先呼叫 Hermes A，再呼叫 Hermes B，並把前面所有發言都放進下一位 agent 的 context。

這代表兩台 Hermes 不需要直接連線到彼此。它們只要遵守 HTTP adapter contract，就可以透過 moderated session 開始討論。

## 9. 使用情境三：把 mock 換成本機 command agents

這個情境適合 Hermes agent 是本機 executable 或 script。

假設：

- Hermes A script：`./agents/hermes-a.js`
- Hermes B script：`./agents/hermes-b.js`

設定：

```json
{
  "topic": "Discuss local command-based Hermes integration",
  "maxRounds": 3,
  "rootDir": "sessions",
  "agents": [
    {
      "id": "hermes-a",
      "name": "Hermes A",
      "role": "planner",
      "type": "command",
      "command": "node",
      "args": ["./agents/hermes-a.js"],
      "timeoutMs": 60000
    },
    {
      "id": "hermes-b",
      "name": "Hermes B",
      "role": "builder",
      "type": "command",
      "command": "node",
      "args": ["./agents/hermes-b.js"],
      "timeoutMs": 60000
    }
  ]
}
```

每個 script 要做的事：

- 從 stdin 讀取 `AgentDiscussionContext` JSON。
- 根據 context 產生回覆。
- 將 `AgentResponse` JSON 印到 stdout。
- 正常結束時 exit code 為 0。

執行：

```bash
npm run session
```

## 10. 使用者最短路徑

如果你只想知道最少要做什麼：

```bash
cd ~/projects/aiMeeting
export PATH=/home/haha/.local/node/node-v22.22.2-linux-x64/bin:$PATH
npm install
npm test
npm run session
```

如果要交給 Hermes 自己設定：

```text
請閱讀 docs/HERMES_AGENT_GUIDE.md，依照你的執行型態修改 hermes-agents.config.json，然後執行 npm test 與 npm run session。
```

## 11. 常見問題

### 11.1 Hermes agents 會直接彼此呼叫嗎？

v1 不會。它們透過 moderator 傳遞 context。這樣比較容易追蹤、保存與除錯。

### 11.2 可以超過兩台 Hermes 嗎？

可以。只要在 `agents` 陣列中加入更多 agent 即可。Moderator 會依陣列順序輪流呼叫。

### 11.3 討論紀錄在哪裡？

在：

```text
sessions/<sessionId>/
```

最重要的是：

```text
result.json
messages.jsonl
```

### 11.4 真實 Hermes 不會回 JSON 怎麼辦？

如果 command 或 http adapter 回純文字，系統會把它當成：

```json
{ "content": "<plain text>" }
```

但如果你想產生任務分派，建議讓 Hermes 回傳完整 `AgentResponse` JSON。

### 11.5 我該先讀哪份文件？

使用者先讀：

```text
docs/USER_GUIDE.md
```

Hermes agent 先讀：

```text
docs/HERMES_AGENT_GUIDE.md
```

需要更細的操作背景時讀：

```text
docs/OPERATIONS.md
```

