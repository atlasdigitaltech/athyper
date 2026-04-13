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

-- ── master.customer (pure tenant master — no company-specific columns) ─────
ALTER TABLE master.customer DROP CONSTRAINT IF EXISTS cust_tenant_fk;
DO $$ BEGIN ALTER TABLE master.customer ADD CONSTRAINT cust_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.customer ADD CONSTRAINT cust_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- customer new FKs (profile extension)
CREATE UNIQUE INDEX IF NOT EXISTS customer_external_ref_uidx
    ON master.customer (tenant_id, external_ref)
    WHERE external_ref IS NOT NULL;

DO $$ BEGIN ALTER TABLE master.customer ADD CONSTRAINT customer_parent_fk
    FOREIGN KEY (tenant_id, parent_customer_id)
    REFERENCES master.customer (tenant_id, id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.customer ADD CONSTRAINT customer_reg_country_fk
    FOREIGN KEY (registration_country_code) REFERENCES shared.country (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.customer ADD CONSTRAINT customer_tax_country_fk
    FOREIGN KEY (tax_country_code) REFERENCES shared.country (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.supplier (pure tenant master — no company-specific columns) ─────
ALTER TABLE master.supplier DROP CONSTRAINT IF EXISTS supp_tenant_fk;
DO $$ BEGIN ALTER TABLE master.supplier ADD CONSTRAINT supp_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.supplier ADD CONSTRAINT supp_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- supplier new FKs (profile extension)
CREATE UNIQUE INDEX IF NOT EXISTS supplier_external_ref_uidx
    ON master.supplier (tenant_id, external_ref)
    WHERE external_ref IS NOT NULL;

DO $$ BEGIN ALTER TABLE master.supplier ADD CONSTRAINT supplier_parent_fk
    FOREIGN KEY (tenant_id, parent_supplier_id)
    REFERENCES master.supplier (tenant_id, id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.supplier ADD CONSTRAINT supplier_reg_country_fk
    FOREIGN KEY (registration_country_code) REFERENCES shared.country (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.supplier ADD CONSTRAINT supplier_tax_country_fk
    FOREIGN KEY (tax_country_code) REFERENCES shared.country (code);
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

-- ── master.item_category ────────────────────────────────────────────────
ALTER TABLE master.item_category DROP CONSTRAINT IF EXISTS pcat_tenant_fk;
DO $$ BEGIN ALTER TABLE master.item_category ADD CONSTRAINT pcat_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.item_category ADD CONSTRAINT pcat_parent_fk
    FOREIGN KEY (tenant_id, parent_id) REFERENCES master.item_category (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.item_category ADD CONSTRAINT pcat_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── master.product ─────────────────────────────────────────────────────────
ALTER TABLE master.product DROP CONSTRAINT IF EXISTS prod_tenant_fk;
DO $$ BEGIN ALTER TABLE master.product ADD CONSTRAINT prod_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.product ADD CONSTRAINT prod_category_fk
    FOREIGN KEY (tenant_id, category_id) REFERENCES master.item_category (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.product ADD CONSTRAINT prod_spend_category_fk
    FOREIGN KEY (tenant_id, spend_category_id) REFERENCES master.spend_category (tenant_id, id);
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
DO $$ BEGIN ALTER TABLE master.item ADD CONSTRAINT im_category_fk
    FOREIGN KEY (tenant_id, category_id) REFERENCES master.item_category (tenant_id, id)
    ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.item ADD CONSTRAINT im_spend_category_fk
    FOREIGN KEY (tenant_id, spend_category_id) REFERENCES master.spend_category (tenant_id, id);
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
ALTER TABLE master.company_code_spend_policy DROP CONSTRAINT IF EXISTS sccp_tenant_fk;
DO $$ BEGIN ALTER TABLE master.company_code_spend_policy ADD CONSTRAINT sccp_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code_spend_policy ADD CONSTRAINT sccp_cc_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code_spend_policy ADD CONSTRAINT sccp_spend_category_fk
    FOREIGN KEY (tenant_id, spend_category_id) REFERENCES master.spend_category (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code_spend_policy ADD CONSTRAINT sccp_gl_account_fk
    FOREIGN KEY (tenant_id, default_gl_account_id) REFERENCES master.gl_account (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code_spend_policy ADD CONSTRAINT sccp_tax_group_fk
    FOREIGN KEY (tenant_id, default_tax_group_id) REFERENCES control.tax_group (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code_spend_policy ADD CONSTRAINT sccp_asset_class_fk
    FOREIGN KEY (tenant_id, asset_class_id) REFERENCES master.asset_class (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code_spend_policy ADD CONSTRAINT sccp_capex_currency_fk
    FOREIGN KEY (capex_screening_currency) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code_spend_policy ADD CONSTRAINT sccp_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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

-- ── master.company_code_customer_profile ────────────────────────────────────────
ALTER TABLE master.company_code_customer_profile DROP CONSTRAINT IF EXISTS ccp_tenant_fk;
DO $$ BEGIN ALTER TABLE master.company_code_customer_profile ADD CONSTRAINT ccp_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code_customer_profile ADD CONSTRAINT ccp_customer_fk
    FOREIGN KEY (tenant_id, customer_id) REFERENCES master.customer (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code_customer_profile ADD CONSTRAINT ccp_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code_customer_profile ADD CONSTRAINT ccp_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code_customer_profile ADD CONSTRAINT ccp_ar_gl_fk
    FOREIGN KEY (tenant_id, ar_gl_account_id) REFERENCES master.gl_account (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
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

-- ── master.company_code_supplier_profile ────────────────────────────────────────
ALTER TABLE master.company_code_supplier_profile DROP CONSTRAINT IF EXISTS scp_tenant_fk;
DO $$ BEGIN ALTER TABLE master.company_code_supplier_profile ADD CONSTRAINT scp_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code_supplier_profile ADD CONSTRAINT scp_supplier_fk
    FOREIGN KEY (tenant_id, supplier_id) REFERENCES master.supplier (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code_supplier_profile ADD CONSTRAINT scp_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code_supplier_profile ADD CONSTRAINT scp_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.company_code_supplier_profile ADD CONSTRAINT scp_ap_gl_fk
    FOREIGN KEY (tenant_id, ap_gl_account_id) REFERENCES master.gl_account (tenant_id, id);
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

DO $$ BEGIN ALTER TABLE master.company_code_supplier_profile ADD CONSTRAINT scp_remittance_bank_link_fk
    FOREIGN KEY (tenant_id, preferred_remittance_bank_link_id)
    REFERENCES master.bank_account_link (tenant_id, id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.company_code_supplier_profile ADD CONSTRAINT scp_tax_group_fk
    FOREIGN KEY (tenant_id, tax_group_id)
    REFERENCES control.tax_group (tenant_id, id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.company_code_supplier_profile ADD CONSTRAINT scp_dimension_set_fk
    FOREIGN KEY (tenant_id, default_dimension_set_id)
    REFERENCES master.dimension_set (tenant_id, id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- settlement_profile_id: FUTURE ANCHOR — no FK target yet.
-- supplier_reconciliation_profile_id: FUTURE ANCHOR — no FK target yet.
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

