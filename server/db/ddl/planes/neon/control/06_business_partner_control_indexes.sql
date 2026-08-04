CREATE INDEX business_partner_qualification_partner_idx
    ON control.business_partner_qualification
       (tenant_id, business_partner_id, partner_role, decision);
CREATE INDEX business_partner_qualification_org_idx
    ON control.business_partner_qualification
       (tenant_id, operating_organization_id)
    WHERE operating_organization_id IS NOT NULL;
CREATE INDEX business_partner_qualification_company_idx
    ON control.business_partner_qualification
       (tenant_id, company_code_id)
    WHERE company_code_id IS NOT NULL;
CREATE INDEX business_partner_qualification_capability_idx
    ON control.business_partner_qualification
       (tenant_id, commodity_capability_id)
    WHERE commodity_capability_id IS NOT NULL;
CREATE INDEX business_partner_qualification_review_due_idx
    ON control.business_partner_qualification
       (tenant_id, next_review_at)
    WHERE decision IN ('approved', 'conditional')
      AND next_review_at IS NOT NULL;

CREATE INDEX business_partner_block_partner_idx
    ON control.business_partner_block
       (tenant_id, business_partner_id, status, effective_from);
CREATE INDEX business_partner_block_org_idx
    ON control.business_partner_block
       (tenant_id, operating_organization_id)
    WHERE operating_organization_id IS NOT NULL;
CREATE INDEX business_partner_block_company_idx
    ON control.business_partner_block
       (tenant_id, company_code_id)
    WHERE company_code_id IS NOT NULL;
CREATE INDEX business_partner_block_active_operation_idx
    ON control.business_partner_block
       (tenant_id, business_partner_id, partner_role_scope, operation_code)
    WHERE status = 'active';
