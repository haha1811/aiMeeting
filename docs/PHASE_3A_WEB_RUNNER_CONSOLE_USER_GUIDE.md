# Phase 3A Web Runner Console 使用者指南

這份文件提供給想透過瀏覽器操作 Multi-Hermes runner 的使用者。

如果你只是要在 runner EC2 上啟動服務，請看：

```text
docs/PHASE_3A_WEB_RUNNER_CONSOLE_RUNBOOK.md
```

如果你想知道 Web Console 畫面怎麼使用、每個欄位代表什麼、如何判斷 session 是否成功，請看本文件。

## 1. Web Runner Console 是什麼

Web Runner Console 是跑在 runner EC2 上的瀏覽器介面。

它讓你不用手動編輯：

```text
hermes-agents.real-execution.config.json
```

也不用手動執行：

```bash
npm run session -- --config hermes-agents.real-execution.config.json --execute
```

你可以直接在 Web 畫面輸入 topic、planner URL、builder URL，然後按下 Run Session。

Web Console 會做這些事：

```text
Browser
→ runner Web server
→ runner 建立 session
→ runner 呼叫 Hermes A / Hermes B
→ runner 執行 Hermes actions
→ runner 寫入 sessions/<sessionId>/*
→ Browser 顯示 replay 結果
```

## 2. 適合使用的情境

### 情境一：你想直覺查看 Hermes A / Hermes B 的討論

原本你需要 SSH 到 runner，手動查看：

```bash
cat sessions/<sessionId>/messages.jsonl
```

現在你可以在 Web Console 的 Meeting Timeline 直接看到：

- Hermes A 說了什麼
- Hermes B 說了什麼
- 每一輪是哪個 agent 發言
- 每則訊息產生了哪些 assignments / actions / execution results

### 情境二：你想從瀏覽器啟動一次 real Hermes execution session

你可以填入：

```text
Topic
Max rounds
Planner URL
Builder URL
Execute actions
```

然後按下：

```text
Run Session
```

runner 會用這些欄位建立等效 config，並執行 session。

### 情境三：你想看 workspace 產物

如果 Hermes actions 建立了檔案，例如：

```text
docs/web-mvp-plan.md
web-mvp/index.html
```

Web Console 會在 Workspace Files 區塊列出這些檔案。

Phase 3A 目前只列檔案清單，不直接預覽檔案內容。

## 3. 使用前要先準備什麼

你需要有三台 EC2 的既有環境：

```text
runner EC2
hermes-a EC2
hermes-b EC2
```

並且：

- runner 可以連到 hermes-a `:4101`
- runner 可以連到 hermes-b `:4102`
- hermes-a / hermes-b 已啟動 real Hermes wrapper
- wrapper version 是 `real-hermes-wrapper-action-json-v3`

在 runner EC2 可以先檢查：

```bash
curl -s http://10.100.1.21:4101/health
curl -s http://10.100.1.32:4102/health
```

預期看到：

```text
real-hermes-wrapper-action-json-v3
```

## 4. 開啟 Web Console

在 runner EC2：

```bash
cd ~/projects/aiMeeting
git pull
npm install
HOST=0.0.0.0 PORT=3000 npm run web
```

然後在瀏覽器打開：

```text
http://<runner-public-ip>:3000
```

如果你是在內網或跳板環境，請依你的網路環境使用可連到 runner 的位址。

## 5. 畫面區塊說明

Phase 3A Web Console 主要分成三個區塊。

```text
左側：Runner Control
中間：Meeting Timeline
右側：Execution / Workspace Files
```

### 5.1 Runner Control

Runner Control 是左側操作區。

欄位：

| 欄位 | 說明 |
| --- | --- |
| Topic | 本次 Hermes 討論與執行的主題 |
| Max rounds | 最多討論幾輪 |
| Execute actions | 是否讓 runner 執行 Hermes 回傳的 actions |
| Planner URL | Hermes A `/respond` endpoint |
| Builder URL | Hermes B `/respond` endpoint |
| Run Session | 建立並執行 session |
| Reset Defaults | 還原預設欄位 |

Planner URL 範例：

```text
http://10.100.1.21:4101/respond
```

Builder URL 範例：

```text
http://10.100.1.32:4102/respond
```

### 5.2 Sessions

左側下方的 Sessions 會列出 runner 已經執行過的 session。

你可以點選既有 session，查看它的 replay。

這個功能等同於用 Web 讀取：

```text
sessions/<sessionId>/messages.jsonl
sessions/<sessionId>/actions.jsonl
sessions/<sessionId>/execution-results.jsonl
sessions/<sessionId>/result.json
```

### 5.3 Session Summary

畫面上方會顯示目前選取 session 的摘要。

常見欄位：

| 欄位 | 說明 |
| --- | --- |
| Session | sessionId |
| Status | session 狀態 |
| Messages | 對話訊息數 |
| Actions | Hermes 產生的 action 數 |
| Execution Results | runner 執行 action 後的結果數 |
| Workspace | workspace repo path |

如果 `Execution Results` 大於 0，代表 runner 有執行 actions。

### 5.4 Meeting Timeline

Meeting Timeline 是主要 replay 區。

每張 message card 會顯示：

- 發言 agent
- agent role
- round
- content
- assignments
- actions
- results

你可以用這裡快速理解：

```text
Hermes A 規劃了什麼
Hermes B 執行了什麼
runner 回傳了哪些 execution results
```

### 5.5 Execution Panel

右側 Execution 區會顯示 execution results。

每筆 result 會有：

- status
- summary
- outputPreview
- error

常見 status：

| 狀態 | 說明 |
| --- | --- |
| succeeded | action 執行成功 |
| failed | action 執行失敗 |
| skipped | action 被略過 |

如果出現 failed，請先看該筆 result 的 summary 或 error。

### 5.6 Workspace Files

Workspace Files 會列出：

```text
workspaces/<sessionId>/repo
```

底下由 Hermes actions 建立的檔案。

例如：

```text
docs/web-mvp-plan.md
web-mvp/index.html
```

## 6. 第一個從零到完成的使用情境

### Step 1：確認 Hermes wrapper health

在 runner EC2：

```bash
curl -s http://10.100.1.21:4101/health
curl -s http://10.100.1.32:4102/health
```

確認兩台都是：

```text
real-hermes-wrapper-action-json-v3
```

### Step 2：啟動 Web Console

在 runner EC2：

```bash
HOST=0.0.0.0 PORT=3000 npm run web
```

### Step 3：打開瀏覽器

```text
http://<runner-public-ip>:3000
```

### Step 4：填入 topic

範例：

```text
請 Hermes A 與 Hermes B 共同完成一個產品介紹網站 MVP 的最小可執行雛形。
Hermes A 負責規劃，Hermes B 負責產生可執行 actions。
請先建立 docs/web-mvp-plan.md，內容包含網站目標、頁面區塊、技術選型、開發任務與驗收標準。
接著用 run_command 檢查 docs 目錄。
```

### Step 5：確認欄位

```text
Max rounds: 2
Execute actions: checked
Planner URL: http://10.100.1.21:4101/respond
Builder URL: http://10.100.1.32:4102/respond
```

### Step 6：按 Run Session

Web 會顯示 running 狀態。

Phase 3A 是 replay MVP，所以畫面會在 session 完成後顯示完整結果。

### Step 7：判斷是否成功

成功時你應該看到：

```text
Status: completed
Messages: 大於 0
Actions: 大於 0
Execution Results: 大於 0
Workspace Files: 有檔案
```

如果 `Execution Results` 是 0，代表 Hermes 有討論，但沒有產生可執行 actions，或 runner 沒收到 actions。

## 7. 如何判斷常見結果

### 成功

```text
Status = completed
Execution Results > 0
Workspace Files 有檔案
```

代表：

```text
Hermes 有產生 actions
runner 有執行 actions
workspace 有產物
```

### 有對話但沒有 execution

```text
Messages > 0
Execution Results = 0
```

可能原因：

- Execute actions 沒有勾選
- Hermes 沒有回傳 actions
- wrapper prompt 沒產生 action JSON

### Session failed

可能原因：

- runner 連不到 planner URL
- runner 連不到 builder URL
- Hermes wrapper process 沒啟動
- Hermes CLI timeout
- Web server 後端發生錯誤

請先確認：

```bash
curl -s http://10.100.1.21:4101/health
curl -s http://10.100.1.32:4102/health
```

## 8. Phase 3A 限制

Phase 3A 是 Replay MVP。

目前已支援：

- 從 Web 表單啟動 session
- session 完成後 replay 對話
- 顯示 actions
- 顯示 execution results
- 顯示 workspace file list

目前尚未支援：

- session 執行中即時串流更新
- WebSocket
- Server-Sent Events
- 多使用者登入權限
- 在 Web 內直接預覽檔案內容
- 在 Web 內直接編輯 workspace 檔案
- 任意 shell command 輸入

即時更新會放在 Phase 3B Live Monitor。

## 9. 推薦操作順序

```text
1. 確認 hermes-a / hermes-b health。
2. 在 runner 啟動 npm run web。
3. 用瀏覽器打開 Web Console。
4. 填入 topic 和 endpoints。
5. 按 Run Session。
6. 查看 Session Summary。
7. 查看 Meeting Timeline。
8. 查看 Execution Panel。
9. 查看 Workspace Files。
10. 若成功，記錄 sessionId。
```

## 10. 下一步

當 Phase 3A Web Console 可以穩定使用後，下一階段可以進入 Phase 3B：

```text
Live Monitor
```

目標是讓 Web 畫面在 session 執行中即時更新：

- 新 message 即時出現
- 新 action 即時出現
- execution result 即時更新
- runner 目前正在呼叫哪個 agent 可以被看見

