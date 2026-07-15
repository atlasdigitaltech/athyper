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

-- Type column to shared.idp_sync_status_d (canonical name; keycloak_sync_status_d is an alias).
-- Drops the inline CHECK, re-types the column, then re-adds the tighter 4-value
-- CHECK (mfa credentials never use 'disabled' — that state belongs to auth bindings).
ALTER TABLE control.mfa_config DROP CONSTRAINT IF EXISTS mfa_config_sync_status_chk;
ALTER TABLE control.mfa_config
    ALTER COLUMN keycloak_sync_status TYPE shared.idp_sync_status_d
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
DO $$ BEGIN
    ALTER TABLE control.entity_class_profile ADD CONSTRAINT ecp_field_flag_rules_schema_chk
        CHECK (control.is_valid_entity_field_flag_rules(field_flag_rules));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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
-- control.entity_version_contract
DO $$ BEGIN ALTER TABLE control.entity_version_contract ADD CONSTRAINT evc_version_fk
    FOREIGN KEY (entity_version_id) REFERENCES control.entity_version(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.entity_version_contract ADD CONSTRAINT evc_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.entity_version_contract ADD CONSTRAINT evc_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.entity_version_contract ADD CONSTRAINT evc_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal(id) ON DELETE SET NULL;
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

-- control.entity_surface
DO $$ BEGIN ALTER TABLE control.entity_surface ADD CONSTRAINT es_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.entity_surface ADD CONSTRAINT es_entity_fk
    FOREIGN KEY (entity_id) REFERENCES control.entity(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.entity_surface ADD CONSTRAINT es_parent_surface_fk
    FOREIGN KEY (parent_surface_id) REFERENCES control.entity_surface(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.entity_surface ADD CONSTRAINT es_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- control.entity_field_surface
DO $$ BEGIN ALTER TABLE control.entity_field_surface ADD CONSTRAINT efsurf_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.entity_field_surface ADD CONSTRAINT efsurf_surface_fk
    FOREIGN KEY (entity_surface_id) REFERENCES control.entity_surface(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.entity_field_surface ADD CONSTRAINT efsurf_field_fk
    FOREIGN KEY (entity_field_id) REFERENCES control.entity_field(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.entity_field_surface ADD CONSTRAINT efsurf_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal(id) ON DELETE RESTRICT;
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
DO $$ BEGIN ALTER TABLE control.entity_operation ADD CONSTRAINT eo_execution_target_chk
  CHECK (execution_target IS NULL OR execution_target ~ '^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
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

ALTER TABLE control.asset_class_book_policy_template DROP CONSTRAINT IF EXISTS acbpt_tenant_fk;
DO $$ BEGIN
    ALTER TABLE control.asset_class_book_policy_template
        ADD CONSTRAINT acbpt_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE control.asset_class_book_policy_template DROP CONSTRAINT IF EXISTS acbpt_created_by_fk;
DO $$ BEGIN
    ALTER TABLE control.asset_class_book_policy_template
        ADD CONSTRAINT acbpt_created_by_fk
        FOREIGN KEY (created_by) REFERENCES master.principal (id);
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

ALTER TABLE control.commodity_classification_to_intent_rule DROP CONSTRAINT IF EXISTS cir_tenant_fk;
DO $$ BEGIN
    ALTER TABLE control.commodity_classification_to_intent_rule
        ADD CONSTRAINT cir_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE control.intent_to_accounting_profile_rule DROP CONSTRAINT IF EXISTS iprr_tenant_fk;
-- commodity_category policy external references
DO $$ BEGIN ALTER TABLE control.commodity_category_buy_policy ADD CONSTRAINT ccbpol_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.commodity_category_buy_policy ADD CONSTRAINT ccbpol_category_fk
    FOREIGN KEY (tenant_id, commodity_category_id)
    REFERENCES master.commodity_category (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.commodity_category_buy_policy ADD CONSTRAINT ccbpol_intent_fk
    FOREIGN KEY (tenant_id, business_intent_id)
    REFERENCES master.business_intent (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.commodity_category_buy_policy ADD CONSTRAINT ccbpol_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.commodity_category_buy_policy ADD CONSTRAINT ccbpol_gl_fk
    FOREIGN KEY (tenant_id, default_gl_account_id) REFERENCES master.gl_account (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.commodity_category_buy_policy ADD CONSTRAINT ccbpol_tax_group_fk
    FOREIGN KEY (tenant_id, default_tax_group_id) REFERENCES control.tax_group (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.commodity_category_buy_policy ADD CONSTRAINT ccbpol_asset_class_fk
    FOREIGN KEY (tenant_id, default_asset_class_id) REFERENCES master.asset_class (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.commodity_category_buy_policy ADD CONSTRAINT ccbpol_budget_profile_fk
    FOREIGN KEY (tenant_id, default_budget_profile_id) REFERENCES master.budget_profile (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.commodity_category_buy_policy ADD CONSTRAINT ccbpol_capex_currency_fk
    FOREIGN KEY (capex_screening_currency) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.commodity_category_buy_policy ADD CONSTRAINT ccbpol_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.commodity_category_sell_policy ADD CONSTRAINT ccselpol_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.commodity_category_sell_policy ADD CONSTRAINT ccselpol_category_fk
    FOREIGN KEY (tenant_id, commodity_category_id)
    REFERENCES master.commodity_category (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.commodity_category_sell_policy ADD CONSTRAINT ccselpol_intent_fk
    FOREIGN KEY (tenant_id, business_intent_id)
    REFERENCES master.business_intent (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.commodity_category_sell_policy ADD CONSTRAINT ccselpol_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.commodity_category_sell_policy ADD CONSTRAINT ccselpol_revenue_gl_fk
    FOREIGN KEY (tenant_id, default_revenue_gl_account_id) REFERENCES master.gl_account (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.commodity_category_sell_policy ADD CONSTRAINT ccselpol_defrev_gl_fk
    FOREIGN KEY (tenant_id, default_deferred_revenue_gl_account_id) REFERENCES master.gl_account (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.commodity_category_sell_policy ADD CONSTRAINT ccselpol_unbilled_gl_fk
    FOREIGN KEY (tenant_id, default_unbilled_ar_gl_account_id) REFERENCES master.gl_account (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.commodity_category_sell_policy ADD CONSTRAINT ccselpol_tax_group_fk
    FOREIGN KEY (tenant_id, default_tax_group_id) REFERENCES control.tax_group (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.commodity_category_sell_policy ADD CONSTRAINT ccselpol_accounting_profile_fk
    FOREIGN KEY (tenant_id, default_accounting_profile_id) REFERENCES master.accounting_profile (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.commodity_category_sell_policy ADD CONSTRAINT ccselpol_cogs_profile_fk
    FOREIGN KEY (tenant_id, paired_cogs_profile_id) REFERENCES master.accounting_profile (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.commodity_category_sell_policy ADD CONSTRAINT ccselpol_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.commodity_category_inventory_policy ADD CONSTRAINT ccipol_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.commodity_category_inventory_policy ADD CONSTRAINT ccipol_category_fk
    FOREIGN KEY (tenant_id, commodity_category_id)
    REFERENCES master.commodity_category (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.commodity_category_inventory_policy ADD CONSTRAINT ccipol_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.commodity_category_inventory_policy ADD CONSTRAINT ccipol_inventory_gl_fk
    FOREIGN KEY (tenant_id, default_inventory_gl_account_id) REFERENCES master.gl_account (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.commodity_category_inventory_policy ADD CONSTRAINT ccipol_wip_gl_fk
    FOREIGN KEY (tenant_id, default_wip_gl_account_id) REFERENCES master.gl_account (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.commodity_category_inventory_policy ADD CONSTRAINT ccipol_cogs_gl_fk
    FOREIGN KEY (tenant_id, default_cogs_gl_account_id) REFERENCES master.gl_account (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.commodity_category_inventory_policy ADD CONSTRAINT ccipol_ppv_gl_fk
    FOREIGN KEY (tenant_id, default_price_variance_gl_account_id) REFERENCES master.gl_account (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.commodity_category_inventory_policy ADD CONSTRAINT ccipol_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.supplier_posting_override ADD CONSTRAINT spo_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN
    DELETE FROM control.supplier_posting_override spo
     WHERE NOT EXISTS (
        SELECT 1
          FROM master.company_code_supplier_profile sp
         WHERE sp.tenant_id = spo.tenant_id
           AND sp.id = spo.supplier_profile_id
     );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
DO $$ BEGIN ALTER TABLE control.supplier_posting_override ADD CONSTRAINT spo_profile_fk
    FOREIGN KEY (tenant_id, supplier_profile_id)
    REFERENCES master.company_code_supplier_profile (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.supplier_posting_override ADD CONSTRAINT spo_gl_account_fk
    FOREIGN KEY (tenant_id, gl_account_id) REFERENCES master.gl_account (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.supplier_posting_override ADD CONSTRAINT spo_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

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

-- commodity_classification_to_intent_rule → master.business_intent
DO $$ BEGIN
    ALTER TABLE control.commodity_classification_to_intent_rule
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


-- Entity numbering: canonical config and hot counter state
DO $$ BEGIN ALTER TABLE control.entity_numbering_config ADD CONSTRAINT encfg_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.entity_numbering_config ADD CONSTRAINT encfg_entity_fk
    FOREIGN KEY (entity_id) REFERENCES control.entity (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.entity_numbering_config ADD CONSTRAINT encfg_company_fk
    FOREIGN KEY (company_code_id) REFERENCES master.company_code (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.entity_numbering_config ADD CONSTRAINT encfg_segments_schema_chk
    CHECK (control.is_valid_entity_number_segments(segments));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.entity_numbering_counter ADD CONSTRAINT enctr_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.entity_numbering_counter ADD CONSTRAINT enctr_config_fk
    FOREIGN KEY (config_id) REFERENCES control.entity_numbering_config (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.entity_numbering_counter ADD CONSTRAINT enctr_company_fk
    FOREIGN KEY (company_code_id) REFERENCES master.company_code (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── §CLSCFG  control.commodity_classification_config ───────────────────────────────────
DO $$ BEGIN ALTER TABLE control.commodity_classification_config ADD CONSTRAINT clscfg_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── §CCRR  control.commodity_code_to_category_rule ───────────────────────────
DO $$ BEGIN ALTER TABLE control.commodity_code_to_category_rule ADD CONSTRAINT ccrr_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Composite FK — routing rule targets a commodity_category within the same tenant
DO $$ BEGIN ALTER TABLE control.commodity_code_to_category_rule ADD CONSTRAINT ccrr_category_fk
    FOREIGN KEY (tenant_id, commodity_category_id)
    REFERENCES master.commodity_category (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── control.rounding_rule ────────────────────────────────────────────────────
DO $$ BEGIN ALTER TABLE control.rounding_rule ADD CONSTRAINT rr_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.rounding_rule ADD CONSTRAINT rr_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── control.tax_rate_schedule ────────────────────────────────────────────────
-- Phase 2: dropped scope_company_code_id / scope_commodity_category_id /
-- rounding_rule_id and their FKs. Resolver scopes now live in
-- control.tax_resolution_rule. Drop legacy FKs explicitly so a re-run of a
-- clean schema doesn't try to recreate them.
DO $$ BEGIN ALTER TABLE control.tax_rate_schedule DROP CONSTRAINT IF EXISTS trs_rounding_fk; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.tax_rate_schedule DROP CONSTRAINT IF EXISTS trs_company_fk; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.tax_rate_schedule DROP CONSTRAINT IF EXISTS trs_commodity_category_fk; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.tax_rate_schedule DROP CONSTRAINT IF EXISTS trs_spend_cat_fk; EXCEPTION WHEN undefined_table THEN NULL; END $$;

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
DO $$ BEGIN ALTER TABLE control.tax_rate_schedule ADD CONSTRAINT trs_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── control.tax_group ────────────────────────────────────────────────────────
DO $$ BEGIN ALTER TABLE control.tax_group ADD CONSTRAINT tg_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.tax_group ADD CONSTRAINT tg_jurisdiction_fk
    FOREIGN KEY (tenant_id, jurisdiction_id)
    REFERENCES master.tax_jurisdiction (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.tax_group ADD CONSTRAINT tg_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── control.tax_resolution_rule ──────────────────────────────────────────────
-- Phase 3c: drop the prior 2-jurisdiction FKs and add 4-jurisdiction FKs.
-- The old company/counterparty FKs are dropped explicitly so a fresh schema
-- doesn't try to recreate them.
DO $$ BEGIN ALTER TABLE control.tax_resolution_rule DROP CONSTRAINT IF EXISTS trr_company_jur_fk; EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.tax_resolution_rule DROP CONSTRAINT IF EXISTS trr_counterparty_jur_fk; EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.tax_resolution_rule ADD CONSTRAINT trr_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.tax_resolution_rule ADD CONSTRAINT trr_tax_group_fk
    FOREIGN KEY (tenant_id, resolved_tax_group_id)
    REFERENCES control.tax_group (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- 4-jurisdiction FKs
DO $$ BEGIN ALTER TABLE control.tax_resolution_rule ADD CONSTRAINT trr_billto_jur_fk
    FOREIGN KEY (tenant_id, scope_billto_jurisdiction_id)
    REFERENCES master.tax_jurisdiction (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.tax_resolution_rule ADD CONSTRAINT trr_shipto_jur_fk
    FOREIGN KEY (tenant_id, scope_shipto_jurisdiction_id)
    REFERENCES master.tax_jurisdiction (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.tax_resolution_rule ADD CONSTRAINT trr_billfrom_jur_fk
    FOREIGN KEY (tenant_id, scope_billfrom_jurisdiction_id)
    REFERENCES master.tax_jurisdiction (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.tax_resolution_rule ADD CONSTRAINT trr_shipfrom_jur_fk
    FOREIGN KEY (tenant_id, scope_shipfrom_jurisdiction_id)
    REFERENCES master.tax_jurisdiction (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.tax_resolution_rule ADD CONSTRAINT trr_commodity_category_fk
    FOREIGN KEY (tenant_id, scope_commodity_category_id)
    REFERENCES master.commodity_category (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.tax_resolution_rule ADD CONSTRAINT trr_created_by_fk
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

DO $$ BEGIN
    ALTER TABLE control.forecast_line
        ADD CONSTRAINT fk_fl_commodity_category
            FOREIGN KEY (tenant_id, commodity_category_id)
                REFERENCES master.commodity_category (tenant_id, id)
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


-- ── §PROV-2  control.blueprint_tenant_application ────────────────────────────
-- R6: FKs for blueprint_tenant_application (DDL migrated from seed file)
-- blueprint_code FK was previously an inline constraint on the seed-file table.

DO $$ BEGIN ALTER TABLE control.blueprint_tenant_application ADD CONSTRAINT tba_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.blueprint_tenant_application ADD CONSTRAINT tba_blueprint_fk
    FOREIGN KEY (blueprint_code) REFERENCES control.blueprint_registry (code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.blueprint_tenant_application ADD CONSTRAINT tba_applied_by_fk
    FOREIGN KEY (applied_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.blueprint_tenant_application ADD CONSTRAINT tba_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.blueprint_tenant_application ADD CONSTRAINT tba_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
-- R5  control.outbox_routing_rule
-- ============================================================================

DO $$ BEGIN ALTER TABLE control.outbox_routing_rule ADD CONSTRAINT orr_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.outbox_routing_rule ADD CONSTRAINT orr_handler_id_fk
    FOREIGN KEY (handler_id) REFERENCES control.hook_action_registry (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.outbox_routing_rule ADD CONSTRAINT orr_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.outbox_routing_rule ADD CONSTRAINT orr_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
-- R11  control.budget_check_config + policy_rule.budget_check_config_id
-- ============================================================================

-- Live-DB migration: add budget_check_config_id column if not present
DO $$ BEGIN
    ALTER TABLE control.policy_rule ADD COLUMN budget_check_config_id uuid;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Extend action enum to include budget_check
ALTER TABLE control.policy_rule DROP CONSTRAINT IF EXISTS prule_action_chk;
ALTER TABLE control.policy_rule ADD CONSTRAINT prule_action_chk
    CHECK (action IN ('allow', 'deny', 'warn', 'require_workflow', 'escalate', 'budget_check'));

DO $$ BEGIN ALTER TABLE control.budget_check_config ADD CONSTRAINT bcc_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.budget_check_config ADD CONSTRAINT bcc_book_fk
    FOREIGN KEY (book_id) REFERENCES master.ledger_book (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.budget_check_config ADD CONSTRAINT bcc_override_policy_fk
    FOREIGN KEY (override_policy_definition_id)
    REFERENCES control.policy_definition (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.budget_check_config ADD CONSTRAINT bcc_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.budget_check_config ADD CONSTRAINT bcc_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.policy_rule ADD CONSTRAINT prule_budget_check_fk
    FOREIGN KEY (budget_check_config_id)
    REFERENCES control.budget_check_config (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
-- R7-A  control.wht_threshold_config
-- ============================================================================

DO $$ BEGIN ALTER TABLE control.wht_threshold_config ADD CONSTRAINT wtc_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.wht_threshold_config ADD CONSTRAINT wtc_jurisdiction_fk
    FOREIGN KEY (tenant_id, jurisdiction_id)
    REFERENCES master.tax_jurisdiction (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.wht_threshold_config ADD CONSTRAINT wtc_tax_type_fk
    FOREIGN KEY (tenant_id, tax_type_id)
    REFERENCES master.tax_type (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.wht_threshold_config ADD CONSTRAINT wtc_currency_fk
    FOREIGN KEY (threshold_currency) REFERENCES shared.currency (code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.wht_threshold_config ADD CONSTRAINT wtc_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.wht_threshold_config ADD CONSTRAINT wtc_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
-- R9  control.notification_routing_rule — workflow_phase column migration
-- ============================================================================

DO $nrr1$ BEGIN
    ALTER TABLE control.notification_routing_rule ADD COLUMN workflow_phase text;
EXCEPTION WHEN duplicate_column THEN NULL; END $nrr1$;

-- Idempotent: drop then re-add (constraint may not exist on first run)
ALTER TABLE control.notification_routing_rule
    DROP CONSTRAINT IF EXISTS nrr_workflow_phase_chk;
ALTER TABLE control.notification_routing_rule
    ADD CONSTRAINT nrr_workflow_phase_chk
    CHECK (workflow_phase IS NULL OR workflow_phase IN ('in_workflow', 'post_workflow'));


-- ============================================================================
-- R10  control.entity_policy — field_scope_eval_order + extended_scope migration
-- ============================================================================

DO $ep1$ BEGIN
    ALTER TABLE control.entity_policy
        ADD COLUMN field_scope_eval_order text NOT NULL DEFAULT 'row_first';
EXCEPTION WHEN duplicate_column THEN NULL; END $ep1$;

DO $ep2$ BEGIN
    ALTER TABLE control.entity_policy
        ADD COLUMN extended_scope jsonb NOT NULL DEFAULT '{}';
EXCEPTION WHEN duplicate_column THEN NULL; END $ep2$;

ALTER TABLE control.entity_policy DROP CONSTRAINT IF EXISTS ep_field_scope_eval_chk;
ALTER TABLE control.entity_policy ADD CONSTRAINT ep_field_scope_eval_chk
    CHECK (field_scope_eval_order IN ('row_first', 'field_first', 'parallel'));

ALTER TABLE control.entity_policy DROP CONSTRAINT IF EXISTS ep_extended_scope_chk;
ALTER TABLE control.entity_policy ADD CONSTRAINT ep_extended_scope_chk
    CHECK (jsonb_typeof(extended_scope) = 'object');


-- ============================================================================
-- R8  control.ai_action_policy
-- ============================================================================

DO $aap1$ BEGIN ALTER TABLE control.ai_action_policy ADD CONSTRAINT aap_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $aap1$;

DO $aap2$ BEGIN ALTER TABLE control.ai_action_policy ADD CONSTRAINT aap_override_policy_fk
    FOREIGN KEY (override_policy_definition_id)
    REFERENCES control.policy_definition (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $aap2$;

DO $aap3$ BEGIN ALTER TABLE control.ai_action_policy ADD CONSTRAINT aap_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $aap3$;

DO $aap4$ BEGIN ALTER TABLE control.ai_action_policy ADD CONSTRAINT aap_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $aap4$;


-- ============================================================================
-- R8  control.ai_confidence_threshold
-- ============================================================================

DO $act1$ BEGIN ALTER TABLE control.ai_confidence_threshold ADD CONSTRAINT act_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $act1$;

DO $act2$ BEGIN ALTER TABLE control.ai_confidence_threshold ADD CONSTRAINT act_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $act2$;

DO $act3$ BEGIN ALTER TABLE control.ai_confidence_threshold ADD CONSTRAINT act_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $act3$;


-- ============================================================================
-- R8  control.ai_drift_baseline
-- ============================================================================

DO $adb1$ BEGIN ALTER TABLE control.ai_drift_baseline ADD CONSTRAINT adb_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $adb1$;

DO $adb2$ BEGIN ALTER TABLE control.ai_drift_baseline ADD CONSTRAINT adb_superseded_by_fk
    FOREIGN KEY (superseded_by_id)
    REFERENCES control.ai_drift_baseline (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $adb2$;

DO $adb3$ BEGIN ALTER TABLE control.ai_drift_baseline ADD CONSTRAINT adb_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $adb3$;

DO $adb4$ BEGIN ALTER TABLE control.ai_drift_baseline ADD CONSTRAINT adb_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $adb4$;


-- ============================================================================
-- R2b  control.lifecycle_transition_gate — resolves_via + policy_rule_id
-- ============================================================================

-- Add columns
DO $ltg1$ BEGIN
    ALTER TABLE control.lifecycle_transition_gate
        ADD COLUMN resolves_via text NOT NULL DEFAULT 'workflow';
EXCEPTION WHEN duplicate_column THEN NULL; END $ltg1$;

DO $ltg2$ BEGIN
    ALTER TABLE control.lifecycle_transition_gate
        ADD COLUMN policy_rule_id uuid;
EXCEPTION WHEN duplicate_column THEN NULL; END $ltg2$;

-- Add / refresh constraints (idempotent: drop then add)
ALTER TABLE control.lifecycle_transition_gate
    DROP CONSTRAINT IF EXISTS ltg_resolves_via_chk;
ALTER TABLE control.lifecycle_transition_gate
    ADD CONSTRAINT ltg_resolves_via_chk
    CHECK (resolves_via IN ('workflow', 'policy'));

ALTER TABLE control.lifecycle_transition_gate
    DROP CONSTRAINT IF EXISTS ltg_workflow_path_chk;
ALTER TABLE control.lifecycle_transition_gate
    ADD CONSTRAINT ltg_workflow_path_chk
    CHECK (resolves_via <> 'workflow' OR workflow_definition_id IS NOT NULL);

ALTER TABLE control.lifecycle_transition_gate
    DROP CONSTRAINT IF EXISTS ltg_policy_path_chk;
ALTER TABLE control.lifecycle_transition_gate
    ADD CONSTRAINT ltg_policy_path_chk
    CHECK (resolves_via <> 'policy' OR policy_rule_id IS NOT NULL);

-- Extend nonempty check to include policy_rule_id
ALTER TABLE control.lifecycle_transition_gate
    DROP CONSTRAINT IF EXISTS ltg_nonempty_chk;
ALTER TABLE control.lifecycle_transition_gate
    ADD CONSTRAINT ltg_nonempty_chk CHECK (
        required_operations IS NOT NULL
        OR workflow_definition_id IS NOT NULL
        OR conditions IS NOT NULL
        OR threshold_rules IS NOT NULL
        OR policy_rule_id IS NOT NULL
    );

-- FK for policy_rule_id
DO $ltg3$ BEGIN
    ALTER TABLE control.lifecycle_transition_gate
        ADD CONSTRAINT ltg_policy_rule_fk
        FOREIGN KEY (policy_rule_id)
        REFERENCES control.policy_rule (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $ltg3$;


-- ============================================================================
-- R4  control.entity_publish_state — source_layer + source_ref + applied_precedence
-- ============================================================================

DO $eps1$ BEGIN
    ALTER TABLE control.entity_publish_state
        ADD COLUMN source_layer text NOT NULL DEFAULT 'platform';
EXCEPTION WHEN duplicate_column THEN NULL; END $eps1$;

DO $eps2$ BEGIN
    ALTER TABLE control.entity_publish_state
        ADD COLUMN source_ref text;
EXCEPTION WHEN duplicate_column THEN NULL; END $eps2$;

DO $eps3$ BEGIN
    ALTER TABLE control.entity_publish_state
        ADD COLUMN applied_precedence smallint NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL; END $eps3$;

ALTER TABLE control.entity_publish_state
    DROP CONSTRAINT IF EXISTS eps_source_layer_chk;
ALTER TABLE control.entity_publish_state
    ADD CONSTRAINT eps_source_layer_chk
    CHECK (source_layer IN ('platform', 'blueprint', 'overlay'));

ALTER TABLE control.entity_publish_state
    DROP CONSTRAINT IF EXISTS eps_source_ref_chk;
ALTER TABLE control.entity_publish_state
    ADD CONSTRAINT eps_source_ref_chk
    CHECK (source_ref IS NULL OR btrim(source_ref) <> '');

ALTER TABLE control.entity_publish_state
    DROP CONSTRAINT IF EXISTS eps_precedence_chk;
ALTER TABLE control.entity_publish_state
    ADD CONSTRAINT eps_precedence_chk
    CHECK (applied_precedence >= 0);


-- ── H1: feature_flag.flag_type ───────────────────────────────────────────────

DO $ff1$ BEGIN
    ALTER TABLE control.feature_flag
        ADD COLUMN flag_type text NOT NULL DEFAULT 'release_gate';
EXCEPTION WHEN duplicate_column THEN NULL; END $ff1$;

ALTER TABLE control.feature_flag
    DROP CONSTRAINT IF EXISTS ff_flag_type_chk;
ALTER TABLE control.feature_flag
    ADD CONSTRAINT ff_flag_type_chk
    CHECK (flag_type IN ('release_gate', 'capability_toggle', 'experiment'));


-- ── H5: rounding_rule.gl_variance_approval_required ─────────────────────────

DO $rr1$ BEGIN
    ALTER TABLE control.rounding_rule
        ADD COLUMN gl_variance_approval_required boolean NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL; END $rr1$;


-- ── H3: forecast_budget_bridge — FKs ────────────────────────────────────────

DO $fbb1$ BEGIN
    ALTER TABLE control.forecast_budget_bridge ADD CONSTRAINT fbb_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $fbb1$;

DO $fbb2$ BEGIN
    ALTER TABLE control.forecast_budget_bridge ADD CONSTRAINT fbb_planning_driver_version_fk
        FOREIGN KEY (planning_driver_version_id)
        REFERENCES control.planning_driver_version (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $fbb2$;

DO $fbb3$ BEGIN
    ALTER TABLE control.forecast_budget_bridge ADD CONSTRAINT fbb_superseded_by_fk
        FOREIGN KEY (superseded_by_id)
        REFERENCES control.forecast_budget_bridge (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $fbb3$;

DO $fbb4$ BEGIN
    ALTER TABLE control.forecast_budget_bridge ADD CONSTRAINT fbb_locked_by_fk
        FOREIGN KEY (locked_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $fbb4$;

DO $fbb5$ BEGIN
    ALTER TABLE control.forecast_budget_bridge ADD CONSTRAINT fbb_approved_by_fk
        FOREIGN KEY (approved_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $fbb5$;

DO $fbb6$ BEGIN
    ALTER TABLE control.forecast_budget_bridge ADD CONSTRAINT fbb_created_by_fk
        FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $fbb6$;

DO $fbb7$ BEGIN
    ALTER TABLE control.forecast_budget_bridge ADD CONSTRAINT fbb_updated_by_fk
        FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $fbb7$;


-- ── H4: metadata_change_application_log — FKs ───────────────────────────────

DO $mcal1$ BEGIN
    ALTER TABLE control.metadata_change_application_log ADD CONSTRAINT mcal_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $mcal1$;

DO $mcal2$ BEGIN
    ALTER TABLE control.metadata_change_application_log ADD CONSTRAINT mcal_change_request_fk
        FOREIGN KEY (change_request_id)
        REFERENCES control.metadata_change_request (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $mcal2$;

DO $mcal3$ BEGIN
    ALTER TABLE control.metadata_change_application_log ADD CONSTRAINT mcal_applied_by_fk
        FOREIGN KEY (applied_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $mcal3$;

DO $mcal4$ BEGIN
    ALTER TABLE control.metadata_change_application_log ADD CONSTRAINT mcal_created_by_fk
        FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $mcal4$;


-- Flow engine extension integrity
DO $$ BEGIN
    ALTER TABLE control.entity_flow_section ADD CONSTRAINT efsec_step_fk
        FOREIGN KEY (flow_step_id) REFERENCES control.entity_flow_step (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE control.entity_flow_step DROP CONSTRAINT IF EXISTS efs_flow_order_uq;
ALTER TABLE control.entity_flow_step ADD CONSTRAINT efs_flow_order_uq
    UNIQUE (flow_id, sort_order) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE control.entity_flow_section DROP CONSTRAINT IF EXISTS efsec_step_order_uq;
ALTER TABLE control.entity_flow_section ADD CONSTRAINT efsec_step_order_uq
    UNIQUE (flow_step_id, sort_order) DEFERRABLE INITIALLY DEFERRED;

-- Extend eff_summary_role_chk to explicitly allow NULL
-- (original constraint omitted IS NULL OR; re-applied idempotently)
ALTER TABLE control.entity_flow_field DROP CONSTRAINT IF EXISTS eff_summary_role_chk;
ALTER TABLE control.entity_flow_field ADD CONSTRAINT eff_summary_role_chk
    CHECK (summary_role IS NULL OR summary_role IN (
        'total','subtotal','addition','deduction','line_badge','warning','meta'));


-- ============================================================================
-- §EV-FK  entity_publish_state version pointers + entity_version lineage FKs
-- ============================================================================

-- entity_publish_state.published_version_id → entity_version
DO $$ BEGIN ALTER TABLE control.entity_publish_state ADD CONSTRAINT eps_published_version_fk
    FOREIGN KEY (published_version_id) REFERENCES control.entity_version(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- entity_publish_state.current_draft_version_id → entity_version
DO $$ BEGIN ALTER TABLE control.entity_publish_state ADD CONSTRAINT eps_draft_version_fk
    FOREIGN KEY (current_draft_version_id) REFERENCES control.entity_version(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- entity_version self-referential lineage
DO $$ BEGIN ALTER TABLE control.entity_version ADD CONSTRAINT ev_derived_from_fk
    FOREIGN KEY (derived_from_version_id) REFERENCES control.entity_version(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.entity_version ADD CONSTRAINT ev_supersedes_fk
    FOREIGN KEY (supersedes_version_id) REFERENCES control.entity_version(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Drop dead publish_state_id column from entity (never written, no FK, redundant with 1:1 join)
ALTER TABLE control.entity DROP COLUMN IF EXISTS publish_state_id;
