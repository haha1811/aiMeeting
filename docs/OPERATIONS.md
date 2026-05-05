# Multi-Hermes Agent Discussion 操作說明

這份文件說明如何在 WSL 中安裝、測試、執行 Multi-Hermes Agent Discussion Core，並說明它適合的使用情境與整合方式。

## 1. 功能定位

Multi-Hermes Agent Discussion Core 是一個 TypeScript/Node 模組，用來讓兩台以上的 Hermes agent 在同一個「會議室」裡討論同一個主題。

目前 v1 的設計重點是：

- 多個 Hermes agent 在同一個 Node process 中執行。
- 由 moderator 控制發言順序。
- 討論內容以 JSONL 檔案保存。
- 討論結束後產生任務分派結果。
- 支援 mock、command、http 三種 agent adapter。
- 保留未來擴充成遠端 agent、WebSocket、HTTP API 或 UI 的空間。

這個模組不是聊天 UI，也不是完整的 agent runtime。它比較像是多 agent 協作的核心協調層。

## 2. 使用情境

### 2.1 多 agent 共同規劃任務

當你有不同角色的 Hermes agent，例如 Planner、Builder、Reviewer，可以讓它們針對同一個 topic 進行多輪討論，最後由討論結果產生任務分派。

適合用於：

- 新功能開發前的技術討論。
- 大型需求拆解。
- 讓不同專長的 agent 互相補充。

### 2.2 自動化會議紀錄

每次討論都會寫入：

- `messages.jsonl`：每一則 agent 發言。
- `events.jsonl`：session 建立、開始、完成、失敗等事件。
- `session.json`：目前 session 狀態。
- `result.json`：最終任務分派結果。

這讓你可以在事後檢查 agent 為什麼做出某個任務分派。

### 2.3 多角色決策輔助

你可以讓每個 Hermes agent 扮演不同觀點，例如 Product、Engineering、QA、Ops。Moderator 會依固定順序讓 agent 發言，避免自由聊天造成重複或失控。

### 2.4 任務分派產生器

討論過程中，agent 可以在回覆中附帶 `taskAssignments`。當每個 agent 都至少有一個任務時，moderator 會提早結束討論。

如果討論到最大回合數仍有 agent 沒有被指派任務，moderator 會補上預設 follow-up 任務，避免結果缺漏。

## 3. 目前專案位置

Windows 原始工作目錄：

```text
G:\其他電腦\PTC_Lenovo X13\tmp\VibeCoding\aiMeeting
```

WSL 內可執行工作目錄：

```bash
/home/haha/projects/aiMeeting
```

由於 Windows 的 `G:\其他電腦\...` 路徑無法被 WSL 正常轉換，建議日常執行與測試都在 WSL 的 Linux home 目錄中進行。

## 4. WSL 環境

目前已確認：

- WSL distro：Ubuntu
- WSL version：2
- WSL 使用者：`haha`
- Node 安裝位置：`/home/haha/.local/node/node-v22.22.2-linux-x64`
- Node 版本：`v22.22.2`
- npm 版本：`10.9.7`

Node 是安裝在使用者目錄下，沒有使用 `sudo apt install`。原因是目前 WSL 的 `sudo` 需要密碼，為了避免卡住，改用 user-local Node。

## 5. 安裝與測試

進入 WSL：

```powershell
wsl
```

切換到專案：

```bash
cd ~/projects/aiMeeting
```

把 user-local Node 加入本次 shell 的 PATH：

```bash
export PATH=/home/haha/.local/node/node-v22.22.2-linux-x64/bin:$PATH
```

安裝依賴：

```bash
npm install
```

執行測試：

```bash
npm test
```

目前測試應通過：

```text
tests 9
pass 9
fail 0
```

## 6. 啟動 Hermes 討論

預設已提供 `hermes-a` / `hermes-b` 的 mock 設定。

執行：

```bash
npm run session
```

這個指令會：

- 讀取 `hermes-agents.config.json`
- 建立一場 moderated discussion
- 依序呼叫 `hermes-a`、`hermes-b`
- 將每次發言寫入 `messages.jsonl`
- 將最終任務分派寫入 `result.json`

成功時會輸出類似：

```json
{
  "status": "completed",
  "messageCount": 3,
  "roundsCompleted": 2,
  "taskAssignmentCount": 2,
  "files": {
    "messages": "sessions/<sessionId>/messages.jsonl",
    "events": "sessions/<sessionId>/events.jsonl",
    "session": "sessions/<sessionId>/session.json",
    "result": "sessions/<sessionId>/result.json"
  }
}
```

你也可以覆蓋 topic：

```bash
npm run session -- --topic "討論下一步 Hermes 整合"
```

或指定不同 config：

```bash
npm run session -- --config hermes-agents.config.example.json
```

## 7. Agent 設定檔

主要設定檔：

```text
hermes-agents.config.json
```

範本：

```text
hermes-agents.config.example.json
```

基本格式：

```json
{
  "topic": "Discussion topic",
  "maxRounds": 3,
  "rootDir": "sessions",
  "agents": [
    {
      "id": "hermes-a",
      "name": "Hermes A",
      "role": "planner",
      "type": "mock",
      "responses": [{ "content": "I am ready." }]
    },
    {
      "id": "hermes-b",
      "name": "Hermes B",
      "role": "builder",
      "type": "mock",
      "responses": [{ "content": "I am ready too." }]
    }
  ]
}
```

規則：

- `agents` 至少要有 2 個。
- 每個 `id` 必須唯一。
- `id` 會被 `taskAssignments.assignedAgentId` 使用。
- agent 陣列順序就是 moderator 發言順序。
- `maxRounds` 控制最大討論回合數。

## 8. Adapter 類型

### 8.1 mock

`mock` 用於測試或 demo，不需要真實 Hermes runtime。

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

### 8.2 command

`command` 用於本機可執行的 Hermes agent。

Runner 會把 `AgentDiscussionContext` JSON 傳到 stdin。Command 必須輸出 `AgentResponse` JSON，或輸出純文字。純文字會被當成：

```json
{ "content": "<stdout>" }
```

設定範例：

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

Command contract：

```text
stdin:  AgentDiscussionContext JSON
stdout: AgentResponse JSON or plain text
exit:   0 on success
```

### 8.3 http

`http` 用於有 HTTP endpoint 的 Hermes agent。

Runner 會以 POST JSON 的方式把 `AgentDiscussionContext` 傳到 endpoint。Endpoint 必須回傳 `AgentResponse` JSON，或回傳純文字。

設定範例：

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

## 9. 核心概念

### 9.1 HermesAgent

每一台 Hermes agent 都要符合 `HermesAgent` 介面：

```ts
export interface HermesAgent {
  id: string;
  name: string;
  role?: string;
  respond(context: AgentDiscussionContext): Promise<AgentResponse>;
}
```

最重要的是 `respond(context)`。Moderator 每次輪到該 agent 發言時，會把目前 session context 傳入。

### 9.2 DiscussionSession

Session 代表一場多 agent 討論，包含：

- `sessionId`
- `topic`
- `agents`
- `messages`
- `status`
- `maxRounds`
- `taskAssignments`

### 9.3 Moderator

Moderator 負責：

- 驗證至少要有 2 個 agent。
- 將 session 狀態改成 `running`。
- 依 agents 陣列順序發言。
- 每輪傳入最新 messages 與 taskAssignments。
- 在達到停止條件時完成 session。

停止條件有兩種：

- 已達 `maxRounds`。
- 每個 agent 都至少有一個 task assignment。

### 9.4 JSONL Persistence

每場 session 都會建立資料夾：

```text
sessions/<sessionId>/
```

內容包含：

```text
messages.jsonl
events.jsonl
session.json
result.json
```

`messages.jsonl` 與 `events.jsonl` 是 append-only 格式，適合除錯、重播與串接後續分析工具。

## 10. Service API

### 10.1 createSession

建立一場討論：

```ts
const session = await service.createSession({
  topic: "討論主題",
  agents: [agentA, agentB],
  maxRounds: 3
});
```

### 10.2 runSession

執行討論：

```ts
const result = await service.runSession(session.sessionId);
```

### 10.3 appendMessage

手動追加訊息：

```ts
await service.appendMessage(session.sessionId, {
  senderId: "human",
  senderName: "Human",
  content: "請聚焦在 v1 最小可行功能。"
});
```

### 10.4 getSession

讀取 session 狀態與 messages：

```ts
const session = await service.getSession(sessionId);
```

### 10.5 getResult

讀取 `result.json`：

```ts
const result = await service.getResult(sessionId);
```

## 11. 檔案結構

```text
src/
  adapters.ts
  cli.ts
  config.ts
  index.ts
  moderator.ts
  service.ts
  storage.ts
  types.ts
test/
  config-adapters.test.ts
  discussion-service.test.ts
docs/
  HERMES_AGENT_GUIDE.md
  OPERATIONS.md
hermes-agents.config.json
hermes-agents.config.example.json
package.json
package-lock.json
tsconfig.json
README.md
```

主要檔案說明：

- `src/types.ts`：所有公開型別。
- `src/service.ts`：外部主要使用入口。
- `src/moderator.ts`：控制多 agent 討論流程。
- `src/storage.ts`：JSONL 與 JSON 檔案保存。
- `src/adapters.ts`：mock、command、http adapter。
- `src/cli.ts`：`npm run session` 的執行入口。
- `src/config.ts`：讀取與驗證 agent 設定檔。

## 12. 常見問題

### 12.1 為什麼不要直接在 Windows 目錄跑？

目前 Windows 路徑包含：

```text
G:\其他電腦\PTC_Lenovo X13\...
```

WSL 無法穩定轉換這個路徑，所以建議在：

```bash
~/projects/aiMeeting
```

執行。

### 12.2 為什麼每次都要 export PATH？

因為 Node 是安裝在 user-local 目錄，而不是系統 PATH。

你可以把這行加入 `~/.bashrc`：

```bash
export PATH=/home/haha/.local/node/node-v22.22.2-linux-x64/bin:$PATH
```

之後開新的 WSL shell 就不用重打。

### 12.3 如果 npm test 找不到測試怎麼辦？

確認 `package.json` 裡的 test script 是：

```json
"test": "npm run build && node --test dist/test/*.test.js"
```

再重新執行：

```bash
npm test
```

### 12.4 討論結果在哪裡？

預設在執行目錄下的：

```text
sessions/<sessionId>/result.json
```

如果你建立 service 時指定不同 `rootDir`，結果會寫到該目錄。

## 13. 建議下一步

下一階段可以把 `hermes-agents.config.json` 裡的 mock agent 換成真實 Hermes runtime：

- 如果 Hermes 是本機 executable，使用 `type: "command"`。
- 如果 Hermes 是 HTTP service，使用 `type: "http"`。

換好後執行：

```bash
npm run session
```

目標是讓 `hermes-a` 和 `hermes-b` 不需要直接互相呼叫，而是透過 moderator 傳遞 context，開始可追蹤、可保存、可驗證的討論。
