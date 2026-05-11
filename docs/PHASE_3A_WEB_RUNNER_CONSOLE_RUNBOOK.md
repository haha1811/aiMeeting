# Phase 3A Web Runner Console Runbook

## Goal

Run the Web runner console on the runner EC2 and use a browser to start and replay a real Hermes execution session.

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

## Hermes Endpoints

Use:

```text
Planner URL: http://10.100.1.21:4101/respond
Builder URL: http://10.100.1.32:4102/respond
```

Verify health first:

```bash
curl -s http://10.100.1.21:4101/health
curl -s http://10.100.1.32:4102/health
```

Both should show:

```text
real-hermes-wrapper-action-json-v3
```

## Run Session

In the Web form:

- Enter topic.
- Set maxRounds to 2.
- Enable execution.
- Confirm planner and builder URLs.
- Click Check next to Planner URL and Builder URL. Both should show a green `✓` before running.
- Click Run Session.

Expected:

- Status banner changes to Running.
- After completion, Session Summary appears.
- Meeting Timeline shows Hermes A and Hermes B messages.
- Execution panel shows actions and execution results.
- Workspace Files shows files created under `workspaces/<sessionId>/repo`.
- The selected session remains highlighted in the Sessions list.

## Troubleshooting

If the Web request fails:

- Confirm runner can curl hermes-a and hermes-b health endpoints.
- Confirm `HOST=0.0.0.0 PORT=3000 npm run web` is still running.
- Confirm runner security group allows inbound access to port 3000 from your IP.
- Check terminal logs for HTTP 500 error messages.
