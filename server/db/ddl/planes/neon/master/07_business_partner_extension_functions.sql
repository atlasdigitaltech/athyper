CREATE OR REPLACE FUNCTION master.trg_validate_partner_lookup()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master, control
AS $$
DECLARE
    v_domain text;
    v_code text;
BEGIN
    IF TG_TABLE_NAME = 'business_partner_relationship' THEN
        NEW.relationship_type_code := lower(btrim(NEW.relationship_type_code));
        v_domain := 'master.business_partner_relationship_type';
        v_code := NEW.relationship_type_code;
    ELSIF TG_TABLE_NAME = 'business_partner_governance_relation' THEN
        NEW.relation_type_code := lower(btrim(NEW.relation_type_code));
        v_domain := 'master.business_partner_governance_role';
        v_code := NEW.relation_type_code;
    ELSIF TG_TABLE_NAME = 'business_partner_identifier' THEN
        NEW.scheme_code := lower(btrim(NEW.scheme_code));
        NEW.identifier_value := upper(regexp_replace(
            btrim(NEW.identifier_value), '\s+', '', 'g'
        ));
        v_domain := 'master.business_partner_identifier_scheme';
        v_code := NEW.scheme_code;
    ELSE
        NEW.registration_type_code := lower(btrim(NEW.registration_type_code));
        NEW.registration_number := upper(regexp_replace(
            btrim(NEW.registration_number), '\s+', '', 'g'
        ));
        v_domain := 'master.business_partner_tax_registration_type';
        v_code := NEW.registration_type_code;
    END IF;

    IF NOT control.lookup_value_is_active(v_domain, v_code, NEW.tenant_id) THEN
        RAISE EXCEPTION 'Unknown or inactive lookup value %/%', v_domain, v_code
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_partner_extension_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_new jsonb := to_jsonb(NEW);
    v_old jsonb := to_jsonb(OLD);
    v_key text;
BEGIN
    FOREACH v_key IN ARRAY ARRAY[
        'id', 'tenant_id', 'business_partner_id',
        'source_business_partner_id', 'target_business_partner_id',
        'supplier_id', 'customer_id', 'company_code_id',
        'legal_entity_id', 'source_company_code_id',
        'counterparty_company_code_id', 'contact_person_id', 'person_id'
    ] LOOP
        IF v_new ? v_key AND (v_new -> v_key) IS DISTINCT FROM (v_old -> v_key) THEN
            RAISE EXCEPTION '%.% identity coordinate % is immutable',
                TG_TABLE_SCHEMA, TG_TABLE_NAME, v_key
                USING ERRCODE = 'check_violation';
        END IF;
    END LOOP;
    IF v_new ? 'created_at'
       AND ((v_new -> 'created_at') IS DISTINCT FROM (v_old -> 'created_at')
            OR (v_new -> 'created_by') IS DISTINCT FROM (v_old -> 'created_by')) THEN
        RAISE EXCEPTION '%.% creation evidence is immutable',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_business_partner_role()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_partner_id uuid;
    v_role master.partner_role_d;
    v_domain master.operating_organization_domain_d;
BEGIN
    v_partner_id := NEW.business_partner_id;
    v_role := NEW.partner_role;

    IF v_role = 'supplier' AND NOT EXISTS (
        SELECT 1 FROM master.supplier
         WHERE tenant_id = NEW.tenant_id
           AND business_partner_id = v_partner_id
           AND status <> 'archived'
    ) THEN
        RAISE EXCEPTION 'Business partner % has no supplier role', v_partner_id
            USING ERRCODE = 'check_violation';
    ELSIF v_role = 'customer' AND NOT EXISTS (
        SELECT 1 FROM master.customer
         WHERE tenant_id = NEW.tenant_id
           AND business_partner_id = v_partner_id
           AND status <> 'archived'
    ) THEN
        RAISE EXCEPTION 'Business partner % has no customer role', v_partner_id
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_TABLE_NAME = 'business_partner_operating_organization_assignment' THEN
        SELECT domain INTO v_domain
          FROM master.operating_organization
         WHERE tenant_id = NEW.tenant_id
           AND id = NEW.operating_organization_id;
        IF (v_role = 'supplier' AND v_domain NOT IN ('procurement', 'both'))
           OR (v_role = 'customer' AND v_domain NOT IN ('sales', 'both')) THEN
            RAISE EXCEPTION 'Partner role % is incompatible with organization domain %',
                v_role, v_domain
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_legal_entity_partner_link()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_category master.business_partner_category_d;
BEGIN
    SELECT partner_category INTO v_category
      FROM master.business_partner
     WHERE tenant_id = NEW.tenant_id AND id = NEW.business_partner_id;
    IF v_category IS DISTINCT FROM 'internal'::master.business_partner_category_d THEN
        RAISE EXCEPTION 'Legal entity self mapping requires an internal business partner'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_supplier_remittance_link()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_partner_id uuid;
    v_owner_id uuid;
    v_owner_type text;
    v_company_id uuid;
    v_account_status master.bank_account_status_d;
BEGIN
    IF NEW.preferred_remittance_bank_link_id IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT business_partner_id INTO v_partner_id
      FROM master.supplier
     WHERE tenant_id = NEW.tenant_id AND id = NEW.supplier_id;
    SELECT link.owner_id, link.owner_type, link.company_code_id, account.status
      INTO v_owner_id, v_owner_type, v_company_id, v_account_status
      FROM master.bank_account_link link
      JOIN master.bank_account account
        ON account.tenant_id = link.tenant_id
       AND account.id = link.bank_account_id
     WHERE link.tenant_id = NEW.tenant_id
       AND link.id = NEW.preferred_remittance_bank_link_id
       AND link.relationship_role = 'beneficiary';
    IF NOT FOUND OR v_account_status <> 'active'
       OR v_owner_type <> 'business_partner'
       OR v_owner_id <> v_partner_id
       OR (v_company_id IS NOT NULL AND v_company_id <> NEW.company_code_id) THEN
        RAISE EXCEPTION 'Preferred remittance link is not an active compatible supplier-beneficiary account'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_intercompany_pair()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF NEW.counterparty_supplier_profile_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
             FROM master.company_code_supplier_profile profile
            WHERE profile.tenant_id = NEW.tenant_id
              AND profile.id = NEW.counterparty_supplier_profile_id
              AND profile.company_code_id = NEW.source_company_code_id
       ) THEN
        RAISE EXCEPTION 'Counterparty supplier profile must belong to source company'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.mirror_customer_profile_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
             FROM master.company_code_customer_profile profile
            WHERE profile.tenant_id = NEW.tenant_id
              AND profile.id = NEW.mirror_customer_profile_id
              AND profile.company_code_id = NEW.counterparty_company_code_id
       ) THEN
        RAISE EXCEPTION 'Mirror customer profile must belong to counterparty company'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
