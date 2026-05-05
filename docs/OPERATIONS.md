# Multi-Hermes Agent Discussion 操作說明

這份文件說明如何在 WSL 中安裝、測試、執行 Multi-Hermes Agent Discussion Core，並說明它適合的使用情境與整合方式。

## 1. 功能定位

Multi-Hermes Agent Discussion Core 是一個 TypeScript/Node 模組，用來讓兩台以上的 Hermes agent 在同一個「會議室」裡討論同一個主題。

目前 v1 的設計重點是：

- 多個 Hermes agent 在同一個 Node process 中執行。
- 由 moderator 控制發言順序。
- 討論內容以 JSONL 檔案保存。
- 討論結束後產生任務分派結果。
- 保留未來改成遠端 agent、WebSocket、HTTP API 或 UI 的擴充空間。

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

## 5. 執行測試

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

執行測試：

```bash
npm test
```

目前測試已通過：

```text
tests 6
pass 6
fail 0
```

## 6. 安裝依賴

如果 WSL 專案資料夾是新複製的，先執行：

```bash
cd ~/projects/aiMeeting
export PATH=/home/haha/.local/node/node-v22.22.2-linux-x64/bin:$PATH
npm install
```

依賴版本已固定在 `package-lock.json`。

## 7. 核心概念

### 7.1 HermesAgent

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

### 7.2 DiscussionSession

Session 代表一場多 agent 討論，包含 `sessionId`、`topic`、`agents`、`messages`、`status`、`maxRounds` 與 `taskAssignments`。

### 7.3 Moderator

Moderator 負責：

- 驗證至少要有 2 個 agent。
- 將 session 狀態改成 `running`。
- 依 agents 陣列順序發言。
- 每輪傳入最新 messages 與 taskAssignments。
- 在達到停止條件時完成 session。

停止條件有兩種：

- 已達 `maxRounds`。
- 每個 agent 都至少有一個 task assignment。

### 7.4 JSONL Persistence

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

## 8. 基本使用範例

以下範例建立兩個 fake Hermes agents，讓它們進行一場討論：

```ts
import { DiscussionService, type HermesAgent } from "./src/index.js";

const planner: HermesAgent = {
  id: "planner",
  name: "Planner",
  role: "planning",
  async respond(context) {
    return {
      content: `I will plan the work for: ${context.topic}`,
      taskAssignments: [
        {
          assignedAgentId: "builder",
          title: "Implement core module",
          detail: "Build the service, moderator, and file persistence.",
          confidence: 0.9,
          rationale: "Builder is responsible for implementation."
        }
      ]
    };
  }
};

const builder: HermesAgent = {
  id: "builder",
  name: "Builder",
  role: "implementation",
  async respond() {
    return {
      content: "I can implement the assigned task."
    };
  }
};

const service = new DiscussionService({ rootDir: "sessions" });

const session = await service.createSession({
  topic: "Ship multi-agent discussion v1",
  agents: [planner, builder],
  maxRounds: 3
});

const result = await service.runSession(session.sessionId);

console.log(result.taskAssignments);
```

## 9. Service API

### 9.1 createSession

建立一場討論。

```ts
const session = await service.createSession({
  topic: "討論主題",
  agents: [agentA, agentB],
  maxRounds: 3
});
```

注意：

- `agents` 至少要有 2 個。
- `maxRounds` 預設是 3。
- agent 順序會影響 moderator 發言順序。

### 9.2 runSession

執行討論。

```ts
const result = await service.runSession(session.sessionId);
```

回傳 `DiscussionResult`，其中包含最終任務分派。

### 9.3 appendMessage

手動追加訊息。這可以用在未來加入 human message、system note 或外部 agent message 時。

```ts
await service.appendMessage(session.sessionId, {
  senderId: "human",
  senderName: "Human",
  content: "請聚焦在 v1 最小可行功能。"
});
```

### 9.4 getSession

讀取 session 狀態與 messages。

```ts
const session = await service.getSession(sessionId);
```

### 9.5 getResult

讀取 `result.json`。

```ts
const result = await service.getResult(sessionId);
```

## 10. 接入真實 Hermes Agent

目前 fake agent 是直接回傳固定內容。要接入真實 Hermes agent，需要把 Hermes 的呼叫包進 `respond(context)`。

概念如下：

```ts
const hermesAgent: HermesAgent = {
  id: "hermes-a",
  name: "Hermes A",
  role: "planner",
  async respond(context) {
    const prompt = [
      `Topic: ${context.topic}`,
      `Round: ${context.round}`,
      "Messages:",
      ...context.messages.map((message) => `${message.senderName}: ${message.content}`)
    ].join("\n");

    const hermesOutput = await callHermesRuntime(prompt);

    return {
      content: hermesOutput.text,
      taskAssignments: hermesOutput.taskAssignments
    };
  }
};
```

建議真實整合時，讓 Hermes 回傳結構化資料，例如：

```json
{
  "content": "我建議先完成 moderator loop。",
  "taskAssignments": [
    {
      "assignedAgentId": "builder",
      "title": "Implement moderator loop",
      "detail": "Add deterministic turn control and maxRounds stop condition.",
      "confidence": 0.87,
      "rationale": "這是多 agent 討論最核心的流程。"
    }
  ]
}
```

## 11. 檔案結構

```text
src/
  index.ts
  moderator.ts
  service.ts
  storage.ts
  types.ts
test/
  discussion-service.test.ts
docs/
  OPERATIONS.md
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
- `test/discussion-service.test.ts`：單元與整合測試。

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

建議下一階段做一個 `examples/run-session.ts`，用 2 到 3 個 fake agent 產生實際 `sessions/` 輸出。等流程穩定後，再把 fake agent 換成真實 Hermes runtime adapter。
