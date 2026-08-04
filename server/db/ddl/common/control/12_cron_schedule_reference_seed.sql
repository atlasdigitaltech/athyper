-- Each physical plane owns its own backup schedule and database connection.
INSERT INTO control.cron_schedule (
    tenant_id, code, name, description, handler_type, cron_expression,
    timezone, target_queue, payload_template, priority, max_retries,
    concurrency_limit, lock_key, is_enabled, created_by
) VALUES (
    NULL,
    'platform-backup-daily',
    'Daily PostgreSQL Backup',
    'Plane-local pg_dump backup to configured object storage.',
    'pg-dump',
    '0 2 * * *',
    'UTC',
    'jobs-backup',
    '{}'::jsonb,
    0,
    2,
    1,
    'backup:daily',
    true,
    '00000000-0000-0000-0000-000000000000'
)
ON CONFLICT (tenant_id, code)
DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    handler_type = EXCLUDED.handler_type,
    cron_expression = EXCLUDED.cron_expression,
    timezone = EXCLUDED.timezone,
    target_queue = EXCLUDED.target_queue,
    max_retries = EXCLUDED.max_retries,
    concurrency_limit = EXCLUDED.concurrency_limit,
    lock_key = EXCLUDED.lock_key,
    is_enabled = EXCLUDED.is_enabled,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;
