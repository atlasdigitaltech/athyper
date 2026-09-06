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

CREATE OR REPLACE FUNCTION control.trg_guard_risk_source_config_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.source_code IS DISTINCT FROM OLD.source_code
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'risk source coordinates and creation evidence are immutable'
            USING ERRCODE = '22000';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_business_partner_control_lookup()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
DECLARE
    v_domain text;
    v_code text;
BEGIN
    IF TG_TABLE_NAME = 'business_partner_qualification' THEN
        NEW.qualification_type_code := lower(btrim(NEW.qualification_type_code));
        v_domain := 'control.business_partner_qualification_type';
        v_code := NEW.qualification_type_code;
    ELSIF TG_ARGV[0] = 'operation' THEN
        NEW.operation_code := lower(btrim(NEW.operation_code));
        v_domain := 'control.business_partner_block_operation';
        v_code := NEW.operation_code;
    ELSE
        IF NEW.reason_code IS NULL THEN
            RETURN NEW;
        END IF;
        NEW.reason_code := lower(btrim(NEW.reason_code));
        v_domain := 'control.business_partner_block_reason';
        v_code := NEW.reason_code;
    END IF;

    IF NOT control.lookup_value_is_active(v_domain, v_code, NEW.tenant_id) THEN
        RAISE EXCEPTION 'Unknown or inactive lookup value %/%', v_domain, v_code
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_business_partner_control_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control, master
AS $$
DECLARE
    v_role master.partner_role_d;
BEGIN
    -- The command validates the exact role and normalized scope before inserting
    -- the head. Compatibility-column validation is intentionally bypassed when
    -- those retired writer inputs are absent.
    IF current_setting('app.normalized_decision_scope_write', true) = 'on' THEN
        RETURN NEW;
    END IF;
    IF TG_TABLE_NAME = 'business_partner_qualification' THEN
        v_role := NEW.partner_role;
    ELSIF TG_TABLE_NAME = 'supplier_preference_designation' THEN
        v_role := 'supplier';
    ELSIF NEW.partner_role_scope <> 'all' THEN
        v_role := NEW.partner_role_scope::text::master.partner_role_d;
    END IF;

    IF v_role = 'supplier' AND NOT EXISTS (
        SELECT 1
          FROM master.supplier
         WHERE tenant_id = NEW.tenant_id
           AND business_partner_id = NEW.business_partner_id
           AND status <> 'archived'
    ) THEN
        RAISE EXCEPTION 'Business partner % has no supplier role',
            NEW.business_partner_id USING ERRCODE = 'check_violation';
    ELSIF v_role = 'customer' AND NOT EXISTS (
        SELECT 1
          FROM master.customer
         WHERE tenant_id = NEW.tenant_id
           AND business_partner_id = NEW.business_partner_id
           AND status <> 'archived'
    ) THEN
        RAISE EXCEPTION 'Business partner % has no customer role',
            NEW.business_partner_id USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.operating_organization_id IS NOT NULL
       AND NEW.company_code_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
             FROM master.operating_organization_company_assignment assignment
            WHERE assignment.tenant_id = NEW.tenant_id
              AND assignment.operating_organization_id =
                  NEW.operating_organization_id
              AND assignment.company_code_id = NEW.company_code_id
              AND assignment.status = 'active'
              AND assignment.effective_from <= COALESCE(NEW.effective_from, CURRENT_DATE)
              AND (
                  assignment.effective_until IS NULL
                  OR assignment.effective_until > COALESCE(NEW.effective_from, CURRENT_DATE)
              )
              AND (TG_TABLE_NAME <> 'supplier_preference_designation'
                   OR assignment.effective_until IS NULL
                   OR (NEW.effective_until IS NOT NULL AND assignment.effective_until >= NEW.effective_until))
       ) THEN
        RAISE EXCEPTION
            'Company code % does not actively participate in operating organization %',
            NEW.company_code_id, NEW.operating_organization_id
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_TABLE_NAME = 'business_partner_qualification'
       AND (to_jsonb(NEW)->>'commodity_capability_id') IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
             FROM master.business_partner_commodity_capability capability
            WHERE capability.tenant_id = NEW.tenant_id
              AND capability.id = (to_jsonb(NEW)->>'commodity_capability_id')::uuid
              AND capability.business_partner_id = NEW.business_partner_id
              AND capability.partner_role = (to_jsonb(NEW)->>'partner_role')::master.partner_role_d
       ) THEN
        RAISE EXCEPTION
            'Commodity capability does not belong to the selected partner role'
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_TABLE_NAME = 'supplier_preference_designation' AND NOT EXISTS (
        SELECT 1 FROM master.supplier supplier
         WHERE supplier.tenant_id = NEW.tenant_id
           AND supplier.id = (to_jsonb(NEW)->>'supplier_id')::uuid
           AND supplier.business_partner_id = NEW.business_partner_id
           AND supplier.status <> 'archived'
    ) THEN
        RAISE EXCEPTION 'Supplier does not belong to the selected business partner'
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_TABLE_NAME = 'supplier_preference_designation' AND NOT EXISTS (
        SELECT 1 FROM master.business_partner_operating_organization_assignment assignment
         WHERE assignment.tenant_id = NEW.tenant_id
           AND assignment.business_partner_id = NEW.business_partner_id
           AND assignment.operating_organization_id = NEW.operating_organization_id
           AND assignment.partner_role = 'supplier'
           AND assignment.status = 'active'
           AND assignment.effective_from <= NEW.effective_from
           AND (assignment.effective_until IS NULL OR assignment.effective_until > NEW.effective_from)
           AND (assignment.effective_until IS NULL OR
                (NEW.effective_until IS NOT NULL AND assignment.effective_until >= NEW.effective_until))
    ) THEN
        RAISE EXCEPTION 'Supplier is not actively assigned to the selected operating organization at effective start'
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_TABLE_NAME = 'supplier_preference_designation'
       AND (to_jsonb(NEW)->>'commodity_category_id') IS NOT NULL
       AND NOT EXISTS (
        SELECT 1 FROM master.business_partner_commodity_capability capability
         WHERE capability.tenant_id = NEW.tenant_id
           AND capability.business_partner_id = NEW.business_partner_id
           AND capability.partner_role = 'supplier'
           AND capability.commodity_category_id = (to_jsonb(NEW)->>'commodity_category_id')::uuid
           AND capability.status = 'active'
           AND capability.effective_from <= NEW.effective_from
           AND (capability.effective_until IS NULL OR capability.effective_until > NEW.effective_from)
           AND (capability.effective_until IS NULL OR
                (NEW.effective_until IS NOT NULL AND capability.effective_until >= NEW.effective_until))
    ) THEN
        RAISE EXCEPTION 'Supplier has no active capability for the selected commodity category at effective start'
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_TABLE_NAME = 'business_partner_qualification'
       AND (to_jsonb(NEW)->>'risk_assessment_id') IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
             FROM master.party_risk_assessment assessment
            WHERE assessment.tenant_id = NEW.tenant_id
              AND assessment.id = (to_jsonb(NEW)->>'risk_assessment_id')::uuid
              AND assessment.business_partner_id = NEW.business_partner_id
       ) THEN
        RAISE EXCEPTION
            'Risk assessment does not belong to the selected business partner'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_qualification_role_pair()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,control,master AS $$
BEGIN
    IF NEW.partner_role='supplier' THEN
        SELECT supplier.id INTO NEW.role_id FROM master.supplier supplier
         WHERE supplier.tenant_id=NEW.tenant_id
           AND supplier.business_partner_id=NEW.business_partner_id
           AND (NEW.role_id IS NULL OR supplier.id=NEW.role_id)
           AND supplier.status<>'archived';
    ELSE
        SELECT customer.id INTO NEW.role_id FROM master.customer customer
         WHERE customer.tenant_id=NEW.tenant_id
           AND customer.business_partner_id=NEW.business_partner_id
           AND (NEW.role_id IS NULL OR customer.id=NEW.role_id)
           AND customer.status<>'archived';
    END IF;
    IF NEW.role_id IS NULL THEN
        RAISE EXCEPTION 'Qualification role does not belong to the selected Business Partner'
            USING ERRCODE='foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_decision_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control, master
AS $$
DECLARE v_count integer;
BEGIN
    IF NEW.scope_kind='operating_organization' AND NOT EXISTS (
        SELECT 1 FROM master.operating_organization x WHERE x.tenant_id=NEW.tenant_id AND x.id=NEW.operating_organization_id AND x.is_active
    ) THEN RAISE EXCEPTION 'Decision scope operating organization must be active' USING ERRCODE='foreign_key_violation'; END IF;
    IF NEW.scope_kind='company_code' AND NOT EXISTS (
        SELECT 1 FROM master.company_code x WHERE x.tenant_id=NEW.tenant_id AND x.id=NEW.company_code_id AND x.is_active
    ) THEN RAISE EXCEPTION 'Decision scope company code must be active' USING ERRCODE='foreign_key_violation'; END IF;
    IF NEW.scope_kind='commodity_category' AND NOT EXISTS (
        SELECT 1 FROM master.commodity_category x WHERE x.tenant_id=NEW.tenant_id AND x.id=NEW.commodity_category_id AND x.is_active
    ) THEN RAISE EXCEPTION 'Decision scope commodity category must be active' USING ERRCODE='foreign_key_violation'; END IF;
    IF NEW.scope_kind='tax_jurisdiction' AND NOT EXISTS (
        SELECT 1 FROM master.tax_jurisdiction x WHERE x.tenant_id=NEW.tenant_id AND x.id=NEW.tax_jurisdiction_id AND x.is_active
    ) THEN RAISE EXCEPTION 'Decision scope tax jurisdiction must be active' USING ERRCODE='foreign_key_violation'; END IF;
    IF NEW.scope_kind='organization_unit' AND NOT EXISTS (
        SELECT 1 FROM master.org_unit x WHERE x.tenant_id=NEW.tenant_id AND x.id=NEW.organization_unit_id AND x.is_active
    ) THEN RAISE EXCEPTION 'Decision scope organization unit must be active' USING ERRCODE='foreign_key_violation'; END IF;
    IF NEW.scope_kind IN ('operating_organization','organization_unit') THEN
        NEW.hierarchy_version := COALESCE(NEW.hierarchy_version,1);
        NEW.resolution_fingerprint := COALESCE(NEW.resolution_fingerprint,
          encode(public.digest(convert_to(concat_ws(':',NEW.tenant_id::text,NEW.scope_kind,
            COALESCE(NEW.operating_organization_id,NEW.organization_unit_id)::text,NEW.hierarchy_version::text),'UTF8'),'sha256'),'hex'));
    END IF;
    SELECT count(*) INTO v_count FROM control.business_partner_decision_scope s
     WHERE s.tenant_id=NEW.tenant_id AND s.id IS DISTINCT FROM NEW.id
       AND s.qualification_id IS NOT DISTINCT FROM NEW.qualification_id
       AND s.supplier_preference_id IS NOT DISTINCT FROM NEW.supplier_preference_id
       AND s.customer_designation_id IS NOT DISTINCT FROM NEW.customer_designation_id
       AND s.credit_review_id IS NOT DISTINCT FROM NEW.credit_review_id;
    IF v_count >= 100 THEN RAISE EXCEPTION 'A decision authority may have at most 100 scope rows' USING ERRCODE='check_violation'; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_materialize_legacy_decision_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control, master
AS $$
DECLARE v_commodity uuid;
BEGIN
    IF current_setting('app.normalized_decision_scope_write',true)='on' THEN RETURN NEW; END IF;
    IF TG_TABLE_NAME='business_partner_qualification' THEN
        IF NEW.commodity_capability_id IS NOT NULL THEN SELECT commodity_category_id INTO v_commodity FROM master.business_partner_commodity_capability WHERE tenant_id=NEW.tenant_id AND id=NEW.commodity_capability_id; END IF;
        INSERT INTO control.business_partner_decision_scope(tenant_id,qualification_id,scope_kind,operating_organization_id,company_code_id,commodity_category_id,effective_from,effective_until,created_by)
        SELECT NEW.tenant_id,NEW.id,x.kind,x.org_id,x.company_id,x.commodity_id,COALESCE(NEW.effective_from,CURRENT_DATE),NEW.effective_until,NEW.created_by FROM (VALUES
          ('operating_organization',NEW.operating_organization_id,NULL::uuid,NULL::uuid),('company_code',NULL::uuid,NEW.company_code_id,NULL::uuid),('commodity_category',NULL::uuid,NULL::uuid,v_commodity)
        ) x(kind,org_id,company_id,commodity_id) WHERE COALESCE(x.org_id,x.company_id,x.commodity_id) IS NOT NULL;
        IF NOT FOUND THEN INSERT INTO control.business_partner_decision_scope(tenant_id,qualification_id,scope_kind,effective_from,effective_until,created_by) VALUES(NEW.tenant_id,NEW.id,'global',COALESCE(NEW.effective_from,CURRENT_DATE),NEW.effective_until,NEW.created_by); END IF;
    ELSIF TG_TABLE_NAME='supplier_preference_designation' THEN
        INSERT INTO control.business_partner_decision_scope(tenant_id,supplier_preference_id,scope_kind,operating_organization_id,company_code_id,commodity_category_id,effective_from,effective_until,created_by)
        SELECT NEW.tenant_id,NEW.id,x.kind,x.org_id,x.company_id,x.commodity_id,NEW.effective_from,NEW.effective_until,NEW.created_by FROM (VALUES
          ('operating_organization',NEW.operating_organization_id,NULL::uuid,NULL::uuid),('company_code',NULL::uuid,NEW.company_code_id,NULL::uuid),('commodity_category',NULL::uuid,NULL::uuid,NEW.commodity_category_id)
        ) x(kind,org_id,company_id,commodity_id) WHERE COALESCE(x.org_id,x.company_id,x.commodity_id) IS NOT NULL;
    ELSIF TG_TABLE_NAME='customer_account_designation' THEN
        INSERT INTO control.business_partner_decision_scope(tenant_id,customer_designation_id,scope_kind,operating_organization_id,company_code_id,effective_from,effective_until,created_by)
        SELECT NEW.tenant_id,NEW.id,x.kind,x.org_id,x.company_id,NEW.effective_from,NEW.effective_until,NEW.created_by FROM (VALUES
          ('operating_organization',NEW.operating_organization_id,NULL::uuid),('company_code',NULL::uuid,NEW.company_code_id)
        ) x(kind,org_id,company_id) WHERE COALESCE(x.org_id,x.company_id) IS NOT NULL;
    ELSE
        INSERT INTO control.business_partner_decision_scope(tenant_id,credit_review_id,scope_kind,operating_organization_id,company_code_id,effective_from,effective_until,created_by)
        VALUES(NEW.tenant_id,NEW.id,'operating_organization',NEW.operating_organization_id,NULL,NEW.effective_from,NEW.effective_until,NEW.created_by),
              (NEW.tenant_id,NEW.id,'company_code',NULL,NEW.company_code_id,NEW.effective_from,NEW.effective_until,NEW.created_by);
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.command_create_business_partner_decision(
    p_tenant_id uuid,p_aggregate_kind text,p_business_partner_id uuid,
    p_partner_role text,p_role_id uuid,p_operating_organization_id uuid,
    p_company_code_id uuid,p_commodity_category_id uuid,p_payload jsonb,
    p_idempotency_key text,p_actor_id uuid
) RETURNS TABLE(aggregate_kind text,aggregate_id uuid,row_version bigint,replayed boolean,outbox_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,control,master,event,shared
AS $$
DECLARE
    v_fingerprint text;v_existing event.command_execution%ROWTYPE;v_execution uuid;
    v_id uuid:=shared.uuidv7();v_outbox uuid;v_from date;v_until date;
BEGIN
    IF current_database()<>'athyper_neon'
       OR NULLIF(current_setting('app.current_tenant_id',true),'')::uuid IS DISTINCT FROM p_tenant_id
       OR NULLIF(current_setting('app.current_principal_id',true),'')::uuid IS DISTINCT FROM p_actor_id THEN
        RAISE EXCEPTION 'Business Partner decision creation context mismatch' USING ERRCODE='insufficient_privilege';
    END IF;
    IF p_aggregate_kind NOT IN('qualification','supplier_preference','customer_designation','customer_credit_review')
       OR jsonb_typeof(COALESCE(p_payload,'{}'::jsonb))<>'object'
       OR octet_length(COALESCE(p_payload,'{}'::jsonb)::text)>32768
       OR btrim(p_idempotency_key)<>p_idempotency_key OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN
        RAISE EXCEPTION 'Invalid Business Partner decision creation command' USING ERRCODE='check_violation';
    END IF;
    IF p_aggregate_kind='qualification' AND (p_partner_role NOT IN('supplier','customer') OR p_role_id IS NULL) THEN
        RAISE EXCEPTION 'Qualification requires an exact commercial role' USING ERRCODE='check_violation';
    END IF;
    IF p_aggregate_kind<>'qualification' AND p_operating_organization_id IS NULL THEN
        RAISE EXCEPTION 'Scoped commercial decision requires an operating organization' USING ERRCODE='check_violation';
    END IF;
    IF p_aggregate_kind='customer_credit_review' AND p_company_code_id IS NULL THEN
        RAISE EXCEPTION 'Customer credit review requires a company code' USING ERRCODE='check_violation';
    END IF;
    IF NOT EXISTS(
      SELECT 1 FROM master.business_partner_operating_organization_assignment assignment
       WHERE assignment.tenant_id=p_tenant_id AND assignment.business_partner_id=p_business_partner_id
         AND assignment.partner_role=(CASE WHEN p_aggregate_kind IN('supplier_preference','qualification')
           THEN COALESCE(p_partner_role,'supplier') ELSE 'customer' END)::master.partner_role_d
         AND (p_operating_organization_id IS NULL OR assignment.operating_organization_id=p_operating_organization_id)
         AND assignment.status='active'
    ) OR (p_company_code_id IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM master.operating_organization_company_assignment company
       WHERE company.tenant_id=p_tenant_id AND company.operating_organization_id=p_operating_organization_id
         AND company.company_code_id=p_company_code_id AND company.status='active'
    )) THEN
      RAISE EXCEPTION 'Business Partner decision scope is not assigned to the exact commercial role' USING ERRCODE='foreign_key_violation';
    END IF;
    v_fingerprint:=encode(public.digest(convert_to(jsonb_build_object(
      'tenantId',p_tenant_id,'aggregateKind',p_aggregate_kind,'businessPartnerId',p_business_partner_id,
      'partnerRole',p_partner_role,'roleId',p_role_id,'operatingOrganizationId',p_operating_organization_id,
      'companyCodeId',p_company_code_id,'commodityCategoryId',p_commodity_category_id,
      'payload',COALESCE(p_payload,'{}'::jsonb),'idempotencyKey',p_idempotency_key,'actorId',p_actor_id
    )::text,'UTF8'),'sha256'),'hex');
    PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':bp-decision-create:'||p_idempotency_key,0));
    SELECT command.* INTO v_existing FROM event.command_execution command
     WHERE command.tenant_id=p_tenant_id AND command.command_code='business_partner.decision.create'
       AND command.idempotency_key=p_idempotency_key;
    IF FOUND THEN
      IF v_existing.request_fingerprint::text IS DISTINCT FROM v_fingerprint THEN
        RAISE EXCEPTION 'Business Partner decision creation idempotency key was reused' USING ERRCODE='unique_violation';
      END IF;
      RETURN QUERY SELECT v_existing.result_payload->>'aggregateKind',
        (v_existing.result_payload->>'aggregateId')::uuid,(v_existing.result_payload->>'rowVersion')::bigint,
        true,(v_existing.result_payload->>'outboxId')::uuid; RETURN;
    END IF;
    INSERT INTO event.command_execution(tenant_id,command_code,idempotency_key,request_fingerprint,status,
      actor_principal_id,source_service,started_at,status_changed_at,status_changed_by,created_by)
    VALUES(p_tenant_id,'business_partner.decision.create',p_idempotency_key,v_fingerprint,'processing',
      p_actor_id,'neon-commercial-governance',clock_timestamp(),clock_timestamp(),p_actor_id,p_actor_id)
    RETURNING id INTO v_execution;
    v_from:=COALESCE(NULLIF(p_payload->>'effectiveFrom','')::date,CURRENT_DATE);
    v_until:=NULLIF(p_payload->>'effectiveUntil','')::date;
    PERFORM set_config('app.normalized_decision_scope_write','on',true);
    IF p_aggregate_kind='qualification' THEN
      INSERT INTO control.business_partner_qualification(id,tenant_id,business_partner_id,partner_role,
        qualification_type_code,idempotency_key,risk_assessment_id,effective_from,effective_until,next_review_at,created_by)
      VALUES(v_id,p_tenant_id,p_business_partner_id,p_partner_role::master.partner_role_d,
        p_payload->>'qualificationTypeCode',p_idempotency_key,NULLIF(p_payload->>'riskAssessmentId','')::uuid,
        NULLIF(p_payload->>'effectiveFrom','')::date,v_until,NULLIF(p_payload->>'nextReviewAt','')::date,p_actor_id);
    ELSIF p_aggregate_kind='supplier_preference' THEN
      INSERT INTO control.supplier_preference_designation(id,tenant_id,business_partner_id,supplier_id,
        effective_from,effective_until,rationale,idempotency_key,created_by)
      VALUES(v_id,p_tenant_id,p_business_partner_id,p_role_id,v_from,v_until,p_payload->>'rationale',p_idempotency_key,p_actor_id);
    ELSIF p_aggregate_kind='customer_designation' THEN
      INSERT INTO control.customer_account_designation(id,tenant_id,business_partner_id,customer_id,
        operating_organization_id,company_code_id,country_code,channel_code,designation_type,priority_tier,effective_from,effective_until,
        rationale,idempotency_key,created_by)
      VALUES(v_id,p_tenant_id,p_business_partner_id,p_role_id,p_operating_organization_id,p_company_code_id,
        NULLIF(p_payload->>'countryCode','')::character(2),NULLIF(p_payload->>'channelCode',''),
        (p_payload->>'designationType')::control.customer_account_designation_type_d,
        NULLIF(p_payload->>'priorityTier','')::smallint,v_from,v_until,p_payload->>'rationale',p_idempotency_key,p_actor_id);
    ELSE
      INSERT INTO control.customer_credit_review(id,tenant_id,business_partner_id,customer_id,
        operating_organization_id,company_code_id,review_type_code,requested_credit_limit,
        requested_currency_code,risk_class_code,effective_from,effective_until,idempotency_key,created_by)
      VALUES(v_id,p_tenant_id,p_business_partner_id,p_role_id,p_operating_organization_id,p_company_code_id,
        COALESCE(p_payload->>'reviewTypeCode','initial'),
        NULLIF(p_payload->>'requestedCreditLimit','')::numeric,NULLIF(p_payload->>'requestedCurrencyCode','')::character(3),
        NULLIF(p_payload->>'riskClassCode',''),v_from,v_until,p_idempotency_key,p_actor_id);
    END IF;
    PERFORM set_config('app.normalized_decision_scope_write','',true);
    INSERT INTO control.business_partner_decision_scope(tenant_id,qualification_id,supplier_preference_id,
      customer_designation_id,credit_review_id,scope_kind,operating_organization_id,company_code_id,
      commodity_category_id,effective_from,effective_until,created_by)
    SELECT p_tenant_id,CASE WHEN p_aggregate_kind='qualification' THEN v_id END,
      CASE WHEN p_aggregate_kind='supplier_preference' THEN v_id END,
      CASE WHEN p_aggregate_kind='customer_designation' THEN v_id END,
      CASE WHEN p_aggregate_kind='customer_credit_review' THEN v_id END,
      scope.kind,scope.org_id,scope.company_id,scope.commodity_id,v_from,v_until,p_actor_id
    FROM (VALUES
      ('operating_organization',p_operating_organization_id,NULL::uuid,NULL::uuid),
      ('company_code',NULL::uuid,p_company_code_id,NULL::uuid),
      ('commodity_category',NULL::uuid,NULL::uuid,p_commodity_category_id)
    ) scope(kind,org_id,company_id,commodity_id)
    WHERE COALESCE(scope.org_id,scope.company_id,scope.commodity_id) IS NOT NULL;
    IF NOT FOUND THEN
      INSERT INTO control.business_partner_decision_scope(tenant_id,qualification_id,scope_kind,effective_from,effective_until,created_by)
      VALUES(p_tenant_id,v_id,'global',v_from,v_until,p_actor_id);
    END IF;
    INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,
      aggregate_id,event_version,actor_id,source,partition_key,payload,created_by)
    VALUES(p_tenant_id,'neon-business-partner','business_partner.'||p_aggregate_kind||'.created',
      'bp-decision-create:'||v_id::text,p_aggregate_kind,v_id,p_aggregate_kind,v_id,1,p_actor_id,
      'neon-commercial-governance',p_tenant_id::text,jsonb_build_object('aggregateKind',p_aggregate_kind,
      'aggregateId',v_id,'businessPartnerId',p_business_partner_id,'rowVersion',1,'commandExecutionId',v_execution),p_actor_id)
    RETURNING id INTO v_outbox;
    UPDATE event.command_execution SET status='succeeded',result_payload=jsonb_build_object(
      'aggregateKind',p_aggregate_kind,'aggregateId',v_id,'rowVersion',1,'outboxId',v_outbox),
      completed_at=clock_timestamp(),status_changed_at=clock_timestamp(),status_changed_by=p_actor_id,updated_by=p_actor_id
      WHERE id=v_execution AND status='processing';
    RETURN QUERY SELECT p_aggregate_kind,v_id,1::bigint,false,v_outbox;
END $$;

CREATE OR REPLACE FUNCTION control.trg_guard_supplier_preference_designation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND (
        NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.business_partner_id IS DISTINCT FROM OLD.business_partner_id
        OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
        OR NEW.operating_organization_id IS DISTINCT FROM OLD.operating_organization_id
        OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
        OR NEW.country_code IS DISTINCT FROM OLD.country_code
        OR NEW.channel_code IS DISTINCT FROM OLD.channel_code
        OR NEW.commodity_category_id IS DISTINCT FROM OLD.commodity_category_id
        OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
        OR NEW.effective_until IS DISTINCT FROM OLD.effective_until
        OR NEW.rationale IS DISTINCT FROM OLD.rationale
        OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.created_by IS DISTINCT FROM OLD.created_by
    ) THEN
        RAISE EXCEPTION 'Supplier preference scope and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.row_version <> OLD.row_version + 1 THEN
        RAISE EXCEPTION 'Supplier preference row version must advance exactly once'
            USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status NOT IN ('approved','rejected') THEN
        RAISE EXCEPTION 'Pending supplier preference may only be approved or rejected'
            USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status = 'approved' AND NEW.status <> 'revoked' THEN
        RAISE EXCEPTION 'Approved supplier preference may only be revoked'
            USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status IN ('rejected','revoked') THEN
        RAISE EXCEPTION 'Terminal supplier preference is immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'approved' AND EXISTS (
        SELECT 1 FROM control.supplier_preference_designation existing
         WHERE existing.tenant_id = NEW.tenant_id
           AND existing.id <> NEW.id
           AND existing.supplier_id = NEW.supplier_id
           AND existing.operating_organization_id = NEW.operating_organization_id
           AND existing.status = 'approved'
           AND (existing.company_code_id IS NULL OR NEW.company_code_id IS NULL OR existing.company_code_id = NEW.company_code_id)
           AND (existing.country_code IS NULL OR NEW.country_code IS NULL OR existing.country_code = NEW.country_code)
           AND (existing.channel_code IS NULL OR NEW.channel_code IS NULL OR existing.channel_code = NEW.channel_code)
           AND (existing.commodity_category_id IS NULL OR NEW.commodity_category_id IS NULL OR existing.commodity_category_id = NEW.commodity_category_id)
           AND daterange(existing.effective_from, existing.effective_until, '[)') && daterange(NEW.effective_from, NEW.effective_until, '[)')
    ) THEN
        RAISE EXCEPTION 'Overlapping approved supplier preference scope exists'
            USING ERRCODE = 'exclusion_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_customer_account_designation_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control, master
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM master.customer customer
         WHERE customer.tenant_id = NEW.tenant_id
           AND customer.id = NEW.customer_id
           AND customer.business_partner_id = NEW.business_partner_id
           AND customer.status <> 'archived'
    ) THEN
        RAISE EXCEPTION 'Customer does not belong to the selected business partner'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM master.business_partner_operating_organization_assignment assignment
         WHERE assignment.tenant_id = NEW.tenant_id
           AND assignment.business_partner_id = NEW.business_partner_id
           AND assignment.operating_organization_id = NEW.operating_organization_id
           AND assignment.partner_role = 'customer'
           AND assignment.status = 'active'
           AND assignment.effective_from <= NEW.effective_from
           AND (assignment.effective_until IS NULL OR assignment.effective_until > NEW.effective_from)
           AND (assignment.effective_until IS NULL OR
                (NEW.effective_until IS NOT NULL AND assignment.effective_until >= NEW.effective_until))
    ) THEN
        RAISE EXCEPTION 'Customer is not actively assigned to the selected sales organization at effective start'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.company_code_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM master.operating_organization_company_assignment assignment
         WHERE assignment.tenant_id = NEW.tenant_id
           AND assignment.operating_organization_id = NEW.operating_organization_id
           AND assignment.company_code_id = NEW.company_code_id
           AND assignment.status = 'active'
           AND assignment.effective_from <= NEW.effective_from
           AND (assignment.effective_until IS NULL OR assignment.effective_until > NEW.effective_from)
           AND (assignment.effective_until IS NULL OR
                (NEW.effective_until IS NOT NULL AND assignment.effective_until >= NEW.effective_until))
    ) THEN
        RAISE EXCEPTION 'Company code does not actively participate in the selected sales organization for the designation period'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_customer_account_designation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND (
        NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.business_partner_id IS DISTINCT FROM OLD.business_partner_id
        OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
        OR NEW.operating_organization_id IS DISTINCT FROM OLD.operating_organization_id
        OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
        OR NEW.designation_type IS DISTINCT FROM OLD.designation_type
        OR NEW.priority_tier IS DISTINCT FROM OLD.priority_tier
        OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
        OR NEW.effective_until IS DISTINCT FROM OLD.effective_until
        OR NEW.rationale IS DISTINCT FROM OLD.rationale
        OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.created_by IS DISTINCT FROM OLD.created_by
    ) THEN
        RAISE EXCEPTION 'Customer account designation scope and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.row_version <> OLD.row_version + 1 THEN
        RAISE EXCEPTION 'Customer account designation row version must advance exactly once'
            USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status NOT IN ('approved','rejected') THEN
        RAISE EXCEPTION 'Pending customer account designation may only be approved or rejected'
            USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status = 'approved' AND NEW.status <> 'revoked' THEN
        RAISE EXCEPTION 'Approved customer account designation may only be revoked'
            USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status IN ('rejected','revoked') THEN
        RAISE EXCEPTION 'Terminal customer account designation is immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'approved' AND EXISTS (
        SELECT 1 FROM control.customer_account_designation existing
         WHERE existing.tenant_id = NEW.tenant_id
           AND existing.id <> NEW.id
           AND existing.customer_id = NEW.customer_id
           AND existing.operating_organization_id = NEW.operating_organization_id
           AND existing.designation_type = NEW.designation_type
           AND existing.status = 'approved'
           AND (existing.company_code_id IS NULL OR NEW.company_code_id IS NULL OR existing.company_code_id = NEW.company_code_id)
           AND daterange(existing.effective_from, existing.effective_until, '[)') && daterange(NEW.effective_from, NEW.effective_until, '[)')
    ) THEN
        RAISE EXCEPTION 'Overlapping approved customer account designation scope exists'
            USING ERRCODE = 'exclusion_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_customer_credit_review_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control, master
AS $$
DECLARE
    v_effective_from date := COALESCE(NEW.effective_from, CURRENT_DATE);
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM master.customer customer
         WHERE customer.tenant_id = NEW.tenant_id
           AND customer.id = NEW.customer_id
           AND customer.business_partner_id = NEW.business_partner_id
           AND customer.status <> 'archived'
    ) THEN
        RAISE EXCEPTION 'Customer does not belong to the selected business partner'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (
        SELECT 1
          FROM master.business_partner_operating_organization_assignment assignment
          JOIN master.operating_organization_company_assignment company_scope
            ON company_scope.tenant_id = assignment.tenant_id
           AND company_scope.operating_organization_id = assignment.operating_organization_id
           AND company_scope.company_code_id = NEW.company_code_id
           AND company_scope.status = 'active'
           AND company_scope.effective_from <= v_effective_from
           AND (company_scope.effective_until IS NULL OR company_scope.effective_until > v_effective_from)
         WHERE assignment.tenant_id = NEW.tenant_id
           AND assignment.business_partner_id = NEW.business_partner_id
           AND assignment.operating_organization_id = NEW.operating_organization_id
           AND assignment.partner_role = 'customer'
           AND assignment.status = 'active'
           AND assignment.effective_from <= v_effective_from
           AND (assignment.effective_until IS NULL OR assignment.effective_until > v_effective_from)
    ) THEN
        RAISE EXCEPTION 'Customer credit review is outside an active sales organization/company scope'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_customer_credit_review()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND (
        NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.business_partner_id IS DISTINCT FROM OLD.business_partner_id
        OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
        OR NEW.operating_organization_id IS DISTINCT FROM OLD.operating_organization_id
        OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
        OR NEW.review_type_code IS DISTINCT FROM OLD.review_type_code
        OR NEW.requested_credit_limit IS DISTINCT FROM OLD.requested_credit_limit
        OR NEW.requested_currency_code IS DISTINCT FROM OLD.requested_currency_code
        OR NEW.risk_class_code IS DISTINCT FROM OLD.risk_class_code
        OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
        OR NEW.effective_until IS DISTINCT FROM OLD.effective_until
        OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
        OR NEW.authority_evidence IS DISTINCT FROM OLD.authority_evidence
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.created_by IS DISTINCT FROM OLD.created_by
    ) THEN
        RAISE EXCEPTION 'Customer credit request scope, requested terms, and provenance are immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.row_version <> OLD.row_version + 1 THEN
        RAISE EXCEPTION 'Customer credit review row version must advance exactly once'
            USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.decision <> 'pending' THEN
        RAISE EXCEPTION 'Decided customer credit review is immutable; create a superseding review'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.decision IN ('approved','conditional') THEN
        IF NEW.effective_from IS NULL THEN
            RAISE EXCEPTION 'Approved customer credit outcome requires effective_from'
                USING ERRCODE = 'check_violation';
        END IF;
        IF EXISTS (
            SELECT 1
              FROM control.customer_credit_review existing
             WHERE existing.tenant_id = NEW.tenant_id
               AND existing.id <> NEW.id
               AND existing.customer_id = NEW.customer_id
               AND existing.operating_organization_id = NEW.operating_organization_id
               AND existing.company_code_id = NEW.company_code_id
               AND existing.decision IN ('approved','conditional')
               AND daterange(existing.effective_from, existing.effective_until, '[)')
                   && daterange(NEW.effective_from, NEW.effective_until, '[)')
        ) THEN
            RAISE EXCEPTION 'Overlapping approved customer credit outcome exists for this scope'
                USING ERRCODE = 'exclusion_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_business_partner_qualification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND (
        NEW.id IS DISTINCT FROM OLD.id
        OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.business_partner_id IS DISTINCT FROM OLD.business_partner_id
        OR NEW.partner_role IS DISTINCT FROM OLD.partner_role
        OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.created_by IS DISTINCT FROM OLD.created_by
    ) THEN
        RAISE EXCEPTION
            'Qualification identity and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_OP = 'UPDATE'
       AND OLD.decision <> 'pending'
       AND (NOT (OLD.decision IN ('approved','conditional') AND NEW.decision = 'expired')
            OR NEW.decision_idempotency_key IS DISTINCT FROM OLD.decision_idempotency_key
            OR NEW.decision_fingerprint IS DISTINCT FROM OLD.decision_fingerprint
            OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
            OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
            OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
            OR NEW.approved_by IS DISTINCT FROM OLD.approved_by) THEN
        RAISE EXCEPTION 'Qualification decision evidence is immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.row_version <> OLD.row_version + 1 THEN
        RAISE EXCEPTION 'Qualification row version must advance exactly once'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.decision = 'pending'
       AND (NEW.reviewed_at IS NOT NULL OR NEW.approved_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Pending qualification cannot contain decision evidence'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.decision IN ('approved', 'conditional')
       AND NEW.reviewed_at IS NULL THEN
        RAISE EXCEPTION 'Approved qualification requires review evidence'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.decision IN ('rejected', 'suspended')
       AND NEW.reviewed_at IS NULL THEN
        RAISE EXCEPTION '% qualification requires review evidence', NEW.decision
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_business_partner_block()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND (
        NEW.id IS DISTINCT FROM OLD.id
        OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.business_partner_id IS DISTINCT FROM OLD.business_partner_id
        OR NEW.partner_role_scope IS DISTINCT FROM OLD.partner_role_scope
        OR NEW.operating_organization_id
            IS DISTINCT FROM OLD.operating_organization_id
        OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
        OR NEW.operation_code IS DISTINCT FROM OLD.operation_code
        OR NEW.blocked_at IS DISTINCT FROM OLD.blocked_at
        OR NEW.blocked_by IS DISTINCT FROM OLD.blocked_by
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.created_by IS DISTINCT FROM OLD.created_by
    ) THEN
        RAISE EXCEPTION 'Block coordinates and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_OP = 'UPDATE'
       AND OLD.status <> 'active'
       AND NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'Terminal block status % cannot transition', OLD.status
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_published_formula_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF OLD.status <> 'draft' THEN
        RAISE EXCEPTION
            'Published formula version % is immutable (status=%)',
            OLD.id, OLD.status
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF TG_OP = 'UPDATE'
       AND NEW.formula_expression_id IS DISTINCT FROM OLD.formula_expression_id THEN
        RAISE EXCEPTION 'Formula version cannot move to another formula expression'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

COMMENT ON FUNCTION control.trg_guard_published_formula_version() IS
  'Allows draft editing/publication but rejects UPDATE or DELETE after a formula version leaves draft.';

CREATE OR REPLACE FUNCTION control.trg_validate_item_inventory_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control, master
AS $$
DECLARE
    v_company uuid;
    v_managed boolean;
BEGIN
    SELECT company_code_id, is_inventory_managed
      INTO v_company, v_managed
      FROM master.item
     WHERE tenant_id = NEW.tenant_id
       AND id = NEW.item_id;

    IF FOUND AND (
        v_company <> NEW.company_code_id
        OR NOT v_managed
    ) THEN
        RAISE EXCEPTION
            'Inventory policy requires an inventory-managed item in the same company'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_item_inventory_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION
                'Activated item inventory policies cannot be deleted; retire or archive instead'
                USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN OLD;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
       OR NEW.item_id IS DISTINCT FROM OLD.item_id
       OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION
            'Inventory policy identity, coordinates, effective start, and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_planning_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'control.% identity and creation evidence are immutable',
            TG_TABLE_NAME USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_planning_dependency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF EXISTS (
        WITH RECURSIVE dependencies(driver_id) AS (
            SELECT NEW.depends_on_driver_id
            UNION
            SELECT d.depends_on_driver_id
              FROM control.planning_driver_dependency d
              JOIN dependencies p ON d.planning_driver_id = p.driver_id
             WHERE d.tenant_id = NEW.tenant_id
               AND d.planning_model_id = NEW.planning_model_id
               AND d.id <> NEW.id
        )
        SELECT 1 FROM dependencies WHERE driver_id = NEW.planning_driver_id
    ) THEN
        RAISE EXCEPTION 'Planning driver dependency graph cannot contain a cycle'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_planning_dependency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.planning_model_id IS DISTINCT FROM OLD.planning_model_id
       OR NEW.planning_driver_id IS DISTINCT FROM OLD.planning_driver_id
       OR NEW.depends_on_driver_id IS DISTINCT FROM OLD.depends_on_driver_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'Planning dependency coordinates and evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_budget_control_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control, master
AS $$
DECLARE
    v_previous control.budget_control_policy%ROWTYPE;
    v_override_tenant uuid;
BEGIN
    IF NEW.company_code_id IS NOT NULL AND NEW.ledger_book_id IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
              FROM master.company_code_book_assignment AS assignment
             WHERE assignment.tenant_id = NEW.tenant_id
               AND assignment.company_code_id = NEW.company_code_id
               AND assignment.book_id = NEW.ledger_book_id
               AND assignment.status = 'active'
               AND assignment.effective_from <= NEW.effective_from
               AND (assignment.effective_to IS NULL
                    OR assignment.effective_to >= NEW.effective_from)
       ) THEN
        RAISE EXCEPTION 'Budget-control ledger book must be assigned to the company on effective_from'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW.override_policy_definition_id IS NOT NULL THEN
        SELECT tenant_id INTO v_override_tenant
          FROM control.policy_definition
         WHERE id = NEW.override_policy_definition_id;
        IF NOT FOUND OR (v_override_tenant IS NOT NULL AND v_override_tenant <> NEW.tenant_id) THEN
            RAISE EXCEPTION 'Override policy must be global or belong to the same tenant'
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    END IF;

    IF NEW.supersedes_id IS NULL THEN
        IF NEW.version_no <> 1 THEN
            RAISE EXCEPTION 'A budget-control lineage must start at version 1'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSE
        SELECT * INTO v_previous
          FROM control.budget_control_policy
         WHERE tenant_id = NEW.tenant_id AND id = NEW.supersedes_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Superseded budget-control policy is outside the tenant'
                USING ERRCODE = 'foreign_key_violation';
        END IF;
        IF v_previous.policy_code <> NEW.policy_code
           OR v_previous.company_code_id IS DISTINCT FROM NEW.company_code_id
           OR v_previous.ledger_book_id IS DISTINCT FROM NEW.ledger_book_id
           OR v_previous.source_document_type IS DISTINCT FROM NEW.source_document_type
           OR NEW.version_no <> v_previous.version_no + 1 THEN
            RAISE EXCEPTION 'Budget-control replacement must retain scope and increment version by one'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_budget_control_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'Activated budget-control policies cannot be deleted'
                USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN OLD;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.policy_code IS DISTINCT FROM OLD.policy_code
       OR NEW.version_no IS DISTINCT FROM OLD.version_no
       OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
       OR NEW.ledger_book_id IS DISTINCT FROM OLD.ledger_book_id
       OR NEW.source_document_type IS DISTINCT FROM OLD.source_document_type
       OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
       OR NEW.supersedes_id IS DISTINCT FROM OLD.supersedes_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'Budget-control identity, scope, lineage and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status <> 'draft' AND (
        NEW.name IS DISTINCT FROM OLD.name
        OR NEW.description IS DISTINCT FROM OLD.description
        OR NEW.period_scope IS DISTINCT FROM OLD.period_scope
        OR NEW.consumption_basis IS DISTINCT FROM OLD.consumption_basis
        OR NEW.warn_at_percent IS DISTINCT FROM OLD.warn_at_percent
        OR NEW.block_at_percent IS DISTINCT FROM OLD.block_at_percent
        OR NEW.override_policy_definition_id IS DISTINCT FROM OLD.override_policy_definition_id
        OR NEW.metadata IS DISTINCT FROM OLD.metadata
    ) THEN
        RAISE EXCEPTION 'Activated budget-control decisions are immutable; create a replacement version'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status <> 'draft'
       AND NEW.effective_to IS DISTINCT FROM OLD.effective_to
       AND (NEW.effective_to IS NULL
            OR (OLD.effective_to IS NOT NULL AND NEW.effective_to > OLD.effective_to)) THEN
        RAISE EXCEPTION 'An activated budget-control period may be shortened but not extended'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status <> 'draft' AND NEW.status IS DISTINCT FROM OLD.status
       AND NOT (
            OLD.status = 'active' AND NEW.status IN ('inactive', 'superseded')
            OR OLD.status = 'inactive' AND NEW.status = 'superseded'
       ) THEN
        RAISE EXCEPTION 'Invalid budget-control status transition'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.resolve_budget_control_policy(
    p_tenant_id uuid,
    p_policy_code text,
    p_company_code_id uuid,
    p_ledger_book_id uuid,
    p_source_document_type text,
    p_effective_date date DEFAULT CURRENT_DATE
)
RETURNS SETOF control.budget_control_policy
LANGUAGE sql
STABLE
SET search_path = pg_catalog, control
AS $$
    SELECT policy.*
      FROM control.budget_control_policy AS policy
     WHERE policy.tenant_id = p_tenant_id
       AND policy.policy_code = p_policy_code
       AND policy.status = 'active'
       AND policy.effective_from <= p_effective_date
       AND (policy.effective_to IS NULL OR policy.effective_to >= p_effective_date)
       AND (policy.company_code_id IS NULL OR policy.company_code_id = p_company_code_id)
       AND (policy.ledger_book_id IS NULL OR policy.ledger_book_id = p_ledger_book_id)
       AND (policy.source_document_type IS NULL
            OR policy.source_document_type = p_source_document_type)
     ORDER BY
       (policy.company_code_id IS NOT NULL)::integer DESC,
       (policy.ledger_book_id IS NOT NULL)::integer DESC,
       (policy.source_document_type IS NOT NULL)::integer DESC,
       policy.version_no DESC
     LIMIT 1
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_payment_execution_profile()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_connector_status control.connector_instance_status_d;
BEGIN
    IF control.jsonb_has_secret_shaped_key(NEW.message_options) THEN
        RAISE EXCEPTION 'payment execution message_options cannot contain secret material'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.connector_instance_id IS NOT NULL AND NEW.status = 'active' THEN
        SELECT status INTO v_connector_status
          FROM control.connector_instance
         WHERE tenant_id = NEW.tenant_id AND id = NEW.connector_instance_id;
        IF v_connector_status IS DISTINCT FROM 'active' THEN
            RAISE EXCEPTION 'an active payment execution profile requires an active connector instance'
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_asset_class_book_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control, master
AS $$
DECLARE
    v_book_currency character(3);
    v_asset_nature master.asset_nature_d;
BEGIN
    SELECT asset_class.asset_nature
      INTO v_asset_nature
      FROM master.asset_class
     WHERE tenant_id = NEW.tenant_id
       AND id = NEW.asset_class_id;

    IF v_asset_nature IS NULL THEN
        RAISE EXCEPTION 'asset class does not exist in tenant'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_asset_nature IN ('land', 'cwip')
       AND NEW.depreciation_method <> 'no_depreciation' THEN
        RAISE EXCEPTION 'land and CWIP policies must use no_depreciation'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT COALESCE(assignment.override_currency_code, book.base_currency_code)
      INTO v_book_currency
      FROM master.company_code_book_assignment AS assignment
      JOIN master.ledger_book AS book
        ON book.tenant_id = assignment.tenant_id
       AND book.id = assignment.book_id
     WHERE assignment.tenant_id = NEW.tenant_id
       AND assignment.company_code_id = NEW.company_code_id
       AND assignment.book_id = NEW.ledger_book_id
       AND assignment.status = 'active'
       AND assignment.effective_from <= NEW.effective_from
       AND (assignment.effective_to IS NULL OR assignment.effective_to >= NEW.effective_from)
     ORDER BY assignment.priority DESC, assignment.effective_from DESC
     LIMIT 1;

    IF v_book_currency IS NULL THEN
        RAISE EXCEPTION 'ledger book is not actively assigned to this company on policy effective_from'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW.capitalization_threshold > 0
       AND NEW.capitalization_currency <> v_book_currency THEN
        RAISE EXCEPTION 'capitalization currency % must equal assigned ledger-book currency %',
            NEW.capitalization_currency, v_book_currency
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_commodity_code_classification_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control, shared
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM shared.commodity_code
         WHERE domain_code = NEW.primary_commodity_domain_code
           AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'primary commodity domain % has no active commodity codes',
            NEW.primary_commodity_domain_code
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW.trade_commodity_domain_code IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
              FROM shared.commodity_code
             WHERE domain_code = NEW.trade_commodity_domain_code
               AND status = 'active'
       ) THEN
        RAISE EXCEPTION 'trade commodity domain % has no active commodity codes',
            NEW.trade_commodity_domain_code
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_commodity_category_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'Activated commodity policies cannot be deleted; retire or archive instead'
                USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN OLD;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.commodity_category_id IS DISTINCT FROM OLD.commodity_category_id
       OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
       OR to_jsonb(NEW)->>'company_code_supplier_profile_id'
            IS DISTINCT FROM to_jsonb(OLD)->>'company_code_supplier_profile_id'
       OR to_jsonb(NEW)->>'company_code_customer_profile_id'
            IS DISTINCT FROM to_jsonb(OLD)->>'company_code_customer_profile_id'
       OR to_jsonb(NEW)->>'business_intent_id'
            IS DISTINCT FROM to_jsonb(OLD)->>'business_intent_id'
       OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION
            'Commodity policy identity, scope, effective start and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_commodity_category_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control, master
AS $$
DECLARE
    v_profile_id uuid;
BEGIN
    IF NEW.status <> 'active' THEN
        RETURN NEW;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM master.commodity_category
         WHERE tenant_id = NEW.tenant_id
           AND id = NEW.commodity_category_id
           AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'An active commodity policy requires an active category'
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_TABLE_NAME IN (
        'commodity_category_buy_policy',
        'commodity_category_sell_policy'
    ) AND NOT EXISTS (
        SELECT 1 FROM master.business_intent
         WHERE tenant_id = NEW.tenant_id
           AND id = (to_jsonb(NEW)->>'business_intent_id')::uuid
           AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'An active commodity intent policy requires an active business intent'
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_TABLE_NAME = 'commodity_category_buy_policy' THEN
        v_profile_id := NULLIF(
            to_jsonb(NEW)->>'company_code_supplier_profile_id', ''
        )::uuid;
        IF v_profile_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM master.company_code_supplier_profile
             WHERE tenant_id = NEW.tenant_id
               AND company_code_id = NEW.company_code_id
               AND id = v_profile_id
               AND status = 'active'
        ) THEN
            RAISE EXCEPTION 'An active buy policy requires an active supplier-company profile'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSIF TG_TABLE_NAME = 'commodity_category_sell_policy' THEN
        v_profile_id := NULLIF(
            to_jsonb(NEW)->>'company_code_customer_profile_id', ''
        )::uuid;
        IF v_profile_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM master.company_code_customer_profile
             WHERE tenant_id = NEW.tenant_id
               AND company_code_id = NEW.company_code_id
               AND id = v_profile_id
               AND status = 'active'
        ) THEN
            RAISE EXCEPTION 'An active sell policy requires an active customer-company profile'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_procurement_match_tolerance_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'Activated match-tolerance policies cannot be deleted; retire or archive instead'
                USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN OLD;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
       OR NEW.match_type IS DISTINCT FROM OLD.match_type
       OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'Match-policy identity, scope, effective start and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status <> 'draft' AND (
        NEW.ordered_quantity_over_tolerance_percent
            IS DISTINCT FROM OLD.ordered_quantity_over_tolerance_percent
        OR NEW.received_quantity_over_tolerance_percent
            IS DISTINCT FROM OLD.received_quantity_over_tolerance_percent
        OR NEW.unit_price_variance_percent
            IS DISTINCT FROM OLD.unit_price_variance_percent
        OR NEW.metadata IS DISTINCT FROM OLD.metadata
    ) THEN
        RAISE EXCEPTION 'Activated matching tolerances are immutable; create an effective-dated replacement'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status <> 'draft'
       AND NEW.effective_to IS DISTINCT FROM OLD.effective_to
       AND (NEW.effective_to IS NULL
            OR (OLD.effective_to IS NOT NULL AND NEW.effective_to > OLD.effective_to)) THEN
        RAISE EXCEPTION 'An activated match-policy period may be shortened but never extended'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status = 'archived' AND NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'Archived match policies cannot be reactivated'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status <> 'draft' AND NEW.status IS DISTINCT FROM OLD.status
       AND NOT (
            OLD.status = 'active' AND NEW.status IN ('inactive', 'archived')
            OR OLD.status = 'inactive' AND NEW.status = 'archived'
       ) THEN
        RAISE EXCEPTION 'Invalid activated match-policy status transition'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_fx_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control, master
AS $$
DECLARE
    v_source text;
    v_source_count integer;
    v_distinct_source_count integer;
    v_superseded control.fx_policy%ROWTYPE;
BEGIN
    FOREACH v_source IN ARRAY NEW.preferred_source_codes LOOP
        IF v_source !~ '^[A-Z][A-Z0-9_]{0,62}$' THEN
            RAISE EXCEPTION 'Invalid FX source code: %', v_source
                USING ERRCODE = 'check_violation';
        END IF;
    END LOOP;

    SELECT count(*), count(DISTINCT source_code)
      INTO v_source_count, v_distinct_source_count
      FROM unnest(NEW.preferred_source_codes) AS source_code;

    IF v_source_count <> v_distinct_source_count THEN
        RAISE EXCEPTION 'FX preferred source codes must be unique'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.company_code_id IS NOT NULL AND NEW.ledger_book_id IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
              FROM master.company_code_book_assignment AS assignment
             WHERE assignment.tenant_id = NEW.tenant_id
               AND assignment.company_code_id = NEW.company_code_id
               AND assignment.book_id = NEW.ledger_book_id
               AND assignment.status = 'active'
               AND assignment.effective_from <= NEW.effective_from
               AND (assignment.effective_to IS NULL
                    OR assignment.effective_to >= NEW.effective_from)
       ) THEN
        RAISE EXCEPTION 'FX policy ledger book must be assigned to the company on effective_from'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW.supersedes_id IS NULL THEN
        IF NEW.version_no <> 1 THEN
            RAISE EXCEPTION 'A root FX policy lineage must start at version 1'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSE
        SELECT * INTO v_superseded
          FROM control.fx_policy
         WHERE tenant_id = NEW.tenant_id
           AND id = NEW.supersedes_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Superseded FX policy does not exist in tenant'
                USING ERRCODE = 'foreign_key_violation';
        END IF;

        IF v_superseded.company_code_id IS DISTINCT FROM NEW.company_code_id
           OR v_superseded.ledger_book_id IS DISTINCT FROM NEW.ledger_book_id
           OR v_superseded.transaction_context IS DISTINCT FROM NEW.transaction_context
           OR NEW.version_no <> v_superseded.version_no + 1 THEN
            RAISE EXCEPTION 'FX replacement must retain scope/context and increment version by one'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_fx_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'Activated FX policies cannot be deleted'
                USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN OLD;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
       OR NEW.ledger_book_id IS DISTINCT FROM OLD.ledger_book_id
       OR NEW.transaction_context IS DISTINCT FROM OLD.transaction_context
       OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
       OR NEW.version_no IS DISTINCT FROM OLD.version_no
       OR NEW.supersedes_id IS DISTINCT FROM OLD.supersedes_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'FX policy identity, scope, lineage and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status <> 'draft' AND (
        NEW.default_rate_type IS DISTINCT FROM OLD.default_rate_type
        OR NEW.revaluation_rate_type IS DISTINCT FROM OLD.revaluation_rate_type
        OR NEW.pivot_currency_code IS DISTINCT FROM OLD.pivot_currency_code
        OR NEW.allow_inverse IS DISTINCT FROM OLD.allow_inverse
        OR NEW.allow_triangulation IS DISTINCT FROM OLD.allow_triangulation
        OR NEW.preferred_source_codes IS DISTINCT FROM OLD.preferred_source_codes
        OR NEW.max_rate_age_days IS DISTINCT FROM OLD.max_rate_age_days
        OR NEW.missing_rate_behavior IS DISTINCT FROM OLD.missing_rate_behavior
        OR NEW.manual_override_allowed IS DISTINCT FROM OLD.manual_override_allowed
        OR NEW.manual_override_approval_required
            IS DISTINCT FROM OLD.manual_override_approval_required
        OR NEW.metadata IS DISTINCT FROM OLD.metadata
    ) THEN
        RAISE EXCEPTION 'Activated FX decisions are immutable; create a versioned replacement'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status <> 'draft'
       AND NEW.effective_to IS DISTINCT FROM OLD.effective_to
       AND (NEW.effective_to IS NULL
            OR (OLD.effective_to IS NOT NULL AND NEW.effective_to > OLD.effective_to)) THEN
        RAISE EXCEPTION 'An activated FX policy period may be shortened but never extended'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status = 'superseded' AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'A superseded FX policy is immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status <> 'draft' AND NEW.status IS DISTINCT FROM OLD.status
       AND NOT (
            OLD.status = 'active' AND NEW.status IN ('inactive', 'superseded')
            OR OLD.status = 'inactive' AND NEW.status = 'superseded'
       ) THEN
        RAISE EXCEPTION 'Invalid activated FX policy status transition'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_dimension_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control, master
AS $$
DECLARE
    v_account_class master.gl_account_class_d;
    v_superseded control.dimension_policy%ROWTYPE;
BEGIN
    NEW.policy_code := lower(btrim(NEW.policy_code));
    NEW.description := nullif(btrim(NEW.description), '');
    NEW.scope_document_type :=
        nullif(lower(btrim(NEW.scope_document_type)), '');

    IF NEW.scope_account_id IS NOT NULL THEN
        SELECT account_class
          INTO v_account_class
          FROM master.gl_account
         WHERE tenant_id = NEW.tenant_id
           AND id = NEW.scope_account_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Scoped GL account does not exist in tenant'
                USING ERRCODE = 'foreign_key_violation';
        END IF;

        IF NEW.scope_account_class IS NOT NULL
           AND NEW.scope_account_class <> v_account_class THEN
            RAISE EXCEPTION
                'Scoped GL account does not belong to scope_account_class'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF NEW.company_code_id IS NOT NULL AND NEW.scope_book_id IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
              FROM master.company_code_book_assignment AS assignment
             WHERE assignment.tenant_id = NEW.tenant_id
               AND assignment.company_code_id = NEW.company_code_id
               AND assignment.book_id = NEW.scope_book_id
               AND assignment.status = 'active'
               AND assignment.effective_from <= NEW.effective_from
               AND (assignment.effective_to IS NULL
                    OR assignment.effective_to >= NEW.effective_from)
       ) THEN
        RAISE EXCEPTION
            'Scoped ledger book must be assigned to the company on effective_from'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW.enforcement = 'forbidden' AND EXISTS (
        SELECT 1
          FROM control.dimension_policy_allowed_value AS allowed
         WHERE allowed.tenant_id = NEW.tenant_id
           AND allowed.policy_id = NEW.id
    ) THEN
        RAISE EXCEPTION 'Forbidden dimension policies cannot have allowed values'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.supersedes_id IS NULL THEN
        IF NEW.version_no <> 1 THEN
            RAISE EXCEPTION 'A root dimension policy lineage must start at version 1'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSE
        SELECT * INTO v_superseded
          FROM control.dimension_policy
         WHERE tenant_id = NEW.tenant_id
           AND id = NEW.supersedes_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Superseded dimension policy does not exist in tenant'
                USING ERRCODE = 'foreign_key_violation';
        END IF;

        IF v_superseded.policy_code IS DISTINCT FROM NEW.policy_code
           OR v_superseded.dimension_type_id IS DISTINCT FROM NEW.dimension_type_id
           OR v_superseded.company_code_id IS DISTINCT FROM NEW.company_code_id
           OR v_superseded.scope_account_class IS DISTINCT FROM NEW.scope_account_class
           OR v_superseded.scope_account_id IS DISTINCT FROM NEW.scope_account_id
           OR v_superseded.scope_subledger_type IS DISTINCT FROM NEW.scope_subledger_type
           OR v_superseded.scope_book_id IS DISTINCT FROM NEW.scope_book_id
           OR v_superseded.scope_document_type IS DISTINCT FROM NEW.scope_document_type
           OR NEW.version_no <> v_superseded.version_no + 1 THEN
            RAISE EXCEPTION
                'Dimension policy replacement must retain lineage scope and increment version by one'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_dimension_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'Activated dimension policies cannot be deleted'
                USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN OLD;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.policy_code IS DISTINCT FROM OLD.policy_code
       OR NEW.version_no IS DISTINCT FROM OLD.version_no
       OR NEW.dimension_type_id IS DISTINCT FROM OLD.dimension_type_id
       OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
       OR NEW.scope_account_class IS DISTINCT FROM OLD.scope_account_class
       OR NEW.scope_account_id IS DISTINCT FROM OLD.scope_account_id
       OR NEW.scope_subledger_type IS DISTINCT FROM OLD.scope_subledger_type
       OR NEW.scope_book_id IS DISTINCT FROM OLD.scope_book_id
       OR NEW.scope_document_type IS DISTINCT FROM OLD.scope_document_type
       OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
       OR NEW.supersedes_id IS DISTINCT FROM OLD.supersedes_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION
            'Dimension policy identity, scope, lineage and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status <> 'draft' AND (
        NEW.enforcement IS DISTINCT FROM OLD.enforcement
        OR NEW.depends_on_dimension_type_id
            IS DISTINCT FROM OLD.depends_on_dimension_type_id
        OR NEW.mutually_exclusive_dimension_type_id
            IS DISTINCT FROM OLD.mutually_exclusive_dimension_type_id
        OR NEW.description IS DISTINCT FROM OLD.description
        OR NEW.metadata IS DISTINCT FROM OLD.metadata
    ) THEN
        RAISE EXCEPTION
            'Activated dimension policy semantics are immutable; create a versioned replacement'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status <> 'draft'
       AND NEW.effective_to IS DISTINCT FROM OLD.effective_to
       AND (NEW.effective_to IS NULL
            OR (OLD.effective_to IS NOT NULL
                AND NEW.effective_to > OLD.effective_to)) THEN
        RAISE EXCEPTION
            'An activated dimension policy period may be shortened but never extended'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status = 'archived' AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'An archived dimension policy is immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status <> 'draft' AND NEW.status IS DISTINCT FROM OLD.status
       AND NOT (
            OLD.status = 'active' AND NEW.status IN ('inactive', 'archived')
            OR OLD.status = 'inactive' AND NEW.status = 'archived'
       ) THEN
        RAISE EXCEPTION 'Invalid activated dimension-policy status transition'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_dimension_policy_allowed_value()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control, master
AS $$
DECLARE
    v_policy control.dimension_policy%ROWTYPE;
    v_value_company_id uuid;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION
            'Dimension policy allowed-value membership is immutable; delete and reinsert while draft'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO v_policy
      FROM control.dimension_policy
     WHERE tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id)
       AND id = COALESCE(NEW.policy_id, OLD.policy_id);

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Dimension policy does not exist in tenant'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_policy.status <> 'draft' THEN
        RAISE EXCEPTION
            'Allowed values may change only while the dimension policy is draft'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    IF v_policy.enforcement = 'forbidden' THEN
        RAISE EXCEPTION 'Forbidden dimension policies cannot have allowed values'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT company_code_id
      INTO v_value_company_id
      FROM master.dimension_value
     WHERE tenant_id = NEW.tenant_id
       AND dimension_type_id = NEW.dimension_type_id
       AND id = NEW.dimension_value_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Allowed dimension value does not exist in policy dimension'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_value_company_id IS NOT NULL
       AND v_value_company_id IS DISTINCT FROM v_policy.company_code_id THEN
        RAISE EXCEPTION
            'Company-scoped dimension value requires a policy for the same company'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_tax_policy_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
DECLARE
    v_old_business jsonb;
    v_new_business jsonb;
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'Only draft % rows may be deleted', TG_TABLE_NAME
                USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN OLD;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION '% identity and creation evidence are immutable', TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status <> 'draft' THEN
        v_old_business := to_jsonb(OLD) - ARRAY[
            'status', 'is_active', 'status_changed_at', 'status_changed_by',
            'updated_at', 'updated_by', 'effective_to'
        ];
        v_new_business := to_jsonb(NEW) - ARRAY[
            'status', 'is_active', 'status_changed_at', 'status_changed_by',
            'updated_at', 'updated_by', 'effective_to'
        ];

        IF v_new_business IS DISTINCT FROM v_old_business THEN
            RAISE EXCEPTION 'Activated % policy is immutable; create an effective-dated successor', TG_TABLE_NAME
                USING ERRCODE = 'check_violation';
        END IF;

        IF NEW.effective_to IS DISTINCT FROM OLD.effective_to
           AND (NEW.effective_to IS NULL
                OR NEW.effective_to < OLD.effective_from
                OR (OLD.effective_to IS NOT NULL AND NEW.effective_to > OLD.effective_to)) THEN
            RAISE EXCEPTION 'An activated % period may only be shortened', TG_TABLE_NAME
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
        (OLD.status = 'draft' AND NEW.status IN ('scheduled', 'active', 'retired'))
        OR (OLD.status = 'scheduled' AND NEW.status IN ('active', 'retired'))
        OR (OLD.status = 'active' AND NEW.status IN ('expired', 'retired'))
        OR (OLD.status = 'expired' AND NEW.status = 'retired')
    ) THEN
        RAISE EXCEPTION 'Invalid % status transition: % -> %', TG_TABLE_NAME, OLD.status, NEW.status
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_tax_rate_schedule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control, master
AS $$
DECLARE
    v_tax_class master.tax_class_d;
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status <> 'draft' THEN
        RAISE EXCEPTION 'Tax-rate schedules must be created as draft'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT tax_class INTO v_tax_class
      FROM master.tax_type
     WHERE tenant_id = NEW.tenant_id AND id = NEW.tax_type_id;

    IF FOUND AND ((v_tax_class = 'withholding') <> (NEW.wht_basis IS NOT NULL)) THEN
        RAISE EXCEPTION 'Withholding tax schedules must define wht_basis and non-withholding schedules must not'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_tax_group()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control, master
AS $$
DECLARE
    v_previous control.tax_group%ROWTYPE;
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status <> 'draft' THEN
        RAISE EXCEPTION 'Tax groups must be created as draft before components are assigned'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.supersedes_tax_group_id IS NOT NULL THEN
        SELECT * INTO v_previous
          FROM control.tax_group
         WHERE tenant_id = NEW.tenant_id AND id = NEW.supersedes_tax_group_id;

        IF FOUND AND (
            v_previous.code <> NEW.code
            OR v_previous.jurisdiction_id <> NEW.jurisdiction_id
            OR v_previous.group_kind <> NEW.group_kind
            OR v_previous.effective_from >= NEW.effective_from
            OR v_previous.effective_to IS NULL
            OR v_previous.effective_to >= NEW.effective_from
        ) THEN
            RAISE EXCEPTION 'Tax-group successor must retain code, jurisdiction and kind and begin after its closed predecessor'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSIF TG_OP = 'INSERT' AND EXISTS (
        SELECT 1 FROM control.tax_group g
         WHERE g.tenant_id = NEW.tenant_id AND g.code = NEW.code
    ) THEN
        RAISE EXCEPTION 'A later tax-group revision must identify supersedes_tax_group_id'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status IN ('scheduled', 'active') THEN
        IF NOT EXISTS (
            SELECT 1 FROM control.rounding_rule r
             WHERE r.tenant_id = NEW.tenant_id
               AND r.id = NEW.rounding_rule_id
               AND r.status = 'active'
        ) THEN
            RAISE EXCEPTION 'Scheduled or active tax group requires an active rounding rule'
                USING ERRCODE = 'check_violation';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM control.tax_group_component c
             WHERE c.tenant_id = NEW.tenant_id AND c.tax_group_id = NEW.id
        ) THEN
            RAISE EXCEPTION 'Scheduled or active tax group requires at least one component'
                USING ERRCODE = 'check_violation';
        END IF;

        IF EXISTS (
            SELECT 1
              FROM control.tax_group_component c
              JOIN control.tax_rate_schedule s
                ON s.tenant_id = c.tenant_id AND s.id = c.tax_rate_schedule_id
              JOIN master.tax_type t
                ON t.tenant_id = s.tenant_id AND t.id = s.tax_type_id
             WHERE c.tenant_id = NEW.tenant_id
               AND c.tax_group_id = NEW.id
               AND (
                    s.status NOT IN ('scheduled', 'active')
                    OR s.jurisdiction_id <> NEW.jurisdiction_id
                    OR s.effective_from > NEW.effective_from
                    OR (NEW.effective_to IS NULL AND s.effective_to IS NOT NULL)
                    OR (NEW.effective_to IS NOT NULL AND s.effective_to IS NOT NULL
                        AND s.effective_to < NEW.effective_to)
                    OR (NEW.group_kind = 'withholding' AND t.tax_class <> 'withholding')
                    OR (NEW.group_kind = 'indirect_tax' AND t.tax_class = 'withholding')
                    OR (NEW.group_kind = 'reverse_charge' AND s.reverse_charge_mode = 'NONE')
               )
        ) THEN
            RAISE EXCEPTION 'Tax-group components must be eligible and cover the complete group period'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_tax_group_component()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
DECLARE
    v_group control.tax_group%ROWTYPE;
    v_schedule control.tax_rate_schedule%ROWTYPE;
BEGIN
    SELECT * INTO v_group FROM control.tax_group
     WHERE tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id)
       AND id = COALESCE(NEW.tax_group_id, OLD.tax_group_id);

    IF NOT FOUND OR v_group.status <> 'draft' THEN
        RAISE EXCEPTION 'Tax-group components may only change while the parent group is draft'
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' AND (
        NEW.id IS DISTINCT FROM OLD.id
        OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.created_by IS DISTINCT FROM OLD.created_by
    ) THEN
        RAISE EXCEPTION 'Tax-group component identity and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO v_schedule FROM control.tax_rate_schedule
     WHERE tenant_id = NEW.tenant_id AND id = NEW.tax_rate_schedule_id;

    IF FOUND AND (
        v_schedule.status = 'retired'
        OR v_schedule.jurisdiction_id <> v_group.jurisdiction_id
        OR v_schedule.effective_from > v_group.effective_from
        OR (v_group.effective_to IS NULL AND v_schedule.effective_to IS NOT NULL)
        OR (v_group.effective_to IS NOT NULL AND v_schedule.effective_to IS NOT NULL
            AND v_schedule.effective_to < v_group.effective_to)
    ) THEN
        RAISE EXCEPTION 'Component schedule must match jurisdiction and cover the complete tax-group period'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_tax_resolution_rule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
DECLARE
    v_code text;
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status <> 'draft' THEN
        RAISE EXCEPTION 'Tax-resolution rules must be created as draft'
            USING ERRCODE = 'check_violation';
    END IF;

    FOREACH v_code IN ARRAY NEW.scope_doc_entity_codes LOOP
        IF v_code !~ '^[a-z][a-z0-9_.-]{0,126}$' THEN
            RAISE EXCEPTION 'Invalid document entity code: %', v_code
                USING ERRCODE = 'check_violation';
        END IF;
    END LOOP;

    IF NEW.status IN ('scheduled', 'active') AND NOT EXISTS (
        SELECT 1 FROM control.tax_group g
         WHERE g.tenant_id = NEW.tenant_id
           AND g.id = NEW.resolved_tax_group_id
           AND g.status IN ('scheduled', 'active')
           AND g.effective_from <= NEW.effective_from
           AND (NEW.effective_to IS NULL AND g.effective_to IS NULL
                OR NEW.effective_to IS NOT NULL
                   AND (g.effective_to IS NULL OR g.effective_to >= NEW.effective_to))
    ) THEN
        RAISE EXCEPTION 'Resolved tax group must cover the complete active rule period'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_wht_threshold_config()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, master
AS $$
DECLARE
    v_tax_class master.tax_class_d;
    v_section_mode master.tax_section_code_mode_d;
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status <> 'draft' THEN
        RAISE EXCEPTION 'WHT threshold policies must be created as draft'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT t.tax_class, t.section_code_mode
      INTO v_tax_class, v_section_mode
      FROM master.tax_type t
     WHERE t.tenant_id = NEW.tenant_id AND t.id = NEW.tax_type_id;

    IF FOUND AND v_tax_class <> 'withholding' THEN
        RAISE EXCEPTION 'WHT threshold tax_type_id must identify a withholding tax type'
            USING ERRCODE = 'check_violation';
    END IF;

    IF FOUND AND (
        (v_section_mode = 'required' AND NEW.section_code IS NULL)
        OR (v_section_mode = 'not_used' AND NEW.section_code IS NOT NULL)
    ) THEN
        RAISE EXCEPTION 'WHT threshold section_code does not satisfy the tax type section mode'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_accounting_policy_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
DECLARE
    v_old_business jsonb;
    v_new_business jsonb;
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'Only draft % rows may be deleted', TG_TABLE_NAME
                USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN OLD;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION '% identity and creation evidence are immutable', TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status <> 'draft' THEN
        v_old_business := to_jsonb(OLD) - ARRAY[
            'status', 'is_active', 'status_changed_at', 'status_changed_by',
            'updated_at', 'updated_by', 'effective_to'
        ];
        v_new_business := to_jsonb(NEW) - ARRAY[
            'status', 'is_active', 'status_changed_at', 'status_changed_by',
            'updated_at', 'updated_by', 'effective_to'
        ];

        IF v_new_business IS DISTINCT FROM v_old_business THEN
            RAISE EXCEPTION 'Activated % policy is immutable; create an effective-dated successor', TG_TABLE_NAME
                USING ERRCODE = 'check_violation';
        END IF;

        IF NEW.effective_to IS DISTINCT FROM OLD.effective_to
           AND (NEW.effective_to IS NULL
                OR NEW.effective_to < OLD.effective_from
                OR (OLD.effective_to IS NOT NULL AND NEW.effective_to > OLD.effective_to)) THEN
            RAISE EXCEPTION 'An activated % period may only be shortened', TG_TABLE_NAME
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
        (OLD.status = 'draft' AND NEW.status IN ('scheduled', 'active', 'retired'))
        OR (OLD.status = 'scheduled' AND NEW.status IN ('active', 'retired'))
        OR (OLD.status = 'active' AND NEW.status IN ('expired', 'retired'))
        OR (OLD.status = 'expired' AND NEW.status = 'retired')
    ) THEN
        RAISE EXCEPTION 'Invalid % status transition: % -> %', TG_TABLE_NAME, OLD.status, NEW.status
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_accounting_profile_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control, master
AS $$
DECLARE
    v_previous control.accounting_profile_policy%ROWTYPE;
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status <> 'draft' THEN
        RAISE EXCEPTION 'Accounting-profile policies must be created as draft'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.supersedes_policy_id IS NOT NULL THEN
        SELECT * INTO v_previous FROM control.accounting_profile_policy
         WHERE tenant_id = NEW.tenant_id AND id = NEW.supersedes_policy_id;
        IF FOUND AND (
            v_previous.accounting_profile_id <> NEW.accounting_profile_id
            OR v_previous.effective_from >= NEW.effective_from
            OR v_previous.effective_to IS NULL
            OR v_previous.effective_to >= NEW.effective_from
        ) THEN
            RAISE EXCEPTION 'Profile-policy successor must retain profile identity and begin after its closed predecessor'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSIF TG_OP = 'INSERT' AND EXISTS (
        SELECT 1 FROM control.accounting_profile_policy p
         WHERE p.tenant_id = NEW.tenant_id
           AND p.accounting_profile_id = NEW.accounting_profile_id
    ) THEN
        RAISE EXCEPTION 'A later accounting-profile policy must identify supersedes_policy_id'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status IN ('scheduled', 'active') THEN
        IF NOT EXISTS (
            SELECT 1 FROM master.accounting_profile p
             WHERE p.tenant_id = NEW.tenant_id
               AND p.id = NEW.accounting_profile_id
               AND p.status = 'active'
        ) THEN
            RAISE EXCEPTION 'Activated policy requires an active accounting-profile identity'
                USING ERRCODE = 'check_violation';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM control.accounting_profile_event e
             WHERE e.tenant_id = NEW.tenant_id
               AND e.accounting_profile_policy_id = NEW.id
               AND e.journal_action = 'post'
        ) THEN
            RAISE EXCEPTION 'Activated profile policy requires at least one posting event'
                USING ERRCODE = 'check_violation';
        END IF;

        IF EXISTS (
            SELECT 1
              FROM control.accounting_profile_event e
              LEFT JOIN control.accounting_profile_entry l
                ON l.tenant_id = e.tenant_id
               AND l.accounting_profile_event_id = e.id
             WHERE e.tenant_id = NEW.tenant_id
               AND e.accounting_profile_policy_id = NEW.id
               AND e.journal_action = 'post'
             GROUP BY e.id
            HAVING count(l.id) < 2
                OR count(l.id) FILTER (WHERE l.is_balancing_line) <> 1
                OR count(l.id) FILTER (WHERE l.posting_side = 'debit') = 0
                OR count(l.id) FILTER (WHERE l.posting_side = 'credit') = 0
        ) THEN
            RAISE EXCEPTION 'Every posting event requires at least two entries, both sides, and exactly one balancing line'
                USING ERRCODE = 'check_violation';
        END IF;

        IF EXISTS (
            SELECT 1
              FROM control.accounting_profile_event e
              JOIN control.accounting_profile_entry l
                ON l.tenant_id = e.tenant_id
               AND l.accounting_profile_event_id = e.id
             WHERE e.tenant_id = NEW.tenant_id
               AND e.accounting_profile_policy_id = NEW.id
               AND NOT EXISTS (
                    SELECT 1 FROM control.lookup_value v
                     WHERE v.domain_code = 'finance.posting_role'
                       AND v.code = l.posting_role_code
                       AND v.status = 'active'
                       AND (v.tenant_id IS NULL OR v.tenant_id = NEW.tenant_id)
               )
        ) THEN
            RAISE EXCEPTION 'Every accounting entry must use an active canonical finance.posting_role value'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_accounting_profile_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
DECLARE
    v_policy_id uuid;
BEGIN
    v_policy_id := CASE WHEN TG_OP = 'DELETE'
        THEN OLD.accounting_profile_policy_id ELSE NEW.accounting_profile_policy_id END;
    IF NOT EXISTS (
        SELECT 1 FROM control.accounting_profile_policy p
         WHERE p.tenant_id = CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END
           AND p.id = v_policy_id AND p.status = 'draft'
    ) THEN
        RAISE EXCEPTION 'Accounting-profile events may only change while the parent policy is draft'
            USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    IF TG_OP = 'UPDATE' AND (
        NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.accounting_profile_policy_id IS DISTINCT FROM OLD.accounting_profile_policy_id
        OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by
    ) THEN
        RAISE EXCEPTION 'Accounting-profile event identity and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_accounting_profile_entry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
DECLARE
    v_event_id uuid;
    v_tenant_id uuid;
BEGIN
    v_event_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.accounting_profile_event_id ELSE NEW.accounting_profile_event_id END;
    v_tenant_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
    IF NOT EXISTS (
        SELECT 1
          FROM control.accounting_profile_event e
          JOIN control.accounting_profile_policy p
            ON p.tenant_id = e.tenant_id AND p.id = e.accounting_profile_policy_id
         WHERE e.tenant_id = v_tenant_id AND e.id = v_event_id AND p.status = 'draft'
    ) THEN
        RAISE EXCEPTION 'Accounting-profile entries may only change while the parent policy is draft'
            USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    IF TG_OP = 'UPDATE' AND (
        NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.accounting_profile_event_id IS DISTINCT FROM OLD.accounting_profile_event_id
        OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by
    ) THEN
        RAISE EXCEPTION 'Accounting-profile entry identity and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_accounting_profile_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status <> 'draft' THEN
        RAISE EXCEPTION 'Accounting-profile assignments must be created as draft'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status IN ('scheduled', 'active') AND NOT EXISTS (
        SELECT 1 FROM control.accounting_profile_policy p
         WHERE p.tenant_id = NEW.tenant_id
           AND p.id = NEW.accounting_profile_policy_id
           AND p.status IN ('scheduled', 'active')
           AND p.effective_from <= NEW.effective_from
           AND ((NEW.effective_to IS NULL AND p.effective_to IS NULL)
                OR (NEW.effective_to IS NOT NULL
                    AND (p.effective_to IS NULL OR p.effective_to >= NEW.effective_to)))
    ) THEN
        RAISE EXCEPTION 'Assigned accounting-profile policy must cover the complete assignment period'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_posting_role_account_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control, master
AS $$
DECLARE
    v_previous control.posting_role_account_assignment%ROWTYPE;
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status <> 'draft' THEN
        RAISE EXCEPTION 'Posting-role account assignments must be created as draft'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.supersedes_assignment_id IS NOT NULL THEN
        SELECT * INTO v_previous FROM control.posting_role_account_assignment
         WHERE tenant_id = NEW.tenant_id AND id = NEW.supersedes_assignment_id;
        IF FOUND AND (
            v_previous.company_code_id <> NEW.company_code_id
            OR v_previous.ledger_book_id <> NEW.ledger_book_id
            OR v_previous.posting_role_code <> NEW.posting_role_code
            OR v_previous.effective_from >= NEW.effective_from
            OR v_previous.effective_to IS NULL
            OR v_previous.effective_to >= NEW.effective_from
        ) THEN
            RAISE EXCEPTION 'Posting-role successor must retain company, book and role and begin after its closed predecessor'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSIF TG_OP = 'INSERT' AND EXISTS (
        SELECT 1 FROM control.posting_role_account_assignment a
         WHERE a.tenant_id = NEW.tenant_id
           AND a.company_code_id = NEW.company_code_id
           AND a.ledger_book_id = NEW.ledger_book_id
           AND a.posting_role_code = NEW.posting_role_code
    ) THEN
        RAISE EXCEPTION 'A later posting-role assignment must identify supersedes_assignment_id'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status IN ('scheduled', 'active') THEN
        IF NOT EXISTS (
            SELECT 1 FROM control.lookup_value v
             WHERE v.domain_code = 'finance.posting_role'
               AND v.code = NEW.posting_role_code AND v.status = 'active'
               AND (v.tenant_id IS NULL OR v.tenant_id = NEW.tenant_id)
        ) THEN
            RAISE EXCEPTION 'Posting-role assignment requires an active canonical role'
                USING ERRCODE = 'check_violation';
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM master.company_code_book_assignment a
             WHERE a.tenant_id = NEW.tenant_id AND a.company_code_id = NEW.company_code_id
               AND a.book_id = NEW.ledger_book_id AND a.status = 'active'
               AND a.effective_from <= NEW.effective_from
               AND ((NEW.effective_to IS NULL AND a.effective_to IS NULL)
                    OR (NEW.effective_to IS NOT NULL
                        AND (a.effective_to IS NULL OR a.effective_to >= NEW.effective_to)))
        ) THEN
            RAISE EXCEPTION 'Ledger book must be assigned to the company for the complete role-assignment period'
                USING ERRCODE = 'check_violation';
        END IF;
        IF NOT EXISTS (
            SELECT 1
              FROM master.gl_account g
              JOIN master.company_code_chart_assignment c
                ON c.tenant_id = g.tenant_id AND c.chart_of_account_id = g.chart_of_account_id
               AND c.company_code_id = NEW.company_code_id AND c.status = 'active'
             WHERE g.tenant_id = NEW.tenant_id AND g.id = NEW.gl_account_id
               AND g.status = 'active' AND g.node_type = 'posting' AND NOT g.is_blocked
               AND (c.effective_from IS NULL OR c.effective_from <= NEW.effective_from)
               AND ((NEW.effective_to IS NULL AND c.effective_to IS NULL)
                    OR NEW.effective_to IS NOT NULL
                       AND (c.effective_to IS NULL OR c.effective_to >= NEW.effective_to))
               AND NOT EXISTS (
                    SELECT 1 FROM master.company_code_gl_account x
                     WHERE x.tenant_id = NEW.tenant_id AND x.company_code_id = NEW.company_code_id
                       AND x.gl_account_id = NEW.gl_account_id
                       AND (x.status <> 'active' OR NOT x.posting_allowed OR x.blocked_for_auto)
               )
        ) THEN
            RAISE EXCEPTION 'Assigned GL account is not an active auto-postable company account'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_cross_book_posting_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control, master
AS $$
DECLARE
    v_book_id uuid;
    v_previous control.cross_book_posting_policy%ROWTYPE;
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status <> 'draft' THEN
        RAISE EXCEPTION 'Cross-book posting policies must be created as draft'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.supersedes_policy_id IS NOT NULL THEN
        SELECT * INTO v_previous FROM control.cross_book_posting_policy
         WHERE tenant_id = NEW.tenant_id AND id = NEW.supersedes_policy_id;
        IF FOUND AND (
            v_previous.company_code_id <> NEW.company_code_id OR v_previous.code <> NEW.code
            OR v_previous.source_book_id <> NEW.source_book_id OR v_previous.target_book_id <> NEW.target_book_id
            OR v_previous.scope_document_type_code IS DISTINCT FROM NEW.scope_document_type_code
            OR v_previous.scope_business_intent_id IS DISTINCT FROM NEW.scope_business_intent_id
            OR v_previous.effective_from >= NEW.effective_from OR v_previous.effective_to IS NULL
            OR v_previous.effective_to >= NEW.effective_from
        ) THEN
            RAISE EXCEPTION 'Cross-book successor must retain identity/scope and begin after its closed predecessor'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSIF TG_OP = 'INSERT' AND EXISTS (
        SELECT 1 FROM control.cross_book_posting_policy p
         WHERE p.tenant_id = NEW.tenant_id AND p.company_code_id = NEW.company_code_id
           AND p.code = NEW.code
    ) THEN
        RAISE EXCEPTION 'A later cross-book policy must identify supersedes_policy_id'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status IN ('scheduled', 'active') THEN
        FOREACH v_book_id IN ARRAY ARRAY[NEW.source_book_id, NEW.target_book_id] LOOP
            IF NOT EXISTS (
                SELECT 1 FROM master.company_code_book_assignment a
                 WHERE a.tenant_id = NEW.tenant_id AND a.company_code_id = NEW.company_code_id
                   AND a.book_id = v_book_id AND a.status = 'active'
                   AND a.effective_from <= NEW.effective_from
                   AND ((NEW.effective_to IS NULL AND a.effective_to IS NULL)
                        OR (NEW.effective_to IS NOT NULL
                            AND (a.effective_to IS NULL OR a.effective_to >= NEW.effective_to)))
            ) THEN
                RAISE EXCEPTION 'Both cross-book ledgers must be assigned to the company for the complete policy period'
                    USING ERRCODE = 'check_violation';
            END IF;
        END LOOP;
        IF NEW.posting_mode = 'translate' AND NOT EXISTS (
            SELECT 1 FROM control.cross_book_account_assignment a
             WHERE a.tenant_id = NEW.tenant_id AND a.cross_book_posting_policy_id = NEW.id
        ) THEN
            RAISE EXCEPTION 'Translate-mode cross-book policy requires explicit account assignments'
                USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.posting_mode = 'mirror' AND EXISTS (
            SELECT 1 FROM control.cross_book_account_assignment a
             WHERE a.tenant_id = NEW.tenant_id AND a.cross_book_posting_policy_id = NEW.id
        ) THEN
            RAISE EXCEPTION 'Mirror-mode cross-book policy must not contain account translations'
                USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.posting_mode = 'translate' AND EXISTS (
            SELECT 1
              FROM control.cross_book_account_assignment a
              JOIN master.gl_account source_account
                ON source_account.tenant_id = a.tenant_id
               AND source_account.id = a.source_gl_account_id
              JOIN master.gl_account target_account
                ON target_account.tenant_id = a.tenant_id
               AND target_account.id = a.target_gl_account_id
             WHERE a.tenant_id = NEW.tenant_id
               AND a.cross_book_posting_policy_id = NEW.id
               AND (source_account.status <> 'active' OR source_account.node_type <> 'posting'
                    OR source_account.is_blocked OR target_account.status <> 'active'
                    OR target_account.node_type <> 'posting' OR target_account.is_blocked)
        ) THEN
            RAISE EXCEPTION 'Cross-book translation accounts must be active, postable and unblocked'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_cross_book_account_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
DECLARE
    v_policy_id uuid;
    v_tenant_id uuid;
BEGIN
    v_policy_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.cross_book_posting_policy_id ELSE NEW.cross_book_posting_policy_id END;
    v_tenant_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
    IF NOT EXISTS (
        SELECT 1 FROM control.cross_book_posting_policy p
         WHERE p.tenant_id = v_tenant_id AND p.id = v_policy_id AND p.status = 'draft'
    ) THEN
        RAISE EXCEPTION 'Cross-book account assignments may only change while the parent policy is draft'
            USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    IF TG_OP = 'UPDATE' AND (
        NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.cross_book_posting_policy_id IS DISTINCT FROM OLD.cross_book_posting_policy_id
        OR NEW.source_gl_account_id IS DISTINCT FROM OLD.source_gl_account_id
        OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by
    ) THEN
        RAISE EXCEPTION 'Cross-book account-assignment identity and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.resolve_accounting_profile_policy(
    p_company_code_id uuid,
    p_business_intent_id uuid DEFAULT NULL,
    p_flow_code text DEFAULT NULL,
    p_document_type_code text DEFAULT NULL,
    p_as_of_date date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, control
AS $$
DECLARE
    v_tenant_id uuid := shared.current_tenant_id();
    v_policy_id uuid;
    v_top_count integer;
BEGIN
    WITH candidates AS (
        SELECT a.accounting_profile_policy_id,
               ((a.company_code_id IS NOT NULL)::integer * 8
                + (a.business_intent_id IS NOT NULL)::integer * 4
                + (a.flow_code IS NOT NULL)::integer * 2
                + (a.document_type_code IS NOT NULL)::integer) AS specificity,
               a.effective_from
          FROM control.accounting_profile_assignment a
          JOIN control.accounting_profile_policy p
            ON p.tenant_id = a.tenant_id AND p.id = a.accounting_profile_policy_id
         WHERE a.tenant_id = v_tenant_id
           AND a.status = 'active' AND p.status = 'active'
           AND (a.company_code_id IS NULL OR a.company_code_id = p_company_code_id)
           AND (a.business_intent_id IS NULL OR a.business_intent_id = p_business_intent_id)
           AND (a.flow_code IS NULL OR a.flow_code = upper(p_flow_code))
           AND (a.document_type_code IS NULL OR a.document_type_code = upper(p_document_type_code))
           AND a.effective_from <= p_as_of_date
           AND (a.effective_to IS NULL OR a.effective_to >= p_as_of_date)
           AND p.effective_from <= p_as_of_date
           AND (p.effective_to IS NULL OR p.effective_to >= p_as_of_date)
    ), ranked AS (
        SELECT *, dense_rank() OVER (ORDER BY specificity DESC, effective_from DESC) AS rank_no
          FROM candidates
    )
    SELECT (array_agg(accounting_profile_policy_id))[1], count(*)::integer
      INTO v_policy_id, v_top_count FROM ranked WHERE rank_no = 1;

    IF v_top_count > 1 THEN
        RAISE EXCEPTION 'Ambiguous accounting-profile assignment for current tenant/context'
            USING ERRCODE = 'cardinality_violation';
    END IF;
    RETURN v_policy_id;
END;
$$;

CREATE OR REPLACE FUNCTION control.resolve_posting_role_account(
    p_company_code_id uuid,
    p_ledger_book_id uuid,
    p_posting_role_code text,
    p_as_of_date date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = pg_catalog, control
AS $$
    SELECT a.gl_account_id
      FROM control.posting_role_account_assignment a
     WHERE a.tenant_id = shared.current_tenant_id()
       AND a.company_code_id = p_company_code_id
       AND a.ledger_book_id = p_ledger_book_id
       AND a.posting_role_code = lower(p_posting_role_code)
       AND a.status = 'active'
       AND a.effective_from <= p_as_of_date
       AND (a.effective_to IS NULL OR a.effective_to >= p_as_of_date)
     LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_fiscal_calendar_config()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
DECLARE
    v_superseded control.fiscal_calendar_config%ROWTYPE;
    v_rule_count integer;
    v_normal_count integer;
    v_leap_count integer;
BEGIN
    NEW.code := lower(btrim(NEW.code));
    NEW.name := btrim(NEW.name);
    NEW.description := nullif(btrim(NEW.description), '');

    IF NEW.supersedes_id IS NULL THEN
        IF NEW.version_no <> 1 THEN
            RAISE EXCEPTION 'A root fiscal-calendar lineage must start at version 1'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSE
        SELECT * INTO v_superseded
          FROM control.fiscal_calendar_config
         WHERE tenant_id = NEW.tenant_id
           AND id = NEW.supersedes_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Superseded fiscal calendar does not exist in tenant'
                USING ERRCODE = 'foreign_key_violation';
        END IF;

        IF v_superseded.code IS DISTINCT FROM NEW.code
           OR NEW.version_no <> v_superseded.version_no + 1 THEN
            RAISE EXCEPTION
                'Fiscal-calendar replacement must retain code and increment version by one'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF NEW.calendar_type IN (
        'monthly', 'four_four_five', 'four_five_four', 'five_four_four'
    ) AND NEW.periods_per_year <> 12 THEN
        RAISE EXCEPTION '% calendars require 12 normal periods', NEW.calendar_type
            USING ERRCODE = 'check_violation';
    ELSIF NEW.calendar_type = 'thirteen_period'
          AND NEW.periods_per_year <> 13 THEN
        RAISE EXCEPTION 'thirteen_period calendars require 13 normal periods'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status <> 'active') THEN
        SELECT count(*)::integer,
               count(*) FILTER (WHERE period_type = 'normal')::integer,
               count(*) FILTER (WHERE absorbs_leap_week)::integer
          INTO v_rule_count, v_normal_count, v_leap_count
          FROM control.fiscal_calendar_period_rule
         WHERE tenant_id = NEW.tenant_id
           AND fiscal_calendar_config_id = NEW.id;

        IF v_rule_count = 0 OR v_normal_count <> NEW.periods_per_year THEN
            RAISE EXCEPTION
                'Fiscal calendar requires % normal rules before activation; found %',
                NEW.periods_per_year, v_normal_count
                USING ERRCODE = 'check_violation';
        END IF;

        IF (NEW.leap_week_rule = 'none' AND v_leap_count <> 0)
           OR (NEW.leap_week_rule = 'last_period' AND v_leap_count <> 1) THEN
            RAISE EXCEPTION
                'Leap-week absorber count does not match leap_week_rule %',
                NEW.leap_week_rule
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_fiscal_calendar_config()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status <> 'draft' THEN
            RAISE EXCEPTION 'Activated fiscal calendars cannot be deleted'
                USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN OLD;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.version_no IS DISTINCT FROM OLD.version_no
       OR NEW.supersedes_id IS DISTINCT FROM OLD.supersedes_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION
            'Fiscal-calendar identity, lineage, and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status <> 'draft' AND (
        NEW.code IS DISTINCT FROM OLD.code
        OR NEW.name IS DISTINCT FROM OLD.name
        OR NEW.description IS DISTINCT FROM OLD.description
        OR NEW.calendar_type IS DISTINCT FROM OLD.calendar_type
        OR NEW.fiscal_year_label_rule IS DISTINCT FROM OLD.fiscal_year_label_rule
        OR NEW.year_start_rule IS DISTINCT FROM OLD.year_start_rule
        OR NEW.anchor_month IS DISTINCT FROM OLD.anchor_month
        OR NEW.anchor_day IS DISTINCT FROM OLD.anchor_day
        OR NEW.week_start_day IS DISTINCT FROM OLD.week_start_day
        OR NEW.periods_per_year IS DISTINCT FROM OLD.periods_per_year
        OR NEW.leap_week_rule IS DISTINCT FROM OLD.leap_week_rule
        OR NEW.metadata IS DISTINCT FROM OLD.metadata
    ) THEN
        RAISE EXCEPTION
            'Activated fiscal-calendar semantics are immutable; create a versioned replacement'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status = 'retired' AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'A retired fiscal calendar is immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
        OLD.status = 'draft' AND NEW.status IN ('active', 'retired')
        OR OLD.status = 'active' AND NEW.status = 'retired'
    ) THEN
        RAISE EXCEPTION 'Invalid fiscal-calendar status transition'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_fiscal_calendar_period_rule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
DECLARE
    v_status control.fiscal_calendar_status_d;
BEGIN
    SELECT status INTO v_status
      FROM control.fiscal_calendar_config
     WHERE tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id)
       AND id = COALESCE(
            NEW.fiscal_calendar_config_id,
            OLD.fiscal_calendar_config_id
       );

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Fiscal-calendar parent does not exist in tenant'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_status <> 'draft' THEN
        RAISE EXCEPTION 'Period rules may change only while the calendar is draft'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF TG_OP = 'UPDATE' AND (
        NEW.id IS DISTINCT FROM OLD.id
        OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.fiscal_calendar_config_id
            IS DISTINCT FROM OLD.fiscal_calendar_config_id
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.created_by IS DISTINCT FROM OLD.created_by
    ) THEN
        RAISE EXCEPTION 'Period-rule identity and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_validate_company_fiscal_calendar_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF NEW.status = 'active' AND NOT EXISTS (
        SELECT 1
          FROM control.fiscal_calendar_config AS config
         WHERE config.tenant_id = NEW.tenant_id
           AND config.id = NEW.fiscal_calendar_config_id
           AND config.status = 'active'
    ) THEN
        RAISE EXCEPTION 'Company assignment requires an active fiscal calendar'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_company_fiscal_calendar_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Fiscal-calendar assignments are retained as history'
            USING ERRCODE = 'restrict_violation';
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
       OR NEW.fiscal_calendar_config_id
            IS DISTINCT FROM OLD.fiscal_calendar_config_id
       OR NEW.effective_fiscal_year_from
            IS DISTINCT FROM OLD.effective_fiscal_year_from
       OR NEW.metadata IS DISTINCT FROM OLD.metadata
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION
            'Fiscal-calendar assignment identity and historical semantics are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status = 'inactive' AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'An inactive fiscal-calendar assignment is immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.effective_fiscal_year_to
          IS DISTINCT FROM OLD.effective_fiscal_year_to
       AND (
            NEW.effective_fiscal_year_to IS NULL
            OR (
                OLD.effective_fiscal_year_to IS NOT NULL
                AND NEW.effective_fiscal_year_to > OLD.effective_fiscal_year_to
            )
       ) THEN
        RAISE EXCEPTION 'Assignment coverage may be shortened but never extended'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status = 'active' AND NEW.status = 'inactive') THEN
        RAISE EXCEPTION 'Invalid fiscal-calendar assignment status transition'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.fiscal_calendar_year_start(
    p_tenant_id uuid,
    p_calendar_config_id uuid,
    p_fiscal_year integer
)
RETURNS date
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, control
AS $$
DECLARE
    v_config control.fiscal_calendar_config%ROWTYPE;
    v_base_year integer;
    v_month_end integer;
    v_anchor date;
    v_iso_day integer;
    v_delta integer;
BEGIN
    IF p_tenant_id IS DISTINCT FROM shared.current_tenant_id() THEN
        RAISE EXCEPTION 'Fiscal-calendar tenant does not match active session'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT * INTO v_config
      FROM control.fiscal_calendar_config
     WHERE tenant_id = p_tenant_id AND id = p_calendar_config_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Fiscal calendar was not found for tenant'
            USING ERRCODE = 'no_data_found';
    END IF;

    v_base_year := CASE v_config.fiscal_year_label_rule
        WHEN 'end_year' THEN p_fiscal_year - 1 ELSE p_fiscal_year END;
    v_month_end := EXTRACT(DAY FROM (
        make_date(v_base_year, v_config.anchor_month, 1)
        + INTERVAL '1 month - 1 day'
    ))::integer;
    v_anchor := make_date(
        v_base_year, v_config.anchor_month,
        LEAST(v_config.anchor_day::integer, v_month_end)
    );

    IF v_config.year_start_rule = 'fixed_date' THEN RETURN v_anchor; END IF;
    v_iso_day := EXTRACT(ISODOW FROM v_anchor)::integer;
    IF v_config.year_start_rule = 'first_on_or_after' THEN
        RETURN v_anchor + ((v_config.week_start_day - v_iso_day + 7) % 7);
    ELSIF v_config.year_start_rule = 'last_on_or_before' THEN
        RETURN v_anchor - ((v_iso_day - v_config.week_start_day + 7) % 7);
    END IF;
    v_delta := (v_config.week_start_day - v_iso_day + 7) % 7;
    RETURN CASE WHEN v_delta <= 3
        THEN v_anchor + v_delta ELSE v_anchor - (7 - v_delta) END;
END;
$$;

CREATE OR REPLACE FUNCTION control.preview_fiscal_calendar(
    p_tenant_id uuid,
    p_calendar_config_id uuid,
    p_fiscal_year integer
)
RETURNS TABLE (
    sequence_no smallint, period_number smallint, period_type text,
    period_name text, start_date date, end_date date,
    quarter_number smallint, is_adjustment boolean
)
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, control
AS $$
DECLARE
    v_config control.fiscal_calendar_config%ROWTYPE;
    v_rule control.fiscal_calendar_period_rule%ROWTYPE;
    v_year_start date;
    v_next_year_start date;
    v_cursor date;
    v_start date;
    v_end date;
    v_last_normal_sequence smallint;
    v_normal_count integer;
    v_gap integer;
BEGIN
    IF p_tenant_id IS DISTINCT FROM shared.current_tenant_id() THEN
        RAISE EXCEPTION 'Fiscal-calendar tenant does not match active session'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT * INTO v_config
      FROM control.fiscal_calendar_config
     WHERE tenant_id = p_tenant_id
       AND id = p_calendar_config_id
       AND status <> 'retired';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active or draft fiscal calendar was not found'
            USING ERRCODE = 'no_data_found';
    END IF;

    SELECT count(*) FILTER (WHERE rule.period_type = 'normal')::integer,
           max(rule.sequence_no) FILTER (WHERE rule.period_type = 'normal')
      INTO v_normal_count, v_last_normal_sequence
      FROM control.fiscal_calendar_period_rule AS rule
     WHERE rule.tenant_id = p_tenant_id
       AND rule.fiscal_calendar_config_id = p_calendar_config_id;
    IF v_normal_count <> v_config.periods_per_year THEN
        RAISE EXCEPTION 'Calendar normal-rule count does not match periods_per_year'
            USING ERRCODE = 'check_violation';
    END IF;

    v_year_start := control.fiscal_calendar_year_start(
        p_tenant_id, p_calendar_config_id, p_fiscal_year
    );
    v_next_year_start := control.fiscal_calendar_year_start(
        p_tenant_id, p_calendar_config_id, p_fiscal_year + 1
    );
    v_cursor := v_year_start;

    FOR v_rule IN
        SELECT rule.*
          FROM control.fiscal_calendar_period_rule AS rule
         WHERE rule.tenant_id = p_tenant_id
           AND rule.fiscal_calendar_config_id = p_calendar_config_id
         ORDER BY rule.sequence_no
    LOOP
        v_start := CASE v_rule.anchor
            WHEN 'year_start' THEN v_year_start
            WHEN 'year_end' THEN v_next_year_start - 1
            ELSE v_cursor END;
        v_end := CASE v_rule.duration_unit
            WHEN 'point' THEN v_start
            WHEN 'day' THEN v_start + (v_rule.duration_value - 1)
            WHEN 'week' THEN v_start + (v_rule.duration_value * 7 - 1)
            ELSE (v_start + make_interval(months => v_rule.duration_value)
                  - INTERVAL '1 day')::date END;

        IF v_rule.period_type = 'normal' THEN
            IF v_rule.sequence_no = v_last_normal_sequence THEN
                v_gap := v_next_year_start - (v_end + 1);
                IF v_gap <> 0 THEN
                    IF v_rule.absorbs_leap_week
                       AND v_config.leap_week_rule = 'last_period'
                       AND v_gap = 7 THEN
                        v_end := v_next_year_start - 1;
                    ELSE
                        RAISE EXCEPTION
                            'Calendar normal periods do not cover fiscal year; gap % days',
                            v_gap USING ERRCODE = 'check_violation';
                    END IF;
                END IF;
            END IF;
            IF v_start < v_year_start OR v_end >= v_next_year_start THEN
                RAISE EXCEPTION 'Normal period lies outside fiscal-year bounds'
                    USING ERRCODE = 'check_violation';
            END IF;
            v_cursor := v_end + 1;
        END IF;

        sequence_no := v_rule.sequence_no;
        period_number := v_rule.period_number;
        period_type := v_rule.period_type::text;
        period_name := replace(replace(
            v_rule.name_template, '{period}',
            lpad(v_rule.period_number::text, 2, '0')
        ), '{year}', p_fiscal_year::text);
        start_date := v_start;
        end_date := v_end;
        quarter_number := v_rule.quarter_number;
        is_adjustment := v_rule.period_type = 'adjustment';
        RETURN NEXT;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION control.resolve_company_fiscal_calendar(
    p_tenant_id uuid,
    p_company_code_id uuid,
    p_fiscal_year integer
)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = pg_catalog, control
AS $$
    SELECT assignment.fiscal_calendar_config_id
      FROM control.company_fiscal_calendar_assignment AS assignment
      JOIN control.fiscal_calendar_config AS config
        ON config.tenant_id = assignment.tenant_id
       AND config.id = assignment.fiscal_calendar_config_id
       AND config.status = 'active'
     WHERE p_tenant_id = shared.current_tenant_id()
       AND assignment.tenant_id = p_tenant_id
       AND assignment.company_code_id = p_company_code_id
       AND assignment.status = 'active'
       AND assignment.effective_fiscal_year_from <= p_fiscal_year
       AND (
            assignment.effective_fiscal_year_to IS NULL
            OR assignment.effective_fiscal_year_to >= p_fiscal_year
       )
     ORDER BY assignment.effective_fiscal_year_from DESC
     LIMIT 1
$$;

CREATE OR REPLACE FUNCTION master.resolve_fiscal_period(
    p_tenant_id uuid,
    p_company_code_id uuid,
    p_posting_date date,
    p_include_special boolean DEFAULT false
)
RETURNS TABLE (
    fiscal_period_id uuid, fiscal_year smallint, period_number smallint,
    period_type text, status text
)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, master
AS $$
    SELECT period.id, period.fiscal_year, period.period_number,
           period.period_type::text, period.status::text
      FROM master.fiscal_period AS period
     WHERE p_tenant_id = shared.current_tenant_id()
       AND period.tenant_id = p_tenant_id
       AND period.company_code_id = p_company_code_id
       AND p_posting_date BETWEEN period.start_date AND period.end_date
       AND (p_include_special OR period.period_type = 'normal')
     ORDER BY CASE period.period_type::text
                  WHEN 'normal' THEN 0 WHEN 'closing' THEN 1
                  WHEN 'adjustment' THEN 2 ELSE 3 END,
              period.period_number
     LIMIT 1
$$;

CREATE OR REPLACE FUNCTION control.generate_fiscal_periods(
    p_tenant_id uuid,
    p_company_code_id uuid,
    p_fiscal_year integer,
    p_actor_id uuid,
    p_calendar_config_id uuid DEFAULT NULL,
    p_replace_future boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, control, master, ledger
AS $$
DECLARE
    v_config_id uuid;
    v_assigned_config_id uuid;
    v_config control.fiscal_calendar_config%ROWTYPE;
    v_period record;
    v_generation_key text;
    v_generated integer := 0;
    v_book_rows integer := 0;
BEGIN
    IF p_tenant_id IS DISTINCT FROM shared.current_tenant_id() THEN
        RAISE EXCEPTION 'Fiscal-calendar tenant does not match active session'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM master.principal
         WHERE tenant_id = p_tenant_id AND id = p_actor_id
    ) THEN
        RAISE EXCEPTION 'Fiscal-period actor does not exist in tenant'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    PERFORM 1 FROM master.company_code
     WHERE tenant_id = p_tenant_id AND id = p_company_code_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Company was not found for tenant'
            USING ERRCODE = 'no_data_found';
    END IF;

    v_assigned_config_id := control.resolve_company_fiscal_calendar(
        p_tenant_id, p_company_code_id, p_fiscal_year
    );
    IF p_calendar_config_id IS NOT NULL
       AND p_calendar_config_id IS DISTINCT FROM v_assigned_config_id THEN
        RAISE EXCEPTION 'Requested calendar is not assigned for fiscal year'
            USING ERRCODE = 'check_violation';
    END IF;
    v_config_id := COALESCE(p_calendar_config_id, v_assigned_config_id);
    IF v_config_id IS NULL THEN
        RAISE EXCEPTION 'No active fiscal-calendar assignment covers fiscal year'
            USING ERRCODE = 'no_data_found';
    END IF;

    SELECT * INTO v_config FROM control.fiscal_calendar_config
     WHERE tenant_id = p_tenant_id AND id = v_config_id AND status = 'active';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Assigned fiscal calendar is not active'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM master.fiscal_period AS existing
         WHERE existing.tenant_id = p_tenant_id
           AND existing.company_code_id = p_company_code_id
           AND existing.fiscal_year = p_fiscal_year
           AND existing.status <> 'future'
           AND NOT EXISTS (
                SELECT 1
                  FROM control.preview_fiscal_calendar(
                      p_tenant_id, v_config_id, p_fiscal_year
                  ) AS expected
                 WHERE expected.period_number = existing.period_number
                   AND expected.period_type = existing.period_type::text
                   AND expected.start_date = existing.start_date
                   AND expected.end_date = existing.end_date
           )
    ) THEN
        RAISE EXCEPTION 'Opened or closed periods differ from assigned calendar'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF p_replace_future THEN
        DELETE FROM ledger.book_period_status AS gate
         USING master.fiscal_period AS period
         WHERE gate.tenant_id = p_tenant_id
           AND gate.fiscal_period_id = period.id
           AND gate.status = 'future'
           AND period.tenant_id = p_tenant_id
           AND period.company_code_id = p_company_code_id
           AND period.fiscal_year = p_fiscal_year
           AND period.status = 'future'
           AND period.fiscal_calendar_config_id IS NOT NULL
           AND NOT EXISTS (
                SELECT 1 FROM control.preview_fiscal_calendar(
                    p_tenant_id, v_config_id, p_fiscal_year
                ) AS expected
                 WHERE expected.period_number = period.period_number
                   AND expected.period_type = period.period_type::text
                   AND expected.start_date = period.start_date
                   AND expected.end_date = period.end_date
           );

        DELETE FROM master.fiscal_period AS period
         WHERE period.tenant_id = p_tenant_id
           AND period.company_code_id = p_company_code_id
           AND period.fiscal_year = p_fiscal_year
           AND period.status = 'future'
           AND period.fiscal_calendar_config_id IS NOT NULL
           AND NOT EXISTS (
                SELECT 1 FROM control.preview_fiscal_calendar(
                    p_tenant_id, v_config_id, p_fiscal_year
                ) AS expected
                 WHERE expected.period_number = period.period_number
                   AND expected.period_type = period.period_type::text
                   AND expected.start_date = period.start_date
                   AND expected.end_date = period.end_date
           );
    END IF;

    FOR v_period IN
        SELECT * FROM control.preview_fiscal_calendar(
            p_tenant_id, v_config_id, p_fiscal_year
        )
    LOOP
        v_generation_key := concat_ws(
            ':', p_company_code_id, p_fiscal_year,
            v_config_id, v_config.version_no, v_period.period_number
        );
        INSERT INTO master.fiscal_period (
            tenant_id, code, name, company_code_id, fiscal_year,
            period_number, period_type, start_date, end_date,
            fiscal_calendar_config_id, calendar_version_no,
            generation_key, generated_at, sort_order, status, created_by
        ) VALUES (
            p_tenant_id,
            concat(p_fiscal_year, '-P', lpad(v_period.period_number::text, 2, '0')),
            v_period.period_name, p_company_code_id, p_fiscal_year,
            v_period.period_number, v_period.period_type,
            v_period.start_date, v_period.end_date, v_config_id,
            v_config.version_no, v_generation_key, now(),
            v_period.sequence_no, 'future', p_actor_id
        )
        ON CONFLICT (tenant_id, company_code_id, fiscal_year, period_number)
        DO UPDATE SET
            code = EXCLUDED.code,
            name = EXCLUDED.name,
            period_type = EXCLUDED.period_type,
            start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date,
            fiscal_calendar_config_id = EXCLUDED.fiscal_calendar_config_id,
            calendar_version_no = EXCLUDED.calendar_version_no,
            generation_key = EXCLUDED.generation_key,
            generated_at = EXCLUDED.generated_at,
            sort_order = EXCLUDED.sort_order,
            updated_by = p_actor_id
        WHERE master.fiscal_period.status = 'future';
        v_generated := v_generated + 1;
    END LOOP;

    WITH period_bounds AS (
        SELECT min(start_date) AS fiscal_start, max(end_date) AS fiscal_end
          FROM master.fiscal_period
         WHERE tenant_id = p_tenant_id
           AND company_code_id = p_company_code_id
           AND fiscal_year = p_fiscal_year
    )
    INSERT INTO ledger.book_period_status (
        tenant_id, ledger_book_id, fiscal_period_id,
        status, created_by
    )
    SELECT p_tenant_id, assignment.book_id, period.id, 'future', p_actor_id
      FROM master.company_code_book_assignment AS assignment
      JOIN master.fiscal_period AS period
        ON period.tenant_id = assignment.tenant_id
       AND period.company_code_id = assignment.company_code_id
       AND period.fiscal_year = p_fiscal_year
     CROSS JOIN period_bounds AS bounds
     WHERE assignment.tenant_id = p_tenant_id
       AND assignment.company_code_id = p_company_code_id
       AND assignment.status = 'active'
       AND assignment.effective_from <= bounds.fiscal_end
       AND (
            assignment.effective_to IS NULL
            OR assignment.effective_to >= bounds.fiscal_start
       )
    ON CONFLICT (tenant_id, ledger_book_id, fiscal_period_id) DO NOTHING;
    GET DIAGNOSTICS v_book_rows = ROW_COUNT;

    RETURN jsonb_build_object(
        'companyCodeId', p_company_code_id,
        'fiscalYear', p_fiscal_year,
        'calendarConfigId', v_config_id,
        'calendarCode', v_config.code,
        'calendarVersion', v_config.version_no,
        'periodCount', v_generated,
        'bookPeriodRowsCreated', v_book_rows
    );
END;
$$;

COMMENT ON FUNCTION control.generate_fiscal_periods(
    uuid, uuid, integer, uuid, uuid, boolean
) IS
  'Tenant-session-bound idempotent generator for master fiscal periods and ledger book-period gates.';

CREATE OR REPLACE FUNCTION control.trg_guard_mesh_business_partner_profile_evidence()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    RAISE EXCEPTION 'NEON MESH Business Partner inbox and processing evidence are immutable' USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_reject_mesh_workforce_claim_evidence_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    RAISE EXCEPTION 'NEON MESH workforce-claim inbox and processing evidence are immutable'
        USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_reject_customer_lifecycle_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    RAISE EXCEPTION 'Customer lifecycle events are immutable'
        USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_reject_business_partner_mutation_evidence_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    RAISE EXCEPTION 'Business Partner mutation evidence is append-only'
        USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_guard_business_partner_mutation_evidence_payload()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
    IF document.fn_business_partner_payload_has_restricted_key(NEW.evidence) THEN
        RAISE EXCEPTION 'Business Partner mutation evidence contains protected identity data'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.fn_record_business_partner_mutation(
    p_tenant_id uuid, p_aggregate_kind text, p_aggregate_id uuid,
    p_business_partner_id uuid, p_command_code text, p_from_state text,
    p_to_state text, p_expected_version bigint, p_reason text,
    p_idempotency_key text, p_command_fingerprint text, p_evidence jsonb,
    p_actor_id uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, control, event, shared
AS $$
DECLARE v_id uuid;
BEGIN
    INSERT INTO control.business_partner_mutation_evidence(
        tenant_id,aggregate_kind,aggregate_id,business_partner_id,command_code,
        from_state,to_state,expected_version,resulting_version,reason,
        idempotency_key,command_fingerprint,evidence,occurred_by
    ) VALUES (
        p_tenant_id,p_aggregate_kind,p_aggregate_id,p_business_partner_id,p_command_code,
        p_from_state,p_to_state,p_expected_version,p_expected_version+1,p_reason,
        p_idempotency_key,p_command_fingerprint,COALESCE(p_evidence,'{}'::jsonb),p_actor_id
    ) RETURNING id INTO v_id;

    INSERT INTO event.outbox(
        tenant_id,topic,event_type,event_key,entity_type,entity_id,
        aggregate_type,aggregate_id,event_version,actor_id,source,payload,created_by
    ) VALUES (
        p_tenant_id,'neon-business-partner',
        'business_partner.'||p_aggregate_kind||'.'||p_to_state,
        'bp-mutation:'||v_id::text,p_aggregate_kind,p_aggregate_id,
        p_aggregate_kind,p_aggregate_id,
        LEAST(p_expected_version+1,2147483647)::integer,p_actor_id,'neon.ddl',
        jsonb_build_object(
            'evidenceId',v_id,'aggregateKind',p_aggregate_kind,
            'aggregateId',p_aggregate_id,'businessPartnerId',p_business_partner_id,
            'commandCode',p_command_code,'fromState',p_from_state,
            'toState',p_to_state,'recordVersion',p_expected_version+1,
            'commandFingerprint',p_command_fingerprint,'occurredBy',p_actor_id
        ),p_actor_id
    );
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_enforce_business_partner_mutation_authority()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control
AS $$
DECLARE
    v_evidence_id uuid;
    v_kind text;
    v_old_state text;
    v_new_state text;
    v_old_version bigint;
    v_new_version bigint;
BEGIN
    v_old_state := CASE WHEN TG_TABLE_NAME IN ('business_partner_qualification','customer_credit_review')
                        THEN to_jsonb(OLD)->>'decision' ELSE to_jsonb(OLD)->>'status' END;
    v_new_state := CASE WHEN TG_TABLE_NAME IN ('business_partner_qualification','customer_credit_review')
                        THEN to_jsonb(NEW)->>'decision' ELSE to_jsonb(NEW)->>'status' END;
    IF v_new_state IS NOT DISTINCT FROM v_old_state THEN RETURN NEW; END IF;
    v_kind := CASE TG_TABLE_NAME
        WHEN 'business_partner' THEN 'business_partner'
        WHEN 'supplier' THEN 'supplier'
        WHEN 'customer' THEN 'customer'
        WHEN 'business_partner_relationship' THEN 'business_partner_relationship'
        WHEN 'business_partner_qualification' THEN 'qualification'
        WHEN 'supplier_preference_designation' THEN 'supplier_preference'
        WHEN 'customer_account_designation' THEN 'customer_designation'
        WHEN 'customer_credit_review' THEN 'customer_credit_review' END;
    v_old_version := COALESCE((to_jsonb(OLD)->>'record_version')::bigint,(to_jsonb(OLD)->>'row_version')::bigint);
    v_new_version := COALESCE((to_jsonb(NEW)->>'record_version')::bigint,(to_jsonb(NEW)->>'row_version')::bigint);
    BEGIN
        v_evidence_id := NULLIF(current_setting('app.business_partner_mutation_evidence_id',true),'')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN v_evidence_id := NULL; END;
    IF v_evidence_id IS NULL OR NOT EXISTS(
        SELECT 1 FROM control.business_partner_mutation_evidence evidence
         WHERE evidence.id=v_evidence_id AND evidence.tenant_id=NEW.tenant_id
           AND evidence.aggregate_kind=v_kind AND evidence.aggregate_id=NEW.id
           AND evidence.from_state=v_old_state AND evidence.to_state=v_new_state
           AND evidence.expected_version=v_old_version AND evidence.resulting_version=v_new_version
           AND evidence.occurred_by IS NOT DISTINCT FROM NEW.updated_by
    ) THEN
        RAISE EXCEPTION '%.% lifecycle/decision mutation requires its S5 command function',TG_TABLE_SCHEMA,TG_TABLE_NAME
            USING ERRCODE='insufficient_privilege';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION control.command_business_partner_lifecycle(
    p_tenant_id uuid, p_aggregate_kind text, p_aggregate_id uuid,
    p_to_state text, p_expected_version bigint, p_reason text,
    p_idempotency_key text, p_actor_id uuid
) RETURNS TABLE(aggregate_id uuid,state text,record_version bigint,evidence_id uuid,replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, control, master, shared
AS $$
DECLARE
    v_from text; v_version bigint; v_bp_id uuid; v_created_by uuid;
    v_existing control.business_partner_mutation_evidence%ROWTYPE;
    v_fingerprint text; v_evidence_id uuid; v_valid boolean := false;
BEGIN
    IF NULLIF(current_setting('app.current_tenant_id',true),'')::uuid IS DISTINCT FROM p_tenant_id
       OR NULLIF(current_setting('app.current_principal_id',true),'')::uuid IS DISTINCT FROM p_actor_id THEN
        RAISE EXCEPTION 'Business Partner lifecycle context does not match tenant and actor' USING ERRCODE='insufficient_privilege';
    END IF;
    IF p_aggregate_kind NOT IN('business_partner','supplier','business_partner_relationship')
       OR length(btrim(p_reason)) NOT BETWEEN 1 AND 4000
       OR btrim(p_idempotency_key)<>p_idempotency_key OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN
        RAISE EXCEPTION 'Invalid Business Partner lifecycle command' USING ERRCODE='check_violation';
    END IF;
    v_fingerprint:=encode(public.digest(convert_to(jsonb_build_object(
        'tenantId',p_tenant_id,'aggregateKind',p_aggregate_kind,'aggregateId',p_aggregate_id,
        'toState',p_to_state,'expectedVersion',p_expected_version,'reason',p_reason,
        'idempotencyKey',p_idempotency_key,'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');
    PERFORM pg_advisory_xact_lock(hashtextextended(
        p_tenant_id::text||':bp-idempotency:'||p_idempotency_key,0));
    SELECT * INTO v_existing FROM control.business_partner_mutation_evidence
     WHERE tenant_id=p_tenant_id AND idempotency_key=p_idempotency_key;
    IF FOUND THEN
        IF v_existing.command_fingerprint<>v_fingerprint THEN
            RAISE EXCEPTION 'Business Partner lifecycle idempotency key was reused' USING ERRCODE='unique_violation';
        END IF;
        RETURN QUERY SELECT v_existing.aggregate_id,v_existing.to_state,v_existing.resulting_version,v_existing.id,true;
        RETURN;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':'||p_aggregate_kind||':'||p_aggregate_id::text,0));
    IF p_aggregate_kind='business_partner' THEN
        SELECT value.status::text,value.record_version,value.id,value.created_by INTO v_from,v_version,v_bp_id,v_created_by
          FROM master.business_partner value WHERE value.tenant_id=p_tenant_id AND value.id=p_aggregate_id FOR UPDATE;
        v_valid := (v_from='draft' AND p_to_state IN('active','archived')) OR (v_from='active' AND p_to_state IN('inactive','archived')) OR (v_from='inactive' AND p_to_state IN('active','archived'));
    ELSIF p_aggregate_kind='supplier' THEN
        SELECT value.status::text,value.record_version,value.business_partner_id,value.created_by INTO v_from,v_version,v_bp_id,v_created_by
          FROM master.supplier value WHERE value.tenant_id=p_tenant_id AND value.id=p_aggregate_id FOR UPDATE;
        v_valid := (v_from='onboarding' AND p_to_state IN('active','inactive','archived')) OR (v_from='active' AND p_to_state IN('suspended','inactive','archived')) OR (v_from='suspended' AND p_to_state IN('active','inactive','archived')) OR (v_from='inactive' AND p_to_state IN('active','archived'));
    ELSE
        SELECT value.status::text,value.record_version,value.source_business_partner_id,value.created_by INTO v_from,v_version,v_bp_id,v_created_by
          FROM master.business_partner_relationship value WHERE value.tenant_id=p_tenant_id AND value.id=p_aggregate_id FOR UPDATE;
        v_valid := (v_from='draft' AND p_to_state IN('active','archived')) OR (v_from='active' AND p_to_state IN('inactive','archived')) OR (v_from='inactive' AND p_to_state IN('active','archived'));
    END IF;
    IF v_from IS NULL OR v_version<>p_expected_version THEN RETURN; END IF;
    IF NOT v_valid THEN RAISE EXCEPTION 'Invalid % lifecycle transition: % -> %',p_aggregate_kind,v_from,p_to_state USING ERRCODE='check_violation'; END IF;
    v_evidence_id:=control.fn_record_business_partner_mutation(p_tenant_id,p_aggregate_kind,p_aggregate_id,v_bp_id,
        'transition_'||p_to_state,v_from,p_to_state,p_expected_version,p_reason,p_idempotency_key,v_fingerprint,'{}'::jsonb,p_actor_id);
    PERFORM set_config('app.business_partner_mutation_evidence_id',v_evidence_id::text,true);
    IF p_aggregate_kind='business_partner' THEN UPDATE master.business_partner SET status=p_to_state::master.business_partner_status_d,updated_by=p_actor_id WHERE tenant_id=p_tenant_id AND id=p_aggregate_id;
    ELSIF p_aggregate_kind='supplier' THEN UPDATE master.supplier SET status=p_to_state::master.supplier_status_d,updated_by=p_actor_id WHERE tenant_id=p_tenant_id AND id=p_aggregate_id;
    ELSE UPDATE master.business_partner_relationship SET status=p_to_state::master.partner_extension_status_d,updated_by=p_actor_id WHERE tenant_id=p_tenant_id AND id=p_aggregate_id; END IF;
    PERFORM set_config('app.business_partner_mutation_evidence_id','',true);
    RETURN QUERY SELECT p_aggregate_id,p_to_state,p_expected_version+1,v_evidence_id,false;
END;
$$;

CREATE OR REPLACE FUNCTION control.command_business_partner_decision(
    p_tenant_id uuid, p_aggregate_kind text, p_aggregate_id uuid,
    p_to_state text, p_expected_version bigint, p_reason text,
    p_idempotency_key text, p_decision_fingerprint text, p_payload jsonb,
    p_actor_id uuid
) RETURNS TABLE(aggregate_id uuid,state text,row_version bigint,evidence_id uuid,replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, control, master, shared
AS $$
DECLARE
    v_from text; v_version bigint; v_bp_id uuid; v_created_by uuid;
    v_existing control.business_partner_mutation_evidence%ROWTYPE;
    v_fingerprint text; v_evidence_id uuid; v_approved boolean;
BEGIN
    IF NULLIF(current_setting('app.current_tenant_id',true),'')::uuid IS DISTINCT FROM p_tenant_id
       OR NULLIF(current_setting('app.current_principal_id',true),'')::uuid IS DISTINCT FROM p_actor_id THEN
        RAISE EXCEPTION 'Business Partner decision context does not match tenant and actor' USING ERRCODE='insufficient_privilege';
    END IF;
    IF p_aggregate_kind NOT IN('qualification','supplier_preference','customer_designation','customer_credit_review')
       OR p_decision_fingerprint !~ '^[a-f0-9]{64}$' OR jsonb_typeof(COALESCE(p_payload,'{}'::jsonb))<>'object'
       OR octet_length(COALESCE(p_payload,'{}'::jsonb)::text)>16384 OR length(btrim(p_reason)) NOT BETWEEN 1 AND 4000
       OR btrim(p_idempotency_key)<>p_idempotency_key OR length(p_idempotency_key) NOT BETWEEN 8 AND 200 THEN
        RAISE EXCEPTION 'Invalid Business Partner decision command' USING ERRCODE='check_violation';
    END IF;
    v_fingerprint:=encode(public.digest(convert_to(jsonb_build_object(
        'tenantId',p_tenant_id,'aggregateKind',p_aggregate_kind,'aggregateId',p_aggregate_id,
        'toState',p_to_state,'expectedVersion',p_expected_version,'reason',p_reason,
        'idempotencyKey',p_idempotency_key,'decisionFingerprint',p_decision_fingerprint,
        'payload',COALESCE(p_payload,'{}'::jsonb),'actorId',p_actor_id)::text,'UTF8'),'sha256'),'hex');
    PERFORM pg_advisory_xact_lock(hashtextextended(
        p_tenant_id::text||':bp-idempotency:'||p_idempotency_key,0));
    SELECT * INTO v_existing FROM control.business_partner_mutation_evidence WHERE tenant_id=p_tenant_id AND idempotency_key=p_idempotency_key;
    IF FOUND THEN
        IF v_existing.command_fingerprint<>v_fingerprint THEN RAISE EXCEPTION 'Business Partner decision idempotency key was reused' USING ERRCODE='unique_violation'; END IF;
        RETURN QUERY SELECT v_existing.aggregate_id,v_existing.to_state,v_existing.resulting_version,v_existing.id,true; RETURN;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||':'||p_aggregate_kind||':'||p_aggregate_id::text,0));
    IF p_aggregate_kind='qualification' THEN
        SELECT value.decision::text,value.row_version,value.business_partner_id,value.created_by INTO v_from,v_version,v_bp_id,v_created_by FROM control.business_partner_qualification value WHERE value.tenant_id=p_tenant_id AND value.id=p_aggregate_id FOR UPDATE;
        IF NOT ((v_from='pending' AND p_to_state IN('approved','conditional','rejected','suspended')) OR (v_from IN('approved','conditional') AND p_to_state='expired')) THEN RAISE EXCEPTION 'Invalid qualification decision transition' USING ERRCODE='check_violation'; END IF;
    ELSIF p_aggregate_kind='supplier_preference' THEN
        SELECT value.status::text,value.row_version,value.business_partner_id,value.created_by INTO v_from,v_version,v_bp_id,v_created_by FROM control.supplier_preference_designation value WHERE value.tenant_id=p_tenant_id AND value.id=p_aggregate_id FOR UPDATE;
        IF NOT ((v_from='pending' AND p_to_state IN('approved','rejected')) OR (v_from='approved' AND p_to_state='revoked')) THEN RAISE EXCEPTION 'Invalid supplier preference transition' USING ERRCODE='check_violation'; END IF;
    ELSIF p_aggregate_kind='customer_designation' THEN
        SELECT value.status::text,value.row_version,value.business_partner_id,value.created_by INTO v_from,v_version,v_bp_id,v_created_by FROM control.customer_account_designation value WHERE value.tenant_id=p_tenant_id AND value.id=p_aggregate_id FOR UPDATE;
        IF NOT ((v_from='pending' AND p_to_state IN('approved','rejected')) OR (v_from='approved' AND p_to_state='revoked')) THEN RAISE EXCEPTION 'Invalid customer designation transition' USING ERRCODE='check_violation'; END IF;
    ELSE
        SELECT value.decision,value.row_version,value.business_partner_id,value.created_by INTO v_from,v_version,v_bp_id,v_created_by FROM control.customer_credit_review value WHERE value.tenant_id=p_tenant_id AND value.id=p_aggregate_id FOR UPDATE;
        IF NOT (v_from='pending' AND p_to_state IN('approved','conditional','rejected')) THEN RAISE EXCEPTION 'Invalid customer credit decision transition' USING ERRCODE='check_violation'; END IF;
    END IF;
    IF v_from IS NULL OR v_version<>p_expected_version THEN RETURN; END IF;
    IF p_to_state<>'expired' AND v_created_by=p_actor_id THEN RAISE EXCEPTION 'Maker cannot approve or decide their own Business Partner record' USING ERRCODE='insufficient_privilege'; END IF;
    v_evidence_id:=control.fn_record_business_partner_mutation(p_tenant_id,p_aggregate_kind,p_aggregate_id,v_bp_id,
        'decide_'||p_to_state,v_from,p_to_state,p_expected_version,p_reason,p_idempotency_key,v_fingerprint,
        COALESCE(p_payload,'{}'::jsonb)||jsonb_build_object('decisionFingerprint',p_decision_fingerprint),p_actor_id);
    PERFORM set_config('app.business_partner_mutation_evidence_id',v_evidence_id::text,true);
    v_approved:=p_to_state IN('approved','conditional');
    IF p_aggregate_kind='qualification' THEN
        IF v_from='pending' THEN UPDATE control.business_partner_qualification SET decision=p_to_state::control.qualification_decision_d,decision_reason=p_reason,reviewed_at=clock_timestamp(),reviewed_by=p_actor_id,approved_at=CASE WHEN v_approved THEN clock_timestamp() END,approved_by=CASE WHEN v_approved THEN p_actor_id END,decision_idempotency_key=p_idempotency_key,decision_fingerprint=p_decision_fingerprint,row_version=row_version+1,updated_by=p_actor_id WHERE tenant_id=p_tenant_id AND id=p_aggregate_id;
        ELSE UPDATE control.business_partner_qualification SET decision='expired',decision_reason=p_reason,row_version=row_version+1,updated_by=p_actor_id WHERE tenant_id=p_tenant_id AND id=p_aggregate_id; END IF;
    ELSIF p_aggregate_kind='supplier_preference' THEN
        IF p_to_state='revoked' THEN UPDATE control.supplier_preference_designation SET status='revoked',revocation_reason=p_reason,revoked_at=clock_timestamp(),revoked_by=p_actor_id,revocation_idempotency_key=p_idempotency_key,revocation_fingerprint=p_decision_fingerprint,row_version=row_version+1,updated_by=p_actor_id WHERE tenant_id=p_tenant_id AND id=p_aggregate_id;
        ELSE UPDATE control.supplier_preference_designation SET status=p_to_state::control.supplier_preference_status_d,decision_reason=p_reason,reviewed_at=clock_timestamp(),reviewed_by=p_actor_id,approved_at=CASE WHEN v_approved THEN clock_timestamp() END,approved_by=CASE WHEN v_approved THEN p_actor_id END,decision_idempotency_key=p_idempotency_key,decision_fingerprint=p_decision_fingerprint,row_version=row_version+1,updated_by=p_actor_id WHERE tenant_id=p_tenant_id AND id=p_aggregate_id; END IF;
    ELSIF p_aggregate_kind='customer_designation' THEN
        IF p_to_state='revoked' THEN UPDATE control.customer_account_designation SET status='revoked',revocation_reason=p_reason,revoked_at=clock_timestamp(),revoked_by=p_actor_id,revocation_idempotency_key=p_idempotency_key,revocation_fingerprint=p_decision_fingerprint,row_version=row_version+1,updated_by=p_actor_id WHERE tenant_id=p_tenant_id AND id=p_aggregate_id;
        ELSE UPDATE control.customer_account_designation SET status=p_to_state::control.customer_account_designation_status_d,decision_reason=p_reason,reviewed_at=clock_timestamp(),reviewed_by=p_actor_id,approved_at=CASE WHEN v_approved THEN clock_timestamp() END,approved_by=CASE WHEN v_approved THEN p_actor_id END,decision_idempotency_key=p_idempotency_key,decision_fingerprint=p_decision_fingerprint,row_version=row_version+1,updated_by=p_actor_id WHERE tenant_id=p_tenant_id AND id=p_aggregate_id; END IF;
    ELSE
        UPDATE control.customer_credit_review SET decision=p_to_state,decision_reason=p_reason,
            approved_credit_limit=CASE WHEN v_approved THEN COALESCE((p_payload->>'approvedCreditLimit')::numeric,requested_credit_limit) END,
            approved_currency_code=CASE WHEN v_approved THEN COALESCE(p_payload->>'approvedCurrencyCode',requested_currency_code::text)::character(3) END,
            conditions=COALESCE(p_payload->'conditions','[]'::jsonb),reviewed_at=clock_timestamp(),reviewed_by=p_actor_id,
            approved_at=CASE WHEN v_approved THEN clock_timestamp() END,approved_by=CASE WHEN v_approved THEN p_actor_id END,
            decision_idempotency_key=p_idempotency_key,decision_fingerprint=p_decision_fingerprint,row_version=row_version+1,updated_by=p_actor_id
         WHERE tenant_id=p_tenant_id AND id=p_aggregate_id;
    END IF;
    PERFORM set_config('app.business_partner_mutation_evidence_id','',true);
    RETURN QUERY SELECT p_aggregate_id,p_to_state,p_expected_version+1,v_evidence_id,false;
END;
$$;

ALTER FUNCTION control.command_business_partner_decision(
    uuid,text,uuid,text,bigint,text,text,text,jsonb,uuid
) SET plpgsql.variable_conflict = 'use_column';

CREATE OR REPLACE FUNCTION control.command_customer_lifecycle(
    p_tenant_id uuid,
    p_business_partner_id uuid,
    p_customer_id uuid,
    p_operating_organization_id uuid,
    p_company_code_id uuid,
    p_action text,
    p_expected_version bigint,
    p_reason_code text,
    p_business_date date,
    p_readiness_fingerprint text,
    p_readiness_evidence jsonb,
    p_idempotency_key text,
    p_actor_id uuid
)
RETURNS TABLE(customer_id uuid, status text, resulting_version bigint, event_id uuid, replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, control, master, shared
AS $$
DECLARE
    v_customer master.customer%ROWTYPE;
    v_existing control.customer_lifecycle_event%ROWTYPE;
    v_event_id uuid;
    v_from_status text;
    v_to_status text;
    v_command_fingerprint text;
BEGIN
    IF NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
           IS DISTINCT FROM p_tenant_id
       OR NULLIF(current_setting('app.current_principal_id', true), '')::uuid
           IS DISTINCT FROM p_actor_id THEN
        RAISE EXCEPTION 'Customer lifecycle command context does not match tenant and actor'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_action NOT IN ('activate', 'suspend', 'reactivate', 'deactivate', 'archive')
       OR p_expected_version < 1
       OR p_reason_code !~ '^[A-Z][A-Z0-9_.-]{2,126}$'
       OR btrim(p_idempotency_key) <> p_idempotency_key
       OR length(p_idempotency_key) NOT BETWEEN 8 AND 200
       OR jsonb_typeof(COALESCE(p_readiness_evidence, '{}'::jsonb)) <> 'object' THEN
        RAISE EXCEPTION 'Invalid Customer lifecycle command'
            USING ERRCODE = 'check_violation';
    END IF;

    v_from_status := CASE p_action
        WHEN 'activate' THEN 'prospect'
        WHEN 'suspend' THEN 'active'
        WHEN 'reactivate' THEN 'suspended'
        WHEN 'archive' THEN 'inactive'
        ELSE NULL
    END;
    v_to_status := CASE p_action
        WHEN 'suspend' THEN 'suspended'
        WHEN 'deactivate' THEN 'inactive'
        WHEN 'archive' THEN 'archived'
        ELSE 'active'
    END;

    IF p_action NOT IN ('suspend', 'deactivate', 'archive') AND (
        p_readiness_fingerprint IS NULL
        OR p_readiness_fingerprint !~ '^[a-f0-9]{64}$'
        OR p_readiness_evidence->>'decisionFingerprint' IS DISTINCT FROM p_readiness_fingerprint
        OR p_readiness_evidence->>'eligible' IS DISTINCT FROM 'true'
        OR p_readiness_evidence->>'businessPartnerId' IS DISTINCT FROM p_business_partner_id::text
        OR p_readiness_evidence->>'role' IS DISTINCT FROM 'customer'
        OR p_readiness_evidence->>'operatingOrganizationId' IS DISTINCT FROM p_operating_organization_id::text
        OR p_readiness_evidence->>'companyCodeId' IS DISTINCT FROM p_company_code_id::text
        OR p_readiness_evidence->>'businessDate' IS DISTINCT FROM p_business_date::text
    ) THEN
        RAISE EXCEPTION 'Customer activation requires matching eligible readiness evidence'
            USING ERRCODE = 'check_violation';
    END IF;
    IF p_action = 'suspend' AND p_readiness_fingerprint IS NOT NULL
       AND p_readiness_fingerprint !~ '^[a-f0-9]{64}$' THEN
        RAISE EXCEPTION 'Invalid Customer suspension readiness fingerprint'
            USING ERRCODE = 'check_violation';
    END IF;

    v_command_fingerprint := encode(public.digest(convert_to(
        jsonb_build_object(
            'tenantId', p_tenant_id, 'businessPartnerId', p_business_partner_id,
            'customerId', p_customer_id,
            'operatingOrganizationId', p_operating_organization_id,
            'companyCodeId', p_company_code_id, 'action', p_action,
            'expectedVersion', p_expected_version,
            'reasonCode', p_reason_code, 'businessDate', p_business_date,
            'readinessFingerprint', p_readiness_fingerprint,
            'readinessEvidence', COALESCE(p_readiness_evidence, '{}'::jsonb),
            'idempotencyKey', p_idempotency_key, 'actorId', p_actor_id
        )::text, 'UTF8'), 'sha256'), 'hex');

    PERFORM pg_advisory_xact_lock(hashtextextended(
        p_tenant_id::text || ':customer-lifecycle:' || p_customer_id::text, 0
    ));
    SELECT event.* INTO v_existing
      FROM control.customer_lifecycle_event event
     WHERE event.tenant_id = p_tenant_id
       AND event.idempotency_key = p_idempotency_key;
    IF FOUND THEN
        IF v_existing.command_fingerprint IS DISTINCT FROM v_command_fingerprint THEN
            RAISE EXCEPTION 'Customer lifecycle idempotency key was reused for another command'
                USING ERRCODE = 'unique_violation';
        END IF;
        RETURN QUERY SELECT v_existing.customer_id, v_existing.to_status,
                            v_existing.resulting_version, v_existing.id, true;
        RETURN;
    END IF;

    SELECT customer.* INTO v_customer
      FROM master.customer customer
     WHERE customer.tenant_id = p_tenant_id
       AND customer.id = p_customer_id
       AND customer.business_partner_id = p_business_partner_id
     FOR UPDATE;
    IF NOT FOUND THEN
        IF EXISTS (SELECT 1 FROM master.customer customer WHERE customer.id=p_customer_id) THEN
            RAISE EXCEPTION 'Customer belongs to another tenant or Business Partner'
                USING ERRCODE='insufficient_privilege';
        END IF;
        RAISE EXCEPTION 'Customer was not found' USING ERRCODE='no_data_found';
    END IF;
    IF v_customer.record_version <> p_expected_version THEN
        RAISE EXCEPTION 'Customer version is stale (expected %, actual %)', p_expected_version, v_customer.record_version
            USING ERRCODE='serialization_failure';
    END IF;
    IF (p_action='deactivate' AND v_customer.status::text NOT IN ('active','suspended'))
       OR (p_action<>'deactivate' AND v_customer.status::text<>v_from_status) THEN
        RAISE EXCEPTION 'Invalid Customer lifecycle transition: % from %', p_action, v_customer.status
            USING ERRCODE='object_not_in_prerequisite_state';
    END IF;
    IF NOT EXISTS (
        SELECT 1
          FROM master.business_partner_operating_organization_assignment assignment
          JOIN master.operating_organization_company_assignment company_scope
            ON company_scope.tenant_id = assignment.tenant_id
           AND company_scope.operating_organization_id = assignment.operating_organization_id
           AND company_scope.company_code_id = p_company_code_id
           AND company_scope.status = 'active'
           AND company_scope.effective_from <= p_business_date
           AND (company_scope.effective_until IS NULL OR company_scope.effective_until > p_business_date)
         WHERE assignment.tenant_id = p_tenant_id
           AND assignment.business_partner_id = p_business_partner_id
           AND assignment.operating_organization_id = p_operating_organization_id
           AND assignment.partner_role = 'customer'
           AND assignment.status = 'active'
           AND assignment.effective_from <= p_business_date
           AND (assignment.effective_until IS NULL OR assignment.effective_until > p_business_date)
    ) THEN
        RAISE EXCEPTION 'Customer lifecycle command is outside an active organization/company scope'
            USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO control.customer_lifecycle_event(
        tenant_id, business_partner_id, customer_id,
        operating_organization_id, company_code_id, action_code,
        from_status, to_status, expected_version, resulting_version, reason_code, business_date,
        readiness_fingerprint, readiness_evidence, idempotency_key,
        command_fingerprint, occurred_by
    ) VALUES (
        p_tenant_id, p_business_partner_id, p_customer_id,
        p_operating_organization_id, p_company_code_id, p_action,
        v_customer.status::text, v_to_status, p_expected_version, p_expected_version+1, p_reason_code, p_business_date,
        p_readiness_fingerprint, COALESCE(p_readiness_evidence, '{}'::jsonb),
        p_idempotency_key, v_command_fingerprint, p_actor_id
    ) RETURNING id INTO v_event_id;

    PERFORM set_config('app.customer_lifecycle_event_id', v_event_id::text, true);
    UPDATE master.customer
       SET status = v_to_status::master.customer_status_d,
           updated_by = p_actor_id
     WHERE tenant_id = p_tenant_id AND id = p_customer_id;
    PERFORM set_config('app.customer_lifecycle_event_id', '', true);

    RETURN QUERY SELECT p_customer_id, v_to_status, p_expected_version+1, v_event_id, false;
END;
$$;

CREATE OR REPLACE FUNCTION control.trg_record_customer_lifecycle_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,control,master,shared AS $$
DECLARE v_version bigint;
BEGIN
    SELECT customer.record_version INTO v_version FROM master.customer customer
     WHERE customer.tenant_id=NEW.tenant_id AND customer.id=NEW.customer_id;
    PERFORM control.fn_record_business_partner_mutation(
        NEW.tenant_id,'customer',NEW.customer_id,NEW.business_partner_id,
        'customer_'||NEW.action_code,NEW.from_status,NEW.to_status,v_version,
        NEW.reason_code,NEW.idempotency_key,NEW.command_fingerprint,
        NEW.readiness_evidence,NEW.occurred_by
    );
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION control.command_customer_lifecycle(
    uuid, uuid, uuid, uuid, uuid, text, bigint, text, date, text, jsonb, text, uuid
) IS 'Sole tenant-bound optimistic command authority for Customer activation, suspension, reactivation, deactivation, and archival; atomically records immutable evidence and projects master.customer.status.';

CREATE OR REPLACE FUNCTION control.trg_guard_mesh_business_partner_profile_projection()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'NEON MESH Business Partner projections are withdrawn, not deleted' USING ERRCODE = 'restrict_violation';
    END IF;
    IF ROW(OLD.id, OLD.tenant_id, OLD.source_tenant_id, OLD.source_network_account_id, OLD.recipient_network_account_id, OLD.network_relationship_id)
       IS DISTINCT FROM ROW(NEW.id, NEW.tenant_id, NEW.source_tenant_id, NEW.source_network_account_id, NEW.recipient_network_account_id, NEW.network_relationship_id) THEN
        RAISE EXCEPTION 'NEON MESH Business Partner projection coordinates are immutable' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    NEW.updated_at := clock_timestamp();
    RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION control.trg_guard_mesh_business_partner_account_link() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,control AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'MESH Business Partner account links cannot be deleted' USING ERRCODE='restrict_violation'; END IF;
 IF TG_OP='UPDATE' AND (NEW.id,NEW.tenant_id,NEW.profile_projection_id,NEW.source_tenant_id,NEW.source_network_account_id,NEW.recipient_network_account_id,NEW.network_relationship_id,NEW.business_partner_id,NEW.proposed_role,NEW.idempotency_key,NEW.created_at,NEW.created_by) IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.profile_projection_id,OLD.source_tenant_id,OLD.source_network_account_id,OLD.recipient_network_account_id,OLD.network_relationship_id,OLD.business_partner_id,OLD.proposed_role,OLD.idempotency_key,OLD.created_at,OLD.created_by) THEN RAISE EXCEPTION 'MESH Business Partner account link coordinates are immutable' USING ERRCODE='check_violation'; END IF;
 IF TG_OP='UPDATE' AND OLD.decision_fingerprint IS NOT NULL AND (NEW.decision_fingerprint,NEW.reviewed_at,NEW.reviewed_by,NEW.approved_at,NEW.approved_by,NEW.external_reference_id) IS DISTINCT FROM (OLD.decision_fingerprint,OLD.reviewed_at,OLD.reviewed_by,OLD.approved_at,OLD.approved_by,OLD.external_reference_id) THEN RAISE EXCEPTION 'MESH Business Partner account link decision evidence is immutable' USING ERRCODE='check_violation'; END IF;
 IF TG_OP='UPDATE' THEN NEW.row_version:=OLD.row_version+1; END IF; RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION control.trg_reject_mesh_bank_disclosure_inbox_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'MESH bank disclosure inbox is immutable' USING ERRCODE='integrity_constraint_violation'; END $$;

CREATE OR REPLACE FUNCTION control.trg_guard_mesh_bank_account_projection() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,control AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'MESH bank projection history cannot be deleted' USING ERRCODE='restrict_violation'; END IF;
 IF TG_OP='UPDATE' AND (NEW.id,NEW.tenant_id,NEW.account_link_id,NEW.source_tenant_id,NEW.source_network_account_id,NEW.recipient_network_account_id,NEW.network_relationship_id) IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.account_link_id,OLD.source_tenant_id,OLD.source_network_account_id,OLD.recipient_network_account_id,OLD.network_relationship_id) THEN RAISE EXCEPTION 'MESH bank projection coordinates are immutable' USING ERRCODE='check_violation'; END IF; RETURN NEW; END $$;
