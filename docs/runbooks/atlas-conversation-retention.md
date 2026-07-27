# Atlas conversation retention and purge

For activation gates, access control, transcript lifecycle, rollout, incident
handling, and rollback, see
[Atlas Agent conversation persistence operations](./atlas-agent-conversation-persistence.md).

## Activation

The retention scheduler is fail-closed and remains inactive unless all of the
following are true:

- `ATLAS_CONVERSATION_PERSISTENCE_ENABLED=true`;
- `ATLAS_CONVERSATION_MAINTENANCE_DATABASE_URL` is configured in both the
  scheduler and worker runtimes;
- the maintenance URL identifies a different database authority from
  `DATABASE_URL`;
- the login has `athyperadmin_atlas_maintenance`;
- the same login does not have `athyperapp`.

The maintenance connection uses its own pool (maximum one connection) and is
closed through the normal server lifecycle. The application DB connection is
never promoted or relabelled as maintenance authority. The maintenance role
has Atlas-envelope select/update and parent-conversation delete only. It has no
direct `master.atlas_message` or `event.atlas_run` privilege and is not a
support-access path.

## Schedule and safety model

- Queue: `jobs-atlas-conversation-purge`
- Job: `atlas-conversation-purge`
- Scheduler: `sched:atlas-conversation-purge`
- Cadence: hourly
- Batch size: `ATLAS_CONVERSATION_PURGE_BATCH_SIZE`
- Worker concurrency: one

The job payload must be `{}`. Any payload containing tenant, principal, plane,
thread, retention, or time selectors is rejected before the maintenance
service is called. Eligibility, legal-hold checks, ordering, and cross-tenant
selection are owned by `AtlasThreadService.purgeEligible()` and its approved
SQL maintenance authority.

Purging is two-pass. An eligible live thread is first marked deleted; a
subsequent run may hard-delete it. Rows under legal hold are excluded from both
passes.

For `tenant_protected_store` mode, do not activate the scheduler until the
approved adapter's readiness evidence includes durable deletion/purge and
backup recovery. Database cascade alone cannot prove deletion of an external
protected-content object.

If authority validation fails, startup continues with Atlas purge inactive and
any stale scheduler entry is removed. Do not manually recreate the scheduler
until the maintenance authority is healthy.

## Operational signals

Structured logs:

- `atlas_conversation_maintenance_authority_ready`
- `atlas_conversation_maintenance_authority_rejected`
- `atlas_conversation_maintenance_authority_unavailable`
- `atlas_conversation_purge_scheduler_active`
- `atlas_conversation_purge_scheduler_inactive`
- `atlas_conversation_purge_started`
- `atlas_conversation_purge_completed`
- `atlas_conversation_purge_failed`
- framework-level `jobs_job_failed` and `jobs_worker_error`

`atlas_conversation_purge_completed` includes `expiredCount`, `purgedCount`,
`batchSize`, and `durationMs`. These fields should feed dashboards for purge
throughput, run duration, and repeated zero-throughput investigation.

Prometheus counters:

- `athyper_atlas_conversation_purge_runs_total`;
- `athyper_atlas_conversation_purge_rows_total`;
- `athyper_atlas_conversation_purge_duration_milliseconds_total`;
- `athyper_atlas_thread_operations_total`.

The existing jobs hooks emit Healthchecks completion/failure heartbeats and
send terminal failures to Sentry. Queue depth, delayed, active, and failed job
counts remain visible through the existing jobs administration surface.

Alert when:

- authority rejection/unavailability appears in any scheduler or worker;
- the scheduler is inactive while persistence is enabled;
- two consecutive hourly jobs fail;
- waiting/delayed queue depth remains non-zero for more than two hours;
- eligible retention backlog grows while `purgedCount` remains zero.

## Rollback

Set `ATLAS_CONVERSATION_PERSISTENCE_ENABLED=false` and restart scheduler and
worker runtimes. Startup removes the repeatable purge scheduler and creates no
purge worker. Existing stored conversations are retained; rollback does not
delete data.
