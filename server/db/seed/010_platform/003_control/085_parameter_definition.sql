-- Table-owned seed for control.parameter_definition
-- Consolidated from 010_platform control/entity-engine/domain-registration sources.
-- Lookup domain/value seeds remain under 000_lookups by design.


-- ============================================================
-- SOURCE: server/db/seed/010_platform/003_control/020_parameter_definitions.sql
-- ============================================================

-- ============================================================================
-- Runtime parameter definitions — all namespaces
-- Covers: auth/session, finance, collaboration, notifications, API, governance,
--         jobs workers, CMS, UX, and platform-internal ops parameters.
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

-- ── Auth / Session / Runtime parameters (tenant_configurable + system_controlled) ──────────
SELECT
    v.code,
    v.namespace,
    v.display_name,
    v.description,
    'product',
    v.control_level,
    v.tenant_visibility,
    v.data_type,
    v.unit,
    v.default_value::jsonb,
    NULLIF(v.product_value, '')::jsonb,
    NULLIF(v.min_value, '')::jsonb,
    NULLIF(v.max_value, '')::jsonb,
    NULLIF(v.allowed_values, '')::jsonb,
    v.runtime_reload,
    v.cache_ttl_seconds,
    v.is_security_sensitive,
    v.is_runtime_reloadable,
    v.sort_order,
    v.metadata::jsonb,
    '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('auth.session.absolute_ttl_seconds', 'auth.session', 'BFF session absolute TTL', 'Maximum Redis-backed web session lifetime before a full login is required.', 'tenant_configurable', 'configurable', 'integer', 'seconds', '28800', '28800', '1800', '43200', NULL, 'next_login', 300, true, true, 10, '{"source":"apps/web/lib/auth/session-policy.ts","fallback_constant":"SESSION_TTL_SECONDS"}'),
    ('auth.pkce.state_ttl_seconds', 'auth.login', 'PKCE state TTL', 'Maximum lifetime of the OAuth PKCE state record used during sign in.', 'system_controlled', 'readonly', 'integer', 'seconds', '1800', '1800', '300', '3600', NULL, 'next_request', 300, true, true, 20, '{"source":"apps/web/lib/auth/session-policy.ts","fallback_constant":"PKCE_STATE_TTL_SECONDS"}'),
    ('auth.idle.timeout_seconds', 'auth.inactivity', 'Inactivity timeout', 'Idle duration after which the session is locked and the user must sign in again.', 'tenant_configurable', 'configurable', 'integer', 'seconds', '900', '900', '300', '3600', NULL, 'immediate', 300, true, true, 30, '{"source":"apps/web/lib/auth/session-policy.ts","fallback_constant":"IDLE_TIMEOUT_SECONDS"}'),
    ('auth.idle.warning_seconds', 'auth.inactivity', 'Inactivity warning lead time', 'How long before idle expiry the browser warning dialog is shown.', 'tenant_configurable', 'configurable', 'integer', 'seconds', '120', '120', '30', '600', NULL, 'immediate', 300, false, true, 40, '{"source":"apps/web/lib/auth/session-policy.ts","fallback_constant":"IDLE_WARNING_SECONDS"}'),
    ('auth.heartbeat.interval_ms', 'auth.inactivity', 'Activity heartbeat interval', 'Minimum interval between active-browser touch calls that update lastSeenAt.', 'tenant_configurable', 'configurable', 'integer', 'milliseconds', '300000', '300000', '60000', '600000', NULL, 'immediate', 300, false, true, 50, '{"source":"apps/web/lib/auth/session-policy.ts","fallback_constant":"HEARTBEAT_INTERVAL_MS"}'),
    ('auth.token.client_refresh_lead_seconds', 'auth.token', 'Client refresh lead time', 'Browser token refresh starts this many seconds before access token expiry.', 'system_controlled', 'readonly', 'integer', 'seconds', '90', '90', '30', '300', NULL, 'immediate', 300, true, true, 60, '{"source":"apps/web/lib/auth/session-policy.ts","fallback_constant":"CLIENT_REFRESH_BEFORE_EXPIRY_SECONDS"}'),
    ('auth.token.server_refresh_buffer_seconds', 'auth.token', 'Server refresh buffer', 'Server-side session reads refresh the access token when it is inside this expiry buffer.', 'system_controlled', 'readonly', 'integer', 'seconds', '120', '120', '60', '600', NULL, 'next_request', 300, true, true, 70, '{"source":"apps/web/lib/auth/session-policy.ts","fallback_constant":"SERVER_REFRESH_BUFFER_SECONDS"}'),
    ('auth.refresh.lock_ttl_seconds', 'auth.refresh', 'Refresh lock TTL', 'Distributed Redis lock lifetime used to prevent refresh-token rotation races.', 'system_controlled', 'readonly', 'integer', 'seconds', '10', '10', '3', '60', NULL, 'next_request', 300, true, true, 80, '{"source":"apps/web/lib/auth/session-policy.ts","fallback_constant":"REFRESH_LOCK_TTL_SECONDS"}'),
    ('auth.refresh.lock_wait_ms', 'auth.refresh', 'Refresh lock wait', 'How long a concurrent request waits before reading a rotated session.', 'system_controlled', 'readonly', 'integer', 'milliseconds', '300', '300', '50', '2000', NULL, 'next_request', 300, false, true, 90, '{"source":"apps/web/lib/auth/session-policy.ts","fallback_constant":"REFRESH_LOCK_WAIT_MS"}'),
    ('auth.refresh.sid_rotation_grace_seconds', 'auth.refresh', 'SID rotation grace', 'Short lookup window from old SID to new SID for in-flight requests.', 'system_controlled', 'readonly', 'integer', 'seconds', '30', '30', '5', '120', NULL, 'next_request', 300, true, true, 100, '{"source":"apps/web/lib/auth/session-policy.ts","fallback_constant":"REFRESH_ROTATION_GRACE_SECONDS"}'),
    ('auth.session.expired_redirect_countdown_seconds', 'auth.session', 'Expired-session redirect countdown', 'Countdown shown before an expired-session dialog redirects to sign in.', 'tenant_configurable', 'configurable', 'integer', 'seconds', '30', '30', '5', '300', NULL, 'immediate', 300, false, true, 110, '{"source":"apps/web/lib/auth/session-policy.ts","fallback_constant":"SESSION_EXPIRED_REDIRECT_COUNTDOWN_SECONDS"}'),
    ('auth.mfa.pending_ttl_seconds', 'auth.mfa', 'MFA pending TTL', 'How long an MFA-pending browser state can live before restarting sign in.', 'tenant_configurable', 'configurable', 'integer', 'seconds', '900', '900', '300', '1800', NULL, 'next_request', 300, true, true, 120, '{"source":"apps/web/lib/auth/session-policy.ts","fallback_constant":"MFA_PENDING_TTL_SECONDS"}'),
    ('auth.mfa.trusted_device_ttl_days', 'auth.mfa', 'Trusted device lifetime', 'How long a remembered device can bypass repeated MFA challenges.', 'tenant_configurable', 'configurable', 'integer', 'days', '30', '30', '1', '90', NULL, 'next_request', 300, true, true, 130, '{"source":"apps/web/lib/auth/session-policy.ts","fallback_constant":"TRUSTED_DEVICE_TTL_DAYS"}'),
    ('runtime.mfa.step_up_ttl_seconds', 'runtime.mfa', 'Step-up elevation TTL', 'How long a successful MFA step-up remains valid for sensitive actions.', 'tenant_configurable', 'configurable', 'integer', 'seconds', '600', '600', '60', '1800', NULL, 'next_request', 300, true, true, 140, '{"source":"server/framework/runtime/services/iam/mfa/step-up.service.ts"}'),
    ('runtime.session.cache_ttl_seconds', 'runtime.session', 'Runtime session cache TTL', 'Cache lifetime for resolved runtime session context.', 'system_controlled', 'readonly', 'integer', 'seconds', '300', '300', '60', '900', NULL, 'next_request', 300, true, true, 150, '{"source":"server/framework/runtime/services/iam/session/session.service.ts"}'),
    ('runtime.bootstrap.cache_ttl_seconds', 'runtime.session', 'Runtime bootstrap cache TTL', 'Cache lifetime for tenant bootstrap data used by the shell.', 'system_controlled', 'readonly', 'integer', 'seconds', '300', '300', '60', '900', NULL, 'next_request', 300, false, true, 160, '{"source":"server/framework/runtime/services/iam/bootstrap/bootstrap.service.ts"}'),
    ('runtime.portal.default_workbench', 'runtime.portal', 'Default portal workbench', 'Phase 1 fallback portal/workbench when IAM/KC does not provide a resolved portal. Defaults landing workspace display to the User portal until Phase 2 subscription and authorization filtering is enabled.', 'tenant_configurable', 'configurable', 'enum', NULL, '"user"', '"user"', NULL, NULL, '["user","partner","admin"]', 'next_login', 300, false, true, 165, '{"source":"apps/web/app/(shell)/(core)/dashboard/page.tsx","phase":"1","fallback_constant":"PHASE_ONE_DEFAULT_PORTAL"}'),
    ('auth.logout.revoke_refresh_tokens', 'auth.logout', 'Revoke refresh tokens on logout', 'Whether logout attempts to revoke the active Keycloak refresh token.', 'system_controlled', 'readonly', 'boolean', NULL, 'true', 'true', NULL, NULL, NULL, 'external_provider', 300, true, true, 170, '{"source":"apps/web/app/api/auth/logout/route.ts"}'),
    ('auth.logout.clear_all_bff_namespaces', 'auth.logout', 'Clear all BFF session namespaces', 'Whether logout clears every known BFF session namespace for the user.', 'system_controlled', 'readonly', 'boolean', NULL, 'true', 'true', NULL, NULL, NULL, 'next_request', 300, true, true, 180, '{"source":"apps/web/app/api/auth/logout/route.ts"}'),
    ('keycloak.token.access_ttl_seconds', 'keycloak.token', 'Keycloak access token TTL', 'Reference value for the Keycloak realm/client access token lifetime.', 'system_controlled', 'readonly', 'integer', 'seconds', '900', '900', '60', '3600', NULL, 'external_provider', 300, true, false, 190, '{"source":"Keycloak realm configuration","external":true}'),
    ('keycloak.sso.idle_timeout_seconds', 'keycloak.session', 'Keycloak SSO idle timeout', 'Reference value for the Keycloak SSO idle timeout.', 'system_controlled', 'readonly', 'integer', 'seconds', '1800', '1800', '300', '86400', NULL, 'external_provider', 300, true, false, 200, '{"source":"Keycloak realm configuration","external":true}'),
    ('keycloak.sso.max_lifespan_seconds', 'keycloak.session', 'Keycloak SSO max lifespan', 'Reference value for the Keycloak SSO maximum session lifespan.', 'system_controlled', 'readonly', 'integer', 'seconds', '36000', '36000', '1800', '604800', NULL, 'external_provider', 300, true, false, 210, '{"source":"Keycloak realm configuration","external":true}'),
    ('keycloak.refresh.revoke_tokens_enabled', 'keycloak.refresh', 'Keycloak revoke refresh tokens', 'Reference value for Keycloak refresh-token revocation behavior.', 'system_controlled', 'readonly', 'boolean', NULL, 'true', 'true', NULL, NULL, NULL, 'external_provider', 300, true, false, 220, '{"source":"Keycloak realm configuration","external":true}'),
    ('keycloak.refresh.max_reuse', 'keycloak.refresh', 'Keycloak refresh max reuse', 'Reference value for refresh token max reuse. Zero means single-use rotation.', 'system_controlled', 'readonly', 'integer', 'count', '0', '0', '0', '10', NULL, 'external_provider', 300, true, false, 230, '{"source":"Keycloak realm configuration","external":true}'),
    ('auth.cookie.session_name', 'auth.cookie', 'Session cookie name', 'Name of the secure HTTP-only BFF session cookie.', 'system_controlled', 'readonly', 'string', NULL, '"neon_sid"', '"neon_sid"', NULL, NULL, NULL, 'restart', 300, true, false, 240, '{"source":"apps/web auth routes"}'),
    ('auth.cookie.csrf_name', 'auth.cookie', 'CSRF cookie name', 'Name of the secure HTTP-only CSRF binding cookie.', 'system_controlled', 'readonly', 'string', NULL, '"__csrf"', '"__csrf"', NULL, NULL, NULL, 'restart', 300, true, false, 250, '{"source":"apps/web auth routes"}'),
    ('auth.cookie.mfa_pending_name', 'auth.cookie', 'MFA pending cookie name', 'Name of the secure HTTP-only MFA pending cookie.', 'system_controlled', 'readonly', 'string', NULL, '"neon_mfa_pending"', '"neon_mfa_pending"', NULL, NULL, NULL, 'restart', 300, true, false, 260, '{"source":"apps/web auth routes"}'),
    ('auth.cookie.realm_name', 'auth.cookie', 'Realm cookie name', 'Name of the login realm hint cookie.', 'system_controlled', 'readonly', 'string', NULL, '"neon_realm"', '"neon_realm"', NULL, NULL, NULL, 'restart', 300, false, false, 270, '{"source":"apps/web auth routes"}')
) AS v(
    code, namespace, display_name, description,
    control_level, tenant_visibility, data_type, unit,
    default_value, product_value, min_value, max_value, allowed_values,
    runtime_reload, cache_ttl_seconds, is_security_sensitive, is_runtime_reloadable,
    sort_order, metadata
)

UNION ALL

-- ── Finance / Collaboration / Notifications / API / Governance / UX parameters ───────────
SELECT
    v.code,
    v.namespace,
    v.display_name,
    v.description,
    'product',
    v.control_level,
    v.tenant_visibility,
    v.data_type,
    v.unit,
    v.default_value::jsonb,
    NULLIF(v.product_value, '')::jsonb,
    NULLIF(v.min_value, '')::jsonb,
    NULLIF(v.max_value, '')::jsonb,
    NULLIF(v.allowed_values, '')::jsonb,
    v.runtime_reload,
    v.cache_ttl_seconds,
    v.is_security_sensitive,
    v.is_runtime_reloadable,
    v.sort_order,
    v.metadata::jsonb,
    '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    -- ── Finance: AP ───────────────────────────────────────────────────────────
    ('finance.ap.payment_terms_days',    'finance.ap',
     'Default AP payment terms (days)',
     'Default net-payment days applied to AP invoices when no supplier-specific terms are set.',
     'tenant_configurable', 'configurable', 'integer', 'days',
     '30', '30', '0', '365', NULL,
     'next_request', 300, false, true, 10,
     '{"source":"server/workspace/finance/ap/ap.service.ts","fallback_constant":"DEFAULT_PAYMENT_TERMS_DAYS"}'),

    ('finance.ap.tolerance_amount',      'finance.ap',
     'AP matching absolute tolerance',
     'Maximum absolute currency difference allowed when matching a purchase invoice line to a GR.',
     'tenant_configurable', 'configurable', 'number', 'currency_units',
     '5', '5', '0', '10000', NULL,
     'next_request', 300, false, true, 20,
     '{"source":"server/workspace/finance/ap/matching.service.ts"}'),

    ('finance.ap.default_procurement_line_type', 'finance.ap',
     'Default procurement line type',
     'Default Procurement Type applied when a user adds a new procurement line to a purchase invoice.',
     'tenant_configurable', 'configurable', 'enum', NULL,
     '"goods"', '"goods"', NULL, NULL,
     '["goods","services","mixed","freight","misc"]',
     'immediate', 300, false, true, 40,
     '{"source":"packages/shared/runtime/document-runtime/src/items/ProcureLineComposerSheet.tsx","lookup_domain":"document.procurement_type","fallback_constant":"goods"}'),

    ('finance.ap.default_procurement_line_uom', 'finance.ap',
     'Default procurement line UoM',
     'Default unit of measure applied when a user adds a standalone procurement line without a source document or item.',
     'tenant_configurable', 'configurable', 'string', NULL,
     '"EA"', '"EA"', NULL, NULL, NULL,
     'immediate', 300, false, true, 45,
     '{"source":"packages/shared/runtime/document-runtime/src/items/ProcureLineComposerSheet.tsx","fallback_constant":"EA","meaning":"Each"}'),

    ('finance.ap.tolerance_percent',     'finance.ap',
     'AP matching percentage tolerance',
     'Maximum percentage difference allowed when matching invoice value to GR/PO value.',
     'tenant_configurable', 'configurable', 'number', 'percent',
     '2', '2', '0', '20', NULL,
     'next_request', 300, false, true, 30,
     '{"source":"server/workspace/finance/ap/matching.service.ts"}'),

    -- ── Finance: AR ───────────────────────────────────────────────────────────
    ('finance.ar.credit_days',           'finance.ar',
     'Standard AR credit days',
     'Default credit period (days) given to customers on AR invoices.',
     'tenant_configurable', 'configurable', 'integer', 'days',
     '30', '30', '0', '365', NULL,
     'next_request', 300, false, true, 10,
     '{"source":"server/workspace/finance/ar/ar.service.ts"}'),

    ('finance.ar.late_payment_grace_days', 'finance.ar',
     'Late payment grace period (days)',
     'Days after invoice due date before a receivable is classified as overdue in aging reports.',
     'tenant_configurable', 'configurable', 'integer', 'days',
     '0', '0', '0', '30', NULL,
     'next_request', 300, false, true, 20,
     '{"source":"packages/domain/finance/finance-workbench/src/reports/ArAging"}'),

    -- ── Finance: GL ───────────────────────────────────────────────────────────
    ('finance.gl.period_close_lock_days', 'finance.gl',
     'Period close lock buffer (days)',
     'How many days after a period ends before it is automatically locked to new postings.',
     'tenant_configurable', 'configurable', 'integer', 'days',
     '5', '5', '0', '30', NULL,
     'next_request', 300, false, true, 10,
     '{"source":"server/db/sql/master/06_triggers.sql"}'),

    -- ── Finance: Reporting ────────────────────────────────────────────────────
    ('finance.reporting.default_report', 'finance.reporting',
     'Default financial report view',
     'Which report tab opens by default when a user lands on the Finance > Reports page.',
     'tenant_configurable', 'configurable', 'enum', NULL,
     '"profit-loss"', '"profit-loss"', NULL, NULL,
     '["profit-loss","balance-sheet","trial-balance","cash-flow","ap-aging","ar-aging"]',
     'next_request', 300, false, true, 10,
     '{"source":"packages/domain/finance/finance-workbench/src/lib/reportRegistry.ts:107","fallback_constant":"DEFAULT_REPORT"}'),

    -- ── Workbench: Supply Chain ───────────────────────────────────────────────
    ('workbench.supply_chain.commodity_category_tree_batch_size', 'workbench.supply_chain',
     'Commodity category tree batch size',
     'Maximum number of commodity-category hierarchy rows loaded per tree request in the supply-chain workbench Explorer.',
     'tenant_configurable', 'configurable', 'integer', 'rows',
     '500', '500', '50', '1000', NULL,
     'immediate', 300, false, true, 10,
     '{"source":"packages/domain/finance/finance-workbench/src/hooks/useTaxonomyWorkbenches.ts","scope":"hierarchy_tree_only","fallback_constant":"DEFAULT_COMMODITY_CATEGORY_TREE_BATCH_SIZE","legacy_code":"workbench.supply_chain.spend_category_tree_batch_size"}'),

    -- ── Finance: Numbering ────────────────────────────────────────────────────
    ('finance.numbering.je_prefix',      'finance.numbering',
     'Journal entry number prefix',
     'Prefix prepended to auto-generated journal entry document numbers.',
     'tenant_configurable', 'configurable', 'string', NULL,
     '"JE"', '"JE"', NULL, NULL, NULL,
     'next_request', 300, false, true, 10,
     '{"source":"server/db/seed/entity_numbering_config seed"}'),

    ('finance.numbering.ap_invoice_prefix', 'finance.numbering',
     'AP invoice number prefix',
     'Prefix prepended to auto-generated AP invoice document numbers.',
     'tenant_configurable', 'configurable', 'string', NULL,
     '"API"', '"API"', NULL, NULL, NULL,
     'next_request', 300, false, true, 20,
     '{"source":"server/db/seed/entity_numbering_config seed"}'),

    ('finance.numbering.ar_invoice_prefix', 'finance.numbering',
     'AR invoice number prefix',
     'Prefix prepended to auto-generated AR invoice document numbers.',
     'tenant_configurable', 'configurable', 'string', NULL,
     '"ARI"', '"ARI"', NULL, NULL, NULL,
     'next_request', 300, false, true, 30,
     '{"source":"server/db/seed/entity_numbering_config seed"}'),

    -- ── Collaboration: Attachments ────────────────────────────────────────────
    ('collab.attachments.max_file_bytes', 'collab.attachments',
     'Maximum attachment file size',
     'Largest single file that can be uploaded to a comment or document attachment.',
     'tenant_configurable', 'configurable', 'integer', 'bytes',
     '104857600', '104857600', '1048576', '524288000', NULL,
     'next_request', 300, false, true, 10,
     '{"source":"apps/web/app/api/collab/attachments/route.ts:17","fallback_constant":"MAX_BYTES"}'),

    ('collab.attachments.max_files_per_batch', 'collab.attachments',
     'Maximum files per upload batch',
     'Number of files that can be attached in a single upload action.',
     'tenant_configurable', 'configurable', 'integer', 'files',
     '10', '10', '1', '50', NULL,
     'next_request', 300, false, true, 20,
     '{"source":"packages/shared/runtime/collaboration-ui/src/hooks/attachments.ts:46","fallback_constant":"MAX_FILES"}'),

    -- ── Notifications ─────────────────────────────────────────────────────────
    ('notifications.dedup_window_ms',    'notifications',
     'Notification deduplication window',
     'Time window within which identical notifications are suppressed to prevent alert storms.',
     'tenant_configurable', 'configurable', 'integer', 'milliseconds',
     '300000', '300000', '0', '3600000', NULL,
     'next_request', 300, false, true, 10,
     '{"source":"server/framework/runtime/services/jobs/workers/notification.worker.ts:105","fallback_constant":"DEFAULT_DEDUP_WINDOW_MS"}'),

    ('notifications.webhook.rate_limit_rpm', 'notifications.webhook',
     'Inbound webhook rate limit (RPM)',
     'Maximum inbound webhook events accepted per minute per integration endpoint.',
     'tenant_configurable', 'configurable', 'integer', 'requests_per_minute',
     '120', '120', '10', '1200', NULL,
     'next_request', 300, false, true, 10,
     '{"source":"server/framework/runtime/services/integration/routes/webhook-receiver.route.ts:54","fallback_constant":"RATE_LIMIT_RPM"}'),

    -- ── API Defaults ──────────────────────────────────────────────────────────
    ('api.pagination.default_page_size', 'api.pagination',
     'Default list page size',
     'Number of records returned per page on entity list views when no page_size is specified.',
     'tenant_configurable', 'configurable', 'integer', 'rows',
     '20', '20', '10', '200', NULL,
     'next_request', 300, false, true, 10,
     '{"source":"server/framework/runtime/services/records/routes/records.route.ts:363"}'),

    ('api.pagination.max_page_size',     'api.pagination',
     'Maximum list page size',
     'Hard upper bound on page_size query parameter across all entity list views. Values above 500 must use page navigation.',
     'system_controlled', 'readonly', 'integer', 'rows',
     '500', '500', '20', '500', NULL,
     'next_request', 300, false, true, 20,
     '{"source":"server/framework/runtime/services/records/routes/records.route.ts:363"}'),

    ('api.pagination.load_more_increment', 'api.pagination',
     'Load more increment',
     'Number of additional records requested when the entity list Load More control is used.',
     'tenant_configurable', 'configurable', 'integer', 'rows',
     '50', '50', '1', '500', NULL,
     'next_request', 300, false, true, 25,
     '{"source":"packages/shared/runtime/entity-runtime/src/list/EntityListPage.tsx","fallback_constant":"DEFAULT_LOAD_MORE_SIZE"}'),

    ('api.pagination.picker_tree_min_page_size', 'api.pagination',
     'Picker tree minimum page size',
     'Minimum page-size ceiling allowed when an advanced entity picker requests tree mode.',
     'system_controlled', 'readonly', 'integer', 'rows',
     '500', '500', '500', '1000', NULL,
     'next_request', 300, false, true, 30,
     '{"source":"packages/shared/runtime/runtime-shared/src/entity-search/EntityPicker.tsx","query_param":"picker_tree"}'),

    ('api.export.records_max_rows',      'api.export',
     'Maximum export rows (records)',
     'Row limit enforced on CSV/XLSX entity record exports.',
     'tenant_configurable', 'configurable', 'integer', 'rows',
     '10000', '10000', '1000', '500000', NULL,
     'next_request', 300, false, true, 10,
     '{"source":"server/framework/runtime/services/records/routes/export.route.ts:52","fallback_constant":"EXPORT_MAX_ROWS"}'),

    ('api.export.audit_max_rows',        'api.export',
     'Maximum export rows (audit log)',
     'Row limit enforced on audit event exports. Compliance tenants may require higher limits.',
     'tenant_configurable', 'configurable', 'integer', 'rows',
     '50000', '50000', '1000', '1000000', NULL,
     'next_request', 300, false, true, 20,
     '{"source":"server/framework/runtime/services/audit/routes/audit.route.ts:121","fallback_constant":"EXPORT_MAX_ROWS"}'),

    ('api.audit.default_window_days',    'api.audit',
     'Default audit query window (days)',
     'Default date range applied to audit event queries when no from/to is specified.',
     'tenant_configurable', 'configurable', 'integer', 'days',
     '7', '7', '1', '90', NULL,
     'next_request', 300, false, true, 10,
     '{"source":"server/framework/runtime/services/audit/routes/audit.route.ts:48","fallback_constant":"DEFAULT_WINDOW_DAYS"}'),

    ('api.audit.max_window_days',        'api.audit',
     'Maximum audit query window (days)',
     'Hard upper bound on audit query date ranges. Increase for compliance/legal hold tenants.',
     'tenant_configurable', 'configurable', 'integer', 'days',
     '90', '90', '30', '2557', NULL,
     'next_request', 300, false, true, 20,
     '{"source":"server/framework/runtime/services/audit/routes/audit.route.ts:49","fallback_constant":"MAX_WINDOW_DAYS"}'),

    -- ── Governance ────────────────────────────────────────────────────────────
    ('governance.cert.expiring_soon_days', 'governance.cert',
     'Certificate expiry warning threshold (days)',
     'Number of days before certification expiry that the "expiring soon" badge appears.',
     'tenant_configurable', 'configurable', 'integer', 'days',
     '90', '90', '7', '365', NULL,
     'next_request', 300, false, true, 10,
     '{"source":"packages/shared/runtime/entity-runtime/src/detail/ChildSummaryCardsPanel.tsx:388","fallback_constant":"CERT_EXPIRING_SOON_DAYS"}'),

    -- ── Jobs: SLA & Edit Locks ────────────────────────────────────────────────
    ('jobs.sla.stuck_threshold_hours',   'jobs.sla',
     'Workflow stuck-item threshold (hours)',
     'A workflow item is flagged as stuck if it has not progressed within this many hours.',
     'tenant_configurable', 'configurable', 'integer', 'hours',
     '24', '24', '1', '168', NULL,
     'next_request', 300, false, true, 10,
     '{"source":"server/framework/runtime/services/jobs/workers/sla-check.worker.ts:431","fallback_constant":"STUCK_THRESHOLD_HOURS"}'),

    ('jobs.editlock.default_ttl_seconds', 'jobs.editlock',
     'Collaborative edit-lock TTL (seconds)',
     'How long an edit lock held by a user persists before expiring if no heartbeat is received.',
     'tenant_configurable', 'configurable', 'integer', 'seconds',
     '300', '300', '60', '1800', NULL,
     'next_request', 300, false, true, 10,
     '{"source":"server/framework/runtime/services/shared/edit-lock.service.ts:25","fallback_constant":"DEFAULT_LOCK_TTL_SECONDS"}'),

    -- ── UX ────────────────────────────────────────────────────────────────────
    ('ux.recents.max_nav_items',         'ux.recents',
     'Recent navigation items limit',
     'Maximum number of recently visited pages kept in the sidebar navigation history.',
     'tenant_configurable', 'configurable', 'integer', 'items',
     '20', '20', '5', '100', NULL,
     'next_request', 300, false, true, 10,
     '{"source":"apps/web/lib/recent-items.ts:40","fallback_constant":"MAX_ITEMS"}'),

    ('ux.recents.max_record_items',      'ux.recents',
     'Recently viewed records limit',
     'Maximum number of recently opened entity records shown in the entity list "Recent" panel.',
     'tenant_configurable', 'configurable', 'integer', 'items',
     '12', '12', '5', '50', NULL,
     'next_request', 300, false, true, 20,
     '{"source":"apps/web/lib/recently-viewed.ts:19","fallback_constant":"MAX"}')

) AS v(
    code, namespace, display_name, description,
    control_level, tenant_visibility, data_type, unit,
    default_value, product_value, min_value, max_value, allowed_values,
    runtime_reload, cache_ttl_seconds, is_security_sensitive, is_runtime_reloadable,
    sort_order, metadata
)

UNION ALL

-- ── Jobs workers / CMS / API tuning / Governance internals (system_controlled / readonly) ─
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
    NULL::jsonb,
    'restart',
    300,
    false,
    false,
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
    code, namespace, display_name, description,
    data_type, unit, default_value, product_value, min_value, max_value,
    sort_order, metadata
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
    allowed_values        = EXCLUDED.allowed_values,
    runtime_reload        = EXCLUDED.runtime_reload,
    cache_ttl_seconds     = EXCLUDED.cache_ttl_seconds,
    is_security_sensitive = EXCLUDED.is_security_sensitive,
    is_runtime_reloadable = EXCLUDED.is_runtime_reloadable,
    sort_order            = EXCLUDED.sort_order,
    metadata              = EXCLUDED.metadata,
    status                = 'active',
    updated_at            = now(),
    updated_by            = EXCLUDED.created_by;


-- ============================================================
-- SOURCE: server/db/seed/010_platform/005_domain_registrations/200_document/006_document_patches.sql
-- TABLE SPLIT: 029b_purchase_invoice_preflight.sql parameter seed
-- ============================================================

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
  VALUES (
      'document.intake.preflight.ocr_enabled',
      'document.intake.preflight',
      'Pre-flight OCR auto-detect',
      'Enables the PDF drop-zone classifier on metadata-driven intake pre-flight choosers.',
      'product',
      'tenant_configurable',
      'configurable',
      'boolean',
      NULL,
      'false'::jsonb,
      'false'::jsonb,
      NULL,
      NULL,
      NULL,
      'immediate',
      300,
      false,
      true,
      10,
      '{"surface":"document-runtime.flow-preflight"}'::jsonb,
      '00000000-0000-0000-0000-000000000000'::uuid
  )
  ON CONFLICT (code) DO UPDATE SET
      namespace = EXCLUDED.namespace,
      display_name = EXCLUDED.display_name,
      description = EXCLUDED.description,
      control_level = EXCLUDED.control_level,
      tenant_visibility = EXCLUDED.tenant_visibility,
      data_type = EXCLUDED.data_type,
      default_value = EXCLUDED.default_value,
      product_value = EXCLUDED.product_value,
      runtime_reload = EXCLUDED.runtime_reload,
      cache_ttl_seconds = EXCLUDED.cache_ttl_seconds,
      is_security_sensitive = EXCLUDED.is_security_sensitive,
      is_runtime_reloadable = EXCLUDED.is_runtime_reloadable,
      sort_order = EXCLUDED.sort_order,
      metadata = EXCLUDED.metadata,
      status = 'active',
      updated_at = now(),
      updated_by = EXCLUDED.created_by;
