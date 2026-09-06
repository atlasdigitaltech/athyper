-- seed-contract-version: 1
-- seed-pack: common.audit.event-contracts
-- seed-pack-version: 1.9.0
-- seed-dataset: master.audit-event-contract
-- seed-data-class: production_reference
-- seed-provenance: {"source":"internal-audit-contract","publisher":"Athyper","source_version":"1","retrieved_at":"2026-08-13","license":"internal"}
-- seed-plane: common
-- seed-tenant-scope: none
-- seed-natural-key: master.audit_event_contract(code)
-- seed-cross-file-ids: false
-- seed-id-strategy: natural-key-only
-- seed-expected-row-count: exact:26
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false

DO $seed_plane_guard$
BEGIN
    IF current_setting('app.database_plane', true) NOT IN ('studio', 'neon', 'mesh') THEN
        RAISE EXCEPTION '[common.audit.event-contracts] app.database_plane is missing or invalid';
    END IF;
END $seed_plane_guard$;

INSERT INTO master.audit_event_contract (
    code, event_code_pattern, priority, allowed_operations, default_severity,
    allowed_actor_types, allowed_scope, reason_required, capture_mode,
    max_payload_bytes, schema_version, metadata, status
)
VALUES
    -- ─── PCI / PII (1–3) ──────────────────────────────────────────────────────
    (
        'pci_event',
        '^pci\.[a-z][a-z0-9_]*$',
        1,
        ARRAY['create','update','delete','execute','import','export']::audit.operation_d[],
        'critical',
        ARRAY['user','service_account','integration','system']::audit.actor_type_d[],
        'tenant', true, 'metadata', 16384, 1,
        '{"event_category":"pci","owner":"compliance","purpose":"pci_dss_evidence","sensitive":true}'::jsonb,
        'active'
    ),
    (
        'pii_access_event',
        '^pii\.(accessed|bulk_accessed)$',
        2,
        ARRAY['execute','export']::audit.operation_d[],
        'warning',
        ARRAY['user','service_account','support','system']::audit.actor_type_d[],
        'tenant', true, 'metadata', 16384, 1,
        '{"event_category":"pii","owner":"compliance","purpose":"pii_access_evidence","sensitive":true}'::jsonb,
        'active'
    ),
    (
        'pii_modification_event',
        '^pii\.modified$',
        3,
        ARRAY['create','update','delete']::audit.operation_d[],
        'warning',
        ARRAY['user','service_account','support','system']::audit.actor_type_d[],
        'tenant', true, 'changed_fields', 32768, 1,
        '{"event_category":"pii","owner":"compliance","purpose":"pii_modification_evidence","sensitive":true}'::jsonb,
        'active'
    ),
    -- ─── Audit self-integrity (4) ──────────────────────────────────────────────
    (
        'audit_system_event',
        '^audit\.[a-z][a-z0-9_]*$',
        4,
        ARRAY['create','update','delete','execute','export']::audit.operation_d[],
        'warning',
        ARRAY['user','service_account','support','system']::audit.actor_type_d[],
        'either', true, 'metadata', 16384, 1,
        '{"event_category":"security","owner":"audit","purpose":"audit_integrity_evidence","sensitive":true}'::jsonb,
        'active'
    ),
    -- ─── IAM — specific before catch-all (5–9) ────────────────────────────────
    (
        'iam_authentication_event',
        '^iam\.(authentication\.(succeeded|failed|denied)|login([._][a-z][a-z0-9_]*)?|logout([._][a-z][a-z0-9_]*)?|mfa([._][a-z][a-z0-9_]*)?)$',
        5,
        ARRAY['login','logout','execute']::audit.operation_d[],
        'warning',
        ARRAY['user','service_account','support','system']::audit.actor_type_d[],
        'either', false, 'metadata', 16384, 2,
        '{"event_category":"security","owner":"iam","purpose":"authentication_evidence"}'::jsonb,
        'active'
    ),
    (
        'iam_session_event',
        '^iam\.session([._][a-z][a-z0-9_]*)?$',
        6,
        ARRAY['execute','delete']::audit.operation_d[],
        'warning',
        ARRAY['user','service_account','support','system']::audit.actor_type_d[],
        'either', true, 'metadata', 16384, 2,
        '{"event_category":"security","owner":"iam","purpose":"session_lifecycle_evidence"}'::jsonb,
        'active'
    ),
    (
        'iam_authorization_event',
        '^iam\.(authorization|role|permission|delegation)([._][a-z][a-z0-9_]*)?$',
        7,
        ARRAY['create','update','delete','execute','grant','revoke']::audit.operation_d[],
        'warning',
        ARRAY['user','service_account','support','system']::audit.actor_type_d[],
        'either', true, 'safe_values', 65536, 2,
        '{"event_category":"security","owner":"iam","purpose":"authorization_change_evidence"}'::jsonb,
        'active'
    ),
    (
        'iam_provisioning_event',
        '^iam\.provisioning\.[a-z][a-z0-9_]*$',
        8,
        ARRAY['create','update','execute']::audit.operation_d[],
        'warning',
        ARRAY['user','service_account','support','system']::audit.actor_type_d[],
        'tenant', false, 'metadata', 16384, 2,
        '{"event_category":"security","owner":"iam","purpose":"identity_provisioning_evidence"}'::jsonb,
        'active'
    ),
    (
        'iam_general_event',
        '^iam\.[a-z][a-z0-9_]*([._][a-z][a-z0-9_]*)?$',
        9,
        ARRAY['create','update','delete','execute','grant','revoke','login','logout']::audit.operation_d[],
        'warning',
        ARRAY['user','service_account','support','system']::audit.actor_type_d[],
        'either', false, 'metadata', 16384, 2,
        '{"event_category":"security","owner":"iam","purpose":"iam_general_evidence"}'::jsonb,
        'active'
    ),
    -- ─── Entity / record events — specific before catch-all (10–25) ───────────
    (
        'entity_row_change_event',
        '^record\.row_(created|updated|deleted)$',
        10,
        ARRAY['create','update','delete']::audit.operation_d[],
        'info',
        ARRAY['user','service_account','bot','integration','support','system']::audit.actor_type_d[],
        'tenant', false, 'changed_fields', 16384, 1,
        '{"event_category":"data_modification","owner":"database","purpose":"baseline_row_evidence"}'::jsonb,
        'active'
    ),
    (
        'entity_access_event',
        '^record\.(viewed|downloaded|accessed|previewed)$',
        15,
        ARRAY['execute','export']::audit.operation_d[],
        'info',
        ARRAY['user','service_account','support','system']::audit.actor_type_d[],
        'tenant', false, 'metadata', 16384, 1,
        '{"event_category":"data_access","owner":"application","purpose":"access_evidence"}'::jsonb,
        'active'
    ),
    (
        'business_partner_request_event',
        '(^business_partner\.(request\.(created|updated|validated|submitted|returned|rejected|approved|applying|applied|failed|cancelled|superseded)|workflow\.(stage\.activated|vote\.recorded)|qualification\.(created|approved|conditional|rejected|suspended)|preference\.(created|approved|rejected|revoked)|customer\.(credit\.(created|approved|conditional|rejected)|designation\.(created|approved|rejected|revoked)|activated|suspended|reactivated|deactivated|archived)|profile_publication\.(published|withdrawn)|bank_disclosure\.(approved|rejected|revoked)|bank_verification\.(requested|verified|rejected|applied))$)|(^business_partner_invitation\.(supplier|customer)\.(created|resent|accepted|cancelled)$)',
        21,
        ARRAY['create','update','execute','approve','reject','revoke']::audit.operation_d[],
        'warning',
        ARRAY['user','service_account','bot','integration','support','system']::audit.actor_type_d[],
        'tenant', false, 'safe_values', 65536, 9,
        '{"event_category":"business_critical","owner":"master-data","purpose":"business_partner_onboarding_workflow_qualification_profile_and_bank_disclosure_evidence"}'::jsonb,
        'active'
    ),
    (
        'business_partner_case_event',
        '^business_partner\.case\.(created|updated|validated|submitted|returned|rejected|approved|applying|applied|materialized|failed|cancelled|superseded)$',
        20,
        ARRAY['create','update','execute','approve','reject','revoke']::audit.operation_d[],
        'warning',
        ARRAY['user','service_account','bot','integration','support','system']::audit.actor_type_d[],
        'tenant', false, 'safe_values', 65536, 2,
        '{"event_category":"business_critical","owner":"master-data","purpose":"business_partner_governed_case_evidence"}'::jsonb,
        'active'
    ),
    (
        'finance_period_event',
        '^period\.[a-z][a-z0-9_]*$',
        22,
        ARRAY['create','update','execute','approve','reject']::audit.operation_d[],
        'warning',
        ARRAY['user','service_account','support','system']::audit.actor_type_d[],
        'tenant', true, 'safe_values', 65536, 1,
        '{"event_category":"business_critical","owner":"finance","purpose":"period_control_evidence"}'::jsonb,
        'active'
    ),
    (
        'entity_business_event',
        '^record\.[a-z][a-z0-9_]*$',
        25,
        ARRAY['create','update','delete','restore','execute','approve','reject','import','export']::audit.operation_d[],
        'info',
        ARRAY['user','service_account','bot','integration','support','system']::audit.actor_type_d[],
        'tenant', false, 'safe_values', 65536, 1,
        '{"event_category":"generic_action","owner":"application","purpose":"entity_business_evidence"}'::jsonb,
        'active'
    ),
    -- ─── Workflow inbox (26) ───────────────────────────────────────────────────
    (
        'inbox_routing_event',
        '^inbox\.[a-z][a-z0-9_]*$',
        26,
        ARRAY['create','update','execute','approve','reject']::audit.operation_d[],
        'info',
        ARRAY['user','service_account','bot','system']::audit.actor_type_d[],
        'tenant', false, 'safe_values', 65536, 1,
        '{"event_category":"generic_action","owner":"workflow","purpose":"inbox_routing_evidence"}'::jsonb,
        'active'
    ),
    -- ─── Shared record transfers (27) ────────────────────────────────────────
    (
        'records_transfer_event',
        '^records\.(import|export)\.[a-z][a-z0-9_]*$',
        27,
        ARRAY['import','export']::audit.operation_d[],
        'info',
        ARRAY['user','service_account','bot','system']::audit.actor_type_d[],
        'tenant', false, 'metadata', 32768, 1,
        '{"event_category":"integration","owner":"records","purpose":"record_transfer_evidence"}'::jsonb,
        'active'
    ),
    -- ─── Integration + import pipeline (28–29) ────────────────────────────────
    (
        'integration_event',
        '^integration\.[a-z][a-z0-9_]*$',
        28,
        ARRAY['create','update','delete','execute','import','export']::audit.operation_d[],
        'info',
        ARRAY['service_account','bot','integration','system']::audit.actor_type_d[],
        'tenant', false, 'metadata', 32768, 1,
        '{"event_category":"integration","owner":"integration","purpose":"integration_activity_evidence"}'::jsonb,
        'active'
    ),
    (
        'data_import_event',
        '^import\.[a-z][a-z0-9_]*$',
        29,
        ARRAY['create','execute','import','reject']::audit.operation_d[],
        'info',
        ARRAY['user','service_account','bot','system']::audit.actor_type_d[],
        'tenant', false, 'metadata', 32768, 1,
        '{"event_category":"integration","owner":"jobs","purpose":"import_pipeline_evidence"}'::jsonb,
        'active'
    ),
    -- ─── AI events — support-specific before general catch-all (30–31) ─────────
    (
        'ai_support_event',
        '^ai\.support[_a-z0-9]*$',
        30,
        ARRAY['execute','export']::audit.operation_d[],
        'warning',
        ARRAY['support']::audit.actor_type_d[],
        'tenant', true, 'metadata', 16384, 1,
        '{"event_category":"security","owner":"ai","purpose":"support_ai_access_evidence","sensitive":true}'::jsonb,
        'active'
    ),
    (
        'ai_event',
        '^ai\.[a-z][a-z0-9_]*$',
        31,
        ARRAY['create','update','delete','execute']::audit.operation_d[],
        'warning',
        ARRAY['user','service_account','system']::audit.actor_type_d[],
        'tenant', false, 'metadata', 16384, 1,
        '{"event_category":"generic_action","owner":"ai","sensitive":true}'::jsonb,
        'active'
    ),
    -- ─── Schema authoring (35) ────────────────────────────────────────────────
    (
        'schema_authoring_event',
        '^schema\.[a-z][a-z0-9_]*$',
        35,
        ARRAY['create','update','delete','execute','approve','reject']::audit.operation_d[],
        'info',
        ARRAY['user','service_account','bot','support','system']::audit.actor_type_d[],
        'either', false, 'safe_values', 65536, 1,
        '{"event_category":"configuration","owner":"meta-entity-authoring","purpose":"schema_change_evidence"}'::jsonb,
        'active'
    ),
    -- ─── Notification dispatch (38) ───────────────────────────────────────────
    (
        'notification_event',
        '^notification\.[a-z][a-z0-9_]*$',
        38,
        ARRAY['execute']::audit.operation_d[],
        'info',
        ARRAY['service_account','bot','system']::audit.actor_type_d[],
        'tenant', false, 'metadata', 16384, 1,
        '{"event_category":"generic_action","owner":"notifications","purpose":"notification_dispatch_evidence"}'::jsonb,
        'active'
    ),
    -- ─── Configuration changes (48) ───────────────────────────────────────────
    (
        'config_change_event',
        '^config\.[a-z][a-z0-9_]*$',
        48,
        ARRAY['create','update','delete']::audit.operation_d[],
        'warning',
        ARRAY['user','service_account','support','system']::audit.actor_type_d[],
        'either', true, 'safe_values', 65536, 1,
        '{"event_category":"configuration","owner":"platform","purpose":"configuration_change_evidence"}'::jsonb,
        'active'
    ),
    -- ─── Platform / system infra (50) ─────────────────────────────────────────
    (
        'platform_system_event',
        '^(system|platform)\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$',
        50,
        ARRAY['create','update','delete','restore','execute','import','export']::audit.operation_d[],
        'info',
        ARRAY['service_account','bot','system']::audit.actor_type_d[],
        'either', false, 'metadata', 32768, 1,
        '{"event_category":"generic_action","owner":"platform"}'::jsonb,
        'active'
    ),
    -- ─── Generic action catch-all (55) ────────────────────────────────────────
    (
        'generic_action_event',
        '^action\.[a-z][a-z0-9_]*$',
        55,
        ARRAY['execute','import','export']::audit.operation_d[],
        'info',
        ARRAY['user','service_account','bot','integration','support','system']::audit.actor_type_d[],
        'tenant', false, 'metadata', 16384, 1,
        '{"event_category":"generic_action","owner":"application","purpose":"generic_action_evidence"}'::jsonb,
        'active'
    )
ON CONFLICT(code) DO UPDATE SET
    event_code_pattern  = EXCLUDED.event_code_pattern,
    priority            = EXCLUDED.priority,
    allowed_operations  = EXCLUDED.allowed_operations,
    default_severity    = EXCLUDED.default_severity,
    allowed_actor_types = EXCLUDED.allowed_actor_types,
    allowed_scope       = EXCLUDED.allowed_scope,
    reason_required     = EXCLUDED.reason_required,
    capture_mode        = EXCLUDED.capture_mode,
    max_payload_bytes   = EXCLUDED.max_payload_bytes,
    schema_version      = EXCLUDED.schema_version,
    metadata            = EXCLUDED.metadata,
    status              = EXCLUDED.status
WHERE (
    master.audit_event_contract.event_code_pattern,
    master.audit_event_contract.priority,
    master.audit_event_contract.allowed_operations,
    master.audit_event_contract.default_severity,
    master.audit_event_contract.allowed_actor_types,
    master.audit_event_contract.allowed_scope,
    master.audit_event_contract.reason_required,
    master.audit_event_contract.capture_mode,
    master.audit_event_contract.max_payload_bytes,
    master.audit_event_contract.schema_version,
    master.audit_event_contract.metadata,
    master.audit_event_contract.status
) IS DISTINCT FROM (
    EXCLUDED.event_code_pattern, EXCLUDED.priority, EXCLUDED.allowed_operations,
    EXCLUDED.default_severity, EXCLUDED.allowed_actor_types, EXCLUDED.allowed_scope,
    EXCLUDED.reason_required, EXCLUDED.capture_mode, EXCLUDED.max_payload_bytes,
    EXCLUDED.schema_version, EXCLUDED.metadata, EXCLUDED.status
);

SELECT audit.ensure_monthly_partitions(date_trunc('month',CURRENT_DATE)::date,4);

DO $seed_assertions$
DECLARE
    v_codes text[] := ARRAY[
      'pci_event','pii_access_event','pii_modification_event','audit_system_event',
      'iam_authentication_event','iam_session_event','iam_authorization_event',
      'iam_provisioning_event','iam_general_event','entity_row_change_event',
      'entity_access_event','business_partner_case_event','business_partner_request_event','finance_period_event','entity_business_event',
      'inbox_routing_event','records_transfer_event','integration_event','data_import_event','ai_support_event',
      'ai_event','schema_authoring_event','notification_event','config_change_event',
      'platform_system_event','generic_action_event'
    ];
BEGIN
    -- seed-assertion: expected-count
    IF (SELECT count(*) FROM master.audit_event_contract WHERE code = ANY(v_codes)) <> 26 THEN
        RAISE EXCEPTION '[common.audit.event-contracts] expected 26 rows';
    END IF;
    -- seed-assertion: orphan
    IF EXISTS (SELECT 1 FROM master.audit_event_contract WHERE code = ANY(v_codes) AND allowed_operations IS NULL) THEN
        RAISE EXCEPTION '[common.audit.event-contracts] orphan operation contract';
    END IF;
    -- seed-assertion: uniqueness
    IF EXISTS (SELECT code FROM master.audit_event_contract WHERE code = ANY(v_codes) GROUP BY code HAVING count(*) <> 1) THEN
        RAISE EXCEPTION '[common.audit.event-contracts] duplicate code';
    END IF;
    -- seed-assertion: semantic
    IF EXISTS (SELECT 1 FROM master.audit_event_contract WHERE code = ANY(v_codes) AND status <> 'active') THEN
        RAISE EXCEPTION '[common.audit.event-contracts] inactive contract';
    END IF;
END $seed_assertions$;
