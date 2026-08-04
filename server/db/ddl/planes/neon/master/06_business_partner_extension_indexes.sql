CREATE UNIQUE INDEX business_partner_relationship_current_uq
    ON master.business_partner_relationship
       (tenant_id, source_business_partner_id, target_business_partner_id,
        relationship_type_code)
    WHERE effective_until IS NULL AND status = 'active';
CREATE INDEX business_partner_relationship_target_idx
    ON master.business_partner_relationship
       (tenant_id, target_business_partner_id, status);

CREATE INDEX business_partner_governance_owner_idx
    ON master.business_partner_governance_relation
       (tenant_id, business_partner_id, relation_type_code, status);
CREATE INDEX business_partner_governance_member_idx
    ON master.business_partner_governance_relation
       (tenant_id, member_business_partner_id)
    WHERE member_business_partner_id IS NOT NULL;

CREATE UNIQUE INDEX business_partner_identifier_active_uq
    ON master.business_partner_identifier
       (tenant_id, business_partner_id, scheme_code, identifier_value)
    WHERE status = 'active';
CREATE UNIQUE INDEX business_partner_identifier_primary_uq
    ON master.business_partner_identifier
       (tenant_id, business_partner_id, scheme_code)
    WHERE is_primary AND status = 'active';
CREATE INDEX business_partner_identifier_value_idx
    ON master.business_partner_identifier
       (tenant_id, scheme_code, identifier_value);

CREATE UNIQUE INDEX business_partner_tax_registration_active_uq
    ON master.business_partner_tax_registration
       (tenant_id, business_partner_id, jurisdiction_id,
        registration_type_code, registration_number)
    WHERE status = 'active';
CREATE UNIQUE INDEX business_partner_tax_registration_primary_uq
    ON master.business_partner_tax_registration
       (tenant_id, business_partner_id, jurisdiction_id, registration_type_code)
    WHERE is_primary AND status = 'active';

CREATE UNIQUE INDEX business_partner_commodity_capability_current_uq
    ON master.business_partner_commodity_capability
       (tenant_id, business_partner_id, commodity_category_id, partner_role)
    WHERE effective_until IS NULL AND status = 'active';
CREATE INDEX business_partner_commodity_capability_category_idx
    ON master.business_partner_commodity_capability
       (tenant_id, commodity_category_id, partner_role, status);

CREATE UNIQUE INDEX business_partner_operating_org_assignment_current_uq
    ON master.business_partner_operating_organization_assignment
       (tenant_id, business_partner_id, operating_organization_id, partner_role)
    WHERE effective_until IS NULL AND status = 'active';
CREATE INDEX business_partner_operating_org_assignment_org_idx
    ON master.business_partner_operating_organization_assignment
       (tenant_id, operating_organization_id, partner_role, status);

CREATE INDEX company_code_supplier_profile_company_idx
    ON master.company_code_supplier_profile
       (tenant_id, company_code_id, status, supplier_id);
CREATE INDEX company_code_supplier_profile_bank_idx
    ON master.company_code_supplier_profile
       (tenant_id, preferred_remittance_bank_link_id)
    WHERE preferred_remittance_bank_link_id IS NOT NULL;
CREATE INDEX company_code_customer_profile_company_idx
    ON master.company_code_customer_profile
       (tenant_id, company_code_id, status, customer_id);

CREATE UNIQUE INDEX legal_entity_business_partner_link_legal_uq
    ON master.legal_entity_business_partner_link (tenant_id, legal_entity_id)
    WHERE effective_until IS NULL AND status = 'active';
CREATE UNIQUE INDEX legal_entity_business_partner_link_partner_uq
    ON master.legal_entity_business_partner_link (tenant_id, business_partner_id)
    WHERE effective_until IS NULL AND status = 'active';

CREATE UNIQUE INDEX intercompany_trading_pair_current_uq
    ON master.intercompany_trading_pair
       (tenant_id, source_company_code_id, counterparty_company_code_id)
    WHERE effective_until IS NULL AND status = 'active';
CREATE INDEX intercompany_trading_pair_counterparty_idx
    ON master.intercompany_trading_pair
       (tenant_id, counterparty_company_code_id, status);

CREATE INDEX contact_person_identity_link_person_idx
    ON master.contact_person_identity_link (tenant_id, person_id)
    WHERE effective_until IS NULL;
