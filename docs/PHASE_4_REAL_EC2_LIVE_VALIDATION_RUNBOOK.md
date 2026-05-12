# Phase 4 Real EC2 Live Monitor Validation Runbook

## Goal

Validate `v0.3.0` on three real EC2 instances:

- runner
- hermes-a
- hermes-b

The primary validation path is browser-based. Use CLI commands only to prepare services, inspect logs, and confirm persisted output.

## Assumptions

- The three EC2 instances already exist.
- Network rules already allow runner to reach Hermes A and Hermes B on their wrapper ports.
- The browser can reach the runner public IP on port `3000`.
- Hermes CLI and wrappers are already installed from previous phases.
- Repository remote is `git@github.com:haha1811/aiMeeting.git`.

## Step 1: Prepare Runner EC2

On runner:

```bash
cd ~/projects/aiMeeting
git fetch origin
git checkout main
git pull
git checkout v0.3.0
npm install
npm test
```

Expected:

```text
53/53 tests pass
```

Start the Web Runner Console:

```bash
HOST=0.0.0.0 PORT=3000 npm run web
```

Keep this terminal open.

## Step 2: Prepare Hermes A EC2

On hermes-a:

```bash
cd ~/projects/aiMeeting
git fetch origin
git checkout v0.3.0
npm install
```

Start or restart Hermes A wrapper using the existing wrapper command for this environment.

Verify locally:

```bash
curl -s http://localhost:4101/health
```

Expected:

```json
{"ok":true}
```

The exact JSON can include wrapper version, agent id, name, role, and port.

## Step 3: Prepare Hermes B EC2

On hermes-b:

```bash
cd ~/projects/aiMeeting
git fetch origin
git checkout v0.3.0
npm install
```

Start or restart Hermes B wrapper using the existing wrapper command for this environment.

Verify locally:

```bash
curl -s http://localhost:4102/health
```

Expected:

```json
{"ok":true}
```

## Step 4: Verify Runner-to-Agent Network

On runner:

```bash
curl -s http://<hermes-a-private-ip>:4101/health
curl -s http://<hermes-b-private-ip>:4102/health
```

Expected:

```text
"ok":true
```

If either request fails, fix network, security group, wrapper process, or port binding before continuing.

## Step 5: Open Web Console

Open in browser:

```text
http://<runner-public-ip>:3000
```

Confirm the page shows:

- Runner control form
- Planner URL
- Builder URL
- Live status
- Active speaker
- Live events
- Meeting Timeline
- Execution panel

## Step 6: Configure Planner and Builder URLs

Use:

```text
Planner URL: http://<hermes-a-private-ip>:4101/respond
Builder URL: http://<hermes-b-private-ip>:4102/respond
```

Click both Check buttons.

Expected:

```text
Planner URL: green ✓
Builder URL: green ✓
```

Do not continue until both checks pass.

## Step 7: Run Validation Topic

Use this topic:

```text
請 Hermes A 與 Hermes B 共同完成一個產品介紹網站 MVP 的最小可執行雛形。
Hermes A 負責規劃，Hermes B 負責產生可執行 actions。
請先建立 docs/web-mvp-plan.md，內容包含網站目標、頁面區塊、技術選型、開發任務與驗收標準。
接著用 run_command 檢查 docs 目錄。
```

Set:

```text
Max rounds: 2
Execute actions: checked
```

Click:

```text
Run Session
```

## Step 8: Observe Live Monitor

During the run, record:

- Live status values observed.
- Active speaker values observed.
- Live event count at completion.
- Whether Meeting Timeline updates before completion.
- Whether Execution updates before completion.
- Final session id.

Expected live behavior:

```text
Live status: queued/running -> completed
Active speaker: Hermes A and Hermes B appear during the run
Meeting Timeline: messages appear while the run is active
Execution: results appear if actions are produced
```

## Step 9: Verify Final Replay

After completion, confirm:

- Status summary is completed.
- Meeting Timeline still shows all messages.
- Execution panel still shows action results.
- Workspace Files lists generated files.
- Sessions list highlights or can reopen the completed session.

## Step 10: Verify Durable Files on Runner

On runner, using the observed session id:

```bash
SESSION_ID=<session-id>
ls "sessions/$SESSION_ID"
cat "sessions/$SESSION_ID/result.json"
cat "sessions/$SESSION_ID/messages.jsonl"
cat "sessions/$SESSION_ID/actions.jsonl"
cat "sessions/$SESSION_ID/execution-results.jsonl"
find "workspaces/$SESSION_ID/repo" -maxdepth 3 -type f -print
```

Expected:

- `result.json` exists.
- `messages.jsonl` contains planner and builder messages.
- `actions.jsonl` exists when Hermes produced actions.
- `execution-results.jsonl` exists when actions executed.
- Workspace files include expected output such as `docs/web-mvp-plan.md`.

## Step 11: Classify Any Failure

Use one of these categories:

- Runner Web startup failure.
- Browser network access failure.
- Hermes wrapper health failure.
- Hermes CLI response failure.
- Runner-to-agent network failure.
- Live SSE connection failure.
- Live UI rendering failure.
- Action execution failure.
- Replay loading failure.
- Workspace artifact failure.

Record the evidence in:

```text
docs/step_15_phase_4_real_ec2_live_validation_2026_05_12.md
```

## Step 12: Decide Next Version

After validation:

- If all checks pass and no code changes are needed, keep `v0.3.0`.
- If small usability fixes are needed, plan `v0.3.1`.
- If recovery semantics or APIs need major changes, plan `v0.4.0`.
