CREATE OR REPLACE FUNCTION mesh.trg_validate_profile_trade_role()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, mesh
AS $$
DECLARE
    v_role mesh.network_account_role_d;
BEGIN
    SELECT network_role INTO v_role
      FROM mesh.network_account
     WHERE tenant_id = NEW.tenant_id AND id = NEW.network_account_id;
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'Network account does not exist'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF (NEW.trade_role = 'supplier' AND v_role NOT IN ('supplier', 'both'))
       OR (NEW.trade_role = 'customer' AND v_role NOT IN ('buyer', 'both')) THEN
        RAISE EXCEPTION 'Trade role % is incompatible with network role %',
            NEW.trade_role, v_role
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION mesh.trg_validate_tax_registration_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, mesh, control
AS $$
BEGIN
    NEW.registration_type_code := lower(btrim(NEW.registration_type_code));
    NEW.registration_number := upper(regexp_replace(
        btrim(NEW.registration_number), '\s+', '', 'g'
    ));
    IF NOT control.lookup_value_is_active(
        'mesh.tax_registration_type',
        NEW.registration_type_code,
        NEW.tenant_id
    ) THEN
        RAISE EXCEPTION 'Unknown Mesh tax registration type %',
            NEW.registration_type_code
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION mesh.trg_normalize_bank_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, mesh
AS $$
BEGIN
    IF TG_TABLE_NAME = 'bank_party' THEN
        NEW.code := lower(btrim(NEW.code));
        NEW.name := btrim(NEW.name);
        NEW.bic := nullif(upper(regexp_replace(NEW.bic, '\s+', '', 'g')), '');
    ELSE
        NEW.code := nullif(lower(btrim(NEW.code)), '');
        NEW.name := nullif(btrim(NEW.name), '');
        NEW.account_holder_name := btrim(NEW.account_holder_name);
        NEW.account_id_value := upper(regexp_replace(
            NEW.account_id_value, '[^A-Za-z0-9]', '', 'g'
        ));
        NEW.account_last4 := right(NEW.account_id_value, 4);
        NEW.bic_override := nullif(upper(regexp_replace(
            NEW.bic_override, '\s+', '', 'g'
        )), '');
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION mesh.trg_guard_bank_account_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, mesh
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.network_account_id IS DISTINCT FROM OLD.network_account_id
       OR NEW.account_id_type IS DISTINCT FROM OLD.account_id_type
       OR (
           EXISTS (
               SELECT 1 FROM mesh.bank_account_link link
                WHERE link.tenant_id = OLD.tenant_id
                  AND link.bank_account_id = OLD.id
           )
           AND NEW.account_id_value IS DISTINCT FROM OLD.account_id_value
       )
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'Linked Mesh bank-account identity is immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION mesh.trg_validate_bank_disclosure()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, mesh
AS $$
DECLARE
    v_relationship mesh.network_relationship%ROWTYPE;
BEGIN
    SELECT * INTO v_relationship
      FROM mesh.network_relationship
     WHERE id = NEW.network_relationship_id
       AND status = 'active';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bank disclosure requires an active relationship'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW.purpose = 'settlement' THEN
        IF (NEW.owner_tenant_id, NEW.owner_account_id,
            NEW.recipient_tenant_id, NEW.recipient_account_id)
           IS DISTINCT FROM
           (v_relationship.supplier_tenant_id, v_relationship.supplier_account_id,
            v_relationship.buyer_tenant_id, v_relationship.buyer_account_id) THEN
            RAISE EXCEPTION 'Settlement account must be disclosed supplier-to-buyer'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSE
        IF (NEW.owner_tenant_id, NEW.owner_account_id,
            NEW.recipient_tenant_id, NEW.recipient_account_id)
           IS DISTINCT FROM
           (v_relationship.buyer_tenant_id, v_relationship.buyer_account_id,
            v_relationship.supplier_tenant_id, v_relationship.supplier_account_id) THEN
            RAISE EXCEPTION 'Refund account must be disclosed buyer-to-supplier'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION mesh.trg_guard_bank_disclosure()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, mesh
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.owner_tenant_id IS DISTINCT FROM OLD.owner_tenant_id
       OR NEW.owner_account_id IS DISTINCT FROM OLD.owner_account_id
       OR NEW.bank_account_id IS DISTINCT FROM OLD.bank_account_id
       OR NEW.network_relationship_id IS DISTINCT FROM OLD.network_relationship_id
       OR NEW.recipient_tenant_id IS DISTINCT FROM OLD.recipient_tenant_id
       OR NEW.recipient_account_id IS DISTINCT FROM OLD.recipient_account_id
       OR NEW.purpose IS DISTINCT FROM OLD.purpose
       OR NEW.disclosed_at IS DISTINCT FROM OLD.disclosed_at
       OR NEW.disclosed_by IS DISTINCT FROM OLD.disclosed_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'Mesh bank-disclosure coordinates and evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.status <> 'active' AND NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'Terminal bank disclosure cannot transition'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'revoked'
       AND (NEW.revoked_at IS NULL OR NEW.revoked_by IS NULL) THEN
        RAISE EXCEPTION 'Revocation requires evidence'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
