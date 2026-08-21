# RB-08 — Bull Board Emergency Activation

Use `queueconsole` only when the platform API is unavailable and BullMQ must be
inspected during an active incident. Normal operations use the authenticated
`/api/jobs/admin/*` endpoints, which enforce `jobs.board.view`,
`jobs.queue.manage`, and schedule permissions and retain Athyper audit evidence.

## Preconditions

1. Open an incident and record the operator, reason, environment, and start time.
2. Obtain approval from the incident commander for break-glass inspection.
3. Confirm `REDIS_BULLMQ_URL` and `BULLBOARD_REDIS_HOST` identify the same Redis
   deployment and DB. The Compose-managed topology uses `memorycache-jobs:6379/0`.
4. Set strong, temporary `BULLBOARD_UI_USER` and `BULLBOARD_UI_PASSWORD` values.
5. Ensure `REDIS_BULLBOARD_PASSWORD` is the password rendered for the read-only
   Redis ACL user `bullboard`.

## Activate

Start the dedicated Redis and emergency profiles together:

```text
stack/scripts/stack-profile/up.sh emergency,memorycache-jobs
```

On Windows:

```text
stack\scripts\stack-profile\up.bat emergency,memorycache-jobs
```

The UI binds to loopback only. Open `http://127.0.0.1:3001` on the Docker host.
For a remote host, use an authenticated SSH local-forward:

```text
ssh -N -L 3001:127.0.0.1:3001 operator@docker-host
```

Then open `http://127.0.0.1:3001` locally and authenticate with the temporary UI
credentials. Do not publish this port on `0.0.0.0` and do not add a Traefik route.

## Allowed operations

The `bullboard` Redis ACL is read-only. Inspect queue counts, states, job payloads,
failures, and timing only. Mutation attempts from Bull Board must fail with a Redis
authorization error. Use the normal RBAC-protected API for cancel, retry, replay,
or schedule changes whenever the API is available.

If emergency mutation is unavoidable while the API is down, stop here and follow
the separately approved Redis administrator break-glass process. Record every
command and affected job ID in the incident. This runbook does not authorize
administrative Redis credentials.

## Tear down

Stop the console immediately after evidence collection:

```text
stack/scripts/stack-service/stop.sh queueconsole
```

On Windows:

```text
stack\scripts\stack-service\stop.bat queueconsole
```

Close SSH forwarding, rotate the temporary UI password, and record the stop time,
screenshots or exported evidence, and any attempted actions in the incident.

## Verification

- `queueconsole` is stopped after the incident.
- Port 3001 is no longer listening.
- No public Traefik router exists for queueconsole.
- BullMQ workers and schedulers still use the expected `REDIS_BULLMQ_URL`.
- Any operational mutation appears in the Athyper job administration audit trail.
