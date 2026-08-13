-- seed-contract-version: 1
-- seed-pack: common.control.plane-cron-schedules
-- seed-pack-version: 1.0.0
-- seed-dataset: control.cron-schedule
-- seed-data-class: production_reference
-- seed-provenance: {"source":"internal-runtime-schedule-catalog","publisher":"Athyper","source_version":"1","retrieved_at":"2026-08-13","license":"internal"}
-- seed-plane: common
-- seed-tenant-scope: none
-- seed-natural-key: control.cron_schedule(tenant_id,code)
-- seed-cross-file-ids: false
-- seed-id-strategy: natural-key-only
-- seed-expected-row-count: exact:6
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false

DO $seed_plane_guard$
BEGIN
    IF current_setting('app.database_plane', true) NOT IN ('studio', 'neon', 'mesh') THEN
        RAISE EXCEPTION '[common.control.plane-cron-schedules] app.database_plane is missing or invalid';
    END IF;
END $seed_plane_guard$;

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
    updated_by = EXCLUDED.created_by
WHERE (
    control.cron_schedule.name,control.cron_schedule.description,
    control.cron_schedule.handler_type,control.cron_schedule.cron_expression,
    control.cron_schedule.timezone,control.cron_schedule.target_queue,
    control.cron_schedule.max_retries,control.cron_schedule.concurrency_limit,
    control.cron_schedule.lock_key,control.cron_schedule.is_enabled
) IS DISTINCT FROM (
    EXCLUDED.name,EXCLUDED.description,EXCLUDED.handler_type,EXCLUDED.cron_expression,
    EXCLUDED.timezone,EXCLUDED.target_queue,EXCLUDED.max_retries,
    EXCLUDED.concurrency_limit,EXCLUDED.lock_key,EXCLUDED.is_enabled
);

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
    updated_by = EXCLUDED.created_by
WHERE (
    control.cron_schedule.name,control.cron_schedule.description,
    control.cron_schedule.handler_type,control.cron_schedule.cron_expression,
    control.cron_schedule.timezone,control.cron_schedule.target_queue,
    control.cron_schedule.payload_template,control.cron_schedule.priority,
    control.cron_schedule.max_retries,control.cron_schedule.concurrency_limit,
    control.cron_schedule.lock_key,control.cron_schedule.is_enabled
) IS DISTINCT FROM (
    EXCLUDED.name,EXCLUDED.description,EXCLUDED.handler_type,EXCLUDED.cron_expression,
    EXCLUDED.timezone,EXCLUDED.target_queue,EXCLUDED.payload_template,EXCLUDED.priority,
    EXCLUDED.max_retries,EXCLUDED.concurrency_limit,EXCLUDED.lock_key,EXCLUDED.is_enabled
);

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
    updated_by = EXCLUDED.created_by
WHERE (
    control.cron_schedule.name,control.cron_schedule.description,
    control.cron_schedule.handler_type,control.cron_schedule.cron_expression,
    control.cron_schedule.timezone,control.cron_schedule.target_queue,
    control.cron_schedule.payload_template,control.cron_schedule.priority,
    control.cron_schedule.max_retries,control.cron_schedule.concurrency_limit,
    control.cron_schedule.lock_key,control.cron_schedule.is_enabled
) IS DISTINCT FROM (
    EXCLUDED.name,EXCLUDED.description,EXCLUDED.handler_type,EXCLUDED.cron_expression,
    EXCLUDED.timezone,EXCLUDED.target_queue,EXCLUDED.payload_template,EXCLUDED.priority,
    EXCLUDED.max_retries,EXCLUDED.concurrency_limit,EXCLUDED.lock_key,EXCLUDED.is_enabled
);

DO $seed_assertions$
DECLARE
    v_codes text[] := ARRAY[
      'platform-backup-daily','workflow-sla-discovery','notifications-discovery',
      'notifications-digest-hourly','notifications-digest-daily','notifications-digest-weekly'
    ];
BEGIN
    -- seed-assertion: expected-count
    IF (SELECT count(*) FROM control.cron_schedule WHERE tenant_id IS NULL AND code = ANY(v_codes)) <> 6 THEN
        RAISE EXCEPTION '[common.control.plane-cron-schedules] expected 6 global rows';
    END IF;
    -- seed-assertion: orphan
    IF EXISTS (SELECT 1 FROM control.cron_schedule WHERE tenant_id IS NULL AND code = ANY(v_codes) AND target_queue IS NULL) THEN
        RAISE EXCEPTION '[common.control.plane-cron-schedules] orphan target queue';
    END IF;
    -- seed-assertion: uniqueness
    IF EXISTS (SELECT code FROM control.cron_schedule WHERE tenant_id IS NULL AND code = ANY(v_codes) GROUP BY code HAVING count(*) <> 1) THEN
        RAISE EXCEPTION '[common.control.plane-cron-schedules] duplicate global code';
    END IF;
    -- seed-assertion: semantic
    IF EXISTS (SELECT 1 FROM control.cron_schedule WHERE tenant_id IS NULL AND code = ANY(v_codes) AND NOT is_enabled) THEN
        RAISE EXCEPTION '[common.control.plane-cron-schedules] disabled canonical schedule';
    END IF;
END $seed_assertions$;
