-- ============================================================================
-- master/03_constraints.sql
-- Concept: Identity FKs — master schema FK graph including tenant cascade rules
-- Depends on: 04_tables/003a–003f_master_*.sql
-- Merged from: 003a_master_identity.sql, 003b_master_finance.sql, 003c_master_extended.sql,
--              003d_master_payment_terms.sql, 003f_master_cms.sql
-- ============================================================================

-- ── Pre-flight orphan guard ──────────────────────────────────────────────────
-- master.business_partner / customer / supplier are rebuilt destructively
-- (DROP TABLE CASCADE) in 01h_tables_business_partner.sql.  Tables outside
-- that file are created with CREATE TABLE IF NOT EXISTS, so their rows survive
-- the rebuild with stale FK references.  NULL / DELETE those orphans here
-- before the FK constraints below are re-applied, otherwise they fail.
DO $guard$ BEGIN
    -- app index tables — whole row is meaningless without the role row
    DELETE FROM master.supplier_app_index
        WHERE NOT EXISTS (SELECT 1 FROM master.supplier s WHERE s.id = master.supplier_app_index.id);
    DELETE FROM master.customer_app_index
        WHERE NOT EXISTS (SELECT 1 FROM master.customer c WHERE c.id = master.customer_app_index.id);

    -- qualification tables — cascade-eligible, delete orphaned qualification rows
    DELETE FROM master.supplier_qualification
        WHERE supplier_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM master.supplier s WHERE s.tenant_id = master.supplier_qualification.tenant_id AND s.id = master.supplier_qualification.supplier_id);
    DELETE FROM master.customer_qualification
        WHERE customer_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM master.customer c WHERE c.tenant_id = master.customer_qualification.tenant_id AND c.id = master.customer_qualification.customer_id);

    -- network link table — delete orphaned BP links
    DELETE FROM master.business_partner_network_link
        WHERE business_partner_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM master.business_partner bp WHERE bp.tenant_id = master.business_partner_network_link.tenant_id AND bp.id = master.business_partner_network_link.business_partner_id);

    -- LE-BP link table — delete orphaned rows where the BP no longer exists
    DELETE FROM master.legal_entity_business_partner_link
        WHERE business_partner_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM master.business_partner bp
                           WHERE bp.tenant_id = master.legal_entity_business_partner_link.tenant_id
                             AND bp.id = master.legal_entity_business_partner_link.business_partner_id);

    -- intercompany_trading_pair — null out FK refs to dropped supplier/customer profiles.
    -- Disable trg_ictp_profile_gate during cleanup: the profile tables were just rebuilt
    -- destructively (DROP TABLE CASCADE in 01h), so all profile refs appear orphaned.
    -- The trigger would reject nulling out refs on active rows; the cleanup must win here
    -- so the FK constraints below can be added cleanly.  Seed data restores the profiles.
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'master' AND table_name = 'intercompany_trading_pair') THEN
        ALTER TABLE master.intercompany_trading_pair DISABLE TRIGGER trg_ictp_profile_gate;
        UPDATE master.intercompany_trading_pair SET counterparty_supplier_profile_id = NULL
            WHERE counterparty_supplier_profile_id IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM master.company_code_supplier_profile p
                               WHERE p.tenant_id = master.intercompany_trading_pair.tenant_id
                                 AND p.id = master.intercompany_trading_pair.counterparty_supplier_profile_id);
        UPDATE master.intercompany_trading_pair SET mirror_customer_profile_id = NULL
            WHERE mirror_customer_profile_id IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM master.company_code_customer_profile p
                               WHERE p.tenant_id = master.intercompany_trading_pair.tenant_id
                                 AND p.id = master.intercompany_trading_pair.mirror_customer_profile_id);
        ALTER TABLE master.intercompany_trading_pair ENABLE TRIGGER trg_ictp_profile_gate;
    END IF;

    -- asset table — nullable supplier_id (renamed from vendor_id in P3 migration).
    -- Handle both old (vendor_id) and new (supplier_id) column names: the DDL uses
    -- CREATE TABLE IF NOT EXISTS so the column name depends on whether the P3 migration
    -- has run yet.  Use dynamic SQL so the column name is resolved at runtime.
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'master' AND table_name = 'asset'
                 AND column_name = 'supplier_id') THEN
        UPDATE master.asset SET supplier_id = NULL
            WHERE supplier_id IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM master.supplier s
                               WHERE s.tenant_id = master.asset.tenant_id
                                 AND s.id = master.asset.supplier_id);
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'master' AND table_name = 'asset'
                    AND column_name = 'vendor_id') THEN
        UPDATE master.asset SET vendor_id = NULL
            WHERE vendor_id IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM master.supplier s
                               WHERE s.tenant_id = master.asset.tenant_id
                                 AND s.id = master.asset.vendor_id);
    END IF;

    -- risk tables: all rows are orphaned because business_partner was rebuilt empty
    -- by 01h.  These tables form a web of composite (tenant_id, x) FKs, several of
    -- which are ON DELETE SET NULL — meaning a cascade UPDATE would try to null out
    -- tenant_id, violating its NOT NULL constraint.  A single multi-table TRUNCATE
    -- lets PostgreSQL resolve intra-list FK dependencies itself without firing
    -- row-level triggers.  Seed phase re-populates everything.
    TRUNCATE master.party_risk_mitigation,
             master.party_risk_driver,
             master.party_risk_dimension_score,
             master.party_risk_review_event,
             master.party_risk_assessment,
             master.party_risk_evidence,
             master.party_governance_relation;
END $guard$;

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


-- 06_constraints/003b_master_finance.sql
-- Depends on: 04_tables/003b_master_finance.sql
-- FK constraints (Part B): legal entities, company codes, GL, cost/profit centers, projects, parties, and products.

-- ============================================================================
-- CORE FINANCE MASTER — FK CONSTRAINTS
-- ============================================================================

-- ── master.legal_entity ─────────────────────────────────────────────────────
ALTER TABLE master.legal_entity DROP CONSTRAINT IF EXISTS le_tenant_fk;
DO $$ BEGIN ALTER TABLE master.legal_entity ADD CONSTRAINT le_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.legal_entity ADD CONSTRAINT le_parent_fk
    FOREIGN KEY (tenant_id, parent_entity_id) REFERENCES master.legal_entity (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.legal_entity ADD CONSTRAINT le_func_curr_fk
    FOREIGN KEY (functional_currency) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.legal_entity ADD CONSTRAINT le_rpt_curr_fk
    FOREIGN KEY (reporting_currency) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.legal_entity ADD CONSTRAINT le_country_fk
    FOREIGN KEY (country_code) REFERENCES shared.country (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.legal_entity ADD CONSTRAINT le_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.company_code ─────────────────────────────────────────────────────
ALTER TABLE master.company_code DROP CONSTRAINT IF EXISTS cc_tenant_fk;
DO $$ BEGIN ALTER TABLE master.company_code ADD CONSTRAINT cc_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code ADD CONSTRAINT cc_legal_entity_fk
    FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES master.legal_entity (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code ADD CONSTRAINT cc_currency_fk
    FOREIGN KEY (functional_currency) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code ADD CONSTRAINT cc_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.cost_center ──────────────────────────────────────────────────────
ALTER TABLE master.cost_center DROP CONSTRAINT IF EXISTS cc2_tenant_fk;
DO $$ BEGIN ALTER TABLE master.cost_center ADD CONSTRAINT cc2_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.cost_center ADD CONSTRAINT cc_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.cost_center ADD CONSTRAINT cc_parent_fk
    FOREIGN KEY (tenant_id, parent_id) REFERENCES master.cost_center (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.cost_center ADD CONSTRAINT cc_pc_fk
    FOREIGN KEY (tenant_id, profit_center_id) REFERENCES master.profit_center (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.cost_center ADD CONSTRAINT cc_person_fk
    FOREIGN KEY (responsible_person_id) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.cost_center ADD CONSTRAINT cc_site_fk
    FOREIGN KEY (tenant_id, site_id) REFERENCES master.site (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.cost_center ADD CONSTRAINT cc_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.cost_center ADD CONSTRAINT cc_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.profit_center ────────────────────────────────────────────────────
ALTER TABLE master.profit_center DROP CONSTRAINT IF EXISTS pc_tenant_fk;
DO $$ BEGIN ALTER TABLE master.profit_center ADD CONSTRAINT pc_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.profit_center ADD CONSTRAINT pc_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.profit_center ADD CONSTRAINT pc_parent_fk
    FOREIGN KEY (tenant_id, parent_id) REFERENCES master.profit_center (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.profit_center ADD CONSTRAINT pc_person_fk
    FOREIGN KEY (responsible_person_id) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.profit_center ADD CONSTRAINT pc_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.profit_center ADD CONSTRAINT pc_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.site ─────────────────────────────────────────────────────────────
ALTER TABLE master.site DROP CONSTRAINT IF EXISTS site_tenant_fk;
DO $$ BEGIN ALTER TABLE master.site ADD CONSTRAINT site_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.site ADD CONSTRAINT site_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.site ADD CONSTRAINT site_parent_fk
    FOREIGN KEY (tenant_id, parent_site_id) REFERENCES master.site (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.site ADD CONSTRAINT site_manager_fk
    FOREIGN KEY (manager_id) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.site ADD CONSTRAINT site_country_fk
    FOREIGN KEY (country_code) REFERENCES shared.country (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.site ADD CONSTRAINT site_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.warehouse ────────────────────────────────────────────────────────
ALTER TABLE master.warehouse DROP CONSTRAINT IF EXISTS wh_tenant_fk;
DO $$ BEGIN ALTER TABLE master.warehouse ADD CONSTRAINT wh_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.warehouse ADD CONSTRAINT wh_site_fk
    FOREIGN KEY (tenant_id, site_id) REFERENCES master.site (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.warehouse ADD CONSTRAINT wh_manager_fk
    FOREIGN KEY (manager_id) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.warehouse ADD CONSTRAINT wh_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.chart_of_account ─────────────────────────────────────────────────
ALTER TABLE master.chart_of_account DROP CONSTRAINT IF EXISTS coa_tenant_fk;
DO $$ BEGIN ALTER TABLE master.chart_of_account ADD CONSTRAINT coa_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.chart_of_account ADD CONSTRAINT coa_country_fk
    FOREIGN KEY (country_code) REFERENCES shared.country (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.chart_of_account ADD CONSTRAINT coa_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.gl_account ───────────────────────────────────────────────────────
ALTER TABLE master.gl_account DROP CONSTRAINT IF EXISTS gla_tenant_fk;
DO $$ BEGIN ALTER TABLE master.gl_account ADD CONSTRAINT gla_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.gl_account ADD CONSTRAINT gla_chart_fk
    FOREIGN KEY (tenant_id, chart_of_account_id) REFERENCES master.chart_of_account (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.gl_account ADD CONSTRAINT gla_parent_fk
    FOREIGN KEY (tenant_id, parent_id) REFERENCES master.gl_account (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.gl_account ADD CONSTRAINT gla_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.gl_account ADD CONSTRAINT gla_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.company_code_chart_assignment ────────────────────────────────────
ALTER TABLE master.company_code_chart_assignment DROP CONSTRAINT IF EXISTS ccca_tenant_fk;
DO $$ BEGIN ALTER TABLE master.company_code_chart_assignment ADD CONSTRAINT ccca_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code_chart_assignment ADD CONSTRAINT ccca_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code_chart_assignment ADD CONSTRAINT ccca_chart_fk
    FOREIGN KEY (tenant_id, chart_of_account_id) REFERENCES master.chart_of_account (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code_chart_assignment ADD CONSTRAINT ccca_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.company_code_gl_account ──────────────────────────────────────────
ALTER TABLE master.company_code_gl_account DROP CONSTRAINT IF EXISTS ccga_tenant_fk;
DO $$ BEGIN ALTER TABLE master.company_code_gl_account ADD CONSTRAINT ccga_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code_gl_account ADD CONSTRAINT ccga_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code_gl_account ADD CONSTRAINT ccga_account_fk
    FOREIGN KEY (tenant_id, gl_account_id) REFERENCES master.gl_account (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code_gl_account ADD CONSTRAINT ccga_cc_fk
    FOREIGN KEY (tenant_id, default_cost_center_id) REFERENCES master.cost_center (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code_gl_account ADD CONSTRAINT ccga_site_fk
    FOREIGN KEY (tenant_id, default_site_id) REFERENCES master.site (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code_gl_account ADD CONSTRAINT ccga_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.project ──────────────────────────────────────────────────────────
ALTER TABLE master.project DROP CONSTRAINT IF EXISTS proj_tenant_fk;
DO $$ BEGIN ALTER TABLE master.project ADD CONSTRAINT proj_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.project ADD CONSTRAINT proj_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.project ADD CONSTRAINT proj_parent_fk
    FOREIGN KEY (tenant_id, parent_project_id) REFERENCES master.project (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.project ADD CONSTRAINT proj_person_fk
    FOREIGN KEY (responsible_person_id) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.project ADD CONSTRAINT proj_cc_fk
    FOREIGN KEY (tenant_id, default_cost_center_id) REFERENCES master.cost_center (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.project ADD CONSTRAINT proj_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.project ADD CONSTRAINT proj_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.project_item ─────────────────────────────────────────────────────
ALTER TABLE master.project_item DROP CONSTRAINT IF EXISTS pi_tenant_fk;
DO $$ BEGIN ALTER TABLE master.project_item ADD CONSTRAINT pi_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.project_item ADD CONSTRAINT pi_project_fk
    FOREIGN KEY (tenant_id, project_id) REFERENCES master.project (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.project_item ADD CONSTRAINT pi_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.project_item ADD CONSTRAINT pi_parent_fk
    FOREIGN KEY (tenant_id, parent_item_id) REFERENCES master.project_item (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.project_item ADD CONSTRAINT pi_cc_fk
    FOREIGN KEY (tenant_id, default_cost_center_id) REFERENCES master.cost_center (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.project_item ADD CONSTRAINT pi_person_fk
    FOREIGN KEY (responsible_person_id) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.project_item ADD CONSTRAINT pi_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.project_item ADD CONSTRAINT pi_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── master.dimension_set ──────────────────────────────────────────────────────
ALTER TABLE master.dimension_set DROP CONSTRAINT IF EXISTS ds_tenant_fk;
DO $$ BEGIN ALTER TABLE master.dimension_set ADD CONSTRAINT ds_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.dimension_set ADD CONSTRAINT ds_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.fiscal_period ─────────────────────────────────────────────────────
ALTER TABLE master.fiscal_period DROP CONSTRAINT IF EXISTS fp_tenant_fk;
DO $$ BEGIN ALTER TABLE master.fiscal_period ADD CONSTRAINT fp_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.fiscal_period ADD CONSTRAINT fp_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.fiscal_period ADD CONSTRAINT fp_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.ledger_book ───────────────────────────────────────────────────────
ALTER TABLE master.ledger_book DROP CONSTRAINT IF EXISTS lb_tenant_fk;
DO $$ BEGIN ALTER TABLE master.ledger_book ADD CONSTRAINT lb_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.ledger_book ADD CONSTRAINT lb_currency_fk
    FOREIGN KEY (base_currency_code) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.ledger_book ADD CONSTRAINT lb_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.company_code_book_assignment ───────────────────────────────────────────────────
ALTER TABLE master.company_code_book_assignment DROP CONSTRAINT IF EXISTS ba_tenant_fk;
DO $$ BEGIN ALTER TABLE master.company_code_book_assignment ADD CONSTRAINT ba_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code_book_assignment ADD CONSTRAINT ba_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code_book_assignment ADD CONSTRAINT ba_book_fk
    FOREIGN KEY (tenant_id, book_id) REFERENCES master.ledger_book (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code_book_assignment ADD CONSTRAINT ba_currency_fk
    FOREIGN KEY (override_currency_code) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code_book_assignment ADD CONSTRAINT ba_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- =============================================================================
-- MODULE 400 — Party, Product, and Classification Bridge
-- All cross-table FKs use composite (tenant_id, id) for cross-tenant safety.
-- shared.* code-based FKs (currency, uom) stay as-is — they are global singletons.
-- =============================================================================

-- ── master.business_partner (§BP1 — commercial identity root) ──────────────
ALTER TABLE master.business_partner DROP CONSTRAINT IF EXISTS bpart_tenant_fk;
DO $$ BEGIN ALTER TABLE master.business_partner ADD CONSTRAINT bpart_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.business_partner ADD CONSTRAINT bpart_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.business_partner ADD CONSTRAINT bpart_parent_fk
    FOREIGN KEY (tenant_id, parent_business_partner_id)
    REFERENCES master.business_partner (tenant_id, id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.business_partner ADD CONSTRAINT bpart_reg_country_fk
    FOREIGN KEY (registration_country_code) REFERENCES shared.country (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.business_partner ADD CONSTRAINT bpart_tax_country_fk
    FOREIGN KEY (tax_residence_country_code) REFERENCES shared.country (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.customer (§BP2 — thin AR role, identity lives on business_partner) ─
ALTER TABLE master.customer DROP CONSTRAINT IF EXISTS cust_tenant_fk;
DO $$ BEGIN ALTER TABLE master.customer ADD CONSTRAINT cust_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.customer ADD CONSTRAINT cust_bp_fk
    FOREIGN KEY (tenant_id, business_partner_id)
    REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.customer ADD CONSTRAINT cust_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.customer ADD CONSTRAINT cust_account_manager_fk
    FOREIGN KEY (tenant_id, account_manager_id)
    REFERENCES master.employee (tenant_id, id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.supplier (§BP3 — thin AP role, identity lives on business_partner) ─
ALTER TABLE master.supplier DROP CONSTRAINT IF EXISTS supp_tenant_fk;
DO $$ BEGIN ALTER TABLE master.supplier ADD CONSTRAINT supp_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.supplier ADD CONSTRAINT supp_bp_fk
    FOREIGN KEY (tenant_id, business_partner_id)
    REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.supplier ADD CONSTRAINT supp_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.supplier ADD CONSTRAINT supp_account_manager_fk
    FOREIGN KEY (tenant_id, account_manager_id)
    REFERENCES master.employee (tenant_id, id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
ALTER TABLE master.supplier DROP CONSTRAINT IF EXISTS supp_spend_category_fk;
ALTER TABLE master.supplier ADD CONSTRAINT supp_commodity_category_fk
    FOREIGN KEY (tenant_id, commodity_category_id)
    REFERENCES master.commodity_category (tenant_id, id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.supplier ADD CONSTRAINT supp_payment_term_fk
    FOREIGN KEY (tenant_id, payment_term_id)
    REFERENCES master.payment_term (tenant_id, id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.supplier ADD CONSTRAINT supp_payment_method_fk
    FOREIGN KEY (tenant_id, payment_method_id)
    REFERENCES master.payment_method (tenant_id, id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.employee ────────────────────────────────────────────────────────
ALTER TABLE master.employee DROP CONSTRAINT IF EXISTS emp_tenant_fk;
DO $$ BEGIN ALTER TABLE master.employee ADD CONSTRAINT emp_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.employee ADD CONSTRAINT emp_principal_fk
    FOREIGN KEY (tenant_id, principal_id) REFERENCES master.principal (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.employee ADD CONSTRAINT emp_manager_fk
    FOREIGN KEY (tenant_id, manager_id) REFERENCES master.employee (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.employee ADD CONSTRAINT emp_cc_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.employee ADD CONSTRAINT emp_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- employee principal_id uniqueness (one employee per principal, per tenant)
CREATE UNIQUE INDEX IF NOT EXISTS employee_principal_uq
    ON master.employee (tenant_id, principal_id)
    WHERE principal_id IS NOT NULL;

-- ── master.commodity_category ────────────────────────────────────────────────
ALTER TABLE master.commodity_category DROP CONSTRAINT IF EXISTS ccat_tenant_fk;
DO $$ BEGIN ALTER TABLE master.commodity_category ADD CONSTRAINT ccat_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.commodity_category ADD CONSTRAINT ccat_parent_fk
    FOREIGN KEY (tenant_id, parent_id) REFERENCES master.commodity_category (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.commodity_category ADD CONSTRAINT ccat_root_category_fk
    FOREIGN KEY (tenant_id, root_category_id) REFERENCES master.commodity_category (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.commodity_category ADD CONSTRAINT ccat_uom_fk
    FOREIGN KEY (uom_code) REFERENCES shared.uom (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.commodity_category ADD CONSTRAINT ccat_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- ── master.product ─────────────────────────────────────────────────────────
ALTER TABLE master.product DROP CONSTRAINT IF EXISTS prod_tenant_fk;
DO $$ BEGIN ALTER TABLE master.product ADD CONSTRAINT prod_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.product ADD CONSTRAINT prod_commodity_category_fk
    FOREIGN KEY (tenant_id, commodity_category_id) REFERENCES master.commodity_category (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.product ADD CONSTRAINT prod_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.product ADD CONSTRAINT prod_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- SKU: case-insensitive partial unique
CREATE UNIQUE INDEX IF NOT EXISTS product_tenant_sku_uq
    ON master.product (tenant_id, lower(sku)) WHERE sku IS NOT NULL;

-- ── master.item ─────────────────────────────────────────────────────
ALTER TABLE master.item DROP CONSTRAINT IF EXISTS im_tenant_fk;
DO $$ BEGIN ALTER TABLE master.item ADD CONSTRAINT im_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.item ADD CONSTRAINT im_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.item ADD CONSTRAINT im_product_fk
    FOREIGN KEY (tenant_id, product_id) REFERENCES master.product (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.item ADD CONSTRAINT im_commodity_category_fk
    FOREIGN KEY (tenant_id, commodity_category_id) REFERENCES master.commodity_category (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.item ADD CONSTRAINT im_uom_fk
    FOREIGN KEY (uom_code) REFERENCES shared.uom (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.item ADD CONSTRAINT im_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.spend_category ──────────────────────────────────────────────────
ALTER TABLE master.spend_category DROP CONSTRAINT IF EXISTS sc_tenant_fk;
DO $$ BEGIN ALTER TABLE master.spend_category ADD CONSTRAINT sc_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.spend_category ADD CONSTRAINT sc_parent_fk
    FOREIGN KEY (tenant_id, parent_id) REFERENCES master.spend_category (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.spend_category ADD CONSTRAINT sc_root_category_fk
    FOREIGN KEY (tenant_id, root_category_id) REFERENCES master.spend_category (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.spend_category ADD CONSTRAINT sc_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.spend_category ADD CONSTRAINT sc_default_intent_fk
    FOREIGN KEY (default_intent_id) REFERENCES master.business_intent (id)
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.company_code_spend_policy ────────────────────────────────────
-- ── master.commodity_classification ────────────────────────────────────────
ALTER TABLE master.commodity_classification DROP CONSTRAINT IF EXISTS cc_tenant_fk;
DO $$ BEGIN ALTER TABLE master.commodity_classification ADD CONSTRAINT cc_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.commodity_classification ADD CONSTRAINT cc_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Note: code_id FK is polymorphic (→ commodity_code or → industry_code)
-- validated by fn_trg_cc_validate_code() trigger, not a declarative FK.
-- owner_id FK is polymorphic, validated by fn_trg_cc_validate_owner() trigger.

-- ── master.company_code_customer_profile (§BP4 — per-CC AR settings) ──────────
ALTER TABLE master.company_code_customer_profile DROP CONSTRAINT IF EXISTS ccp_tenant_fk;
DO $$ BEGIN ALTER TABLE master.company_code_customer_profile ADD CONSTRAINT ccp_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code_customer_profile ADD CONSTRAINT ccp_customer_fk
    FOREIGN KEY (tenant_id, customer_id) REFERENCES master.customer (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code_customer_profile ADD CONSTRAINT ccp_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code_customer_profile ADD CONSTRAINT ccp_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- ccp_ar_gl_fk removed: ar_gl_account_id column dropped (H12 — use default_accounting_profile_id)
DO $$ BEGIN ALTER TABLE master.company_code_customer_profile ADD CONSTRAINT ccp_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- company_code_customer_profile extended FKs (profile extension)
-- accounting_profile FK uses undefined_table guard — master.accounting_profile not yet created
DO $$ BEGIN
    ALTER TABLE master.company_code_customer_profile ADD CONSTRAINT ccp_accounting_profile_fk
        FOREIGN KEY (tenant_id, default_accounting_profile_id)
        REFERENCES master.accounting_profile (tenant_id, id) ON DELETE SET NULL;
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_table  THEN NULL;
END $$;

DO $$ BEGIN ALTER TABLE master.company_code_customer_profile ADD CONSTRAINT ccp_tax_group_fk
    FOREIGN KEY (tenant_id, tax_group_id)
    REFERENCES control.tax_group (tenant_id, id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.company_code_customer_profile ADD CONSTRAINT ccp_dimension_set_fk
    FOREIGN KEY (tenant_id, default_dimension_set_id)
    REFERENCES master.dimension_set (tenant_id, id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.company_code_customer_profile ADD CONSTRAINT ccp_receipt_method_fk
    FOREIGN KEY (tenant_id, default_receipt_method_id)
    REFERENCES master.payment_method (tenant_id, id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- dunning_policy_id: FUTURE ANCHOR — no FK target yet.

-- ── master.company_code_supplier_profile (§BP5 — per-CC AP settings) ──────────
ALTER TABLE master.company_code_supplier_profile DROP CONSTRAINT IF EXISTS scp_tenant_fk;
DO $$ BEGIN ALTER TABLE master.company_code_supplier_profile ADD CONSTRAINT scp_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code_supplier_profile ADD CONSTRAINT scp_supplier_fk
    FOREIGN KEY (tenant_id, supplier_id) REFERENCES master.supplier (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code_supplier_profile ADD CONSTRAINT scp_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code_supplier_profile ADD CONSTRAINT scp_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code_supplier_profile ADD CONSTRAINT scp_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- company_code_supplier_profile extended FKs (profile extension)
-- accounting_profile FK uses undefined_table guard — master.accounting_profile not yet created
DO $$ BEGIN
    ALTER TABLE master.company_code_supplier_profile ADD CONSTRAINT scp_accounting_profile_fk
        FOREIGN KEY (tenant_id, default_accounting_profile_id)
        REFERENCES master.accounting_profile (tenant_id, id) ON DELETE SET NULL;
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_table  THEN NULL;
END $$;

DO $$ BEGIN ALTER TABLE master.company_code_supplier_profile ADD CONSTRAINT scp_payment_method_id_fk
    FOREIGN KEY (tenant_id, payment_method_id)
    REFERENCES master.payment_method (tenant_id, id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ON DELETE SET NULL on a composite (tenant_id, col) FK nulls tenant_id too — NOT NULL violation.
-- Fix: drop and recreate without the action. Callers must nullify the column before deleting.
ALTER TABLE master.company_code_supplier_profile DROP CONSTRAINT IF EXISTS scp_remittance_bank_link_fk;
DO $$ BEGIN ALTER TABLE master.company_code_supplier_profile ADD CONSTRAINT scp_remittance_bank_link_fk
    FOREIGN KEY (tenant_id, preferred_remittance_bank_link_id)
    REFERENCES master.bank_account_link (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE master.company_code_supplier_profile DROP CONSTRAINT IF EXISTS scp_tax_group_fk;
DO $$ BEGIN ALTER TABLE master.company_code_supplier_profile ADD CONSTRAINT scp_tax_group_fk
    FOREIGN KEY (tenant_id, tax_group_id)
    REFERENCES control.tax_group (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.company_code_supplier_profile ADD CONSTRAINT scp_dimension_set_fk
    FOREIGN KEY (tenant_id, default_dimension_set_id)
    REFERENCES master.dimension_set (tenant_id, id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- invoice_hold_policy_id: FUTURE ANCHOR — no FK target yet.

-- ── master.principal_identity_binding ──────────────────────────────────────────
-- pib_tenant_id_uq UNIQUE (tenant_id, id) was redundant — id is already a global PK
-- and no FK targets (tenant_id, id) on this table. Dropped here for existing DBs.
ALTER TABLE master.principal_identity_binding DROP CONSTRAINT IF EXISTS pib_tenant_id_uq;

DO $$ BEGIN ALTER TABLE master.principal_identity_binding ADD CONSTRAINT pib_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.principal_identity_binding ADD CONSTRAINT pib_principal_fk
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES master.principal (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Migrate sync_status to shared.keycloak_sync_status_d domain.
-- Drops the inline CHECK and re-types the column; all existing values are valid.
ALTER TABLE master.principal_identity_binding DROP CONSTRAINT IF EXISTS pib_sync_status_chk;
ALTER TABLE master.principal_identity_binding
    ALTER COLUMN sync_status TYPE shared.keycloak_sync_status_d
    USING sync_status::text;

-- 06_constraints/003c_master_extended.sql
-- Depends on: 04_tables/003c_master_extended.sql
-- FK constraints (Part C): asset management, dimensions, business intent, tax, FX, budgets, banking, and payments.


-- ══════════════════════════════════════════════════════════════════════════════
-- ASSET MANAGEMENT MODULE — Foreign Key Constraints
-- ══════════════════════════════════════════════════════════════════════════════

-- ── master.asset_class ──────────────────────────────────────────────────────
ALTER TABLE master.asset_class DROP CONSTRAINT IF EXISTS ac_tenant_fk;
DO $$ BEGIN ALTER TABLE master.asset_class ADD CONSTRAINT ac_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.asset_class ADD CONSTRAINT ac_parent_fk
    FOREIGN KEY (tenant_id, parent_id) REFERENCES master.asset_class (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.asset_class ADD CONSTRAINT ac_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.asset_class ADD CONSTRAINT ac_uom_fk
    FOREIGN KEY (default_uom_code) REFERENCES shared.uom (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── control.asset_class_book_policy ────────────────────────────────────────
DO $$ BEGIN ALTER TABLE control.asset_class_book_policy ADD CONSTRAINT acbp_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.asset_class_book_policy ADD CONSTRAINT acbp_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.asset_class_book_policy ADD CONSTRAINT acbp_class_fk
    FOREIGN KEY (tenant_id, asset_class_id) REFERENCES master.asset_class (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.asset_class_book_policy ADD CONSTRAINT acbp_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.asset ────────────────────────────────────────────────────────────
ALTER TABLE master.asset DROP CONSTRAINT IF EXISTS asset_tenant_fk;
DO $$ BEGIN ALTER TABLE master.asset ADD CONSTRAINT asset_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.asset ADD CONSTRAINT asset_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.asset ADD CONSTRAINT asset_class_fk
    FOREIGN KEY (tenant_id, asset_class_id) REFERENCES master.asset_class (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.asset ADD CONSTRAINT asset_cc_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.asset ADD CONSTRAINT asset_cost_center_fk
    FOREIGN KEY (tenant_id, cost_center_id) REFERENCES master.cost_center (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.asset ADD CONSTRAINT asset_profit_center_fk
    FOREIGN KEY (tenant_id, profit_center_id) REFERENCES master.profit_center (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.asset ADD CONSTRAINT asset_project_fk
    FOREIGN KEY (tenant_id, project_id) REFERENCES master.project (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.asset ADD CONSTRAINT asset_site_fk
    FOREIGN KEY (tenant_id, site_id) REFERENCES master.site (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    -- Column renamed vendor_id → supplier_id by P3 migration; handle both names.
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'master' AND table_name = 'asset'
                 AND column_name = 'supplier_id') THEN
        ALTER TABLE master.asset ADD CONSTRAINT asset_supplier_fk
            FOREIGN KEY (tenant_id, supplier_id) REFERENCES master.supplier (tenant_id, id);
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'master' AND table_name = 'asset'
                    AND column_name = 'vendor_id') THEN
        ALTER TABLE master.asset ADD CONSTRAINT asset_vendor_fk
            FOREIGN KEY (tenant_id, vendor_id) REFERENCES master.supplier (tenant_id, id);
    END IF;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.asset ADD CONSTRAINT asset_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.asset ADD CONSTRAINT asset_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.asset_book ───────────────────────────────────────────────────────
ALTER TABLE master.asset_book DROP CONSTRAINT IF EXISTS ab_tenant_fk;
DO $$ BEGIN ALTER TABLE master.asset_book ADD CONSTRAINT ab_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.asset_book ADD CONSTRAINT ab_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.asset_book ADD CONSTRAINT ab_asset_fk
    FOREIGN KEY (tenant_id, asset_id) REFERENCES master.asset (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.asset_book ADD CONSTRAINT ab_book_fk
    FOREIGN KEY (tenant_id, book_id) REFERENCES master.ledger_book (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.asset_book ADD CONSTRAINT ab_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.asset_book ADD CONSTRAINT ab_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.asset_component ──────────────────────────────────────────────────
ALTER TABLE master.asset_component DROP CONSTRAINT IF EXISTS acomp_tenant_fk;
DO $$ BEGIN ALTER TABLE master.asset_component ADD CONSTRAINT acomp_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.asset_component ADD CONSTRAINT acomp_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.asset_component ADD CONSTRAINT acomp_parent_fk
    FOREIGN KEY (tenant_id, parent_asset_id) REFERENCES master.asset (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.asset_component ADD CONSTRAINT acomp_child_fk
    FOREIGN KEY (tenant_id, component_asset_id) REFERENCES master.asset (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.asset_component ADD CONSTRAINT acomp_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.asset_component ADD CONSTRAINT acomp_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.asset_assignment_history ─────────────────────────────────────────
ALTER TABLE master.asset_assignment_history DROP CONSTRAINT IF EXISTS aah_tenant_fk;
DO $$ BEGIN ALTER TABLE master.asset_assignment_history ADD CONSTRAINT aah_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.asset_assignment_history ADD CONSTRAINT aah_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.asset_assignment_history ADD CONSTRAINT aah_asset_fk
    FOREIGN KEY (tenant_id, asset_id) REFERENCES master.asset (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.asset_assignment_history ADD CONSTRAINT aah_assigned_by_fk
    FOREIGN KEY (assigned_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.asset_assignment_history ADD CONSTRAINT aah_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── §DIM1  master.dimension_type ─────────────────────────────────────────────
DO $$ BEGIN ALTER TABLE master.dimension_type ADD CONSTRAINT dt_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── §DIM2  master.dimension_value ────────────────────────────────────────────
DO $$ BEGIN ALTER TABLE master.dimension_value ADD CONSTRAINT dv_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Composite FK — dimension_value belongs to dimension_type within the same tenant
DO $$ BEGIN ALTER TABLE master.dimension_value ADD CONSTRAINT dv_type_fk
    FOREIGN KEY (tenant_id, dimension_type_id)
    REFERENCES master.dimension_type (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Self-referencing hierarchy — DEFERRABLE for bulk inserts seeding a full tree
DO $$ BEGIN ALTER TABLE master.dimension_value ADD CONSTRAINT dv_parent_fk
    FOREIGN KEY (parent_id) REFERENCES master.dimension_value (id) ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.dimension_value ADD CONSTRAINT dv_company_fk
    FOREIGN KEY (company_code_id) REFERENCES master.company_code (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── §DIM3  master.dimension_set_item ─────────────────────────────────────────
-- Composite FK — set_item belongs to dimension_set within the same tenant
DO $$ BEGIN ALTER TABLE master.dimension_set_item ADD CONSTRAINT dsi_set_fk
    FOREIGN KEY (tenant_id, dimension_set_id)
    REFERENCES master.dimension_set (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.dimension_set_item ADD CONSTRAINT dsi_type_fk
    FOREIGN KEY (tenant_id, dimension_type_id)
    REFERENCES master.dimension_type (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.dimension_set_item ADD CONSTRAINT dsi_value_fk
    FOREIGN KEY (tenant_id, dimension_value_id)
    REFERENCES master.dimension_value (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── §11-13  snapshot.* ───────────────────────────────────────────────────────
DO $$ BEGIN ALTER TABLE snapshot.lifecycle_version ADD CONSTRAINT lv_lifecycle_fk
    FOREIGN KEY (lifecycle_id) REFERENCES control.lifecycle (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- =============================================================================
-- OU + INTENT + CLASSIFICATION ENGINE — FK constraints
-- =============================================================================

-- ── §SCCP-ALT  master.company_code_spend_policy.default_intent_id ──────────
-- Deferred FK (business_intent defined below in §BI).
-- ── §BI  master.business_intent ──────────────────────────────────────────────
DO $$ BEGIN ALTER TABLE master.business_intent ADD CONSTRAINT bi_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tenant-composite self-referencing parent FK (cross-tenant hierarchy blocked)
DO $$ BEGIN ALTER TABLE master.business_intent ADD CONSTRAINT bi_parent_fk
    FOREIGN KEY (tenant_id, parent_id)
    REFERENCES master.business_intent (tenant_id, id)
    ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── §CCIP  master.company_code_intent_policy ─────────────────────────────────
-- ── §CCDD  master.company_code_dimension_default ──────────────────────────────
DO $$ BEGIN ALTER TABLE master.company_code_dimension_default ADD CONSTRAINT ccdd_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.company_code_dimension_default ADD CONSTRAINT ccdd_cc_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.company_code_dimension_default ADD CONSTRAINT ccdd_type_fk
    FOREIGN KEY (tenant_id, dimension_type_id)
    REFERENCES master.dimension_type (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.company_code_dimension_default ADD CONSTRAINT ccdd_value_fk
    FOREIGN KEY (tenant_id, dimension_value_id)
    REFERENCES master.dimension_value (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── master.tax_jurisdiction ──────────────────────────────────────────────────
DO $$ BEGIN ALTER TABLE master.tax_jurisdiction ADD CONSTRAINT tj_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.tax_jurisdiction ADD CONSTRAINT tj_parent_fk
    FOREIGN KEY (tenant_id, parent_id)
    REFERENCES master.tax_jurisdiction (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.tax_jurisdiction ADD CONSTRAINT tj_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.tax_jurisdiction ADD CONSTRAINT tj_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.company_code — tax_jurisdiction_id FK (was referenced but undefined) ──
DO $$ BEGIN ALTER TABLE master.company_code ADD CONSTRAINT cc_tax_jurisdiction_fk
    FOREIGN KEY (tenant_id, tax_jurisdiction_id)
    REFERENCES master.tax_jurisdiction (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.tax_type ──────────────────────────────────────────────────────────
DO $$ BEGIN ALTER TABLE master.tax_type ADD CONSTRAINT tt_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.tax_type ADD CONSTRAINT tt_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.fx_rate ───────────────────────────────────────────────────────────
DO $$ BEGIN ALTER TABLE master.fx_rate ADD CONSTRAINT fxr_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.fx_rate ADD CONSTRAINT fxr_from_currency_fk
    FOREIGN KEY (from_currency) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.fx_rate ADD CONSTRAINT fxr_to_currency_fk
    FOREIGN KEY (to_currency) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.fx_rate ADD CONSTRAINT fxr_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.product — default_tax_group_id FK ─────────────────────────────────
DO $$ BEGIN ALTER TABLE master.product ADD CONSTRAINT product_default_tax_group_fk
    FOREIGN KEY (tenant_id, default_tax_group_id)
    REFERENCES control.tax_group (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── master.company_code_supplier_profile — default_wht_tax_group_id FK ────────────
DO $$ BEGIN ALTER TABLE master.company_code_supplier_profile ADD CONSTRAINT scp_default_wht_tax_group_fk
    FOREIGN KEY (tenant_id, default_wht_tax_group_id)
    REFERENCES control.tax_group (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- BUDGET · COMMITMENT · PLANNING ENGINE — Master FK constraints
-- ══════════════════════════════════════════════════════════════════════════════

-- ── master.budget_profile ────────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE master.budget_profile
        ADD CONSTRAINT fk_bp_tenant
            FOREIGN KEY (tenant_id) REFERENCES master.tenant (id)
            ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE master.budget_profile
        ADD CONSTRAINT fk_bp_parent_profile
            FOREIGN KEY (tenant_id, parent_profile_id)
                REFERENCES master.budget_profile (tenant_id, id)
            ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE master.budget_profile
        ADD CONSTRAINT fk_bp_company_code
            FOREIGN KEY (company_code_id) REFERENCES master.company_code (id)
            ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.budget_allocation ─────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE master.budget_allocation
        ADD CONSTRAINT fk_ba_tenant
            FOREIGN KEY (tenant_id) REFERENCES master.tenant (id)
            ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE master.budget_allocation
        ADD CONSTRAINT fk_ba_profile
            FOREIGN KEY (tenant_id, budget_profile_id)
                REFERENCES master.budget_profile (tenant_id, id)
            ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE master.budget_allocation
        ADD CONSTRAINT fk_ba_company_code
            FOREIGN KEY (company_code_id) REFERENCES master.company_code (id)
            ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE master.budget_allocation
        ADD CONSTRAINT fk_ba_carry_forward
            FOREIGN KEY (tenant_id, carry_forward_from_id)
                REFERENCES master.budget_allocation (tenant_id, id)
            ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.planning_model ─────────────────────────────────────────────────────
DO $$ BEGIN
    ALTER TABLE master.planning_model
        ADD CONSTRAINT fk_pm_tenant
            FOREIGN KEY (tenant_id) REFERENCES master.tenant (id)
            ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE master.planning_model
        ADD CONSTRAINT fk_pm_based_on
            FOREIGN KEY (tenant_id, based_on_model_id)
                REFERENCES master.planning_model (tenant_id, id)
            ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── §BK1 bank_party ─────────────────────────────────────────────────────────

DO $$ BEGIN
    ALTER TABLE master.bank_party ADD CONSTRAINT bank_party_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE master.bank_party ADD CONSTRAINT bank_party_country_fk
        FOREIGN KEY (country_code) REFERENCES shared.country (code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── §BK2 bank_account ───────────────────────────────────────────────────────

DO $$ BEGIN
    ALTER TABLE master.bank_account ADD CONSTRAINT bank_account_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE master.bank_account ADD CONSTRAINT bank_account_bank_party_fk
        FOREIGN KEY (tenant_id, bank_party_id)
        REFERENCES master.bank_party (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE master.bank_account ADD CONSTRAINT bank_account_currency_fk
        FOREIGN KEY (currency_code) REFERENCES shared.currency (code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE master.bank_account ADD CONSTRAINT bank_account_correspondent_fk
        FOREIGN KEY (tenant_id, correspondent_bank_party_id)
        REFERENCES master.bank_party (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── §BK3 bank_account_link ──────────────────────────────────────────────────

DO $$ BEGIN
    ALTER TABLE master.bank_account_link ADD CONSTRAINT bal_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE master.bank_account_link ADD CONSTRAINT bal_bank_account_fk
        FOREIGN KEY (tenant_id, bank_account_id)
        REFERENCES master.bank_account (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE master.bank_account_link ADD CONSTRAINT bal_company_code_fk
        FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── §BK4 bank_account_house_config ──────────────────────────────────────────

DO $$ BEGIN
    ALTER TABLE master.bank_account_house_config ADD CONSTRAINT bahc_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE master.bank_account_house_config ADD CONSTRAINT bahc_link_fk
        FOREIGN KEY (tenant_id, bank_account_link_id)
        REFERENCES master.bank_account_link (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE master.bank_account_house_config ADD CONSTRAINT bahc_gl_account_fk
        FOREIGN KEY (tenant_id, gl_account_id)
        REFERENCES master.gl_account (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── §PM1 payment_method ─────────────────────────────────────────────────────

DO $$ BEGIN
    ALTER TABLE master.payment_method ADD CONSTRAINT payment_method_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE master.payment_method ADD CONSTRAINT payment_method_status_chk
        CHECK (status IN ('active', 'inactive', 'archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- 06_constraints/003d_master_payment_terms.sql
-- Depends on: 04_tables/003d_master_payment_terms.sql, 04_tables/003_master.sql,
--             04_tables/004_document.sql, 04_tables/005_ledger.sql,
--             01_foundation (shared.country, shared.currency)
-- FK constraints for payment terms & holiday calendar module. Idempotent via DO blocks.

-- ============================================================================
-- §HC1  master.holiday_calendar
-- ============================================================================

-- hc.tenant_id → master.tenant
DO $$ BEGIN ALTER TABLE master.holiday_calendar ADD CONSTRAINT hc_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- hc.country_code → shared.country
DO $$ BEGIN ALTER TABLE master.holiday_calendar ADD CONSTRAINT hc_country_fk
    FOREIGN KEY (country_code) REFERENCES shared.country (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- hc.company_code_id → master.company_code (tenant-scoped)
DO $$ BEGIN ALTER TABLE master.holiday_calendar ADD CONSTRAINT hc_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- hc.legal_entity_id → master.legal_entity (tenant-scoped)
DO $$ BEGIN ALTER TABLE master.holiday_calendar ADD CONSTRAINT hc_legal_entity_fk
    FOREIGN KEY (tenant_id, legal_entity_id)
    REFERENCES master.legal_entity (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- hc.site_id → master.site (tenant-scoped)
DO $$ BEGIN ALTER TABLE master.holiday_calendar ADD CONSTRAINT hc_site_fk
    FOREIGN KEY (tenant_id, site_id)
    REFERENCES master.site (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- hc.created_by → master.principal
DO $$ BEGIN ALTER TABLE master.holiday_calendar ADD CONSTRAINT hc_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
-- §HC2  master.holiday_calendar_day
-- ============================================================================

-- hcd.tenant_id → master.tenant
DO $$ BEGIN ALTER TABLE master.holiday_calendar_day ADD CONSTRAINT hcd_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- hcd.holiday_calendar_id → master.holiday_calendar (tenant-scoped)
DO $$ BEGIN ALTER TABLE master.holiday_calendar_day ADD CONSTRAINT hcd_calendar_fk
    FOREIGN KEY (tenant_id, holiday_calendar_id)
    REFERENCES master.holiday_calendar (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- hcd.created_by → master.principal
DO $$ BEGIN ALTER TABLE master.holiday_calendar_day ADD CONSTRAINT hcd_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
-- §PT1  master.payment_term
-- ============================================================================

-- pt.tenant_id → master.tenant
DO $$ BEGIN ALTER TABLE master.payment_term ADD CONSTRAINT pt_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- pt.supersedes_payment_term_id → master.payment_term (tenant-scoped self-FK)
DO $$ BEGIN ALTER TABLE master.payment_term ADD CONSTRAINT pt_supersedes_fk
    FOREIGN KEY (tenant_id, supersedes_payment_term_id)
    REFERENCES master.payment_term (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- pt.holiday_calendar_id → master.holiday_calendar (tenant-scoped)
DO $$ BEGIN ALTER TABLE master.payment_term ADD CONSTRAINT pt_calendar_fk
    FOREIGN KEY (tenant_id, holiday_calendar_id)
    REFERENCES master.holiday_calendar (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- pt.created_by → master.principal
DO $$ BEGIN ALTER TABLE master.payment_term ADD CONSTRAINT pt_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
-- §PT2  master.payment_term_clause
-- ============================================================================

-- ptc.tenant_id → master.tenant
DO $$ BEGIN ALTER TABLE master.payment_term_clause ADD CONSTRAINT ptc_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ptc.payment_term_id → master.payment_term (tenant-scoped)
DO $$ BEGIN ALTER TABLE master.payment_term_clause ADD CONSTRAINT ptc_term_fk
    FOREIGN KEY (tenant_id, payment_term_id)
    REFERENCES master.payment_term (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ptc.settles_clause_code → master.payment_term_clause (tenant-scoped self-FK)
DO $$ BEGIN ALTER TABLE master.payment_term_clause ADD CONSTRAINT ptc_settles_fk
    FOREIGN KEY (tenant_id, payment_term_id, settles_clause_code)
    REFERENCES master.payment_term_clause (tenant_id, payment_term_id, clause_code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ptc.currency_code → shared.currency
DO $$ BEGIN ALTER TABLE master.payment_term_clause ADD CONSTRAINT ptc_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ptc.created_by → master.principal
DO $$ BEGIN ALTER TABLE master.payment_term_clause ADD CONSTRAINT ptc_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
-- §PT3  master.payment_term_discount_tier
-- ============================================================================

-- ptdt.tenant_id → master.tenant
DO $$ BEGIN ALTER TABLE master.payment_term_discount_tier ADD CONSTRAINT ptdt_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ptdt.payment_term_id → master.payment_term (tenant-scoped)
DO $$ BEGIN ALTER TABLE master.payment_term_discount_tier ADD CONSTRAINT ptdt_term_fk
    FOREIGN KEY (tenant_id, payment_term_id)
    REFERENCES master.payment_term (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ptdt.currency_code → shared.currency
DO $$ BEGIN ALTER TABLE master.payment_term_discount_tier ADD CONSTRAINT ptdt_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ptdt.created_by → master.principal
DO $$ BEGIN ALTER TABLE master.payment_term_discount_tier ADD CONSTRAINT ptdt_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;




-- ── scp.payment_term_id → master.payment_term ────────────────────────────────
DO $$ BEGIN ALTER TABLE master.company_code_supplier_profile ADD CONSTRAINT scp_payment_term_fk
    FOREIGN KEY (tenant_id, payment_term_id)
    REFERENCES master.payment_term (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── ccp.payment_term_id → master.payment_term ────────────────────────────────
DO $$ BEGIN ALTER TABLE master.company_code_customer_profile ADD CONSTRAINT ccp_payment_term_fk
    FOREIGN KEY (tenant_id, payment_term_id)
    REFERENCES master.payment_term (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- 06_constraints/003f_master_cms.sql
-- Depends on: 04_tables/003f_master_cms.sql, 04_tables/009a_snapshot_cms.sql
-- FK constraints for CMS tables.
--
-- Notes:
--   content_item.parent_id    — self-referential within master (same schema)
--   content_item.current_version_id → snapshot.content_item_version
--       DEFERRABLE INITIALLY DEFERRED: item + first version inserted atomically.
--   snapshot.content_item_version.content_item_id → master.content_item
--       non-deferrable; snapshot inserted after item exists.

-- ── master.content_item ──────────────────────────────────────────────────────
ALTER TABLE master.content_item DROP CONSTRAINT IF EXISTS content_item_tenant_fk;
DO $$ BEGIN ALTER TABLE master.content_item ADD CONSTRAINT content_item_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE master.content_item DROP CONSTRAINT IF EXISTS content_item_parent_fk;
DO $$ BEGIN ALTER TABLE master.content_item ADD CONSTRAINT content_item_parent_fk
    FOREIGN KEY (tenant_id, parent_id) REFERENCES master.content_item (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE master.content_item DROP CONSTRAINT IF EXISTS content_item_created_by_fk;
DO $$ BEGIN ALTER TABLE master.content_item ADD CONSTRAINT content_item_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Circular FK: master.content_item → snapshot.content_item_version
-- DEFERRABLE INITIALLY DEFERRED allows inserting item + first version atomically.
ALTER TABLE master.content_item DROP CONSTRAINT IF EXISTS content_item_current_version_fk;
DO $$ BEGIN ALTER TABLE master.content_item ADD CONSTRAINT content_item_current_version_fk
    FOREIGN KEY (current_version_id)
    REFERENCES snapshot.content_item_version (id)
    ON DELETE SET NULL
    DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Audit pair: updated_at and updated_by must both be set or both be NULL.
DO $$ BEGIN ALTER TABLE master.content_item ADD CONSTRAINT content_item_audit_pair_chk
    CHECK ((updated_at IS NULL) = (updated_by IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.content_item_link ─────────────────────────────────────────────────
ALTER TABLE master.content_item_link DROP CONSTRAINT IF EXISTS cil_tenant_fk;
DO $$ BEGIN ALTER TABLE master.content_item_link ADD CONSTRAINT cil_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE master.content_item_link DROP CONSTRAINT IF EXISTS cil_source_fk;
DO $$ BEGIN ALTER TABLE master.content_item_link ADD CONSTRAINT cil_source_fk
    FOREIGN KEY (tenant_id, source_content_item_id)
    REFERENCES master.content_item (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE master.content_item_link DROP CONSTRAINT IF EXISTS cil_target_fk;
DO $$ BEGIN ALTER TABLE master.content_item_link ADD CONSTRAINT cil_target_fk
    FOREIGN KEY (tenant_id, target_content_item_id)
    REFERENCES master.content_item (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE master.content_item_link DROP CONSTRAINT IF EXISTS cil_created_by_fk;
DO $$ BEGIN ALTER TABLE master.content_item_link ADD CONSTRAINT cil_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.content_item_access_grant ────────────────────────────────────────
ALTER TABLE master.content_item_access_grant DROP CONSTRAINT IF EXISTS ciag_tenant_fk;
DO $$ BEGIN ALTER TABLE master.content_item_access_grant ADD CONSTRAINT ciag_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE master.content_item_access_grant DROP CONSTRAINT IF EXISTS ciag_content_item_fk;
DO $$ BEGIN ALTER TABLE master.content_item_access_grant ADD CONSTRAINT ciag_content_item_fk
    FOREIGN KEY (tenant_id, content_item_id)
    REFERENCES master.content_item (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE master.content_item_access_grant DROP CONSTRAINT IF EXISTS ciag_created_by_fk;
DO $$ BEGIN ALTER TABLE master.content_item_access_grant ADD CONSTRAINT ciag_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- §EF-ALIGN  Columns not yet in CREATE TABLE DDL — add idempotently.
--            BP-first rewrite: customer/supplier/legal_entity columns are now
--            in their base DDL (01h_tables_business_partner.sql, 01b_tables_finance.sql).
-- =============================================================================

-- ── master.company_code — accounting boundary extensions ──────────────────────
-- local_currency_id, accounting_currency_id, chart_of_account_id, company_code_type
-- are not yet in the CREATE TABLE DDL; added here idempotently.
-- NOTE: timezone_code is in the CREATE TABLE as of BP-first rewrite — DO NOT add
-- a second `timezone` column here.
DO $$ BEGIN ALTER TABLE master.company_code ADD COLUMN local_currency_id uuid;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code ADD COLUMN accounting_currency_id uuid;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code ADD COLUMN chart_of_account_id uuid;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code ADD COLUMN company_code_type text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- ── master.gl_account — posting controls and typing ───────────────────────────
DO $$ BEGIN ALTER TABLE master.gl_account ADD COLUMN account_type_id uuid;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.gl_account ADD COLUMN is_reconciling boolean NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.gl_account ADD COLUMN is_blocked boolean NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.gl_account ADD COLUMN posting_level text;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- ── master.chart_of_account — structural metadata ────────────────────────────
DO $$ BEGIN ALTER TABLE master.chart_of_account ADD COLUMN base_currency_id uuid;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.chart_of_account ADD COLUMN account_level_count smallint;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.chart_of_account ADD COLUMN is_default boolean NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;


-- =============================================================================
-- §PQ  Party qualification tables + IAM binding + network link
--      (01i_tables_party_master.sql)
-- =============================================================================

-- ── master.supplier_qualification (§PQ1) ─────────────────────────────────────
ALTER TABLE master.supplier_qualification DROP CONSTRAINT IF EXISTS sq_tenant_fk;
DO $$ BEGIN ALTER TABLE master.supplier_qualification ADD CONSTRAINT sq_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.supplier_qualification ADD CONSTRAINT sq_supplier_fk
    FOREIGN KEY (tenant_id, supplier_id)
    REFERENCES master.supplier (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.supplier_qualification ADD CONSTRAINT sq_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.customer_qualification (§PQ2) ─────────────────────────────────────
ALTER TABLE master.customer_qualification DROP CONSTRAINT IF EXISTS cq_tenant_fk;
DO $$ BEGIN ALTER TABLE master.customer_qualification ADD CONSTRAINT cq_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.customer_qualification ADD CONSTRAINT cq_customer_fk
    FOREIGN KEY (tenant_id, customer_id)
    REFERENCES master.customer (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.customer_qualification ADD CONSTRAINT cq_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.business_partner_network_link (§PQ3) ───────────────────────────────
ALTER TABLE master.business_partner_network_link DROP CONSTRAINT IF EXISTS bpnl_tenant_fk;
DO $$ BEGIN ALTER TABLE master.business_partner_network_link ADD CONSTRAINT bpnl_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.business_partner_network_link ADD CONSTRAINT bpnl_bp_fk
    FOREIGN KEY (tenant_id, business_partner_id)
    REFERENCES master.business_partner (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.business_partner_network_link ADD CONSTRAINT bpnl_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.legal_entity_identity_binding (§PQ4) ───────────────────────────────
-- BP 360 governance relation soft links.
ALTER TABLE master.party_governance_relation DROP CONSTRAINT IF EXISTS pgr_tenant_fk;
DO $$ BEGIN ALTER TABLE master.party_governance_relation ADD CONSTRAINT pgr_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.party_governance_relation ADD CONSTRAINT pgr_member_bp_fk
    FOREIGN KEY (tenant_id, member_business_partner_id)
    REFERENCES master.business_partner (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.party_governance_relation ADD CONSTRAINT pgr_evidence_attachment_fk
    FOREIGN KEY (evidence_attachment_id)
    REFERENCES master.attachment (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.party_governance_relation ADD CONSTRAINT pgr_reviewed_by_fk
    FOREIGN KEY (reviewed_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.party_governance_relation ADD CONSTRAINT pgr_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE master.legal_entity_identity_binding DROP CONSTRAINT IF EXISTS leib_tenant_fk;
DO $$ BEGIN ALTER TABLE master.legal_entity_identity_binding ADD CONSTRAINT leib_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.legal_entity_identity_binding ADD CONSTRAINT leib_legal_entity_fk
    FOREIGN KEY (tenant_id, legal_entity_id)
    REFERENCES master.legal_entity (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.legal_entity_identity_binding ADD CONSTRAINT leib_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.legal_entity_business_partner_link (§F99) ──────────────────────────
ALTER TABLE master.legal_entity_business_partner_link DROP CONSTRAINT IF EXISTS lebpl_tenant_fk;
DO $$ BEGIN ALTER TABLE master.legal_entity_business_partner_link ADD CONSTRAINT lebpl_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE master.legal_entity_business_partner_link DROP CONSTRAINT IF EXISTS lebpl_legal_entity_fk;
DO $$ BEGIN ALTER TABLE master.legal_entity_business_partner_link ADD CONSTRAINT lebpl_legal_entity_fk
    FOREIGN KEY (tenant_id, legal_entity_id)
    REFERENCES master.legal_entity (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- FK to business_partner added here (loaded after 01h which drops/recreates business_partner)
ALTER TABLE master.legal_entity_business_partner_link DROP CONSTRAINT IF EXISTS lebpl_business_partner_fk;
DO $$ BEGIN ALTER TABLE master.legal_entity_business_partner_link ADD CONSTRAINT lebpl_business_partner_fk
    FOREIGN KEY (tenant_id, business_partner_id)
    REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.legal_entity_business_partner_link ADD CONSTRAINT lebpl_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.intercompany_trading_pair (§IC1) ───────────────────────────────────
ALTER TABLE master.intercompany_trading_pair DROP CONSTRAINT IF EXISTS ictp_tenant_fk;
DO $$ BEGIN ALTER TABLE master.intercompany_trading_pair ADD CONSTRAINT ictp_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE master.intercompany_trading_pair DROP CONSTRAINT IF EXISTS ictp_source_cc_fk;
DO $$ BEGIN ALTER TABLE master.intercompany_trading_pair ADD CONSTRAINT ictp_source_cc_fk
    FOREIGN KEY (tenant_id, source_company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE master.intercompany_trading_pair DROP CONSTRAINT IF EXISTS ictp_counterparty_cc_fk;
DO $$ BEGIN ALTER TABLE master.intercompany_trading_pair ADD CONSTRAINT ictp_counterparty_cc_fk
    FOREIGN KEY (tenant_id, counterparty_company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE master.intercompany_trading_pair DROP CONSTRAINT IF EXISTS ictp_sup_profile_fk;
DO $$ BEGIN ALTER TABLE master.intercompany_trading_pair ADD CONSTRAINT ictp_sup_profile_fk
    FOREIGN KEY (tenant_id, counterparty_supplier_profile_id)
    REFERENCES master.company_code_supplier_profile (tenant_id, id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE master.intercompany_trading_pair DROP CONSTRAINT IF EXISTS ictp_cust_profile_fk;
DO $$ BEGIN ALTER TABLE master.intercompany_trading_pair ADD CONSTRAINT ictp_cust_profile_fk
    FOREIGN KEY (tenant_id, mirror_customer_profile_id)
    REFERENCES master.company_code_customer_profile (tenant_id, id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.intercompany_trading_pair ADD CONSTRAINT ictp_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
-- §RK  master.risk_* — party risk platform FKs (01j_tables_party_risk.sql)
-- ============================================================================

-- ── master.tenant_risk_source_config ─────────────────────────────────────────
ALTER TABLE master.tenant_risk_source_config DROP CONSTRAINT IF EXISTS trsc_tenant_fk;
DO $$ BEGIN ALTER TABLE master.tenant_risk_source_config ADD CONSTRAINT trsc_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE master.tenant_risk_source_config DROP CONSTRAINT IF EXISTS trsc_source_fk;
DO $$ BEGIN ALTER TABLE master.tenant_risk_source_config ADD CONSTRAINT trsc_source_fk
    FOREIGN KEY (source_code) REFERENCES master.risk_source (code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.tenant_risk_source_config ADD CONSTRAINT trsc_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.risk_model_dimension ───────────────────────────────────────────────
ALTER TABLE master.risk_model_dimension DROP CONSTRAINT IF EXISTS rmd_model_fk;
DO $$ BEGIN ALTER TABLE master.risk_model_dimension ADD CONSTRAINT rmd_model_fk
    FOREIGN KEY (model_code, model_version)
    REFERENCES master.risk_model (code, version) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE master.risk_model_dimension DROP CONSTRAINT IF EXISTS rmd_dimension_fk;
DO $$ BEGIN ALTER TABLE master.risk_model_dimension ADD CONSTRAINT rmd_dimension_fk
    FOREIGN KEY (dimension_code) REFERENCES master.risk_dimension (code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.risk_driver_registry ───────────────────────────────────────────────
ALTER TABLE master.risk_driver_registry DROP CONSTRAINT IF EXISTS rdr_dimension_fk;
DO $$ BEGIN ALTER TABLE master.risk_driver_registry ADD CONSTRAINT rdr_dimension_fk
    FOREIGN KEY (default_dimension_code) REFERENCES master.risk_dimension (code) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.party_risk_evidence ────────────────────────────────────────────────
ALTER TABLE master.party_risk_evidence DROP CONSTRAINT IF EXISTS pre_tenant_fk;
DO $$ BEGIN ALTER TABLE master.party_risk_evidence ADD CONSTRAINT pre_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE master.party_risk_evidence DROP CONSTRAINT IF EXISTS pre_bp_fk;
DO $$ BEGIN ALTER TABLE master.party_risk_evidence ADD CONSTRAINT pre_bp_fk
    FOREIGN KEY (tenant_id, business_partner_id)
    REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE master.party_risk_evidence DROP CONSTRAINT IF EXISTS pre_source_fk;
DO $$ BEGIN ALTER TABLE master.party_risk_evidence ADD CONSTRAINT pre_source_fk
    FOREIGN KEY (source_code) REFERENCES master.risk_source (code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE master.party_risk_evidence DROP CONSTRAINT IF EXISTS pre_superseded_by_fk;
DO $$ BEGIN ALTER TABLE master.party_risk_evidence ADD CONSTRAINT pre_superseded_by_fk
    FOREIGN KEY (tenant_id, superseded_by) REFERENCES master.party_risk_evidence (tenant_id, id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.party_risk_evidence ADD CONSTRAINT pre_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.party_risk_assessment ──────────────────────────────────────────────
ALTER TABLE master.party_risk_assessment DROP CONSTRAINT IF EXISTS pra_tenant_fk;
DO $$ BEGIN ALTER TABLE master.party_risk_assessment ADD CONSTRAINT pra_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE master.party_risk_assessment DROP CONSTRAINT IF EXISTS pra_bp_fk;
DO $$ BEGIN ALTER TABLE master.party_risk_assessment ADD CONSTRAINT pra_bp_fk
    FOREIGN KEY (tenant_id, business_partner_id)
    REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE master.party_risk_assessment DROP CONSTRAINT IF EXISTS pra_model_fk;
DO $$ BEGIN ALTER TABLE master.party_risk_assessment ADD CONSTRAINT pra_model_fk
    FOREIGN KEY (model_code, model_version)
    REFERENCES master.risk_model (code, version) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE master.party_risk_assessment DROP CONSTRAINT IF EXISTS pra_superseded_by_fk;
DO $$ BEGIN ALTER TABLE master.party_risk_assessment ADD CONSTRAINT pra_superseded_by_fk
    FOREIGN KEY (tenant_id, superseded_by) REFERENCES master.party_risk_assessment (tenant_id, id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.party_risk_assessment ADD CONSTRAINT pra_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.party_risk_dimension_score ────────────────────────────────────────
ALTER TABLE master.party_risk_dimension_score DROP CONSTRAINT IF EXISTS prds_assessment_fk;
DO $$ BEGIN ALTER TABLE master.party_risk_dimension_score ADD CONSTRAINT prds_assessment_fk
    FOREIGN KEY (tenant_id, assessment_id)
    REFERENCES master.party_risk_assessment (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE master.party_risk_dimension_score DROP CONSTRAINT IF EXISTS prds_dimension_fk;
DO $$ BEGIN ALTER TABLE master.party_risk_dimension_score ADD CONSTRAINT prds_dimension_fk
    FOREIGN KEY (dimension_code) REFERENCES master.risk_dimension (code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.party_risk_driver ──────────────────────────────────────────────────
ALTER TABLE master.party_risk_driver DROP CONSTRAINT IF EXISTS prd_assessment_fk;
DO $$ BEGIN ALTER TABLE master.party_risk_driver ADD CONSTRAINT prd_assessment_fk
    FOREIGN KEY (tenant_id, assessment_id)
    REFERENCES master.party_risk_assessment (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE master.party_risk_driver DROP CONSTRAINT IF EXISTS prd_dimension_score_fk;
DO $$ BEGIN ALTER TABLE master.party_risk_driver ADD CONSTRAINT prd_dimension_score_fk
    FOREIGN KEY (tenant_id, dimension_score_id)
    REFERENCES master.party_risk_dimension_score (tenant_id, id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE master.party_risk_driver DROP CONSTRAINT IF EXISTS prd_evidence_fk;
DO $$ BEGIN ALTER TABLE master.party_risk_driver ADD CONSTRAINT prd_evidence_fk
    FOREIGN KEY (tenant_id, evidence_id)
    REFERENCES master.party_risk_evidence (tenant_id, id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE master.party_risk_driver DROP CONSTRAINT IF EXISTS prd_driver_code_fk;
DO $$ BEGIN ALTER TABLE master.party_risk_driver ADD CONSTRAINT prd_driver_code_fk
    FOREIGN KEY (driver_code) REFERENCES master.risk_driver_registry (code) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.party_risk_mitigation ──────────────────────────────────────────────
ALTER TABLE master.party_risk_mitigation DROP CONSTRAINT IF EXISTS prm_tenant_fk;
DO $$ BEGIN ALTER TABLE master.party_risk_mitigation ADD CONSTRAINT prm_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE master.party_risk_mitigation DROP CONSTRAINT IF EXISTS prm_bp_fk;
DO $$ BEGIN ALTER TABLE master.party_risk_mitigation ADD CONSTRAINT prm_bp_fk
    FOREIGN KEY (tenant_id, business_partner_id)
    REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE master.party_risk_mitigation DROP CONSTRAINT IF EXISTS prm_assessment_fk;
DO $$ BEGIN ALTER TABLE master.party_risk_mitigation ADD CONSTRAINT prm_assessment_fk
    FOREIGN KEY (tenant_id, assessment_id)
    REFERENCES master.party_risk_assessment (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE master.party_risk_mitigation DROP CONSTRAINT IF EXISTS prm_driver_fk;
DO $$ BEGIN ALTER TABLE master.party_risk_mitigation ADD CONSTRAINT prm_driver_fk
    FOREIGN KEY (tenant_id, driver_id)
    REFERENCES master.party_risk_driver (tenant_id, id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.party_risk_mitigation ADD CONSTRAINT prm_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.party_risk_review_event ────────────────────────────────────────────
ALTER TABLE master.party_risk_review_event DROP CONSTRAINT IF EXISTS prre_assessment_fk;
DO $$ BEGIN ALTER TABLE master.party_risk_review_event ADD CONSTRAINT prre_assessment_fk
    FOREIGN KEY (tenant_id, assessment_id)
    REFERENCES master.party_risk_assessment (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- Parameter management
DO $$ BEGIN ALTER TABLE master.tenant_parameter_definition ADD CONSTRAINT tpd_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.tenant_parameter_definition ADD CONSTRAINT tpd_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.tenant_parameter_definition ADD CONSTRAINT tpd_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.tenant_parameter_value ADD CONSTRAINT tpv_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.tenant_parameter_value ADD CONSTRAINT tpv_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.tenant_parameter_value ADD CONSTRAINT tpv_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
