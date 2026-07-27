-- ============================================================================
-- control/01zzo_authorization_migration_controls.sql
-- Wave 0 authorization migration control plane.
--
-- These objects are additive and do not participate in authorization
-- evaluation. They define the legacy source inventory, approved writer
-- inventory, anomaly dispositions, and durable migration-run contract used by
-- the authorization change-capture stream in event/*.
-- ============================================================================

CREATE TABLE IF NOT EXISTS control.authorization_capture_source (
    source_schema           text        NOT NULL,
    source_table            text        NOT NULL,
    source_kind             text        NOT NULL,
    owner_team              text        NOT NULL DEFAULT 'identity-access',
    primary_key_columns     text[]      NOT NULL DEFAULT ARRAY['id']::text[],
    tenant_column           text,
    redacted_columns        text[]      NOT NULL DEFAULT '{}'::text[],
    capture_enabled         boolean     NOT NULL DEFAULT true,
    retention_days          integer     NOT NULL DEFAULT 180,
    notes                   text,
    registered_at           timestamptz NOT NULL DEFAULT now(),
    registered_by           text        NOT NULL DEFAULT session_user,
    updated_at              timestamptz,
    updated_by              text,

    CONSTRAINT authorization_capture_source_pkey
        PRIMARY KEY (source_schema, source_table),
    CONSTRAINT authorization_capture_source_schema_chk
        CHECK (source_schema ~ '^[a-z][a-z0-9_]*$'),
    CONSTRAINT authorization_capture_source_table_chk
        CHECK (source_table ~ '^[a-z][a-z0-9_]*$'),
    CONSTRAINT authorization_capture_source_kind_chk
        CHECK (source_kind IN (
            'catalog', 'identity', 'entitlement', 'authority', 'scope', 'metadata'
        )),
    CONSTRAINT authorization_capture_source_pk_chk
        CHECK (
            cardinality(primary_key_columns) > 0
            AND array_position(primary_key_columns, '') IS NULL
        ),
    CONSTRAINT authorization_capture_source_tenant_column_chk
        CHECK (tenant_column IS NULL OR tenant_column ~ '^[a-z][a-z0-9_]*$'),
    CONSTRAINT authorization_capture_source_redaction_chk
        CHECK (array_position(redacted_columns, '') IS NULL),
    CONSTRAINT authorization_capture_source_retention_chk
        CHECK (retention_days >= 30),
    CONSTRAINT authorization_capture_source_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.authorization_capture_source IS
    'Wave 0 exhaustive legacy authorization-input registry. One row identifies '
    'one source relation, its stable key, tenant discriminator, privacy '
    'redactions, owner, and capture posture. A registered enabled relation must '
    'have ENABLE ALWAYS row and TRUNCATE capture triggers.';
COMMENT ON COLUMN control.authorization_capture_source.redacted_columns IS
    'Top-level JSON keys replaced with the literal [REDACTED] before payload '
    'storage and hashing. Raw values are never written to the capture stream.';


CREATE TABLE IF NOT EXISTS control.authorization_writer_registry (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    writer_key                  text        NOT NULL,
    owner_team                  text        NOT NULL,
    db_role_pattern             text        NOT NULL,
    application_name_pattern    text        NOT NULL,
    source_schema_pattern       text        NOT NULL DEFAULT '%',
    source_table_pattern        text        NOT NULL DEFAULT '%',
    allowed_operations          text[]      NOT NULL DEFAULT ARRAY['I','U','D','T']::text[],
    write_path                  text        NOT NULL,
    priority                    smallint    NOT NULL DEFAULT 100,
    effective_from              timestamptz NOT NULL DEFAULT now(),
    effective_until             timestamptz,
    status                      text        NOT NULL DEFAULT 'draft',
    approval_ticket             text,
    approved_by                 text,
    approved_at                 timestamptz,
    notes                       text,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  text        NOT NULL DEFAULT session_user,
    updated_at                  timestamptz,
    updated_by                  text,

    CONSTRAINT authorization_writer_registry_pkey PRIMARY KEY (id),
    CONSTRAINT authorization_writer_registry_key_uq UNIQUE (writer_key),
    CONSTRAINT authorization_writer_registry_key_chk
        CHECK (writer_key ~ '^[a-z][a-z0-9_.-]{2,127}$'),
    CONSTRAINT authorization_writer_registry_patterns_chk
        CHECK (
            btrim(db_role_pattern) <> ''
            AND btrim(application_name_pattern) <> ''
            AND btrim(source_schema_pattern) <> ''
            AND btrim(source_table_pattern) <> ''
        ),
    CONSTRAINT authorization_writer_registry_operations_chk
        CHECK (
            cardinality(allowed_operations) > 0
            AND allowed_operations <@ ARRAY['I','U','D','T']::text[]
        ),
    CONSTRAINT authorization_writer_registry_path_chk
        CHECK (btrim(write_path) <> ''),
    CONSTRAINT authorization_writer_registry_priority_chk
        CHECK (priority >= 0),
    CONSTRAINT authorization_writer_registry_effective_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT authorization_writer_registry_status_chk
        CHECK (status IN ('draft', 'approved', 'suspended', 'retired')),
    CONSTRAINT authorization_writer_registry_approval_chk
        CHECK (
            (status <> 'approved')
            OR (
                approval_ticket IS NOT NULL
                AND approved_by IS NOT NULL
                AND approved_at IS NOT NULL
            )
        ),
    CONSTRAINT authorization_writer_registry_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.authorization_writer_registry IS
    'Approved legacy authorization writers. Matching is deliberately based on '
    'bounded DB-role/application/source/operation attributes rather than actor '
    'IDs. Captured writes with no active approved match are unknown writers and '
    'block Wave 0 exit.';


CREATE TABLE IF NOT EXISTS control.authorization_anomaly_disposition (
    finding_fingerprint         text        NOT NULL,
    finding_kind                text        NOT NULL,
    severity                    text        NOT NULL,
    source_schema               text        NOT NULL,
    source_table                text        NOT NULL,
    source_primary_key          jsonb,
    observed_tenant_id          uuid,
    referenced_tenant_id        uuid,
    classification              text        NOT NULL,
    owner_team                  text        NOT NULL,
    reason                      text        NOT NULL,
    remediation                 text,
    approval_ticket             text        NOT NULL,
    approved_by                 text        NOT NULL,
    approved_at                 timestamptz NOT NULL,
    resolved_at                 timestamptz,
    evidence                    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  text        NOT NULL DEFAULT session_user,

    CONSTRAINT authorization_anomaly_disposition_pkey
        PRIMARY KEY (finding_fingerprint),
    CONSTRAINT authorization_anomaly_disposition_fingerprint_chk
        CHECK (finding_fingerprint ~ '^[0-9a-f]{64}$'),
    CONSTRAINT authorization_anomaly_disposition_kind_chk
        CHECK (btrim(finding_kind) <> ''),
    CONSTRAINT authorization_anomaly_disposition_severity_chk
        CHECK (severity IN ('info', 'warning', 'high', 'critical')),
    CONSTRAINT authorization_anomaly_disposition_source_chk
        CHECK (
            source_schema ~ '^[a-z][a-z0-9_]*$'
            AND source_table ~ '^[a-z][a-z0-9_]*$'
        ),
    CONSTRAINT authorization_anomaly_disposition_pk_obj_chk
        CHECK (
            source_primary_key IS NULL
            OR jsonb_typeof(source_primary_key) = 'object'
        ),
    CONSTRAINT authorization_anomaly_disposition_class_chk
        CHECK (classification IN (
            'repair_before_backfill',
            'quarantine',
            'intentional_platform_reference',
            'false_positive'
        )),
    CONSTRAINT authorization_anomaly_disposition_reason_chk
        CHECK (btrim(reason) <> ''),
    CONSTRAINT authorization_anomaly_disposition_evidence_chk
        CHECK (jsonb_typeof(evidence) = 'object'),
    CONSTRAINT authorization_anomaly_disposition_resolution_chk
        CHECK (resolved_at IS NULL OR resolved_at >= approved_at)
);

COMMENT ON TABLE control.authorization_anomaly_disposition IS
    'Owner-approved, one-per-fingerprint classification of authorization and '
    'cross-tenant data-quality findings. Reports join by the deterministic '
    'fingerprint; unclassified findings block migration.';


CREATE TABLE IF NOT EXISTS control.authorization_migration_run (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    run_code                    text        NOT NULL,
    capture_contract_version    text        NOT NULL,
    transformation_version      text,
    source_database_id          uuid        NOT NULL,
    target_database_id          uuid,
    status                      text        NOT NULL DEFAULT 'draft',
    capture_installed_at        timestamptz,
    snapshot_started_at         timestamptz,
    snapshot_completed_at       timestamptz,
    snapshot_watermark          bigint,
    snapshot_manifest_uri       text,
    snapshot_manifest_sha256    text,
    last_applied_watermark      bigint,
    cutover_watermark           bigint,
    rollback_watermark          bigint,
    authorization_rpo_seconds   integer     NOT NULL,
    authorization_rto_minutes   integer     NOT NULL,
    business_data_rpo_seconds   integer,
    business_data_rto_minutes   integer,
    rollback_owner              text        NOT NULL,
    observation_started_at      timestamptz,
    observation_ends_at         timestamptz,
    approval_ticket             text,
    approved_by                 text,
    approved_at                 timestamptz,
    metadata                    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  text        NOT NULL DEFAULT session_user,
    updated_at                  timestamptz,
    updated_by                  text,

    CONSTRAINT authorization_migration_run_pkey PRIMARY KEY (id),
    CONSTRAINT authorization_migration_run_code_uq UNIQUE (run_code),
    CONSTRAINT authorization_migration_run_code_chk
        CHECK (run_code ~ '^[a-z0-9][a-z0-9_.-]{2,127}$'),
    CONSTRAINT authorization_migration_run_capture_version_chk
        CHECK (btrim(capture_contract_version) <> ''),
    CONSTRAINT authorization_migration_run_status_chk
        CHECK (status IN (
            'draft', 'approved', 'capturing', 'backfilling', 'replaying',
            'shadowing', 'cutover_ready', 'cutover', 'observing',
            'rolled_back', 'completed', 'aborted'
        )),
    CONSTRAINT authorization_migration_run_watermark_chk
        CHECK (
            COALESCE(snapshot_watermark, 0) >= 0
            AND COALESCE(last_applied_watermark, 0) >= 0
            AND COALESCE(cutover_watermark, 0) >= 0
            AND COALESCE(rollback_watermark, 0) >= 0
        ),
    CONSTRAINT authorization_migration_run_watermark_order_chk
        CHECK (
            snapshot_watermark IS NULL
            OR cutover_watermark IS NULL
            OR cutover_watermark >= snapshot_watermark
        ),
    CONSTRAINT authorization_migration_run_manifest_chk
        CHECK (
            (snapshot_manifest_uri IS NULL AND snapshot_manifest_sha256 IS NULL)
            OR (
                snapshot_manifest_uri IS NOT NULL
                AND snapshot_manifest_sha256 ~ '^[0-9a-f]{64}$'
            )
        ),
    CONSTRAINT authorization_migration_run_objectives_chk
        CHECK (
            authorization_rpo_seconds >= 0
            AND authorization_rto_minutes > 0
            AND (business_data_rpo_seconds IS NULL OR business_data_rpo_seconds >= 0)
            AND (business_data_rto_minutes IS NULL OR business_data_rto_minutes > 0)
        ),
    CONSTRAINT authorization_migration_run_observation_chk
        CHECK (
            observation_ends_at IS NULL
            OR (
                observation_started_at IS NOT NULL
                AND observation_ends_at > observation_started_at
            )
        ),
    CONSTRAINT authorization_migration_run_approval_chk
        CHECK (
            status = 'draft'
            OR (
                approval_ticket IS NOT NULL
                AND approved_by IS NOT NULL
                AND approved_at IS NOT NULL
            )
        ),
    CONSTRAINT authorization_migration_run_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT authorization_migration_run_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.authorization_migration_run IS
    'Durable authorization migration contract: source identity, snapshot and '
    'cutover watermarks, evidence hash, RPO/RTO, rollback owner, approvals, and '
    'observation window. It is not a replacement for business-data WAL/CDC '
    'watermarks.';


-- Exhaustive Wave 0 source inventory. The event/06g installer resolves these
-- names after every schema's table phase has completed.
INSERT INTO control.authorization_capture_source (
    source_schema,
    source_table,
    source_kind,
    primary_key_columns,
    tenant_column,
    redacted_columns,
    notes
)
VALUES
    -- Shared commercial and legacy authorization catalog.
    ('shared', 'workspace',                    'catalog',     ARRAY['id'], NULL, '{}', 'Workspace entitlement input'),
    ('shared', 'module',                       'catalog',     ARRAY['id'], NULL, '{}', 'Module entitlement input'),
    ('shared', 'enterprise_feature',           'catalog',     ARRAY['id'], NULL, '{}', 'Feature entitlement input'),
    ('shared', 'subscription_plan',            'catalog',     ARRAY['id'], NULL, ARRAY['metadata'], 'Commercial plan'),
    ('shared', 'subscription_plan_version',    'catalog',     ARRAY['id'], NULL, ARRAY['metadata'], 'Versioned commercial plan'),
    ('shared', 'plan_module_access',           'entitlement', ARRAY['id'], NULL, '{}', 'Plan/module matrix'),
    ('shared', 'plan_permission_access',       'entitlement', ARRAY['id'], NULL, '{}', 'Legacy plan/permission matrix'),
    ('shared', 'plan_feature_access',          'entitlement', ARRAY['id'], NULL, '{}', 'Plan/feature matrix'),
    ('shared', 'permission_category',          'catalog',     ARRAY['id'], NULL, '{}', 'Permission classification'),
    ('shared', 'permission',                   'authority',   ARRAY['id'], NULL, ARRAY['metadata'], 'Legacy permission catalog'),
    ('shared', 'permission_scope_policy',      'scope',       ARRAY['id'], NULL, ARRAY['metadata'], 'Permission scope policy'),
    ('shared', 'persona',                      'authority',   ARRAY['id'], NULL, ARRAY['metadata'], 'Deprecated Persona source'),
    ('shared', 'persona_permission',           'authority',   ARRAY['id'], NULL, '{}', 'Deprecated Persona permission matrix'),
    ('shared', 'role',                         'authority',   ARRAY['id'], NULL, ARRAY['metadata'], 'Legacy shared role'),

    -- Tenant, identity, plane admission, entitlements, grants, scopes, and ACLs.
    ('master', 'tenant',                       'identity',    ARRAY['id'], 'id', ARRAY['metadata'], 'Tenant status and realm input'),
    ('master', 'principal',                    'identity',    ARRAY['id'], 'tenant_id', ARRAY['name','login_email','external_ref','metadata'], 'Principal lifecycle only; PII redacted'),
    ('master', 'principal_profile',            'identity',    ARRAY['id'], 'tenant_id', ARRAY['given_name','family_name','preferred_name','display_name','avatar_url','keycloak_username','idp_snapshot','attributes','metadata'], 'Profile and legacy IdP state; PII redacted'),
    ('master', 'principal_identity_binding',   'identity',    ARRAY['id'], 'tenant_id', ARRAY['username','sync_error_message','idp_snapshot','provider_attributes','metadata'], 'Canonical IdP binding; provider payload redacted'),
    ('master', 'tenant_relationship',          'scope',       ARRAY['id'], 'source_tenant_id', ARRAY['metadata'], 'Context-only tenant relationship still read by legacy paths'),
    ('master', 'principal_relationship',       'scope',       ARRAY['id'], 'tenant_id', ARRAY['metadata'], 'Context-only principal relationship still read by legacy paths'),
    ('master', 'tenant_module_subscription',   'entitlement', ARRAY['id'], 'tenant_id', ARRAY['metadata'], 'Tenant module entitlement'),
    ('master', 'tenant_feature_entitlement',   'entitlement', ARRAY['id'], 'tenant_id', ARRAY['metadata'], 'Tenant feature entitlement'),
    ('master', 'tenant_permission_override',   'entitlement', ARRAY['id'], 'tenant_id', ARRAY['reason','metadata'], 'Deprecated permission-level entitlement override'),
    ('master', 'tenant_admin_grant',           'authority',   ARRAY['id'], 'tenant_id', ARRAY['metadata'], 'Deprecated Admin plane grant'),
    ('master', 'company_code_access',          'scope',       ARRAY['id'], 'tenant_id', ARRAY['metadata'], 'Deprecated polymorphic company ACL'),
    ('master', 'auth_group',                   'authority',   ARRAY['id'], 'tenant_id', ARRAY['description','metadata'], 'Legacy/current group'),
    ('master', 'auth_group_role',              'authority',   ARRAY['id'], 'tenant_id', ARRAY['metadata'], 'Legacy group role and scope'),
    ('master', 'auth_group_member',            'authority',   ARRAY['id'], 'tenant_id', '{}', 'Legacy/current group membership'),
    ('master', 'principal_persona',            'authority',   ARRAY['id'], 'tenant_id', '{}', 'Deprecated Persona assignment'),
    ('master', 'team',                         'scope',       ARRAY['id'], 'tenant_id', ARRAY['description','metadata'], 'Team visibility input'),
    ('master', 'team_member',                  'scope',       ARRAY['id'], 'tenant_id', '{}', 'Team visibility membership'),
    ('master', 'access_grant',                 'authority',   ARRAY['id'], 'tenant_id', ARRAY['notes','metadata'], 'Deprecated mixed grant/override/ACL source'),
    ('master', 'group_feature_grant',          'authority',   ARRAY['id'], 'tenant_id', '{}', 'Deprecated group feature grant'),
    ('master', 'principal_feature_grant',      'authority',   ARRAY['id'], 'tenant_id', '{}', 'Deprecated principal feature grant'),
    ('master', 'delegation_grant',             'authority',   ARRAY['id'], 'tenant_id', ARRAY['reason','revoke_reason'], 'Deprecated denormalized delegation'),
    ('master', 'attachment_acl',               'authority',   ARRAY['id'], 'tenant_id', '{}', 'Legacy attachment ACL'),
    ('master', 'content_item_access_grant',    'authority',   ARRAY['id'], 'tenant_id', '{}', 'Legacy content record grant'),
    ('master', 'legal_entity',                 'scope',       ARRAY['id'], 'tenant_id', ARRAY['name','display_name','legal_name','registration_no','tax_registration_number','metadata'], 'Legal-entity hierarchy used by scopes'),
    ('master', 'company_code',                 'scope',       ARRAY['id'], 'tenant_id', ARRAY['name','description','metadata'], 'Company boundary used by scopes'),
    ('master', 'operating_organization',       'scope',       ARRAY['id'], 'tenant_id', ARRAY['name','display_name','description','metadata'], 'Operating-organization scope'),
    ('master', 'operating_organization_company','scope',      ARRAY['id'], 'tenant_id', ARRAY['metadata'], 'Operating-organization company membership'),
    ('master', 'business_network',             'scope',       ARRAY['id'], 'owner_tenant_id', ARRAY['name','external_network_id','metadata'], 'Deprecated Neon Mesh-network authority context'),
    ('master', 'business_network_membership',  'scope',       ARRAY['id'], 'participant_tenant_id', ARRAY['metadata'], 'Deprecated Neon Mesh membership'),
    ('master', 'business_network_membership_role','authority',ARRAY['id'], NULL, ARRAY['display_label','metadata'], 'Deprecated Neon Mesh membership role'),

    -- Entity-operation and security-bearing metadata inputs.
    ('control', 'entity',                      'metadata',    ARRAY['id'], 'tenant_id', ARRAY['description','metadata'], 'Entity identity and plane metadata'),
    ('control', 'entity_version',              'metadata',    ARRAY['id'], 'tenant_id', ARRAY['contract_document','metadata'], 'Versioned entity contract'),
    ('control', 'entity_operation',            'metadata',    ARRAY['id'], 'tenant_id', ARRAY['description','handler_config','metadata'], 'Operation-to-permission source'),
    ('control', 'permission_alias',            'authority',   ARRAY['id'], NULL, ARRAY['notes'], 'Migration-only permission alias'),
    ('control', 'entity_surface',              'metadata',    ARRAY['id'], 'tenant_id', ARRAY['config','metadata'], 'Surface permission metadata'),
    ('control', 'entity_field',                'metadata',    ARRAY['id'], 'tenant_id', ARRAY['description','metadata'], 'Field security input'),
    ('control', 'field_security_policy',       'authority',   ARRAY['id'], 'tenant_id', ARRAY['metadata'], 'Field-level authorization policy'),
    ('control', 'entity_policy',               'authority',   ARRAY['id'], 'tenant_id', ARRAY['policy_config','metadata'], 'Entity-level authorization policy'),
    ('control', 'lifecycle',                   'metadata',    ARRAY['id'], 'tenant_id', ARRAY['description','config'], 'Lifecycle authorization input'),
    ('control', 'lifecycle_state',             'metadata',    ARRAY['id'], 'tenant_id', ARRAY['description','config','state_flags'], 'Lifecycle state capability input'),
    ('control', 'lifecycle_transition',        'authority',   ARRAY['id'], 'tenant_id', ARRAY['config'], 'Transition permission code'),
    ('control', 'lifecycle_transition_gate',   'authority',   ARRAY['id'], 'tenant_id', ARRAY['conditions','threshold_rules'], 'Transition precondition input'),
    ('control', 'entity_lifecycle',            'metadata',    ARRAY['id'], 'tenant_id', ARRAY['metadata'], 'Entity/lifecycle binding'),
    ('control', 'entity_lifecycle_state_mask', 'authority',   ARRAY['id'], 'tenant_id', ARRAY['config'], 'Per-state capability mask'),
    ('control', 'entity_action_rule',          'authority',   ARRAY['id'], 'tenant_id', ARRAY['condition','config'], 'Action authorization rule'),
    ('control', 'entity_relation',             'metadata',    ARRAY['id'], 'tenant_id', ARRAY['mutation_permissions','metadata'], 'Relation mutation permissions'),
    ('control', 'entity_flow',                 'metadata',    ARRAY['id'], 'tenant_id', ARRAY['config','metadata'], 'Flow permission context'),
    ('control', 'entity_flow_step',            'metadata',    ARRAY['id'], 'tenant_id', ARRAY['config','metadata'], 'Flow-step permission context')
ON CONFLICT (source_schema, source_table) DO UPDATE
SET
    source_kind = EXCLUDED.source_kind,
    owner_team = EXCLUDED.owner_team,
    primary_key_columns = EXCLUDED.primary_key_columns,
    tenant_column = EXCLUDED.tenant_column,
    redacted_columns = EXCLUDED.redacted_columns,
    retention_days = EXCLUDED.retention_days,
    notes = EXCLUDED.notes,
    updated_at = now(),
    updated_by = session_user;

