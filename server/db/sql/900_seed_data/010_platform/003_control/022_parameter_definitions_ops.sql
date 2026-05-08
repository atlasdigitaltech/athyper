-- ============================================================================
-- Parameter definitions — Jobs workers, CMS, API tuning, Governance internals
-- Tier 2: system_controlled / readonly — visible to admin, not overridable by tenants.
-- These serve as a live documentation layer and allow platform engineers to
-- audit current values through Setup > Parameters.
-- ============================================================================

INSERT INTO control.parameter_definition (
    code,
    namespace,
    display_name,
    description,
    owner_model,
    control_level,
    tenant_visibility,
    data_type,
    unit,
    default_value,
    product_value,
    min_value,
    max_value,
    allowed_values,
    runtime_reload,
    cache_ttl_seconds,
    is_security_sensitive,
    is_runtime_reloadable,
    sort_order,
    metadata,
    created_by
)
SELECT
    v.code,
    v.namespace,
    v.display_name,
    v.description,
    'product',
    'system_controlled',
    'readonly',
    v.data_type,
    v.unit,
    v.default_value::jsonb,
    NULLIF(v.product_value, '')::jsonb,
    NULLIF(v.min_value, '')::jsonb,
    NULLIF(v.max_value, '')::jsonb,
    NULL::jsonb,                           -- no allowed_values for readonly ops params
    'restart',                             -- ops params require process restart to take effect
    300,
    false,
    false,                                 -- not runtime-reloadable (restart required)
    v.sort_order,
    v.metadata::jsonb,
    '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    -- ── Jobs: Sweep intervals ─────────────────────────────────────────────────
    ('jobs.lifecycle.sweep_interval_ms',       'jobs.lifecycle',   'Lifecycle timer sweep interval',          'How often the lifecycle timer worker sweeps for expired timers.',                               'integer', 'milliseconds', '60000',      '60000',      '10000',   '3600000',  10,  '{"source":"server/framework/runtime/services/jobs/jobs.types.ts:282","fallback_constant":"LIFECYCLE_TIMER_SWEEP_MS"}'),
    ('jobs.notification.sweep_interval_ms',    'jobs.notification','Notification sweep interval',             'How often the notification dispatch worker sweeps for pending messages.',                      'integer', 'milliseconds', '300000',     '300000',     '10000',   '3600000',  10,  '{"source":"server/framework/runtime/services/jobs/jobs.types.ts:283","fallback_constant":"NOTIFICATION_SWEEP_MS"}'),
    ('jobs.outbox.drain_interval_ms',          'jobs.outbox',      'Domain outbox drain interval',            'How often the domain event outbox worker drains pending events.',                              'integer', 'milliseconds', '30000',      '30000',      '5000',    '600000',   10,  '{"source":"server/framework/runtime/services/jobs/jobs.types.ts:284","fallback_constant":"DOMAIN_OUTBOX_DRAIN_MS"}'),
    ('jobs.sla.check_interval_ms',             'jobs.sla',         'SLA check interval',                     'How often the SLA breach detection worker runs.',                                              'integer', 'milliseconds', '300000',     '300000',     '60000',   '3600000',  20,  '{"source":"server/framework/runtime/services/jobs/jobs.types.ts:285","fallback_constant":"SLA_BREACH_CHECK_MS"}'),
    ('jobs.notification.digest_hourly_ms',     'jobs.notification','Hourly digest window',                   'Time window for hourly notification digest batching.',                                         'integer', 'milliseconds', '3600000',    '3600000',    '1800000', '7200000',  20,  '{"source":"server/framework/runtime/services/jobs/jobs.types.ts:286","fallback_constant":"NOTIFICATION_DIGEST_HOURLY_MS"}'),
    ('jobs.notification.digest_daily_ms',      'jobs.notification','Daily digest window',                    'Time window for daily notification digest batching.',                                          'integer', 'milliseconds', '86400000',   '86400000',   '43200000','172800000',30,  '{"source":"server/framework/runtime/services/jobs/jobs.types.ts:287","fallback_constant":"NOTIFICATION_DIGEST_DAILY_MS"}'),
    ('jobs.notification.digest_weekly_ms',     'jobs.notification','Weekly digest window',                   'Time window for weekly notification digest batching.',                                         'integer', 'milliseconds', '604800000',  '604800000',  '259200000','1209600000',40, '{"source":"server/framework/runtime/services/jobs/jobs.types.ts:288","fallback_constant":"NOTIFICATION_DIGEST_WEEKLY_MS"}'),
    ('jobs.provider.health_check_interval_ms', 'jobs.provider',    'Provider health-check interval',         'How often the notification provider health worker polls.',                                     'integer', 'milliseconds', '900000',     '900000',     '60000',   '3600000',  10,  '{"source":"server/framework/runtime/services/jobs/jobs.types.ts:289","fallback_constant":"NOTIFICATION_PROVIDER_HEALTH_MS"}'),
    ('jobs.docrender.sweep_interval_ms',       'jobs.docrender',   'Document render sweep interval',         'How often the document render sweep runs.',                                                   'integer', 'milliseconds', '30000',      '30000',      '5000',    '300000',   10,  '{"source":"server/framework/runtime/services/jobs/jobs.types.ts:290","fallback_constant":"RENDER_DOCUMENT_SWEEP_MS"}'),
    ('jobs.iam.kc_sync_interval_ms',           'jobs.iam',         'Keycloak sync interval',                 'How often the IAM/Keycloak reconciliation worker runs.',                                      'integer', 'milliseconds', '900000',     '900000',     '60000',   '3600000',  10,  '{"source":"server/framework/runtime/services/jobs/jobs.types.ts:291","fallback_constant":"IAM_KC_SYNC_MS"}'),
    ('jobs.endpoint.health_sweep_interval_ms', 'jobs.endpoint',    'Endpoint health sweep interval',         'How often the endpoint health probe worker sweeps integration endpoints.',                     'integer', 'milliseconds', '300000',     '300000',     '60000',   '3600000',  10,  '{"source":"server/framework/runtime/services/jobs/jobs.types.ts:292","fallback_constant":"ENDPOINT_HEALTH_SWEEP_MS"}'),
    ('jobs.tika.sweep_interval_ms',            'jobs.tika',        'Tika extraction sweep interval',         'How often the text extraction sweep worker runs.',                                             'integer', 'milliseconds', '600000',     '600000',     '60000',   '3600000',  10,  '{"source":"server/framework/runtime/services/jobs/jobs.types.ts:293","fallback_constant":"TIKA_EXTRACT_SWEEP_MS"}'),
    ('jobs.outbox.purge_interval_ms',          'jobs.outbox',      'Outbox purge interval',                  'How often the event outbox purge housekeeping job runs.',                                      'integer', 'milliseconds', '3600000',    '3600000',    '600000',  '86400000', 20,  '{"source":"server/framework/runtime/services/jobs/jobs.types.ts:294","fallback_constant":"OUTBOX_PURGE_SWEEP_MS"}'),
    ('jobs.editlock.stale_sweep_interval_ms',  'jobs.editlock',    'Stale edit-lock sweep interval',         'How often the stale edit-lock cleanup job runs.',                                              'integer', 'milliseconds', '300000',     '300000',     '60000',   '3600000',  20,  '{"source":"server/framework/runtime/services/jobs/jobs.types.ts:295","fallback_constant":"STALE_LOCK_SWEEP_MS"}'),

    -- ── Jobs: Batch sizes ─────────────────────────────────────────────────────
    ('jobs.lifecycle.batch_size',              'jobs.lifecycle',   'Lifecycle timer batch size',              'Number of timer records processed per lifecycle sweep iteration.',                             'integer', 'rows',         '200',        '200',        '10',      '5000',     20,  '{"source":"server/framework/runtime/services/jobs/workers/lifecycle-timer.worker.ts:59","fallback_constant":"BATCH"}'),
    ('jobs.sla.batch_size',                    'jobs.sla',         'SLA check batch size',                   'Number of work items checked per SLA sweep iteration.',                                        'integer', 'rows',         '100',        '100',        '10',      '5000',     30,  '{"source":"server/framework/runtime/services/jobs/workers/sla-check.worker.ts:44","fallback_constant":"BATCH"}'),
    ('jobs.notification.send_batch_size',      'jobs.notification','Notification send batch size',           'Number of notifications dispatched per send-pass iteration.',                                  'integer', 'rows',         '100',        '100',        '10',      '1000',     50,  '{"source":"server/framework/runtime/services/jobs/workers/notification.worker.ts:172","fallback_constant":"BATCH"}'),
    ('jobs.notification.digest_batch_size',    'jobs.notification','Notification digest batch size',         'Number of notifications bundled per digest-pass iteration.',                                   'integer', 'rows',         '500',        '500',        '50',      '5000',     60,  '{"source":"server/framework/runtime/services/jobs/workers/notification.worker.ts:490","fallback_constant":"BATCH"}'),
    ('jobs.tika.sweep_batch_size',             'jobs.tika',        'Tika sweep batch size',                  'Number of documents queued per text-extraction sweep iteration.',                              'integer', 'rows',         '200',        '200',        '10',      '2000',     20,  '{"source":"server/framework/runtime/services/jobs/workers/tika-extract.worker.ts:48","fallback_constant":"DEFAULT_SWEEP_BATCH"}'),
    ('jobs.outbox.drain_batch_size',           'jobs.outbox',      'Outbox drain batch size',                'Number of outbox events drained per iteration.',                                               'integer', 'rows',         '50',         '50',         '5',       '1000',     30,  '{"source":"server/framework/runtime/services/jobs/workers/domain-outbox.worker.ts:67","fallback_constant":"BATCH_SIZE"}'),
    ('jobs.iam.kc_sync_batch_size',            'jobs.iam',         'Keycloak sync batch size',               'Number of users fetched per Keycloak reconciliation page.',                                    'integer', 'rows',         '100',        '100',        '10',      '1000',     20,  '{"source":"server/framework/runtime/services/jobs/workers/kc-sync.worker.ts:72","fallback_constant":"BATCH_SIZE"}'),
    ('jobs.webhook.sweep_batch_size',          'jobs.webhook',     'Webhook sweep batch size',               'Number of outbound webhook deliveries processed per sweep iteration.',                         'integer', 'rows',         '50',         '50',         '5',       '500',      10,  '{"source":"server/framework/runtime/services/jobs/workers/webhook-delivery.worker.ts:41","fallback_constant":"SWEEP_BATCH_SIZE"}'),
    ('jobs.import.chunk_size',                 'jobs.import',      'Bulk import chunk size',                 'Number of rows per import chunk in the bulk import engine.',                                   'integer', 'rows',         '500',        '500',        '50',      '5000',     10,  '{"source":"server/framework/runtime/services/records/routes/import.route.ts:128","fallback_constant":"DEFAULT_CHUNK_SIZE"}'),

    -- ── Jobs: Worker concurrency ──────────────────────────────────────────────
    ('jobs.cms.preview_concurrency',           'jobs.cms',         'CMS preview concurrency',                'Number of CMS preview generation jobs that can run simultaneously.',                           'integer', 'workers',      '4',          '4',          '1',       '20',       10,  '{"source":"server/framework/runtime/services/jobs/workers/cms-preview.worker.ts:215","fallback_constant":"concurrency"}'),
    ('jobs.webhook.delivery_concurrency',      'jobs.webhook',     'Webhook delivery concurrency',           'Number of outbound webhook delivery jobs that can run simultaneously.',                        'integer', 'workers',      '10',         '10',         '1',       '50',       20,  '{"source":"server/framework/runtime/services/jobs/workers/webhook-delivery.worker.ts:335","fallback_constant":"concurrency"}'),
    ('jobs.outbox.drain_concurrency',          'jobs.outbox',      'Outbox drain concurrency',               'Number of domain outbox drain jobs that can run simultaneously.',                              'integer', 'workers',      '3',          '3',          '1',       '10',       40,  '{"source":"server/framework/runtime/services/jobs/workers/domain-outbox.worker.ts:200","fallback_constant":"concurrency"}'),
    ('jobs.docrender.concurrency',             'jobs.docrender',   'Document render concurrency',            'Number of document render jobs that can run simultaneously.',                                  'integer', 'workers',      '3',          '3',          '1',       '20',       20,  '{"source":"server/framework/runtime/services/jobs/workers/render-document.worker.ts:585","fallback_constant":"concurrency"}'),

    -- ── Jobs: Edit-lock heartbeat ─────────────────────────────────────────────
    ('jobs.editlock.heartbeat_seconds',        'jobs.editlock',    'Edit-lock heartbeat interval (seconds)', 'How often the browser must send a heartbeat to renew an edit lock.',                            'integer', 'seconds',      '30',         '30',         '5',       '120',      20,  '{"source":"server/framework/runtime/services/shared/edit-lock.service.ts:26","fallback_constant":"DEFAULT_HEARTBEAT_SECONDS"}'),

    -- ── CMS / Tika ────────────────────────────────────────────────────────────
    ('cms.tika.max_extract_bytes',             'cms.tika',         'Tika max extraction file size',          'Maximum file size (bytes) submitted to Tika for text extraction.',                             'integer', 'bytes',        '52428800',   '52428800',   '1048576', NULL,       10,  '{"source":"server/framework/runtime/services/jobs/workers/tika-extract.worker.ts:45","fallback_constant":"DEFAULT_MAX_EXTRACT_BYTES"}'),
    ('cms.tika.max_text_chars',                'cms.tika',         'Tika max extracted text length',         'Maximum number of characters retained from Tika text extraction output.',                      'integer', 'characters',   '5000000',    '5000000',    '1000',    NULL,       20,  '{"source":"server/framework/runtime/services/jobs/workers/tika-extract.worker.ts:46","fallback_constant":"DEFAULT_MAX_TEXT_CHARS"}'),
    ('cms.preview.max_chars',                  'cms.preview',      'CMS card preview text length',           'Maximum number of characters shown in CMS content card previews.',                             'integer', 'characters',   '500',        '500',        '50',      '5000',     10,  '{"source":"server/framework/runtime/services/jobs/workers/cms-preview.worker.ts:37","fallback_constant":"MAX_PREVIEW_CHARS"}'),

    -- ── Notifications: Channels ───────────────────────────────────────────────
    ('notifications.sms.max_chars',            'notifications.sms','SMS max message length',                 'Maximum character length of an outbound SMS message (including concatenation overhead).',      'integer', 'characters',   '1600',       '1600',       '160',     '3200',     10,  '{"source":"server/framework/runtime/services/jobs/adapters/sms.adapter.ts:36","fallback_constant":"MAX_SMS_CHARS"}'),
    ('notifications.webhook.replay_window_ms', 'notifications.webhook','Inbound webhook replay-protection window','Time window used to detect and reject duplicate inbound webhook deliveries.',             'integer', 'milliseconds', '300000',     '300000',     '60000',   '3600000',  20,  '{"source":"server/framework/runtime/services/integration/routes/webhook-receiver.route.ts:53","fallback_constant":"REPLAY_WINDOW_MS"}'),
    ('notifications.webhook.max_body_bytes',   'notifications.webhook','Inbound webhook max payload',        'Maximum raw body size accepted for inbound webhook events.',                                   'integer', 'bytes',        '1048576',    '1048576',    '1024',    '10485760', 30,  '{"source":"server/framework/runtime/services/integration/routes/webhook-receiver.route.ts:55","fallback_constant":"MAX_BODY_BYTES"}'),

    -- ── API: Facets ───────────────────────────────────────────────────────────
    ('api.facets.max_fields',                  'api.facets',       'Facet field cap',                        'Maximum number of fields for which facet counts are computed per list request.',                'integer', 'fields',       '20',         '20',         '1',       '100',      10,  '{"source":"server/framework/runtime/services/records/routes/records.route.ts:797","fallback_constant":"FACET_FIELD_CAP"}'),
    ('api.facets.max_values',                  'api.facets',       'Facet value cap',                        'Maximum distinct values returned per facet field.',                                            'integer', 'values',       '200',        '200',        '10',      '5000',     20,  '{"source":"server/framework/runtime/services/records/routes/records.route.ts:798","fallback_constant":"FACET_VALUE_CAP"}'),
    ('api.facets.query_timeout_ms',            'api.facets',       'Facet query hard timeout',               'Maximum time (ms) the server waits for facet aggregation queries before returning partial results.','integer', 'milliseconds', '2000',       '2000',       '200',     '30000',    30,  '{"source":"server/framework/runtime/services/records/routes/records.route.ts:799","fallback_constant":"FACET_TIMEOUT_MS"}'),

    -- ── API: Audit & integration ──────────────────────────────────────────────
    ('api.audit.export_batch_size',            'api.audit',        'Audit export streaming batch size',      'Number of audit rows streamed per DB cursor page during export.',                               'integer', 'rows',         '500',        '500',        '50',      '5000',     30,  '{"source":"server/framework/runtime/services/audit/routes/audit.route.ts:122","fallback_constant":"EXPORT_BATCH"}'),
    ('api.integration.max_event_window_days',  'api.integration',  'Integration event history window (days)','Maximum date range for querying integration event history.',                                    'integer', 'days',         '30',         '30',         '1',       '365',      10,  '{"source":"server/framework/runtime/services/integration/routes/integration.route.ts:85","fallback_constant":"MAX_WINDOW_DAYS"}'),

    -- ── Governance: AI ────────────────────────────────────────────────────────
    ('governance.ai.confidence_cache_ttl_seconds', 'governance.ai','AI confidence cache TTL',               'How long the AI confidence resolver caches resolved confidence scores.',                        'integer', 'seconds',      '60',         '60',         '5',       '3600',     10,  '{"source":"server/framework/runtime/services/ai/confidence-resolver.service.ts:33","fallback_constant":"CACHE_TTL_SECONDS"}'),
    ('governance.ai.autonomy_cache_ttl_seconds',   'governance.ai','AI autonomy cache TTL',                 'How long the AI autonomy resolver caches resolved autonomy config.',                            'integer', 'seconds',      '60',         '60',         '5',       '3600',     20,  '{"source":"server/framework/runtime/services/ai/autonomy-resolver.service.ts:35","fallback_constant":"CACHE_TTL_SECONDS"}'),
    ('governance.iam.kc_circuit_breaker_open_ms',  'governance.iam','Keycloak circuit-breaker hold time',   'How long the Keycloak sync worker holds the circuit open after a failure.',                     'integer', 'milliseconds', '600000',     '600000',     '60000',   '3600000',  10,  '{"source":"server/framework/runtime/services/jobs/workers/kc-sync.worker.ts:71","fallback_constant":"KC_BREAKER_OPEN_MS"}'),

    -- ── UX: Reference data ────────────────────────────────────────────────────
    ('ux.refdata.stale_time_ms',               'ux.refdata',       'Reference data cache stale time',        'How long reference data (currencies, countries, timezones, UoM) is considered fresh on the client.',  'integer', 'milliseconds', '3600000',    '3600000',    '60000',   '86400000', 10,  '{"source":"apps/web/hooks/useRefData.ts:127","fallback_constant":"STALE_1H"}'),
    ('ux.recents.local_storage_ttl_ms',        'ux.recents',       'Recent-items local storage TTL',         'How long recent navigation history is retained in the browser local storage.',                  'integer', 'milliseconds', '86400000',   '86400000',   '3600000', '604800000',30,  '{"source":"apps/web/hooks/useLocalPreferences.ts"}')

) AS v(
    code,
    namespace,
    display_name,
    description,
    data_type,
    unit,
    default_value,
    product_value,
    min_value,
    max_value,
    sort_order,
    metadata
)
ON CONFLICT (code) DO UPDATE SET
    namespace             = EXCLUDED.namespace,
    display_name          = EXCLUDED.display_name,
    description           = EXCLUDED.description,
    control_level         = EXCLUDED.control_level,
    tenant_visibility     = EXCLUDED.tenant_visibility,
    data_type             = EXCLUDED.data_type,
    unit                  = EXCLUDED.unit,
    default_value         = EXCLUDED.default_value,
    product_value         = EXCLUDED.product_value,
    min_value             = EXCLUDED.min_value,
    max_value             = EXCLUDED.max_value,
    runtime_reload        = EXCLUDED.runtime_reload,
    cache_ttl_seconds     = EXCLUDED.cache_ttl_seconds,
    is_security_sensitive = EXCLUDED.is_security_sensitive,
    is_runtime_reloadable = EXCLUDED.is_runtime_reloadable,
    sort_order            = EXCLUDED.sort_order,
    metadata              = EXCLUDED.metadata,
    status                = 'active',
    updated_at            = now(),
    updated_by            = EXCLUDED.created_by;
