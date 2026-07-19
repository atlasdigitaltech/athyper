-- Fiscal calendar foreign keys and non-overlapping company assignments.
DO $$ BEGIN ALTER TABLE control.fiscal_calendar_config ADD CONSTRAINT fcc_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.fiscal_calendar_config ADD CONSTRAINT fcc_supersedes_fk
    FOREIGN KEY (tenant_id, supersedes_id) REFERENCES control.fiscal_calendar_config (tenant_id, id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.fiscal_calendar_config ADD CONSTRAINT fcc_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.fiscal_calendar_config ADD CONSTRAINT fcc_updated_by_fk
    FOREIGN KEY (updated_by) REFERENCES master.principal (id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.fiscal_calendar_period_rule ADD CONSTRAINT fcpr_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.fiscal_calendar_period_rule ADD CONSTRAINT fcpr_config_fk
    FOREIGN KEY (tenant_id, fiscal_calendar_config_id) REFERENCES control.fiscal_calendar_config (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.fiscal_calendar_period_rule ADD CONSTRAINT fcpr_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.company_fiscal_calendar_assignment ADD CONSTRAINT cfca_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.company_fiscal_calendar_assignment ADD CONSTRAINT cfca_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.company_fiscal_calendar_assignment ADD CONSTRAINT cfca_config_fk
    FOREIGN KEY (tenant_id, fiscal_calendar_config_id) REFERENCES control.fiscal_calendar_config (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.company_fiscal_calendar_assignment ADD CONSTRAINT cfca_created_by_fk
    FOREIGN KEY (created_by) REFERENCES master.principal (id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.company_fiscal_calendar_assignment ADD CONSTRAINT cfca_no_overlap
    EXCLUDE USING gist (
        tenant_id WITH =,
        company_code_id WITH =,
        int4range(effective_fiscal_year_from::integer,
                  COALESCE(effective_fiscal_year_to::integer + 1, 32768), '[)') WITH &&
    ) WHERE (status = 'active');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE master.fiscal_period ADD CONSTRAINT fp_calendar_config_fk
    FOREIGN KEY (tenant_id, fiscal_calendar_config_id) REFERENCES control.fiscal_calendar_config (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
