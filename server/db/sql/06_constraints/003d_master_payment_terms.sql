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




-- ============================================================================
-- §SCP  master.company_code_supplier_profile → payment_term (added column from Part E)
-- ============================================================================

-- scp.payment_term_id → master.payment_term (tenant-scoped)
DO $$ BEGIN ALTER TABLE master.company_code_supplier_profile ADD CONSTRAINT scp_payment_term_fk
    FOREIGN KEY (tenant_id, payment_term_id)
    REFERENCES master.payment_term (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================================
-- §CCP  master.company_code_customer_profile → payment_term (added column from Part E)
-- ============================================================================

-- ccp.payment_term_id → master.payment_term (tenant-scoped)
DO $$ BEGIN ALTER TABLE master.company_code_customer_profile ADD CONSTRAINT ccp_payment_term_fk
    FOREIGN KEY (tenant_id, payment_term_id)
    REFERENCES master.payment_term (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
