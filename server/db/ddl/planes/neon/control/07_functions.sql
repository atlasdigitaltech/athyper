CREATE OR REPLACE FUNCTION control.fn_validate_owner_type_target(
    p_source_type text,
    p_target_schema text,
    p_target_table text,
    p_pk_column text,
    p_is_tenant_scoped boolean,
    p_tenant_column text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, control, master
AS $$
DECLARE
    v_relid              oid;
    v_relkind            "char";
    v_pk_attnum          smallint;
    v_tenant_attnum      smallint;
    v_tenant_not_null    boolean;
    v_rls_enabled        boolean;
    v_rls_forced         boolean;
    v_has_rls_policy     boolean;
    v_has_scoped_unique  boolean;
    v_has_tenant_fk      boolean;
BEGIN
    IF p_source_type = 'customer'
       AND p_target_schema !~ '^ext_[a-z][a-z0-9_]*$' THEN
        RAISE EXCEPTION
            'Customer owner targets must be in a certified ext_* schema, not %',
            p_target_schema
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_target_schema IN (
        'pg_catalog', 'information_schema', 'authz', 'audit',
        'event', 'runtime_meta', 'ops', 'control', 'shared'
    ) THEN
        RAISE EXCEPTION
            'Schema % is not an allowed owner target', p_target_schema
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT c.oid, c.relkind, c.relrowsecurity, c.relforcerowsecurity
      INTO v_relid, v_relkind, v_rls_enabled, v_rls_forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = p_target_schema
       AND c.relname = p_target_table;

    IF v_relid IS NULL OR v_relkind NOT IN ('r', 'p') THEN
        RAISE EXCEPTION
            'Owner target %.% is not a table or partitioned table',
            p_target_schema, p_target_table
            USING ERRCODE = 'undefined_table';
    END IF;

    SELECT a.attnum
      INTO v_pk_attnum
      FROM pg_attribute a
     WHERE a.attrelid = v_relid
       AND a.attname = p_pk_column
       AND NOT a.attisdropped
       AND a.atttypid = 'uuid'::regtype;

    IF v_pk_attnum IS NULL THEN
        RAISE EXCEPTION
            'Owner target %.% must have UUID column %',
            p_target_schema, p_target_table, p_pk_column
            USING ERRCODE = 'datatype_mismatch';
    END IF;

    IF p_is_tenant_scoped THEN
        SELECT a.attnum, a.attnotnull
          INTO v_tenant_attnum, v_tenant_not_null
          FROM pg_attribute a
         WHERE a.attrelid = v_relid
           AND a.attname = p_tenant_column
           AND NOT a.attisdropped
           AND a.atttypid = 'uuid'::regtype;

        IF v_tenant_attnum IS NULL THEN
            RAISE EXCEPTION
                'Tenant-scoped owner target %.% must have UUID column %',
                p_target_schema, p_target_table, p_tenant_column
                USING ERRCODE = 'datatype_mismatch';
        END IF;
    END IF;

    IF p_source_type = 'customer' THEN
        IF NOT p_is_tenant_scoped OR p_tenant_column <> 'tenant_id' THEN
            RAISE EXCEPTION
                'Customer owner targets must be tenant scoped through tenant_id'
                USING ERRCODE = 'check_violation';
        END IF;

        IF NOT COALESCE(v_tenant_not_null, false) THEN
            RAISE EXCEPTION
                'Customer owner target %.%.tenant_id must be NOT NULL',
                p_target_schema, p_target_table
                USING ERRCODE = 'not_null_violation';
        END IF;

        IF NOT v_rls_enabled OR NOT v_rls_forced THEN
            RAISE EXCEPTION
                'Customer owner target %.% must ENABLE and FORCE RLS',
                p_target_schema, p_target_table
                USING ERRCODE = 'insufficient_privilege';
        END IF;

        SELECT EXISTS (
            SELECT 1 FROM pg_policy WHERE polrelid = v_relid
        ) INTO v_has_rls_policy;

        IF NOT v_has_rls_policy THEN
            RAISE EXCEPTION
                'Customer owner target %.% requires at least one RLS policy',
                p_target_schema, p_target_table
                USING ERRCODE = 'insufficient_privilege';
        END IF;

        SELECT EXISTS (
            SELECT 1
              FROM pg_index i
             WHERE i.indrelid = v_relid
               AND i.indisunique
               AND i.indnkeyatts = 2
               AND (
                   SELECT array_agg(k.attnum::smallint ORDER BY k.ordinality)
                     FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ordinality)
                    WHERE k.ordinality <= i.indnkeyatts
               ) IN (
                   ARRAY[v_tenant_attnum, v_pk_attnum]::smallint[],
                   ARRAY[v_pk_attnum, v_tenant_attnum]::smallint[]
               )
        ) INTO v_has_scoped_unique;

        IF NOT v_has_scoped_unique THEN
            RAISE EXCEPTION
                'Customer owner target %.% requires UNIQUE (tenant_id, %)',
                p_target_schema, p_target_table, p_pk_column
                USING ERRCODE = 'invalid_table_definition';
        END IF;

        SELECT EXISTS (
            SELECT 1
              FROM pg_constraint c
             WHERE c.conrelid = v_relid
               AND c.contype = 'f'
               AND c.confrelid = 'master.tenant'::regclass
               AND v_tenant_attnum = ANY (c.conkey)
        ) INTO v_has_tenant_fk;

        IF NOT v_has_tenant_fk THEN
            RAISE EXCEPTION
                'Customer owner target %.% requires a tenant_id FK to master.tenant',
                p_target_schema, p_target_table
                USING ERRCODE = 'invalid_table_definition';
        END IF;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION control.fn_register_owner_type(
    p_tenant_id uuid,
    p_code text,
    p_name text,
    p_description text,
    p_category text,
    p_target_schema text,
    p_target_table text,
    p_pk_column text DEFAULT 'id',
    p_tenant_column text DEFAULT 'tenant_id',
    p_supports_address boolean DEFAULT false,
    p_supports_contact boolean DEFAULT false,
    p_supports_external_reference boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, control, master, shared
AS $$
DECLARE
    v_id     uuid;
    v_actor  uuid;
BEGIN
    IF p_tenant_id IS DISTINCT FROM shared.current_tenant_id() THEN
        RAISE EXCEPTION 'Owner type tenant does not match the current tenant'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM control.owner_type
         WHERE tenant_id IS NULL
           AND code = lower(btrim(p_code))
    ) THEN
        RAISE EXCEPTION 'Customer owner type code % shadows a platform code', p_code
            USING ERRCODE = 'unique_violation';
    END IF;

    PERFORM control.fn_validate_owner_type_target(
        'customer', p_target_schema, p_target_table,
        p_pk_column, true, p_tenant_column
    );

    v_actor := nullif(
        current_setting('app.current_principal_id', true), ''
    )::uuid;
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'Current principal context is required'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    INSERT INTO control.owner_type (
        tenant_id, code, name, description, category, source_type,
        target_schema, target_table, pk_column,
        is_tenant_scoped, tenant_column,
        supports_address, supports_contact, supports_external_reference,
        status, created_by
    )
    VALUES (
        p_tenant_id, lower(btrim(p_code)), btrim(p_name), p_description,
        p_category, 'customer',
        p_target_schema, p_target_table, p_pk_column,
        true, p_tenant_column,
        p_supports_address, p_supports_contact, p_supports_external_reference,
        'draft', v_actor
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION control.fn_activate_owner_type(
    p_tenant_id uuid,
    p_owner_type_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, control, master, shared
AS $$
DECLARE
    v_owner  control.owner_type%ROWTYPE;
    v_actor  uuid;
BEGIN
    IF p_tenant_id IS DISTINCT FROM shared.current_tenant_id() THEN
        RAISE EXCEPTION 'Owner type tenant does not match the current tenant'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT *
      INTO v_owner
      FROM control.owner_type
     WHERE id = p_owner_type_id
       AND tenant_id = p_tenant_id
       AND source_type = 'customer'
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Customer owner type % not found', p_owner_type_id
            USING ERRCODE = 'no_data_found';
    END IF;

    IF v_owner.status <> 'draft' THEN
        RAISE EXCEPTION 'Only draft owner types can be activated'
            USING ERRCODE = 'check_violation';
    END IF;

    PERFORM control.fn_validate_owner_type_target(
        v_owner.source_type, v_owner.target_schema, v_owner.target_table,
        v_owner.pk_column, v_owner.is_tenant_scoped, v_owner.tenant_column
    );

    IF v_owner.supports_address
       AND NOT EXISTS (
           SELECT 1 FROM control.owner_type_purpose
            WHERE owner_type_id = v_owner.id AND capability = 'address'
       ) THEN
        RAISE EXCEPTION 'Owner type % requires an address purpose',
            v_owner.code USING ERRCODE = 'check_violation';
    END IF;

    IF v_owner.supports_contact
       AND NOT EXISTS (
           SELECT 1 FROM control.owner_type_purpose
            WHERE owner_type_id = v_owner.id AND capability = 'contact'
       ) THEN
        RAISE EXCEPTION 'Owner type % requires a contact purpose',
            v_owner.code USING ERRCODE = 'check_violation';
    END IF;

    v_actor := nullif(
        current_setting('app.current_principal_id', true), ''
    )::uuid;
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'Current principal context is required'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    UPDATE control.owner_type
       SET status = 'active',
           status_changed_at = clock_timestamp(),
           status_changed_by = v_actor,
           updated_at = clock_timestamp(),
           updated_by = v_actor
     WHERE id = v_owner.id;
END;
$$;

CREATE OR REPLACE FUNCTION control.fn_deprecate_owner_type(
    p_tenant_id uuid,
    p_owner_type_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, control, master, shared
AS $$
DECLARE
    v_actor uuid;
BEGIN
    IF p_tenant_id IS DISTINCT FROM shared.current_tenant_id() THEN
        RAISE EXCEPTION 'Owner type tenant does not match the current tenant'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_actor := nullif(
        current_setting('app.current_principal_id', true), ''
    )::uuid;
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'Current principal context is required'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    UPDATE control.owner_type
       SET status = 'deprecated',
           status_changed_at = clock_timestamp(),
           status_changed_by = v_actor,
           updated_at = clock_timestamp(),
           updated_by = v_actor
     WHERE id = p_owner_type_id
       AND tenant_id = p_tenant_id
       AND source_type = 'customer'
       AND status IN ('draft', 'active');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active or draft customer owner type % not found',
            p_owner_type_id USING ERRCODE = 'no_data_found';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION control.fn_add_owner_type_purpose(
    p_tenant_id uuid,
    p_owner_type_id uuid,
    p_capability text,
    p_purpose_code text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, control, master, shared
AS $$
DECLARE
    v_actor uuid;
BEGIN
    IF p_tenant_id IS DISTINCT FROM shared.current_tenant_id() THEN
        RAISE EXCEPTION 'Owner type tenant does not match the current tenant'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM control.owner_type
         WHERE id = p_owner_type_id
           AND tenant_id = p_tenant_id
           AND source_type = 'customer'
           AND status IN ('draft', 'active')
    ) THEN
        RAISE EXCEPTION 'Configurable customer owner type % not found',
            p_owner_type_id USING ERRCODE = 'no_data_found';
    END IF;

    v_actor := nullif(
        current_setting('app.current_principal_id', true), ''
    )::uuid;
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'Current principal context is required'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    INSERT INTO control.owner_type_purpose (
        owner_type_id, capability, purpose_code, created_by
    )
    VALUES (
        p_owner_type_id,
        lower(btrim(p_capability)),
        lower(btrim(p_purpose_code)),
        v_actor
    )
    ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION control.fn_remove_owner_type_purpose(
    p_tenant_id uuid,
    p_owner_type_id uuid,
    p_capability text,
    p_purpose_code text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, control, master, shared
AS $$
BEGIN
    IF p_tenant_id IS DISTINCT FROM shared.current_tenant_id() THEN
        RAISE EXCEPTION 'Owner type tenant does not match the current tenant'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF nullif(
        current_setting('app.current_principal_id', true), ''
    )::uuid IS NULL THEN
        RAISE EXCEPTION 'Current principal context is required'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    DELETE FROM control.owner_type_purpose p
     USING control.owner_type ot
     WHERE p.owner_type_id = ot.id
       AND ot.id = p_owner_type_id
       AND ot.tenant_id = p_tenant_id
       AND ot.source_type = 'customer'
       AND ot.status IN ('draft', 'active')
       AND p.capability = lower(btrim(p_capability))
       AND p.purpose_code = lower(btrim(p_purpose_code));

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Configurable owner purpose not found'
            USING ERRCODE = 'no_data_found';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_subscription_plan_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.code IS DISTINCT FROM OLD.code
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION
            'Subscription plan identity and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status = 'deprecated' AND NEW.status <> 'deprecated' THEN
        RAISE EXCEPTION 'Deprecated subscription plans cannot be reactivated'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_owner_type_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Owner types cannot be deleted; deprecate instead'
            USING ERRCODE = 'restrict_violation';
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.code IS DISTINCT FROM OLD.code
       OR NEW.source_type IS DISTINCT FROM OLD.source_type
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION
            'Owner type identity, source, and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status IN ('active', 'deprecated')
       AND (
           NEW.target_schema IS DISTINCT FROM OLD.target_schema
           OR NEW.target_table IS DISTINCT FROM OLD.target_table
           OR NEW.pk_column IS DISTINCT FROM OLD.pk_column
           OR NEW.is_tenant_scoped IS DISTINCT FROM OLD.is_tenant_scoped
           OR NEW.tenant_column IS DISTINCT FROM OLD.tenant_column
           OR NEW.supports_address IS DISTINCT FROM OLD.supports_address
           OR NEW.supports_contact IS DISTINCT FROM OLD.supports_contact
           OR NEW.supports_external_reference
                IS DISTINCT FROM OLD.supports_external_reference
           OR NEW.supports_bank_account
                IS DISTINCT FROM OLD.supports_bank_account
       ) THEN
        RAISE EXCEPTION 'Activated owner type routing and capabilities are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status = 'deprecated' AND NEW.status <> 'deprecated' THEN
        RAISE EXCEPTION 'Deprecated owner types cannot be reactivated'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status = 'active' AND NEW.status = 'draft' THEN
        RAISE EXCEPTION 'Active owner types cannot return to draft'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status = 'active' AND NEW.status = 'deprecated'
       AND (
           EXISTS (
               SELECT 1 FROM master.address_link
                WHERE owner_type_id = OLD.id
                  AND (effective_until IS NULL
                       OR effective_until > CURRENT_DATE)
           )
           OR EXISTS (
               SELECT 1 FROM master.contact_link
                WHERE owner_type_id = OLD.id
                  AND status = 'active'
           )
           OR EXISTS (
               SELECT 1 FROM master.bank_account_link
                WHERE owner_type_id = OLD.id
                  AND effective_from <= CURRENT_DATE
                  AND (
                      effective_until IS NULL
                      OR effective_until > CURRENT_DATE
                  )
           )
       ) THEN
        RAISE EXCEPTION
            'Owner type % cannot be deprecated while active links exist',
            OLD.code USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_owner_type_purpose_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control, master
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION
            'Owner type purposes are immutable; remove and add a purpose instead'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.capability = 'address'
       AND EXISTS (
           SELECT 1
             FROM master.address_link
            WHERE owner_type_id = OLD.owner_type_id
              AND purpose = OLD.purpose_code
              AND (
                  effective_until IS NULL
                  OR effective_until > CURRENT_DATE
              )
       ) THEN
        RAISE EXCEPTION 'Address purpose % is still in use',
            OLD.purpose_code USING ERRCODE = 'restrict_violation';
    END IF;

    IF OLD.capability = 'contact'
       AND EXISTS (
           SELECT 1
             FROM master.contact_link
            WHERE owner_type_id = OLD.owner_type_id
              AND purpose = OLD.purpose_code
              AND status = 'active'
       ) THEN
        RAISE EXCEPTION 'Contact purpose % is still in use',
            OLD.purpose_code USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_owner_type_validate_target()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    PERFORM control.fn_validate_owner_type_target(
        NEW.source_type, NEW.target_schema, NEW.target_table,
        NEW.pk_column, NEW.is_tenant_scoped, NEW.tenant_column
    );
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_owner_type_purpose_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
DECLARE
    v_supports boolean;
BEGIN
    SELECT CASE NEW.capability
               WHEN 'address' THEN supports_address
               WHEN 'contact' THEN supports_contact
               WHEN 'bank_account' THEN supports_bank_account
           END
      INTO v_supports
      FROM control.owner_type
     WHERE id = NEW.owner_type_id;

    IF NOT COALESCE(v_supports, false) THEN
        RAISE EXCEPTION 'Owner type does not support % purposes', NEW.capability
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;
