-- ============================================================================
-- aggregate/03_constraints.sql
-- Concept: Aggregate FKs — aggregate roll-up FK graph
-- Depends on: 04_tables/010_aggregate.sql
-- ============================================================================
-- FK constraints for aggregate schema. Idempotent via DO blocks.

-- ── aggregate.tax_credit_summary ─────────────────────────────────────────────
DO $$ BEGIN ALTER TABLE aggregate.tax_credit_summary ADD CONSTRAINT tcs_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE aggregate.tax_credit_summary ADD CONSTRAINT tcs_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE aggregate.tax_credit_summary ADD CONSTRAINT tcs_jurisdiction_fk
    FOREIGN KEY (tenant_id, jurisdiction_id)
    REFERENCES master.tax_jurisdiction (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE aggregate.tax_credit_summary ADD CONSTRAINT tcs_type_fk
    FOREIGN KEY (tenant_id, tax_type_id)
    REFERENCES master.tax_type (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE aggregate.tax_credit_summary ADD CONSTRAINT tcs_book_fk
    FOREIGN KEY (tenant_id, book_id)
    REFERENCES master.ledger_book (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE aggregate.tax_credit_summary ADD CONSTRAINT tcs_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE aggregate.tax_credit_summary ADD CONSTRAINT tcs_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── aggregate.wht_vendor_accumulator ─────────────────────────────────────────
-- R7-B: FK constraints for the per-vendor WHT accumulator.
DO $$ BEGIN ALTER TABLE aggregate.wht_vendor_accumulator ADD CONSTRAINT wva_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE aggregate.wht_vendor_accumulator ADD CONSTRAINT wva_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE aggregate.wht_vendor_accumulator ADD CONSTRAINT wva_counterparty_fk
    FOREIGN KEY (counterparty_id) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE aggregate.wht_vendor_accumulator ADD CONSTRAINT wva_jurisdiction_fk
    FOREIGN KEY (tenant_id, jurisdiction_id)
    REFERENCES master.tax_jurisdiction (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE aggregate.wht_vendor_accumulator ADD CONSTRAINT wva_tax_type_fk
    FOREIGN KEY (tenant_id, tax_type_id)
    REFERENCES master.tax_type (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE aggregate.wht_vendor_accumulator ADD CONSTRAINT wva_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE aggregate.wht_vendor_accumulator ADD CONSTRAINT wva_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
