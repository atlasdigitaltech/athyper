-- ============================================================================
-- control/04_indexes.sql
-- Concept: Governance Indexes — lookup, policy, entity, and field access performance
-- Depends on: 04_tables/002_control.sql
-- Naming: <table>_<cols>_idx | _uq (unique) | _pidx (partial WHERE).
-- ============================================================================

-- lookup_domain
CREATE INDEX IF NOT EXISTS lookup_domain_active_pidx ON control.lookup_domain (code) WHERE status = 'active';

-- lookup_value — plain domain_code index for FK cascade checks (partial indexes excluded)
CREATE INDEX IF NOT EXISTS lookup_value_domain_idx ON control.lookup_value (domain_code);

-- lookup_value — global uniqueness (tenant_id IS NULL)
-- P4-FIX: Pattern B split partial indexes. Global system values unique on (domain_code, code).
-- Tenants MAY register values with the same code as a global value (intentional overlay/shadow).
-- A single NULLS NOT DISTINCT constraint would incorrectly block that extension pattern.
CREATE UNIQUE INDEX IF NOT EXISTS lookup_value_global_uq ON control.lookup_value (domain_code, code) WHERE tenant_id IS NULL;

-- lookup_value — per-tenant uniqueness (tenant_id IS NOT NULL)
-- P4-FIX: Pattern B split partial indexes. Tenant-scoped values unique on (tenant_id, domain_code, code).
-- Tenants cannot create two values with the same code within a domain they own.
CREATE UNIQUE INDEX IF NOT EXISTS lookup_value_tenant_uq ON control.lookup_value (tenant_id, domain_code, code) WHERE tenant_id IS NOT NULL;

-- lookup_value — covers fn_valid_lookup() query: WHERE domain_code = ? AND code = ? AND status = 'active'
CREATE INDEX IF NOT EXISTS lookup_value_validation_idx ON control.lookup_value (domain_code, code) WHERE status = 'active';

-- lookup_value — tenant scoped lookup
CREATE INDEX IF NOT EXISTS lookup_value_tenant_idx ON control.lookup_value (tenant_id, domain_code) WHERE tenant_id IS NOT NULL;


-- mfa_config — one primary MFA method per principal
CREATE UNIQUE INDEX IF NOT EXISTS ux_mfa_config_one_primary ON control.mfa_config (tenant_id, principal_id) WHERE is_primary = true AND is_enabled = true AND is_verified = true;

-- ux_mfa_config_keycloak_credential REMOVED — redundant with
-- mfa_config_keycloak_credential_uq UNIQUE NULLS NOT DISTINCT on the table,
-- which already creates a full unique index covering all non-NULL lookups.

CREATE INDEX IF NOT EXISTS mfa_config_principal_idx ON control.mfa_config (tenant_id, principal_id);
CREATE INDEX IF NOT EXISTS mfa_config_contact_link_idx ON control.mfa_config (tenant_id, contact_link_id) WHERE contact_link_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mfa_config_sync_drift_pidx ON control.mfa_config (tenant_id) WHERE keycloak_sync_status IN ('pending', 'drift', 'error');


-- ————————————————————————————————————————————————————————————————————————————
-- NOTIFICATION TABLES
-- ————————————————————————————————————————————————————————————————————————————

-- —— notification_provider ————————————————————————————————————————————————
-- Channel dispatch: find active providers for a channel, ordered by priority
CREATE INDEX IF NOT EXISTS nprov_channel_active_idx
    ON control.notification_provider (channel, priority ASC)
    WHERE is_enabled = true;

-- Health monitoring: all degraded/down providers
CREATE INDEX IF NOT EXISTS nprov_health_pidx
    ON control.notification_provider (health)
    WHERE health IN ('degraded', 'down');

-- —— notification_routing_rule ————————————————————————————————————————————
-- Rule evaluation: find active rules for an event_type (tenant + global)
CREATE INDEX IF NOT EXISTS nrr_event_active_idx
    ON control.notification_routing_rule (event_type, sort_order ASC)
    WHERE is_enabled = true;

-- Entity-scoped rule lookup
CREATE INDEX IF NOT EXISTS nrr_entity_type_pidx
    ON control.notification_routing_rule (event_type, entity_type)
    WHERE entity_type IS NOT NULL AND is_enabled = true;

-- Tenant rules
CREATE INDEX IF NOT EXISTS nrr_tenant_idx
    ON control.notification_routing_rule (tenant_id)
    WHERE tenant_id IS NOT NULL;

-- GIN index on condition_expr for @> containment queries (e.g. WHERE condition_expr @> '{"field":"value"}')
CREATE INDEX IF NOT EXISTS nrr_condition_gin
    ON control.notification_routing_rule USING gin (condition_expr)
    WHERE condition_expr IS NOT NULL;

-- —— notification_template ———————————————————————————————————————————————
-- Template resolution: find active template for (key, channel, locale)
CREATE INDEX IF NOT EXISTS ntmpl_key_channel_locale_idx
    ON control.notification_template (template_key, channel, locale)
    WHERE status = 'active';

-- Tenant override lookup: tenant templates take precedence over platform defaults
CREATE INDEX IF NOT EXISTS ntmpl_tenant_key_idx
    ON control.notification_template (tenant_id, template_key, channel, locale)
    WHERE tenant_id IS NOT NULL AND status = 'active';


-- ── LIFECYCLE ENGINE indexes ───────────────────────────────────────────
-- ── control.lifecycle ────────────────────────────────────────────────────────
-- Tenant visible lifecycles
CREATE INDEX IF NOT EXISTS lc_tenant_active_idx
    ON control.lifecycle (tenant_id, is_active)
    WHERE is_active = true;
-- Stale detection (definition_hash IS NULL = needs recompile)
CREATE INDEX IF NOT EXISTS lc_stale_pidx
    ON control.lifecycle (id)
    WHERE definition_hash IS NULL AND is_active = true;

-- ── control.lifecycle_state ──────────────────────────────────────────────────
-- All states in a lifecycle (primary navigation)
CREATE INDEX IF NOT EXISTS ls_lifecycle_idx
    ON control.lifecycle_state (lifecycle_id, sort_order ASC);
-- Initial state lookup
CREATE UNIQUE INDEX IF NOT EXISTS ls_single_initial_uidx
    ON control.lifecycle_state (lifecycle_id)
    WHERE is_initial = true;

-- ── control.lifecycle_transition ─────────────────────────────────────────────
-- Outbound transitions from a state (runtime transition check)
CREATE INDEX IF NOT EXISTS lt_from_active_idx
    ON control.lifecycle_transition (lifecycle_id, from_state_id)
    WHERE is_active = true;
-- Inbound transitions to a state (UI: what leads here?)
CREATE INDEX IF NOT EXISTS lt_to_idx
    ON control.lifecycle_transition (lifecycle_id, to_state_id);

-- ── control.lifecycle_transition_hook ────────────────────────────────────────
-- Hooks for a transition ordered by execution
CREATE INDEX IF NOT EXISTS lth_transition_exec_idx
    ON control.lifecycle_transition_hook (transition_id, timing, sort_order ASC)
    WHERE is_active = true;
-- Hooks requiring safety enforcement
CREATE INDEX IF NOT EXISTS lth_required_pidx
    ON control.lifecycle_transition_hook (transition_id)
    WHERE safety_level = 'required' AND is_active = true;


-- ── WORKFLOW ENGINE indexes ────────────────────────────────────────────
-- ── control.workflow_definition ──────────────────────────────────────────────
-- Active definitions for an entity_type
CREATE INDEX IF NOT EXISTS wdef_entity_active_idx
    ON control.workflow_definition (tenant_id, entity_type)
    WHERE is_active = true;
-- A04: partial unique — one open-ended active definition per entity_type per tenant
CREATE UNIQUE INDEX IF NOT EXISTS wdef_active_open_uidx
    ON control.workflow_definition (tenant_id, entity_type)
    WHERE is_active = true AND effective_to IS NULL;

-- ── control.workflow_template ────────────────────────────────────────────────
-- Active templates for lookup
CREATE INDEX IF NOT EXISTS wtpl_tenant_active_idx
    ON control.workflow_template (tenant_id, is_active)
    WHERE is_active = true;
-- Stale compiled templates
CREATE INDEX IF NOT EXISTS wtpl_stale_pidx
    ON control.workflow_template (id)
    WHERE compiled_hash IS NULL AND is_active = true;


-- ─── Partial UNIQUE indexes (moved from CREATE TABLE — PG requires CREATE INDEX) ───

-- Canonical fields unique by name (entity_version_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS ef_canonical_name_uidx
    ON control.entity_field (name) WHERE entity_version_id IS NULL;

-- Version fields unique by (version, name)
CREATE UNIQUE INDEX IF NOT EXISTS ef_version_name_uidx
    ON control.entity_field (entity_version_id, name)
    WHERE entity_version_id IS NOT NULL;

-- ─── control.entity ─────────────────────────────────────────────────────────

-- entity_code: supports trg_fn_validate_entity_binding / trg_fn_validate_target_entity lookups
CREATE INDEX IF NOT EXISTS entity_code_idx         ON control.entity (entity_code);
CREATE INDEX IF NOT EXISTS entity_tenant_code_idx  ON control.entity (tenant_id, entity_code);

CREATE INDEX IF NOT EXISTS entity_tenant_class_idx
    ON control.entity (tenant_id, entity_class, status) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS entity_tenant_unprovisioned_pidx
    ON control.entity (tenant_id) WHERE ownership_model = 'tenant' AND provisioned_at IS NULL;
CREATE INDEX IF NOT EXISTS entity_module_idx
    ON control.entity (module_id, entity_class);

-- ─── control.entity_version ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS ev_entity_status_idx
    ON control.entity_version (entity_id, status, version_no DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ev_single_effective_uidx
    ON control.entity_version (entity_id) WHERE status = 'EFFECTIVE';
CREATE UNIQUE INDEX IF NOT EXISTS ev_single_draft_uidx
    ON control.entity_version (entity_id) WHERE is_working_copy = true;

-- ─── control.entity_field ───────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS ef_version_sort_idx
    ON control.entity_field (entity_version_id, sort_order ASC)
    WHERE entity_version_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ef_canonical_idx
    ON control.entity_field (origin, name) WHERE entity_version_id IS NULL;
CREATE INDEX IF NOT EXISTS ef_custom_unprov_pidx
    ON control.entity_field (tenant_id) WHERE origin = 'business' AND provisioned_at IS NULL;
CREATE INDEX IF NOT EXISTS ef_searchable_pidx
    ON control.entity_field (entity_version_id) WHERE is_searchable = true;
CREATE INDEX IF NOT EXISTS ef_filterable_pidx
    ON control.entity_field (entity_version_id) WHERE is_filterable = true;

-- ─── control.overlay ────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS ov_tenant_active_idx
    ON control.overlay (tenant_id, base_entity_id, priority)
    WHERE is_active = true;

-- ─── control.overlay_change ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS oc_overlay_ordered_idx
    ON control.overlay_change (overlay_id, change_order ASC);

-- ─── control.entity_lifecycle ───────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS el_entity_idx
    ON control.entity_lifecycle (entity_name, priority ASC);

-- ─── control.entity_operation ───────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS eo_entity_surface_idx
    ON control.entity_operation (entity_name, surface, placement)
    WHERE is_enabled = true;


-- ── control.book_posting_rule ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS bpr_company_idx      ON control.book_posting_rule (tenant_id, company_code_id);
CREATE INDEX IF NOT EXISTS bpr_source_book_idx  ON control.book_posting_rule (tenant_id, source_book_id);
CREATE INDEX IF NOT EXISTS bpr_active_pidx      ON control.book_posting_rule (tenant_id, company_code_id, source_book_id)
    WHERE is_active = true;

-- ============================================================================
-- Engine 4.13: Unified Transaction Resolution Engine additions
-- ============================================================================

-- ============================================================================
-- control.transaction_flow_template
-- ============================================================================

-- Partial unique: (COALESCE(tenant_id,...), flow_code, event_code)
-- Handles nullable tenant_id without NULLS NOT DISTINCT (PG 14 compatible).
CREATE UNIQUE INDEX IF NOT EXISTS tft_flow_event_uq
    ON control.transaction_flow_template (
        COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
        flow_code, event_code);

-- Active rows by flow — runtime resolution path
CREATE INDEX IF NOT EXISTS tft_flow_active_pidx
    ON control.transaction_flow_template (flow_code, direction, event_seq)
    WHERE is_active = true;


-- ============================================================================
-- control.acct_profile_config
-- ============================================================================

CREATE INDEX IF NOT EXISTS apc_profile_idx
    ON control.acct_profile_config (accounting_profile_id);

CREATE INDEX IF NOT EXISTS apc_direction_idx
    ON control.acct_profile_config (tenant_id, direction);

-- GIN index on text[] — supports flow_code = ANY(applicable_flow_codes)
CREATE INDEX IF NOT EXISTS apc_flow_idx
    ON control.acct_profile_config USING gin (applicable_flow_codes);

-- Covering partial index for the hot active-only query path
CREATE INDEX IF NOT EXISTS apc_active_pidx
    ON control.acct_profile_config (tenant_id, direction)
    WHERE is_active = true;

-- Effective-date range lookups
CREATE INDEX IF NOT EXISTS apc_effective_idx
    ON control.acct_profile_config (tenant_id, effective_from, effective_to);


-- ============================================================================
-- control.acct_profile_commitment_config
-- ============================================================================

CREATE INDEX IF NOT EXISTS apcc_config_idx
    ON control.acct_profile_commitment_config (profile_config_id);


-- ============================================================================
-- control.acct_profile_revenue_config
-- ============================================================================

CREATE INDEX IF NOT EXISTS aprc_config_idx
    ON control.acct_profile_revenue_config (profile_config_id);

CREATE INDEX IF NOT EXISTS aprc_paired_idx
    ON control.acct_profile_revenue_config (paired_profile_id)
    WHERE paired_profile_id IS NOT NULL;


-- ============================================================================
-- control.acct_profile_settlement_config
-- ============================================================================

CREATE INDEX IF NOT EXISTS apsc_config_idx
    ON control.acct_profile_settlement_config (profile_config_id);


-- ============================================================================
-- control.acct_profile_event
-- ============================================================================

CREATE INDEX IF NOT EXISTS ape_config_idx
    ON control.acct_profile_event (profile_config_id);

CREATE INDEX IF NOT EXISTS ape_event_idx
    ON control.acct_profile_event (event_code);

-- Active events per profile — primary runtime lookup
CREATE INDEX IF NOT EXISTS ape_config_event_active_pidx
    ON control.acct_profile_event (profile_config_id, event_code)
    WHERE is_active = true;


-- ============================================================================
-- control.acct_profile_entry_template
-- ============================================================================

CREATE INDEX IF NOT EXISTS apet_event_idx
    ON control.acct_profile_entry_template (profile_event_id);

-- Active templates ordered for JE generation
CREATE INDEX IF NOT EXISTS apet_event_seq_active_pidx
    ON control.acct_profile_entry_template (profile_event_id, line_seq)
    WHERE is_active = true;


-- ============================================================================
-- control.acct_profile_book_rule
-- ============================================================================

CREATE INDEX IF NOT EXISTS apbr_config_idx
    ON control.acct_profile_book_rule (profile_config_id);

-- Book + event lookup (applies_to_events may be NULL)
CREATE INDEX IF NOT EXISTS apbr_config_book_active_pidx
    ON control.acct_profile_book_rule (profile_config_id, book_code)
    WHERE is_active = true;


-- ============================================================================
-- control.acct_profile_dimension_rule
-- ============================================================================

CREATE INDEX IF NOT EXISTS apdr_config_idx
    ON control.acct_profile_dimension_rule (profile_config_id, dimension_type_id);

CREATE INDEX IF NOT EXISTS apdr_priority_idx
    ON control.acct_profile_dimension_rule (profile_config_id, priority)
    WHERE is_active = true;


-- ============================================================================
-- control.classification_to_intent_rule
-- ============================================================================

CREATE INDEX IF NOT EXISTS cir_class_idx
    ON control.classification_to_intent_rule (classification_source, classification_id);

-- Priority-ordered active rules — primary lookup path
CREATE INDEX IF NOT EXISTS cir_priority_idx
    ON control.classification_to_intent_rule (tenant_id, classification_id, priority)
    WHERE is_active = true;

-- Effective-date filtering
CREATE INDEX IF NOT EXISTS cir_effective_idx
    ON control.classification_to_intent_rule (tenant_id, effective_from, effective_to)
    WHERE is_active = true;


-- ============================================================================
-- control.intent_to_accounting_profile_rule
-- ============================================================================

-- Active rules per tenant (full scan by priority)
CREATE INDEX IF NOT EXISTS iprr_active_pidx
    ON control.intent_to_accounting_profile_rule (tenant_id, priority)
    WHERE is_active = true;

-- Intent-specific narrowing
CREATE INDEX IF NOT EXISTS iprr_intent_idx
    ON control.intent_to_accounting_profile_rule (tenant_id, intent_id, priority)
    WHERE is_active = true;

-- Effective-date narrowing
CREATE INDEX IF NOT EXISTS iprr_effective_idx
    ON control.intent_to_accounting_profile_rule (tenant_id, effective_from, effective_to)
    WHERE is_active = true;


-- ============================================================================
-- control.intent_profile_override
-- ============================================================================

CREATE INDEX IF NOT EXISTS ipo_intent_idx
    ON control.intent_profile_override (intent_id);

-- Active overrides for runtime override check
CREATE INDEX IF NOT EXISTS ipo_active_pidx
    ON control.intent_profile_override (tenant_id, intent_id)
    WHERE is_active = true;

-- ── control.dimension_policy ─────────────────────────────────────────────────
-- Active policies for a dimension type — primary resolution lookup
CREATE INDEX IF NOT EXISTS dp_type_idx           ON control.dimension_policy (tenant_id, dimension_type_id)
    WHERE is_active = true;
-- Company-scoped policy lookup — checked first (higher precedence)
CREATE INDEX IF NOT EXISTS dp_company_idx        ON control.dimension_policy (tenant_id, company_code_id)
    WHERE company_code_id IS NOT NULL AND is_active = true;
-- Filter by account class scope — REQUIRED/FORBIDDEN on expense accounts
CREATE INDEX IF NOT EXISTS dp_account_class_idx  ON control.dimension_policy (tenant_id, scope_account_class)
    WHERE scope_account_class IS NOT NULL AND is_active = true;

-- ── control.dimension_policy_allowed_value ────────────────────────────────────
-- All allowed values for a policy — loaded during validation
CREATE INDEX IF NOT EXISTS dpav_policy_idx       ON control.dimension_policy_allowed_value (policy_id);
-- Reverse lookup — which policies allow a given value
CREATE INDEX IF NOT EXISTS dpav_value_idx        ON control.dimension_policy_allowed_value (dimension_value_id);

-- ── control.document_sequence_config ─────────────────────────────────────────
-- Active configs by company — used to find available doc types for a company
CREATE INDEX IF NOT EXISTS dsc_company_active_pidx ON control.document_sequence_config (tenant_id, company_code_id)
    WHERE is_active = true;

-- ── control.document_sequence_counter ────────────────────────────────────────
-- No additional indexes — composite PK (tenant_id, config_id, fiscal_year, period_number)
-- is the hot path for the UPDATE in next_document_number(). PK covers all access.


-- ── §CCRR  control.commodity_to_spend_category_rule ───────────────────────────
-- Deterministic routing: UNIQUE prevents same-priority collisions per (tenant, domain, code_from).
CREATE UNIQUE INDEX IF NOT EXISTS ccrr_active_priority_uq
    ON control.commodity_to_spend_category_rule (
        tenant_id, commodity_domain_code, code_from, priority
    ) WHERE is_active = true;

-- Range-scan index for routing lookups by incoming code
CREATE INDEX IF NOT EXISTS ccrr_domain_range_pidx
    ON control.commodity_to_spend_category_rule (
        tenant_id, commodity_domain_code, code_from, code_to
    ) WHERE is_active = true;

-- Reverse lookup: all routing rules targeting a given spend_category
CREATE INDEX IF NOT EXISTS ccrr_category_idx
    ON control.commodity_to_spend_category_rule (tenant_id, spend_category_id);


-- ── control.tax_rate_schedule ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS trs_jurisdiction_idx
    ON control.tax_rate_schedule (tenant_id, jurisdiction_id, tax_type_id)
    WHERE is_active = true;
CREATE INDEX IF NOT EXISTS trs_direction_pidx
    ON control.tax_rate_schedule (tenant_id, tax_direction)
    WHERE is_active = true;
CREATE INDEX IF NOT EXISTS trs_wht_pidx
    ON control.tax_rate_schedule (tenant_id, jurisdiction_id)
    WHERE wht_basis IS NOT NULL AND is_active = true;

-- ══════════════════════════════════════════════════════════════════════════════
-- BUDGET · COMMITMENT · PLANNING ENGINE — Control indexes
-- ══════════════════════════════════════════════════════════════════════════════

-- ── control.forecast_line ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fl_scenario        ON control.forecast_line (scenario_id);
CREATE INDEX IF NOT EXISTS idx_fl_account         ON control.forecast_line (gl_account_id, fiscal_year)
    WHERE gl_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fl_allocation      ON control.forecast_line (budget_allocation_id)
    WHERE budget_allocation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fl_cost_center     ON control.forecast_line (cost_center_id)
    WHERE cost_center_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fl_driver          ON control.forecast_line (driver_id)
    WHERE driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fl_company_code    ON control.forecast_line (company_code_id)
    WHERE company_code_id IS NOT NULL;

-- ── control.planning_driver ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pd_model           ON control.planning_driver (planning_model_id);
CREATE INDEX IF NOT EXISTS idx_pd_tenant          ON control.planning_driver (tenant_id);
CREATE INDEX IF NOT EXISTS idx_pd_status          ON control.planning_driver (planning_model_id, status)
    WHERE status = 'active';

-- ── control.planning_driver_formula ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pdf_driver         ON control.planning_driver_formula (driver_id);
CREATE INDEX IF NOT EXISTS idx_pdf_active         ON control.planning_driver_formula (driver_id, status)
    WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_pdf_effective      ON control.planning_driver_formula (driver_id, effective_from, effective_to);

-- ── control.planning_driver_assumption ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_da_driver          ON control.planning_driver_assumption (driver_id);
CREATE INDEX IF NOT EXISTS idx_da_scenario        ON control.planning_driver_assumption (scenario_id)
    WHERE scenario_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_da_fiscal          ON control.planning_driver_assumption (driver_id, fiscal_year);
CREATE INDEX IF NOT EXISTS idx_da_active          ON control.planning_driver_assumption (driver_id, status)
    WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_da_company_code    ON control.planning_driver_assumption (company_code_id)
    WHERE company_code_id IS NOT NULL;

-- ── control.planning_driver_version ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pdv_driver         ON control.planning_driver_version (driver_id);


-- ── §BK5 bank_format_rule ───────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS bfr_applicability_uq
    ON control.bank_format_rule (
        COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
        country_code, payment_network, direction,
        COALESCE(currency_code, '***')
    )
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS bfr_resolve_idx
    ON control.bank_format_rule (country_code, payment_network, direction, priority DESC)
    WHERE status = 'active';


-- ── §PM2 payment_method_company_policy ──────────────────────────────────────

-- Temporal uniqueness: one active policy per (company, method, direction, currency)
ALTER TABLE control.payment_method_company_policy
    DROP CONSTRAINT IF EXISTS pmcp_company_method_excl;
ALTER TABLE control.payment_method_company_policy
    ADD CONSTRAINT pmcp_company_method_excl
    EXCLUDE USING gist (
        tenant_id           WITH =,
        company_code_id     WITH =,
        payment_method_id   WITH =,
        direction           WITH =,
        COALESCE(currency_code, '***'::character(3)) WITH =,
        daterange(effective_from, COALESCE(effective_until, '9999-12-31'::date), '[)') WITH &&
    )
    WHERE (status = 'active');

CREATE INDEX IF NOT EXISTS pmcp_default_pidx
    ON control.payment_method_company_policy (tenant_id, company_code_id, direction)
    WHERE is_default = true AND status = 'active';

-- Default uniqueness: at most one active default per (company, direction, currency)
ALTER TABLE control.payment_method_company_policy
    DROP CONSTRAINT IF EXISTS pmcp_one_default_excl;
ALTER TABLE control.payment_method_company_policy
    ADD CONSTRAINT pmcp_one_default_excl
    EXCLUDE USING gist (
        tenant_id           WITH =,
        company_code_id     WITH =,
        direction           WITH =,
        COALESCE(currency_code, '***'::character(3)) WITH =,
        daterange(effective_from, COALESCE(effective_until, '9999-12-31'::date), '[)') WITH &&
    )
    WHERE (is_default = true AND status = 'active');

-- ── §PM4 payment_method_interface_binding ───────────────────────────────────

CREATE INDEX IF NOT EXISTS pmib_resolve_idx
    ON control.payment_method_interface_binding (
        tenant_id, payment_method_id, direction, priority DESC
    )
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS pmib_company_idx
    ON control.payment_method_interface_binding (tenant_id, company_code_id)
    WHERE company_code_id IS NOT NULL;

-- ── §PM5 payment_settlement_rule ────────────────────────────────────────────

-- Temporal uniqueness: one active rule per (company, method, direction, book)
ALTER TABLE control.payment_settlement_rule
    DROP CONSTRAINT IF EXISTS psr_company_method_excl;
ALTER TABLE control.payment_settlement_rule
    ADD CONSTRAINT psr_company_method_excl
    EXCLUDE USING gist (
        tenant_id           WITH =,
        company_code_id     WITH =,
        payment_method_id   WITH =,
        direction           WITH =,
        book_code           WITH =,
        daterange(effective_from, COALESCE(effective_until, '9999-12-31'::date), '[)') WITH &&
    )
    WHERE (status = 'active');


-- ── §POL  policy_definition + policy_rule ───────────────────────────────────

-- Primary lookup: find active policies for an entity type within a tenant
-- Covers: shouldRequirePolicy(tenantId, entityType) hot path
-- Note: effective date filtering is done at query time (CURRENT_DATE is not immutable).
CREATE INDEX IF NOT EXISTS pdef_tenant_entity_active_idx
    ON control.policy_definition (tenant_id, entity_type, priority ASC)
    WHERE is_active = true;

-- Platform-global policies (tenant_id IS NULL) searched separately
CREATE INDEX IF NOT EXISTS pdef_global_entity_active_pidx
    ON control.policy_definition (entity_type, priority ASC)
    WHERE tenant_id IS NULL AND is_active = true;

-- Temporal query: find policies effective at a given date
CREATE INDEX IF NOT EXISTS pdef_effective_idx
    ON control.policy_definition (tenant_id, entity_type, effective_from, effective_until);

-- Module-scoped policy lookup
CREATE INDEX IF NOT EXISTS pdef_module_idx
    ON control.policy_definition (module_id)
    WHERE module_id IS NOT NULL;

-- Rules ordered for evaluation: policy_id → priority ASC
CREATE INDEX IF NOT EXISTS prule_policy_priority_idx
    ON control.policy_rule (policy_id, priority ASC);

-- ── §TEC  transaction_event_catalog ──────────────────────────────────────────
-- R1: only active codes returned for picker queries; covering index for full scan
CREATE INDEX IF NOT EXISTS tec_active_code_pidx
    ON control.transaction_event_catalog (code)
    WHERE is_active = true;

-- ── §PROV-1  blueprint_registry ───────────────────────────────────────────────
-- R6: active packs for provisioning wizard queries
CREATE INDEX IF NOT EXISTS br_status_active_pidx
    ON control.blueprint_registry (category, code)
    WHERE status = 'active';

-- ── §PROV-2  tenant_blueprint_application ────────────────────────────────────
-- R6: primary access pattern — all packs applied to a given tenant
-- (tba_tenant_idx was previously created in the seed file; IF NOT EXISTS is idempotent)
CREATE INDEX IF NOT EXISTS tba_tenant_idx
    ON control.tenant_blueprint_application (tenant_id);

-- status filter — find failed or rolled-back applications
CREATE INDEX IF NOT EXISTS tba_status_pidx
    ON control.tenant_blueprint_application (tenant_id, status)
    WHERE status <> 'applied';
