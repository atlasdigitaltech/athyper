-- ============================================================================
-- control/01_tables.sql
-- Concept: Platform Governance — lookups, MFA, notifications, lifecycle, workflow, accounting rules
-- Depends on: 01_schemas, 03_bootstrap_functions/001_shared.sql
-- Scope: Control schema — lookup domains, MFA, notifications, lifecycle engine,
--        workflow definitions, accounting profiles, dimension policies, document
--        sequences, tax configuration, planning engine, bank format rules,
--        and automation cron schedules.
--
-- Groups (formerly 002a / 002b / 002c):
--   ── Core: lookup_domain, lookup_value, mfa_config, notification_*, lifecycle_*,
--            hook_action_registry, lifecycle_timer_policy, workflow_definition,
--            workflow_template, workflow_template_stage, workflow_template_rule,
--            entity_lifecycle_config, entity_lifecycle_instance
--   ── Accounting: book_posting_rule, transaction_flow_template, acct_profile_config,
--                  acct_profile_commitment_config, acct_profile_revenue_config,
--                  acct_profile_settlement_config, acct_profile_event,
--                  acct_profile_entry_template, acct_profile_book_rule,
--                  acct_profile_dimension_rule, classification_to_intent_rule,
--                  intent_to_accounting_profile_rule, intent_profile_override,
--                  dimension_policy, dimension_policy_allowed_value,
--                  document_sequence_config, document_sequence_counter,
--                  classification_config, commodity_to_spend_category_rule,
--                  rounding_rule, tax_rate_schedule, tax_group, tax_group_component
--   ── Planning:   forecast_line, planning_driver, planning_driver_formula,
--                  planning_driver_assumption, planning_driver_version,
--                  bank_format_rule
--   ── Automation: cron_schedule, connector_type
-- ============================================================================


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
  'ARCHETYPE=B;SCOPE=N. Registry of named lookup domains. Each domain groups lookup values under a unique code. is_extensible=true allows tenant extensions.';

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
  'ARCHETYPE=B;SCOPE=G. Lookup code+label pairs keyed by domain_code. Global rows: tenant_id IS NULL, is_system=true. Tenant extensions: tenant_id IS NOT NULL, is_system=false.';


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

    -- Table-specific (credential storage — base32 TOTP secret; bcrypt hash of backup codes; NULL for webauthn)
    credential_hash    text,

    -- Table-specific (display label set by user in KC account console, e.g. "My YubiKey")
    user_label         text,

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
  'ARCHETYPE=C;SCOPE=T. Local mirror of Keycloak MFA enrollment. One row per (tenant, principal, method_type). Replaces OTP instance tables.';


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
    'ARCHETYPE=C;SCOPE=N. Channel provider registry. One row per adapter per channel. '
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
    -- R9: phase discriminator — NULL = any phase, 'in_workflow' = while WF request open,
    -- 'post_workflow' = after terminal WF state. Enables In-WF vs Post-WF routing.
    workflow_phase  text,
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
                                        OR jsonb_typeof(condition_expr) = 'object'),
    CONSTRAINT nrr_workflow_phase_chk CHECK (workflow_phase IS NULL
                                        OR workflow_phase IN ('in_workflow', 'post_workflow'))
    -- priority: 09_triggers — control.trg_validate_lookup_columns('notification.priority')
);

COMMENT ON TABLE  control.notification_routing_rule IS
    'ARCHETYPE=C;SCOPE=G. Event-driven notification routing rules. tenant_id=NULL = platform global rule. '
    'channels[] references notification.channel lookup codes. '
    'priority validated via notification.priority lookup. '
    'R9: workflow_phase discriminator — NULL = any phase; '
    'in_workflow = approval-request / SLA-nearing notifications while WF is open; '
    'post_workflow = completion / rejection notifications after terminal WF state.';
COMMENT ON COLUMN control.notification_routing_rule.recipient_rules IS
    'JSONB recipient resolution rules: '
    '{actor: true, ou_members: true, role: "approver", explicit_ids: [uuid,...]}.';
COMMENT ON COLUMN control.notification_routing_rule.dedup_window_ms IS
    'Suppress duplicate messages for same (event_type, entity_id, recipient) '
    'within this window. Default 5 minutes (300000 ms).';


-- ============================================================================
-- §3b control.outbox_routing_rule — business-event → outbox-topic dispatch map
-- ============================================================================
-- R5: makes outbox dispatch inspectable and tenant-overridable.
-- One row per routing path: one event_type → one topic.
-- Multiple rows with the same event_type fan-out to multiple topics.
-- handler_key (optional) pins the route to a specific hook_action_registry entry.
-- tenant_id NULL = platform-global rule; tenant row overrides platform rule for
-- the same event_type + topic combination (evaluated by sort_order ASC).
CREATE TABLE IF NOT EXISTS control.outbox_routing_rule (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid,                               -- NULL = platform-global

    -- Routing key
    event_type      text        NOT NULL,               -- e.g. 'payment.approved'
    topic           text        NOT NULL,               -- outbox topic: iam/wf/audit/fin/custom

    -- Optional: pin to a specific registered handler
    handler_id      uuid,                               -- FK → hook_action_registry(id)

    -- Optional: only route when condition matches entity payload
    condition_expr  jsonb,

    -- Control
    is_enabled      boolean     NOT NULL DEFAULT true,
    sort_order      smallint    NOT NULL DEFAULT 0,

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT orr_pkey             PRIMARY KEY (id),
    CONSTRAINT orr_event_nonempty   CHECK (btrim(event_type) <> ''),
    CONSTRAINT orr_topic_nonempty   CHECK (btrim(topic) <> ''),
    CONSTRAINT orr_condition_chk    CHECK (condition_expr IS NULL
                                        OR jsonb_typeof(condition_expr) = 'object')
);

COMMENT ON TABLE control.outbox_routing_rule IS
    'ARCHETYPE=C;SCOPE=G. R5: business-event → outbox-topic dispatch map. Makes routing inspectable '
    'and tenant-overridable. One row per routing path; fan-out via multiple rows. '
    'tenant_id=NULL = platform-global. Tenant rows override for matching event_type+topic. '
    'handler_id references hook_action_registry(id) for emit_event handlers. '
    'Evaluated sort_order ASC — first enabled match per event_type+topic wins.';


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
    'ARCHETYPE=B_LITE;SCOPE=G;PENDING_ACTIVE_SET. Versioned message templates per (template_key, channel, locale). '
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
    'ARCHETYPE=C;SCOPE=G;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (not GENERATED). State machine definition. Root record for a named lifecycle. '
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
    'ARCHETYPE=C;SCOPE=G. States (nodes) within a lifecycle. '
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
    'ARCHETYPE=C;SCOPE=G;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (not GENERATED). Allowed state transitions (directed edges). '
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
    workflow_definition_id uuid,   -- FK → control.workflow_definition(id); set NULL on delete

    -- Precondition type C: CEL / JSONLogic expressions against entity payload
    conditions           jsonb,

    -- Precondition type D: numeric threshold rules
    threshold_rules      jsonb,

    -- R2b: canonical resolution path discriminator.
    -- 'workflow': gate blocks until workflow_definition produces an APPROVED terminal state.
    --             Async — transition enqueued, not fired immediately.
    -- 'policy':   gate evaluates policy_rule synchronously against the entity payload.
    --             Fires immediately on ALLOW; blocks on DENY; escalates on WARN/require_workflow.
    -- Both paths respect required_operations, conditions, and threshold_rules as additional guards.
    resolves_via         text        NOT NULL DEFAULT 'workflow',
    policy_rule_id       uuid,       -- FK → control.policy_rule; required when resolves_via='policy'

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
        OR workflow_definition_id IS NOT NULL
        OR conditions IS NOT NULL
        OR threshold_rules IS NOT NULL
        OR policy_rule_id IS NOT NULL
    ),
    -- R2b: resolution path integrity
    CONSTRAINT ltg_resolves_via_chk  CHECK (resolves_via IN ('workflow', 'policy')),
    -- workflow path: workflow_definition_id must be set
    CONSTRAINT ltg_workflow_path_chk CHECK (
        resolves_via <> 'workflow' OR workflow_definition_id IS NOT NULL
    ),
    -- policy path: policy_rule_id must be set
    CONSTRAINT ltg_policy_path_chk   CHECK (
        resolves_via <> 'policy' OR policy_rule_id IS NOT NULL
    )
);

COMMENT ON TABLE  control.lifecycle_transition_gate IS
    'ARCHETYPE=C;SCOPE=G. Preconditions evaluated before a transition fires. '
    'One gate per transition (UNIQUE on transition_id) — all conditions combined in one row. '
    'R2b: resolves_via is the canonical resolution-path discriminator: '
    '  workflow (default) → gate blocks until workflow_definition reaches APPROVED terminal state (async). '
    '  policy → gate evaluates policy_rule synchronously; ALLOW fires, DENY blocks, WARN escalates. '
    'Both paths honour required_operations, conditions, and threshold_rules as additional guards. '
    'required_operations: [{code: ''review'', completed_by: ''any''}] '
    'workflow_definition_id: FK → control.workflow_definition; required when resolves_via=workflow. '
    'policy_rule_id: FK → control.policy_rule; required when resolves_via=policy. '
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
    'ARCHETYPE=C;SCOPE=G;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (not GENERATED). Side effects executed before or after a transition commits. '
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
    'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (not GENERATED). Tenant customisation of lifecycle hooks. '
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
    'ARCHETYPE=C;SCOPE=G;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (not GENERATED). Registry of all hook actions the lifecycle engine can execute. '
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
    'ARCHETYPE=C;SCOPE=G. Named escalation timer rule sets. Attached to lifecycle states via '
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
    'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (not GENERATED). Policy: when is a workflow required for an entity? '
    'rules jsonb array: [{condition: jsonlogic, template_code, workflow_type}]. '
    'First match wins. NULL condition = always applies. '
    'Referenced by control.lifecycle_transition_gate.workflow_definition_id; when a gate has this FK set, the engine starts a workflow_definition-governed approval and blocks the transition until the request reaches an APPROVED terminal state. '
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
    'ARCHETYPE=C;SCOPE=G;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (not GENERATED). Workflow blueprint. tenant_id=NULL = platform-global template. '
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
    'ARCHETYPE=C;SCOPE=G. Stage definition within a workflow template. '
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
    'ARCHETYPE=C;SCOPE=G. Assignee resolution rules. Priority-ordered — first matching rule wins. '
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
    'ARCHETYPE=C;SCOPE=G. SLA timer and escalation chain for workflow stages. '
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
    'ARCHETYPE=B_LITE;SCOPE=G. Policy & Rules Engine: top-level policy container. '
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

    -- Budget check config (populated when action = 'budget_check')
    -- When set, engine evaluates dimensional budget check instead of JSONLogic conditions alone.
    budget_check_config_id uuid,                        -- FK → control.budget_check_config

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT prule_pkey               PRIMARY KEY (id),
    CONSTRAINT prule_priority_pos       CHECK (priority > 0),
    CONSTRAINT prule_action_chk         CHECK (action IN ('allow', 'deny', 'warn', 'require_workflow', 'escalate', 'budget_check')),
    CONSTRAINT prule_score_chk          CHECK (score IS NULL OR score BETWEEN 0 AND 1),
    CONSTRAINT prule_confidence_chk     CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
    CONSTRAINT prule_sla_pos            CHECK (sla_hours IS NULL OR sla_hours > 0),
    CONSTRAINT prule_approvers_chk      CHECK (approvers IS NULL OR jsonb_typeof(approvers) = 'array'),
    CONSTRAINT prule_priority_uq        UNIQUE (policy_id, priority)
);

COMMENT ON TABLE control.policy_rule IS
    'ARCHETYPE=C;SCOPE=N. Individual rule within a policy_definition. '
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
-- §7a control.budget_check_config — typed dimensional budget-check config
-- =============================================================================
-- R11: specialisation referenced by policy_rule (action=budget_check).
-- Declares dimensions, thresholds, netting, and override approver chain.
-- Keeps rule evaluation clean — dimensional semantics are typed here, not
-- encoded as JSONLogic inside policy_rule.conditions.
CREATE TABLE IF NOT EXISTS control.budget_check_config (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,

    -- Config identity
    name            text        NOT NULL,
    description     text,

    -- Dimension scope
    book_id         uuid,           -- FK → master.ledger_book; NULL = all books
    account_pattern text,           -- account code prefix/pattern, e.g. 'EXP.*'
    period_scope    text        NOT NULL DEFAULT 'fiscal_year',
    ou_scope        text        NOT NULL DEFAULT 'exact',

    -- Commitment netting mode
    commitment_netting text     NOT NULL DEFAULT 'actuals_plus_committed',

    -- Thresholds (0–100 percent of budget consumed)
    warn_at_pct     numeric(5,2) NOT NULL DEFAULT 80,
    block_at_pct    numeric(5,2) NOT NULL DEFAULT 100,

    -- Override approval: when budget is exceeded, route here instead of hard-block
    override_policy_definition_id uuid,  -- FK → control.policy_definition ON DELETE SET NULL

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT bcc_pkey              PRIMARY KEY (id),
    CONSTRAINT bcc_name_nonempty     CHECK (btrim(name) <> ''),
    CONSTRAINT bcc_period_chk        CHECK (period_scope IN (
        'current_period', 'fiscal_year', 'rolling_12m')),
    CONSTRAINT bcc_ou_scope_chk      CHECK (ou_scope IN ('exact', 'subtree', 'full')),
    CONSTRAINT bcc_netting_chk       CHECK (commitment_netting IN (
        'actuals_only', 'actuals_plus_committed', 'actuals_plus_committed_plus_forecast')),
    CONSTRAINT bcc_warn_range_chk    CHECK (warn_at_pct  BETWEEN 0 AND 100),
    CONSTRAINT bcc_block_range_chk   CHECK (block_at_pct BETWEEN 0 AND 100),
    CONSTRAINT bcc_threshold_order   CHECK (block_at_pct >= warn_at_pct)
);

COMMENT ON TABLE control.budget_check_config IS
    'ARCHETYPE=C;SCOPE=T. R11: typed dimensional budget-check configuration referenced by policy_rule '
    '(action=''budget_check''). Declares dimension scope (book, account, period, OU), '
    'netting mode (actuals vs committed vs forecast), warn/block thresholds, and an '
    'override approval path. Keeps dimensional semantics out of policy_rule.conditions JSON.';


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
    'ARCHETYPE=F;SCOPE=N. Platform-global governance rules per entity class. Immutable — seeded at install. '
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
    -- Logical binding code — mirrors name for system entities; stable binding key used by
    -- entity_lifecycle.entity_name, entity_operation.entity_name, and
    -- entity_relation.target_entity. Format: lowercase alpha_underscore.
    entity_code                 text        NOT NULL,

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
    -- Logical code uniqueness: one entity_code per tenant (NULL = platform-global)
    CONSTRAINT entity_code_uq           UNIQUE NULLS NOT DISTINCT (tenant_id, entity_code),
    CONSTRAINT entity_slug_fmt_chk      CHECK (
        slug IS NULL OR slug ~ '^[a-z][a-z0-9]+(-[a-z0-9]+)*$'
    ),
    CONSTRAINT entity_short_fmt_chk     CHECK (
        entity_short IS NULL OR entity_short ~ '^[A-Z][A-Z0-9_]{1,11}$'
    ),
    CONSTRAINT entity_code_fmt_chk      CHECK (entity_code ~ '^[a-z][a-z0-9_]*$'),
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
    'ARCHETYPE=B;SCOPE=G. Non-standard active-set: is_active GENERATED AS (status = ANY(ARRAY[''ACTIVE'',''DEPRECATED''])). Central registry of every table/view in the platform. '
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

    -- R4: blueprint/overlay precedence — explicit merge-order source pointers.
    -- source_layer: which configuration layer last wrote the effective published state.
    --   platform(0): shipped by Athyper platform seed; lowest precedence.
    --   blueprint(1–99): applied by a blueprint pack; precedence = applied_precedence.
    --   overlay(100): tenant overlay; always wins over any blueprint.
    -- source_ref: stable identifier of the contributing layer:
    --   platform  → NULL (implicit)
    --   blueprint → control.blueprint_registry.code (e.g. 'coa_ifrs')
    --   overlay   → overlay id or code
    -- applied_precedence: the numeric stacking rank at the time the state was written.
    --   Higher rank = later-applied = wins on conflict. Mirrors blueprint application order.
    source_layer                text        NOT NULL DEFAULT 'platform',
    source_ref                  text,
    applied_precedence          smallint    NOT NULL DEFAULT 0,

    -- Audit
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT eps_pkey                 PRIMARY KEY (entity_id),
    CONSTRAINT eps_hash_fmt_chk         CHECK (
        last_compiled_hash IS NULL OR length(last_compiled_hash) >= 64
    ),
    CONSTRAINT eps_provenance_chk       CHECK (jsonb_typeof(provenance) = 'object'),
    CONSTRAINT eps_summary_chk          CHECK (jsonb_typeof(status_summary) = 'object'),
    CONSTRAINT eps_source_layer_chk     CHECK (source_layer IN ('platform', 'blueprint', 'overlay')),
    CONSTRAINT eps_source_ref_chk       CHECK (source_ref IS NULL OR btrim(source_ref) <> ''),
    CONSTRAINT eps_precedence_chk       CHECK (applied_precedence >= 0)
);

COMMENT ON TABLE  control.entity_publish_state IS
    'ARCHETYPE=C;SCOPE=G. 1:1 companion to control.entity. Holds compile/publish tracking columns '
    'that were previously duplicated in entity (removed by this migration). '
    'Separated to avoid update contention during frequent compile cycles. '
    'R4: source_layer/source_ref/applied_precedence expose the blueprint/overlay merge order: '
    '  platform(0) < blueprint(1-99, by application order) < overlay(100). '
    '  Higher applied_precedence wins on conflict. source_ref names the contributing pack/overlay. '
    '  Admins can query this table to see "this entity came from blueprint X, overridden by overlay Y." '
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
    'ARCHETYPE=B_LITE;SCOPE=G;DEVIATION. DEVIATION: lifecycle column is is_effective GENERATED AS (status = ''EFFECTIVE''), not is_active. Versioned entity definitions. Moved from snapshot.* to control.* — '
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
    'ARCHETYPE=C;SCOPE=G;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (not GENERATED). All fields in the platform — canonical, versioned, and custom. '
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
    'ARCHETYPE=F;SCOPE=N. Logical UI sections grouping canonical fields. '
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
    'ARCHETYPE=C;SCOPE=N;DEVIATION. No audit columns (no created_by/updated_at). Assigns canonical entity_field rows (entity_version_id IS NULL) to field_group sections. '
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
    'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (not GENERATED). Field-level PII classification and masking policies. '
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
    'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (not GENERATED). Tenant customisation sets applied on top of base entity versions. '
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
    'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Individual operations within an overlay, applied in change_order sequence. '
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
    'ARCHETYPE=C;SCOPE=G. Binds lifecycle state machines to entity types. '
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
    'ARCHETYPE=C;SCOPE=G;DEVIATION. Manual is_enabled boolean NOT NULL DEFAULT true (not GENERATED). Registers operations on entity types with UI placement config. '
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

    -- R10: row-scope composition with field_security_policy
    -- When both a row-scope predicate (company_scope_mode) and a field-security policy apply
    -- to the same read, field_scope_eval_order defines which is applied first.
    -- row_first (default): row predicate filters the result set, then field masking is applied
    --   to the surviving rows. Masked fields cannot participate in row predicate resolution.
    -- field_first: field masking is applied before row predicate; masked columns are NULLed
    --   before the row predicate runs. Use when masked fields drive row-level visibility.
    -- parallel: both predicates are evaluated independently and combined (AND). No ordering
    --   dependency; safe only when row and field predicates operate on disjoint columns.
    field_scope_eval_order      text        NOT NULL DEFAULT 'row_first',

    -- R10: extended scope axes beyond LE/OU (department, project, cost-center).
    -- Shape: { "department_ids": [uuid,...], "project_ids": [uuid,...],
    --          "cost_center_ids": [uuid,...] }
    -- Empty object (default) = no additional axis constraints applied.
    extended_scope              jsonb       NOT NULL DEFAULT '{}',

    -- Audit columns
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT ep_pkey                  PRIMARY KEY (id),
    -- tenant_id included: each tenant may have an independent policy per entity/version.
    -- Without this, only one tenant could ever seed a policy for a given entity_id.
    CONSTRAINT ep_tenant_entity_version_uq  UNIQUE NULLS NOT DISTINCT (tenant_id, entity_id, entity_version_id),
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
    CONSTRAINT ep_cache_chk             CHECK (jsonb_typeof(cache_flags) = 'object'),
    CONSTRAINT ep_field_scope_eval_chk  CHECK (field_scope_eval_order IN (
        'row_first', 'field_first', 'parallel')),
    CONSTRAINT ep_extended_scope_chk    CHECK (jsonb_typeof(extended_scope) = 'object')
);

COMMENT ON TABLE  control.entity_policy IS
    'ARCHETYPE=C;SCOPE=T. Canonical row-scope surface for entity-level access, audit, and retention policy. '
    'R10: company_scope_mode (none/single/subtree/full) is the primary LE/OU row-scope axis. '
    'field_scope_eval_order defines composition order vs field_security_policy: '
    '  row_first (default) → row predicate filters first, then field masking on survivors; '
    '  field_first → field masking nulls columns before row predicate runs; '
    '  parallel → both predicates evaluated independently and ANDed. '
    'extended_scope carries dept/project/cost-centre axis constraints beyond LE/OU. '
    'entity_version_id IS NULL: policy applies to all versions of the entity. '
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
    'ARCHETYPE=C;SCOPE=G. FK/join relationship declarations per entity version. '
    'relation_kind: belongs_to (many-to-one), has_many (one-to-many), m2m (many-to-many). '
    'Renamed from association.relation + moved to control.*. '
    'P2-FIX: updated_at/updated_by added — relation config is editable.';



-- ============================================================================
-- Part B: Accounting profiles, book posting rules, dimension policies, tax
-- ============================================================================

-- ============================================================================
-- §BPR  control.book_posting_rule — cross-book cascade rules
-- ============================================================================
-- When a JE posts to source_book, these rules auto-derive JEs for target_book.
-- ============================================================================

CREATE TABLE IF NOT EXISTS control.book_posting_rule (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,

    -- Company scope (Tier 1 UUID)
    company_code_id  uuid         NOT NULL,

    -- Rule identity
    rule_code        text         NOT NULL,
    rule_name        text         NOT NULL,
    description      text,

    -- Source → Target
    source_book_id   uuid         NOT NULL,
    target_book_id   uuid         NOT NULL,

    -- Scope filters (optional — narrow which JEs trigger this rule)
    scope_doc_type        text,
    scope_intent_code     text,
    scope_account_class   text,
    scope_subledger_type  text,

    -- Account strategy
    account_strategy text         NOT NULL DEFAULT 'same',
    account_mapping  jsonb,
    target_profile_id uuid,

    -- Amount strategy
    amount_strategy  text         NOT NULL DEFAULT 'mirror',
    amount_multiplier numeric(10,6) DEFAULT 1.0,
    amount_formula   jsonb,

    -- Recognition timing
    recognition_timing text       NOT NULL DEFAULT 'simultaneous',
    recognition_lag_periods smallint DEFAULT 0,

    -- Control
    priority         smallint     NOT NULL DEFAULT 0,
    version          smallint     NOT NULL DEFAULT 1,

    -- Metadata
    metadata         jsonb        NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status           text         NOT NULL DEFAULT 'active',
    is_active        boolean      GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT book_posting_rule_pkey PRIMARY KEY (id),
    CONSTRAINT book_posting_rule_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT book_posting_rule_company_code_uq
        UNIQUE (tenant_id, company_code_id, rule_code),
    CONSTRAINT bpr_diff_books_chk CHECK (source_book_id != target_book_id),
    CONSTRAINT bpr_formula_chk CHECK (amount_strategy != 'formula' OR amount_formula IS NOT NULL),
    CONSTRAINT bpr_multiplier_chk CHECK (amount_strategy != 'multiply' OR amount_multiplier IS NOT NULL),
    CONSTRAINT bpr_map_chk CHECK (account_strategy != 'map' OR account_mapping IS NOT NULL),
    CONSTRAINT bpr_profile_chk CHECK (account_strategy != 'profile' OR target_profile_id IS NOT NULL),
    CONSTRAINT bpr_lag_chk CHECK (recognition_timing != 'deferred' OR recognition_lag_periods > 0),
    CONSTRAINT bpr_code_nonempty CHECK (btrim(rule_code) <> ''),
    CONSTRAINT bpr_name_nonempty CHECK (btrim(rule_name) <> '')
);

COMMENT ON TABLE control.book_posting_rule IS
    'ARCHETYPE=B;SCOPE=T. Cross-book derivation rules. When a JE posts to source_book, these rules '
    'auto-derive JEs for target_book. Strategies: same/map/profile for accounts, '
    'mirror/multiply/formula/suppress for amounts, simultaneous/deferred/on_close for timing.';

-- ============================================================================
-- Engine 4.13: Unified Transaction Resolution Engine additions
-- ============================================================================

-- §0  transaction_event_catalog — canonical registry of lifecycle event codes
--     Platform-global (no tenant_id). Both transaction_flow_template.event_code
--     and acct_profile_event.event_code FK into this table (Step 4 / R1).
--     is_active=false deprecates a code without breaking existing rows.
CREATE TABLE IF NOT EXISTS control.transaction_event_catalog (
    -- Identity
    id            uuid        NOT NULL DEFAULT shared.uuidv7(),
    code          text        NOT NULL,

    -- Catalog fields
    label         text        NOT NULL,
    description   text,
    is_active     boolean     NOT NULL DEFAULT true,

    -- Audit
    created_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid        NOT NULL,
    updated_at    timestamptz,
    updated_by    uuid,

    CONSTRAINT tec_pkey          PRIMARY KEY (id),
    CONSTRAINT tec_code_uq       UNIQUE (code),
    CONSTRAINT tec_code_nonempty CHECK (btrim(code) <> ''),
    CONSTRAINT tec_label_nonempty CHECK (btrim(label) <> '')
);

COMMENT ON TABLE control.transaction_event_catalog IS
    'ARCHETYPE=C;SCOPE=N;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (not GENERATED). R1: canonical registry of transaction lifecycle event codes. '
    'Platform-global (no tenant_id). transaction_flow_template.event_code and '
    'acct_profile_event.event_code reference this table via FK (03_constraints.sql §TEC-REF). '
    'is_active=false deprecates a code without violating child-table FKs.';


-- §1  transaction_flow_template — canonical lifecycle events per transaction flow
--     tenant_id IS NULL = platform-global row; tenant_id = UUID = tenant override.
--     Uniqueness on (tenant_id, flow_code, event_code) enforced by partial index
--     tft_flow_event_uq in 07_indexes (handles nullable tenant_id via COALESCE).
CREATE TABLE IF NOT EXISTS control.transaction_flow_template (
    -- Identity
    id                uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id         uuid,                   -- NULL = platform-global

    -- Table-specific
    flow_code         text        NOT NULL,
    direction         text        NOT NULL,
    event_code        text        NOT NULL,
    event_name        text        NOT NULL,
    event_seq         smallint    NOT NULL,
    is_mandatory      boolean     NOT NULL DEFAULT true,
    creates_je        boolean     NOT NULL DEFAULT true,
    reverses_prior    text,
    commitment_action text        NOT NULL DEFAULT 'NONE',
    description       text,

    -- Metadata
    metadata          jsonb       NOT NULL DEFAULT '{}',

    -- Lifecycle
    status            shared.active_inactive_d        NOT NULL DEFAULT 'active',
    is_active         boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid        NOT NULL,
    updated_at        timestamptz,
    updated_by        uuid,

    CONSTRAINT tft_pkey            PRIMARY KEY (id),
    CONSTRAINT tft_direction_chk   CHECK (direction IN ('INBOUND','OUTBOUND','BILATERAL')),
    CONSTRAINT tft_commitment_chk  CHECK (commitment_action IN (
        'NONE','CREATE','INCREASE','RELEASE_PARTIAL','RELEASE_FULL','CANCEL')),
    CONSTRAINT tft_seq_positive    CHECK (event_seq > 0),
    CONSTRAINT tft_flow_nonempty   CHECK (btrim(flow_code) <> ''),
    CONSTRAINT tft_event_nonempty  CHECK (btrim(event_code) <> '')
);

COMMENT ON TABLE control.transaction_flow_template IS
    'ARCHETYPE=B;SCOPE=G. Engine 4.13: canonical lifecycle events per transaction flow. '
    'System-seeded (tenant_id IS NULL), tenant-overridable (tenant_id = UUID). '
    '15 flows, 38 event codes. Uniqueness enforced by tft_flow_event_uq partial index.';


-- §2  acct_profile_config — core profile configuration (1:1 with accounting_profile)
--     UNIQUE (tenant_id, id) is required: child tables (§3-§9) use composite FK
--     (profile_config_id, tenant_id) → (id, tenant_id) for row-level tenant scoping.
CREATE TABLE IF NOT EXISTS control.acct_profile_config (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    accounting_profile_id   uuid        NOT NULL,

    -- Classification
    direction               text        NOT NULL DEFAULT 'INBOUND',
    profile_type            text        NOT NULL DEFAULT 'STANDARD',
    subledger_type          text        NOT NULL DEFAULT 'AP',
    applicable_flow_codes   text[]      NOT NULL DEFAULT '{NON_PO}',
    applicable_doc_types    text[]      NOT NULL DEFAULT '{}',

    -- Recognition
    recognition_timing      text        NOT NULL DEFAULT 'IMMEDIATE',
    deferral_schedule_type  text,
    deferral_periods        smallint,
    auto_reverse            boolean     NOT NULL DEFAULT false,
    reversal_period_offset  smallint    NOT NULL DEFAULT 1,

    -- Tax
    tax_treatment           text        NOT NULL DEFAULT 'STANDARD',
    default_tax_code        text,
    default_tax_group_id    uuid,                   -- FK → control.tax_group (tenant-composite)
    is_reverse_charge       boolean     NOT NULL DEFAULT false,

    -- Matching
    matching_type           text        NOT NULL DEFAULT 'NONE',

    -- Versioning
    version                 integer     NOT NULL DEFAULT 1,
    effective_from          date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to            date,
    supersedes_id           uuid,

    -- Metadata
    metadata                jsonb       NOT NULL DEFAULT '{}',

    -- Lifecycle
    status            text             NOT NULL DEFAULT 'draft',
    is_active         boolean          GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT apc_pkey              PRIMARY KEY (id),
    CONSTRAINT apc_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT apc_profile_version_uq UNIQUE (accounting_profile_id, version),
    CONSTRAINT apc_status_chk        CHECK (status IN ('draft','active','superseded','inactive')),
    CONSTRAINT apc_direction_chk     CHECK (direction IN ('INBOUND','OUTBOUND','BILATERAL')),
    CONSTRAINT apc_type_chk          CHECK (profile_type IN (
        'STANDARD','ACCRUAL','PREPAYMENT','CAPITALIZATION','RECLASS','INTERCOMPANY',
        'FX_REVALUATION','REVERSAL','STATISTICAL','COMMITMENT','ENCUMBRANCE',
        'MILESTONE','LEASE','REVENUE_POINT','REVENUE_OVER_TIME','DEFERRED_REVENUE','COGS')),
    CONSTRAINT apc_subledger_chk     CHECK (subledger_type IN (
        'AP','AR','ASSET','INVENTORY','WIP','COMMISSION','NONE')),
    CONSTRAINT apc_timing_chk        CHECK (recognition_timing IN (
        'IMMEDIATE','DEFERRED','SCHEDULED','EVENT_DRIVEN')),
    CONSTRAINT apc_matching_chk      CHECK (matching_type IN (
        'NONE','TWO_WAY','THREE_WAY','FOUR_WAY')),
    CONSTRAINT apc_effective_chk     CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT apc_deferral_chk      CHECK (deferral_periods IS NULL OR deferral_periods > 0)
);

COMMENT ON TABLE control.acct_profile_config IS
    'ARCHETYPE=B;SCOPE=T. Non-standard active-set: status has values draft/active/superseded/inactive but is_active GENERATED AS (status = ''active'') — only ''active'' activates. Engine 4.13: core profile configuration; 1:1 extension of master.accounting_profile. '
    'Versioned + effective-dated. status: draft → active → superseded | inactive. '
    'UNIQUE (tenant_id, id) required: children use composite FK for row-level tenant scoping.';
COMMENT ON COLUMN control.acct_profile_config.default_tax_group_id IS
    'FK → control.tax_group (tenant-composite). Replaces free-text default_tax_code. '
    'Fallback tax group when no scoped tax_rate_schedule matches.';


-- §3  acct_profile_commitment_config — commitment behaviour (optional 1:1 child of §2)
CREATE TABLE IF NOT EXISTS control.acct_profile_commitment_config (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    profile_config_id       uuid        NOT NULL,

    -- Commitment behaviour
    creates_commitment      boolean     NOT NULL DEFAULT true,
    commitment_type         text        NOT NULL DEFAULT 'ONE_TIME',
    releases_commitment_on  text,
    encumbrance_behavior    text        NOT NULL DEFAULT 'STANDARD',
    multi_year_strategy     text        NOT NULL DEFAULT 'CURRENT_YEAR_ONLY',

    -- Advance / Retention
    advance_pct             numeric(5,2),
    advance_recovery_method text,
    retention_pct           numeric(5,2),
    retention_release_event text,

    -- Metadata
    metadata                jsonb       NOT NULL DEFAULT '{}',

    -- Lifecycle
    status            shared.active_inactive_d             NOT NULL DEFAULT 'active',
    is_active         boolean          GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT apcc_pkey             PRIMARY KEY (id),
    CONSTRAINT apcc_config_uq        UNIQUE (profile_config_id),
    CONSTRAINT apcc_type_chk         CHECK (commitment_type IN (
        'ONE_TIME','FIXED_RECURRING','MILESTONE','USAGE_BASED','ESCALATING','RETENTION_RELEASE')),
    CONSTRAINT apcc_encumbrance_chk  CHECK (encumbrance_behavior IN (
        'NONE','STANDARD','STATISTICAL_ONLY')),
    CONSTRAINT apcc_multiyear_chk    CHECK (multi_year_strategy IN (
        'CURRENT_YEAR_ONLY','HORIZON_SPREAD','FULL_RESERVE')),
    CONSTRAINT apcc_advance_pct_chk  CHECK (advance_pct IS NULL OR (advance_pct BETWEEN 0 AND 100)),
    CONSTRAINT apcc_retention_pct_chk CHECK (retention_pct IS NULL OR (retention_pct BETWEEN 0 AND 100))
);

COMMENT ON TABLE control.acct_profile_commitment_config IS
    'ARCHETYPE=B;SCOPE=T. Engine 4.13: commitment behaviour for profiles that create encumbrances. '
    'Optional 1:1 child of acct_profile_config. Includes advance/retention percentages.';


-- §4  acct_profile_revenue_config — revenue recognition (optional 1:1 child of §2)
CREATE TABLE IF NOT EXISTS control.acct_profile_revenue_config (
    -- Identity
    id                              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                       uuid        NOT NULL,
    profile_config_id               uuid        NOT NULL,

    -- Revenue recognition
    revenue_recognition_method      text        NOT NULL DEFAULT 'POINT_IN_TIME',
    variable_consideration          text,
    standalone_selling_price_method text,

    -- COGS pairing
    paired_profile_id               uuid,
    fires_paired_on_event           text        NOT NULL DEFAULT 'FULFILLMENT',

    -- Accounts
    deferral_account_code           text,
    unbilled_ar_account_code        text,

    -- Metadata
    metadata                        jsonb       NOT NULL DEFAULT '{}',

    -- Lifecycle
    status            shared.active_inactive_d                      NOT NULL DEFAULT 'active',
    is_active         boolean                   GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at                      timestamptz NOT NULL DEFAULT now(),
    created_by                      uuid        NOT NULL,
    updated_at                      timestamptz,
    updated_by                      uuid,

    CONSTRAINT aprc_pkey        PRIMARY KEY (id),
    CONSTRAINT aprc_config_uq   UNIQUE (profile_config_id),
    CONSTRAINT aprc_method_chk  CHECK (revenue_recognition_method IN (
        'POINT_IN_TIME','OVER_TIME','PCT_COMPLETION','INPUT_METHOD','OUTPUT_METHOD'))
);

COMMENT ON TABLE control.acct_profile_revenue_config IS
    'ARCHETYPE=B;SCOPE=T. Engine 4.13: revenue recognition config for OUTBOUND profiles. '
    'Includes COGS pairing via paired_profile_id → master.accounting_profile. '
    'fires_paired_on_event gates COGS entry generation.';


-- §5  acct_profile_settlement_config — settlement + dynamic discounting (optional 1:1 child of §2)
CREATE TABLE IF NOT EXISTS control.acct_profile_settlement_config (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    profile_config_id       uuid        NOT NULL,

    -- Settlement
    settlement_method       text        NOT NULL DEFAULT 'PAYMENT',
    settlement_tolerance    numeric(5,2) NOT NULL DEFAULT 0.00,

    -- Dynamic discount
    discount_model          text,
    discount_curve_type     text,
    discount_apr            numeric(8,4),
    discount_min_days       smallint,
    discount_min_amount     numeric(18,4),

    -- Supply chain finance
    scf_financier_id        uuid,
    scf_split_pct           numeric(5,2),

    -- Metadata
    metadata                jsonb       NOT NULL DEFAULT '{}',

    -- Lifecycle
    status            shared.active_inactive_d             NOT NULL DEFAULT 'active',
    is_active         boolean          GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT apsc_pkey             PRIMARY KEY (id),
    CONSTRAINT apsc_config_uq        UNIQUE (profile_config_id),
    CONSTRAINT apsc_settle_chk       CHECK (settlement_method IN (
        'PAYMENT','COLLECTION','NETTING','OFFSET','WRITE_OFF','PREPAID','SCF_FINANCED','NONE')),
    CONSTRAINT apsc_discount_chk     CHECK (discount_model IS NULL OR discount_model IN (
        'BUYER_FUNDED','SCF_SPLIT','SUPPLIER_INITIATED')),
    CONSTRAINT apsc_tolerance_chk    CHECK (settlement_tolerance BETWEEN 0 AND 100),
    CONSTRAINT apsc_scf_pct_chk      CHECK (scf_split_pct IS NULL OR scf_split_pct BETWEEN 0 AND 100),
    CONSTRAINT apsc_apr_chk          CHECK (discount_apr IS NULL OR discount_apr >= 0),
    CONSTRAINT apsc_min_amt_chk      CHECK (discount_min_amount IS NULL OR discount_min_amount >= 0)
);

COMMENT ON TABLE control.acct_profile_settlement_config IS
    'ARCHETYPE=B;SCOPE=T. Engine 4.13: settlement + dynamic discounting for profiles with special payment terms. '
    'Only exists for non-standard settlement. Includes SCF financing config.';


-- §6  acct_profile_event — profile × lifecycle event bridge
--     UNIQUE (tenant_id, id) required: acct_profile_entry_template uses composite FK
--     (profile_event_id, tenant_id) → (id, tenant_id) for row-level tenant scoping.
CREATE TABLE IF NOT EXISTS control.acct_profile_event (
    -- Identity
    id                       uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid        NOT NULL,
    profile_config_id        uuid        NOT NULL,

    -- Event definition
    event_code               text        NOT NULL,
    event_name               text        NOT NULL,
    creates_je               boolean     NOT NULL DEFAULT true,
    reverses_event           text,
    is_auto_reverse          boolean     NOT NULL DEFAULT false,
    auto_reverse_offset      smallint    NOT NULL DEFAULT 1,

    -- Commitment interaction
    commitment_action        text        NOT NULL DEFAULT 'NONE',
    commitment_amount_source text,

    -- Paired profile
    fires_paired_profile     boolean     NOT NULL DEFAULT false,

    event_seq                smallint    NOT NULL DEFAULT 0,

    -- Metadata
    metadata                 jsonb       NOT NULL DEFAULT '{}',

    -- Lifecycle
    status            shared.active_inactive_d              NOT NULL DEFAULT 'active',
    is_active         boolean           GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid        NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,

    CONSTRAINT ape_pkey            PRIMARY KEY (id),
    CONSTRAINT ape_tenant_id_uq    UNIQUE (tenant_id, id),
    CONSTRAINT ape_config_event_uq UNIQUE (profile_config_id, event_code),
    CONSTRAINT ape_commitment_chk  CHECK (commitment_action IN (
        'NONE','CREATE','INCREASE','RELEASE_PARTIAL','RELEASE_FULL','CANCEL')),
    CONSTRAINT ape_event_nonempty  CHECK (btrim(event_code) <> '')
);

COMMENT ON TABLE control.acct_profile_event IS
    'ARCHETYPE=B;SCOPE=T. Engine 4.13: profile × lifecycle event bridge. '
    'fires_paired_profile=true triggers COGS entry generation via acct_profile_revenue_config. '
    'UNIQUE (tenant_id, id) required: acct_profile_entry_template uses composite FK.';


-- §7  acct_profile_entry_template — Dr/Cr line templates per event
CREATE TABLE IF NOT EXISTS control.acct_profile_entry_template (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    profile_event_id        uuid        NOT NULL,

    -- Template definition
    line_seq                smallint    NOT NULL,
    description             text        NOT NULL,
    posting_side            text        NOT NULL,
    account_source          text        NOT NULL DEFAULT 'FIXED',
    account_code            text,
    account_lookup_key      text,
    account_fallback        text,
    amount_source           text        NOT NULL DEFAULT 'DOCUMENT_TOTAL',
    amount_formula          text,
    amount_percentage       numeric(8,4),
    is_balancing_line       boolean     NOT NULL DEFAULT false,

    -- Dimension overrides
    override_cost_center    text,
    override_profit_center  text,
    override_dimension_set_id uuid,

    -- Conditional
    applies_to_doc_types    text[],
    sort_order              smallint    NOT NULL DEFAULT 0,

    -- Metadata
    metadata                jsonb       NOT NULL DEFAULT '{}',

    -- Lifecycle
    status            shared.active_inactive_d             NOT NULL DEFAULT 'active',
    is_active         boolean          GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT apet_pkey          PRIMARY KEY (id),
    CONSTRAINT apet_event_seq_uq  UNIQUE (profile_event_id, line_seq),
    CONSTRAINT apet_side_chk      CHECK (posting_side IN ('DEBIT','CREDIT')),
    CONSTRAINT apet_source_chk    CHECK (account_source IN ('FIXED','FROM_INTENT','FROM_CATEGORY','POSTING_ROLE')),
    CONSTRAINT apet_source_key_chk CHECK (account_source <> 'POSTING_ROLE' OR account_lookup_key IS NOT NULL),
    CONSTRAINT apet_amount_chk    CHECK (amount_source IN (
        'DOCUMENT_TOTAL','LINE_AMOUNT','TAX_AMOUNT','CALCULATED','REMAINDER',
        'COMMITMENT_AMOUNT','MILESTONE_AMOUNT','FULFILLED_AMOUNT',
        'REVENUE_AMOUNT','COGS_AMOUNT','DISCOUNT_AMOUNT',
        'ADVANCE_AMOUNT','ADVANCE_RECOVERY',
        'RETENTION_AMOUNT','RETENTION_BALANCE','PENALTY_AMOUNT','REBATE_AMOUNT',
        'NET_PAYABLE','DISCOUNT_EARNED','NET_AFTER_DISCOUNT','SCF_FINANCIER_AMOUNT')),
    CONSTRAINT apet_pct_chk       CHECK (amount_percentage IS NULL OR amount_percentage BETWEEN 0 AND 100),
    CONSTRAINT apet_desc_nonempty CHECK (btrim(description) <> '')
);

COMMENT ON TABLE control.acct_profile_entry_template IS
    'ARCHETYPE=B;SCOPE=T. Engine 4.13: Dr/Cr line templates per event. 21 amount_source values. '
    'is_balancing_line=true: line aggregates split AP/AR accounting lines. '
    'account_source: FIXED | FROM_INTENT | FROM_CATEGORY | POSTING_ROLE. '
    'POSTING_ROLE requires account_lookup_key (carries posting_role_code).';


-- §8  acct_profile_book_rule — per-book posting behaviour
CREATE TABLE IF NOT EXISTS control.acct_profile_book_rule (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    profile_config_id       uuid        NOT NULL,

    -- Rule definition
    book_code               text        NOT NULL,
    posting_method          text        NOT NULL DEFAULT 'MIRROR',
    account_mapping         jsonb       NOT NULL DEFAULT '{}',
    applies_to_events       text[],

    -- Metadata
    metadata                jsonb       NOT NULL DEFAULT '{}',

    -- Lifecycle
    status            shared.active_inactive_d             NOT NULL DEFAULT 'active',
    is_active         boolean          GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT apbr_pkey             PRIMARY KEY (id),
    CONSTRAINT apbr_config_book_uq   UNIQUE (profile_config_id, book_code),
    CONSTRAINT apbr_method_chk       CHECK (posting_method IN ('MIRROR','EXCLUDE','REMAP')),
    CONSTRAINT apbr_book_nonempty    CHECK (btrim(book_code) <> '')
);

COMMENT ON TABLE control.acct_profile_book_rule IS
    'ARCHETYPE=B;SCOPE=T. Engine 4.13: per-book posting behaviour. '
    'MIRROR = same entries as primary; EXCLUDE = skip book entirely; '
    'REMAP = substitute accounts via account_mapping JSONB.';


-- §9  acct_profile_dimension_rule — dimension derivation per profile
CREATE TABLE IF NOT EXISTS control.acct_profile_dimension_rule (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    profile_config_id       uuid        NOT NULL,

    -- Rule definition
    dimension_type_id       uuid        NOT NULL,
    derive_source           text        NOT NULL,
    fixed_value_id          uuid,
    fallback_source         text,
    fallback_value_id       uuid,
    behavior                text        NOT NULL DEFAULT 'DERIVE_IF_MISSING',
    is_required             boolean     NOT NULL DEFAULT false,
    applies_to_events       text[],
    applies_to_books        text[],
    priority                smallint    NOT NULL DEFAULT 0,

    -- Metadata
    metadata                jsonb       NOT NULL DEFAULT '{}',

    -- Lifecycle
    status            shared.active_inactive_d             NOT NULL DEFAULT 'active',
    is_active         boolean          GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT apdr_pkey         PRIMARY KEY (id),
    CONSTRAINT apdr_source_chk   CHECK (derive_source IN (
        'FROM_DOCUMENT','FROM_LINE','FROM_OU','FROM_INTENT','FROM_COMMITMENT',
        'FROM_CONTRACT','FROM_CUSTOMER','FROM_PRODUCT','FIXED','INHERIT')),
    CONSTRAINT apdr_behavior_chk CHECK (behavior IN (
        'REQUIRED','OPTIONAL','DERIVE_IF_MISSING','FIXED_VALUE','FORBIDDEN'))
);

COMMENT ON TABLE control.acct_profile_dimension_rule IS
    'ARCHETYPE=B;SCOPE=T. Engine 4.13: dimension derivation rules per profile. '
    'Controls how dimensions are stamped on JE lines. '
    'Priority determines evaluation order when multiple rules apply.';


-- §10  classification_to_intent_rule — classification → intent resolution
CREATE TABLE IF NOT EXISTS control.classification_to_intent_rule (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,

    -- Classification scope
    classification_source   text        NOT NULL DEFAULT 'SPEND_CATEGORY',
    classification_id       uuid        NOT NULL,
    direction               text,

    -- Rule definition
    condition_type          text        NOT NULL,
    condition_config        jsonb       NOT NULL DEFAULT '{}',
    applies_to_flows        text[],

    -- Resolution result
    resolved_intent_id      uuid        NOT NULL,
    resolved_domain         text,
    explanation_template    text        NOT NULL,
    confidence              numeric(3,2) NOT NULL DEFAULT 1.00,
    priority                integer     NOT NULL DEFAULT 50,

    -- Effectivity
    effective_from          date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to            date,

    -- Metadata
    metadata                jsonb       NOT NULL DEFAULT '{}',

    -- Lifecycle
    status            shared.active_inactive_d             NOT NULL DEFAULT 'active',
    is_active         boolean          GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT cir_pkey           PRIMARY KEY (id),
    CONSTRAINT cir_source_chk     CHECK (classification_source IN (
        'SPEND_CATEGORY','PRODUCT','SERVICE','ITEM_GROUP','REVENUE_TYPE')),
    CONSTRAINT cir_condition_chk  CHECK (condition_type IN (
        'AMOUNT_ABOVE','AMOUNT_BELOW','IS_RECURRING','IS_ONE_TIME','COMPANY_MATCH',
        'PROCUREMENT_METHOD','CROSS_BORDER','DOC_TYPE_MATCH','COMMODITY_MATCH',
        'SUPPLIER_MATCH','CUSTOMER_MATCH','CUSTOMER_TIER','CONTRACT_TYPE_MATCH',
        'FLOW_MATCH','CHANNEL_MATCH','FALLBACK')),
    CONSTRAINT cir_domain_chk     CHECK (resolved_domain IS NULL OR resolved_domain IN (
        'OPEX','CAPEX','REVENUE','COST_OF_SALES','TRANSFER','REGULATORY','ADMIN','DEFERRED_REVENUE')),
    CONSTRAINT cir_confidence_chk CHECK (confidence BETWEEN 0 AND 1),
    CONSTRAINT cir_effective_chk  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

COMMENT ON TABLE control.classification_to_intent_rule IS
    'ARCHETYPE=B;SCOPE=T. Engine 4.13: classification → intent resolution. All 16 condition types runtime-implemented. '
    'Does NOT modify existing category_intent_rule. Effective-dated for auditability.';


-- §11  intent_to_accounting_profile_rule — intent + context → profile matching
--      All predicates are nullable = wildcard. First match by ascending priority wins.
CREATE TABLE IF NOT EXISTS control.intent_to_accounting_profile_rule (
    -- Identity
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,

    -- Predicates (all nullable = wildcard)
    direction                   text,
    intent_id                   uuid,
    intent_domain               text,
    flow_code                   text,
    company_code_id             uuid,
    doc_type                    text,
    currency_code               text,
    min_amount                  numeric(18,4),
    max_amount                  numeric(18,4),
    is_cross_border             boolean,
    is_intercompany             boolean,
    commodity_domain            text,
    commitment_type             text,
    counterparty_tier           text,
    contract_value_min          numeric(18,4),
    contract_value_max          numeric(18,4),
    revenue_type                text,

    -- Resolution result
    resolved_profile_config_id  uuid        NOT NULL,
    explanation_template        text        NOT NULL,
    confidence                  numeric(3,2) NOT NULL DEFAULT 1.00,
    priority                    integer     NOT NULL DEFAULT 50,

    -- Effectivity
    effective_from              date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to                date,

    -- Metadata
    metadata                    jsonb       NOT NULL DEFAULT '{}',

    -- Lifecycle
    status            shared.active_inactive_d                  NOT NULL DEFAULT 'active',
    is_active         boolean               GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT iprr_pkey            PRIMARY KEY (id),
    CONSTRAINT iprr_confidence_chk  CHECK (confidence BETWEEN 0 AND 1),
    CONSTRAINT iprr_amount_chk      CHECK (min_amount IS NULL OR max_amount IS NULL
                                        OR min_amount <= max_amount),
    CONSTRAINT iprr_contract_chk    CHECK (contract_value_min IS NULL OR contract_value_max IS NULL
                                        OR contract_value_min <= contract_value_max),
    CONSTRAINT iprr_effective_chk   CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

COMMENT ON TABLE control.intent_to_accounting_profile_rule IS
    'ARCHETYPE=B;SCOPE=T. Engine 4.13: multi-predicate profile matching. NULL predicate = wildcard. '
    'First match by ascending priority wins. Effective-dated. '
    'resolved_profile_config_id → control.acct_profile_config (composite FK in 06_constraints).';


-- §12  intent_profile_override — standing regulatory overrides (IFRS/ASC)
CREATE TABLE IF NOT EXISTS control.intent_profile_override (
    -- Identity
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,

    -- Scope
    company_code_id             uuid,
    intent_id                   uuid        NOT NULL,
    direction                   text,
    flow_code                   text,

    -- Override target
    override_profile_config_id  uuid        NOT NULL,
    reason                      text        NOT NULL,
    regulatory_reference        text,

    -- Governance
    approved_by                 uuid,
    approved_at                 timestamptz,

    -- Effectivity
    effective_from              date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to                date,

    -- Metadata
    metadata                    jsonb       NOT NULL DEFAULT '{}',

    -- Lifecycle
    status            text                  NOT NULL DEFAULT 'pending_approval',
    is_active         boolean               GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT ipo_pkey             PRIMARY KEY (id),
    CONSTRAINT ipo_status_chk       CHECK (status IN (
        'pending_approval','active','inactive','revoked')),
    CONSTRAINT ipo_effective_chk    CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT ipo_reason_nonempty  CHECK (btrim(reason) <> '')
);

COMMENT ON TABLE control.intent_profile_override IS
    'ARCHETYPE=B;SCOPE=T. Engine 4.13: standing regulatory overrides (IFRS/ASC references). '
    'Governance-gated: status=active only after approved_by is set. '
    'Takes precedence over intent_to_accounting_profile_rule at runtime.';


-- =============================================================================
-- DIMENSION POLICY + DOCUMENT SEQUENCE
-- Tables: dimension_policy, dimension_policy_allowed_value,
--         document_sequence_config, document_sequence_counter
-- Indexes  → 07_indexes/002_control.sql
-- FK refs  → 06_constraints/002_control.sql
-- Functions→ 08_functions/002_control.sql  (next_document_number)
-- Triggers → 09_triggers/002_control.sql
-- Seeds    → 900_seed_data/002_control/LookupDomain/control/dimension_*.sql
--            900_seed_data/002_control/LookupDomain/control/document_sequence_*.sql
-- =============================================================================

-- ── §DP1  control.dimension_policy — validation / governance rules ────────────
-- Purpose: "Department is REQUIRED on Expense accounts."
-- NOT derivation — derivation stays in control.acct_profile_dimension_rule.
-- Precedence: company-specific → tenant-global → no rule.
-- Allowed values listed in child table dimension_policy_allowed_value.
CREATE TABLE IF NOT EXISTS control.dimension_policy (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,

    -- Policy identity
    policy_code             text        NOT NULL,
    policy_version          smallint    NOT NULL DEFAULT 1,
    description             text,

    -- Dimension target
    dimension_type_id       uuid        NOT NULL,

    -- Company scope (NULL = tenant-global policy)
    company_code_id         uuid,

    -- Scope filters (all nullable — NULL = applies to everything in scope)
    scope_account_class     text,
    -- 'asset','liability','equity','income','expense'
    scope_account_id        uuid,
    -- specific GL account
    scope_subledger_type    text,
    -- 'AP','AR','ASSET','INVENTORY','WIP','COMMISSION','NONE'
    scope_book_id           uuid,
    -- specific ledger book
    scope_doc_type          text,
    -- 'PURCHASE_INVOICE','SALES_INVOICE','JE', etc.

    -- Policy rule
    behavior                text        NOT NULL DEFAULT 'OPTIONAL',
    fixed_value_id          uuid,
    -- required when behavior = 'FIXED_VALUE'
    derive_source           text,
    -- required when behavior = 'DERIVE_IF_MISSING'

    -- Dependencies
    depends_on_type_id      uuid,
    -- This dimension only applies if another type is present on the line
    mutually_exclusive_with uuid,
    -- Cannot coexist with another dimension type on the same line

    -- Priority (higher wins on conflict between matching policies)
    priority                smallint    NOT NULL DEFAULT 0,

    -- Metadata
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  shared.active_inactive_d        NOT NULL DEFAULT 'active',
    is_active               boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT dp_pkey          PRIMARY KEY (id),
    CONSTRAINT dp_tenant_id_uq  UNIQUE (tenant_id, id),
    CONSTRAINT dp_code_ver_uq   UNIQUE (tenant_id, policy_code, policy_version),
    CONSTRAINT dp_code_chk      CHECK (btrim(policy_code) <> ''),
    CONSTRAINT dp_behavior_chk  CHECK (behavior IN (
        'REQUIRED','OPTIONAL','FORBIDDEN',
        'DERIVE_IF_MISSING','INHERIT_FROM_HEADER','FIXED_VALUE')),
    CONSTRAINT dp_fixed_chk     CHECK (behavior <> 'FIXED_VALUE' OR fixed_value_id IS NOT NULL),
    CONSTRAINT dp_derive_chk    CHECK (behavior <> 'DERIVE_IF_MISSING' OR derive_source IS NOT NULL),
    CONSTRAINT dp_acct_class_chk CHECK (scope_account_class IS NULL
        OR scope_account_class IN ('asset','liability','equity','income','expense')),
    CONSTRAINT dp_subledger_chk CHECK (scope_subledger_type IS NULL
        OR scope_subledger_type IN ('AP','AR','ASSET','INVENTORY','WIP','COMMISSION','NONE'))
);

COMMENT ON TABLE control.dimension_policy IS
    'ARCHETYPE=B;SCOPE=T. Dimension validation / governance rules. '
    'Purpose: "Department is REQUIRED on Expense accounts." '
    'Evaluated at posting time to enforce dimension completeness. '
    'Does NOT derive values — derivation lives in acct_profile_dimension_rule. '
    'Precedence: exact company match → tenant-global → no rule. '
    'Allowed values listed in child table dimension_policy_allowed_value.';


-- ── §DP2  control.dimension_policy_allowed_value — indexable allowed-value list
-- Replaces uuid[] allowed_values on dimension_policy.
-- Separate table: indexable, auditable, FK-validated.
-- Cascade deletes on policy removal.
CREATE TABLE IF NOT EXISTS control.dimension_policy_allowed_value (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,

    policy_id           uuid        NOT NULL,
    dimension_value_id  uuid        NOT NULL,

    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,

    CONSTRAINT dpav_pkey            PRIMARY KEY (id),
    CONSTRAINT dpav_policy_value_uq UNIQUE (policy_id, dimension_value_id)
);

COMMENT ON TABLE control.dimension_policy_allowed_value IS
    'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Allowed dimension values for a policy. Replaces uuid[] column on dimension_policy. '
    'Indexable and FK-validated. Cascade deletes when parent policy is removed.';


-- ── §DS1  control.document_sequence_config — numbering configuration (cold) ───
-- Split design: config (cold, rarely changes) + counter (hot, increments per txn).
-- Avoids contention and noisy audit trails on config rows.
CREATE TABLE IF NOT EXISTS control.document_sequence_config (
    -- Identity
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,

    -- Scope
    company_code_id     uuid        NOT NULL,
    doc_type            text        NOT NULL,
    -- Controlled via lookup: 'control.document_sequence_doc_type'

    -- Format
    prefix              text        NOT NULL,
    -- e.g. 'INV', 'PI', 'JE', 'CN', 'SO'
    separator           text        NOT NULL DEFAULT '-',
    -- e.g. '-' → 'INV-2026-00001', '/' → 'INV/2026/00001'
    pad_width           smallint    NOT NULL DEFAULT 5,
    -- Zero-pad digits: 5 → 00001, 6 → 000001
    format_template     text,
    -- Optional override: '{prefix}{sep}{year}{sep}{seq}'
    -- NULL = default pattern: prefix + sep + year + sep + padded_seq

    -- Reset strategy
    reset_strategy      text        NOT NULL DEFAULT 'YEARLY',
    -- NONE = continuous; YEARLY = reset per fiscal year; MONTHLY = per period

    -- Metadata
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status              shared.active_inactive_d        NOT NULL DEFAULT 'active',
    is_active           boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,

    -- Audit
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT dsc_pkey             PRIMARY KEY (id),
    CONSTRAINT dsc_tenant_id_uq     UNIQUE (tenant_id, id),
    CONSTRAINT dsc_natural_uq       UNIQUE (tenant_id, company_code_id, doc_type),
    CONSTRAINT dsc_prefix_chk       CHECK (btrim(prefix) <> ''),
    CONSTRAINT dsc_doc_type_chk     CHECK (btrim(doc_type) <> ''),
    CONSTRAINT dsc_pad_width_chk    CHECK (pad_width BETWEEN 3 AND 10),
    CONSTRAINT dsc_reset_chk        CHECK (reset_strategy IN ('NONE','YEARLY','MONTHLY'))
);

COMMENT ON TABLE control.document_sequence_config IS
    'ARCHETYPE=B;SCOPE=T. Document numbering configuration. Cold table — rarely modified. '
    'One config per (company, doc_type). Format: prefix + separator + year + padded_seq. '
    'Actual counter state lives in document_sequence_counter (hot table).';


-- ── §DS2  control.document_sequence_counter — mutable counter state (hot) ────
-- Separated from config to avoid lock contention on config rows.
-- One row per (config, fiscal_year) or (config, fiscal_year, period)
-- depending on reset_strategy. Atomic increment via next_document_number().
CREATE TABLE IF NOT EXISTS control.document_sequence_counter (
    -- Natural composite PK — no surrogate uuid needed for hot counters
    tenant_id           uuid        NOT NULL,
    config_id           uuid        NOT NULL,

    -- Period scope
    fiscal_year         smallint    NOT NULL,
    period_number       smallint    NOT NULL DEFAULT 0,
    -- 0  = YEARLY or NONE strategy (single counter per year)
    -- 1-12 = MONTHLY strategy (counter per period)

    -- Counter
    last_value          integer     NOT NULL DEFAULT 0,

    -- Audit (minimal — updated on every document creation)
    updated_at          timestamptz NOT NULL DEFAULT now(),
    updated_by          uuid,

    CONSTRAINT dscc_pkey        PRIMARY KEY (tenant_id, config_id, fiscal_year, period_number),
    CONSTRAINT dscc_value_chk   CHECK (last_value >= 0),
    CONSTRAINT dscc_year_chk    CHECK (fiscal_year BETWEEN 2000 AND 2099),
    CONSTRAINT dscc_period_chk  CHECK (period_number BETWEEN 0 AND 16)
);

COMMENT ON TABLE control.document_sequence_counter IS
    'ARCHETYPE=C;SCOPE=T;DEVIATION. Hot counter table: no created_at/created_by; natural composite PK. Mutable counter state for document numbering. Hot table — updated every txn. '
    'Runtime state in control schema for locality (co-located with document_sequence_config). '
    'Not an audit table — no created_by/created_at; updated_by nullable (batch increments). '
    'Natural composite PK (tenant, config, year, period) for efficient upsert. '
    'period_number = 0 for YEARLY/NONE strategies. '
    'Atomic increment via control.next_document_number().';


-- =============================================================================
-- §13  control.classification_config — per-tenant AI classification preferences
-- =============================================================================
-- Singleton per tenant (PK = tenant_id). Phase 2 note: add company_code_id to
-- support company-specific overrides (NULL = tenant default).
-- FK → master.tenant → 06_constraints/002_control.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS control.classification_config (
    -- Identity
    tenant_id                       uuid        NOT NULL,

    -- Commodity classification
    primary_commodity_domain        text,
    trade_commodity_domain          text,
    is_commodity_code_required      boolean     NOT NULL DEFAULT false,
    is_trade_code_required          boolean     NOT NULL DEFAULT false,
    require_for_capex_above         numeric(18,4),
    require_for_capex_currency      character(3),
    is_required_for_regulated       boolean     NOT NULL DEFAULT true,

    -- Industry classification
    primary_industry_domain         text,

    -- AI automation
    is_auto_classify_enabled        boolean     NOT NULL DEFAULT true,
    is_auto_crosswalk_enabled       boolean     NOT NULL DEFAULT true,
    min_confidence_auto             numeric(5,2) NOT NULL DEFAULT 90.00,
    min_confidence_suggest          numeric(5,2) NOT NULL DEFAULT 60.00,
    crosswalk_strategy              text        NOT NULL DEFAULT 'BEST_MATCH',

    -- Cross-border rules
    cross_border_triggers           jsonb       NOT NULL
        DEFAULT '["SUPPLIER_COUNTRY_MISMATCH","SHIP_TO_MISMATCH","IMPORT_TAX","CUSTOMS_REQUIRED"]'::jsonb,

    -- Metadata
    metadata                        jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Audit
    created_at                      timestamptz NOT NULL DEFAULT now(),
    created_by                      uuid        NOT NULL,
    updated_at                      timestamptz,
    updated_by                      uuid,

    CONSTRAINT clscfg_pkey           PRIMARY KEY (tenant_id),
    -- Phase 2: PK will expand to (tenant_id, COALESCE(company_code_id, sentinel))
    CONSTRAINT clscfg_strategy_chk   CHECK (crosswalk_strategy IN (
        'EXACT_ONLY','BEST_MATCH','AI_ASSISTED')),
    CONSTRAINT clscfg_conf_auto_chk  CHECK (
        min_confidence_auto  >= 0 AND min_confidence_auto  <= 100),
    CONSTRAINT clscfg_conf_sugg_chk  CHECK (
        min_confidence_suggest >= 0 AND min_confidence_suggest <= 100),
    CONSTRAINT clscfg_conf_order_chk CHECK (
        min_confidence_auto >= min_confidence_suggest),
    CONSTRAINT clscfg_capex_chk      CHECK (
        require_for_capex_above IS NULL OR require_for_capex_above >= 0),
    CONSTRAINT clscfg_capex_curr_chk CHECK (
        require_for_capex_above IS NULL OR require_for_capex_currency IS NOT NULL)
);

COMMENT ON TABLE control.classification_config IS
    'ARCHETYPE=C;SCOPE=T. Per-tenant AI classification preferences. Singleton (PK = tenant_id). '
    'Phase 2: add company_code_id for company-specific overrides; '
    'precedence: company row → tenant row → platform defaults. '
    'crosswalk_strategy: EXACT_ONLY | BEST_MATCH | AI_ASSISTED.';


-- =============================================================================
-- §14  control.commodity_to_spend_category_rule — code → spend_category routing
-- =============================================================================
-- Answers: "Given incoming UNSPSC code 43211503, route to spend_category X."
-- Reverse direction of master.commodity_classification.
-- Range-based: code_from..code_to for subtree matching. Exact = code_to IS NULL.
-- Deterministic routing: UNIQUE(tenant, domain, code_from, priority) WHERE active.
-- FKs → 06_constraints/002_control.sql
-- Indexes → 07_indexes/002_control.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS control.commodity_to_spend_category_rule (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,

    -- Matching criteria (incoming code)
    commodity_domain_code   text        NOT NULL,
    match_mode              text        NOT NULL DEFAULT 'RANGE',
    -- Routing match strategy: EXACT, RANGE (default), PREFIX, CROSSWALK.
    code_from               text        NOT NULL,
    -- Inclusive range start. For EXACT match, set code_to = NULL.
    code_to                 text,
    -- Inclusive range end. NULL with match_mode=EXACT → exact match on code_from only.
    code_level              smallint,
    -- If set, match only at this hierarchy level (e.g. level=2 → UNSPSC segment).

    -- Resolution target
    spend_category_id       uuid        NOT NULL,

    -- Match priority + confidence
    priority                smallint    NOT NULL DEFAULT 0,
    -- Higher wins when multiple rules match. UNIQUE index prevents ties at same priority.
    confidence              numeric(5,2) NOT NULL DEFAULT 100.00,

    -- Metadata
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  shared.active_inactive_d        NOT NULL DEFAULT 'active',
    is_active               boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT ccrr_pkey            PRIMARY KEY (id),
    CONSTRAINT ccrr_tenant_id_uq    UNIQUE (tenant_id, id),
    CONSTRAINT ccrr_code_chk        CHECK (btrim(code_from) <> ''),
    CONSTRAINT ccrr_match_mode_chk   CHECK (match_mode IN ('EXACT','RANGE','PREFIX','CROSSWALK')),
    CONSTRAINT ccrr_range_chk       CHECK (code_to IS NULL OR code_to >= code_from),
    CONSTRAINT ccrr_confidence_chk  CHECK (confidence >= 0 AND confidence <= 100),
    CONSTRAINT ccrr_priority_chk    CHECK (priority >= 0)
);

COMMENT ON TABLE control.commodity_to_spend_category_rule IS
    'ARCHETYPE=B;SCOPE=T. Code → spend_category reverse-routing. match_mode governs strategy: '
    'EXACT, RANGE (default), PREFIX, CROSSWALK. '
    'Deterministic: UNIQUE(tenant, domain, code_from, priority) WHERE active '
    'prevents same-priority collisions. Tie-break: highest priority → exact over '
    'range → narrowest range → newest created_at. '
    'Replaces legacy spend_category_commodity_map.';

COMMENT ON COLUMN control.commodity_to_spend_category_rule.match_mode IS
    'Routing match strategy. Runtime resolver MUST implement all 4 modes: '
    'EXACT: code_from only, code_to must be NULL. Direct equality. '
    'RANGE: code_from..code_to inclusive lexical range (default). '
    'PREFIX: code_from is a prefix → match WHERE input LIKE code_from || ''%''. '
    'CROSSWALK: resolve input via shared.commodity_crosswalk first, then re-match. '
    'Priority: EXACT > PREFIX > RANGE > CROSSWALK. '
    'Resolver implementation: application layer.';


-- ============================================================================
-- TAX + FX ENGINE — Control schema tables
-- ============================================================================

-- ── control.rounding_rule ────────────────────────────────────────────────────
-- precision_digits NULL = derive from shared.currency.minor_units at runtime.
-- Explicit value overrides currency default (0 for JPY, 3 for KWD).
CREATE TABLE IF NOT EXISTS control.rounding_rule (
    -- Identity
    id                  uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid            NOT NULL,

    -- Table-specific
    code                text            NOT NULL,
    name                text            NOT NULL,
    method              text            NOT NULL DEFAULT 'ROUND_HALF_UP',
    precision_digits    smallint,
    minimum_unit        numeric(18,6),

    -- GL variance approval (H5 P2-hygiene)
    -- Regulated environments (e.g. IFRS statutory audit) may require explicit GL sign-off
    -- when rounding produces a variance journal entry before the period can be closed.
    gl_variance_approval_required boolean NOT NULL DEFAULT false,

    -- Metadata
    metadata            jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status              shared.active_inactive_d            NOT NULL DEFAULT 'active',
    is_active           boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,

    -- Audit
    created_at          timestamptz     NOT NULL DEFAULT now(),
    created_by          uuid            NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT rr_pkey              PRIMARY KEY (id),
    CONSTRAINT rr_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT rr_code_uq           UNIQUE (tenant_id, code),
    CONSTRAINT rr_code_chk          CHECK (btrim(code) <> ''),
    CONSTRAINT rr_method_chk        CHECK (method IN (
        'ROUND_HALF_UP','ROUND_HALF_EVEN','ROUND_DOWN','ROUND_UP')),
    CONSTRAINT rr_precision_chk     CHECK (precision_digits IS NULL OR precision_digits BETWEEN 0 AND 6),
    CONSTRAINT rr_min_unit_chk      CHECK (minimum_unit IS NULL OR minimum_unit > 0)
);
COMMENT ON TABLE control.rounding_rule IS
    'ARCHETYPE=B;SCOPE=T. Rounding configuration per tenant. precision_digits NULL = runtime reads '
    'shared.currency.minor_units. Explicit value overrides currency default. '
    'minimum_unit for coinage gaps (CHF 0.05). '
    'gl_variance_approval_required: regulated environments (IFRS statutory audit) may require '
    'explicit GL sign-off when rounding generates a variance journal entry; blocks period-close '
    'gate until approved by a finance controller.';


-- ── control.tax_rate_schedule ─────────────────────────────────────────────────
-- Unified rate table. tax_code ELIMINATED: identity is structured
-- (jurisdiction + type + direction + component + scopes + priority + effectivity).
-- trs_tenant_id_uq enables tenant-composite FK from tax_group_component and tax_calculation.
CREATE TABLE IF NOT EXISTS control.tax_rate_schedule (
    -- Identity
    id                              uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                       uuid            NOT NULL,

    -- Core identity (replaces traditional tax_code)
    jurisdiction_id                 uuid            NOT NULL,
    tax_type_id                     uuid            NOT NULL,

    -- Direction + component
    tax_direction                   text            NOT NULL,
    component_code                  text,

    -- Rate
    rate_kind                       text            NOT NULL DEFAULT 'PERCENT',
    rate_value                      numeric(18,6)   NOT NULL,
    rate_currency                   character(3),

    -- Recoverability
    recoverability_mode             text            NOT NULL DEFAULT 'NONE',
    recoverability_percent          numeric(5,2),

    -- Reverse charge
    reverse_charge_mode             text            NOT NULL DEFAULT 'NONE',

    -- Calculation
    calculation_basis               text            NOT NULL DEFAULT 'LINE_NET',

    -- Rounding
    rounding_stage                  text            NOT NULL DEFAULT 'LINE',
    rounding_rule_id                uuid,

    -- WHT-specific
    wht_basis                       text,
    wht_certificate_required        boolean         NOT NULL DEFAULT false,
    treaty_country_code             character(2),
    treaty_rate_value               numeric(18,6),

    -- Scope filters (NULL = wildcard)
    scope_company_code_id           uuid,
    scope_spend_category_id         uuid,
    scope_commodity_domain_code     text,
    scope_commodity_code            text,
    scope_industry_domain_code      text,
    scope_industry_code             text,
    scope_counterparty_country      character(2),
    scope_counterparty_tax_status   text,
    scope_doc_type                  text,

    -- Resolution
    priority                        smallint        NOT NULL DEFAULT 0,
    description                     text,

    -- Effectivity
    effective_from                  date            NOT NULL,
    effective_to                    date,

    -- Metadata
    metadata                        jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                          shared.active_inactive_d            NOT NULL DEFAULT 'active',
    is_active                       boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at               timestamptz,
    status_changed_by               uuid,

    -- Audit
    created_at                      timestamptz     NOT NULL DEFAULT now(),
    created_by                      uuid            NOT NULL,
    updated_at                      timestamptz,
    updated_by                      uuid,

    CONSTRAINT trs_pkey                 PRIMARY KEY (id),
    CONSTRAINT trs_tenant_id_uq         UNIQUE (tenant_id, id),
    CONSTRAINT trs_direction_chk        CHECK (tax_direction IN (
        'PURCHASE','SALE','PAYMENT','IMPORT','EXPORT','BOTH')),
    CONSTRAINT trs_rate_kind_chk        CHECK (rate_kind IN ('PERCENT','FIXED','PER_UNIT')),
    CONSTRAINT trs_rate_chk             CHECK (
        (rate_kind = 'PERCENT' AND rate_value >= 0 AND rate_value <= 100)
        OR (rate_kind IN ('FIXED','PER_UNIT') AND rate_value >= 0)),
    CONSTRAINT trs_rate_currency_chk    CHECK (rate_kind = 'PERCENT' OR rate_currency IS NOT NULL),
    CONSTRAINT trs_effective_chk        CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT trs_recover_chk          CHECK (recoverability_mode IN ('FULL','PARTIAL','NONE','CONDITIONAL')),
    CONSTRAINT trs_recover_pct_chk      CHECK (recoverability_mode <> 'PARTIAL' OR recoverability_percent IS NOT NULL),
    CONSTRAINT trs_recover_range        CHECK (recoverability_percent IS NULL
        OR (recoverability_percent >= 0 AND recoverability_percent <= 100)),
    CONSTRAINT trs_reverse_chk          CHECK (reverse_charge_mode IN ('NONE','SELF_ASSESS','FULL')),
    CONSTRAINT trs_basis_chk            CHECK (calculation_basis IN (
        'LINE_NET','LINE_GROSS','DOCUMENT_NET','DOCUMENT_GROSS','PAYMENT_AMOUNT')),
    CONSTRAINT trs_round_stage_chk      CHECK (rounding_stage IN (
        'LINE','COMPONENT','DOCUMENT','JURISDICTION_BUCKET')),
    CONSTRAINT trs_wht_basis_chk        CHECK (wht_basis IS NULL
        OR wht_basis IN ('GROSS','NET_OF_INDIRECT_TAX','PAYMENT_ONLY')),
    CONSTRAINT trs_treaty_rate_chk      CHECK (
        treaty_rate_value IS NULL
        OR (treaty_country_code IS NOT NULL AND treaty_rate_value >= 0
            AND (rate_kind <> 'PERCENT' OR treaty_rate_value <= rate_value))),
    CONSTRAINT trs_cp_status_chk        CHECK (
        scope_counterparty_tax_status IS NULL
        OR scope_counterparty_tax_status IN (
            'REGISTERED','UNREGISTERED','EXEMPT','FOREIGN','TREATY'))
);
COMMENT ON TABLE control.tax_rate_schedule IS
    'ARCHETYPE=B;SCOPE=T. Unified tax rate table. tax_code eliminated — identity is structured: '
    '(jurisdiction + tax_type + direction + component + scopes + priority + effective dates). '
    'trs_tenant_id_uq enables tenant-composite FK from tax_group_component and tax_calculation. '
    'Temporal EXCLUDE prevents overlapping active rules with same scope + priority.';

-- Temporal non-overlap: two active rules with identical scope + priority cannot overlap in time.
ALTER TABLE control.tax_rate_schedule DROP CONSTRAINT IF EXISTS trs_temporal_excl;
ALTER TABLE control.tax_rate_schedule ADD CONSTRAINT trs_temporal_excl
    EXCLUDE USING gist (
        tenant_id                                                                       WITH =,
        jurisdiction_id                                                                 WITH =,
        tax_type_id                                                                     WITH =,
        tax_direction                                                                   WITH =,
        COALESCE(component_code, '')                                                    WITH =,
        priority                                                                        WITH =,
        COALESCE(scope_company_code_id,         '00000000-0000-0000-0000-000000000000') WITH =,
        COALESCE(scope_spend_category_id,       '00000000-0000-0000-0000-000000000000') WITH =,
        COALESCE(scope_commodity_domain_code,   '')                                     WITH =,
        COALESCE(scope_commodity_code,          '')                                     WITH =,
        COALESCE(scope_industry_domain_code,    '')                                     WITH =,
        COALESCE(scope_industry_code,           '')                                     WITH =,
        COALESCE(scope_counterparty_country,    '__')                                   WITH =,
        COALESCE(scope_counterparty_tax_status, '')                                     WITH =,
        COALESCE(scope_doc_type,                '')                                     WITH =,
        daterange(effective_from, COALESCE(effective_to, '9999-12-31'::date), '[]')     WITH &&
    ) WHERE (is_active = true);


-- ── control.tax_group ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS control.tax_group (
    -- Identity
    id                  uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid            NOT NULL,

    -- Table-specific
    code                text            NOT NULL,
    name                text            NOT NULL,
    description         text,
    is_compound         boolean         NOT NULL DEFAULT false,

    -- Metadata
    metadata            jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status              shared.active_inactive_d            NOT NULL DEFAULT 'active',
    is_active           boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,

    -- Audit
    created_at          timestamptz     NOT NULL DEFAULT now(),
    created_by          uuid            NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT tg_pkey              PRIMARY KEY (id),
    CONSTRAINT tg_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT tg_code_uq           UNIQUE (tenant_id, code),
    CONSTRAINT tg_code_chk          CHECK (btrim(code) <> '')
);
COMMENT ON TABLE control.tax_group IS
    'ARCHETYPE=B;SCOPE=T. Named collection of tax rate schedules applied as a unit to documents. '
    'is_compound=true: components apply sequentially (each base = previous subtotal).';


-- ── control.tax_group_component ──────────────────────────────────────────────
-- FK to tax_rate_schedule uses tenant-composite (tenant_id, tax_rate_schedule_id)
-- consistent with platform tenant-isolation conventions.
CREATE TABLE IF NOT EXISTS control.tax_group_component (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Table-specific
    tax_group_id            uuid            NOT NULL,
    tax_rate_schedule_id    uuid            NOT NULL,
    calculation_seq         smallint        NOT NULL,
    rate_override           numeric(18,6),

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  shared.active_inactive_d            NOT NULL DEFAULT 'active',
    is_active               boolean         GENERATED ALWAYS AS (status = 'active') STORED,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT tgc_pkey             PRIMARY KEY (id),
    CONSTRAINT tgc_tenant_id_uq     UNIQUE (tenant_id, id),
    CONSTRAINT tgc_group_seq_uq     UNIQUE (tax_group_id, calculation_seq),
    CONSTRAINT tgc_group_rate_uq    UNIQUE (tax_group_id, tax_rate_schedule_id),
    CONSTRAINT tgc_seq_chk          CHECK (calculation_seq > 0),
    CONSTRAINT tgc_override_chk     CHECK (rate_override IS NULL OR rate_override >= 0)
);
COMMENT ON TABLE control.tax_group_component IS
    'ARCHETYPE=B_LITE;SCOPE=T. Bridge: tax_group → tax_rate_schedule. calculation_seq orders evaluation. '
    'rate_override allows group-level rate substitution without touching the global schedule. '
    'FK to tax_rate_schedule uses tenant-composite for cross-tenant isolation.';


-- ── control.wht_threshold_config ─────────────────────────────────────────────
-- R7-A: per-vendor WHT activation threshold rules.
-- Jurisdiction-specific (e.g. IN-TDS section 194C, PH-EWT).
-- Answers: "does WHT apply before a vendor crosses X in payments this period?"
-- per_transaction=true → threshold applies per-payment (no accumulation needed).
-- per_transaction=false → threshold applies to YTD total; wht_vendor_accumulator tracks it.
CREATE TABLE IF NOT EXISTS control.wht_threshold_config (
    -- Identity
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,

    -- Scope
    jurisdiction_id     uuid        NOT NULL,           -- FK → master.tax_jurisdiction (tenant-composite)
    tax_type_id         uuid        NOT NULL,           -- FK → master.tax_type (tenant-composite)
    section_code        text,                           -- e.g. '194C', '194J', 'EWT-professional'

    -- Threshold rule
    threshold_amount    numeric(18,4) NOT NULL,
    threshold_currency  character(3)  NOT NULL,
    reset_period        text        NOT NULL DEFAULT 'fiscal_year',
    per_transaction     boolean     NOT NULL DEFAULT false,

    -- Lifecycle
    is_active           boolean     NOT NULL DEFAULT true,
    effective_from      date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to        date,

    -- Audit
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT wtc_pkey              PRIMARY KEY (id),
    CONSTRAINT wtc_amount_pos        CHECK (threshold_amount > 0),
    CONSTRAINT wtc_reset_chk         CHECK (reset_period IN (
        'fiscal_year', 'calendar_year', 'contract')),
    CONSTRAINT wtc_section_nonempty  CHECK (section_code IS NULL OR btrim(section_code) <> ''),
    CONSTRAINT wtc_effective_order   CHECK (effective_to IS NULL OR effective_to > effective_from),
    CONSTRAINT wtc_natural_uq        UNIQUE NULLS NOT DISTINCT (
        tenant_id, jurisdiction_id, tax_type_id, section_code)
);

COMMENT ON TABLE control.wht_threshold_config IS
    'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (no status column). R7-A: per-vendor WHT activation thresholds (India TDS, Philippines EWT, etc.). '
    'per_transaction=false: WHT only activates after vendor YTD payments exceed '
    'threshold_amount in reset_period — accumulation tracked in aggregate.wht_vendor_accumulator. '
    'per_transaction=true: WHT applies per-payment regardless of prior payments.';




-- ============================================================================
-- Part C: Planning engine, bank format rules
-- ============================================================================

-- ══════════════════════════════════════════════════════════════════════════════
-- BUDGET · COMMITMENT · PLANNING ENGINE — Control tables
-- ══════════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- §PL1  control.forecast_line — scenario line items
-- ============================================================================
-- Each line = one account + dimension combination for a period range.
-- variance_amount = GENERATED (total - prior_year). Driver-linked lines
-- are recalculated when assumptions change.
-- ============================================================================
CREATE TABLE IF NOT EXISTS control.forecast_line (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Parent scenario
    scenario_id             uuid            NOT NULL,

    -- Line sequencing
    line_no                 smallint        NOT NULL,

    -- Account
    gl_account_id           uuid,
    spend_category_id       uuid,
    intent_id               uuid,

    -- Dimensions
    cost_center_id          uuid,
    profit_center_id        uuid,
    project_id              uuid,
    budget_allocation_id    uuid,
    dimension_set_id        uuid,

    -- Organisational
    company_code_id         uuid,

    -- Period scope
    fiscal_year             smallint        NOT NULL,
    period_from             smallint        NOT NULL DEFAULT 1,
    period_to               smallint        NOT NULL DEFAULT 12,

    -- Amounts
    currency_code           character(3)    NOT NULL,
    total_amount            numeric(18,4)   NOT NULL DEFAULT 0,
    period_amounts          jsonb,          -- per-period breakdown: {"1": amount, "2": amount, ...}

    -- Spread method
    spread_method           text            NOT NULL DEFAULT 'EVEN',

    -- Driver linkage (optional)
    driver_id               uuid,
    planning_driver_assumption_id    uuid,
    is_driver_calculated    boolean         NOT NULL DEFAULT false,

    -- Comparison
    prior_year_amount       numeric(18,4),
    variance_amount         numeric(18,4)   GENERATED ALWAYS AS (
                                total_amount - COALESCE(prior_year_amount, 0)
                            ) STORED,
    variance_pct            numeric(8,4),

    -- Confidence
    confidence              numeric(3,2)    NOT NULL DEFAULT 1.00,
    probability_weight      numeric(5,4)    NOT NULL DEFAULT 1.0000,

    -- Narrative
    description             text,
    justification           text,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  text            NOT NULL DEFAULT 'active',
    is_active               boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT fl_pkey                  PRIMARY KEY (id),
    CONSTRAINT fl_scenario_line_uq      UNIQUE (tenant_id, scenario_id, line_no),
    CONSTRAINT fl_status_chk            CHECK (status IN ('active','excluded','superseded')),
    CONSTRAINT fl_spread_chk            CHECK (spread_method IN (
        'EVEN','FRONT_LOADED','BACK_LOADED','SEASONAL','STEP','CUSTOM')),
    CONSTRAINT fl_period_range_chk      CHECK (
        period_from BETWEEN 1 AND 16
        AND period_to BETWEEN 1 AND 16
        AND period_from <= period_to),
    CONSTRAINT fl_confidence_chk        CHECK (confidence BETWEEN 0 AND 1),
    CONSTRAINT fl_probability_chk       CHECK (probability_weight BETWEEN 0 AND 1)
);

COMMENT ON TABLE control.forecast_line IS
    'ARCHETYPE=B;SCOPE=T. Individual forecast line within a scenario. One line = one account + dimension '
    'combination for a period range. period_amounts JSONB for per-period breakdown. '
    'variance_amount = GENERATED (total - prior_year). '
    'Driver-linked lines (is_driver_calculated) are recalculated when assumptions change. '
    'budget_allocation_id narrows to a specific fund center.';


-- ============================================================================
-- §PL2  control.planning_driver — driver definitions for planning models
-- ============================================================================
-- Named, reusable business metric feeding planning model calculations.
-- Input drivers: user-entered. Derived drivers: formula-calculated.
-- depends_on_drivers[] tracks topological order for recalculation.
-- NOTE: uuid[] has no DB-level referential integrity; enforced at service layer.
-- ============================================================================
CREATE TABLE IF NOT EXISTS control.planning_driver (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    code                    text            NOT NULL,
    name                    text            NOT NULL,

    -- Parent model
    planning_model_id       uuid            NOT NULL,

    -- Classification
    description             text,
    driver_type             text            NOT NULL DEFAULT 'QUANTITY',
    driver_category         text,
    data_type               text            NOT NULL DEFAULT 'NUMERIC',
    uom_code                text,

    -- Behaviour
    aggregation_method      text            NOT NULL DEFAULT 'SUM',
    time_allocation         text            NOT NULL DEFAULT 'PERIOD_END',
    is_input                boolean         NOT NULL DEFAULT true,
    is_derived              boolean         NOT NULL DEFAULT false,

    -- Defaults / bounds
    default_value           numeric(18,4),
    min_value               numeric(18,4),
    max_value               numeric(18,4),

    -- Dependency graph (topological ordering; no DB FK — enforced at service layer)
    depends_on_drivers      uuid[]          NOT NULL DEFAULT '{}',

    -- Versioning
    version                 integer         NOT NULL DEFAULT 1,

    -- Display
    sort_order              smallint        NOT NULL DEFAULT 0,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  text            NOT NULL DEFAULT 'active',
    is_active               boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT pd_pkey                  PRIMARY KEY (id),
    CONSTRAINT pd_tenant_id_uq          UNIQUE (tenant_id, id),
    CONSTRAINT pd_model_code_ver_uq     UNIQUE (tenant_id, planning_model_id, code, version),
    CONSTRAINT pd_code_nonempty         CHECK (btrim(code) <> ''),
    CONSTRAINT pd_name_nonempty         CHECK (btrim(name) <> ''),
    CONSTRAINT pd_status_chk            CHECK (status IN ('active','deprecated','draft')),
    CONSTRAINT pd_type_chk              CHECK (driver_type IN (
        'QUANTITY','RATE','PERCENTAGE','CURRENCY','INDEX','RATIO','HEADCOUNT','GROWTH_RATE')),
    CONSTRAINT pd_data_type_chk         CHECK (data_type IN (
        'NUMERIC','INTEGER','PERCENTAGE','CURRENCY','BOOLEAN')),
    CONSTRAINT pd_aggregation_chk       CHECK (aggregation_method IN (
        'SUM','AVERAGE','WEIGHTED_AVG','LAST','FIRST','MIN','MAX','COUNT')),
    CONSTRAINT pd_time_alloc_chk        CHECK (time_allocation IN (
        'PERIOD_END','PERIOD_START','PERIOD_AVG','POINT_IN_TIME')),
    CONSTRAINT pd_version_chk           CHECK (version >= 1),
    CONSTRAINT pd_min_max_chk           CHECK (max_value IS NULL OR min_value IS NULL
                                               OR min_value <= max_value),
    CONSTRAINT pd_derived_input_excl    CHECK (NOT (is_input AND is_derived))
);

COMMENT ON TABLE control.planning_driver IS
    'ARCHETYPE=B;SCOPE=T. Named business metric feeding planning model calculations: headcount, cost/unit, '
    'inflation, occupancy, etc. Input drivers are user-entered; derived drivers are '
    'formula-calculated (see control.planning_driver_formula). '
    'depends_on_drivers[] tracks topological ordering for recalculation. '
    'NOTE: uuid[] FK integrity is enforced at the service layer, not the DB.';


-- ============================================================================
-- §PL3  control.planning_driver_formula — formula / expression per driver
-- ============================================================================
-- Calculation formula for derived drivers. Versioned + effective-dated.
-- Formula must have expression OR formula_json (or both).
-- ============================================================================
CREATE TABLE IF NOT EXISTS control.planning_driver_formula (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Parent driver
    driver_id               uuid            NOT NULL,

    -- Formula definition
    formula_type            text            NOT NULL DEFAULT 'EXPRESSION',
    expression              text,           -- arithmetic string referencing driver codes
    formula_json            jsonb,          -- lookup table or conditional rule set

    -- Inputs
    input_driver_ids        uuid[]          NOT NULL DEFAULT '{}',

    -- Rounding
    rounding_mode           text            NOT NULL DEFAULT 'HALF_UP',
    decimal_places          smallint        NOT NULL DEFAULT 2,

    -- Conditional guard
    condition_expression    text,
    fallback_value          numeric(18,4),

    -- Versioning + effective dating
    version                 integer         NOT NULL DEFAULT 1,
    effective_from          date            NOT NULL DEFAULT CURRENT_DATE,
    effective_to            date,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  text            NOT NULL DEFAULT 'active',
    is_active               boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT pdf_pkey                 PRIMARY KEY (id),
    CONSTRAINT pdf_driver_ver_uq        UNIQUE (driver_id, version),
    CONSTRAINT pdf_status_chk           CHECK (status IN ('active','deprecated','draft')),
    CONSTRAINT pdf_type_chk             CHECK (formula_type IN (
        'EXPRESSION','LOOKUP_TABLE','CONDITIONAL','RULE_SET','SCRIPT')),
    CONSTRAINT pdf_rounding_chk         CHECK (rounding_mode IN (
        'HALF_UP','HALF_DOWN','HALF_EVEN','CEILING','FLOOR','TRUNCATE')),
    CONSTRAINT pdf_decimal_chk          CHECK (decimal_places BETWEEN 0 AND 8),
    CONSTRAINT pdf_version_chk          CHECK (version >= 1),
    CONSTRAINT pdf_effective_chk        CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT pdf_formula_present_chk  CHECK (expression IS NOT NULL OR formula_json IS NOT NULL)
);

COMMENT ON TABLE control.planning_driver_formula IS
    'ARCHETYPE=B;SCOPE=T. Calculation formula for derived planning drivers. '
    'EXPRESSION = arithmetic string referencing driver codes. '
    'LOOKUP_TABLE = interpolation via formula_json. '
    'CONDITIONAL = expression with condition guard. '
    'Versioned (driver_id, version) + effective-dated.';


-- ============================================================================
-- §PL4  control.planning_driver_assumption — concrete values for input drivers
-- ============================================================================
-- Actual numbers used in a planning cycle. Multiple assumptions per driver
-- enable scenario modelling. Optional dimensional scope narrows applicability.
-- ============================================================================
CREATE TABLE IF NOT EXISTS control.planning_driver_assumption (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Parent driver
    driver_id               uuid            NOT NULL,

    -- Scenario linkage (NULL = global / default assumption)
    scenario_id             uuid,

    -- Assumption identity
    assumption_name         text            NOT NULL,

    -- Fiscal scope
    fiscal_year             smallint        NOT NULL,
    period_from             smallint        NOT NULL DEFAULT 1,
    period_to               smallint        NOT NULL DEFAULT 12,

    -- Value
    assumption_value        numeric(18,4)   NOT NULL,
    period_values           jsonb,          -- per-period override: {"1": val, "2": val, ...}

    -- Dimensional scope (NULL = all)
    company_code_id         uuid,
    cost_center_id          uuid,
    project_id              uuid,

    -- Growth / change modelling
    growth_rate             numeric(8,4),
    growth_method           text,

    -- Confidence
    confidence              numeric(3,2)    NOT NULL DEFAULT 1.00,
    source                  text            NOT NULL DEFAULT 'MANUAL',

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  text            NOT NULL DEFAULT 'active',
    is_active               boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT da_pkey                  PRIMARY KEY (id),
    CONSTRAINT da_status_chk            CHECK (status IN ('active','superseded','draft','excluded')),
    CONSTRAINT da_confidence_chk        CHECK (confidence BETWEEN 0 AND 1),
    CONSTRAINT da_source_chk            CHECK (source IN (
        'MANUAL','HISTORICAL','STATISTICAL','EXTERNAL','MODEL_OUTPUT','IMPORTED')),
    CONSTRAINT da_period_range_chk      CHECK (
        period_from BETWEEN 1 AND 16
        AND period_to BETWEEN 1 AND 16
        AND period_from <= period_to),
    CONSTRAINT da_growth_method_chk     CHECK (growth_method IS NULL OR growth_method IN (
        'COMPOUND','LINEAR','STEP','SEASONAL','CUSTOM'))
);

COMMENT ON TABLE control.planning_driver_assumption IS
    'ARCHETYPE=B;SCOPE=T. Concrete value assumptions for input planning drivers. E.g. headcount = 150, '
    'inflation = 3.5%. scenario_id links to document.forecast_scenario for what-if '
    'modelling (NULL = global/default). Dimensional scope narrows applicability.';


-- ============================================================================
-- §PL5  control.planning_driver_version — versioned snapshot of driver assumptions
-- ============================================================================
-- Immutable point-in-time snapshot of all assumptions for a driver.
-- Enables audit trail and rollback during planning cycles. Insert-only.
-- ============================================================================
CREATE TABLE IF NOT EXISTS control.planning_driver_version (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Parent driver
    driver_id               uuid            NOT NULL,

    -- Version
    version_number          integer         NOT NULL,
    version_label           text,

    -- Snapshot (immutable — captured at version time)
    assumptions_snapshot    jsonb           NOT NULL,
    computed_output         jsonb,

    -- Provenance
    snapshot_reason         text            NOT NULL DEFAULT 'MANUAL',
    triggered_by            text,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Audit (no updated_at — immutable)
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,

    CONSTRAINT pdv_pkey                 PRIMARY KEY (id),
    CONSTRAINT pdv_driver_version_uq    UNIQUE (driver_id, version_number),
    CONSTRAINT pdv_version_chk          CHECK (version_number >= 1),
    CONSTRAINT pdv_reason_chk           CHECK (snapshot_reason IN (
        'MANUAL','APPROVAL','PERIOD_CLOSE','REFORECAST','IMPORT','ROLLBACK'))
);

COMMENT ON TABLE control.planning_driver_version IS
    'ARCHETYPE=D;SCOPE=T;SUBTYPE=SNAPSHOT. IMMUTABLE (insert-only) point-in-time snapshot of driver assumptions. '
    'Used for audit trail, comparison, and rollback during planning cycles. '
    'log.trg_prevent_mutation() should be applied to enforce immutability.';


-- ============================================================================
-- §BK5  control.bank_format_rule — country + rail validation policy
-- ============================================================================
-- Platform default + tenant override. tenant_id IS NULL = global default.
-- ============================================================================

CREATE TABLE IF NOT EXISTS control.bank_format_rule (
    -- Identity
    id                          uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid,

    -- Rule identity
    code                        text            NOT NULL,
    name                        text            NOT NULL,
    description                 text,

    -- Applicability
    country_code                character(2)    NOT NULL,
    payment_network             text            NOT NULL,
    direction                   text            NOT NULL DEFAULT 'BOTH',
    currency_code               character(3),

    -- Required identifier policy
    account_id_type             text            NOT NULL,
    bank_id_type                text            NOT NULL,
    is_account_id_required      boolean         NOT NULL DEFAULT true,
    is_bank_id_required         boolean         NOT NULL DEFAULT true,
    is_bic_allowed              boolean         NOT NULL DEFAULT true,
    is_bic_required             boolean         NOT NULL DEFAULT false,
    is_branch_code_required     boolean         NOT NULL DEFAULT false,
    is_national_bank_code_required boolean      NOT NULL DEFAULT false,

    -- Validation patterns
    account_pattern             text,
    bank_id_pattern             text,
    branch_code_pattern         text,
    iban_country_prefix         character(2),
    is_checksum_validated       boolean         NOT NULL DEFAULT false,
    validation_schema           jsonb,

    -- Behavior
    priority                    smallint        NOT NULL DEFAULT 0,

    -- Metadata
    metadata                    jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                      text            NOT NULL DEFAULT 'active',
    is_active                   boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at           timestamptz,
    status_changed_by           uuid,

    -- Audit
    created_at                  timestamptz     NOT NULL DEFAULT now(),
    created_by                  uuid            NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT bank_format_rule_pkey            PRIMARY KEY (id),
    CONSTRAINT bfr_code_nonempty                CHECK (btrim(code) <> ''),
    CONSTRAINT bfr_name_nonempty                CHECK (btrim(name) <> ''),
    CONSTRAINT bfr_country_upper_chk            CHECK (country_code = upper(country_code)),
    CONSTRAINT bfr_currency_upper_chk           CHECK (
        currency_code IS NULL OR currency_code = upper(currency_code)
    ),
    CONSTRAINT bfr_iban_prefix_chk              CHECK (
        iban_country_prefix IS NULL OR iban_country_prefix = upper(iban_country_prefix)
    ),
    CONSTRAINT bfr_priority_chk                 CHECK (priority >= 0),
    CONSTRAINT bfr_bic_logic_chk                CHECK (
        NOT is_bic_required OR is_bic_allowed
    ),
    CONSTRAINT bfr_validation_schema_chk        CHECK (
        validation_schema IS NULL OR jsonb_typeof(validation_schema) = 'object'
    )
);

COMMENT ON TABLE control.bank_format_rule IS
    'ARCHETYPE=B;SCOPE=G. Country + payment rail validation policy for bank account identifiers. '
    'Platform default (tenant_id IS NULL) + tenant override. '
    'Determines required fields, patterns, and validation for each country/rail combo.';


-- ============================================================================
-- §PM2  control.payment_method_company_policy — eligibility + defaulting
-- ============================================================================

CREATE TABLE IF NOT EXISTS control.payment_method_company_policy (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Scope
    company_code_id         uuid            NOT NULL,
    payment_method_id       uuid            NOT NULL,
    direction               text            NOT NULL DEFAULT 'OUTBOUND',
    currency_code           character(3),

    -- Preferred house bank
    bank_account_link_id    uuid,

    -- Amount controls
    min_amount              numeric(18,4),
    max_amount              numeric(18,4),

    -- Defaults and controls
    is_default              boolean         NOT NULL DEFAULT false,
    is_manual_allowed       boolean         NOT NULL DEFAULT true,
    is_file_allowed         boolean         NOT NULL DEFAULT true,
    is_api_allowed          boolean         NOT NULL DEFAULT false,
    requires_dual_approval  boolean         NOT NULL DEFAULT false,

    -- Cutoff
    cutoff_time_local       time,
    timezone_code           text,

    -- Priority
    priority                smallint        NOT NULL DEFAULT 0,

    -- Temporal
    effective_from          date            NOT NULL DEFAULT CURRENT_DATE,
    effective_until         date,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  text            NOT NULL DEFAULT 'active',
    is_active               boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT pmcp_pkey                    PRIMARY KEY (id),
    CONSTRAINT pmcp_tenant_id_uq            UNIQUE (tenant_id, id),
    CONSTRAINT pmcp_effective_chk           CHECK (
        effective_until IS NULL OR effective_until > effective_from
    ),
    CONSTRAINT pmcp_amount_chk              CHECK (
        min_amount IS NULL OR max_amount IS NULL OR min_amount <= max_amount
    ),
    CONSTRAINT pmcp_amount_nonneg           CHECK (
        (min_amount IS NULL OR min_amount >= 0) AND
        (max_amount IS NULL OR max_amount >= 0)
    ),
    CONSTRAINT pmcp_priority_chk            CHECK (priority >= 0),
    CONSTRAINT pmcp_cutoff_tz_pair_chk      CHECK (
        (cutoff_time_local IS NULL AND timezone_code IS NULL)
        OR (cutoff_time_local IS NOT NULL AND timezone_code IS NOT NULL)
    )
);

COMMENT ON TABLE control.payment_method_company_policy IS
    'ARCHETYPE=B;SCOPE=T. Runtime eligibility and defaulting per company + method + direction. '
    'Answers: is this method allowed? For which currency/amount range? '
    'Which house bank? File or manual? Cutoff time?';

COMMENT ON COLUMN control.payment_method_company_policy.bank_account_link_id IS
    'Preferred/forced house-bank link for this policy. FK to '
    'master.bank_account_link. When set, must belong to the same '
    'company_code_id (validated by trigger).';


-- ============================================================================
-- §PM3  control.bank_interface_profile — remittance / bank integration
-- ============================================================================

CREATE TABLE IF NOT EXISTS control.bank_interface_profile (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    code                    text            NOT NULL,
    name                    text            NOT NULL,
    description             text,

    -- Interface classification
    interface_type          text            NOT NULL,
    payment_network         text,
    file_format_code        text,
    provider_code           text,
    message_version         text,

    -- Provider configuration (encrypt at app layer)
    config                  jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Capabilities
    supports_remittance_advice  boolean     NOT NULL DEFAULT false,
    supports_acknowledgement    boolean     NOT NULL DEFAULT false,
    supports_status_pull        boolean     NOT NULL DEFAULT false,
    supports_return_file        boolean     NOT NULL DEFAULT false,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  text            NOT NULL DEFAULT 'active',
    is_active               boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT bip_pkey                     PRIMARY KEY (id),
    CONSTRAINT bip_tenant_id_uq             UNIQUE (tenant_id, id),
    CONSTRAINT bip_tenant_code_uq           UNIQUE (tenant_id, code),
    CONSTRAINT bip_code_nonempty            CHECK (btrim(code) <> ''),
    CONSTRAINT bip_name_nonempty            CHECK (btrim(name) <> '')
);

COMMENT ON TABLE control.bank_interface_profile IS
    'ARCHETYPE=B;SCOPE=T. Describes HOW a payment message is produced: file format, API provider, '
    'message version, capabilities. config jsonb holds provider credentials — '
    'application layer must encrypt sensitive values at rest.';

COMMENT ON COLUMN control.bank_interface_profile.interface_type IS
    'Delivery mechanism. Lookup: control.bank_interface_profile_type. '
    'FILE, API, CHECK_PRINT, MANUAL.';
COMMENT ON COLUMN control.bank_interface_profile.payment_network IS
    'Payment rail. Reuses control.bank_format_rule_payment_network vocabulary.';
COMMENT ON COLUMN control.bank_interface_profile.file_format_code IS
    'File/message format. Lookup: control.bank_interface_file_format. '
    'PAIN_001, NACHA_CCD, NACHA_PPD, MT101, etc.';
COMMENT ON COLUMN control.bank_interface_profile.provider_code IS
    'Execution provider identifier. Examples: WISE_API, STRIPE_API, HDFC_H2H.';
COMMENT ON COLUMN control.bank_interface_profile.config IS
    'SENSITIVE — provider credentials, API keys, endpoints. '
    'Application layer MUST encrypt at rest.';


-- ============================================================================
-- §PM4  control.payment_method_interface_binding — method → interface routing
-- ============================================================================

CREATE TABLE IF NOT EXISTS control.payment_method_interface_binding (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Applicability
    company_code_id         uuid,
    payment_method_id       uuid            NOT NULL,
    bank_account_link_id    uuid,
    currency_code           character(3),
    direction               text            NOT NULL DEFAULT 'OUTBOUND',
    counterparty_country_code character(2),
    payment_network         text,

    -- Target
    bank_interface_profile_id uuid          NOT NULL,

    -- Priority (highest wins when multiple match)
    priority                smallint        NOT NULL DEFAULT 0,

    -- Temporal
    effective_from          date            NOT NULL DEFAULT CURRENT_DATE,
    effective_until         date,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  text            NOT NULL DEFAULT 'active',
    is_active               boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT pmib_pkey                    PRIMARY KEY (id),
    CONSTRAINT pmib_tenant_id_uq            UNIQUE (tenant_id, id),
    CONSTRAINT pmib_effective_chk           CHECK (
        effective_until IS NULL OR effective_until > effective_from
    ),
    CONSTRAINT pmib_priority_chk            CHECK (priority >= 0),
    CONSTRAINT pmib_country_upper_chk       CHECK (
        counterparty_country_code IS NULL
        OR counterparty_country_code = upper(counterparty_country_code)
    ),
    CONSTRAINT pmib_currency_upper_chk      CHECK (
        currency_code IS NULL OR currency_code = upper(currency_code)
    )
);

COMMENT ON TABLE control.payment_method_interface_binding IS
    'ARCHETYPE=B;SCOPE=T. Bridges payment method to bank_interface_profile. Routes the same method '
    'to different interfaces by company, bank, currency, direction, '
    'counterparty country, and payment network. Priority-based resolution.';


-- ============================================================================
-- §PM5  control.payment_settlement_rule — posting-role-based accounting
-- ============================================================================

CREATE TABLE IF NOT EXISTS control.payment_settlement_rule (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Scope
    company_code_id         uuid            NOT NULL,
    payment_method_id       uuid            NOT NULL,
    direction               text            NOT NULL DEFAULT 'OUTBOUND',
    book_code               text            NOT NULL DEFAULT 'statutory',

    -- Posting roles
    clearing_posting_role_code      text    NOT NULL,
    settlement_posting_role_code    text    NOT NULL,
    bank_fee_posting_role_code      text,
    discount_posting_role_code      text,
    fx_gain_posting_role_code       text,
    fx_loss_posting_role_code       text,
    chargeback_posting_role_code    text,
    suspense_posting_role_code      text,

    -- Temporal
    effective_from          date            NOT NULL DEFAULT CURRENT_DATE,
    effective_until         date,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  text            NOT NULL DEFAULT 'active',
    is_active               boolean         GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT psr_pkey                     PRIMARY KEY (id),
    CONSTRAINT psr_tenant_id_uq             UNIQUE (tenant_id, id),
    CONSTRAINT psr_effective_chk            CHECK (
        effective_until IS NULL OR effective_until > effective_from
    ),
    CONSTRAINT psr_clearing_nonempty        CHECK (btrim(clearing_posting_role_code) <> ''),
    CONSTRAINT psr_settlement_nonempty      CHECK (btrim(settlement_posting_role_code) <> ''),
    CONSTRAINT psr_book_nonempty            CHECK (btrim(book_code) <> '')
);

COMMENT ON TABLE control.payment_settlement_rule IS
    'ARCHETYPE=B;SCOPE=T. Posting-role-based settlement accounting for payment execution. '
    'Outputs role codes, NOT GL accounts — the existing accounting engine '
    '(resolve_posting_role_account) handles role → GL resolution per company/book.';


-- ══════════════════════════════════════════════════════════════════════════════
-- ASSET ENGINE — Control tables
-- ══════════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- §ACP1  control.asset_class_book_policy — effective-dated policy
-- ============================================================================
-- Normalizes GL posting roles and depreciation parameters out of the jsonb
-- columns on master.asset_class into a proper relational table with:
--   • Effective-dating (effective_from/to) for versioned policy
--   • Per-book scope (book_code references master.ledger_book.code)
--   • Posting role codes (resolved to GL accounts at runtime)
-- book_code = actual master.ledger_book.code (e.g. 'ATHQ-BOOK-STAT'),
-- validated by trigger. UNIQUE includes effective_from for true versioning.
-- ============================================================================

CREATE TABLE IF NOT EXISTS control.asset_class_book_policy (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,

    -- Company + class scope
    company_code_id  uuid         NOT NULL,
    asset_class_id   uuid         NOT NULL,
    book_code        text         NOT NULL,

    -- Priority & effective-dating
    priority         smallint     NOT NULL DEFAULT 50,
    effective_from   date         NOT NULL DEFAULT CURRENT_DATE,
    effective_to     date,

    -- Depreciation parameters
    is_depreciable               boolean  NOT NULL DEFAULT true,
    depreciation_method          text,
    useful_life_months           integer,
    residual_value_mode          text     NOT NULL DEFAULT 'zero',
    residual_value_amount        numeric(18,4),
    residual_value_pct           numeric(9,4),
    convention                   text,
    prorate_basis                text     NOT NULL DEFAULT 'monthly',
    depreciation_start_rule      text     NOT NULL DEFAULT 'in_service_date',
    method_params                jsonb    NOT NULL DEFAULT '{}'::jsonb,

    -- Override permissions
    allow_manual_life_override      boolean NOT NULL DEFAULT false,
    allow_manual_residual_override  boolean NOT NULL DEFAULT false,
    allow_manual_method_override    boolean NOT NULL DEFAULT false,

    -- Posting role codes (resolved to GL accounts at runtime)
    acquisition_posting_role_code       text,
    accum_depr_posting_role_code        text,
    depr_expense_posting_role_code      text,
    gain_loss_posting_role_code         text,
    impairment_expense_posting_role_code   text,
    impairment_reserve_posting_role_code   text,
    revaluation_surplus_posting_role_code  text,
    revaluation_loss_posting_role_code     text,
    cwip_posting_role_code                 text,

    -- Event codes
    capitalization_event_code    text NOT NULL DEFAULT 'CAPITALIZE',
    disposal_event_code          text NOT NULL DEFAULT 'DISPOSE',
    depreciation_event_code      text NOT NULL DEFAULT 'DEPRECIATE',
    impairment_event_code        text NOT NULL DEFAULT 'IMPAIR',
    revaluation_event_code       text NOT NULL DEFAULT 'REVALUE',

    -- Tags & Metadata
    metadata         jsonb        NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status           text         NOT NULL DEFAULT 'active',
    is_active        boolean      GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT acbp_pkey PRIMARY KEY (id),
    CONSTRAINT acbp_tenant_id_uq UNIQUE (tenant_id, id),

    -- True effective-dating: same scope can have multiple rows at different
    -- effective_from dates. Resolver picks best match.
    CONSTRAINT acbp_class_book_eff_uq
        UNIQUE (tenant_id, company_code_id, asset_class_id, book_code, effective_from),

    CONSTRAINT acbp_effective_chk CHECK (
        effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT acbp_depr_method_chk CHECK (
        NOT is_depreciable OR depreciation_method IS NOT NULL),
    CONSTRAINT acbp_depr_life_chk CHECK (
        NOT is_depreciable OR depreciation_method = 'no_depreciation'
        OR useful_life_months IS NOT NULL),
    CONSTRAINT acbp_nodepr_life_chk CHECK (
        depreciation_method IS NULL OR depreciation_method != 'no_depreciation'
        OR useful_life_months IS NULL),
    CONSTRAINT acbp_useful_life_pos CHECK (
        useful_life_months IS NULL OR useful_life_months > 0),
    CONSTRAINT acbp_residual_mode_chk CHECK (
        residual_value_mode IN ('amount','percent','zero')),
    CONSTRAINT acbp_residual_amount_chk CHECK (
        residual_value_mode != 'amount'
        OR (residual_value_amount IS NOT NULL AND residual_value_amount >= 0)),
    CONSTRAINT acbp_residual_pct_chk CHECK (
        residual_value_mode != 'percent'
        OR (residual_value_pct IS NOT NULL AND residual_value_pct BETWEEN 0 AND 100)),
    CONSTRAINT acbp_residual_zero_chk CHECK (
        residual_value_mode != 'zero'
        OR (residual_value_amount IS NULL AND residual_value_pct IS NULL)),
    CONSTRAINT acbp_start_rule_chk CHECK (
        depreciation_start_rule IN ('in_service_date','capitalization_date','next_period')),
    CONSTRAINT acbp_depr_roles_chk CHECK (
        NOT is_depreciable OR depreciation_method IS NULL
        OR depreciation_method = 'no_depreciation'
        OR (acquisition_posting_role_code IS NOT NULL
            AND accum_depr_posting_role_code IS NOT NULL
            AND depr_expense_posting_role_code IS NOT NULL)),
    CONSTRAINT acbp_acq_role_chk CHECK (
        acquisition_posting_role_code IS NOT NULL
        OR cwip_posting_role_code IS NOT NULL),
    CONSTRAINT acbp_status_chk CHECK (status IN ('active','inactive','superseded')),
    CONSTRAINT acbp_book_nonempty CHECK (btrim(book_code) <> '')
);

COMMENT ON TABLE control.asset_class_book_policy IS
    'ARCHETYPE=B;SCOPE=T. Effective-dated depreciation + posting-role policy per (asset_class, book). '
    'book_code = actual ledger_book.code, validated by trigger. '
    'UNIQUE on (..., effective_from) enables true versioning. '
    'Resolved via control.resolve_asset_class_book_policy() at asset_book creation.';


-- =============================================================================
-- §FF  control.feature_flag — platform feature flag registry (Phase 1.6)
-- =============================================================================
-- Redis cache-first, DB fallback feature flag evaluation (<1ms p99 cache hit).
-- Supports global on/off, per-tenant overrides, and percentage rollouts.
-- Cache TTL: 60 seconds. Invalidated on update via FeatureFlagService.invalidate().

CREATE TABLE IF NOT EXISTS control.feature_flag (
    -- Identity
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),

    -- Flag definition
    code                text        NOT NULL,
    name                text        NOT NULL,
    description         text,

    -- Discriminator (H1 P2-hygiene)
    flag_type           text        NOT NULL DEFAULT 'release_gate',

    -- State
    is_enabled          boolean     NOT NULL DEFAULT false,

    -- Per-tenant overrides: {"<tenantId>": true|false, ...}
    tenant_overrides    jsonb,

    -- Percentage rollout (0–100). NULL = not in rollout mode.
    -- When set, hash(code + tenantId) % 100 < rollout_pct → enabled.
    rollout_pct         smallint,

    -- Lifecycle
    expires_at          timestamptz,

    -- Metadata (owner, jira_ticket, etc.)
    metadata            jsonb       NOT NULL DEFAULT '{}',

    -- Audit
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT ff_pkey          PRIMARY KEY (id),
    CONSTRAINT ff_code_uq       UNIQUE (code),
    CONSTRAINT ff_code_chk      CHECK (btrim(code) <> ''),
    CONSTRAINT ff_rollout_chk   CHECK (rollout_pct IS NULL OR (rollout_pct >= 0 AND rollout_pct <= 100)),
    CONSTRAINT ff_overrides_chk CHECK (tenant_overrides IS NULL OR jsonb_typeof(tenant_overrides) = 'object'),
    CONSTRAINT ff_flag_type_chk CHECK (flag_type IN ('release_gate', 'capability_toggle', 'experiment'))
);

COMMENT ON TABLE  control.feature_flag IS
    'ARCHETYPE=C;SCOPE=N;DEVIATION. No tenant_id; manual is_enabled boolean (no status/is_active GENERATED). Platform feature flag registry. Redis cache-first (60s TTL), DB fallback. '
    'flag_type discriminator: release_gate (temporary on/off for phased releases), '
    'capability_toggle (permanent feature switch with no planned expiry), '
    'experiment (A/B test or percentage rollout). '
    'is_enabled = global default. tenant_overrides = per-tenant map. '
    'rollout_pct = 0–100 stable-hash rollout when no tenant override present.';
COMMENT ON COLUMN control.feature_flag.code IS
    'Machine-readable flag identifier. Convention: snake_case module prefix + flag name. '
    'E.g. notifications_v2, pdf_rendering_async, policy_simulator_ui.';
COMMENT ON COLUMN control.feature_flag.tenant_overrides IS
    'JSON object mapping tenant UUID → boolean. Overrides is_enabled for specific tenants.';
COMMENT ON COLUMN control.feature_flag.rollout_pct IS
    'Percentage of tenants for which the flag is enabled when no explicit override exists. '
    'Uses stable djb2 hash of (code + tenantId) % 100 for deterministic per-tenant rollout.';


-- =============================================================================
-- §FF+1  control.metadata_change_request — Phase 2.5 MetadataApprovalBridge
-- =============================================================================
-- Tracks field/entity definition change requests that pass through the
-- approval process before becoming effective.
--
-- Lifecycle:
--   submitted → pending_review → approved → applied
--                              → rejected
--
-- When approved: EntityCompilerService.invalidate() is called by MetadataApprovalBridge
-- to recompile the affected entity descriptor.
-- workflow_request_id is populated (Phase 3.4) when a workflow request is created
-- for the change request.

CREATE TABLE IF NOT EXISTS control.metadata_change_request (
    -- Identity
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,

    -- Subject
    entity_code         text        NOT NULL,

    -- Change specification
    change_type         text        NOT NULL,
    -- Serialised ChangeRequestPayload: {entityCode, changeType, fieldName?, before?, after?, rationale?}
    payload             jsonb       NOT NULL,

    -- Lifecycle
    status              text        NOT NULL DEFAULT 'submitted',

    -- Submission
    submitted_by        uuid        NOT NULL,

    -- Review
    reviewed_by         uuid,
    reviewed_at         timestamptz,
    review_note         text,

    -- Application
    applied_at          timestamptz,

    -- Workflow bridge (Phase 3.4: populated when workflow request is created)
    workflow_request_id uuid,

    -- Audit
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT mcr_pkey             PRIMARY KEY (id),
    CONSTRAINT mcr_tenant_id_uq     UNIQUE (tenant_id, id),
    CONSTRAINT mcr_entity_code_chk  CHECK (btrim(entity_code) <> ''),
    CONSTRAINT mcr_status_chk       CHECK (status IN (
        'submitted', 'pending_review', 'approved', 'rejected', 'applied'
    )),
    CONSTRAINT mcr_change_type_chk  CHECK (change_type IN (
        'add_field', 'remove_field', 'update_field', 'reorder_fields',
        'update_entity_config', 'add_overlay', 'remove_overlay',
        'add_flow', 'update_flow', 'publish_flow', 'retire_flow',
        'add_flow_step', 'update_flow_step', 'remove_flow_step', 'reorder_flow_steps',
        'bind_flow_field', 'update_flow_field', 'unbind_flow_field'
    )),
    CONSTRAINT mcr_payload_chk      CHECK (jsonb_typeof(payload) = 'object'),
    CONSTRAINT mcr_review_chk       CHECK (
        (reviewed_by IS NULL) = (reviewed_at IS NULL)
    )
);

COMMENT ON TABLE  control.metadata_change_request IS
    'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Metadata Studio change request log. Tracks field/entity definition changes '
    'that require approval before becoming effective. '
    'Lifecycle: submitted → pending_review → approved → applied | rejected. '
    'workflow_request_id populated in Phase 3.4 when WorkflowEngine is wired.';
COMMENT ON COLUMN control.metadata_change_request.payload IS
    'Serialised ChangeRequestPayload. '
    'Structure: {entityCode, changeType, fieldName?, before?, after?, rationale?}. '
    'before/after hold the field definition snapshots for diffs in the review UI.';
COMMENT ON COLUMN control.metadata_change_request.workflow_request_id IS
    'FK to document.workflow_request (no DB-level FK — cross-schema, nullable). '
    'Populated by MetadataApprovalBridge.submit() when WorkflowEngine is wired (Phase 3.4). '
    'NULL in Phase 2 (skeleton mode) — changes are approved directly.';
COMMENT ON COLUMN control.metadata_change_request.applied_at IS
    'Timestamp when EntityCompilerService.invalidate() was called and '
    'the change was promoted to status=applied. NULL until approval + application.';


-- ══════════════════════════════════════════════════════════════════════════════
-- §H3  control.forecast_budget_bridge — planning → budget baseline link
-- ══════════════════════════════════════════════════════════════════════════════
-- Links a planning_driver_version snapshot to a named budget baseline that
-- can be locked and approved before the fiscal period begins.
--
-- Merge-order: draft → locked → approved; superseded_by_id chains history
-- when a baseline is superseded by a revised version within the same year.
--
-- FK planning_driver_version_id → control.planning_driver_version ON DELETE SET NULL
-- so baselines survive driver version archival.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS control.forecast_budget_bridge (
    -- Identity
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,

    -- Budget baseline identity
    name                        text        NOT NULL,
    fiscal_year                 smallint    NOT NULL,
    budget_period_type          text        NOT NULL DEFAULT 'annual',

    -- Planning link (nullable — bridge can exist without a driver version)
    planning_driver_version_id  uuid,

    -- Lock / approval state
    status                      text        NOT NULL DEFAULT 'draft',
    locked_at                   timestamptz,
    locked_by                   uuid,
    approved_at                 timestamptz,
    approved_by                 uuid,

    -- History chain
    superseded_by_id            uuid,
    superseded_at               timestamptz,

    -- Metadata
    metadata                    jsonb       NOT NULL DEFAULT '{}',

    -- Audit
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT fbb_pkey                 PRIMARY KEY (id),
    CONSTRAINT fbb_tenant_id_uq         UNIQUE (tenant_id, id),
    CONSTRAINT fbb_name_year_uq         UNIQUE (tenant_id, name, fiscal_year),
    CONSTRAINT fbb_name_chk             CHECK (btrim(name) <> ''),
    CONSTRAINT fbb_fiscal_year_chk      CHECK (fiscal_year BETWEEN 2000 AND 2099),
    CONSTRAINT fbb_period_type_chk      CHECK (budget_period_type IN ('annual', 'quarterly', 'monthly')),
    CONSTRAINT fbb_status_chk           CHECK (status IN ('draft', 'locked', 'approved', 'superseded')),
    CONSTRAINT fbb_lock_pair_chk        CHECK ((locked_at IS NULL) = (locked_by IS NULL)),
    CONSTRAINT fbb_approve_pair_chk     CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
    CONSTRAINT fbb_approval_order_chk   CHECK (approved_at IS NULL OR locked_at IS NOT NULL),
    CONSTRAINT fbb_superseded_pair_chk  CHECK ((superseded_by_id IS NULL) = (superseded_at IS NULL)),
    CONSTRAINT fbb_metadata_chk         CHECK (jsonb_typeof(metadata) = 'object')
);

COMMENT ON TABLE control.forecast_budget_bridge IS
    'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. H3 P2-hygiene: planning → budget baseline link. '
    'Connects a planning_driver_version snapshot to a named annual/quarterly/monthly budget. '
    'Lifecycle: draft → locked → approved; superseded_by_id chains history on revision. '
    'GL period-close gate reads status=approved before allowing entries.';
COMMENT ON COLUMN control.forecast_budget_bridge.planning_driver_version_id IS
    'FK → control.planning_driver_version (ON DELETE SET NULL). '
    'NULL when baseline is created standalone (no driver version yet pinned).';
COMMENT ON COLUMN control.forecast_budget_bridge.budget_period_type IS
    'Granularity of the budget: annual (one amount), quarterly (4 slices), monthly (12 slices). '
    'Slice amounts are stored in a companion amounts table (Phase 2 extension).';


-- ══════════════════════════════════════════════════════════════════════════════
-- §H4  control.metadata_change_application_log — structured application audit
-- ══════════════════════════════════════════════════════════════════════════════
-- Append-only log of each EntityCompilerService.invalidate() invocation that
-- results from an approved metadata_change_request.
--
-- Separate from the applied_at timestamp on metadata_change_request — that is
-- a point-in-time flag; this table captures duration, affected entities,
-- and compiler error detail for incident analysis.
--
-- No updated_at trigger — rows are immutable after INSERT.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS control.metadata_change_application_log (
    -- Identity
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,

    -- Source request
    change_request_id   uuid        NOT NULL,

    -- Application context
    entity_code         text        NOT NULL,
    applied_by          uuid        NOT NULL,
    applied_at          timestamptz NOT NULL DEFAULT now(),

    -- Compiler run tracing
    compiler_run_id     uuid,
    entities_recompiled text[],     -- all entity_codes recompiled in this run
    duration_ms         integer,

    -- Outcome
    result              text        NOT NULL DEFAULT 'success',
    error_detail        jsonb,      -- NULL on success; structured error on failure/partial

    -- Audit (created only — immutable log)
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,

    CONSTRAINT mcal_pkey              PRIMARY KEY (id),
    CONSTRAINT mcal_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT mcal_entity_code_chk   CHECK (btrim(entity_code) <> ''),
    CONSTRAINT mcal_result_chk        CHECK (result IN ('success', 'partial', 'failed')),
    CONSTRAINT mcal_error_pair_chk    CHECK (
        result = 'success' OR error_detail IS NOT NULL
    ),
    CONSTRAINT mcal_duration_pos_chk  CHECK (duration_ms IS NULL OR duration_ms >= 0),
    CONSTRAINT mcal_error_obj_chk     CHECK (
        error_detail IS NULL OR jsonb_typeof(error_detail) = 'object'
    )
);

COMMENT ON TABLE control.metadata_change_application_log IS
    'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. H4 P2-hygiene: append-only audit of EntityCompilerService.invalidate() runs. '
    'One row per application event triggered by an approved metadata_change_request. '
    'duration_ms + entities_recompiled enable performance monitoring of compiler runs. '
    'error_detail captures structured compiler errors for partial/failed outcomes. '
    'Immutable — no updated_at column or trigger.';
COMMENT ON COLUMN control.metadata_change_application_log.compiler_run_id IS
    'Correlation ID passed into EntityCompilerService.invalidate(). '
    'Allows joining multiple log rows that were part of the same batch recompile.';
COMMENT ON COLUMN control.metadata_change_application_log.entities_recompiled IS
    'All entity_codes whose descriptors were invalidated and recompiled in this run. '
    'May include more than the change_request.entity_code when cascading dependencies exist.';


-- ══════════════════════════════════════════════════════════════════════════════
-- §AUTO-1  cron_schedule — runtime-configurable BullMQ scheduled jobs
-- ══════════════════════════════════════════════════════════════════════════════
-- DB-managed complement to the code-based cron-registry.ts.
-- NULL tenant_id = platform-global schedule; non-null = tenant-scoped.
-- Code-based entries always win on code conflict (scheduler logs a warning).
-- Scheduler polls this table every 60s for runtime changes — no restart needed.
CREATE TABLE IF NOT EXISTS control.cron_schedule (
    -- Identity
    id                  uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid,                           -- NULL = platform-global

    -- Schedule identity
    code                text            NOT NULL,
    name                text            NOT NULL,
    description         text,

    -- Execution target
    handler_type        text            NOT NULL,       -- BullMQ job name / worker handler
    cron_expression     text            NOT NULL,       -- 5 or 6-field cron expression
    timezone            text            NOT NULL DEFAULT 'UTC',
    target_queue        text            NOT NULL,       -- BullMQ queue name
    payload_template    jsonb           NOT NULL DEFAULT '{}',

    -- Concurrency & retry
    priority            smallint        NOT NULL DEFAULT 0,
    max_retries         smallint        NOT NULL DEFAULT 3,
    concurrency_limit   smallint,                       -- NULL = unlimited

    -- Lifecycle window
    effective_from      timestamptz,                    -- NULL = immediately
    effective_until     timestamptz,                    -- NULL = no expiry
    is_enabled          boolean         NOT NULL DEFAULT true,

    -- Leader election (multi-instance safety)
    lock_key            text,                           -- Redis SETNX key; NULL = no lock

    -- Runtime state (updated by scheduler)
    last_run_at         timestamptz,
    next_run_at         timestamptz,

    -- Audit
    created_at          timestamptz     NOT NULL DEFAULT now(),
    created_by          uuid            NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT cron_schedule_pkey              PRIMARY KEY (id),
    CONSTRAINT cron_schedule_tenant_code_uq    UNIQUE NULLS NOT DISTINCT (tenant_id, code),
    CONSTRAINT cron_schedule_code_fmt          CHECK (btrim(code) <> ''),
    CONSTRAINT cron_schedule_name_fmt          CHECK (btrim(name) <> ''),
    CONSTRAINT cron_schedule_handler_fmt       CHECK (btrim(handler_type) <> ''),
    CONSTRAINT cron_schedule_cron_fmt          CHECK (btrim(cron_expression) <> ''),
    CONSTRAINT cron_schedule_queue_fmt         CHECK (btrim(target_queue) <> ''),
    CONSTRAINT cron_schedule_timezone_fmt      CHECK (btrim(timezone) <> ''),
    CONSTRAINT cron_schedule_priority_chk      CHECK (priority BETWEEN -10 AND 10),
    CONSTRAINT cron_schedule_retries_chk       CHECK (max_retries >= 0),
    CONSTRAINT cron_schedule_concurrency_chk   CHECK (concurrency_limit IS NULL OR concurrency_limit > 0),
    CONSTRAINT cron_schedule_window_chk        CHECK (
        effective_from IS NULL OR effective_until IS NULL OR effective_until > effective_from
    ),
    CONSTRAINT cron_schedule_payload_chk       CHECK (jsonb_typeof(payload_template) = 'object')
);

CREATE INDEX IF NOT EXISTS cron_schedule_active_idx
    ON control.cron_schedule (is_enabled, effective_from, effective_until)
    WHERE is_enabled = true;

CREATE INDEX IF NOT EXISTS cron_schedule_tenant_idx
    ON control.cron_schedule (tenant_id)
    WHERE tenant_id IS NOT NULL;

COMMENT ON TABLE  control.cron_schedule IS
    'ARCHETYPE=C;SCOPE=G;DEVIATION. Manual is_enabled boolean NOT NULL DEFAULT true (no status/is_active GENERATED). Runtime-configurable BullMQ scheduled jobs. '
    'NULL tenant_id = platform-global. Code-based cron-registry.ts entries win on conflict. '
    'Scheduler polls every 60 s for runtime changes without restart.';
COMMENT ON COLUMN control.cron_schedule.payload_template IS
    'Job data template. Supports {{tenant_id}} and {{now}} interpolation at enqueue time.';
COMMENT ON COLUMN control.cron_schedule.lock_key IS
    'Redis SETNX key for leader-election in multi-instance deployments. '
    'NULL = no leader lock (idempotent jobs only).';


-- ══════════════════════════════════════════════════════════════════════════════
-- §AUTO-2  connector_type — catalog of available integration connector types
-- ══════════════════════════════════════════════════════════════════════════════
-- Platform-seeded types have is_system = true. Tenant-registered custom types
-- have is_system = false. config_schema drives dynamic UI form generation —
-- adding a new connector type requires zero changes to frontend code.
CREATE TABLE IF NOT EXISTS control.connector_type (
    -- Identity
    id              uuid            NOT NULL DEFAULT shared.uuidv7(),
    code            text            NOT NULL,

    -- Catalog display
    name            text            NOT NULL,
    category        text            NOT NULL,   -- api | file_transfer | messaging | erp | payment | custom
    description     text,
    icon_key        text,

    -- Capability declaration
    config_schema   jsonb           NOT NULL,   -- JSON Schema; drives dynamic UI form
    auth_types      text[]          NOT NULL DEFAULT '{}',
    capabilities    text[]          NOT NULL DEFAULT '{}',

    -- Health probe configuration
    health_check_config jsonb       NOT NULL DEFAULT '{}',

    -- Classification
    is_system       boolean         NOT NULL DEFAULT false,
    status          text            NOT NULL DEFAULT 'active',

    -- Audit
    created_at      timestamptz     NOT NULL DEFAULT now(),
    created_by      uuid            NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT connector_type_pkey          PRIMARY KEY (id),
    CONSTRAINT connector_type_code_uq       UNIQUE (code),
    CONSTRAINT connector_type_code_fmt      CHECK (btrim(code) <> ''),
    CONSTRAINT connector_type_name_fmt      CHECK (btrim(name) <> ''),
    CONSTRAINT connector_type_category_chk  CHECK (category IN (
        'api', 'file_transfer', 'messaging', 'erp', 'payment', 'custom'
    )),
    CONSTRAINT connector_type_status_chk    CHECK (status IN ('active', 'deprecated')),
    CONSTRAINT connector_type_schema_chk    CHECK (jsonb_typeof(config_schema) = 'object'),
    CONSTRAINT connector_type_hc_chk        CHECK (jsonb_typeof(health_check_config) = 'object')
);

COMMENT ON TABLE  control.connector_type IS
    'ARCHETYPE=B_LITE;SCOPE=N;PENDING_ACTIVE_SET. Integration connector type catalog. config_schema (JSON Schema) drives UI form generation '
    'automatically — no frontend changes needed to add a new connector type. '
    'is_system = true entries are platform-seeded and cannot be deleted by tenants.';


-- ============================================================================
-- §PRV  control.policy_rule_version — immutable rule change log
-- ============================================================================
-- Append-only: a trigger auto-inserts a version row before any UPDATE to
-- control.policy_rule. Makes policy changes fully auditable.

CREATE TABLE IF NOT EXISTS control.policy_rule_version (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,

    -- Parent rule
    policy_rule_id  uuid        NOT NULL,
    policy_id       uuid        NOT NULL,                -- denormalized for fast history queries

    -- Version number (auto-incremented by trigger)
    version_no      integer     NOT NULL,

    -- Snapshot of the rule AT THIS VERSION (taken before the update)
    rule_snapshot   jsonb       NOT NULL,               -- full control.policy_rule row as JSON

    -- Effectivity window
    effective_from  timestamptz NOT NULL DEFAULT now(), -- when this version became active
    effective_until timestamptz,                        -- set when superseded by next version; NULL = current

    -- Who made the change that superseded this version
    published_by    uuid,                               -- principal_id who triggered the UPDATE
    published_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT prv_pkey         PRIMARY KEY (id),
    CONSTRAINT prv_tenant_uq    UNIQUE (tenant_id, id),
    CONSTRAINT prv_natural_uq   UNIQUE (policy_rule_id, version_no),
    CONSTRAINT prv_version_chk  CHECK (version_no > 0),
    CONSTRAINT prv_window_chk   CHECK (
        effective_until IS NULL OR effective_from <= effective_until
    )
);

COMMENT ON TABLE control.policy_rule_version IS
    'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Append-only audit trail for policy rule changes. A new row is inserted '
    'BEFORE each UPDATE to control.policy_rule via trg_version_policy_rule. '
    'rule_snapshot captures the full row state that was REPLACED by the update '
    '(i.e. the previous version). effective_until is set on the previous version '
    'when a new edit comes in.';

COMMENT ON COLUMN control.policy_rule_version.rule_snapshot IS
    'Full JSONB snapshot of the control.policy_rule row as it existed before '
    'the superseding update. Enables diff views between versions.';

COMMENT ON COLUMN control.policy_rule_version.effective_until IS
    'Timestamp when this version was superseded. NULL = this is the current version. '
    'Set by the trigger on the PREVIOUS version row when a new edit is applied.';


-- ============================================================================
-- §PTC  control.policy_test_case — persisted simulation test cases
-- ============================================================================

CREATE TABLE IF NOT EXISTS control.policy_test_case (
    -- Identity
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,

    -- Parent policy
    policy_definition_id uuid       NOT NULL,

    -- Test definition
    test_name           varchar(150) NOT NULL,
    description         text,

    -- Input payload to evaluate against the policy
    input_payload       jsonb       NOT NULL,            -- the entity data / context to evaluate

    -- Expected result
    expected_outcome    jsonb       NOT NULL,            -- { action, score?, confidence?, decision? }

    -- Last execution result (updated on each run via POST /api/policy/test-cases/:id/run)
    last_run_at         timestamptz,
    last_run_passed     boolean,
    last_run_result     jsonb,                           -- actual outcome from last run
    last_run_ms         integer,                         -- evaluation latency of last run

    -- Lifecycle
    is_active           boolean     NOT NULL DEFAULT true,

    -- Audit
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT ptc_pkey         PRIMARY KEY (id),
    CONSTRAINT ptc_tenant_uq    UNIQUE (tenant_id, id),
    CONSTRAINT ptc_name_uq      UNIQUE (tenant_id, policy_definition_id, test_name),
    CONSTRAINT ptc_policy_fk    FOREIGN KEY (policy_definition_id)
        REFERENCES control.policy_definition (id)
        ON DELETE CASCADE
);

COMMENT ON TABLE control.policy_test_case IS
    'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (no status/is_active GENERATED). Persisted simulation test cases for a policy definition. '
    'Used by the simulation harness (POST /api/policy/definitions/:id/test) '
    'to run batch assertions and surface pass/fail results. '
    'last_run_* columns are updated on each execution, enabling a "last run" status badge in the UI.';

COMMENT ON COLUMN control.policy_test_case.input_payload IS
    'The entity data context to feed into the policy engine. '
    'Shape must match the entity_type targeted by the parent policy_definition.';

COMMENT ON COLUMN control.policy_test_case.expected_outcome IS
    'Expected evaluation result. Compared against actual outcome during test runs. '
    'Minimum shape: { "action": "approve" | "reject" | "review" | ... }. '
    'May also include score_min/score_max bounds for scoring policies.';

CREATE INDEX IF NOT EXISTS prv_rule_id_idx
    ON control.policy_rule_version (policy_rule_id, version_no DESC);

CREATE INDEX IF NOT EXISTS prv_policy_id_idx
    ON control.policy_rule_version (policy_id, published_at DESC);

CREATE INDEX IF NOT EXISTS ptc_policy_idx
    ON control.policy_test_case (tenant_id, policy_definition_id, is_active);


-- ============================================================================
-- §CQ  control.content_quota — per-tenant, per-kind content quota enforcement
-- ============================================================================
-- quota check order (POST /content/items):
--   1. Exact kind match for tenant
--   2. Wildcard '*' for tenant
--   3. No quota row → unlimited (pass-through)

CREATE TABLE IF NOT EXISTS control.content_quota (
    id                 uuid        PRIMARY KEY DEFAULT shared.uuidv7(),
    tenant_id          uuid        NOT NULL REFERENCES master.tenant(id) ON DELETE CASCADE,
    kind               text        NOT NULL CHECK (kind ~ '^[a-z_*][a-z0-9_*]*$' AND length(kind) <= 64),
    max_items          bigint      CHECK (max_items IS NULL OR max_items > 0),
    max_storage_bytes  bigint      CHECK (max_storage_bytes IS NULL OR max_storage_bytes > 0),
    warn_at_pct        integer     NOT NULL DEFAULT 80 CHECK (warn_at_pct BETWEEN 1 AND 100),
    is_active          boolean     NOT NULL DEFAULT true,
    created_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid        NOT NULL,
    updated_at         timestamptz,
    updated_by         uuid,

    CONSTRAINT content_quota_tenant_kind_uq UNIQUE (tenant_id, kind)
);

CREATE INDEX IF NOT EXISTS cq_tenant_active_idx
    ON control.content_quota (tenant_id)
    WHERE is_active = true;

ALTER TABLE control.content_quota ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE control.content_quota IS
    'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (no status/is_active GENERATED). Per-tenant per-kind content item and storage quotas. '
    'max_items / max_storage_bytes = NULL means unlimited. '
    'Use kind = ''*'' for a catch-all default for the tenant.';


-- =============================================================================
-- §PROV-1  control.blueprint_registry — catalogue of available blueprint packs
-- =============================================================================
-- R6: Migrated from 900_seed_data/020_blueprint/000_registry/ into the main DDL
-- bundle so the table is always present regardless of seed execution order or
-- environment. Seed file retains only the INSERT rows and the catalogue view.
--
-- Platform-global: no tenant_id — blueprints are installed at system level.
-- Idempotent: seed uses ON CONFLICT (code) DO UPDATE.

CREATE TABLE IF NOT EXISTS control.blueprint_registry (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    code                text        NOT NULL,
    name                text        NOT NULL,
    category            text        NOT NULL,
    industry_vertical   text[],
    framework           text,
    base_version        text        NOT NULL DEFAULT '1.0.0',
    status              text        NOT NULL DEFAULT 'active',
    dependencies        text[],
    seed_files          text[],
    description         text,
    metadata            jsonb,

    -- Audit
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT br_pkey          PRIMARY KEY (id),
    CONSTRAINT br_code_uq       UNIQUE (code),
    CONSTRAINT br_code_chk      CHECK (btrim(code) <> ''),
    CONSTRAINT br_category_chk  CHECK (category IN (
        'base',           -- TIER 1: universal prerequisite (010_base)
        'foundation',     -- TIER 1: always-apply data (tax/payments/assets/bank)
        'coa_framework',  -- TIER 2a: select exactly one accounting framework
        'industry_pack',  -- TIER 2b: select one or more industry taxonomies
        'module_pack'     -- TIER 3: optional subscription-gated module packs
    )),
    CONSTRAINT br_status_chk    CHECK (status IN ('active', 'deprecated'))
);

COMMENT ON TABLE  control.blueprint_registry IS
    'ARCHETYPE=B_LITE;SCOPE=N;PENDING_ACTIVE_SET. Catalogue of available blueprint packs selectable during tenant provisioning. '
    'Platform-global (no tenant_id). '
    'system-seeded rows have created_by = ''00000000-0000-0000-0000-000000000000''. '
    'R6: migrated from seed file into main DDL bundle.';
COMMENT ON COLUMN control.blueprint_registry.code IS
    'Stable identifier used as FK target and in dependency arrays. '
    'E.g. ''base'', ''pack_utilities'', ''coa_ifrs''.';
COMMENT ON COLUMN control.blueprint_registry.category IS
    'Tier model: '
    'base=universal prerequisite (always first); '
    'foundation=always-apply data (tax/payments/assets/bank); '
    'coa_framework=select exactly one accounting framework; '
    'industry_pack=select one or more vertical taxonomies; '
    'module_pack=optional subscription-gated feature packs.';
COMMENT ON COLUMN control.blueprint_registry.dependencies IS
    'Ordered list of blueprint codes that must be applied before this one.';
COMMENT ON COLUMN control.blueprint_registry.seed_files IS
    'Ordered relative file paths under 900_seed_data/ for the runner to execute.';


-- =============================================================================
-- §PROV-2  control.tenant_blueprint_application — provisioning audit log
-- =============================================================================
-- Records which blueprint packs have been applied to each tenant, when, by whom,
-- and with what outcome. Enables incremental pack additions and upgrade tracking.
-- applied_by is nullable: automated provisioning runs may have no human actor.

CREATE TABLE IF NOT EXISTS control.tenant_blueprint_application (
    id               uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid        NOT NULL,
    blueprint_code   text        NOT NULL,
    applied_version  text        NOT NULL,
    applied_at       timestamptz NOT NULL DEFAULT now(),
    applied_by       uuid,
    status           text        NOT NULL DEFAULT 'applied',
    error_detail     text,
    metadata         jsonb,

    -- Audit
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid        NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT tba_pkey         PRIMARY KEY (id),
    CONSTRAINT tba_tenant_bp_uq UNIQUE (tenant_id, blueprint_code),
    CONSTRAINT tba_status_chk   CHECK (status IN ('applied', 'rolled_back', 'failed'))
);

COMMENT ON TABLE  control.tenant_blueprint_application IS
    'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Audit log of blueprint packs applied per tenant. '
    'applied_by: principal who triggered provisioning (NULL for automated runs). '
    'created_by: audit trail — use system sentinel for automated inserts. '
    'applied_version: snapshot of blueprint version at time of application; '
    'survives future registry updates. '
    'R6: migrated from seed file into main DDL bundle.';
COMMENT ON COLUMN control.tenant_blueprint_application.blueprint_code IS
    'References control.blueprint_registry.code.';
COMMENT ON COLUMN control.tenant_blueprint_application.applied_version IS
    'Snapshot of blueprint base_version at time of application.';
COMMENT ON COLUMN control.tenant_blueprint_application.applied_by IS
    'Principal who triggered provisioning. NULL when applied by automation.';


-- =============================================================================
-- §AI1  control.ai_action_policy — autonomy ceiling per action × doc class
-- =============================================================================
-- R8: governs how autonomous Atlas AI is allowed to be for a given action and
-- document class within a tenant. autonomy_level is the ceiling — the runtime
-- engine never exceeds it regardless of confidence.
-- Layered lookup: (tenant, action_code, doc_class) → (tenant, action_code, NULL)
-- → platform default. First enabled match wins.
CREATE TABLE IF NOT EXISTS control.ai_action_policy (
    -- Identity
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,

    -- Scope
    action_code                 text        NOT NULL,   -- e.g. 'classify', 'extract', 'suggest', 'autofill', 'approve'
    doc_class                   text,                   -- NULL = catch-all for all doc classes

    -- Autonomy ceiling
    -- disabled  → Atlas never acts; feature off for this action/tenant
    -- suggest   → Atlas surfaces a suggestion; human always decides (L1)
    -- assist    → Atlas pre-fills/pre-selects; human confirms before commit (L2)
    -- auto      → Atlas acts without human confirmation when confidence ≥ threshold (L3)
    autonomy_level              text        NOT NULL DEFAULT 'suggest',

    -- Confidence gate for auto-execution (NULL = use ai_confidence_threshold row)
    min_confidence_for_auto     numeric(5,4),

    -- Whether human confirmation dialog is shown even in assist mode
    requires_human_confirmation boolean     NOT NULL DEFAULT true,

    -- Override approval path when confidence < threshold or action is blocked
    override_policy_definition_id uuid,      -- FK → control.policy_definition ON DELETE SET NULL

    -- Lifecycle
    is_active                   boolean     NOT NULL DEFAULT true,
    effective_from              timestamptz NOT NULL DEFAULT now(),
    effective_to                timestamptz,

    -- Audit
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT aap_pkey              PRIMARY KEY (id),
    CONSTRAINT aap_natural_uq        UNIQUE NULLS NOT DISTINCT (tenant_id, action_code, doc_class),
    CONSTRAINT aap_action_nonempty   CHECK (btrim(action_code) <> ''),
    CONSTRAINT aap_autonomy_chk      CHECK (autonomy_level IN (
        'disabled', 'suggest', 'assist', 'auto')),
    CONSTRAINT aap_confidence_chk    CHECK (min_confidence_for_auto IS NULL
                                        OR min_confidence_for_auto BETWEEN 0 AND 1),
    CONSTRAINT aap_effective_order   CHECK (effective_to IS NULL
                                        OR effective_to > effective_from)
);

COMMENT ON TABLE control.ai_action_policy IS
    'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (no status/is_active GENERATED). R8: Atlas AI autonomy ceiling per tenant × action_code × doc_class. '
    'autonomy_level is the hard ceiling — runtime never exceeds it regardless of confidence. '
    'Layered lookup: (tenant, action, doc_class) → (tenant, action, NULL) → platform default. '
    'disabled=feature off; suggest=L1 surface only; assist=L2 pre-fill+confirm; auto=L3 act. '
    'min_confidence_for_auto: NULL defers to ai_confidence_threshold row for the same scope.';
COMMENT ON COLUMN control.ai_action_policy.action_code IS
    'Stable action identifier. E.g. classify, extract, suggest, autofill, approve, fx_rate.';
COMMENT ON COLUMN control.ai_action_policy.doc_class IS
    'Document class this policy applies to. NULL = applies to all classes for this action.';


-- =============================================================================
-- §AI2  control.ai_confidence_threshold — tiered confidence thresholds per action
-- =============================================================================
-- R8: defines the confidence levels that gate L1/L2/L3 autonomy tiers.
-- Three levels must satisfy: min_for_suggest ≤ min_for_assist ≤ min_for_auto.
-- Also configures drift-alert threshold + lookback window for monitoring.
-- Layered lookup same as ai_action_policy: doc_class=NULL is catch-all,
-- model_id=NULL applies to all model versions.
CREATE TABLE IF NOT EXISTS control.ai_confidence_threshold (
    -- Identity
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,

    -- Scope
    action_code                 text        NOT NULL,
    doc_class                   text,                   -- NULL = catch-all
    model_id                    text,                   -- NULL = all model versions

    -- Autonomy-tier confidence gates (0.0–1.0)
    min_for_suggest             numeric(5,4) NOT NULL DEFAULT 0.5000,   -- L1: show suggestion
    min_for_assist              numeric(5,4) NOT NULL DEFAULT 0.7000,   -- L2: pre-fill + confirm
    min_for_auto                numeric(5,4) NOT NULL DEFAULT 0.9000,   -- L3: auto-execute

    -- Drift alerting
    drift_alert_below           numeric(5,4),           -- alert when rolling avg drops below this
    drift_window_hours          smallint    NOT NULL DEFAULT 24,

    -- Lifecycle
    is_active                   boolean     NOT NULL DEFAULT true,

    -- Audit
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT act_pkey              PRIMARY KEY (id),
    CONSTRAINT act_natural_uq        UNIQUE NULLS NOT DISTINCT (
        tenant_id, action_code, doc_class, model_id),
    CONSTRAINT act_action_nonempty   CHECK (btrim(action_code) <> ''),
    CONSTRAINT act_suggest_chk       CHECK (min_for_suggest BETWEEN 0 AND 1),
    CONSTRAINT act_assist_chk        CHECK (min_for_assist  BETWEEN 0 AND 1),
    CONSTRAINT act_auto_chk          CHECK (min_for_auto    BETWEEN 0 AND 1),
    CONSTRAINT act_threshold_order   CHECK (min_for_suggest <= min_for_assist
                                        AND min_for_assist  <= min_for_auto),
    CONSTRAINT act_drift_chk         CHECK (drift_alert_below IS NULL
                                        OR drift_alert_below BETWEEN 0 AND 1),
    CONSTRAINT act_window_pos        CHECK (drift_window_hours > 0)
);

COMMENT ON TABLE control.ai_confidence_threshold IS
    'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (no status/is_active GENERATED). R8: tiered confidence thresholds governing Atlas AI autonomy levels. '
    'Three gate values (suggest ≤ assist ≤ auto) map to L1/L2/L3 autonomy. '
    'drift_alert_below: trigger drift alert when rolling-window avg confidence '
    'drops below this threshold. Layered lookup: (tenant, action, doc_class, model) '
    '→ (tenant, action, doc_class, NULL) → (tenant, action, NULL, NULL).';
COMMENT ON COLUMN control.ai_confidence_threshold.model_id IS
    'Model version identifier (e.g. atlas-classifier-v3). NULL = applies to all models.';
COMMENT ON COLUMN control.ai_confidence_threshold.drift_window_hours IS
    'Lookback window for rolling-average confidence used in drift detection.';


-- =============================================================================
-- §AI3  control.ai_drift_baseline — statistical reference distributions
-- =============================================================================
-- R8: stores the reference confidence distribution for a (tenant, action, doc_class, model)
-- combination at a point in time. Drift monitoring compares live rolling stats against
-- the current baseline. Multiple baselines per scope are retained for history;
-- is_current=true marks the active reference.
-- Corrections: set old is_current=false, superseded_by_id points to new baseline.
CREATE TABLE IF NOT EXISTS control.ai_drift_baseline (
    -- Identity
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,

    -- Scope
    action_code                 text        NOT NULL,
    doc_class                   text,                   -- NULL = applies to all classes
    model_id                    text        NOT NULL,   -- specific model version that produced this baseline

    -- Baseline establishment
    baseline_date               date        NOT NULL DEFAULT CURRENT_DATE,
    sample_size                 integer     NOT NULL,

    -- Statistical reference (confidence distribution)
    mean_confidence             numeric(7,6) NOT NULL,   -- 0.000000–1.000000
    std_dev_confidence          numeric(7,6) NOT NULL,
    p5_confidence               numeric(7,6),            -- 5th percentile
    p95_confidence              numeric(7,6),            -- 95th percentile

    -- Optional per-feature distribution stats
    feature_stats               jsonb,                   -- { "field_name": { "mean": ..., "std_dev": ... } }

    -- Status / history chain
    is_current                  boolean     NOT NULL DEFAULT false,
    superseded_at               timestamptz,
    superseded_by_id            uuid,                   -- FK → self (newer baseline that supersedes this one)

    -- Audit
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT adb_pkey              PRIMARY KEY (id),
    CONSTRAINT adb_action_nonempty   CHECK (btrim(action_code) <> ''),
    CONSTRAINT adb_model_nonempty    CHECK (btrim(model_id) <> ''),
    CONSTRAINT adb_sample_pos        CHECK (sample_size > 0),
    CONSTRAINT adb_mean_range_chk    CHECK (mean_confidence BETWEEN 0 AND 1),
    CONSTRAINT adb_std_nonneg_chk    CHECK (std_dev_confidence >= 0),
    CONSTRAINT adb_p5_range_chk      CHECK (p5_confidence IS NULL
                                        OR p5_confidence BETWEEN 0 AND 1),
    CONSTRAINT adb_p95_range_chk     CHECK (p95_confidence IS NULL
                                        OR p95_confidence BETWEEN 0 AND 1),
    CONSTRAINT adb_percentile_order  CHECK (p5_confidence IS NULL OR p95_confidence IS NULL
                                        OR p5_confidence <= p95_confidence),
    CONSTRAINT adb_feature_chk       CHECK (feature_stats IS NULL
                                        OR jsonb_typeof(feature_stats) = 'object')
);

COMMENT ON TABLE control.ai_drift_baseline IS
    'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_current boolean NOT NULL DEFAULT false (no status/is_active GENERATED). R8: statistical reference distributions for Atlas AI drift monitoring. '
    'One row per (tenant, action_code, doc_class, model_id, baseline_date). '
    'is_current=true marks the active reference for live drift comparison. '
    'superseded_by_id forms a history chain when baselines are refreshed. '
    'feature_stats holds per-field distributional stats for multivariate drift detection.';
COMMENT ON COLUMN control.ai_drift_baseline.model_id IS
    'Model version that produced this baseline. Baselines are model-version-specific.';
COMMENT ON COLUMN control.ai_drift_baseline.is_current IS
    'True for the single active baseline per (tenant, action_code, doc_class, model_id). '
    'Partial unique index adb_current_uq enforces at most one current baseline per scope.';


-- =============================================================================
-- §EF1  control.entity_flow — named, versioned intake experience
-- =============================================================================
-- Bound to an entity_version + trigger_context. Tenants may override platform
-- flows by inserting tenant-scoped rows with the same flow_code. Exactly one
-- active default per (entity_version, trigger_context, tenant) scope.

CREATE TABLE IF NOT EXISTS control.entity_flow (
    id                    uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid,
    entity_version_id     uuid         NOT NULL,

    flow_code             text         NOT NULL,
    label                 text         NOT NULL,
    description           text,
    icon_key              text,

    trigger_context       text         NOT NULL,
    is_default            boolean      NOT NULL DEFAULT false,

    config                jsonb        NOT NULL DEFAULT '{}',

    version_no            integer      NOT NULL DEFAULT 1,
    status                text         NOT NULL DEFAULT 'draft',
    effective_from        timestamptz,
    effective_to          timestamptz,
    supersedes_flow_id    uuid,

    created_at            timestamptz  NOT NULL DEFAULT now(),
    created_by            uuid         NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT eflow_pkey              PRIMARY KEY (id),
    CONSTRAINT eflow_tenant_id_uq      UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT eflow_version_uq        UNIQUE NULLS NOT DISTINCT (tenant_id, entity_version_id, flow_code, version_no),
    CONSTRAINT eflow_flow_code_fmt     CHECK (flow_code ~ '^[a-z][a-z0-9_]*$'),
    CONSTRAINT eflow_trigger_chk       CHECK (trigger_context IN (
        'new','edit','approve','duplicate','read_only','clone')),
    CONSTRAINT eflow_status_chk        CHECK (status IN (
        'draft','active','superseded','archived')),
    CONSTRAINT eflow_version_chk       CHECK (version_no >= 1),
    CONSTRAINT eflow_effective_chk     CHECK (effective_to IS NULL OR effective_to > effective_from),
    CONSTRAINT eflow_config_chk        CHECK (jsonb_typeof(config) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS eflow_default_per_ctx_uq
    ON control.entity_flow (
        COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
        entity_version_id,
        trigger_context
    )
    WHERE is_default = true AND status = 'active';

CREATE INDEX IF NOT EXISTS eflow_entity_version_idx
    ON control.entity_flow (entity_version_id, status)
    WHERE status = 'active';

DO $$ BEGIN
    ALTER TABLE control.entity_flow
        ADD CONSTRAINT eflow_entity_version_fk
        FOREIGN KEY (entity_version_id) REFERENCES control.entity_version (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.entity_flow
        ADD CONSTRAINT eflow_supersedes_fk
        FOREIGN KEY (supersedes_flow_id) REFERENCES control.entity_flow (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE control.entity_flow IS
    'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Named intake experience bound to an entity_version. '
    'Versioned and tenant-overrideable. config jsonb carries cross-step concerns: '
    'summary panel, input modes, dedup index binding, assist rules, and layout.';


-- =============================================================================
-- §EF2  control.entity_flow_step — ordered stages within a flow
-- =============================================================================

CREATE TABLE IF NOT EXISTS control.entity_flow_step (
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid,
    flow_id          uuid         NOT NULL,

    step_key         text         NOT NULL,
    label            text         NOT NULL,
    description      text,
    icon_key         text,
    sort_order       smallint     NOT NULL,

    skip_when        jsonb,
    advance_rule     jsonb        NOT NULL DEFAULT '{}',
    layout_hint      text         NOT NULL DEFAULT 'two_column',

    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT efs_pkey              PRIMARY KEY (id),
    CONSTRAINT efs_tenant_id_uq      UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT efs_flow_step_uq      UNIQUE (flow_id, step_key),
    CONSTRAINT efs_flow_order_uq     UNIQUE (flow_id, sort_order),
    CONSTRAINT efs_step_key_fmt      CHECK (step_key ~ '^[a-z][a-z0-9_]*$'),
    CONSTRAINT efs_layout_chk        CHECK (layout_hint IN (
        'two_column','single_column','summary_side','line_editor','grid','card')),
    CONSTRAINT efs_skip_when_chk     CHECK (skip_when IS NULL OR jsonb_typeof(skip_when) = 'object'),
    CONSTRAINT efs_advance_chk       CHECK (jsonb_typeof(advance_rule) = 'object')
);

CREATE INDEX IF NOT EXISTS efs_flow_idx ON control.entity_flow_step (flow_id, sort_order);

DO $$ BEGIN
    ALTER TABLE control.entity_flow_step
        ADD CONSTRAINT efs_flow_fk
        FOREIGN KEY (flow_id) REFERENCES control.entity_flow (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE control.entity_flow_step IS
    'ARCHETYPE=A;SCOPE=T. Ordered stages within a flow. '
    'skip_when makes steps conditionally vanish (JSONLogic over draft). '
    'advance_rule gates progression — required_fields list + optional predicate.';


-- =============================================================================
-- §EF3  control.entity_flow_field — per-step field rendering behavior
-- =============================================================================

CREATE TABLE IF NOT EXISTS control.entity_flow_field (
    id                      uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid,
    flow_step_id            uuid         NOT NULL,
    entity_field_id         uuid         NOT NULL,

    mode                    text         NOT NULL,
    derivation_mode         text,

    visible_when            jsonb,
    required_when           jsonb,

    default_source          text,
    derive_expression       text,
    override_permission     text,
    override_requires_note  boolean      NOT NULL DEFAULT false,

    summary_role            text,
    ui_variant              text,
    format                  text,
    span                    smallint     NOT NULL DEFAULT 1,
    help_text               text,
    placeholder             text,
    sort_order              smallint     NOT NULL DEFAULT 0,

    created_at              timestamptz  NOT NULL DEFAULT now(),
    created_by              uuid         NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT eff_pkey               PRIMARY KEY (id),
    CONSTRAINT eff_tenant_id_uq       UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT eff_step_field_uq      UNIQUE (flow_step_id, entity_field_id),
    CONSTRAINT eff_mode_chk           CHECK (mode IN (
        'required','editable','readonly','hidden','summary_only','chip')),
    CONSTRAINT eff_deriv_mode_chk     CHECK (derivation_mode IS NULL OR derivation_mode IN (
        'derived_locked','derived_overrideable','manual')),
    CONSTRAINT eff_deriv_expr_chk     CHECK (
        derivation_mode IS NULL
        OR derivation_mode = 'manual'
        OR derive_expression IS NOT NULL
    ),
    CONSTRAINT eff_override_perm_chk  CHECK (
        override_permission IS NULL
        OR derivation_mode = 'derived_overrideable'
    ),
    CONSTRAINT eff_summary_role_chk   CHECK (summary_role IS NULL OR summary_role IN (
        'total','subtotal','addition','deduction','line_badge','warning','meta')),
    CONSTRAINT eff_span_chk           CHECK (span IN (1, 2, 3)),
    CONSTRAINT eff_visible_chk        CHECK (visible_when  IS NULL OR jsonb_typeof(visible_when)  = 'object'),
    CONSTRAINT eff_required_chk       CHECK (required_when IS NULL OR jsonb_typeof(required_when) = 'object')
);

CREATE INDEX IF NOT EXISTS eff_step_idx  ON control.entity_flow_field (flow_step_id, sort_order);
CREATE INDEX IF NOT EXISTS eff_field_idx ON control.entity_flow_field (entity_field_id);
CREATE INDEX IF NOT EXISTS eff_mode_step_idx
    ON control.entity_flow_field (flow_step_id, mode, sort_order);

DO $$ BEGIN
    ALTER TABLE control.entity_flow_field
        ADD CONSTRAINT eff_step_fk
        FOREIGN KEY (flow_step_id) REFERENCES control.entity_flow_step (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.entity_flow_field
        ADD CONSTRAINT eff_field_fk
        FOREIGN KEY (entity_field_id) REFERENCES control.entity_field (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE control.entity_flow_field IS
    'ARCHETYPE=A;SCOPE=T. Per-flow, per-step rendering behavior for a canonical field. '
    'derivation_mode encodes the three-state model: derived_locked, derived_overrideable, manual. '
    'mode is the render role. visible_when/required_when run as JSONLogic over the in-progress draft.';


-- =============================================================================
-- §EF4  Hardening triggers
-- =============================================================================

CREATE OR REPLACE FUNCTION control.trg_fn_flow_field_validate_perm()
RETURNS trigger LANGUAGE plpgsql SET search_path = control, shared AS $$
BEGIN
    IF NEW.override_permission IS NULL THEN RETURN NEW; END IF;
    IF NOT EXISTS (
        SELECT 1 FROM shared.permission
         WHERE code = NEW.override_permission AND status = 'active'
    ) THEN
        RAISE EXCEPTION
            'entity_flow_field.override_permission "%" is not an active shared.permission.code',
            NEW.override_permission
        USING ERRCODE = 'foreign_key_violation',
              HINT    = 'Seed the permission in shared.permission before binding.';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_flow_field_validate_perm ON control.entity_flow_field;
CREATE TRIGGER trg_flow_field_validate_perm
BEFORE INSERT OR UPDATE OF override_permission
ON control.entity_flow_field
FOR EACH ROW EXECUTE FUNCTION control.trg_fn_flow_field_validate_perm();

CREATE OR REPLACE FUNCTION control.trg_fn_flow_field_one_writer()
RETURNS trigger LANGUAGE plpgsql SET search_path = control AS $$
DECLARE
    v_flow_id uuid;
    v_writers integer;
BEGIN
    IF NEW.mode NOT IN ('required','editable') THEN RETURN NEW; END IF;
    SELECT flow_id INTO v_flow_id
      FROM control.entity_flow_step WHERE id = NEW.flow_step_id;
    SELECT count(*) INTO v_writers
      FROM control.entity_flow_field eff
      JOIN control.entity_flow_step efs ON efs.id = eff.flow_step_id
     WHERE efs.flow_id = v_flow_id
       AND eff.entity_field_id = NEW.entity_field_id
       AND eff.mode IN ('required','editable')
       AND eff.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
    IF v_writers > 0 THEN
        RAISE EXCEPTION
            'Field % already has a write-capable binding in flow %. '
            'Only one step per flow may hold required|editable for a given field.',
            NEW.entity_field_id, v_flow_id
        USING ERRCODE = 'unique_violation',
              HINT    = 'Use readonly or chip mode in the other steps.';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_flow_field_one_writer ON control.entity_flow_field;
CREATE TRIGGER trg_flow_field_one_writer
BEFORE INSERT OR UPDATE OF mode, entity_field_id, flow_step_id
ON control.entity_flow_field
FOR EACH ROW EXECUTE FUNCTION control.trg_fn_flow_field_one_writer();
