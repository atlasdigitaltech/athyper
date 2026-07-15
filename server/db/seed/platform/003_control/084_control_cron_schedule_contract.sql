-- Cron schedules live in DB so ops can adjust frequency, pause, or re-enable
-- without a redeploy (scheduler polls every 60s).
-- handler_type + target_queue values must match JOB_NAME / QUEUE_NAME enums in jobs.types.ts.
-- lock_key gates concurrent execution across multi-replica deploys.

INSERT INTO control.cron_schedule (
    code,
    name,
    description,
    handler_type,
    cron_expression,
    timezone,
    target_queue,
    payload_template,
    priority,
    max_retries,
    concurrency_limit,
    lock_key,
    is_enabled,
    created_by
)
VALUES (
    'platform-backup-daily',
    'Daily PostgreSQL Backup',
    'pg_dump | gzip â†’ object storage (BACKUP_S3_BUCKET). '
    'Prunes snapshots older than BACKUP_RETENTION_DAYS. '
    'Schedule: daily at 02:00 UTC. Ops-adjustable without restart.',
    'pg-dump',
    '0 2 * * *',
    'UTC',
    'jobs-backup',
    '{}',
    0,
    2,
    1,
    'backup:daily',
    true,
    '00000000-0000-7000-a000-000000000001'   -- SYSTEM_ACTOR_ID
)
ON CONFLICT (tenant_id, code) DO UPDATE
    SET name            = EXCLUDED.name,
        description     = EXCLUDED.description,
        cron_expression = EXCLUDED.cron_expression,
        handler_type    = EXCLUDED.handler_type,
        target_queue    = EXCLUDED.target_queue,
        max_retries     = EXCLUDED.max_retries,
        lock_key        = EXCLUDED.lock_key,
        updated_at      = now(),
        updated_by      = '00000000-0000-7000-a000-000000000001';

