ALTER TABLE control.business_partner_qualification
    ADD CONSTRAINT business_partner_qualification_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_qualification_partner_fk
    FOREIGN KEY (tenant_id, business_partner_id)
    REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_qualification_org_fk
    FOREIGN KEY (tenant_id, operating_organization_id)
    REFERENCES master.operating_organization (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_qualification_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_qualification_capability_fk
    FOREIGN KEY (tenant_id, commodity_capability_id)
    REFERENCES master.business_partner_commodity_capability (tenant_id, id)
    ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_qualification_risk_fk
    FOREIGN KEY (tenant_id, risk_assessment_id)
    REFERENCES master.party_risk_assessment (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_qualification_reviewed_by_fk
    FOREIGN KEY (tenant_id, reviewed_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_qualification_approved_by_fk
    FOREIGN KEY (tenant_id, approved_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_qualification_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_qualification_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE control.business_partner_block
    ADD CONSTRAINT business_partner_block_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_block_partner_fk
    FOREIGN KEY (tenant_id, business_partner_id)
    REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_block_org_fk
    FOREIGN KEY (tenant_id, operating_organization_id)
    REFERENCES master.operating_organization (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_block_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_block_blocked_by_fk
    FOREIGN KEY (tenant_id, blocked_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_block_lifted_by_fk
    FOREIGN KEY (tenant_id, lifted_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_block_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_block_updated_by_fk
    FOREIGN KEY (tenant_id, updated_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;
