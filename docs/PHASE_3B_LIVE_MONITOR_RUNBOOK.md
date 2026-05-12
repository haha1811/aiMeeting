# Phase 3B Live Monitor Runbook

## Goal

Run the Web Runner Console and verify that Hermes session progress appears live while the session is still running.

## Start Server

On runner EC2:

```bash
cd ~/projects/aiMeeting
git pull
npm install
npm test
HOST=0.0.0.0 PORT=3000 npm run web
```

Open:

```text
http://<runner-public-ip>:3000
```

## Verify Hermes Endpoints

Use the Check buttons beside Planner URL and Builder URL.

Expected:

```text
Planner URL: green ✓
Builder URL: green ✓
```

## Run Live Session

1. Enter a topic.
2. Set `Max rounds` to `2`.
3. Enable `Execute actions`.
4. Click `Run Session`.
5. Confirm the Live status changes from `queued` to `running`.
6. Confirm Active speaker changes when Hermes A or Hermes B is called.
7. Confirm Meeting Timeline receives messages before the final replay loads.
8. Confirm Execution receives results if actions are produced.
9. Confirm final status becomes `completed`.

## Fallback Verification

If live updates stop, check persisted replay:

```bash
ls sessions/<sessionId>
cat sessions/<sessionId>/messages.jsonl
cat sessions/<sessionId>/execution-results.jsonl
```

The live stream is in-memory. Persisted JSONL files remain the source of truth.
