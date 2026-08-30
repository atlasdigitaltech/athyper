CREATE OR REPLACE FUNCTION master.trg_normalize_contact_person()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    NEW.contact_name := btrim(NEW.contact_name);
    NEW.business_title := nullif(btrim(NEW.business_title), '');
    NEW.department_name := nullif(btrim(NEW.department_name), '');
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_contact_person_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master, control
AS $$
DECLARE
    v_schema text;
    v_table text;
    v_pk text;
    v_tenant_column text;
    v_scoped boolean;
    v_exists boolean;
BEGIN
    SELECT target_schema, target_table, pk_column, tenant_column, is_tenant_scoped
      INTO v_schema, v_table, v_pk, v_tenant_column, v_scoped
      FROM control.owner_type
     WHERE id = NEW.owner_type_id
       AND status = 'active'
       AND supports_contact
       AND (tenant_id IS NULL OR tenant_id = NEW.tenant_id);

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Contact owner type % is unavailable for tenant %',
            NEW.owner_type_id, NEW.tenant_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_scoped THEN
        EXECUTE format(
            'SELECT EXISTS (SELECT 1 FROM %I.%I WHERE %I = $1 AND %I = $2)',
            v_schema, v_table, v_pk, v_tenant_column
        ) INTO v_exists USING NEW.owner_id, NEW.tenant_id;
    ELSE
        EXECUTE format(
            'SELECT EXISTS (SELECT 1 FROM %I.%I WHERE %I = $1)',
            v_schema, v_table, v_pk
        ) INTO v_exists USING NEW.owner_id;
    END IF;

    IF NOT v_exists THEN
        RAISE EXCEPTION 'Contact owner % does not exist for owner type %',
            NEW.owner_id, NEW.owner_type_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_contact_person_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.owner_type_id IS DISTINCT FROM OLD.owner_type_id
       OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'master.contact_person identity and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_contact_person_role()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master, control
AS $$
BEGIN
    NEW.role_code := lower(btrim(NEW.role_code));
    IF NOT control.lookup_value_is_active(
        'master.contact_role', NEW.role_code, NEW.tenant_id
    ) THEN
        RAISE EXCEPTION 'Unknown or inactive contact role % for tenant %',
            NEW.role_code, NEW.tenant_id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_contact_person_role()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.contact_person_id IS DISTINCT FROM OLD.contact_person_id
       OR NEW.role_code IS DISTINCT FROM OLD.role_code
       OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'master.contact_person_role assignment coordinates are immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_normalize_address()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    NEW.address_type := nullif(btrim(NEW.address_type), '');
    NEW.address_kind := nullif(lower(btrim(NEW.address_kind)), '');
    NEW.street_name := nullif(btrim(NEW.street_name), '');
    NEW.house_number := nullif(btrim(NEW.house_number), '');
    NEW.house_number_suffix := nullif(btrim(NEW.house_number_suffix), '');
    NEW.building_name := nullif(btrim(NEW.building_name), '');
    NEW.floor := nullif(btrim(NEW.floor), '');
    NEW.room := nullif(btrim(NEW.room), '');
    NEW.entrance := nullif(btrim(NEW.entrance), '');
    NEW.unit := nullif(btrim(NEW.unit), '');
    NEW.line1 := nullif(btrim(NEW.line1), '');
    NEW.line2 := nullif(btrim(NEW.line2), '');
    NEW.line3 := nullif(btrim(NEW.line3), '');
    NEW.city := nullif(btrim(NEW.city), '');
    NEW.dependent_locality := nullif(btrim(NEW.dependent_locality), '');
    NEW.region := nullif(btrim(NEW.region), '');
    NEW.state_region_code := nullif(upper(btrim(NEW.state_region_code)), '');
    NEW.postal_code := nullif(btrim(NEW.postal_code), '');
    NEW.po_box := nullif(btrim(NEW.po_box), '');
    NEW.po_box_postal_code := nullif(btrim(NEW.po_box_postal_code), '');
    NEW.po_box_city := nullif(btrim(NEW.po_box_city), '');
    NEW.delivery_service_type := nullif(btrim(NEW.delivery_service_type), '');
    NEW.delivery_service_number := nullif(btrim(NEW.delivery_service_number), '');
    NEW.country_code := nullif(upper(btrim(NEW.country_code::text)), '')::character(2);
    NEW.timezone_code := nullif(lower(btrim(NEW.timezone_code)), '');
    NEW.normalization_version := COALESCE(NEW.normalization_version, 'v1');
    NEW.format_version := COALESCE(NEW.format_version, 'v1');
    NEW.formatted_address := nullif(btrim(NEW.formatted_address), '');
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_address_postal_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master, shared
AS $$
BEGIN
    IF NOT shared.fn_validate_postal_code(NEW.country_code::text, NEW.postal_code) THEN
        RAISE EXCEPTION 'master.address postal code "%" does not match country "%"',
            NEW.postal_code, NEW.country_code
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_address_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF OLD.status <> 'draft' AND (
            NEW.id IS DISTINCT FROM OLD.id
            OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
            OR NEW.address_type IS DISTINCT FROM OLD.address_type
            OR NEW.address_kind IS DISTINCT FROM OLD.address_kind
            OR NEW.street_name IS DISTINCT FROM OLD.street_name
            OR NEW.house_number IS DISTINCT FROM OLD.house_number
            OR NEW.house_number_suffix IS DISTINCT FROM OLD.house_number_suffix
            OR NEW.building_name IS DISTINCT FROM OLD.building_name
            OR NEW.floor IS DISTINCT FROM OLD.floor
            OR NEW.room IS DISTINCT FROM OLD.room
            OR NEW.entrance IS DISTINCT FROM OLD.entrance
            OR NEW.unit IS DISTINCT FROM OLD.unit
            OR NEW.line1 IS DISTINCT FROM OLD.line1
            OR NEW.line2 IS DISTINCT FROM OLD.line2
            OR NEW.line3 IS DISTINCT FROM OLD.line3
            OR NEW.city IS DISTINCT FROM OLD.city
            OR NEW.dependent_locality IS DISTINCT FROM OLD.dependent_locality
            OR NEW.region IS DISTINCT FROM OLD.region
            OR NEW.state_region_code IS DISTINCT FROM OLD.state_region_code
            OR NEW.postal_code IS DISTINCT FROM OLD.postal_code
            OR NEW.po_box IS DISTINCT FROM OLD.po_box
            OR NEW.po_box_postal_code IS DISTINCT FROM OLD.po_box_postal_code
            OR NEW.po_box_city IS DISTINCT FROM OLD.po_box_city
            OR NEW.delivery_service_type IS DISTINCT FROM OLD.delivery_service_type
            OR NEW.delivery_service_number IS DISTINCT FROM OLD.delivery_service_number
            OR NEW.country_code IS DISTINCT FROM OLD.country_code
            OR NEW.timezone_code IS DISTINCT FROM OLD.timezone_code
            OR NEW.normalized_hash IS DISTINCT FROM OLD.normalized_hash
            OR NEW.normalization_version IS DISTINCT FROM OLD.normalization_version
            OR NEW.formatted_address IS DISTINCT FROM OLD.formatted_address
            OR NEW.format_version IS DISTINCT FROM OLD.format_version
            OR NEW.latitude IS DISTINCT FROM OLD.latitude
            OR NEW.longitude IS DISTINCT FROM OLD.longitude
            OR NEW.created_at IS DISTINCT FROM OLD.created_at
            OR NEW.created_by IS DISTINCT FROM OLD.created_by
        ) THEN
            RAISE EXCEPTION 'master.address identity and core fields are immutable'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_address_link_usage()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        IF NEW.usage_status IS DISTINCT FROM OLD.usage_status OR TG_OP = 'INSERT' THEN
            IF NEW.usage_status IN ('suspended', 'prohibited') THEN
                NEW.usage_denied_at := COALESCE(NEW.usage_denied_at, clock_timestamp());
                NEW.usage_denied_by := COALESCE(
                    NEW.usage_denied_by,
                    NULLIF(current_setting('app.current_principal_id', true), '')::uuid
                );
                IF NEW.usage_denied_reason_code IS NULL OR btrim(NEW.usage_denied_reason_code) = '' THEN
                    RAISE EXCEPTION 'master.address_link usage_status=% requires usage_denied_reason_code',
                        NEW.usage_status
                        USING ERRCODE = 'check_violation';
                END IF;
                IF NEW.usage_denied_by IS NULL THEN
                    RAISE EXCEPTION 'master.address_link usage governance requires usage_denied_by for non-active states'
                        USING ERRCODE = 'check_violation';
                END IF;
            ELSE
                NEW.usage_denied_reason_code := NULL;
                NEW.usage_denied_at := NULL;
                NEW.usage_denied_by := NULL;
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_guard_address_event_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
BEGIN
    RAISE EXCEPTION 'master.address_event is append-only; create a new event instead'
        USING ERRCODE = 'object_not_in_prerequisite_state';
END;
$$;

CREATE OR REPLACE FUNCTION master.trg_validate_address_link_target_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_status text;
BEGIN
    SELECT status
      INTO v_status
      FROM master.address
     WHERE tenant_id = NEW.tenant_id
       AND id = NEW.address_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'master.address_link references unknown address %',
            NEW.address_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW.usage_status = 'active' AND v_status <> 'active' THEN
        RAISE EXCEPTION 'master.address_link cannot be active while address % is %',
            NEW.address_id, v_status
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;
