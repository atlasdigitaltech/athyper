-- ============================================================================
-- control/03_constraints.sql
-- Concept: Governance FKs — control schema foreign key graph
-- Depends on: 04_tables/002_control.sql
-- ============================================================================
-- Idempotent via DO blocks.

-- lookup_value.domain_code → lookup_domain.code
DO $$ BEGIN
    ALTER TABLE control.lookup_value
        ADD CONSTRAINT lookup_value_domain_fk
        FOREIGN KEY (domain_code) REFERENCES control.lookup_domain (code)
        ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- lookup_value.tenant_id → master.tenant.id (nullable — NULL = global, cascade on tenant purge)
ALTER TABLE control.lookup_value DROP CONSTRAINT IF EXISTS lookup_value_tenant_fk;
DO $$ BEGIN
    ALTER TABLE control.lookup_value
        ADD CONSTRAINT lookup_value_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- mfa_config.contact_link_id → master.contact_link (composite FK, cascade delete)
-- CASCADE required: tenant → contact_link (CASCADE) → mfa_config (RESTRICT would block the
-- intermediate cascade and cause tenant deletion to fail with FK violation).
ALTER TABLE control.mfa_config DROP CONSTRAINT IF EXISTS mfa_config_contact_link_fk;
DO $$ BEGIN
    ALTER TABLE control.mfa_config
        ADD CONSTRAINT mfa_config_contact_link_fk
        FOREIGN KEY (tenant_id, contact_link_id)
        REFERENCES master.contact_link (tenant_id, id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- mfa_config.tenant_id → master.tenant
ALTER TABLE control.mfa_config DROP CONSTRAINT IF EXISTS mfa_config_tenant_fk;
DO $$ BEGIN
    ALTER TABLE control.mfa_config
        ADD CONSTRAINT mfa_config_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- mfa_config.principal_id → master.principal (composite FK, cascade — MFA records meaningless without principal)
ALTER TABLE control.mfa_config DROP CONSTRAINT IF EXISTS mfa_config_principal_fk;
DO $$ BEGIN
    ALTER TABLE control.mfa_config
        ADD CONSTRAINT mfa_config_principal_fk
        FOREIGN KEY (tenant_id, principal_id)
        REFERENCES master.principal (tenant_id, id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- mfa_config.method_type — CHECK removed, trigger-based validation in 09_triggers.
ALTER TABLE control.mfa_config DROP CONSTRAINT IF EXISTS mfa_config_method_type_chk;

-- Migrate keycloak_sync_status to shared.keycloak_sync_status_d domain.
-- Drops the inline CHECK, re-types the column, then re-adds the tighter 4-value
-- CHECK (mfa credentials never use 'disabled' — that state belongs to auth bindings).
ALTER TABLE control.mfa_config DROP CONSTRAINT IF EXISTS mfa_config_sync_status_chk;
ALTER TABLE control.mfa_config
    ALTER COLUMN keycloak_sync_status TYPE shared.keycloak_sync_status_d
    USING keycloak_sync_status::text;
DO $$ BEGIN
    ALTER TABLE control.mfa_config
        ADD CONSTRAINT mfa_config_sync_status_chk
        CHECK (keycloak_sync_status IN ('pending', 'synced', 'drift', 'error'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ————————————————————————————————————————————————————————————————————————————
-- NOTIFICATION TABLES
-- ————————————————————————————————————————————————————————————————————————————

-- —— notification_provider (platform-level — no tenant FK) ————————————————
DO $$ BEGIN ALTER TABLE control.notification_provider ADD CONSTRAINT nprov_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- —— notification_routing_rule ————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE control.notification_routing_rule ADD CONSTRAINT nrr_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.notification_routing_rule ADD CONSTRAINT nrr_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.notification_routing_rule ADD CONSTRAINT nrr_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- —— notification_template ———————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE control.notification_template ADD CONSTRAINT ntmpl_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.notification_template ADD CONSTRAINT ntmpl_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.notification_template ADD CONSTRAINT ntmpl_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── LIFECYCLE ENGINE FK constraints ────────────────────────────────────
DO $$ BEGIN ALTER TABLE control.lifecycle ADD CONSTRAINT lc_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── §2  control.lifecycle_state ──────────────────────────────────────────────
DO $$ BEGIN ALTER TABLE control.lifecycle_state ADD CONSTRAINT ls_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.lifecycle_state ADD CONSTRAINT ls_lifecycle_fk
    FOREIGN KEY (lifecycle_id) REFERENCES control.lifecycle (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.lifecycle_state ADD CONSTRAINT ls_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── §3  control.lifecycle_transition ─────────────────────────────────────────
DO $$ BEGIN ALTER TABLE control.lifecycle_transition ADD CONSTRAINT lt_lifecycle_fk
    FOREIGN KEY (lifecycle_id) REFERENCES control.lifecycle (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.lifecycle_transition ADD CONSTRAINT lt_from_state_fk
    FOREIGN KEY (from_state_id) REFERENCES control.lifecycle_state (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.lifecycle_transition ADD CONSTRAINT lt_to_state_fk
    FOREIGN KEY (to_state_id) REFERENCES control.lifecycle_state (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.lifecycle_transition ADD CONSTRAINT lt_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── §4  control.lifecycle_transition_gate ────────────────────────────────────
DO $$ BEGIN ALTER TABLE control.lifecycle_transition_gate ADD CONSTRAINT ltg_transition_fk
    FOREIGN KEY (transition_id) REFERENCES control.lifecycle_transition (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.lifecycle_transition_gate ADD CONSTRAINT ltg_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.lifecycle_transition_gate ADD CONSTRAINT ltg_workflow_definition_fk
    FOREIGN KEY (workflow_definition_id)
    REFERENCES control.workflow_definition (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── §5  control.lifecycle_transition_hook ────────────────────────────────────
DO $$ BEGIN ALTER TABLE control.lifecycle_transition_hook ADD CONSTRAINT lth_transition_fk
    FOREIGN KEY (transition_id) REFERENCES control.lifecycle_transition (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.lifecycle_transition_hook ADD CONSTRAINT lth_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- control.overlay exists — FK enforced.
DO $$ BEGIN
    ALTER TABLE control.lifecycle_transition_hook
        ADD CONSTRAINT lth_overlay_fk
        FOREIGN KEY (overlay_id) REFERENCES control.overlay (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── §6  control.lifecycle_hook_override ──────────────────────────────────────
DO $$ BEGIN ALTER TABLE control.lifecycle_hook_override ADD CONSTRAINT lho_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.lifecycle_hook_override ADD CONSTRAINT lho_hook_fk
    FOREIGN KEY (target_hook_id) REFERENCES control.lifecycle_transition_hook (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.lifecycle_hook_override ADD CONSTRAINT lho_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── §7  control.hook_action_registry ─────────────────────────────────────────
DO $$ BEGIN ALTER TABLE control.hook_action_registry ADD CONSTRAINT har_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.hook_action_registry ADD CONSTRAINT har_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── §8  control.lifecycle_timer_policy ───────────────────────────────────────
DO $$ BEGIN ALTER TABLE control.lifecycle_timer_policy ADD CONSTRAINT ltp_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.lifecycle_timer_policy ADD CONSTRAINT ltp_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── §9  event.lifecycle_timer_schedule ───────────────────────────────────────
DO $$ BEGIN ALTER TABLE event.lifecycle_timer_schedule ADD CONSTRAINT lts_tenant_fk


-- ── WORKFLOW ENGINE FK constraints ─────────────────────────────────────
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.workflow_definition ADD CONSTRAINT wdef_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── §2  control.workflow_template ────────────────────────────────────────────
DO $$ BEGIN ALTER TABLE control.workflow_template ADD CONSTRAINT wtpl_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.workflow_template ADD CONSTRAINT wtpl_sla_fk
    FOREIGN KEY (sla_policy_id) REFERENCES control.workflow_sla_policy (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.workflow_template ADD CONSTRAINT wtpl_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── §3  control.workflow_template_stage ──────────────────────────────────────
DO $$ BEGIN ALTER TABLE control.workflow_template_stage ADD CONSTRAINT wts_template_fk
    FOREIGN KEY (workflow_template_id) REFERENCES control.workflow_template (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.workflow_template_stage ADD CONSTRAINT wts_sla_fk
    FOREIGN KEY (sla_policy_id) REFERENCES control.workflow_sla_policy (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.workflow_template_stage ADD CONSTRAINT wts_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── §4  control.workflow_template_rule ───────────────────────────────────────
DO $$ BEGIN ALTER TABLE control.workflow_template_rule ADD CONSTRAINT wtr_template_fk
    FOREIGN KEY (workflow_template_id) REFERENCES control.workflow_template (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.workflow_template_rule ADD CONSTRAINT wtr_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── §5  control.workflow_sla_policy ──────────────────────────────────────────
DO $$ BEGIN ALTER TABLE control.workflow_sla_policy ADD CONSTRAINT wsla_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.workflow_sla_policy ADD CONSTRAINT wsla_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── §6  document.workflow_request ────────────────────────────────────────────
DO $$ BEGIN ALTER TABLE document.workflow_request ADD CONSTRAINT wreq_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.workflow_request ADD CONSTRAINT wreq_definition_fk
    FOREIGN KEY (workflow_definition_id)
    REFERENCES control.workflow_definition (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.workflow_request ADD CONSTRAINT wreq_template_fk
    FOREIGN KEY (workflow_template_id)
    REFERENCES control.workflow_template (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- entity_class_profile has no FK (platform constants, no tenant_id)

-- control.entity
DO $$ BEGIN ALTER TABLE control.entity ADD CONSTRAINT entity_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.entity ADD CONSTRAINT entity_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.entity ADD CONSTRAINT entity_class_profile_fk
    FOREIGN KEY (entity_class) REFERENCES control.entity_class_profile(class_key) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- control.entity_publish_state
DO $$ BEGIN ALTER TABLE control.entity_publish_state ADD CONSTRAINT eps_entity_fk
    FOREIGN KEY (entity_id) REFERENCES control.entity(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- control.entity_version
DO $$ BEGIN ALTER TABLE control.entity_version ADD CONSTRAINT ev_entity_fk
    FOREIGN KEY (entity_id) REFERENCES control.entity(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.entity_version ADD CONSTRAINT ev_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- control.entity_field
DO $$ BEGIN ALTER TABLE control.entity_field ADD CONSTRAINT ef_version_fk
    FOREIGN KEY (entity_version_id) REFERENCES control.entity_version(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.entity_field ADD CONSTRAINT ef_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.entity_field ADD CONSTRAINT ef_enum_domain_fk
    FOREIGN KEY (enum_domain_code) REFERENCES control.lookup_domain(code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- control.field_group_member
DO $$ BEGIN ALTER TABLE control.field_group_member ADD CONSTRAINT fgm_group_fk
    FOREIGN KEY (group_key) REFERENCES control.field_group(group_key) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.field_group_member ADD CONSTRAINT fgm_field_fk
    FOREIGN KEY (entity_field_id) REFERENCES control.entity_field(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- control.field_security_policy
DO $$ BEGIN ALTER TABLE control.field_security_policy ADD CONSTRAINT fsp_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.field_security_policy ADD CONSTRAINT fsp_entity_fk
    FOREIGN KEY (entity_id) REFERENCES control.entity(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- control.overlay
DO $$ BEGIN ALTER TABLE control.overlay ADD CONSTRAINT ov_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.overlay ADD CONSTRAINT ov_entity_fk
    FOREIGN KEY (base_entity_id) REFERENCES control.entity(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- control.overlay_change
DO $$ BEGIN ALTER TABLE control.overlay_change ADD CONSTRAINT oc_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.overlay_change ADD CONSTRAINT oc_overlay_fk
    FOREIGN KEY (overlay_id) REFERENCES control.overlay(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- control.entity_lifecycle
DO $$ BEGIN ALTER TABLE control.entity_lifecycle ADD CONSTRAINT el_lifecycle_fk
    FOREIGN KEY (lifecycle_id) REFERENCES control.lifecycle(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- control.entity_operation
DO $$ BEGIN ALTER TABLE control.entity_operation ADD CONSTRAINT eo_permission_fk
    FOREIGN KEY (permission_code) REFERENCES shared.permission(code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- control.entity_policy
DO $$ BEGIN ALTER TABLE control.entity_policy ADD CONSTRAINT ep_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.entity_policy ADD CONSTRAINT ep_entity_fk
    FOREIGN KEY (entity_id) REFERENCES control.entity(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- control.entity_relation
DO $$ BEGIN ALTER TABLE control.entity_relation ADD CONSTRAINT er_version_fk
    FOREIGN KEY (entity_version_id) REFERENCES control.entity_version(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── control.book_posting_rule ────────────────────────────────────────────────
ALTER TABLE control.book_posting_rule DROP CONSTRAINT IF EXISTS bpr_tenant_fk;
DO $$ BEGIN ALTER TABLE control.book_posting_rule ADD CONSTRAINT bpr_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.book_posting_rule ADD CONSTRAINT bpr_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.book_posting_rule ADD CONSTRAINT bpr_source_book_fk
    FOREIGN KEY (tenant_id, source_book_id) REFERENCES master.ledger_book (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.book_posting_rule ADD CONSTRAINT bpr_target_book_fk
    FOREIGN KEY (tenant_id, target_book_id) REFERENCES master.ledger_book (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.book_posting_rule ADD CONSTRAINT bpr_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- Engine 4.13: Unified Transaction Resolution Engine additions
-- ============================================================================

-- ── §TEC  control.transaction_event_catalog ──────────────────────────────────
-- R1: catalog table own-FK constraints (created_by / updated_by).

DO $$ BEGIN ALTER TABLE control.transaction_event_catalog ADD CONSTRAINT tec_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.transaction_event_catalog ADD CONSTRAINT tec_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── §TEC-REF  event_code FK references into the catalog ──────────────────────
-- R1 Step 4: both child columns become FKs after orphan-check confirmed 0 rows.
-- ON DELETE RESTRICT: prevents catalog code deletion while any flow template or
-- profile event row references it (safe deprecation path: set is_active=false first).

DO $$ BEGIN ALTER TABLE control.transaction_flow_template ADD CONSTRAINT tft_event_code_fk
    FOREIGN KEY (event_code) REFERENCES control.transaction_event_catalog (code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.acct_profile_event ADD CONSTRAINT ape_event_code_fk
    FOREIGN KEY (event_code) REFERENCES control.transaction_event_catalog (code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- TENANT FK — master.tenant confirmed present
-- ============================================================================

DO $$ BEGIN
    ALTER TABLE control.transaction_flow_template
        ADD CONSTRAINT tft_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE control.acct_profile_config DROP CONSTRAINT IF EXISTS apc_tenant_fk;
DO $$ BEGIN
    ALTER TABLE control.acct_profile_config
        ADD CONSTRAINT apc_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE control.acct_profile_commitment_config DROP CONSTRAINT IF EXISTS apcc_tenant_fk;
DO $$ BEGIN
    ALTER TABLE control.acct_profile_commitment_config
        ADD CONSTRAINT apcc_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE control.acct_profile_revenue_config DROP CONSTRAINT IF EXISTS aprc_tenant_fk;
DO $$ BEGIN
    ALTER TABLE control.acct_profile_revenue_config
        ADD CONSTRAINT aprc_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE control.acct_profile_settlement_config DROP CONSTRAINT IF EXISTS apsc_tenant_fk;
DO $$ BEGIN
    ALTER TABLE control.acct_profile_settlement_config
        ADD CONSTRAINT apsc_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE control.acct_profile_event DROP CONSTRAINT IF EXISTS ape_tenant_fk;
DO $$ BEGIN
    ALTER TABLE control.acct_profile_event
        ADD CONSTRAINT ape_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE control.acct_profile_entry_template DROP CONSTRAINT IF EXISTS apet_tenant_fk;
DO $$ BEGIN
    ALTER TABLE control.acct_profile_entry_template
        ADD CONSTRAINT apet_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE control.acct_profile_book_rule DROP CONSTRAINT IF EXISTS apbr_tenant_fk;
DO $$ BEGIN
    ALTER TABLE control.acct_profile_book_rule
        ADD CONSTRAINT apbr_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE control.acct_profile_dimension_rule DROP CONSTRAINT IF EXISTS apdr_tenant_fk;
DO $$ BEGIN
    ALTER TABLE control.acct_profile_dimension_rule
        ADD CONSTRAINT apdr_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE control.classification_to_intent_rule DROP CONSTRAINT IF EXISTS cir_tenant_fk;
DO $$ BEGIN
    ALTER TABLE control.classification_to_intent_rule
        ADD CONSTRAINT cir_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE control.intent_to_accounting_profile_rule DROP CONSTRAINT IF EXISTS iprr_tenant_fk;
DO $$ BEGIN
    ALTER TABLE control.intent_to_accounting_profile_rule
        ADD CONSTRAINT iprr_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE control.intent_profile_override DROP CONSTRAINT IF EXISTS ipo_tenant_fk;
DO $$ BEGIN
    ALTER TABLE control.intent_profile_override
        ADD CONSTRAINT ipo_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- INTRA-ENGINE FKs — all referenced tables defined in 04_tables/002_control.sql
-- ============================================================================

-- acct_profile_config self-reference (supersedes versioning chain)
DO $$ BEGIN
    ALTER TABLE control.acct_profile_config
        ADD CONSTRAINT apc_supersedes_fk
        FOREIGN KEY (supersedes_id) REFERENCES control.acct_profile_config (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- acct_profile_commitment_config → acct_profile_config (composite tenant-scoped)
DO $$ BEGIN
    ALTER TABLE control.acct_profile_commitment_config
        ADD CONSTRAINT apcc_config_fk
        FOREIGN KEY (profile_config_id, tenant_id)
        REFERENCES control.acct_profile_config (id, tenant_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- acct_profile_revenue_config → acct_profile_config (composite tenant-scoped)
DO $$ BEGIN
    ALTER TABLE control.acct_profile_revenue_config
        ADD CONSTRAINT aprc_config_fk
        FOREIGN KEY (profile_config_id, tenant_id)
        REFERENCES control.acct_profile_config (id, tenant_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- acct_profile_settlement_config → acct_profile_config (composite tenant-scoped)
DO $$ BEGIN
    ALTER TABLE control.acct_profile_settlement_config
        ADD CONSTRAINT apsc_config_fk
        FOREIGN KEY (profile_config_id, tenant_id)
        REFERENCES control.acct_profile_config (id, tenant_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- acct_profile_event → acct_profile_config (composite tenant-scoped)
DO $$ BEGIN
    ALTER TABLE control.acct_profile_event
        ADD CONSTRAINT ape_config_fk
        FOREIGN KEY (profile_config_id, tenant_id)
        REFERENCES control.acct_profile_config (id, tenant_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- acct_profile_entry_template → acct_profile_event (composite tenant-scoped)
DO $$ BEGIN
    ALTER TABLE control.acct_profile_entry_template
        ADD CONSTRAINT apet_event_fk
        FOREIGN KEY (profile_event_id, tenant_id)
        REFERENCES control.acct_profile_event (id, tenant_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- acct_profile_book_rule → acct_profile_config (composite tenant-scoped)
DO $$ BEGIN
    ALTER TABLE control.acct_profile_book_rule
        ADD CONSTRAINT apbr_config_fk
        FOREIGN KEY (profile_config_id, tenant_id)
        REFERENCES control.acct_profile_config (id, tenant_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- acct_profile_dimension_rule → acct_profile_config (composite tenant-scoped)
DO $$ BEGIN
    ALTER TABLE control.acct_profile_dimension_rule
        ADD CONSTRAINT apdr_config_fk
        FOREIGN KEY (profile_config_id, tenant_id)
        REFERENCES control.acct_profile_config (id, tenant_id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- intent_to_accounting_profile_rule → acct_profile_config (composite tenant-scoped)
DO $$ BEGIN
    ALTER TABLE control.intent_to_accounting_profile_rule
        ADD CONSTRAINT iprr_profile_fk
        FOREIGN KEY (resolved_profile_config_id, tenant_id)
        REFERENCES control.acct_profile_config (id, tenant_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- intent_profile_override → acct_profile_config (composite tenant-scoped)
DO $$ BEGIN
    ALTER TABLE control.intent_profile_override
        ADD CONSTRAINT ipo_profile_fk
        FOREIGN KEY (override_profile_config_id, tenant_id)
        REFERENCES control.acct_profile_config (id, tenant_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- COMPANY CODE FK — master.company_code confirmed present
-- ============================================================================

DO $$ BEGIN
    ALTER TABLE control.intent_to_accounting_profile_rule
        ADD CONSTRAINT iprr_cc_fk
        FOREIGN KEY (company_code_id) REFERENCES master.company_code (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE control.intent_profile_override
        ADD CONSTRAINT ipo_cc_fk
        FOREIGN KEY (company_code_id) REFERENCES master.company_code (id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- EXTERNAL FKs — tables not yet confirmed in 04_tables/
-- Pattern: catch both duplicate_object AND undefined_table (42P01)
-- These constraints activate automatically once upstream tables are created.
-- ============================================================================

-- acct_profile_config → master.accounting_profile
DO $$ BEGIN
    ALTER TABLE control.acct_profile_config
        ADD CONSTRAINT apc_profile_fk
        FOREIGN KEY (accounting_profile_id) REFERENCES master.accounting_profile (id) ON DELETE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_table  THEN NULL;
END $$;

-- acct_profile_revenue_config → master.accounting_profile (paired COGS profile)
DO $$ BEGIN
    ALTER TABLE control.acct_profile_revenue_config
        ADD CONSTRAINT aprc_paired_fk
        FOREIGN KEY (paired_profile_id) REFERENCES master.accounting_profile (id);
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_table  THEN NULL;
END $$;

-- acct_profile_dimension_rule → master.dimension_type
DO $$ BEGIN
    ALTER TABLE control.acct_profile_dimension_rule
        ADD CONSTRAINT apdr_dimtype_fk
        FOREIGN KEY (dimension_type_id) REFERENCES master.dimension_type (id);
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_table  THEN NULL;
END $$;

-- acct_profile_dimension_rule → master.dimension_value (fixed_value_id)
DO $$ BEGIN
    ALTER TABLE control.acct_profile_dimension_rule
        ADD CONSTRAINT apdr_fixval_fk
        FOREIGN KEY (fixed_value_id) REFERENCES master.dimension_value (id);
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_table  THEN NULL;
END $$;

-- acct_profile_dimension_rule → master.dimension_value (fallback_value_id)
DO $$ BEGIN
    ALTER TABLE control.acct_profile_dimension_rule
        ADD CONSTRAINT apdr_fbval_fk
        FOREIGN KEY (fallback_value_id) REFERENCES master.dimension_value (id);
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_table  THEN NULL;
END $$;

-- classification_to_intent_rule → master.business_intent
DO $$ BEGIN
    ALTER TABLE control.classification_to_intent_rule
        ADD CONSTRAINT cir_intent_fk
        FOREIGN KEY (resolved_intent_id) REFERENCES master.business_intent (id);
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_table  THEN NULL;
END $$;

-- intent_to_accounting_profile_rule → master.business_intent
DO $$ BEGIN
    ALTER TABLE control.intent_to_accounting_profile_rule
        ADD CONSTRAINT iprr_intent_fk
        FOREIGN KEY (intent_id) REFERENCES master.business_intent (id);
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_table  THEN NULL;
END $$;

-- intent_profile_override → master.business_intent
DO $$ BEGIN
    ALTER TABLE control.intent_profile_override
        ADD CONSTRAINT ipo_intent_fk
        FOREIGN KEY (intent_id) REFERENCES master.business_intent (id);
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_table  THEN NULL;
END $$;


-- ── §DP1  control.dimension_policy ───────────────────────────────────────────
DO $$ BEGIN ALTER TABLE control.dimension_policy ADD CONSTRAINT dp_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Composite FK — policy targets a dimension type within the same tenant
DO $$ BEGIN ALTER TABLE control.dimension_policy ADD CONSTRAINT dp_type_fk
    FOREIGN KEY (tenant_id, dimension_type_id)
    REFERENCES master.dimension_type (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.dimension_policy ADD CONSTRAINT dp_company_fk
    FOREIGN KEY (company_code_id) REFERENCES master.company_code (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.dimension_policy ADD CONSTRAINT dp_fixed_value_fk
    FOREIGN KEY (fixed_value_id) REFERENCES master.dimension_value (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Self-referencing dependency — type this policy depends on
DO $$ BEGIN ALTER TABLE control.dimension_policy ADD CONSTRAINT dp_depends_type_fk
    FOREIGN KEY (depends_on_type_id) REFERENCES master.dimension_type (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── §DP2  control.dimension_policy_allowed_value ──────────────────────────────
DO $$ BEGIN ALTER TABLE control.dimension_policy_allowed_value ADD CONSTRAINT dpav_policy_fk
    FOREIGN KEY (policy_id) REFERENCES control.dimension_policy (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.dimension_policy_allowed_value ADD CONSTRAINT dpav_value_fk
    FOREIGN KEY (dimension_value_id) REFERENCES master.dimension_value (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── §DS1  control.document_sequence_config ────────────────────────────────────
DO $$ BEGIN ALTER TABLE control.document_sequence_config ADD CONSTRAINT dsc_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.document_sequence_config ADD CONSTRAINT dsc_company_fk
    FOREIGN KEY (company_code_id) REFERENCES master.company_code (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── §DS2  control.document_sequence_counter ───────────────────────────────────
-- Composite FK — counter belongs to a config within the same tenant
DO $$ BEGIN ALTER TABLE control.document_sequence_counter ADD CONSTRAINT dscc_config_fk
    FOREIGN KEY (tenant_id, config_id)
    REFERENCES control.document_sequence_config (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── §CLSCFG  control.classification_config ───────────────────────────────────
DO $$ BEGIN ALTER TABLE control.classification_config ADD CONSTRAINT clscfg_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── §CCRR  control.commodity_to_spend_category_rule ───────────────────────────
DO $$ BEGIN ALTER TABLE control.commodity_to_spend_category_rule ADD CONSTRAINT ccrr_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Composite FK — routing rule targets a spend_category within the same tenant
DO $$ BEGIN ALTER TABLE control.commodity_to_spend_category_rule ADD CONSTRAINT ccrr_category_fk
    FOREIGN KEY (tenant_id, spend_category_id)
    REFERENCES master.spend_category (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── control.rounding_rule ────────────────────────────────────────────────────
DO $$ BEGIN ALTER TABLE control.rounding_rule ADD CONSTRAINT rr_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.rounding_rule ADD CONSTRAINT rr_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── control.tax_rate_schedule ────────────────────────────────────────────────
DO $$ BEGIN ALTER TABLE control.tax_rate_schedule ADD CONSTRAINT trs_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.tax_rate_schedule ADD CONSTRAINT trs_jurisdiction_fk
    FOREIGN KEY (tenant_id, jurisdiction_id)
    REFERENCES master.tax_jurisdiction (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.tax_rate_schedule ADD CONSTRAINT trs_type_fk
    FOREIGN KEY (tenant_id, tax_type_id)
    REFERENCES master.tax_type (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.tax_rate_schedule ADD CONSTRAINT trs_rounding_fk
    FOREIGN KEY (tenant_id, rounding_rule_id)
    REFERENCES control.rounding_rule (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.tax_rate_schedule ADD CONSTRAINT trs_company_fk
    FOREIGN KEY (tenant_id, scope_company_code_id)
    REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.tax_rate_schedule ADD CONSTRAINT trs_spend_cat_fk
    FOREIGN KEY (tenant_id, scope_spend_category_id)
    REFERENCES master.spend_category (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.tax_rate_schedule ADD CONSTRAINT trs_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── control.tax_group ────────────────────────────────────────────────────────
DO $$ BEGIN ALTER TABLE control.tax_group ADD CONSTRAINT tg_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.tax_group ADD CONSTRAINT tg_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── control.tax_group_component ──────────────────────────────────────────────
-- tgc_schedule_fk uses tenant-composite (tenant_id, tax_rate_schedule_id) for isolation.
DO $$ BEGIN ALTER TABLE control.tax_group_component ADD CONSTRAINT tgc_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.tax_group_component ADD CONSTRAINT tgc_group_fk
    FOREIGN KEY (tenant_id, tax_group_id)
    REFERENCES control.tax_group (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.tax_group_component ADD CONSTRAINT tgc_schedule_fk
    FOREIGN KEY (tenant_id, tax_rate_schedule_id)
    REFERENCES control.tax_rate_schedule (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.tax_group_component ADD CONSTRAINT tgc_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── control.acct_profile_config — default_tax_group_id FK ────────────────────
DO $$ BEGIN ALTER TABLE control.acct_profile_config ADD CONSTRAINT apc_default_tax_group_fk
    FOREIGN KEY (tenant_id, default_tax_group_id)
    REFERENCES control.tax_group (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- BUDGET · COMMITMENT · PLANNING ENGINE — Control FK constraints
-- ══════════════════════════════════════════════════════════════════════════════

-- ── control.forecast_line ─────────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE control.forecast_line
        ADD CONSTRAINT fk_fl_scenario
            FOREIGN KEY (tenant_id, scenario_id)
                REFERENCES document.forecast_scenario (tenant_id, id)
            ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.forecast_line
        ADD CONSTRAINT fk_fl_allocation
            FOREIGN KEY (tenant_id, budget_allocation_id)
                REFERENCES master.budget_allocation (tenant_id, id)
            ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.forecast_line
        ADD CONSTRAINT fk_fl_company_code
            FOREIGN KEY (tenant_id, company_code_id)
                REFERENCES master.company_code (tenant_id, id)
            ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── control.planning_driver ───────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE control.planning_driver
        ADD CONSTRAINT fk_pd_planning_model
            FOREIGN KEY (tenant_id, planning_model_id)
                REFERENCES master.planning_model (tenant_id, id)
            ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── control.planning_driver_formula ──────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE control.planning_driver_formula
        ADD CONSTRAINT fk_pdf_driver
            FOREIGN KEY (driver_id) REFERENCES control.planning_driver (id)
            ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── control.planning_driver_assumption ─────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE control.planning_driver_assumption
        ADD CONSTRAINT fk_da_driver
            FOREIGN KEY (driver_id) REFERENCES control.planning_driver (id)
            ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.planning_driver_assumption
        ADD CONSTRAINT fk_da_scenario
            FOREIGN KEY (tenant_id, scenario_id)
                REFERENCES document.forecast_scenario (tenant_id, id)
            ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.planning_driver_assumption
        ADD CONSTRAINT fk_da_company_code
            FOREIGN KEY (tenant_id, company_code_id)
                REFERENCES master.company_code (tenant_id, id)
            ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── control.planning_driver_version ──────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE control.planning_driver_version
        ADD CONSTRAINT fk_pdv_driver
            FOREIGN KEY (driver_id) REFERENCES control.planning_driver (id)
            ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── §BK5 bank_format_rule ───────────────────────────────────────────────────

DO $$ BEGIN
    ALTER TABLE control.bank_format_rule ADD CONSTRAINT bfr_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.bank_format_rule ADD CONSTRAINT bfr_country_fk
        FOREIGN KEY (country_code) REFERENCES shared.country (code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.bank_format_rule ADD CONSTRAINT bfr_currency_fk
        FOREIGN KEY (currency_code) REFERENCES shared.currency (code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── §PM2 payment_method_company_policy ──────────────────────────────────────

DO $$ BEGIN
    ALTER TABLE control.payment_method_company_policy ADD CONSTRAINT pmcp_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.payment_method_company_policy ADD CONSTRAINT pmcp_company_code_fk
        FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.payment_method_company_policy ADD CONSTRAINT pmcp_payment_method_fk
        FOREIGN KEY (tenant_id, payment_method_id)
        REFERENCES master.payment_method (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.payment_method_company_policy ADD CONSTRAINT pmcp_bank_account_link_fk
        FOREIGN KEY (tenant_id, bank_account_link_id)
        REFERENCES master.bank_account_link (tenant_id, id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.payment_method_company_policy ADD CONSTRAINT pmcp_currency_fk
        FOREIGN KEY (currency_code) REFERENCES shared.currency (code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── §PM3 bank_interface_profile ─────────────────────────────────────────────

DO $$ BEGIN
    ALTER TABLE control.bank_interface_profile ADD CONSTRAINT bip_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── §PM4 payment_method_interface_binding ───────────────────────────────────

DO $$ BEGIN
    ALTER TABLE control.payment_method_interface_binding ADD CONSTRAINT pmib_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.payment_method_interface_binding ADD CONSTRAINT pmib_company_code_fk
        FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.payment_method_interface_binding ADD CONSTRAINT pmib_payment_method_fk
        FOREIGN KEY (tenant_id, payment_method_id)
        REFERENCES master.payment_method (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.payment_method_interface_binding ADD CONSTRAINT pmib_bank_account_link_fk
        FOREIGN KEY (tenant_id, bank_account_link_id)
        REFERENCES master.bank_account_link (tenant_id, id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.payment_method_interface_binding ADD CONSTRAINT pmib_interface_profile_fk
        FOREIGN KEY (tenant_id, bank_interface_profile_id)
        REFERENCES control.bank_interface_profile (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.payment_method_interface_binding ADD CONSTRAINT pmib_currency_fk
        FOREIGN KEY (currency_code) REFERENCES shared.currency (code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.payment_method_interface_binding ADD CONSTRAINT pmib_country_fk
        FOREIGN KEY (counterparty_country_code)
        REFERENCES shared.country (code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── §PM5 payment_settlement_rule ────────────────────────────────────────────

DO $$ BEGIN
    ALTER TABLE control.payment_settlement_rule ADD CONSTRAINT psr_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.payment_settlement_rule ADD CONSTRAINT psr_company_code_fk
        FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.payment_settlement_rule ADD CONSTRAINT psr_payment_method_fk
        FOREIGN KEY (tenant_id, payment_method_id)
        REFERENCES master.payment_method (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── §POL  policy_definition ──────────────────────────────────────────────────

DO $$ BEGIN ALTER TABLE control.policy_definition ADD CONSTRAINT pdef_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.policy_definition ADD CONSTRAINT pdef_module_fk
    FOREIGN KEY (module_id) REFERENCES shared.module (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.policy_definition ADD CONSTRAINT pdef_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── §POL  policy_rule ────────────────────────────────────────────────────────

DO $$ BEGIN ALTER TABLE control.policy_rule ADD CONSTRAINT prule_policy_fk
    FOREIGN KEY (policy_id) REFERENCES control.policy_definition (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.policy_rule ADD CONSTRAINT prule_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── §PROV-1  control.blueprint_registry ──────────────────────────────────────
-- R6: FKs for blueprint_registry (DDL migrated from seed file into 01_tables.sql)

DO $$ BEGIN ALTER TABLE control.blueprint_registry ADD CONSTRAINT br_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.blueprint_registry ADD CONSTRAINT br_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── §PROV-2  control.tenant_blueprint_application ────────────────────────────
-- R6: FKs for tenant_blueprint_application (DDL migrated from seed file)
-- blueprint_code FK was previously an inline constraint on the seed-file table.

DO $$ BEGIN ALTER TABLE control.tenant_blueprint_application ADD CONSTRAINT tba_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.tenant_blueprint_application ADD CONSTRAINT tba_blueprint_fk
    FOREIGN KEY (blueprint_code) REFERENCES control.blueprint_registry (code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.tenant_blueprint_application ADD CONSTRAINT tba_applied_by_fk
    FOREIGN KEY (applied_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.tenant_blueprint_application ADD CONSTRAINT tba_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.tenant_blueprint_application ADD CONSTRAINT tba_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
