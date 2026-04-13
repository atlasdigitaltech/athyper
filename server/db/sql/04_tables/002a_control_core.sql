-- 04_tables/002a_control_core.sql
-- Depends on: 01_schemas, 03_bootstrap_functions (shared.uuidv7)
-- Control schema tables (Part A): lookup domains, MFA, notification, lifecycle, workflow, and entity metadata.
-- Seed principal: systemadmin (id = '00000000-0000-0000-0000-000000000000').

-- §1 lookup_domain — registry of named lookup sets
CREATE TABLE IF NOT EXISTS control.lookup_domain (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    code            text              NOT NULL,
    name            text              NOT NULL,

    -- Table-specific
    description     text,
    source_schema   text              NOT NULL,
    is_extensible   boolean           NOT NULL DEFAULT false,

    -- Metadata
    metadata        jsonb             DEFAULT '{}'::jsonb NOT NULL,

    -- Lifecycle
    status            text            NOT NULL DEFAULT 'active',
    is_active         boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at      timestamptz       NOT NULL DEFAULT now(),
    created_by      uuid              NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT lookup_domain_pkey          PRIMARY KEY (id),
    CONSTRAINT lookup_domain_code_uq       UNIQUE (code),
    CONSTRAINT lookup_domain_code_fmt      CHECK (code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'),
    CONSTRAINT lookup_domain_name_nonempty CHECK (btrim(name) <> ''),
    CONSTRAINT lookup_domain_status_chk    CHECK (status IN ('active', 'deprecated'))
);

COMMENT ON TABLE control.lookup_domain IS
  'Registry of named lookup domains. Each domain groups lookup values under a unique code. is_extensible=true allows tenant extensions.';

-- §2 lookup_value — code+label pairs belonging to a domain
CREATE TABLE IF NOT EXISTS control.lookup_value (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid,
    code            text              NOT NULL,
    name            text              NOT NULL,

    -- Table-specific
    domain_code     text              NOT NULL,
    description     text,
    category        text,
    sort_order      smallint          NOT NULL DEFAULT 0,
    is_system       boolean           NOT NULL DEFAULT true,

    -- Metadata
    metadata        jsonb             DEFAULT '{}'::jsonb NOT NULL,

    -- Lifecycle
    status            text            NOT NULL DEFAULT 'active',
    is_active         boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at      timestamptz       NOT NULL DEFAULT now(),
    created_by      uuid              NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT lookup_value_pkey               PRIMARY KEY (id),
    CONSTRAINT lookup_value_code_fmt           CHECK (code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'),
    CONSTRAINT lookup_value_name_nonempty      CHECK (btrim(name) <> ''),
    CONSTRAINT lookup_value_status_chk         CHECK (status IN ('active', 'deprecated')),
    CONSTRAINT lookup_value_system_consistency CHECK (
        (is_system = true  AND tenant_id IS NULL)
     OR (is_system = false AND tenant_id IS NOT NULL)
    )
);

COMMENT ON TABLE control.lookup_value IS
  'Lookup code+label pairs keyed by domain_code. Global rows: tenant_id IS NULL, is_system=true. Tenant extensions: tenant_id IS NOT NULL, is_system=false.';


-- §1 mfa_config — local mirror of Keycloak MFA enrollment state
-- One row per (tenant, principal, method_type).
-- Replaces: email_otp_instance, sms_otp_instance, totp_instance, mfa_challenge.
CREATE TABLE IF NOT EXISTS control.mfa_config (
    -- Identity
    id              uuid              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid              NOT NULL,

    -- Table-specific (scope)
    principal_id    uuid              NOT NULL,
    method_type     text              NOT NULL,

    -- Table-specific (enrollment state — mirrored from Keycloak)
    is_enabled      boolean           NOT NULL DEFAULT false,
    is_verified     boolean           NOT NULL DEFAULT false,
    is_primary      boolean           NOT NULL DEFAULT false,
    enrolled_at     timestamptz,
    verified_at     timestamptz,
    last_used_at    timestamptz,

    -- Table-specific (delivery address — required for email/sms, NULL for totp/webauthn/backup)
    contact_link_id    uuid,

    -- Table-specific (Keycloak binding)
    keycloak_credential_id      text,
    keycloak_synced_at          timestamptz,
    keycloak_sync_status        text        NOT NULL DEFAULT 'pending',

    -- Metadata
    metadata        jsonb             DEFAULT '{}'::jsonb NOT NULL,

    -- Audit
    created_at      timestamptz       NOT NULL DEFAULT now(),
    created_by      uuid              NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT mfa_config_pkey                     PRIMARY KEY (id),
    CONSTRAINT mfa_config_principal_method_uq      UNIQUE (tenant_id, principal_id, method_type),
    CONSTRAINT mfa_config_keycloak_credential_uq   UNIQUE NULLS NOT DISTINCT (keycloak_credential_id),
    -- mfa_config_method_type_chk: deferred to 06_constraints via control.fn_valid_lookup
    -- Sealed inline CHECK — Keycloak sync status is protocol-defined, not extensible.
    CONSTRAINT mfa_config_sync_status_chk          CHECK (keycloak_sync_status IN ('pending', 'synced', 'drift', 'error')),
    CONSTRAINT mfa_config_primary_requires_active  CHECK (NOT is_primary OR (is_enabled AND is_verified)),
    CONSTRAINT mfa_config_verified_at_chk          CHECK (is_verified = false OR verified_at IS NOT NULL),
    CONSTRAINT mfa_config_enrolled_at_chk          CHECK (is_enabled = false OR enrolled_at IS NOT NULL),
    CONSTRAINT mfa_config_contact_link_chk        CHECK (
        CASE method_type
            WHEN 'email'    THEN contact_link_id IS NOT NULL
            WHEN 'sms'      THEN contact_link_id IS NOT NULL
            WHEN 'totp'     THEN contact_link_id IS NULL
            WHEN 'webauthn' THEN contact_link_id IS NULL
            WHEN 'backup'   THEN contact_link_id IS NULL
            ELSE true
        END
    )
);

COMMENT ON TABLE  control.mfa_config IS
  'Local mirror of Keycloak MFA enrollment. One row per (tenant, principal, method_type). Replaces OTP instance tables.';


-- ============================================================================
-- §2  notification_provider — channel provider registry
-- ============================================================================
-- Platform-level. Replaces control.notification_provider.
-- One row per provider implementation per channel
-- (e.g. SendGrid for email, Twilio for sms, FCM for push).
-- health is mutable — updated by the provider health-check worker.

CREATE TABLE IF NOT EXISTS control.notification_provider (
    -- Identity
    id              uuid            NOT NULL DEFAULT shared.uuidv7(),

    -- Table-specific
    channel         text            NOT NULL,
    code            text            NOT NULL,
    name            text            NOT NULL,
    adapter_key     text            NOT NULL,
    priority        smallint        NOT NULL DEFAULT 1,
    is_enabled      boolean         NOT NULL DEFAULT true,
    config          jsonb           NOT NULL DEFAULT '{}',
    rate_limit      jsonb,
    health          text            NOT NULL DEFAULT 'healthy',

    -- Audit
    created_at      timestamptz     NOT NULL DEFAULT now(),
    created_by      uuid            NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT notification_provider_pkey        PRIMARY KEY (id),
    CONSTRAINT notification_provider_code_uq     UNIQUE (channel, code),
    CONSTRAINT notification_provider_priority_chk CHECK (priority >= 1),
    CONSTRAINT notification_provider_health_chk   CHECK (health IN ('healthy', 'degraded', 'down')),
    CONSTRAINT notification_provider_code_fmt     CHECK (btrim(code) <> ''),
    CONSTRAINT notification_provider_adapter_fmt  CHECK (btrim(adapter_key) <> '')
    -- channel: 09_triggers — control.trg_validate_lookup_columns('notification.channel')
);

COMMENT ON TABLE  control.notification_provider IS
    'Channel provider registry. One row per adapter per channel. '
    'health updated by health-check worker. '
    'channel vocabulary: control.lookup_domain notification.channel.';
COMMENT ON COLUMN control.notification_provider.adapter_key IS
    'Stable code identifying the adapter implementation (e.g. sendgrid_v3, twilio_sms).';
COMMENT ON COLUMN control.notification_provider.config IS
    'Adapter configuration (API keys, endpoint URLs). Stored encrypted at rest.';
COMMENT ON COLUMN control.notification_provider.rate_limit IS
    'Optional rate-limit policy: {per_minute: N, per_hour: N, burst: N}.';


-- ============================================================================
-- §3  notification_routing_rule — event-driven notification routing rules
-- ============================================================================
-- Replaces control.notification_rule.
-- Tenant-scoped (tenant_id NULL = platform global rule).
-- Defines: which event triggers → which template → via which channels → to whom.

CREATE TABLE IF NOT EXISTS control.notification_routing_rule (
    -- Identity
    id              uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid,

    -- Rule identity
    code            text            NOT NULL,
    name            text            NOT NULL,
    description     text,

    -- Trigger condition
    event_type      text            NOT NULL,
    entity_type     text,
    lifecycle_state text,
    condition_expr  jsonb,

    -- Dispatch target
    template_key    text            NOT NULL,
    channels        text[]          NOT NULL,
    priority        text            NOT NULL DEFAULT 'normal',

    -- Recipient resolution
    recipient_rules jsonb           NOT NULL DEFAULT '{}',

    -- Throttling
    sla_minutes     smallint,
    dedup_window_ms integer         NOT NULL DEFAULT 300000,

    -- Lifecycle
    is_enabled      boolean         NOT NULL DEFAULT true,
    sort_order      smallint        NOT NULL DEFAULT 0,

    -- Audit
    created_at      timestamptz     NOT NULL DEFAULT now(),
    created_by      uuid            NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT nrr_pkey              PRIMARY KEY (id),
    CONSTRAINT nrr_tenant_code_uq    UNIQUE NULLS NOT DISTINCT (tenant_id, code),
    CONSTRAINT nrr_event_chk         CHECK (btrim(event_type) <> ''),
    CONSTRAINT nrr_template_chk      CHECK (btrim(template_key) <> ''),
    CONSTRAINT nrr_channels_chk      CHECK (array_length(channels, 1) >= 1),
    CONSTRAINT nrr_dedup_chk         CHECK (dedup_window_ms >= 0),
    CONSTRAINT nrr_recipient_chk     CHECK (jsonb_typeof(recipient_rules) = 'object'),
    CONSTRAINT nrr_condition_chk     CHECK (condition_expr IS NULL
                                        OR jsonb_typeof(condition_expr) = 'object')
    -- priority: 09_triggers — control.trg_validate_lookup_columns('notification.priority')
);

COMMENT ON TABLE  control.notification_routing_rule IS
    'Event-driven notification routing rules. tenant_id=NULL = platform global rule. '
    'channels[] references notification.channel lookup codes. '
    'priority validated via notification.priority lookup.';
COMMENT ON COLUMN control.notification_routing_rule.recipient_rules IS
    'JSONB recipient resolution rules: '
    '{actor: true, ou_members: true, role: "approver", explicit_ids: [uuid,...]}.';
COMMENT ON COLUMN control.notification_routing_rule.dedup_window_ms IS
    'Suppress duplicate messages for same (event_type, entity_id, recipient) '
    'within this window. Default 5 minutes (300000 ms).';


-- ============================================================================
-- §4  notification_template — versioned message templates per channel/locale
-- ============================================================================
-- Replaces control.notification_template.
-- Tenant-scoped (tenant_id NULL = platform default template).
-- One row per (template_key, channel, locale, version).

CREATE TABLE IF NOT EXISTS control.notification_template (
    -- Identity
    id              uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid,

    -- Template identity
    template_key    text            NOT NULL,
    channel         text            NOT NULL,
    locale          text            NOT NULL DEFAULT 'en',
    version         smallint        NOT NULL DEFAULT 1,

    -- Content
    status          text            NOT NULL DEFAULT 'draft',
    subject         text,
    body_text       text,
    body_html       text,
    body_json       jsonb,
    variables_schema jsonb,

    -- Metadata
    metadata        jsonb           NOT NULL DEFAULT '{}',

    -- Audit
    created_at      timestamptz     NOT NULL DEFAULT now(),
    created_by      uuid            NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT ntmpl_pkey            PRIMARY KEY (id),
    CONSTRAINT ntmpl_version_uq      UNIQUE NULLS NOT DISTINCT (tenant_id, template_key, channel, locale, version),
    CONSTRAINT ntmpl_key_chk         CHECK (btrim(template_key) <> ''),
    CONSTRAINT ntmpl_locale_chk      CHECK (btrim(locale) <> ''),
    CONSTRAINT ntmpl_version_chk     CHECK (version >= 1),
    CONSTRAINT ntmpl_status_chk      CHECK (status IN ('draft', 'active', 'retired')),
    CONSTRAINT ntmpl_body_chk        CHECK (
        num_nonnulls(body_text, body_html, body_json) >= 1
    )
    -- channel: 09_triggers — control.trg_validate_lookup_columns('notification.channel')
);

COMMENT ON TABLE  control.notification_template IS
    'Versioned message templates per (template_key, channel, locale). '
    'tenant_id=NULL = platform default. Tenant rows override platform defaults. '
    'channel validated via notification.channel lookup.';
COMMENT ON COLUMN control.notification_template.template_key IS
    'Stable identifier shared across channel/locale variants '
    '(e.g. approval_requested, kpi_breach, invoice_due).';
COMMENT ON COLUMN control.notification_template.variables_schema IS
    'JSON Schema for template variable validation at dispatch time.';
COMMENT ON COLUMN control.notification_template.body_json IS
    'Structured body for rich push/in-app notifications (action buttons, images).';


-- ============================================================================
-- LIFECYCLE ENGINE — control.* tables (§1-§8)
-- ============================================================================
-- =============================================================================
-- §1  control.lifecycle — state machine definition
-- =============================================================================
-- Root record for a state machine. One row per named lifecycle.
-- tenant_id=NULL  → platform-global lifecycle visible to all tenants (L17 fix).
-- tenant_id=uuid  → tenant-custom lifecycle (overrides or extends a platform one).
-- version_no incremented each time child tables change (states/transitions/hooks).
-- definition_hash NULLed when child changes occur (triggers re-compile).
-- is_active=false → lifecycle deprecated; workflow_instances continue on pinned version.

CREATE TABLE IF NOT EXISTS control.lifecycle (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid,                              -- NULL = platform-global (L17)

    -- Definition identity
    code            text        NOT NULL,
    name            text        NOT NULL,
    description     text,

    -- Versioning
    version_no      integer     NOT NULL DEFAULT 1,
    definition_hash text,

    -- Lifecycle
    is_active       boolean     NOT NULL DEFAULT true,

    -- Extended config (ui_color, icon_key, entity_types[] this lifecycle applies to)
    config          jsonb       NOT NULL DEFAULT '{}',

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT lifecycle_pkey           PRIMARY KEY (id),
    CONSTRAINT lifecycle_tenant_id_uq   UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    -- L01: prevent duplicate codes per tenant (platform global codes also unique)
    CONSTRAINT lifecycle_code_uq        UNIQUE NULLS NOT DISTINCT (tenant_id, code),
    CONSTRAINT lifecycle_code_chk       CHECK (btrim(code) <> ''),
    CONSTRAINT lifecycle_name_chk       CHECK (btrim(name) <> ''),
    CONSTRAINT lifecycle_version_chk    CHECK (version_no >= 1),
    -- L12: definition_hash must be a 64-char hex string when set
    CONSTRAINT lifecycle_hash_fmt_chk   CHECK (
        definition_hash IS NULL
        OR length(definition_hash) >= 64
    ),
    CONSTRAINT lifecycle_config_chk     CHECK (jsonb_typeof(config) = 'object')
);

COMMENT ON TABLE  control.lifecycle IS
    'State machine definition. Root record for a named lifecycle. '
    'tenant_id=NULL = platform-global (visible to all tenants). '
    'version_no incremented on child table changes. '
    'definition_hash NULLed to signal stale compiled snapshots. '
    'Replaces control.lifecycle (backup).';
COMMENT ON COLUMN control.lifecycle.tenant_id IS
    'NULL = platform-global lifecycle. All tenants can bind entities to global lifecycles. '
    'Non-null = tenant-custom lifecycle. Unique per (tenant_id, code) NULLS NOT DISTINCT.';
COMMENT ON COLUMN control.lifecycle.definition_hash IS
    'SHA-256 hex of the compiled lifecycle definition. Set by compile functions. '
    'NULLed by fn_lifecycle_child_changed trigger when any child row changes. '
    'NULL = definition is stale, snapshot.lifecycle_version needs recompile.';
COMMENT ON COLUMN control.lifecycle.config IS
    'Extended metadata: {ui_color, icon_key, entity_types: [...], '
    'initial_state_code, allow_parallel_instances: bool}.';


-- =============================================================================
-- §2  control.lifecycle_state — states (nodes of the state machine graph)
-- =============================================================================
-- One row per state within a lifecycle.
-- is_terminal=true → guard_terminal_immutability() blocks further field edits.
-- is_initial=true  → exactly one state per lifecycle must be initial (enforced by trigger).
-- updated_at/updated_by added (L14 fix) → state edits (name, config) now tracked.

CREATE TABLE IF NOT EXISTS control.lifecycle_state (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid,
    lifecycle_id    uuid        NOT NULL,

    -- State identity
    code            text        NOT NULL,
    name            text        NOT NULL,
    description     text,

    -- State semantics
    is_initial      boolean     NOT NULL DEFAULT false,
    is_terminal     boolean     NOT NULL DEFAULT false,
    sort_order      smallint    NOT NULL DEFAULT 0,

    -- Extended config (ui_color, icon_key, sla_minutes, require_reason_on_entry)
    config          jsonb       NOT NULL DEFAULT '{}',

    -- Audit (L14: updated_at/updated_by added)
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT ls_pkey              PRIMARY KEY (id),
    CONSTRAINT ls_tenant_id_uq      UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    -- L02: prevent duplicate state codes within a lifecycle
    CONSTRAINT ls_code_uq           UNIQUE (lifecycle_id, code),
    CONSTRAINT ls_code_chk          CHECK (btrim(code) <> ''),
    CONSTRAINT ls_name_chk          CHECK (btrim(name) <> ''),
    CONSTRAINT ls_config_chk        CHECK (jsonb_typeof(config) = 'object'),
    -- Terminal states cannot also be initial
    CONSTRAINT ls_terminal_initial_chk CHECK (
        NOT (is_initial = true AND is_terminal = true)
    )
);

COMMENT ON TABLE  control.lifecycle_state IS
    'States (nodes) within a lifecycle. '
    'is_initial=true: trigger enforces exactly one per lifecycle. '
    'is_terminal=true: guard_terminal_immutability() blocks field edits on entities in this state. '
    'config: {ui_color, icon_key, sla_minutes, require_reason_on_entry: bool}.';
COMMENT ON COLUMN control.lifecycle_state.is_initial IS
    'Exactly one state per lifecycle must be initial. '
    'Enforced by trg_ls_single_initial trigger (UNIQUE filtered index alternative).';
COMMENT ON COLUMN control.lifecycle_state.is_terminal IS
    'No outbound transitions permitted. '
    'control.guard_terminal_immutability() reads snapshot.status_route.terminal_states '
    'to block non-status field edits on entities in terminal states.';


-- =============================================================================
-- §3  control.lifecycle_transition — allowed transitions (edges)
-- =============================================================================
-- One row per permitted (from_state → to_state) edge.
-- L03: from_state_id <> to_state_id → self-loops not permitted.
-- L04: UNIQUE(lifecycle_id, from_state_id, to_state_id) → no duplicate edges.
-- L18: trigger enforces from_state and to_state both belong to the same lifecycle_id.
-- operation_code links to shared.permission.code → permission check at transition time.

CREATE TABLE IF NOT EXISTS control.lifecycle_transition (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid,
    lifecycle_id    uuid        NOT NULL,

    -- Edge
    from_state_id   uuid        NOT NULL,
    to_state_id     uuid        NOT NULL,

    -- Operation (maps to shared.permission.code for authz check)
    operation_code  text        NOT NULL,

    -- Lifecycle
    is_active       boolean     NOT NULL DEFAULT true,

    -- Extended config (require_comment, notify_on_transition, min_time_in_state_minutes)
    config          jsonb       NOT NULL DEFAULT '{}',

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT lt_pkey              PRIMARY KEY (id),
    -- L04: no duplicate transitions
    CONSTRAINT lt_edge_uq           UNIQUE (lifecycle_id, from_state_id, to_state_id),
    -- L03: no self-loops
    CONSTRAINT lt_no_self_loop_chk  CHECK (from_state_id <> to_state_id),
    CONSTRAINT lt_op_code_chk       CHECK (btrim(operation_code) <> ''),
    CONSTRAINT lt_config_chk        CHECK (jsonb_typeof(config) = 'object')
    -- L18: from_state/to_state belong to same lifecycle → enforced by trigger
);

COMMENT ON TABLE  control.lifecycle_transition IS
    'Allowed state transitions (directed edges). '
    'No self-loops (from <> to). No duplicate edges per lifecycle. '
    'operation_code maps to shared.permission.code for permission-check at runtime. '
    'L18: trg_lt_cross_lifecycle_guard ensures from/to states belong to this lifecycle_id. '
    'Replaces association.lifecycle_transition (backup). '
    'P2-FIX: updated_at/updated_by added — is_active and config are mutable.';
COMMENT ON COLUMN control.lifecycle_transition.tenant_id IS
    'Inherited from parent lifecycle. NULL = platform-global lifecycle. '
    'P4-REVIEWED: No NULLS NOT DISTINCT needed on the transition unique key '
    '(lifecycle_id, from_state_id, to_state_id) — lifecycle_id already encodes '
    'tenant scope via control.lifecycle UNIQUE (tenant_id, code). '
    'Two transitions cannot share the same edge within the same lifecycle '
    'regardless of tenant_id.';
COMMENT ON COLUMN control.lifecycle_transition.operation_code IS
    'The permission code required to fire this transition. '
    'E.g. ''approve'', ''submit'', ''reject'', ''cancel''. '
    'Validated against shared.permission.code at INSERT time by trigger.';


-- =============================================================================
-- §4  control.lifecycle_transition_gate — preconditions on transitions
-- =============================================================================
-- A gate is a precondition evaluated BEFORE a transition fires.
-- L09: one consolidated gate per transition (UNIQUE on transition_id).
-- Gate has three orthogonal precondition types — any/all may be combined in one row.

CREATE TABLE IF NOT EXISTS control.lifecycle_transition_gate (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid,
    transition_id   uuid        NOT NULL,

    -- Precondition type A: prior operations that must have been executed
    required_operations  jsonb,

    -- Precondition type B: approval workflow that must have returned APPROVED
    approval_template_id uuid,

    -- Precondition type C: CEL / JSONLogic expressions against entity payload
    conditions           jsonb,

    -- Precondition type D: numeric threshold rules
    threshold_rules      jsonb,

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT ltg_pkey             PRIMARY KEY (id),
    -- L09: one gate per transition (avoids undefined evaluation order)
    CONSTRAINT ltg_transition_uq    UNIQUE (transition_id),
    CONSTRAINT ltg_ops_chk          CHECK (
        required_operations IS NULL OR jsonb_typeof(required_operations) = 'array'
    ),
    CONSTRAINT ltg_conditions_chk   CHECK (
        conditions IS NULL OR jsonb_typeof(conditions) = 'object'
    ),
    CONSTRAINT ltg_threshold_chk    CHECK (
        threshold_rules IS NULL OR jsonb_typeof(threshold_rules) = 'array'
    ),
    -- At least one precondition must be set
    CONSTRAINT ltg_nonempty_chk     CHECK (
        required_operations IS NOT NULL
        OR approval_template_id IS NOT NULL
        OR conditions IS NOT NULL
        OR threshold_rules IS NOT NULL
    )
);

COMMENT ON TABLE  control.lifecycle_transition_gate IS
    'Preconditions evaluated before a transition fires. '
    'One gate per transition (UNIQUE on transition_id) — all conditions combined in one row. '
    'required_operations: [{code: ''review'', completed_by: ''any''}] '
    'approval_template_id: approval workflow must have returned APPROVED. '
    'conditions: JSONLogic/CEL expression evaluated against entity payload. '
    'threshold_rules: [{field: ''amount'', op: ''>='', value: 10000}]. '
    'P2-FIX: updated_at/updated_by added — gate conditions are refined over time.';


-- =============================================================================
-- §5  control.lifecycle_transition_hook — side effects on transitions
-- =============================================================================
-- Hooks execute before or after a transition fires.
-- L10: 'required' added to safety_level (cannot be suppressed by ANY override).
-- L13: timing renamed to 'before'/'after' (replaces ambiguous on_success/on_failure).
-- sort_order range enforced by origin (system: 0-999, tenant: 1000-1999, overlay: 2000+).
-- contract hooks (contract_role='contract') can only be defined by system (origin='system').

CREATE TABLE IF NOT EXISTS control.lifecycle_transition_hook (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid,
    transition_id   uuid        NOT NULL,

    -- Execution ordering
    timing          text        NOT NULL DEFAULT 'after',
    sort_order      smallint    NOT NULL DEFAULT 0,

    -- Hook action
    action          text        NOT NULL,
    config          jsonb       NOT NULL DEFAULT '{}',

    -- Governance
    origin          text        NOT NULL DEFAULT 'system',
    layer_rank      smallint    NOT NULL DEFAULT 10,
    contract_role   text        NOT NULL DEFAULT 'extension',
    -- L10: 'required' added — hook cannot be suppressed by any override
    safety_level    text        NOT NULL DEFAULT 'replaceable',
    overlay_id      uuid,

    -- Lifecycle
    is_active       boolean     NOT NULL DEFAULT true,

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT lth_pkey                 PRIMARY KEY (id),
    -- L13: 'before' and 'after' replace on_enter/on_exit/on_success/on_failure
    CONSTRAINT lth_timing_chk           CHECK (timing IN ('before', 'after')),
    CONSTRAINT lth_origin_chk           CHECK (origin IN ('system', 'tenant', 'overlay')),
    CONSTRAINT lth_contract_role_chk    CHECK (contract_role IN ('contract', 'extension')),
    -- L10: 'required' added
    CONSTRAINT lth_safety_level_chk     CHECK (safety_level IN ('required', 'narrowable', 'replaceable')),
    -- contract hooks can only be system-origin
    CONSTRAINT lth_contract_system_chk  CHECK (
        contract_role = 'extension' OR origin = 'system'
    ),
    -- required safety only applies to contract hooks
    CONSTRAINT lth_required_contract_chk CHECK (
        safety_level <> 'required' OR contract_role = 'contract'
    ),
    -- sort_order ranges enforce execution layer ordering
    CONSTRAINT lth_sort_origin_chk      CHECK (
        (origin = 'system'  AND sort_order BETWEEN 0    AND 999)
        OR (origin = 'tenant'  AND sort_order BETWEEN 1000 AND 1999)
        OR (origin = 'overlay' AND sort_order >= 2000)
    ),
    CONSTRAINT lth_layer_rank_chk       CHECK (
        (origin = 'system'  AND layer_rank = 10)
        OR (origin = 'tenant'  AND layer_rank = 20)
        OR (origin = 'overlay' AND layer_rank = 30)
    ),
    -- overlay_id required iff origin='overlay'
    CONSTRAINT lth_overlay_id_chk       CHECK (
        (origin = 'overlay' AND overlay_id IS NOT NULL)
        OR (origin <> 'overlay' AND overlay_id IS NULL)
    ),
    CONSTRAINT lth_action_chk           CHECK (btrim(action) <> ''),
    CONSTRAINT lth_config_chk           CHECK (jsonb_typeof(config) = 'object')
);

COMMENT ON TABLE  control.lifecycle_transition_hook IS
    'Side effects executed before or after a transition commits. '
    'timing: before (can veto by raising exception) | after (cannot veto). '
    'safety_level: required (cannot suppress) | narrowable | replaceable. '
    'contract_role: contract (platform promise) | extension (optional). '
    'Execution order: sort_order within origin layer, then layer_rank across origins. '
    'L10: required safety_level added. L13: timing simplified to before/after. '
    'Replaces association.lifecycle_transition_hook (backup). '
    'P2-FIX: updated_at/updated_by added — hooks are toggled and config edited.';
COMMENT ON COLUMN control.lifecycle_transition_hook.timing IS
    '''before'' — fires before transition commits. Can veto by RAISE EXCEPTION. '
    '''after''  — fires after transition commits. Cannot veto (transition is done). '
    'Replaces ambiguous on_enter/on_exit/on_success/on_failure from backup (L13).';
COMMENT ON COLUMN control.lifecycle_transition_hook.safety_level IS
    '''required''    — cannot be suppressed or replaced by any override. '
    '''narrowable''  — config can be restricted but hook cannot be disabled. '
    '''replaceable'' — can be fully suppressed or replaced by lifecycle_hook_override. '
    'L10: ''required'' is new — not present in backup. Used for compliance-critical hooks.';
COMMENT ON COLUMN control.lifecycle_transition_hook.action IS
    'References control.hook_action_registry.action_key. '
    'Validated by trg_lth_action_registry_guard trigger on INSERT/UPDATE.';


-- =============================================================================
-- §6  control.lifecycle_hook_override — tenant customisation of hooks
-- =============================================================================
-- Tenants use overrides to suppress, replace, or augment extension hooks.
-- Required hooks (safety_level='required') cannot be overridden — enforced by trigger.
-- override_kind renamed: add_before/add_after (backup: prepend/append → add_before/add_after).

CREATE TABLE IF NOT EXISTS control.lifecycle_hook_override (
    -- Identity
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    target_hook_id      uuid        NOT NULL,

    -- Override
    override_kind       text        NOT NULL,
    replacement_action  text,
    replacement_config  jsonb,
    sort_order          smallint    NOT NULL DEFAULT 0,
    reason              text,

    -- Lifecycle
    is_active           boolean     NOT NULL DEFAULT true,

    -- Audit
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT lho_pkey                 PRIMARY KEY (id),
    -- One active override per (tenant, target_hook)
    CONSTRAINT lho_tenant_hook_uq       UNIQUE (tenant_id, target_hook_id),
    CONSTRAINT lho_kind_chk             CHECK (override_kind IN (
        'suppress', 'replace', 'add_before', 'add_after'
    )),
    -- suppress: no replacement. replace/add_*: replacement_action required
    CONSTRAINT lho_replacement_chk      CHECK (
        (override_kind = 'suppress' AND replacement_action IS NULL)
        OR (override_kind <> 'suppress' AND replacement_action IS NOT NULL)
    ),
    CONSTRAINT lho_config_chk           CHECK (
        replacement_config IS NULL OR jsonb_typeof(replacement_config) = 'object'
    )
    -- 'required' safety_level guard enforced by trigger (cannot override required hooks)
);

COMMENT ON TABLE  control.lifecycle_hook_override IS
    'Tenant customisation of lifecycle hooks. '
    'suppress: disable a replaceable hook entirely. '
    'replace: swap the hook action with a different one. '
    'add_before/add_after: inject behaviour around the original hook. '
    'Hooks with safety_level=''required'' cannot be overridden — enforced by '
    'trg_lho_safety_guard trigger which checks the target hook''s safety_level. '
    'Replaces association.lifecycle_hook_override (backup). '
    'P2-FIX: updated_at/updated_by added — overrides are toggled and edited.';


-- =============================================================================
-- §7  control.hook_action_registry — registry of known hook actions
-- =============================================================================
-- Extensible registry of all hook action types the engine can execute.
-- Platform seeds system actions. Tenants register custom actions.
-- L16: 'webhook' added to handler_type.
-- L10: 'required' added to default_safety_level.
-- This table serves as the extensible action vocabulary (replaces a lookup domain).

CREATE TABLE IF NOT EXISTS control.hook_action_registry (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid,

    -- Action identity
    action_key              text        NOT NULL,
    label                   text        NOT NULL,
    description             text,

    -- Handler
    -- L16: 'webhook' added
    handler_type            text        NOT NULL DEFAULT 'built_in',
    handler_config          jsonb,

    -- Defaults when this action is used in a hook
    -- L10: 'required' added to default_safety_level
    default_contract_role   text        NOT NULL DEFAULT 'extension',
    default_safety_level    text        NOT NULL DEFAULT 'replaceable',

    -- Origin
    origin                  text        NOT NULL DEFAULT 'system',

    -- Lifecycle
    is_active               boolean     NOT NULL DEFAULT true,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT har_pkey                 PRIMARY KEY (id),
    -- action_key unique per tenant (platform actions have tenant_id=NULL)
    CONSTRAINT har_key_uq               UNIQUE NULLS NOT DISTINCT (tenant_id, action_key),
    CONSTRAINT har_key_chk              CHECK (btrim(action_key) <> ''),
    CONSTRAINT har_label_chk            CHECK (btrim(label) <> ''),
    -- L16: webhook added
    CONSTRAINT har_handler_type_chk     CHECK (handler_type IN (
        'built_in', 'emit_event', 'webhook'
    )),
    CONSTRAINT har_contract_role_chk    CHECK (default_contract_role IN (
        'contract', 'extension'
    )),
    -- L10: required added
    CONSTRAINT har_safety_level_chk     CHECK (default_safety_level IN (
        'required', 'narrowable', 'replaceable'
    )),
    CONSTRAINT har_origin_chk           CHECK (origin IN ('system', 'tenant')),
    CONSTRAINT har_origin_tenant_chk    CHECK (
        (origin = 'system' AND tenant_id IS NULL)
        OR (origin = 'tenant' AND tenant_id IS NOT NULL)
    ),
    CONSTRAINT har_config_chk           CHECK (
        handler_config IS NULL OR jsonb_typeof(handler_config) = 'object'
    )
);

COMMENT ON TABLE  control.hook_action_registry IS
    'Registry of all hook actions the lifecycle engine can execute. '
    'Platform seeds system actions (origin=''system'', tenant_id=NULL). '
    'Tenants register custom actions (origin=''tenant''). '
    'control.lifecycle_transition_hook.action references action_key here. '
    'handler_type: built_in (platform code), emit_event (outbox), webhook (HTTP). '
    'L16: webhook handler_type added. L10: required safety_level added. '
    'P2-FIX: updated_at/updated_by added — actions are toggled (is_active) and config edited.';
COMMENT ON COLUMN control.hook_action_registry.handler_type IS
    '''built_in'' — handled by platform code identified by action_key. '
    '''emit_event'' — inserts a row into event.outbox with the hook config as payload. '
    '''webhook'' — makes an HTTP call to the URL in handler_config.url.';


-- =============================================================================
-- §8  control.lifecycle_timer_policy — timer escalation rule sets
-- =============================================================================
-- Named policy containing an array of timer rules.
-- L07: UNIQUE(tenant_id, code) added.
-- L15: rules CHECK(jsonb_typeof='array') added.
-- Attached to lifecycle states via config (state.config.timer_policy_code).

CREATE TABLE IF NOT EXISTS control.lifecycle_timer_policy (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid,

    -- Policy identity
    code            text        NOT NULL,
    name            text        NOT NULL,
    description     text,

    -- Rules array
    -- Each rule: {after_minutes: N, action: 'escalate'|'notify'|'auto_transition'|'auto_cancel',
    --             notify_roles: [...], transition_to: 'state_code', message_template_key: '...'}
    rules           jsonb       NOT NULL,

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT ltp_pkey         PRIMARY KEY (id),
    -- L07: prevent duplicate codes per tenant
    CONSTRAINT ltp_code_uq      UNIQUE NULLS NOT DISTINCT (tenant_id, code),
    CONSTRAINT ltp_code_chk     CHECK (btrim(code) <> ''),
    CONSTRAINT ltp_name_chk     CHECK (btrim(name) <> ''),
    -- L15: rules must be a JSON array
    CONSTRAINT ltp_rules_chk    CHECK (jsonb_typeof(rules) = 'array')
);

COMMENT ON TABLE  control.lifecycle_timer_policy IS
    'Named escalation timer rule sets. Attached to lifecycle states via '
    'lifecycle_state.config.timer_policy_code. '
    'rules: array of {after_minutes, action, notify_roles, transition_to, '
    'message_template_key}. '
    'Replaces control.lifecycle_timer_policy (backup). '
    'L07: UNIQUE(tenant_id, code) added. L15: rules jsonb_typeof=array enforced.';
COMMENT ON COLUMN control.lifecycle_timer_policy.rules IS
    'Array of timer rules. Each element: '
    '{after_minutes: integer (required), '
    ' action: escalate|notify|auto_transition|auto_cancel (required), '
    ' notify_roles: [''manager'',''owner''] (optional), '
    ' transition_to: ''state_code'' (required for auto_transition), '
    ' message_template_key: ''approval_overdue'' (optional)}.';



-- ============================================================================
-- WORKFLOW ENGINE — control.* tables (§1-§5)
-- ============================================================================
-- =============================================================================
-- §1  control.workflow_definition — when is a workflow required?
-- =============================================================================
-- Policy table. Evaluated when an entity attempts a transition to determine
-- whether a workflow must complete before the transition is allowed.
-- Linked to lifecycle_transition_gate.workflow_definition_id (FK added in
-- 06_constraints/015_workflow.sql).
-- rules jsonb: array of {condition, template_code, workflow_type} objects —
--   first matching condition wins. NULL condition = always applies.
-- A04: partial UNIQUE prevents two open-ended active definitions per entity_type.

CREATE TABLE IF NOT EXISTS control.workflow_definition (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,

    -- Definition identity
    code            text        NOT NULL,
    name            text        NOT NULL,
    description     text,

    -- Scope
    entity_type     text        NOT NULL,

    -- Policy rules (evaluated in array order — first match wins)
    -- [{condition: {jsonlogic expr}, template_code: 'high_value',
    --   workflow_type: 'approval', priority: 10}]
    rules           jsonb       NOT NULL DEFAULT '[]',

    -- Temporal window
    effective_from  timestamptz NOT NULL DEFAULT now(),
    effective_to    timestamptz,

    -- Lifecycle
    is_active       boolean     NOT NULL DEFAULT true,

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT wdef_pkey            PRIMARY KEY (id),
    CONSTRAINT wdef_tenant_id_uq    UNIQUE (tenant_id, id),
    -- A03: unique code per tenant
    CONSTRAINT wdef_code_uq         UNIQUE (tenant_id, code),
    CONSTRAINT wdef_code_chk        CHECK (btrim(code) <> ''),
    CONSTRAINT wdef_entity_chk      CHECK (btrim(entity_type) <> ''),
    -- A09: effective window must be valid
    CONSTRAINT wdef_effective_chk   CHECK (
        effective_to IS NULL OR effective_to > effective_from
    ),
    -- A04: one open-ended active definition per entity_type per tenant
    -- Enforced by partial unique index (see 07_indexes)
    CONSTRAINT wdef_rules_chk       CHECK (jsonb_typeof(rules) = 'array')
);

COMMENT ON TABLE  control.workflow_definition IS
    'Policy: when is a workflow required for an entity? '
    'rules jsonb array: [{condition: jsonlogic, template_code, workflow_type}]. '
    'First match wins. NULL condition = always applies. '
    'Linked to control.lifecycle_transition_gate.workflow_definition_id. '
    'Replaces control.approval_definition (backup).';
COMMENT ON COLUMN control.workflow_definition.rules IS
    'Array of policy rules. Each: '
    '{condition: {jsonlogic expression against entity payload — null=always}, '
    ' template_code: workflow_template.code, '
    ' workflow_type: lookup work_request.workflow_type, '
    ' priority: integer — lower fires first}.';


-- =============================================================================
-- §2  control.workflow_template — how does the workflow run?
-- =============================================================================
-- Versioned workflow blueprint. tenant_id=NULL = platform-global template.
-- compiled_json snapshots all stages + rules at version time (same pattern
-- as snapshot.lifecycle_version).
-- A03: UNIQUE(tenant_id, code) NULLS NOT DISTINCT.
-- A10: trg_fn_template_child_changed nulls compiled_hash on child row change.

CREATE TABLE IF NOT EXISTS control.workflow_template (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid,                               -- NULL = platform-global

    -- Template identity
    code            text        NOT NULL,
    name            text        NOT NULL,
    description     text,

    -- Workflow behaviour switches
    -- {allow_self_approval: false, require_all_stages: true,
    --  allow_reassignment: true, capture_entity_snapshot: true,
    --  require_reason_on_reject: true, notify_requester: true,
    --  early_reject_on_quorum_fail: true}
    behaviors       jsonb       NOT NULL DEFAULT '{}',

    -- SLA policy (optional — overrides per-stage defaults)
    sla_policy_id   uuid,

    -- Versioning + compilation (same pattern as control.lifecycle)
    version_no      integer     NOT NULL DEFAULT 1,
    compiled_json   jsonb,
    compiled_hash   text,

    -- Lifecycle
    is_active       boolean     NOT NULL DEFAULT true,

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT wtpl_pkey            PRIMARY KEY (id),
    CONSTRAINT wtpl_tenant_id_uq    UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    -- A03: unique code per tenant (NULL = platform global)
    CONSTRAINT wtpl_code_uq         UNIQUE NULLS NOT DISTINCT (tenant_id, code),
    CONSTRAINT wtpl_code_chk        CHECK (btrim(code) <> ''),
    CONSTRAINT wtpl_version_chk     CHECK (version_no >= 1),
    CONSTRAINT wtpl_behaviors_chk   CHECK (jsonb_typeof(behaviors) = 'object'),
    -- A10: compiled_hash format when set
    CONSTRAINT wtpl_hash_fmt_chk    CHECK (
        compiled_hash IS NULL OR length(compiled_hash) >= 64
    )
);

COMMENT ON TABLE  control.workflow_template IS
    'Workflow blueprint. tenant_id=NULL = platform-global template. '
    'Defines stages, assignee rules, and behaviour switches. '
    'compiled_json: denormalised stages + rules snapshot (version-pinned at workflow_request creation). '
    'compiled_hash: nulled by trg_fn_template_child_changed when stages/rules change. '
    'Replaces control.approval_template (backup).';
COMMENT ON COLUMN control.workflow_template.behaviors IS
    'Workflow behaviour flags: '
    '{allow_self_approval: bool, require_all_stages: bool, '
    ' allow_reassignment: bool, capture_entity_snapshot: bool, '
    ' require_reason_on_reject: bool, notify_requester: bool, '
    ' early_reject_on_quorum_fail: bool}.';
COMMENT ON COLUMN control.workflow_template.compiled_json IS
    'Full denormalised snapshot of template + all stages + all rules. '
    'Consumed at workflow_request creation to version-pin the workflow. '
    'Structure: {stages:[{stage_no,name,mode,quorum,sla_policy_id,rules:[...]}], behaviors:{...}}.';


-- =============================================================================
-- §3  control.workflow_template_stage — stage definitions
-- =============================================================================
-- One row per stage in a template.
-- A01: UNIQUE(template_id, stage_no) — no duplicate stage numbers.
-- quorum jsonb: {strategy: count|percent|unanimous, required: N}
-- NULL quorum = unanimous (every work_item must complete positively).
-- sla_policy_id per stage overrides the template-level SLA.

CREATE TABLE IF NOT EXISTS control.workflow_template_stage (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid,
    workflow_template_id    uuid        NOT NULL,

    -- Stage definition
    stage_no                smallint    NOT NULL,
    name                    text,
    description             text,

    -- Execution mode
    mode                    text        NOT NULL DEFAULT 'serial',

    -- Quorum rule
    -- {strategy: 'count'|'percent'|'unanimous', required: N}
    -- NULL = unanimous (all work_items must complete positively)
    quorum                  jsonb,

    -- SLA override for this stage
    sla_policy_id           uuid,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT wts_pkey             PRIMARY KEY (id),
    -- A01: no duplicate stage numbers in one template
    CONSTRAINT wts_stage_no_uq      UNIQUE (workflow_template_id, stage_no),
    CONSTRAINT wts_stage_no_chk     CHECK (stage_no > 0),
    CONSTRAINT wts_mode_chk         CHECK (mode IN ('serial', 'parallel')),
    CONSTRAINT wts_quorum_chk       CHECK (
        quorum IS NULL OR (
            jsonb_typeof(quorum) = 'object'
            AND quorum ? 'strategy'
            AND (quorum->>'strategy') IN ('count', 'percent', 'unanimous')
        )
    )
);

COMMENT ON TABLE  control.workflow_template_stage IS
    'Stage definition within a workflow template. '
    'A01: UNIQUE(workflow_template_id, stage_no). '
    'mode: serial (one work_item at a time) | parallel (all assigned at once). '
    'quorum: {strategy: count|percent|unanimous, required: N}. '
    'NULL quorum = unanimous. Replaces control.approval_template_stage (backup).';
COMMENT ON COLUMN control.workflow_template_stage.quorum IS
    'Quorum rule for this stage. '
    '{strategy: ''count'', required: 2} = any 2 assignees must complete positively. '
    '{strategy: ''percent'', required: 50} = majority must complete positively. '
    '{strategy: ''unanimous''} or NULL = all assignees must complete positively. '
    'Captured into document.workflow_stage.quorum at runtime (A06 — version-pinned).';


-- =============================================================================
-- §4  control.workflow_template_rule — assignee resolution rules
-- =============================================================================
-- Priority-ordered rules determining who gets assigned a work_item.
-- First rule whose conditions match the entity payload wins.
-- A02: UNIQUE(template_id, priority) — no ambiguous ordering.
-- assign_to jsonb: {type, value} — supports principal/role/team/ou/requester_manager.

CREATE TABLE IF NOT EXISTS control.workflow_template_rule (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid,
    workflow_template_id    uuid        NOT NULL,

    -- Ordering (lower = higher priority)
    stage_no                smallint,           -- NULL = applies to all stages
    priority                smallint    NOT NULL DEFAULT 100,

    -- Condition (JSONLogic against entity payload — NULL = always matches)
    conditions              jsonb,

    -- Assignment target
    -- {type: principal|role|team|ou|requester_manager|group, value: uuid|code}
    assign_to               jsonb       NOT NULL,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT wtr_pkey             PRIMARY KEY (id),
    -- A02: no two rules with same priority in same template+stage
    CONSTRAINT wtr_priority_uq      UNIQUE NULLS NOT DISTINCT (workflow_template_id, stage_no, priority),
    CONSTRAINT wtr_priority_chk     CHECK (priority > 0),
    CONSTRAINT wtr_conditions_chk   CHECK (
        conditions IS NULL OR jsonb_typeof(conditions) = 'object'
    ),
    CONSTRAINT wtr_assign_to_chk    CHECK (
        jsonb_typeof(assign_to) = 'object'
        AND assign_to ? 'type'
    )
);

COMMENT ON TABLE  control.workflow_template_rule IS
    'Assignee resolution rules. Priority-ordered — first matching rule wins. '
    'stage_no=NULL means rule applies to all stages in the template. '
    'A02: UNIQUE(template_id, stage_no, priority) — no ordering ambiguity. '
    'assign_to types: principal (uuid), role (code), team (code), '
    'ou (uuid — any member), requester_manager (dynamic). '
    'Replaces control.approval_template_rule (backup). '
    'P2-FIX: updated_at/updated_by added — rules are reordered and conditions edited.';
COMMENT ON COLUMN control.workflow_template_rule.assign_to IS
    'Assignment target. Examples: '
    '{type: ''principal'', value: ''uuid''}, '
    '{type: ''role'', value: ''finance_manager''}, '
    '{type: ''team'', value: ''approvals_team''}, '
    '{type: ''ou'', value: ''uuid'', level: 2}, '
    '{type: ''requester_manager''}.';


-- =============================================================================
-- §5  control.workflow_sla_policy — timer + escalation chain
-- =============================================================================
-- Defines what happens when time passes without a work_item decision.
-- A05: UNIQUE(tenant_id, code) NULLS NOT DISTINCT.
-- timers jsonb: array of escalation rules keyed by time threshold.
-- escalation_chain jsonb: ordered list of escalation targets.

CREATE TABLE IF NOT EXISTS control.workflow_sla_policy (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid,                               -- NULL = platform-global

    -- Policy identity
    code            text        NOT NULL,
    name            text        NOT NULL,
    description     text,

    -- Timer rules
    -- [{after_minutes: N, action: reminder|escalate|auto_approve|auto_reject,
    --   notify_roles: [...], message_template_key: '...'}]
    timers          jsonb       NOT NULL DEFAULT '[]',

    -- Escalation chain (ordered targets when action=escalate)
    -- [{type: requester_manager|role|principal, value: code|uuid, notify: bool}]
    escalation_chain jsonb      NOT NULL DEFAULT '[]',

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT wsla_pkey            PRIMARY KEY (id),
    -- A05: unique code per tenant
    CONSTRAINT wsla_code_uq         UNIQUE NULLS NOT DISTINCT (tenant_id, code),
    CONSTRAINT wsla_code_chk        CHECK (btrim(code) <> ''),
    CONSTRAINT wsla_timers_chk      CHECK (jsonb_typeof(timers) = 'array'),
    CONSTRAINT wsla_chain_chk       CHECK (jsonb_typeof(escalation_chain) = 'array')
);

COMMENT ON TABLE  control.workflow_sla_policy IS
    'SLA timer and escalation chain for workflow stages. '
    'tenant_id=NULL = platform-global control. '
    'timers: [{after_minutes, action: reminder|escalate|auto_approve|auto_reject, '
    'notify_roles, message_template_key}]. '
    'escalation_chain: ordered escalation targets when action=escalate. '
    'Replaces control.approval_sla_policy (backup). A05: UNIQUE(tenant_id, code).';
COMMENT ON COLUMN control.workflow_sla_policy.timers IS
    'Ordered timer rules. Each: '
    '{after_minutes: integer (from work_item.assigned_at or stage.started_at), '
    ' action: reminder|escalate|auto_approve|auto_reject, '
    ' notify_roles: [role_code,...], '
    ' message_template_key: notification.template key}.';

-- =============================================================================
-- §6  control.policy_definition — when and how a policy fires
-- =============================================================================
-- A policy groups an ordered set of rules evaluated against an entity payload.
-- tenant_id NULL = platform-global (applies to all tenants).
-- module_id scopes the policy to a specific system module (FK → shared.module).
-- evaluation_mode controls whether the engine stops at first match or accumulates
-- all matching rule outcomes.
-- version_no is bumped on every write so callers can detect stale caches.
--
-- Evaluation modes:
--   first_match  — stop at the first matching rule (ordered by priority ASC)
--   accumulate   — run all rules, merge actions (highest-priority wins per action)
--   all          — run all rules, collect all outcomes

CREATE TABLE IF NOT EXISTS control.policy_definition (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid,                               -- NULL = platform-global

    -- Scope
    module_id       uuid,                               -- FK → shared.module; NULL = cross-module
    entity_type     text        NOT NULL,               -- e.g. 'journal_entry', 'payment'

    -- Policy identity
    name            text        NOT NULL,
    description     text,
    priority        smallint    NOT NULL DEFAULT 100,   -- lower = evaluated first

    -- Evaluation
    evaluation_mode text        NOT NULL DEFAULT 'first_match',

    -- Temporal window
    effective_from  date        NOT NULL DEFAULT CURRENT_DATE,
    effective_until date,                               -- NULL = indefinitely active

    -- Versioning
    version_no      integer     NOT NULL DEFAULT 1,

    -- Lifecycle
    status          text        NOT NULL DEFAULT 'active',
    is_active       boolean     GENERATED ALWAYS AS (status = 'active') STORED,

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT pdef_pkey                PRIMARY KEY (id),
    CONSTRAINT pdef_name_nonempty       CHECK (btrim(name) <> ''),
    CONSTRAINT pdef_entity_type_nonempty CHECK (btrim(entity_type) <> ''),
    CONSTRAINT pdef_priority_pos        CHECK (priority > 0),
    CONSTRAINT pdef_version_pos         CHECK (version_no > 0),
    CONSTRAINT pdef_eval_mode_chk       CHECK (evaluation_mode IN ('first_match', 'accumulate', 'all')),
    CONSTRAINT pdef_status_chk          CHECK (status IN ('active', 'inactive', 'deprecated')),
    CONSTRAINT pdef_effective_order_chk CHECK (effective_until IS NULL OR effective_until > effective_from)
);

COMMENT ON TABLE control.policy_definition IS
    'Policy & Rules Engine: top-level policy container. '
    'tenant_id=NULL = platform-global. '
    'evaluation_mode: first_match (stop at first hit) | accumulate (merge all) | all (collect all outcomes). '
    'version_no bumped on every update so consumers can detect stale cached copies.';
COMMENT ON COLUMN control.policy_definition.module_id IS
    'FK → shared.module. Scopes the policy to a module (finance, procurement, …). '
    'NULL = cross-module / universal policy. '
    'Logged in log.policy_evaluation_log.module_id.';
COMMENT ON COLUMN control.policy_definition.priority IS
    'Evaluation order across definitions for the same entity_type. '
    'Lower value = evaluated first. Used when multiple definitions match.';


-- =============================================================================
-- §7  control.policy_rule — individual rule within a policy
-- =============================================================================
-- Each rule has a JSONLogic condition evaluated against the entity payload.
-- When condition matches the rule action is returned to the caller.
--
-- Actions:
--   allow            — explicitly permit the operation
--   deny             — block the operation (highest precedence)
--   warn             — allow but surface advisory to the user
--   require_workflow — block and route to workflow engine
--   escalate         — alert a supervisor without blocking
--
-- score + confidence are 0.0–1.0 fractions stored as numeric(5,4).
-- approvers / sla_hours are only meaningful for require_workflow action.

CREATE TABLE IF NOT EXISTS control.policy_rule (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    policy_id       uuid        NOT NULL,               -- FK → control.policy_definition

    -- Ordering
    priority        smallint    NOT NULL DEFAULT 10,    -- lower = evaluated first within policy

    -- Condition (JSONLogic — null = always matches)
    conditions      jsonb,

    -- Outcome
    action          text        NOT NULL,
    score           numeric(5,4),                       -- 0.0–1.0 risk/relevance score
    confidence      numeric(5,4),                       -- 0.0–1.0 model confidence
    explanation     text,                               -- human-readable rationale

    -- Workflow hints (populated when action = 'require_workflow')
    approvers       jsonb,                              -- [{type, value}] override approvers
    sla_hours       smallint,                           -- override SLA for triggered workflow

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT prule_pkey               PRIMARY KEY (id),
    CONSTRAINT prule_priority_pos       CHECK (priority > 0),
    CONSTRAINT prule_action_chk         CHECK (action IN ('allow', 'deny', 'warn', 'require_workflow', 'escalate')),
    CONSTRAINT prule_score_chk          CHECK (score IS NULL OR score BETWEEN 0 AND 1),
    CONSTRAINT prule_confidence_chk     CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
    CONSTRAINT prule_sla_pos            CHECK (sla_hours IS NULL OR sla_hours > 0),
    CONSTRAINT prule_approvers_chk      CHECK (approvers IS NULL OR jsonb_typeof(approvers) = 'array'),
    CONSTRAINT prule_priority_uq        UNIQUE (policy_id, priority)
);

COMMENT ON TABLE control.policy_rule IS
    'Individual rule within a policy_definition. '
    'conditions: JSONLogic expression evaluated against entity payload (null = always matches). '
    'action: allow | deny | warn | require_workflow | escalate. '
    'score/confidence are 0.0–1.0 fractions. '
    'approvers/sla_hours used when action=require_workflow to override workflow template defaults.';
COMMENT ON COLUMN control.policy_rule.conditions IS
    'JSONLogic expression. Evaluated with the full entity payload as data context. '
    'null = unconditional match (use with low priority as a catch-all).';
COMMENT ON COLUMN control.policy_rule.approvers IS
    'Approver override list for require_workflow action. '
    'Format: [{type: principal|role|team, value: uuid|code}]. '
    'Passed as overrideApprovers to WorkflowEngine.createRequest().';


-- =============================================================================
-- 04_tables/016_entity_engine.sql
-- Entity Engine — Metadata Registry
-- 16 tables: control.* (14) · snapshot.* (2)
-- =============================================================================
-- Depends on:
--   04_tables/001_shared.sql     — shared.uuidv7, shared.permission, shared.permission_category
--   04_tables/002_control.sql    — control.lookup_domain, control.lookup_value
--   04_tables/003_master.sql     — master.tenant, master.principal
--   04_tables/014_lifecycle.sql  — control.lifecycle
--
-- ELIMINATIONS vs backup (13 tables removed):
--   entity_extension        → control.entity ownership_model='tenant'
--   field_extension         → control.entity_field origin='business'
--   entity_field_flag_std   → entity_class_profile.field_flag_rules jsonb
--   entity_canonical_field  → entity_field entity_version_id IS NULL
--   security_tier_profile   → entity_class_profile.security_tiers jsonb
--   audit_policy            → entity_class_profile.compliance_profile.audit_rules
--   enum_set                → control.lookup_domain (tenant-scoped)
--   canonical_status_mapping→ control.lookup_domain 'canonical_status.<doc_type>'
--   operation               → shared.permission.metadata
--   engine                  → control.entity.engine_tag (free-text annotation)
--   index_def               → control.entity.composite_indexes jsonb
--   association.relation    → control.entity_relation (schema moved + renamed)
--   association.overlay_change→ control.overlay_change (schema moved)
--
-- NAMING CONVENTION (tenant custom entities/fields):
--   Table:  document.t_<tenant_short>_<entity_code>
--   Field:  cus_<field_name>   (physical column prefix for custom fields)
--
-- LOOKUP DOMAINS created in 900_seed_data/002_control/005_entity_engine_lookups.sql:
--   entity.ownership_model   → system|tenant|package|overlay
--   entity.entity_class      → REFERENCE|MASTER|CONTROL|DOCUMENT|...
--   entity.backing_type      → table|view|materialized_view|...
--   entity.governance_level  → full|light|audit_only|none
--   entity.security_tier     → platform_critical|tenant_critical|operational|config
--   entity.mutability        → locked|controlled|extensible
--   entity_field.data_type   → string|text|integer|decimal|boolean|uuid|...
--   entity_field.origin      → system|standard|business
--   entity_field.cardinality → one|many|zero_or_one
--   overlay_change.kind      → addField|removeField|modifyField|...
--   entity_relation.kind     → belongs_to|has_many|m2m
--
-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │  TABLE INDEX                                                              │
-- │                                                                           │
-- │  GOVERNANCE PROFILES                                                      │
-- │   §1   control.entity_class_profile   Class rules + field flags + tiers  │
-- │                                                                           │
-- │  CORE REGISTRY                                                            │
-- │   §2   control.entity                 Every registered entity/table      │
-- │   §3   control.entity_publish_state   Compile/publish tracking           │
-- │   §4   control.entity_version         Version lifecycle                  │
-- │                                                                           │
-- │  FIELD SYSTEM                                                             │
-- │   §5   control.entity_field           All fields (canonical+versioned)   │
-- │   §6   control.field_group            UI field groupings                 │
-- │   §7   control.field_group_member     Group memberships                  │
-- │   §8   control.field_security_policy  PII/masking policies               │
-- │                                                                           │
-- │  OVERLAY SYSTEM                                                           │
-- │   §9   control.overlay                Tenant customisation sets          │
-- │   §10  control.overlay_change         Individual overlay operations      │
-- │                                                                           │
-- │  ENTITY BINDINGS                                                          │
-- │   §11  control.entity_lifecycle       Lifecycle bindings per entity      │
-- │   §12  control.entity_operation       Operation registrations            │
-- │   §13  control.entity_policy          Access/audit/retention per entity  │
-- │   §14  control.entity_relation        FK/join declarations               │
-- │                                                                           │
-- │  COMPILED LAYER (snapshot.*)                                              │
-- │   §15  snapshot.entity_compiled       Compiled JSON for runtime          │
-- │   §16  snapshot.entity_compiled_overlay  Overlay delta compiled          │
-- └───────────────────────────────────────────────────────────────────────────┘


-- =============================================================================
-- §1  control.entity_class_profile
-- =============================================================================
-- Platform-global governance rules per entity class. No tenant_id — these are
-- immutable constants seeded at install time.
-- Absorbs:
--   control.entity_field_flag_standard → field_flag_rules jsonb
--   control.security_tier_profile      → security_tiers jsonb
--   control.audit_policy               → compliance_profile.audit_rules

CREATE TABLE IF NOT EXISTS control.entity_class_profile (
    -- Identity (natural PK — 10 fixed class values, no UUID needed)
    class_key                   text        NOT NULL,

    -- Labels
    label                       text        NOT NULL,
    description                 text        NOT NULL,

    -- Governance rules for this class
    valid_governance_levels     text[]      NOT NULL,
    default_governance_level    text        NOT NULL DEFAULT 'full',
    valid_mutability            text[]      NOT NULL
                                DEFAULT ARRAY['locked','controlled','extensible'],
    default_mutability          text        NOT NULL DEFAULT 'controlled',
    default_security_tier       text        NOT NULL DEFAULT 'config',

    -- System columns every entity of this class must have
    expected_system_columns     text[]      NOT NULL DEFAULT '{}',

    -- —— Absorbed from entity_field_flag_standard ————————————————————————
    -- Pattern-matching rules for auto-setting field flags on INSERT.
    -- Evaluated by trg_fn_field_flag_defaults BEFORE INSERT on entity_field.
    -- Structure: [{match_mode, pattern, priority, is_searchable, is_filterable,
    --              is_sortable, is_groupable, is_aggregatable, cardinality}]
    -- match_mode values: name (exact or LIKE), data_type, origin, format
    -- Class-specific rules take precedence over wildcard class_key='*'.
    field_flag_rules            jsonb       NOT NULL DEFAULT '[]',

    -- —— Absorbed from security_tier_profile ———————————————————————————
    -- Per-tier security requirements, keyed by tier_key.
    -- {platform_critical: {min_governance, is_created_by_required,
    --   is_updated_by_required, is_change_reason_required,
    --   is_change_approval_required, is_audit_on_read},
    --  tenant_critical: {...}, operational: {...}, config: {...}}
    security_tiers              jsonb       NOT NULL DEFAULT '{}',

    -- —— Absorbed from audit_policy ——————————————————————————————————
    -- Audit disposition rules embedded inside compliance_profile.
    -- {linting_rules: [...], required_field_patterns: [...],
    --  audit_rules: {default_disposition: 'required',
    --    by_category: {field_access: {disposition: 'sampled', sample_rate: 0.1},
    --                  data_export:  {disposition: 'required', sample_rate: 1.0}}}}
    compliance_profile          jsonb       NOT NULL DEFAULT '{}',

    -- Display
    sort_order                  smallint    NOT NULL DEFAULT 0,

    CONSTRAINT ecp_pkey                 PRIMARY KEY (class_key),
    CONSTRAINT ecp_class_key_chk        CHECK (class_key = ANY (ARRAY[
        'REFERENCE','MASTER','CONTROL','DOCUMENT','DOCUMENT_RELATION',
        'LEDGER','LOG','AGGREGATE','DIMENSION','RELATION','*'
    ])),
    CONSTRAINT ecp_default_gov_chk      CHECK (
        default_governance_level = ANY (valid_governance_levels)
    ),
    CONSTRAINT ecp_default_tier_chk     CHECK (
        default_security_tier = ANY (ARRAY[
            'platform_critical','tenant_critical','operational','config'
        ])
    ),
    CONSTRAINT ecp_field_flag_rules_chk CHECK (jsonb_typeof(field_flag_rules) = 'array'),
    CONSTRAINT ecp_security_tiers_chk   CHECK (jsonb_typeof(security_tiers) = 'object'),
    CONSTRAINT ecp_compliance_chk       CHECK (jsonb_typeof(compliance_profile) = 'object')
);

COMMENT ON TABLE  control.entity_class_profile IS
    'Platform-global governance rules per entity class. Immutable — seeded at install. '
    'Absorbs entity_field_flag_standard (field_flag_rules), '
    'security_tier_profile (security_tiers), '
    'audit_policy (compliance_profile.audit_rules). '
    'No tenant_id — these are platform constants.';
COMMENT ON COLUMN control.entity_class_profile.field_flag_rules IS
    'Pattern rules for auto-setting field behaviour flags on INSERT into entity_field. '
    'Evaluated by trg_fn_field_flag_defaults. '
    'Each rule: {match_mode: name|data_type|origin|format, '
    'pattern: text (exact or LIKE with % wildcard), '
    'priority: smallint (lower fires first), '
    'is_searchable, is_filterable, is_sortable, is_groupable, is_aggregatable: bool|null, '
    'cardinality: one|many|zero_or_one|null}. '
    'class_key=''*'' = wildcard (applies to all classes, lower priority than class-specific).';
COMMENT ON COLUMN control.entity_class_profile.security_tiers IS
    'Per-tier security requirements. Keyed by tier_key. '
    '{platform_critical: {min_governance: ''full'', is_created_by_required: true, '
    'is_updated_by_required: true, is_change_reason_required: true, '
    'is_change_approval_required: true, is_audit_on_read: true}, ...}';
COMMENT ON COLUMN control.entity_class_profile.compliance_profile IS
    'Linting rules, required field patterns, and audit disposition rules. '
    '{linting_rules: [...], required_field_patterns: [...], '
    'audit_rules: {default_disposition: required|sampled|disabled, '
    'by_category: {event_category: {disposition, sample_rate}}}}. '
    'Tenant entity-level overrides via entity_policy.audit_mode.';


-- =============================================================================
-- §2  control.entity
-- =============================================================================
-- Central registry of every table/view in the platform.
-- ownership_model discriminator:
--   system  → platform entities (document.invoice, master.principal)
--   tenant  → custom entities (document.t_<short>_<code>)  [naming enforced by CHECK]
--   package → installed module entities
--   overlay → overlay-derived entities (no physical table)
-- Absorbs:
--   control.entity_extension   → ownership_model='tenant' rows
--   control.index_def          → composite_indexes jsonb column
--   control.engine             → engine_tag free-text annotation

CREATE TABLE IF NOT EXISTS control.entity (
    -- Identity
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid,                   -- NULL = platform entity

    -- Module
    module_id                   text        NOT NULL,

    -- Naming
    name                        text        NOT NULL,
    slug                        text,
    entity_short                text,

    -- Classification (all lookup-validated by triggers)
    entity_class                text        NOT NULL DEFAULT 'MASTER',
    ownership_model             text        NOT NULL DEFAULT 'system',
    kind                        text        NOT NULL DEFAULT 'ent',
    backing_type                text        NOT NULL DEFAULT 'table',

    -- Governance
    governance_level            text        NOT NULL DEFAULT 'full',
    security_tier               text        NOT NULL DEFAULT 'config',
    mutability                  text        NOT NULL DEFAULT 'controlled',
    mapping_mode                text        NOT NULL DEFAULT 'exclusive',
    engine_tag                  text,                   -- free-text processing engine hint

    -- Physical location
    table_schema                text        NOT NULL DEFAULT 'master',
    table_name                  text        NOT NULL,

    -- Labels + UI
    label_singular              text,
    label_plural                text,
    description                 text,
    icon_key                    text,
    color_token                 text,
    display_config              jsonb       NOT NULL DEFAULT '{}',
    feature_flags               jsonb       NOT NULL DEFAULT '{}',

    -- Policy config
    data_policy                 jsonb       NOT NULL DEFAULT '{}',
    naming_policy               jsonb       NOT NULL DEFAULT '{}',
    identity_config             jsonb       NOT NULL DEFAULT '{}',
    search_config               jsonb       NOT NULL DEFAULT '{}',
    numbering_active            boolean     NOT NULL DEFAULT true,

    -- —— Absorbed from index_def ———————————————————————————————————
    -- Custom composite index declarations. Single-field indexes are auto-derived
    -- from entity_field flags (is_filterable, is_searchable, is_unique) at compile.
    -- [{name, is_unique, method: btree|gin|gist|hash, columns: [col,...],
    --   where_clause: 'status = ''ACTIVE'''}]
    composite_indexes           jsonb       NOT NULL DEFAULT '[]',

    -- Discriminator (for shared backing tables)
    discriminator_column        text,
    discriminator_value         text,

    -- Natural key
    natural_key_fields          text[]      DEFAULT '{}',

    -- Partition
    is_partition_child          boolean     NOT NULL DEFAULT false,
    partition_parent_id         uuid,
    partition_key               text,
    partition_config            jsonb       NOT NULL DEFAULT '{}',

    -- External source (virtual/external entities)
    external_source_config      jsonb       NOT NULL DEFAULT '{}',

    -- —— Absorbed from entity_extension ———————————————————————————————
    -- Populated only for ownership_model='tenant' after provision_tenant_extensions() runs.
    provisioned_at              timestamptz,
    provisioned_by              uuid,

    -- Publish pointer (fast join to entity_publish_state)
    publish_state_id            uuid,

    -- Status
    status                      text        NOT NULL DEFAULT 'DRAFT',
    is_active                   boolean     GENERATED ALWAYS AS (
                                    status = ANY (ARRAY['ACTIVE','DEPRECATED'])
                                ) STORED,
    status_changed_at           timestamptz,
    status_changed_by           uuid,

    -- Audit
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT entity_pkey              PRIMARY KEY (id),
    CONSTRAINT entity_tenant_id_uq      UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    -- Physical uniqueness: no two tables in same schema with same name
    CONSTRAINT entity_physical_uq       UNIQUE (table_schema, table_name),
    CONSTRAINT entity_slug_fmt_chk      CHECK (
        slug IS NULL OR slug ~ '^[a-z][a-z0-9]+(-[a-z0-9]+)*$'
    ),
    CONSTRAINT entity_short_fmt_chk     CHECK (
        entity_short IS NULL OR entity_short ~ '^[A-Z][A-Z0-9_]{1,11}$'
    ),
    CONSTRAINT entity_icon_fmt_chk      CHECK (
        icon_key IS NULL OR icon_key ~ '^[a-z][a-z0-9-]*$'
    ),
    CONSTRAINT entity_color_fmt_chk     CHECK (
        color_token IS NULL OR color_token ~ '^[a-z][a-z0-9-]*$'
    ),
    -- Discriminator pair: both set or both NULL
    CONSTRAINT entity_discriminator_chk CHECK (
        (discriminator_column IS NULL) = (discriminator_value IS NULL)
    ),
    -- shared mapping requires discriminator
    CONSTRAINT entity_shared_disc_chk   CHECK (
        mapping_mode <> 'shared' OR discriminator_column IS NOT NULL
    ),
    -- Tenant entities MUST use document.* schema with t_<short>_<code> naming
    CONSTRAINT entity_tenant_naming_chk CHECK (
        ownership_model <> 'tenant'
        OR (
            table_schema = 'document'
            AND table_name ~ '^t_[a-z][a-z0-9_]{1,11}_[a-z][a-z0-9_]{1,60}$'
        )
    ),
    -- Partition child requires parent
    CONSTRAINT entity_partition_chk     CHECK (
        NOT is_partition_child OR partition_parent_id IS NOT NULL
    ),
    CONSTRAINT entity_status_chk        CHECK (status = ANY (ARRAY[
        'DRAFT','ACTIVE','DEPRECATED','SUSPENDED','ARCHIVED'
    ])),
    CONSTRAINT entity_mapping_mode_chk  CHECK (mapping_mode = ANY (ARRAY[
        'exclusive','shared','virtual','inherited'
    ])),
    CONSTRAINT entity_composite_idx_chk CHECK (jsonb_typeof(composite_indexes) = 'array'),
    CONSTRAINT entity_display_cfg_chk   CHECK (jsonb_typeof(display_config) = 'object'),
    CONSTRAINT entity_feature_flags_chk CHECK (jsonb_typeof(feature_flags) = 'object')
    -- entity_class, ownership_model, kind, backing_type, governance_level,
    -- security_tier, mutability: validated by triggers against lookup_domain
);

COMMENT ON TABLE  control.entity IS
    'Central registry of every table/view in the platform. '
    'ownership_model discriminator: system (platform), tenant (custom), package, overlay. '
    'Tenant tables: document.t_<tenant_short>_<entity_code> — enforced by CHECK. '
    'composite_indexes: replaces control.index_def (eliminated). '
    'provisioned_at/by: replaces control.entity_extension (eliminated). '
    'engine_tag: replaces control.engine (eliminated) — free-text annotation.';
COMMENT ON COLUMN control.entity.ownership_model IS
    'system   → platform entity (document.invoice, master.principal). '
    'tenant   → custom entity created by tenant (document.t_acme_purchase_order). '
    'package  → installed module entity. '
    'overlay  → overlay-derived virtual entity (no physical table).';
COMMENT ON COLUMN control.entity.composite_indexes IS
    'Custom composite index declarations. Single-field indexes auto-derived from '
    'entity_field flags at compile time. '
    'Each: {name: text, is_unique: bool, method: btree|gin|gist|hash, '
    'columns: [col_name,...], where_clause: optional partial filter}.';
COMMENT ON COLUMN control.entity.provisioned_at IS
    'Set when provision_tenant_extensions() executes CREATE TABLE for tenant entities. '
    'NULL = not yet provisioned (status=DRAFT). Only populated for ownership_model=tenant.';


-- =============================================================================
-- §3  control.entity_publish_state
-- =============================================================================
-- 1:1 companion to control.entity. Tracks compile and publish pointers.
-- Separated from entity to keep entity lean and avoid update contention
-- during frequent compile cycles.

CREATE TABLE IF NOT EXISTS control.entity_publish_state (
    -- Identity (entity_id is PK — 1:1)
    entity_id                   uuid        NOT NULL,
    tenant_id                   uuid,

    -- Version pointers
    published_version_id        uuid,       -- FK to control.entity_version (EFFECTIVE)
    current_draft_version_id    uuid,       -- FK to control.entity_version (DRAFT)
    latest_version_no           integer     NOT NULL DEFAULT 0,

    -- Compile tracking
    last_compiled_at            timestamptz,
    last_compiled_hash          text,
    last_schema_change_at       timestamptz,

    -- Provenance (how this entity came to exist: cloned, imported, generated)
    provenance                  jsonb       NOT NULL DEFAULT '{}',

    -- Status summary (compliance score, readiness flags)
    status_summary              jsonb       NOT NULL DEFAULT '{}',

    -- Audit
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT eps_pkey                 PRIMARY KEY (entity_id),
    CONSTRAINT eps_hash_fmt_chk         CHECK (
        last_compiled_hash IS NULL OR length(last_compiled_hash) >= 64
    ),
    CONSTRAINT eps_provenance_chk       CHECK (jsonb_typeof(provenance) = 'object'),
    CONSTRAINT eps_summary_chk          CHECK (jsonb_typeof(status_summary) = 'object')
);

COMMENT ON TABLE  control.entity_publish_state IS
    '1:1 companion to control.entity. Holds compile/publish tracking columns '
    'that were previously duplicated in entity (removed by this migration). '
    'Separated to avoid update contention during frequent compile cycles. '
    'Auto-created by trg_fn_ensure_entity_publish_state on entity INSERT.';


-- =============================================================================
-- §4  control.entity_version
-- =============================================================================
-- Versioned snapshots of entity definitions.
-- Moved from snapshot.* to control.* — entity versions are actively managed
-- through a lifecycle (DRAFT → EFFECTIVE), not read-only snapshots.
-- entity_field rows belong to a specific version via entity_version_id.

CREATE TABLE IF NOT EXISTS control.entity_version (
    -- Identity
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid,
    entity_id                   uuid        NOT NULL,

    -- Version
    version_no                  integer     NOT NULL,
    version_hash                text,

    -- Status lifecycle
    status                      text        NOT NULL DEFAULT 'DRAFT',
    is_effective                boolean     GENERATED ALWAYS AS (
                                    status = 'EFFECTIVE'
                                ) STORED,

    -- Version metadata
    label                       text,
    change_summary              text,
    change_type                 text,
    is_working_copy             boolean     NOT NULL DEFAULT false,

    -- Version lineage
    derived_from_version_id     uuid,
    supersedes_version_id       uuid,

    -- Temporal validity
    effective_from              timestamptz,
    effective_to                timestamptz,

    -- Optimistic lock
    lock_version                integer     NOT NULL DEFAULT 0,

    -- Lifecycle binding
    lifecycle_instance_id       uuid,

    -- Behaviours jsonb (version-specific overrides of entity.display_config)
    behaviors                   jsonb       NOT NULL DEFAULT '{}',

    -- Audit
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT ev_pkey              PRIMARY KEY (id),
    CONSTRAINT ev_tenant_id_uq      UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT ev_version_no_uq     UNIQUE (entity_id, version_no),
    CONSTRAINT ev_version_no_chk    CHECK (version_no >= 1),
    CONSTRAINT ev_status_chk        CHECK (status = ANY (ARRAY[
        'DRAFT','IN_REVIEW','APPROVED','EFFECTIVE',
        'SUPERSEDED','ARCHIVED','REJECTED','WITHDRAWN'
    ])),
    CONSTRAINT ev_change_type_chk   CHECK (
        change_type IS NULL OR change_type = ANY (ARRAY[
            'structural','behavioral','governance','label','fix'
        ])
    ),
    CONSTRAINT ev_revision_reason_chk CHECK (
        version_no <= 1 OR change_type IS NOT NULL OR change_summary IS NOT NULL
    ),
    CONSTRAINT ev_effective_window_chk CHECK (
        effective_to IS NULL OR effective_to > effective_from
    ),
    CONSTRAINT ev_hash_fmt_chk      CHECK (
        version_hash IS NULL OR length(version_hash) >= 64
    ),
    CONSTRAINT ev_behaviors_chk     CHECK (jsonb_typeof(behaviors) = 'object')
);

COMMENT ON TABLE  control.entity_version IS
    'Versioned entity definitions. Moved from snapshot.* to control.* — '
    'versions are actively managed through DRAFT→EFFECTIVE lifecycle. '
    'entity_field rows (entity_version_id IS NOT NULL) belong to a specific version. '
    'entity_field rows (entity_version_id IS NULL) are canonical/standard fields. '
    'UNIQUE(entity_id, version_no) — no duplicate version numbers per entity.';


-- =============================================================================
-- §5  control.entity_field
-- =============================================================================
-- Every field in the platform. Three roles via discriminator columns:
--
--   entity_version_id IS NULL + origin IN ('system','standard')
--       = canonical field definition (global dictionary)
--       REPLACES control.entity_canonical_field
--
--   entity_version_id IS NOT NULL + any origin
--       = field on a specific entity version
--
--   entity_version_id IS NOT NULL + origin = 'business' + column_name ~ '^cus_'
--       = custom tenant field provisioned via ALTER TABLE ADD COLUMN
--       REPLACES control.field_extension
--
-- NOTE: Partial UNIQUE indexes for (name WHERE entity_version_id IS NULL)
--   and (entity_version_id, name WHERE entity_version_id IS NOT NULL)
--   are defined in 07_indexes/016_entity_engine.sql because PostgreSQL
--   does not support inline partial UNIQUE constraints in CREATE TABLE.

CREATE TABLE IF NOT EXISTS control.entity_field (
    -- Identity
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid,
    -- NULL for canonical/standard fields; NOT NULL for entity-version fields
    entity_version_id           uuid,

    -- Field identity
    name                        text        NOT NULL,
    column_name                 text        NOT NULL DEFAULT '',
    label                       text,
    description                 text,

    -- Data type (lookup-validated by trigger)
    data_type                   text        NOT NULL,
    ui_type                     text,
    format                      text,
    unit                        text,

    -- Cardinality + origin (lookup-validated by trigger)
    cardinality                 text        NOT NULL DEFAULT 'one',
    origin                      text        NOT NULL DEFAULT 'business',

    -- Behaviour flags (auto-set by trg_fn_field_flag_defaults from entity_class_profile)
    is_required                 boolean     NOT NULL DEFAULT false,
    is_unique                   boolean     NOT NULL DEFAULT false,
    unique_scope                text,
    is_searchable               boolean     NOT NULL DEFAULT false,
    is_filterable               boolean     NOT NULL DEFAULT false,
    is_sortable                 boolean     NOT NULL DEFAULT false,
    is_groupable                boolean     NOT NULL DEFAULT false,
    is_aggregatable             boolean     NOT NULL DEFAULT false,
    is_read_only                boolean     NOT NULL DEFAULT false,
    is_deprecated               boolean     NOT NULL DEFAULT false,
    is_computed                 boolean     NOT NULL DEFAULT false,
    is_write_once               boolean     NOT NULL DEFAULT false,
    is_active                   boolean     NOT NULL DEFAULT true,

    -- Compute
    compute_mode                text,
    compute_expr                jsonb,

    -- Type-specific configs
    enum_config                 jsonb,
    -- —— enum_set_code renamed to enum_domain_code (FK to lookup_domain) ——
    enum_domain_code            text,       -- FK: control.lookup_domain(code)
    enum_kind                   text,
    reference_config            jsonb,
    fk_target_entity_id         uuid,
    fk_target_field             text        DEFAULT 'id',
    fk_on_delete                text        DEFAULT 'restrict',
    fk_on_update                text        DEFAULT 'no_action',
    fk_relationship_class       text,
    json_config                 jsonb,
    money_config                jsonb,
    datetime_config             jsonb,

    -- UI
    ui_hint                     jsonb,
    visibility                  jsonb,
    editability                 jsonb,
    lookup_config               jsonb,
    lookup_profile              jsonb,

    -- Collection (cardinality=many)
    child_entity_name           text,
    child_fk_field              text,
    collection_behavior         jsonb,

    -- Validation
    validation                  jsonb,
    constraints                 jsonb,
    default_value               jsonb,

    -- —— Absorbed from field_extension ——————————————————————————————
    -- Populated for origin='business' after ALTER TABLE ADD COLUMN runs.
    provisioned_at              timestamptz,
    provisioned_by              uuid,

    -- Canonical field metadata (entity_version_id IS NULL rows)
    applies_to_classes          text[]      DEFAULT '{}',
    synonym_cluster             text,
    is_required_default         boolean     NOT NULL DEFAULT false,
    is_filterable_default       boolean     NOT NULL DEFAULT false,

    -- Ordering
    sort_order                  smallint    NOT NULL DEFAULT 0,

    -- Audit
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT ef_pkey                  PRIMARY KEY (id),
    -- NOTE: Partial UNIQUE indexes (ef_canonical_name_uidx, ef_version_name_uidx)
    -- are in 07_indexes/016_entity_engine.sql
    -- Canonical/standard fields must have no tenant_id
    CONSTRAINT ef_canonical_tenant_chk  CHECK (
        entity_version_id IS NOT NULL OR tenant_id IS NULL
    ),
    -- Custom fields must use cus_ prefix
    CONSTRAINT ef_custom_prefix_chk     CHECK (
        origin <> 'business'
        OR column_name = ''
        OR column_name ~ '^cus_[a-z][a-z0-9_]*$'
    ),
    -- column_name format
    CONSTRAINT ef_column_name_fmt_chk   CHECK (
        column_name = '' OR column_name ~ '^[a-z][a-z0-9_]*$'
    ),
    -- computed fields: must have compute_mode
    CONSTRAINT ef_computed_chk          CHECK (
        NOT is_computed OR compute_mode IS NOT NULL
    ),
    -- write_once and read_only are mutually exclusive
    CONSTRAINT ef_writeonce_readonly_chk CHECK (
        NOT (is_write_once AND is_read_only)
    ),
    -- computed and write_once are mutually exclusive
    CONSTRAINT ef_computed_writeonce_chk CHECK (
        NOT (is_computed AND is_write_once)
    ),
    -- enum: config XOR domain code (not both)
    CONSTRAINT ef_enum_xor_chk          CHECK (
        NOT (enum_config IS NOT NULL AND enum_domain_code IS NOT NULL)
    ),
    -- enum data_type requires config or domain code
    CONSTRAINT ef_enum_requires_chk     CHECK (
        data_type <> 'enum'
        OR enum_config IS NOT NULL
        OR enum_domain_code IS NOT NULL
    ),
    -- unique_scope requires is_unique
    CONSTRAINT ef_unique_scope_chk      CHECK (
        unique_scope IS NULL OR is_unique = true
    ),
    -- fk_on_delete values
    CONSTRAINT ef_fk_on_delete_chk      CHECK (
        fk_on_delete = ANY (ARRAY[
            'restrict','cascade','set_null','set_default','no_action'
        ])
    ),
    -- boolean naming convention
    CONSTRAINT ef_bool_naming_chk       CHECK (
        data_type <> 'boolean' OR name ~ '^(is_|has_|can_|allow_|enable_)'
    ),
    -- _id suffix → uuid data type
    CONSTRAINT ef_id_suffix_chk         CHECK (
        name NOT LIKE '%_id' OR data_type = ANY (ARRAY['uuid','reference','uuid[]'])
    ),
    CONSTRAINT ef_cardinality_chk       CHECK (
        cardinality = ANY (ARRAY['one','many','zero_or_one'])
    ),
    CONSTRAINT ef_origin_chk            CHECK (
        origin = ANY (ARRAY['system','standard','business'])
    ),
    CONSTRAINT ef_unique_scope_val_chk  CHECK (
        unique_scope IS NULL OR unique_scope = ANY (ARRAY[
            'global','tenant','entity_instance'
        ])
    )
);

COMMENT ON TABLE  control.entity_field IS
    'All fields in the platform — canonical, versioned, and custom. '
    'entity_version_id IS NULL: canonical/standard fields (replaces entity_canonical_field). '
    'entity_version_id IS NOT NULL: version-specific fields. '
    'origin=business + column_name~cus_: custom tenant fields (replaces field_extension). '
    'provisioned_at/by populated after ALTER TABLE ADD COLUMN for custom fields. '
    'enum_domain_code replaces enum_set_code (FK to control.lookup_domain).';


-- =============================================================================
-- §6  control.field_group
-- =============================================================================
-- Logical UI sections that group canonical fields together.
-- Renamed from control.entity_field_group.

CREATE TABLE IF NOT EXISTS control.field_group (
    -- Natural PK
    group_key                   text        NOT NULL,

    -- Labels
    label                       text        NOT NULL,
    description                 text,

    -- Which entity classes use this group
    applies_to_classes          text[]      NOT NULL DEFAULT '{}',

    -- Display
    sort_order                  smallint    NOT NULL DEFAULT 0,

    CONSTRAINT fg_pkey              PRIMARY KEY (group_key),
    CONSTRAINT fg_key_fmt_chk       CHECK (group_key ~ '^[a-z][a-z0-9_]*$'),
    CONSTRAINT fg_label_chk         CHECK (btrim(label) <> '')
);

COMMENT ON TABLE  control.field_group IS
    'Logical UI sections grouping canonical fields. '
    'Used by field_group_member to assign canonical fields to display sections. '
    'Renamed from control.entity_field_group.';


-- =============================================================================
-- §7  control.field_group_member
-- =============================================================================
-- Assigns canonical fields (entity_version_id IS NULL) to field groups.
-- Moved from association.* to control.*
-- field_name text FK replaced by entity_field_id uuid FK (cleaner).

CREATE TABLE IF NOT EXISTS control.field_group_member (
    -- Identity
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),

    -- References
    group_key                   text        NOT NULL,
    entity_field_id             uuid        NOT NULL, -- FK: entity_field WHERE entity_version_id IS NULL

    -- Ordering
    is_required                 boolean     NOT NULL DEFAULT false,
    sort_order                  smallint    NOT NULL DEFAULT 0,

    CONSTRAINT fgm_pkey             PRIMARY KEY (id),
    CONSTRAINT fgm_group_field_uq   UNIQUE (group_key, entity_field_id)
);

COMMENT ON TABLE  control.field_group_member IS
    'Assigns canonical entity_field rows (entity_version_id IS NULL) to field_group sections. '
    'entity_field_id replaces field_name text FK from backup — cleaner uuid reference. '
    'Moved from association.field_group_member to control.*.';


-- =============================================================================
-- §8  control.field_security_policy
-- =============================================================================
-- PII classification and field-level masking policies.

CREATE TABLE IF NOT EXISTS control.field_security_policy (
    -- Identity
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,

    -- Scope
    entity_id                   uuid        NOT NULL,
    field_path                  text        NOT NULL, -- e.g. 'tax_id' or 'address.line1'

    -- Policy
    policy_type                 text        NOT NULL,
    role_list                   text[]      DEFAULT '{}',
    abac_condition              jsonb,
    mask_strategy               text        NOT NULL DEFAULT 'null',
    mask_config                 jsonb       NOT NULL DEFAULT '{}',
    scope                       text        NOT NULL DEFAULT 'global',
    scope_ref                   text,
    priority                    smallint    NOT NULL DEFAULT 100,
    pii_classification          text,
    privacy_metadata            jsonb       NOT NULL DEFAULT '{}',
    version                     integer     NOT NULL DEFAULT 1,
    is_active                   boolean     NOT NULL DEFAULT true,
    metadata                    jsonb       NOT NULL DEFAULT '{}',

    -- Audit
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT fsp_pkey                 PRIMARY KEY (id),
    CONSTRAINT fsp_policy_type_chk      CHECK (policy_type = ANY (ARRAY[
        'read','write','mask','redact'
    ])),
    CONSTRAINT fsp_mask_strategy_chk    CHECK (mask_strategy = ANY (ARRAY[
        'null','partial','hash','encrypt','tokenise'
    ])),
    CONSTRAINT fsp_scope_chk            CHECK (scope = ANY (ARRAY[
        'global','module','tenant'
    ])),
    CONSTRAINT fsp_pii_class_chk        CHECK (
        pii_classification IS NULL OR pii_classification = ANY (ARRAY[
            'none','quasi','direct','sensitive','special_category'
        ])
    )
);

COMMENT ON TABLE  control.field_security_policy IS
    'Field-level PII classification and masking policies. '
    'mask_strategy: null (return NULL), partial (last 4 chars), '
    'hash (SHA-256), encrypt (AES-256), tokenise (replace with token). '
    'priority: lower fires first when multiple policies match.';


-- =============================================================================
-- §9  control.overlay
-- =============================================================================
-- Tenant customisation sets. A set of ordered changes applied on top of
-- a base entity version to produce a tenant-specific view.

CREATE TABLE IF NOT EXISTS control.overlay (
    -- Identity
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,

    -- Overlay identity
    overlay_key                 text        NOT NULL,
    description                 text,

    -- Base entity
    base_entity_id              uuid        NOT NULL,
    base_version_id             uuid,

    -- Conflict resolution
    priority                    integer     NOT NULL DEFAULT 100,
    conflict_mode               text        NOT NULL DEFAULT 'fail',

    -- Versioning
    version                     integer     NOT NULL DEFAULT 1,

    -- Lifecycle
    is_active                   boolean     NOT NULL DEFAULT true,

    -- Audit
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT ov_pkey              PRIMARY KEY (id),
    CONSTRAINT ov_tenant_key_uq     UNIQUE (tenant_id, overlay_key),
    CONSTRAINT ov_key_chk           CHECK (btrim(overlay_key) <> ''),
    CONSTRAINT ov_conflict_chk      CHECK (conflict_mode = ANY (ARRAY[
        'fail','overwrite','merge'
    ])),
    CONSTRAINT ov_version_chk       CHECK (version >= 1)
);

COMMENT ON TABLE  control.overlay IS
    'Tenant customisation sets applied on top of base entity versions. '
    'overlay_change rows define the individual operations. '
    'conflict_mode: fail (error on conflict), overwrite (last wins), merge (deep merge). '
    'Used by snapshot.entity_compiled_overlay for pre-compiled overlay deltas.';


-- =============================================================================
-- §10  control.overlay_change
-- =============================================================================
-- Individual operations within an overlay.
-- Moved from association.overlay_change to control.*

CREATE TABLE IF NOT EXISTS control.overlay_change (
    -- Identity
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,
    overlay_id                  uuid        NOT NULL,

    -- Change definition
    change_order                integer     NOT NULL,
    kind                        text        NOT NULL,
    path                        text        NOT NULL, -- field_name or JSON path
    value                       jsonb,

    -- Audit
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,

    CONSTRAINT oc_pkey              PRIMARY KEY (id),
    CONSTRAINT oc_order_uq          UNIQUE (overlay_id, change_order),
    CONSTRAINT oc_order_chk         CHECK (change_order >= 1),
    CONSTRAINT oc_path_chk          CHECK (btrim(path) <> ''),
    CONSTRAINT oc_kind_chk          CHECK (kind = ANY (ARRAY[
        'addField','removeField','modifyField','tweakPolicy',
        'overrideValidation','overrideUi','addIndex','removeIndex','tweakRelation'
    ])),
    CONSTRAINT oc_value_chk         CHECK (
        value IS NULL OR jsonb_typeof(value) = 'object'
    ),
    -- removeField: no value needed
    CONSTRAINT oc_remove_no_value_chk CHECK (
        kind <> 'removeField' OR value IS NULL
    )
);

COMMENT ON TABLE  control.overlay_change IS
    'Individual operations within an overlay, applied in change_order sequence. '
    'Moved from association.overlay_change to control.*. '
    'UNIQUE(overlay_id, change_order) — deterministic application order. '
    'kind: addField|removeField|modifyField|tweakPolicy|overrideValidation|'
    'overrideUi|addIndex|removeIndex|tweakRelation.';


-- =============================================================================
-- §11  control.entity_lifecycle
-- =============================================================================
-- Binds a lifecycle to an entity type.
-- Moved from association.entity_lifecycle to control.*

CREATE TABLE IF NOT EXISTS control.entity_lifecycle (
    -- Identity
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid,

    -- Binding
    entity_name                 text        NOT NULL,
    lifecycle_id                uuid        NOT NULL,

    -- Conditional binding (JSONLogic against entity payload)
    conditions                  jsonb,

    -- Priority (when multiple lifecycles apply to same entity)
    priority                    smallint    NOT NULL DEFAULT 100,

    -- Audit
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT el_pkey              PRIMARY KEY (id),
    CONSTRAINT el_binding_uq        UNIQUE NULLS NOT DISTINCT (tenant_id, entity_name, lifecycle_id),
    CONSTRAINT el_entity_name_chk   CHECK (btrim(entity_name) <> ''),
    CONSTRAINT el_conditions_chk    CHECK (
        conditions IS NULL OR jsonb_typeof(conditions) = 'object'
    )
);

COMMENT ON TABLE  control.entity_lifecycle IS
    'Binds lifecycle state machines to entity types. '
    'conditions: JSONLogic expression — if NULL, always applies. '
    'Multiple lifecycles per entity resolved by priority (lower = higher). '
    'Moved from association.entity_lifecycle to control.*. '
    'P2-FIX: updated_at/updated_by added — bindings are rebindable.';


-- =============================================================================
-- §12  control.entity_operation
-- =============================================================================
-- Registers operations (now shared.permission codes) on entity types.
-- operation_code references shared.permission.code
-- Moved from association.entity_operation to control.*

CREATE TABLE IF NOT EXISTS control.entity_operation (
    -- Identity
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid,

    -- Binding
    entity_name                 text        NOT NULL,
    -- permission_code replaces operation_code (FK to shared.permission.code)
    permission_code             text        NOT NULL,

    -- UI placement
    surface                     text        NOT NULL DEFAULT 'BOTH',
    placement                   text        NOT NULL DEFAULT 'TOOLBAR',

    -- Handler
    handler_type                text        NOT NULL DEFAULT 'API',
    handler_target              text,

    -- Behaviour
    is_record_required          boolean     NOT NULL DEFAULT false,
    sort_order                  smallint    NOT NULL DEFAULT 0,

    -- Overrides (tenant can relabel/reicon operations)
    label_override              text,
    icon_override               text,
    tcode_alias                 text,
    is_enabled                  boolean     NOT NULL DEFAULT true,

    -- Audit
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT eo_pkey              PRIMARY KEY (id),
    CONSTRAINT eo_binding_uq        UNIQUE NULLS NOT DISTINCT (tenant_id, entity_name, permission_code),
    CONSTRAINT eo_surface_chk       CHECK (surface = ANY (ARRAY[
        'LIST','DETAIL','BOTH','PALETTE_ONLY','HIDDEN'
    ])),
    CONSTRAINT eo_placement_chk     CHECK (placement = ANY (ARRAY[
        'PRIMARY','TOOLBAR','OVERFLOW','CONTEXT','COMMAND'
    ])),
    CONSTRAINT eo_handler_chk       CHECK (handler_type = ANY (ARRAY[
        'NAVIGATE','API','MODAL','INLINE'
    ])),
    CONSTRAINT eo_surface_hidden_chk CHECK (
        surface <> 'HIDDEN' OR placement = 'COMMAND'
    )
);

COMMENT ON TABLE  control.entity_operation IS
    'Registers operations on entity types with UI placement config. '
    'permission_code replaces operation_code — FK to shared.permission.code '
    '(control.operation eliminated; operations absorbed into shared.permission). '
    'Moved from association.entity_operation to control.*.';


-- =============================================================================
-- §13  control.entity_policy
-- =============================================================================
-- Access, audit, and retention policy per entity (or entity version).
-- Moved from association.entity_policy to control.*

CREATE TABLE IF NOT EXISTS control.entity_policy (
    -- Identity
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,

    -- Scope (entity-level OR version-level)
    entity_id                   uuid        NOT NULL,
    entity_version_id           uuid,       -- NULL = applies to all versions

    -- Access
    access_mode                 text        NOT NULL DEFAULT 'default_deny',
    company_scope_mode          text        NOT NULL DEFAULT 'none',

    -- Audit
    audit_mode                  text        NOT NULL DEFAULT 'enabled',

    -- Data management
    retention_policy            jsonb       NOT NULL DEFAULT '{}',
    default_filters             jsonb       NOT NULL DEFAULT '{}',
    cache_flags                 jsonb       NOT NULL DEFAULT '{}',

    -- Audit columns
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT ep_pkey                  PRIMARY KEY (id),
    CONSTRAINT ep_entity_version_uq     UNIQUE NULLS NOT DISTINCT (entity_id, entity_version_id),
    CONSTRAINT ep_access_chk            CHECK (access_mode = ANY (ARRAY[
        'default_deny','default_allow','explicit'
    ])),
    CONSTRAINT ep_company_scope_chk     CHECK (company_scope_mode = ANY (ARRAY[
        'none','single','subtree','full'
    ])),
    CONSTRAINT ep_audit_chk             CHECK (audit_mode = ANY (ARRAY[
        'enabled','disabled','sampling'
    ])),
    CONSTRAINT ep_retention_chk         CHECK (jsonb_typeof(retention_policy) = 'object'),
    CONSTRAINT ep_filters_chk           CHECK (jsonb_typeof(default_filters) = 'object'),
    CONSTRAINT ep_cache_chk             CHECK (jsonb_typeof(cache_flags) = 'object')
);

COMMENT ON TABLE  control.entity_policy IS
    'Access, audit, and retention policy per entity or entity version. '
    'entity_version_id IS NULL: applies to all versions of the entity. '
    'audit_mode overrides entity_class_profile.compliance_profile.audit_rules '
    'at the entity level. '
    'Moved from association.entity_policy to control.*.';


-- =============================================================================
-- §14  control.entity_relation
-- =============================================================================
-- FK/join relationship declarations per entity version.
-- Renamed from association.relation + moved to control.*

CREATE TABLE IF NOT EXISTS control.entity_relation (
    -- Identity
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid,
    entity_version_id           uuid        NOT NULL,

    -- Relation definition
    name                        text        NOT NULL,
    relation_kind               text        NOT NULL,
    target_entity               text        NOT NULL,
    fk_field                    text,
    target_key                  text        NOT NULL DEFAULT 'id',
    on_delete                   text        NOT NULL DEFAULT 'restrict',
    ui_behavior                 jsonb       NOT NULL DEFAULT '{}',

    -- Audit
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT er_pkey              PRIMARY KEY (id),
    CONSTRAINT er_name_uq           UNIQUE (entity_version_id, name),
    CONSTRAINT er_kind_chk          CHECK (relation_kind = ANY (ARRAY[
        'belongs_to','has_many','m2m'
    ])),
    CONSTRAINT er_on_delete_chk     CHECK (on_delete = ANY (ARRAY[
        'restrict','cascade','set_null','set_default','no_action'
    ])),
    CONSTRAINT er_name_chk          CHECK (btrim(name) <> ''),
    CONSTRAINT er_target_chk        CHECK (btrim(target_entity) <> ''),
    CONSTRAINT er_ui_chk            CHECK (jsonb_typeof(ui_behavior) = 'object')
);

COMMENT ON TABLE  control.entity_relation IS
    'FK/join relationship declarations per entity version. '
    'relation_kind: belongs_to (many-to-one), has_many (one-to-many), m2m (many-to-many). '
    'Renamed from association.relation + moved to control.*. '
    'P2-FIX: updated_at/updated_by added — relation config is editable.';

