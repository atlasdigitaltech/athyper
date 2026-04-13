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
DO $$ BEGIN ALTER TABLE master.asset_class ADD CONSTRAINT ac_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.asset_class ADD CONSTRAINT ac_parent_fk
    FOREIGN KEY (tenant_id, parent_id) REFERENCES master.asset_class (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.asset_class ADD CONSTRAINT ac_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.asset_class ADD CONSTRAINT ac_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- v3: new FKs for asset_class enrichments
DO $$ BEGIN ALTER TABLE master.asset_class ADD CONSTRAINT ac_cap_currency_fk
    FOREIGN KEY (capitalization_currency) REFERENCES shared.currency (code);
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
DO $$ BEGIN ALTER TABLE master.asset ADD CONSTRAINT asset_vendor_fk
    FOREIGN KEY (tenant_id, vendor_id) REFERENCES master.supplier (tenant_id, id);
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
DO $$ BEGIN ALTER TABLE master.company_code_spend_policy ADD CONSTRAINT sccp_intent_fk
    FOREIGN KEY (default_intent_id) REFERENCES master.business_intent (id)
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


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

DO $$ BEGIN ALTER TABLE master.business_intent ADD CONSTRAINT bi_gl_account_fk
    FOREIGN KEY (default_gl_account_id) REFERENCES master.gl_account (id)
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── §CCIP  master.company_code_intent_policy ─────────────────────────────────
DO $$ BEGIN ALTER TABLE master.company_code_intent_policy ADD CONSTRAINT ccip_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.company_code_intent_policy ADD CONSTRAINT ccip_cc_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.company_code_intent_policy ADD CONSTRAINT ccip_intent_fk
    FOREIGN KEY (tenant_id, intent_id)
    REFERENCES master.business_intent (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


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

-- ── master.item_category — default_tax_group_id FK ────────────────────────
DO $$ BEGIN ALTER TABLE master.item_category ADD CONSTRAINT pc_default_tax_group_fk
    FOREIGN KEY (tenant_id, default_tax_group_id)
    REFERENCES control.tax_group (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.company_code_supplier_profile — default_wht_tax_group_id FK ────────────
DO $$ BEGIN ALTER TABLE master.company_code_supplier_profile ADD CONSTRAINT scp_default_wht_tax_group_fk
    FOREIGN KEY (tenant_id, default_wht_tax_group_id)
    REFERENCES control.tax_group (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.business_intent — default_tax_group_id FK ─────────────────────────
DO $$ BEGIN ALTER TABLE master.business_intent ADD CONSTRAINT bi_default_tax_group_fk
    FOREIGN KEY (tenant_id, default_tax_group_id)
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
