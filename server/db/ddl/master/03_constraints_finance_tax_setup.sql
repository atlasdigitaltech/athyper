DO $$ BEGIN ALTER TABLE master.organization_tax_registration ADD CONSTRAINT otr_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.organization_tax_registration ADD CONSTRAINT otr_legal_entity_fk
    FOREIGN KEY (tenant_id,legal_entity_id) REFERENCES master.legal_entity(tenant_id,id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.organization_tax_registration ADD CONSTRAINT otr_company_fk
    FOREIGN KEY (tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.organization_tax_registration ADD CONSTRAINT otr_jurisdiction_fk
    FOREIGN KEY (tenant_id,jurisdiction_id) REFERENCES master.tax_jurisdiction(tenant_id,id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE master.organization_tax_registration ADD CONSTRAINT otr_attachment_fk
    FOREIGN KEY (tenant_id,certificate_attachment_id) REFERENCES master.attachment(tenant_id,id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

