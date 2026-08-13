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

-- Workflow SLA discovery is plane-global; each run fans out only to active
-- tenants that currently have an overdue, unprocessed work item.
INSERT INTO control.cron_schedule (
    tenant_id, code, name, description, handler_type, cron_expression,
    timezone, target_queue, payload_template, priority, max_retries,
    concurrency_limit, lock_key, is_enabled, created_by
) VALUES (
    NULL, 'workflow-sla-discovery', 'Workflow SLA breach discovery',
    'Discovers active plane-local tenants with overdue workflow items.',
    'workflow.sla.discover', '* * * * *', 'UTC',
    'workflow.maintenance', '{"limit":500}'::jsonb, 0, 2, 1,
    'workflow:sla:discovery', true,
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
    payload_template = EXCLUDED.payload_template,
    priority = EXCLUDED.priority,
    max_retries = EXCLUDED.max_retries,
    concurrency_limit = EXCLUDED.concurrency_limit,
    lock_key = EXCLUDED.lock_key,
    is_enabled = EXCLUDED.is_enabled,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;

-- Notification discovery is plane-global. The scheduler repository injects
-- the physical plane key and the trusted system principal into each payload;
-- the discovery handler then emits tenant-scoped child jobs only for tenants
-- returned by the governed work-catalog function in that same plane.
INSERT INTO control.cron_schedule (
    tenant_id, code, name, description, handler_type, cron_expression,
    timezone, target_queue, payload_template, priority, max_retries,
    concurrency_limit, lock_key, is_enabled, created_by
)
VALUES
    (NULL, 'notifications-discovery', 'Notification work discovery',
     'Discovers plane-local tenants with notification work.',
     'notifications.discover-work', '* * * * *', 'UTC',
     'notifications.maintenance', '{}'::jsonb, 0, 2, 1,
     'notifications:discovery', true, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'notifications-digest-hourly', 'Hourly notification digest',
     'Discovers plane-local hourly digest work.',
     'notifications.discover-work', '5 * * * *', 'UTC',
     'notifications.maintenance', '{"frequency":"hourly_digest"}'::jsonb, 0, 2, 1,
     'notifications:digest:hourly', true, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'notifications-digest-daily', 'Daily notification digest',
     'Discovers plane-local daily digest work.',
     'notifications.discover-work', '15 0 * * *', 'UTC',
     'notifications.maintenance', '{"frequency":"daily_digest"}'::jsonb, 0, 2, 1,
     'notifications:digest:daily', true, '00000000-0000-0000-0000-000000000000'),
    (NULL, 'notifications-digest-weekly', 'Weekly notification digest',
     'Discovers plane-local weekly digest work.',
     'notifications.discover-work', '30 0 * * 1', 'UTC',
     'notifications.maintenance', '{"frequency":"weekly_digest"}'::jsonb, 0, 2, 1,
     'notifications:digest:weekly', true, '00000000-0000-0000-0000-000000000000')
ON CONFLICT (tenant_id, code)
DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    handler_type = EXCLUDED.handler_type,
    cron_expression = EXCLUDED.cron_expression,
    timezone = EXCLUDED.timezone,
    target_queue = EXCLUDED.target_queue,
    payload_template = EXCLUDED.payload_template,
    priority = EXCLUDED.priority,
    max_retries = EXCLUDED.max_retries,
    concurrency_limit = EXCLUDED.concurrency_limit,
    lock_key = EXCLUDED.lock_key,
    is_enabled = EXCLUDED.is_enabled,
    updated_at = now(),
    updated_by = EXCLUDED.created_by;
