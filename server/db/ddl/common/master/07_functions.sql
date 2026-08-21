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
