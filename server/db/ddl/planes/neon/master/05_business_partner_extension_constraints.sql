ALTER TABLE master.business_partner_relationship
    ADD CONSTRAINT business_partner_relationship_source_fk
    FOREIGN KEY (tenant_id, source_business_partner_id)
    REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_relationship_target_fk
    FOREIGN KEY (tenant_id, target_business_partner_id)
    REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_relationship_country_fk
    FOREIGN KEY (country_code) REFERENCES shared.country (code) ON DELETE RESTRICT;

ALTER TABLE master.business_partner_governance_relation
    ADD CONSTRAINT business_partner_governance_relation_owner_fk
    FOREIGN KEY (tenant_id, business_partner_id)
    REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_governance_relation_member_fk
    FOREIGN KEY (tenant_id, member_business_partner_id)
    REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_governance_relation_country_fk
    FOREIGN KEY (member_country_code)
    REFERENCES shared.country (code) ON DELETE RESTRICT;

ALTER TABLE master.business_partner_identifier
    ADD CONSTRAINT business_partner_identifier_owner_fk
    FOREIGN KEY (tenant_id, business_partner_id)
    REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_identifier_country_fk
    FOREIGN KEY (issuing_country_code)
    REFERENCES shared.country (code) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_identifier_verified_by_fk
    FOREIGN KEY (tenant_id, verified_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.business_partner_tax_registration
    ADD CONSTRAINT business_partner_tax_registration_owner_fk
    FOREIGN KEY (tenant_id, business_partner_id)
    REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_tax_registration_jurisdiction_fk
    FOREIGN KEY (tenant_id, jurisdiction_id)
    REFERENCES master.tax_jurisdiction (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_tax_registration_tax_type_fk
    FOREIGN KEY (tenant_id, tax_type_id)
    REFERENCES master.tax_type (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_tax_registration_verified_by_fk
    FOREIGN KEY (tenant_id, verified_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.business_partner_commodity_capability
    ADD CONSTRAINT business_partner_commodity_capability_owner_fk
    FOREIGN KEY (tenant_id, business_partner_id)
    REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_commodity_capability_category_fk
    FOREIGN KEY (tenant_id, commodity_category_id)
    REFERENCES master.commodity_category (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.business_partner_operating_organization_assignment
    ADD CONSTRAINT business_partner_operating_org_assignment_owner_fk
    FOREIGN KEY (tenant_id, business_partner_id)
    REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT business_partner_operating_org_assignment_org_fk
    FOREIGN KEY (tenant_id, operating_organization_id)
    REFERENCES master.operating_organization (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.company_code_supplier_profile
    ADD CONSTRAINT company_code_supplier_profile_supplier_fk
    FOREIGN KEY (tenant_id, supplier_id)
    REFERENCES master.supplier (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT company_code_supplier_profile_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT company_code_supplier_profile_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT company_code_supplier_profile_payment_term_fk
    FOREIGN KEY (tenant_id, payment_term_id)
    REFERENCES master.payment_term (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT company_code_supplier_profile_accounting_fk
    FOREIGN KEY (tenant_id, default_accounting_profile_id)
    REFERENCES master.accounting_profile (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT company_code_supplier_profile_bank_link_fk
    FOREIGN KEY (tenant_id, preferred_remittance_bank_link_id)
    REFERENCES master.bank_account_link (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT company_code_supplier_profile_dimension_fk
    FOREIGN KEY (tenant_id, default_dimension_set_id)
    REFERENCES master.dimension_set (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.company_code_customer_profile
    ADD CONSTRAINT company_code_customer_profile_customer_fk
    FOREIGN KEY (tenant_id, customer_id)
    REFERENCES master.customer (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT company_code_customer_profile_company_fk
    FOREIGN KEY (tenant_id, company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT company_code_customer_profile_currency_fk
    FOREIGN KEY (currency_code) REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT company_code_customer_profile_credit_currency_fk
    FOREIGN KEY (credit_limit_currency_code)
    REFERENCES shared.currency (code) ON DELETE RESTRICT,
    ADD CONSTRAINT company_code_customer_profile_payment_term_fk
    FOREIGN KEY (tenant_id, payment_term_id)
    REFERENCES master.payment_term (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT company_code_customer_profile_accounting_fk
    FOREIGN KEY (tenant_id, default_accounting_profile_id)
    REFERENCES master.accounting_profile (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT company_code_customer_profile_dimension_fk
    FOREIGN KEY (tenant_id, default_dimension_set_id)
    REFERENCES master.dimension_set (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.legal_entity_business_partner_link
    ADD CONSTRAINT legal_entity_business_partner_link_legal_entity_fk
    FOREIGN KEY (tenant_id, legal_entity_id)
    REFERENCES master.legal_entity (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT legal_entity_business_partner_link_partner_fk
    FOREIGN KEY (tenant_id, business_partner_id)
    REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.intercompany_trading_pair
    ADD CONSTRAINT intercompany_trading_pair_source_company_fk
    FOREIGN KEY (tenant_id, source_company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_trading_pair_counterparty_company_fk
    FOREIGN KEY (tenant_id, counterparty_company_code_id)
    REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_trading_pair_supplier_profile_fk
    FOREIGN KEY (tenant_id, counterparty_supplier_profile_id)
    REFERENCES master.company_code_supplier_profile (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT intercompany_trading_pair_customer_profile_fk
    FOREIGN KEY (tenant_id, mirror_customer_profile_id)
    REFERENCES master.company_code_customer_profile (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE master.contact_person_identity_link
    ADD CONSTRAINT contact_person_identity_link_contact_fk
    FOREIGN KEY (tenant_id, contact_person_id)
    REFERENCES master.contact_person (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT contact_person_identity_link_person_fk
    FOREIGN KEY (tenant_id, person_id)
    REFERENCES master.person (tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT contact_person_identity_link_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT;

-- Consistent lifecycle/creation evidence for all mutable partner extensions.
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
            'ALTER TABLE master.%I ADD CONSTRAINT %I_created_by_fk '
            'FOREIGN KEY (tenant_id, created_by) '
            'REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT',
            v_table, v_table
        );
        EXECUTE format(
            'ALTER TABLE master.%I ADD CONSTRAINT %I_updated_by_fk '
            'FOREIGN KEY (tenant_id, updated_by) '
            'REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT',
            v_table, v_table
        );
        EXECUTE format(
            'ALTER TABLE master.%I ADD CONSTRAINT %I_status_changed_by_fk '
            'FOREIGN KEY (tenant_id, status_changed_by) '
            'REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT',
            v_table, v_table
        );
    END LOOP;
END;
$$;
