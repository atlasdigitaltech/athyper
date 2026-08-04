DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'business_partner_relationship',
        'business_partner_governance_relation',
        'business_partner_identifier',
        'business_partner_tax_registration',
        'business_partner_commodity_capability',
        'business_partner_operating_organization_assignment',
        'company_code_supplier_profile',
        'company_code_customer_profile',
        'legal_entity_business_partner_link',
        'intercompany_trading_pair',
        'contact_person_identity_link'
    ] LOOP
        EXECUTE format('ALTER TABLE master.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE master.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format(
            'CREATE POLICY tenant_access ON master.%I FOR ALL '
            'USING (tenant_id = shared.current_tenant_id_soft()) '
            'WITH CHECK (tenant_id = shared.current_tenant_id())',
            v_table
        );
        EXECUTE format(
            'CREATE POLICY seed_write ON master.%I FOR ALL TO CURRENT_USER '
            'USING (true) WITH CHECK (true)',
            v_table
        );
    END LOOP;
END;
$$;
