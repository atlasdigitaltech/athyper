CREATE TRIGGER trg_business_partner_relationship_lookup
BEFORE INSERT OR UPDATE OF relationship_type_code
ON master.business_partner_relationship
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_partner_lookup();
CREATE TRIGGER trg_business_partner_governance_lookup
BEFORE INSERT OR UPDATE OF relation_type_code
ON master.business_partner_governance_relation
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_partner_lookup();
CREATE TRIGGER trg_business_partner_identifier_lookup
BEFORE INSERT OR UPDATE OF scheme_code, identifier_value
ON master.business_partner_identifier
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_partner_lookup();
CREATE TRIGGER trg_business_partner_tax_registration_lookup
BEFORE INSERT OR UPDATE OF registration_type_code, registration_number
ON master.business_partner_tax_registration
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_partner_lookup();

CREATE TRIGGER trg_business_partner_commodity_capability_role
BEFORE INSERT OR UPDATE OF tenant_id, business_partner_id, partner_role
ON master.business_partner_commodity_capability
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_business_partner_role();
CREATE TRIGGER trg_business_partner_operating_org_assignment_role
BEFORE INSERT OR UPDATE OF tenant_id, business_partner_id,
    operating_organization_id, partner_role
ON master.business_partner_operating_organization_assignment
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_business_partner_role();

CREATE TRIGGER trg_legal_entity_business_partner_link_validate
BEFORE INSERT OR UPDATE OF tenant_id, business_partner_id
ON master.legal_entity_business_partner_link
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_legal_entity_partner_link();

CREATE TRIGGER trg_company_code_supplier_profile_remittance
BEFORE INSERT OR UPDATE OF tenant_id, supplier_id, company_code_id,
    preferred_remittance_bank_link_id
ON master.company_code_supplier_profile
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_supplier_remittance_link();

CREATE TRIGGER trg_intercompany_trading_pair_validate
BEFORE INSERT OR UPDATE OF source_company_code_id,
    counterparty_company_code_id, counterparty_supplier_profile_id,
    mirror_customer_profile_id, status
ON master.intercompany_trading_pair
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_intercompany_pair();

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
        'intercompany_trading_pair'
    ] LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%I_10_guard BEFORE UPDATE ON master.%I '
            'FOR EACH ROW EXECUTE FUNCTION master.trg_guard_partner_extension_identity()',
            v_table, v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%I_20_status BEFORE UPDATE OF status ON master.%I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed()',
            v_table, v_table
        );
        EXECUTE format(
            'CREATE TRIGGER trg_%I_30_updated BEFORE UPDATE ON master.%I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',
            v_table, v_table
        );
    END LOOP;
END;
$$;

CREATE TRIGGER trg_contact_person_identity_link_guard
BEFORE UPDATE ON master.contact_person_identity_link
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_partner_extension_identity();
