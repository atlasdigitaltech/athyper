DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
        GRANT SELECT, INSERT, UPDATE ON
            master.business_partner_relationship,
            master.business_partner_governance_relation,
            master.business_partner_identifier,
            master.business_partner_tax_registration,
            master.business_partner_commodity_capability,
            master.business_partner_operating_organization_assignment,
            master.company_code_supplier_profile,
            master.company_code_customer_profile,
            master.legal_entity_business_partner_link,
            master.intercompany_trading_pair
        TO athyperapp;
        GRANT SELECT, INSERT, DELETE ON
            master.contact_person_identity_link
        TO athyperapp;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            master.business_partner_relationship,
            master.business_partner_governance_relation,
            master.business_partner_identifier,
            master.business_partner_tax_registration,
            master.business_partner_commodity_capability,
            master.business_partner_operating_organization_assignment,
            master.company_code_supplier_profile,
            master.company_code_customer_profile,
            master.legal_entity_business_partner_link,
            master.intercompany_trading_pair,
            master.contact_person_identity_link
        TO athyperadmin;
    END IF;
END;
$$;
