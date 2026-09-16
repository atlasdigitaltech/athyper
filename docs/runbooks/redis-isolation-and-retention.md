# Redis isolation and job retention

## Store ownership

| Compose service     | Clients                                                         | maxmemory | Container limit |
| ------------------- | --------------------------------------------------------------- | --------- | --------------- |
| `memorycache`       | Browser sessions, rate limits, general application cache        | 512 MiB   | 1 GiB           |
| `jobqueue`          | Application BullMQ producers, workers, scheduler, queue console | 512 MiB   | 1 GiB           |
| `secretstore-cache` | Infisical only                                                  | 256 MiB   | 512 MiB         |

The laptop-32 deployment budget is now 16 GiB (within its 20 GiB WSL envelope). The three stores share the previous aggregate 0.5 CPU budget: 0.15 for sessions/cache, 0.25 for jobs, and 0.1 for Infisical. Tune these catalog budgets for production load.

Each service has its own persistent volume and `noeviction` policy. Job and secret stores join only the data network; browser containers remain on the app network. The existing password file is reused for compatibility; this is capacity isolation, not a separate credential boundary. Readiness performs an expiring SET, not only PING.

`start-runtime.sh` routes new Compose deployments using `REDIS_BULLMQ_HOST=jobqueue`. Legacy image containers retain the shared endpoint until migrated and redeployed. Source DEV selects the migrated jobqueue. Local checkout plans publish a separate loopback jobs port. Do not switch an existing instance before migrating its work.

## Bounded operational history

The jobs and scheduling runtimes share one retention policy:

- Completed: at most 24 hours, default 1,000 records per queue.
- Failed: at most seven days, default 5,000 records per queue.
- Numeric producer overrides retain their count and gain the default age limit.
- `true` still requests immediate removal. Legacy `false` is normalized to the bounded default; it no longer means keep forever.
- Explicit shorter ages and finite counts are supported. Ages beyond the operational window fail validation; durable archives belong outside Redis.

Publication, integration, finance, and compliance producers no longer request unlimited history. Replayed jobs also receive the bounded policy. BullMQ's automatic removal runs on job finalization. The scheduler additionally discovers idle application queues and cleans up to 1,000 expired completed and 1,000 expired failed records per queue per minute through BullMQ's API. It never cleans waiting, delayed, active or paused work. Scheduler startup rejects a jobs endpoint sharing the cache host/port, even if the database number differs. A sweep is not overlapped with the next one.

Governed executions already record enqueue/start/completion/failure through `createJobExecutionLifecycle` and the Kysely/PostgreSQL execution store. Business audit records and report artifacts are not deleted by Redis cleanup. Ungoverned housekeeping tasks are operational history, not a permanent audit archive. Producers requiring durable history must supply governed execution coordinates. Redis job IDs only deduplicate while the job exists: business idempotency must remain in durable application records.

## Monitoring and recovery

Both Prometheus configurations load `redis-alerts.yml`. Redis exporters distinguish all three stores using the `service` label. Alerts cover memory above 70% for two minutes, above 85% for one minute, any OOM rejection, exporter/Redis availability, terminal job failures, waiting/paused/prioritized backlog, and scheduler endpoint/progress loss.

The scheduler exports job-state totals and the last successful maintenance timestamp. A stale timestamp alerts even if its process still answers HTTP. API and worker failure counters are exposed without requiring an OTLP collector.

Source containers use `watch-runtime.mjs`: `[fatal] boot_failed` terminates the otherwise persistent tsx watcher with a failure exit code. Docker's `unless-stopped` policy then retries startup. Production processes already exit on fatal boot failure. During dependency outages the maintenance loop reports failure and retries; successful progress resumes on recovery.

DEV alerts are routed to the existing Mailpit capture addresses, not external mailboxes. Configure a monitored production receiver before relying on off-host notifications.

## DEV migration on 2026-09-16

API, worker, scheduler and Infisical writers were stopped for a copy-and-verify migration. 12,745 application keys and 177 Infisical keys were copied with Redis DUMP/RESTORE and remaining TTLs. Verification compares serialized or semantic values. Sessions and authorization-cache keys remained in the original store. The source keys were not deleted.

Private deployment files and queue inventory are under `~/.athyper/deployments/redis-isolation-20260916/`. They contain the live stores and monitoring Compose projections. Prometheus is available at `http://127.0.0.1:59090`; Mailpit remains the notification capture service. These files are deliberately outside Git.

`tooling/scripts/local-dev/migrate-redis-stores.mjs` requires an explicit application queue inventory and `ATHYPER_REDIS_WRITERS_STOPPED=1`. Run only after verifying all writers are stopped. It copies application queues to jobqueue, other BullMQ queues to Infisical's store, and leaves application session/cache keys in place. Review the inventory and key ownership for each environment; do not blindly reuse DEV's classification. Never use FLUSHALL or raw queue-key deletion for routine retention.

The original keys are a recovery snapshot, not a live mirror. After processing resumes on the destination, blindly switching back could replay completed work or lose new work. Rollback requires stopping writers and reconciling new queue state. Archive and remove the original migrated keys only after the recovery window has closed.

QA candidate images were not rebuilt or migrated in this change; the template changes apply on their next deliberate deployment.

## Verification

- Runtime retention/replay and scheduler tests; affected finance, integration, publication and compliance suites.
- TypeScript checks for jobs, scheduling and platform host.
- Compose structure and local-development projection tests; stack policy and catalog tests.
- Promtool fixtures for all three stores, threshold crossing, OOM, failure growth, backlog and scheduler loss.
- Disposable three-store integration test: exhaust only jobqueue, verify the other stores remain writable and pending work survives restart.
- With `ATHYPER_RUNTIME_TEST_IMAGE`, that integration test also runs a tsx watcher in Docker, verifies a failed Redis write triggers a container restart, and verifies recovery after Redis is restored.
