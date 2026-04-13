-- 06_constraints/003a_master_identity.sql
-- Depends on: 04_tables/003a_master_identity.sql
-- FK constraints (Part A): identity, RBAC, collaboration, and document/branding.
--
-- Session-dependent CHECK constraints (control.fn_valid_lookup) have been removed.
-- Replaced by trigger-based validation via control.trg_validate_lookup_columns()
-- in 09_triggers/003_master.sql. See P2-8 for rationale.

-- tenant.status — CHECK removed, trigger-based validation in 09_triggers.
ALTER TABLE master.tenant DROP CONSTRAINT IF EXISTS tenant_status_chk;

-- tenant.subscription — CHECK removed, trigger-based validation in 09_triggers.
ALTER TABLE master.tenant DROP CONSTRAINT IF EXISTS tenant_subscription_chk;

-- tenant audit pair: updated_at and updated_by must both be set or both be NULL.
-- NULL = never modified (initial insert). Prevents partial audit state.
DO $$ BEGIN
    ALTER TABLE master.tenant
        ADD CONSTRAINT tenant_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- principal.principal_type — CHECK removed, trigger-based validation in 09_triggers.
ALTER TABLE master.principal DROP CONSTRAINT IF EXISTS principal_type_chk;

-- principal.status — CHECK removed, trigger-based validation in 09_triggers.
ALTER TABLE master.principal DROP CONSTRAINT IF EXISTS principal_status_chk;

-- principal audit pair: updated_at and updated_by must both be set or both be NULL.
DO $$ BEGIN
    ALTER TABLE master.principal
        ADD CONSTRAINT principal_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- principal.tenant_id → master.tenant
ALTER TABLE master.principal DROP CONSTRAINT IF EXISTS principal_tenant_fk;
DO $$ BEGIN
    ALTER TABLE master.principal
        ADD CONSTRAINT principal_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- principal.external_ref unique per tenant (when populated)
CREATE UNIQUE INDEX IF NOT EXISTS principal_external_ref_uidx
    ON master.principal (tenant_id, external_ref)
    WHERE external_ref IS NOT NULL;

-- principal_profile → principal (composite FK, cascade delete)
DO $$ BEGIN
    ALTER TABLE master.principal_profile
        ADD CONSTRAINT principal_profile_principal_fk
        FOREIGN KEY (tenant_id, principal_id)
        REFERENCES master.principal (tenant_id, id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- principal_profile.tenant_id → master.tenant
ALTER TABLE master.principal_profile DROP CONSTRAINT IF EXISTS principal_profile_tenant_fk;
DO $$ BEGIN
    ALTER TABLE master.principal_profile
        ADD CONSTRAINT principal_profile_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- principal_profile audit pair: updated_at and updated_by must both be set or both be NULL.
DO $$ BEGIN
    ALTER TABLE master.principal_profile
        ADD CONSTRAINT principal_profile_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── principal_identity_binding foreign keys ──────────────────────────────────────
-- These were absent from the table DDL (04_tables) and are added here to keep
-- FK declarations co-located with the rest of the identity layer constraints.

-- pab.tenant_id → master.tenant
ALTER TABLE master.principal_identity_binding DROP CONSTRAINT IF EXISTS pib_tenant_fk;
DO $$ BEGIN
    ALTER TABLE master.principal_identity_binding
        ADD CONSTRAINT pib_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- pab.(tenant_id, principal_id) → master.principal (composite FK, cascade delete)
-- Ensures orphaned bindings cannot exist after a principal is deleted.
ALTER TABLE master.principal_identity_binding DROP CONSTRAINT IF EXISTS pib_principal_fk;
DO $$ BEGIN
    ALTER TABLE master.principal_identity_binding
        ADD CONSTRAINT pib_principal_fk
        FOREIGN KEY (tenant_id, principal_id)
        REFERENCES master.principal (tenant_id, id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- pab audit pair: updated_at and updated_by must both be set or both be NULL.
DO $$ BEGIN
    ALTER TABLE master.principal_identity_binding
        ADD CONSTRAINT pib_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- contact_link.status — fixed two-state lifecycle, not tenant-extensible.
DO $$ BEGIN
    ALTER TABLE master.contact_link
        ADD CONSTRAINT contact_link_status_chk
        CHECK (status IN ('active', 'deprecated'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- contact_link.channel_type — CHECK removed, trigger-based validation in 09_triggers.
ALTER TABLE master.contact_link DROP CONSTRAINT IF EXISTS contact_link_channel_type_chk;

-- contact_link.purpose — CHECK removed, trigger-based validation in 09_triggers.
ALTER TABLE master.contact_link DROP CONSTRAINT IF EXISTS contact_link_purpose_chk;

-- contact_link.tenant_id → master.tenant
ALTER TABLE master.contact_link DROP CONSTRAINT IF EXISTS contact_link_tenant_fk;
DO $$ BEGIN
    ALTER TABLE master.contact_link
        ADD CONSTRAINT contact_link_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- contact_email → contact_link (composite FK, cascade delete)
DO $$ BEGIN
    ALTER TABLE master.contact_email
        ADD CONSTRAINT contact_email_contact_link_fk
        FOREIGN KEY (tenant_id, contact_link_id)
        REFERENCES master.contact_link (tenant_id, id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- contact_email.tenant_id → master.tenant
ALTER TABLE master.contact_email DROP CONSTRAINT IF EXISTS contact_email_tenant_fk;
DO $$ BEGIN
    ALTER TABLE master.contact_email
        ADD CONSTRAINT contact_email_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- contact_phone → contact_link (composite FK, cascade delete)
DO $$ BEGIN
    ALTER TABLE master.contact_phone
        ADD CONSTRAINT contact_phone_contact_link_fk
        FOREIGN KEY (tenant_id, contact_link_id)
        REFERENCES master.contact_link (tenant_id, id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- contact_phone.tenant_id → master.tenant
ALTER TABLE master.contact_phone DROP CONSTRAINT IF EXISTS contact_phone_tenant_fk;
DO $$ BEGIN
    ALTER TABLE master.contact_phone
        ADD CONSTRAINT contact_phone_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- label.locale_code → shared.locale (DEFERRABLE for bulk-load ordering)
DO $$ BEGIN
    ALTER TABLE master.label
        ADD CONSTRAINT label_locale_code_fkey
        FOREIGN KEY (locale_code)
        REFERENCES shared.locale (code)
        ON UPDATE NO ACTION
        ON DELETE RESTRICT
        DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- label.tenant_id → master.tenant (nullable — NULL = global label)
DO $$ BEGIN
    ALTER TABLE master.label
        ADD CONSTRAINT label_tenant_fk
        FOREIGN KEY (tenant_id)
        REFERENCES master.tenant (id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ── owner_type ──────────────────────────────────────────────────────

-- owner_type.tenant_id → master.tenant (nullable — NULL = system)
DO $$ BEGIN
    ALTER TABLE master.owner_type
        ADD CONSTRAINT owner_type_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── address ──────────────────────────────────────────────────────────────────

-- address.country_code → shared.country (validates ISO 3166-1 alpha-2)
DO $$ BEGIN
    ALTER TABLE master.address
        ADD CONSTRAINT address_country_fk
        FOREIGN KEY (country_code) REFERENCES shared.country (code)
        ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- address.tenant_id → master.tenant
ALTER TABLE master.address DROP CONSTRAINT IF EXISTS address_tenant_fk;
DO $$ BEGIN
    ALTER TABLE master.address
        ADD CONSTRAINT address_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- address.address_type — CHECK removed, trigger-based validation in 09_triggers.
ALTER TABLE master.address DROP CONSTRAINT IF EXISTS address_type_chk;

-- ── address_link ─────────────────────────────────────────────────────────────

-- address_link.address_id → master.address (composite FK — cross-tenant safe)
DO $$ BEGIN
    ALTER TABLE master.address_link
        ADD CONSTRAINT address_link_address_fk
        FOREIGN KEY (tenant_id, address_id)
        REFERENCES master.address (tenant_id, id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- address_link.tenant_id → master.tenant
ALTER TABLE master.address_link DROP CONSTRAINT IF EXISTS address_link_tenant_fk;
DO $$ BEGIN
    ALTER TABLE master.address_link
        ADD CONSTRAINT address_link_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- address_link.owner_type — CHECK removed, trigger-based validation in 09_triggers.
ALTER TABLE master.address_link DROP CONSTRAINT IF EXISTS address_link_owner_type_chk;

-- address_link.purpose — CHECK removed, trigger-based validation in 09_triggers.
ALTER TABLE master.address_link DROP CONSTRAINT IF EXISTS address_link_purpose_chk;

-- ── contact_link — backfill owner_type validation to existing table ──────────

-- contact_link.owner_type — CHECK removed, trigger-based validation in 09_triggers.
ALTER TABLE master.contact_link DROP CONSTRAINT IF EXISTS contact_link_owner_type_chk;

-- ── RBAC Phase 2 constraints ────────────────────────────────
-- operating_unit constraints removed — table dropped in company_code migration.
-- See 13_patches/002_drop_operating_unit.sql.

-- principal_profile working context additions
-- Added via ALTER since company_code is defined after principal_profile.
ALTER TABLE master.principal_profile
    ADD COLUMN IF NOT EXISTS default_company_code_id uuid;
ALTER TABLE master.principal_profile
    ADD COLUMN IF NOT EXISTS supervisor_id uuid;
ALTER TABLE master.principal_profile
    ADD COLUMN IF NOT EXISTS supervisor_source text;

DO $$ BEGIN
    ALTER TABLE master.principal_profile
        ADD CONSTRAINT principal_profile_cc_fk
        FOREIGN KEY (default_company_code_id) REFERENCES master.company_code (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE master.principal_profile
        ADD CONSTRAINT principal_profile_supervisor_fk
        FOREIGN KEY (supervisor_id) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Widen supervisor_source CHECK to include new valid values (FIX-9)
ALTER TABLE master.principal_profile DROP CONSTRAINT IF EXISTS pp_supervisor_source_chk;
DO $$ BEGIN
    ALTER TABLE master.principal_profile
        ADD CONSTRAINT pp_supervisor_source_chk
        CHECK (supervisor_source IS NULL OR supervisor_source IN (
            'manual','hr_sync','employee_record','org_chart','scim'
        ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- principal_profile working-context FKs (tenant-scoped composites, SET NULL on delete)
DO $$ BEGIN
    ALTER TABLE master.principal_profile
        ADD CONSTRAINT pp_default_company_fk
        FOREIGN KEY (tenant_id, default_company_code_id)
        REFERENCES master.company_code (tenant_id, id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE master.principal_profile
        ADD CONSTRAINT pp_default_cost_center_fk
        FOREIGN KEY (tenant_id, default_cost_center_id)
        REFERENCES master.cost_center (tenant_id, id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE master.principal_profile
        ADD CONSTRAINT pp_default_profit_center_fk
        FOREIGN KEY (tenant_id, default_profit_center_id)
        REFERENCES master.profit_center (tenant_id, id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE master.principal_profile
        ADD CONSTRAINT pp_default_project_fk
        FOREIGN KEY (tenant_id, default_project_id)
        REFERENCES master.project (tenant_id, id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE master.principal_profile
        ADD CONSTRAINT pp_default_dimension_set_fk
        FOREIGN KEY (tenant_id, default_dimension_set_id)
        REFERENCES master.dimension_set (tenant_id, id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- default_budget_allocation_id: FUTURE ANCHOR — no FK target yet.
-- FK will be added when budget allocation entity is created.

DO $$ BEGIN
    ALTER TABLE master.principal_profile
        ADD CONSTRAINT pp_employee_fk
        FOREIGN KEY (tenant_id, employee_id)
        REFERENCES master.employee (tenant_id, id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- tenant_module_subscription → tenant, module
DO $$ BEGIN
    ALTER TABLE master.tenant_module_subscription
        ADD CONSTRAINT tms_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE master.tenant_module_subscription
        ADD CONSTRAINT tms_module_fk
        FOREIGN KEY (module_id) REFERENCES shared.module (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- tenant_feature_entitlement → tenant, enterprise_feature
DO $$ BEGIN
    ALTER TABLE master.tenant_feature_entitlement
        ADD CONSTRAINT tfe_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE master.tenant_feature_entitlement
        ADD CONSTRAINT tfe_feature_fk
        FOREIGN KEY (feature_id) REFERENCES shared.enterprise_feature (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- tenant_permission_override → tenant, permission
DO $$ BEGIN
    ALTER TABLE master.tenant_permission_override
        ADD CONSTRAINT tpo_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE master.tenant_permission_override
        ADD CONSTRAINT tpo_permission_fk
        FOREIGN KEY (permission_id) REFERENCES shared.permission (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- company_code_access → tenant, company_code
DO $$ BEGIN
    ALTER TABLE master.company_code_access
        ADD CONSTRAINT cca_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE master.company_code_access
        ADD CONSTRAINT cca_cc_fk
        FOREIGN KEY (company_code_id) REFERENCES master.company_code (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── RBAC Phase 3 constraints ────────────────────────────────

-- shared.role → persona, module, workspace (no tenant FK — shared table)
DO $$ BEGIN
    ALTER TABLE shared.role
        ADD CONSTRAINT shared_role_persona_fk
        FOREIGN KEY (persona_id) REFERENCES shared.persona (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE shared.role
        ADD CONSTRAINT shared_role_module_fk
        FOREIGN KEY (module_id) REFERENCES shared.module (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE shared.role
        ADD CONSTRAINT shared_role_workspace_fk
        FOREIGN KEY (workspace_id) REFERENCES shared.workspace (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- auth_group → tenant
DO $$ BEGIN
    ALTER TABLE master.auth_group
        ADD CONSTRAINT auth_group_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- auth_group_role: drop legacy scope/company_code_id constraints that no longer exist
DO $$ BEGIN
    ALTER TABLE master.auth_group_role DROP CONSTRAINT IF EXISTS agr_scope_chk;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
ALTER TABLE master.auth_group_role DROP CONSTRAINT IF EXISTS auth_group_role_cc_fk;

-- auth_group_role → tenant, auth_group, role
-- NOTE: assignment_scope_ref_id is polymorphic (CC or LE); validated by trigger, not FK.
DO $$ BEGIN
    ALTER TABLE master.auth_group_role
        ADD CONSTRAINT auth_group_role_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE master.auth_group_role
        ADD CONSTRAINT auth_group_role_group_fk
        FOREIGN KEY (tenant_id, group_id)
        REFERENCES master.auth_group (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE master.auth_group_role
        ADD CONSTRAINT auth_group_role_role_fk
        FOREIGN KEY (role_id)
        REFERENCES shared.role (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- auth_group_member → tenant, principal, auth_group
DO $$ BEGIN
    ALTER TABLE master.auth_group_member
        ADD CONSTRAINT agm_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE master.auth_group_member
        ADD CONSTRAINT agm_principal_fk
        FOREIGN KEY (principal_id) REFERENCES master.principal (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE master.auth_group_member
        ADD CONSTRAINT agm_group_fk
        FOREIGN KEY (tenant_id, group_id)
        REFERENCES master.auth_group (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- principal_persona → tenant, principal, persona
DO $$ BEGIN
    ALTER TABLE master.principal_persona
        ADD CONSTRAINT pp_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE master.principal_persona
        ADD CONSTRAINT pp_principal_fk
        FOREIGN KEY (principal_id) REFERENCES master.principal (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE master.principal_persona
        ADD CONSTRAINT pp_persona_fk
        FOREIGN KEY (persona_id) REFERENCES shared.persona (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- team → tenant, leader
DO $$ BEGIN
    ALTER TABLE master.team
        ADD CONSTRAINT team_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE master.team
        ADD CONSTRAINT team_leader_fk
        FOREIGN KEY (leader_id) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- team_member → tenant, team, principal
-- Patch 001 Fix 2: drop over-restrictive table constraint; replaced by partial unique index.
ALTER TABLE master.team_member DROP CONSTRAINT IF EXISTS team_member_active_uq;

DO $$ BEGIN
    ALTER TABLE master.team_member
        ADD CONSTRAINT tm_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE master.team_member
        ADD CONSTRAINT tm_team_fk
        FOREIGN KEY (tenant_id, team_id)
        REFERENCES master.team (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE master.team_member
        ADD CONSTRAINT tm_principal_fk
        FOREIGN KEY (principal_id) REFERENCES master.principal (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- access_grant: drop legacy company_code_id FK (column removed)
ALTER TABLE master.access_grant DROP CONSTRAINT IF EXISTS ag_cc_fk;
-- Drop legacy scope check (replaced by ag_visibility_scope_chk in table DDL)
DO $$ BEGIN
    ALTER TABLE master.access_grant DROP CONSTRAINT IF EXISTS ag_scope_chk;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- access_grant → tenant, role, group, principal, permission
-- NOTE: assignment_scope_ref_id is polymorphic (CC or LE); validated by trigger, not FK.
DO $$ BEGIN
    ALTER TABLE master.access_grant
        ADD CONSTRAINT ag_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE master.access_grant
        ADD CONSTRAINT ag_role_fk
        FOREIGN KEY (role_id) REFERENCES shared.role (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE master.access_grant
        ADD CONSTRAINT ag_group_fk
        FOREIGN KEY (group_id) REFERENCES master.auth_group (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE master.access_grant
        ADD CONSTRAINT ag_principal_fk
        FOREIGN KEY (principal_id) REFERENCES master.principal (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE master.access_grant
        ADD CONSTRAINT ag_permission_fk
        FOREIGN KEY (permission_id) REFERENCES shared.permission (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE master.access_grant
        ADD CONSTRAINT ag_revoked_by_fk
        FOREIGN KEY (revoked_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE master.access_grant
        ADD CONSTRAINT ag_granted_by_fk
        FOREIGN KEY (granted_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- group_feature_grant → tenant, group, enterprise_feature
DO $$ BEGIN
    ALTER TABLE master.group_feature_grant
        ADD CONSTRAINT gfg_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE master.group_feature_grant
        ADD CONSTRAINT gfg_group_fk
        FOREIGN KEY (group_id) REFERENCES master.auth_group (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE master.group_feature_grant
        ADD CONSTRAINT gfg_feature_fk
        FOREIGN KEY (feature_id) REFERENCES shared.enterprise_feature (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- principal_feature_grant → tenant, principal, enterprise_feature
DO $$ BEGIN
    ALTER TABLE master.principal_feature_grant
        ADD CONSTRAINT pfg_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE master.principal_feature_grant
        ADD CONSTRAINT pfg_principal_fk
        FOREIGN KEY (principal_id) REFERENCES master.principal (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE master.principal_feature_grant
        ADD CONSTRAINT pfg_feature_fk
        FOREIGN KEY (feature_id) REFERENCES shared.enterprise_feature (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ————————————————————————————————————————————————————————————————————————————
-- §27  notification (per-recipient inbox)
-- ————————————————————————————————————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE master.notification ADD CONSTRAINT notif_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.notification ADD CONSTRAINT notif_message_fk
    FOREIGN KEY (message_id) REFERENCES event.notification_message (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.notification ADD CONSTRAINT notif_recipient_fk
    FOREIGN KEY (recipient_id) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.notification ADD CONSTRAINT notif_sender_fk
    FOREIGN KEY (sender_id) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.notification ADD CONSTRAINT notif_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 06_constraints/012_identity_sharing.sql
-- FK constraints for master.tenant_profile and master.delegation_grant.
-- Idempotent DO $$ blocks.

-- —— master.tenant_profile ———————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE master.tenant_profile ADD CONSTRAINT tp_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.tenant_profile ADD CONSTRAINT tp_country_fk
    FOREIGN KEY (country_code) REFERENCES shared.country (code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.tenant_profile ADD CONSTRAINT tp_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.tenant_profile ADD CONSTRAINT tp_locale_fk
    FOREIGN KEY (locale_code) REFERENCES shared.locale (code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.tenant_profile ADD CONSTRAINT tp_timezone_fk
    FOREIGN KEY (timezone_code) REFERENCES shared.timezone (code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.tenant_profile ADD CONSTRAINT tp_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.tenant_profile ADD CONSTRAINT tp_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- tenant_profile new FKs (profile extension)
DO $$ BEGIN
    ALTER TABLE master.tenant_profile ADD CONSTRAINT tp_language_fk
        FOREIGN KEY (language_code) REFERENCES shared.language (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE master.tenant_profile ADD CONSTRAINT tp_reporting_currency_fk
        FOREIGN KEY (reporting_currency_code) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE master.tenant_profile ADD CONSTRAINT tp_brand_profile_fk
        FOREIGN KEY (tenant_id, default_brand_profile_id)
        REFERENCES master.brand_profile (tenant_id, id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE master.tenant_profile ADD CONSTRAINT tp_letterhead_fk
        FOREIGN KEY (tenant_id, default_letterhead_id)
        REFERENCES master.letterhead (tenant_id, id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- —— master.delegation_grant —————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE master.delegation_grant ADD CONSTRAINT dg_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.delegation_grant ADD CONSTRAINT dg_delegator_fk
    FOREIGN KEY (delegator_id) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.delegation_grant ADD CONSTRAINT dg_delegate_fk
    FOREIGN KEY (delegate_id) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.delegation_grant ADD CONSTRAINT dg_revoked_by_fk
    FOREIGN KEY (revoked_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.delegation_grant ADD CONSTRAINT dg_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- request_id → event.delegation_request: intentionally omitted.
-- event.delegation_request is not yet built; add in a future constraints file
-- once event.delegation_request exists:
-- DO $$ BEGIN ALTER TABLE master.delegation_grant ADD CONSTRAINT dg_request_fk
--     FOREIGN KEY (tenant_id, request_id)
--     REFERENCES event.delegation_request (tenant_id, id) ON DELETE SET NULL;
-- EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 06_constraints/013_collab.sql
-- FK constraints for collaboration cluster — all 11 tables.
-- Idempotent DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- ON DELETE RESTRICT  — accountability FKs (commenter, flagged_by)
-- ON DELETE SET NULL  — optional / soft-linked FKs (reviewed_by, hidden_by)
-- ON DELETE CASCADE   — tenant + parent ownership FKs


-- —— §1  master.attachment ———————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE master.attachment ADD CONSTRAINT attachment_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Patch 002 Fix 1: composite (tenant_id, parent_attachment_id) + SET NULL crashes when
-- parent is deleted — SET NULL applies to ALL FK columns including NOT NULL tenant_id.
-- Changed to single-column FK. Tenant alignment enforced by RLS (FORCE ROW LEVEL SECURITY).
-- Same root cause as patch 001 Fix 1a (mpu_attachment_fk) and Fix 1b (comment_parent_fk).
ALTER TABLE master.attachment DROP CONSTRAINT IF EXISTS attachment_parent_fk;

DO $$ BEGIN
    ALTER TABLE master.attachment
        ADD CONSTRAINT attachment_parent_fk
        FOREIGN KEY (parent_attachment_id)
        REFERENCES master.attachment (id)
        ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN ALTER TABLE master.attachment ADD CONSTRAINT attachment_uploaded_by_fk
    FOREIGN KEY (uploaded_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.attachment ADD CONSTRAINT attachment_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- —— §2  master.multipart_upload —————————————————————————————————————————
DO $$ BEGIN ALTER TABLE master.multipart_upload ADD CONSTRAINT mpu_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Patch 001 Fix 1a: composite (tenant_id, attachment_id) FK with SET NULL crashes when
-- parent attachment is deleted because SET NULL includes NOT NULL tenant_id column.
-- Changed to single-column FK. Tenant alignment enforced by RLS.
ALTER TABLE master.multipart_upload DROP CONSTRAINT IF EXISTS mpu_attachment_fk;

DO $$ BEGIN
    ALTER TABLE master.multipart_upload
        ADD CONSTRAINT mpu_attachment_fk
        FOREIGN KEY (attachment_id)
        REFERENCES master.attachment (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN ALTER TABLE master.multipart_upload ADD CONSTRAINT mpu_initiated_by_fk
    FOREIGN KEY (initiated_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.multipart_upload ADD CONSTRAINT mpu_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- —— §3  master.attachment_acl ———————————————————————————————————————————
DO $$ BEGIN ALTER TABLE master.attachment_acl ADD CONSTRAINT acl_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.attachment_acl ADD CONSTRAINT acl_attachment_fk
    FOREIGN KEY (tenant_id, attachment_id)
    REFERENCES master.attachment (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.attachment_acl ADD CONSTRAINT acl_principal_fk
    FOREIGN KEY (principal_id) REFERENCES master.principal (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.attachment_acl ADD CONSTRAINT acl_role_fk
    FOREIGN KEY (role_id) REFERENCES shared.role (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.attachment_acl ADD CONSTRAINT acl_granted_by_fk
    FOREIGN KEY (granted_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.attachment_acl ADD CONSTRAINT acl_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- —— §4  master.comment —————————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE master.comment ADD CONSTRAINT comment_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.comment ADD CONSTRAINT comment_commenter_fk
    FOREIGN KEY (commenter_id) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Patch 001 Fix 1b: composite (tenant_id, parent_comment_id) FK with SET NULL crashes when
-- parent comment is deleted because SET NULL includes NOT NULL tenant_id column.
-- Changed to single-column FK. Parent deletion promotes children to top-level (parent_comment_id = NULL).
-- Tenant alignment enforced by RLS.
ALTER TABLE master.comment DROP CONSTRAINT IF EXISTS comment_parent_fk;

DO $$ BEGIN
    ALTER TABLE master.comment
        ADD CONSTRAINT comment_parent_fk
        FOREIGN KEY (parent_comment_id)
        REFERENCES master.comment (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN ALTER TABLE master.comment ADD CONSTRAINT comment_deleted_by_fk
    FOREIGN KEY (deleted_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.comment ADD CONSTRAINT comment_archived_by_fk
    FOREIGN KEY (archived_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.comment ADD CONSTRAINT comment_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- —— §5  master.comment_draft ———————————————————————————————————————————
DO $$ BEGIN ALTER TABLE master.comment_draft ADD CONSTRAINT cd_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.comment_draft ADD CONSTRAINT cd_principal_fk
    FOREIGN KEY (principal_id) REFERENCES master.principal (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.comment_draft ADD CONSTRAINT cd_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- —— §6  master.comment_mention —————————————————————————————————————————
DO $$ BEGIN ALTER TABLE master.comment_mention ADD CONSTRAINT cm_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.comment_mention ADD CONSTRAINT cm_mentioned_fk
    FOREIGN KEY (mentioned_id) REFERENCES master.principal (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.comment_mention ADD CONSTRAINT cm_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Note: comment_id is polymorphic (context_type discriminates) — no direct FK.


-- —— §7  master.comment_reaction ————————————————————————————————————————
DO $$ BEGIN ALTER TABLE master.comment_reaction ADD CONSTRAINT cr_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.comment_reaction ADD CONSTRAINT cr_principal_fk
    FOREIGN KEY (principal_id) REFERENCES master.principal (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.comment_reaction ADD CONSTRAINT cr_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Note: comment_id is polymorphic — no direct FK (same as comment_mention).


-- —— §8  master.conversation ————————————————————————————————————————————
DO $$ BEGIN ALTER TABLE master.conversation ADD CONSTRAINT conv_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.conversation ADD CONSTRAINT conv_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.conversation ADD CONSTRAINT conv_deleted_by_fk
    FOREIGN KEY (deleted_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


DO $$ BEGIN ALTER TABLE master.conversation ADD CONSTRAINT conv_tenant_id_uq UNIQUE (tenant_id, id);
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

-- —— §9  master.conversation_participant ————————————————————————————————
DO $$ BEGIN ALTER TABLE master.conversation_participant ADD CONSTRAINT cp_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.conversation_participant ADD CONSTRAINT cp_conversation_fk
    FOREIGN KEY (tenant_id, conversation_id)
    REFERENCES master.conversation (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.conversation_participant ADD CONSTRAINT cp_principal_fk
    FOREIGN KEY (principal_id) REFERENCES master.principal (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.conversation_participant ADD CONSTRAINT cp_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.lifecycle_instance ADD CONSTRAINT li_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.lifecycle_instance ADD CONSTRAINT li_lifecycle_fk
    FOREIGN KEY (lifecycle_id) REFERENCES control.lifecycle (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.lifecycle_instance ADD CONSTRAINT li_state_fk
    FOREIGN KEY (state_id) REFERENCES control.lifecycle_state (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- =============================================================================
-- §12  DOCUMENT · PRINT · BRANDING  —  master FK constraints
-- =============================================================================

-- ── master.document ────────────────────────────────────────────────────────
ALTER TABLE master.document DROP CONSTRAINT IF EXISTS document_tenant_fk;
DO $$ BEGIN ALTER TABLE master.document ADD CONSTRAINT document_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.document ADD CONSTRAINT document_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.brand_profile ───────────────────────────────────────────────────
ALTER TABLE master.brand_profile DROP CONSTRAINT IF EXISTS brand_profile_tenant_fk;
DO $$ BEGIN ALTER TABLE master.brand_profile ADD CONSTRAINT brand_profile_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.brand_profile ADD CONSTRAINT brand_profile_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.letterhead ──────────────────────────────────────────────────────
ALTER TABLE master.letterhead DROP CONSTRAINT IF EXISTS letterhead_tenant_fk;
DO $$ BEGIN ALTER TABLE master.letterhead ADD CONSTRAINT letterhead_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.letterhead ADD CONSTRAINT letterhead_cc_fk
    FOREIGN KEY (company_code_id)
    REFERENCES master.company_code (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.letterhead ADD CONSTRAINT letterhead_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.template ────────────────────────────────────────────────────────
ALTER TABLE master.template DROP CONSTRAINT IF EXISTS template_tenant_fk;
DO $$ BEGIN ALTER TABLE master.template ADD CONSTRAINT template_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.template ADD CONSTRAINT template_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Circular FK: master.template → snapshot.template_version
-- DEFERRABLE INITIALLY DEFERRED allows inserting template + first version atomically.
DO $$ BEGIN ALTER TABLE master.template ADD CONSTRAINT template_current_version_fk
    FOREIGN KEY (current_version_id)
    REFERENCES snapshot.template_version (id)
    ON DELETE SET NULL
    DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.attachment_comment ──────────────────────────────────────────────
ALTER TABLE master.attachment_comment DROP CONSTRAINT IF EXISTS att_comment_tenant_fk;
DO $$ BEGIN ALTER TABLE master.attachment_comment ADD CONSTRAINT att_comment_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.attachment_comment ADD CONSTRAINT att_comment_attachment_fk
    FOREIGN KEY (tenant_id, attachment_id)
    REFERENCES master.attachment (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.template_binding ────────────────────────────────────────────────
ALTER TABLE master.template_binding DROP CONSTRAINT IF EXISTS template_binding_tenant_fk;
DO $$ BEGIN ALTER TABLE master.template_binding ADD CONSTRAINT template_binding_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.template_binding ADD CONSTRAINT template_binding_template_fk
    FOREIGN KEY (tenant_id, template_id)
    REFERENCES master.template (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.template_binding ADD CONSTRAINT template_binding_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.entity_document_link ────────────────────────────────────────────
ALTER TABLE master.entity_document_link DROP CONSTRAINT IF EXISTS edl_tenant_fk;
DO $$ BEGIN ALTER TABLE master.entity_document_link ADD CONSTRAINT edl_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.entity_document_link ADD CONSTRAINT edl_attachment_fk
    FOREIGN KEY (tenant_id, attachment_id)
    REFERENCES master.attachment (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.entity_document_link ADD CONSTRAINT edl_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


