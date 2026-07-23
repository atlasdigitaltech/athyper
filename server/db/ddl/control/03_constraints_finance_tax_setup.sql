DO $$ BEGIN ALTER TABLE control.tax_group_version ADD CONSTRAINT tgv_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.tax_group_version ADD CONSTRAINT tgv_group_fk
    FOREIGN KEY (tenant_id,tax_group_id) REFERENCES control.tax_group(tenant_id,id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.tax_group_version ADD CONSTRAINT tgv_rounding_fk
    FOREIGN KEY (tenant_id,rounding_rule_id) REFERENCES control.rounding_rule(tenant_id,id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.tax_group_version ADD CONSTRAINT tgv_supersedes_fk
    FOREIGN KEY (tenant_id,supersedes_id) REFERENCES control.tax_group_version(tenant_id,id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.tax_group_component ADD CONSTRAINT tgc_version_fk
    FOREIGN KEY (tenant_id,tax_group_version_id) REFERENCES control.tax_group_version(tenant_id,id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

