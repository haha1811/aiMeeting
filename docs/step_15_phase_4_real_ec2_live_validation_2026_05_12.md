# Step 15: Phase 4 Real EC2 Live Monitor Validation Record

## Environment

| Role | Hostname / IP | Notes |
| --- | --- | --- |
| runner |  |  |
| hermes-a |  | planner |
| hermes-b |  | builder |

Repository version:

```text
v0.3.2
```

## Runner Preparation

Commands:

```bash
cd ~/projects/aiMeeting
git fetch origin
git checkout main
git pull
git checkout v0.3.2
npm install
npm test
HOST=0.0.0.0 PORT=3000 npm run web
```

Result:

```text

```

## Hermes A Preparation

Wrapper file check:

```bash
git status --short
grep -n "health" agents/hermes-http-real.js
```

Result:

```text

```

Health check:

```bash
curl -s http://localhost:4101/health
```

Result:

```text

```

## Hermes B Preparation

Wrapper file check:

```bash
git status --short
grep -n "health" agents/hermes-http-real.js
```

Result:

```text

```

Health check:

```bash
curl -s http://localhost:4102/health
```

Result:

```text

```

## Runner-to-Agent Connectivity

Commands:

```bash
curl -s http://<hermes-a-private-ip>:4101/health
curl -s http://<hermes-b-private-ip>:4102/health
```

Result:

```text

```

## Browser Validation

Browser URL:

```text
http://<runner-public-ip>:3000
```

Checklist:

| Check | Result | Evidence / Notes |
| --- | --- | --- |
| Web Console loads |  |  |
| Planner URL Check green |  |  |
| Builder URL Check green |  |  |
| Run Session creates job |  |  |
| Live status reaches completed |  |  |
| Active speaker shows Hermes A |  |  |
| Active speaker shows Hermes B |  |  |
| Meeting Timeline updates live |  |  |
| Execution updates live |  |  |
| Final replay loads |  |  |
| Workspace Files show output |  |  |

Observed session id:

```text

```

Observed live event count:

```text

```

## Durable File Verification

Generated files should be checked on runner only. Hermes A and Hermes B do not have the runner workspace locally.

Commands:

```bash
SESSION_ID=<session-id>
ls "sessions/$SESSION_ID"
cat "sessions/$SESSION_ID/result.json"
cat "sessions/$SESSION_ID/messages.jsonl"
cat "sessions/$SESSION_ID/actions.jsonl"
cat "sessions/$SESSION_ID/execution-results.jsonl"
find "workspaces/$SESSION_ID/repo" -maxdepth 3 -type f -print
```

Result:

```text

```

## Failure Classification

If any issue occurred, classify it here:

```text

```

Allowed categories:

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

## Hardening Notes

Record any candidate follow-up patch fixes:

```text

```

## Final Result

Phase 4 validation result:

```text

```
