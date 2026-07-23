-- Finance Setup Phase 2, Stage A: tenant-composite relationship contracts.

DO $$ BEGIN
    ALTER TABLE control.fx_policy ADD CONSTRAINT fx_policy_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.fx_policy ADD CONSTRAINT fx_policy_company_fk
        FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.fx_policy ADD CONSTRAINT fx_policy_book_fk
        FOREIGN KEY (tenant_id, ledger_book_id)
        REFERENCES master.ledger_book (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.fx_policy ADD CONSTRAINT fx_policy_pivot_currency_fk
        FOREIGN KEY (pivot_currency_code) REFERENCES shared.currency (code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.fx_policy ADD CONSTRAINT fx_policy_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.fx_policy ADD CONSTRAINT fx_policy_supersedes_fk
        FOREIGN KEY (tenant_id, supersedes_id)
        REFERENCES control.fx_policy (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE control.tax_group ADD CONSTRAINT tg_rounding_rule_fk
        FOREIGN KEY (tenant_id, rounding_rule_id)
        REFERENCES control.rounding_rule (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A bank account or Company link with finance dependencies must be ended, not
-- deleted through a cascading FK chain.
ALTER TABLE master.bank_account_link DROP CONSTRAINT IF EXISTS bal_bank_account_fk;
ALTER TABLE master.bank_account_link ADD CONSTRAINT bal_bank_account_fk
    FOREIGN KEY (tenant_id, bank_account_id)
    REFERENCES master.bank_account (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.bank_account_house_config DROP CONSTRAINT IF EXISTS bahc_link_fk;
ALTER TABLE master.bank_account_house_config ADD CONSTRAINT bahc_link_fk
    FOREIGN KEY (tenant_id, bank_account_link_id)
    REFERENCES master.bank_account_link (tenant_id, id) ON DELETE RESTRICT;
