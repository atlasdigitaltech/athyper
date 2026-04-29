-- ============================================================================
-- master/05_functions.sql
-- Concept: Identity Logic — tenant registration, principal RBAC, auth, contact management
-- Depends on: 04_tables/003a–003f_master_*.sql, 05_pre_constraint_functions/003_master.sql
-- All functions: CREATE OR REPLACE, SET search_path = master.
-- ============================================================================

-- Status transition guard (trigger function)
-- provisioning → active | terminated
-- active       → suspended | terminated
-- suspended    → active | terminated
-- terminated   → (terminal — no further transitions)
CREATE OR REPLACE FUNCTION master.trg_guard_tenant_status_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
BEGIN
    IF NEW.status = OLD.status THEN RETURN NEW; END IF;

    IF (OLD.status = 'provisioning' AND NEW.status IN ('active', 'terminated'))
    OR (OLD.status = 'active'       AND NEW.status IN ('suspended', 'terminated'))
    OR (OLD.status = 'suspended'    AND NEW.status IN ('active', 'terminated'))
    THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION
        'Invalid tenant status transition: % → %. Tenant id: %',
        OLD.status, NEW.status, OLD.id
        USING ERRCODE = 'check_violation';
END;
$$;

-- Auth bootstrap lookup — returns only id + status before tenant session is established.
-- SECURITY DEFINER bypasses RLS intentionally for the auth use case.
CREATE OR REPLACE FUNCTION master.fn_lookup_tenant_for_auth(
    p_realm_key text,
    p_code      text
) RETURNS TABLE (id uuid, status text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = master, pg_catalog AS $$
    SELECT t.id, t.status
    FROM master.tenant t
    WHERE t.realm_key = p_realm_key
      AND t.code      = p_code
    LIMIT 1;
$$;
COMMENT ON FUNCTION master.fn_lookup_tenant_for_auth IS
    'Auth bootstrap lookup — returns only id + status. '
    'Caller: auth middleware before SET app.current_tenant_id. '
    'SECURITY DEFINER by design. Callable by: athyperapp.';

-- Code availability check — called from public registration form.
-- Returns boolean only — no data leak possible.
CREATE OR REPLACE FUNCTION master.fn_check_tenant_code_available(
    p_realm_key text,
    p_code      text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = master, pg_catalog AS $$
    SELECT NOT EXISTS (
        SELECT 1 FROM master.tenant
        WHERE realm_key = p_realm_key AND code = p_code
    );
$$;

-- Public self-registration entry point. Callable without session context.
-- Creates tenant (status=provisioning) + seed admin principal atomically.
-- Returns jsonb {tenant_id, principal_id} for verification email.
--
-- DEPENDENCY: requires 900_seed_data to have been applied first.
-- The INSERT statements use lookup-validated values (tenant_status='provisioning',
-- principal_type='user', contact_link channel_type='email' / purpose='login',
-- subscription='base') and the 'principal' owner_type row.
-- BEFORE-INSERT triggers will reject these if the seed data is absent.
CREATE OR REPLACE FUNCTION master.fn_register_tenant(
    p_code              text,
    p_name              text,
    p_display_name      text,
    p_realm_key         text,
    p_region            text,
    p_subscription      text,
    p_admin_email       text,
    p_admin_given_name  text,
    p_admin_family_name text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = master, pg_catalog AS $$
DECLARE
    v_tenant_id    uuid := shared.uuidv7();
    v_principal_id uuid := shared.uuidv7();
    v_systemadmin  uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
    IF p_code !~ '^[a-z][a-z0-9_-]{1,62}$' THEN
        RAISE EXCEPTION 'Invalid tenant code format: %', p_code
            USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF btrim(p_name) = '' THEN
        RAISE EXCEPTION 'Tenant name cannot be empty'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF btrim(p_display_name) = '' THEN
        RAISE EXCEPTION 'Tenant display name cannot be empty'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF p_admin_email IS NULL OR btrim(p_admin_email) = '' THEN
        RAISE EXCEPTION 'Admin email is required'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF p_admin_email <> lower(trim(p_admin_email)) THEN
        RAISE EXCEPTION 'Admin email must be lowercase and trimmed'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF p_admin_email NOT LIKE '%@%' THEN
        RAISE EXCEPTION 'Admin email must contain @: %', p_admin_email
            USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF nullif(btrim(coalesce(p_admin_given_name, '')), '') IS NULL
       AND nullif(btrim(coalesce(p_admin_family_name, '')), '') IS NULL THEN
        RAISE EXCEPTION 'At least one of admin given_name or family_name is required'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- Insert tenant — rely on UNIQUE constraint, not TOCTOU-prone IF EXISTS check
    BEGIN
        INSERT INTO master.tenant (
            id, code, name, display_name, realm_key,
            region, subscription, status, created_by
        ) VALUES (
            v_tenant_id, p_code, p_name, p_display_name, p_realm_key,
            p_region, p_subscription, 'provisioning', v_systemadmin
        );
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'Tenant code "%" is already taken in realm "%"',
            p_code, p_realm_key
            USING ERRCODE = 'unique_violation';
    END;

    -- Create seed admin principal (core identity only)
    INSERT INTO master.principal (
        id, tenant_id, code, name, principal_type, status, created_by
    ) VALUES (
        v_principal_id, v_tenant_id, 'admin',
        concat_ws(' ', nullif(btrim(p_admin_given_name), ''), nullif(btrim(p_admin_family_name), '')),
        'user', 'active', v_systemadmin
    );

    -- Create principal profile (display names + Keycloak sync pending)
    INSERT INTO master.principal_profile (
        id, tenant_id, principal_id,
        given_name, family_name,
        keycloak_sync_status, created_by
    ) VALUES (
        shared.uuidv7(), v_tenant_id, v_principal_id,
        p_admin_given_name, p_admin_family_name,
        'pending', v_systemadmin
    );

    -- Create login email contact point (unverified — triggers verification flow)
    INSERT INTO master.contact_link (
        id, tenant_id, owner_type, owner_id,
        channel_type, value, purpose,
        is_primary, is_verified, status, created_by
    ) VALUES (
        shared.uuidv7(), v_tenant_id, 'principal', v_principal_id,
        'email', lower(trim(p_admin_email)), 'login',
        true, false, 'active', v_systemadmin
    );

    RETURN jsonb_build_object(
        'tenant_id',    v_tenant_id,
        'principal_id', v_principal_id
    );
END;
$$;
COMMENT ON FUNCTION master.fn_register_tenant IS
    'Public self-registration entry point. SECURITY DEFINER — callable without session. '
    'Creates tenant (provisioning) + seed admin principal + login contact atomically. '
    'Owner must be athyperadmin for admin_write RLS to apply. Callable by: athyperapp.';

-- Normalize contact_link.value at write time.
-- email: lower(trim). All others: trim only.
-- Must fire BEFORE uniqueness checks and login cache sync.
CREATE OR REPLACE FUNCTION master.trg_normalize_contact_link_value()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
BEGIN
    -- Normalize value by channel type
    IF NEW.channel_type = 'email' THEN
        NEW.value := lower(trim(NEW.value));
    ELSE
        NEW.value := trim(NEW.value);
    END IF;

    -- Null-coalesce optional string fields (store NULL, not empty string)
    NEW.purpose := nullif(btrim(coalesce(NEW.purpose, '')), '');
    NEW.code    := nullif(btrim(coalesce(NEW.code,    '')), '');
    NEW.name    := nullif(btrim(coalesce(NEW.name,    '')), '');

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_normalize_contact_link_value() IS
    'Canonical normalization of contact_link fields at write time. '
    'email: lower(trim(value)). phone/other: trim(value). '
    'purpose/code/name: trimmed, NULL if empty. '
    'Must fire BEFORE lookup-validation and uniqueness triggers.';


-- Sync login_email cache on principal when contact_link changes.
-- Fires after INSERT, UPDATE, or DELETE on contact_link.
--
-- Recompute strategy: queries the source-of-truth (contact_link) for the
-- single verified, primary, active login email and writes it to principal.
-- On UPDATE, if ownership-relevant columns changed (owner_id, tenant_id,
-- owner_type, channel_type, purpose, value), recomputes for BOTH the old
-- and new principals to prevent stale cache on either side.
CREATE OR REPLACE FUNCTION master.fn_sync_principal_login_email()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
DECLARE
    v_old_relevant boolean := false;
    v_new_relevant boolean := false;
    v_new_email    text;
BEGIN
    -- Determine relevance of OLD and NEW sides
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        v_old_relevant := (OLD.owner_type = 'principal' AND OLD.channel_type = 'email' AND OLD.purpose = 'login');
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        v_new_relevant := (NEW.owner_type = 'principal' AND NEW.channel_type = 'email' AND NEW.purpose = 'login');
    END IF;

    -- Early exit if neither side is a principal login email row
    IF NOT v_old_relevant AND NOT v_new_relevant THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;

    -- Recompute for OLD principal (if relevant and different from NEW principal)
    IF v_old_relevant THEN
        IF TG_OP = 'DELETE'
           OR NOT v_new_relevant
           OR OLD.owner_id  <> NEW.owner_id
           OR OLD.tenant_id <> NEW.tenant_id
        THEN
            SELECT lower(trim(cl.value))
              INTO v_new_email
              FROM master.contact_link cl
             WHERE cl.tenant_id    = OLD.tenant_id
               AND cl.owner_id     = OLD.owner_id
               AND cl.owner_type   = 'principal'
               AND cl.channel_type = 'email'
               AND cl.purpose      = 'login'
               AND cl.is_primary   = true
               AND cl.is_verified  = true
               AND cl.status       = 'active'
             ORDER BY cl.verified_at DESC NULLS LAST,
                      cl.updated_at  DESC NULLS LAST,
                      cl.created_at  DESC NULLS LAST
             LIMIT 1;

            UPDATE master.principal
               SET login_email = v_new_email
             WHERE id = OLD.owner_id AND tenant_id = OLD.tenant_id
               AND login_email IS DISTINCT FROM v_new_email;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

    -- Recompute for NEW principal
    IF v_new_relevant THEN
        SELECT lower(trim(cl.value))
          INTO v_new_email
          FROM master.contact_link cl
         WHERE cl.tenant_id    = NEW.tenant_id
           AND cl.owner_id     = NEW.owner_id
           AND cl.owner_type   = 'principal'
           AND cl.channel_type = 'email'
           AND cl.purpose      = 'login'
           AND cl.is_primary   = true
           AND cl.is_verified  = true
           AND cl.status       = 'active'
         ORDER BY cl.verified_at DESC NULLS LAST,
                  cl.updated_at  DESC NULLS LAST,
                  cl.created_at  DESC NULLS LAST
         LIMIT 1;

        UPDATE master.principal
           SET login_email = v_new_email
         WHERE id = NEW.owner_id AND tenant_id = NEW.tenant_id
           AND login_email IS DISTINCT FROM v_new_email;
    END IF;

    RETURN NEW;
END;
$$;

-- ============================================================================
-- Label subsystem functions
-- ============================================================================

-- Canonicalises a locale string to BCP 47 casing conventions.
-- Thin wrapper around shared.normalize_locale_code (single source of truth).
-- IMMUTABLE — safe for index expressions and generated columns.
CREATE OR REPLACE FUNCTION master.fn_normalize_locale_code(p_locale text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT shared.normalize_locale_code(p_locale);
$$;

-- Locale-chain label lookup with BCP 47 narrowing:
--   1. exact locale  (e.g. zh-Hant-TW)
--   2. language-script  (zh-Hant)
--   3. language-only  (zh)
-- Does NOT fall back to 'en' or base-table name — that is fn_display_name()'s job.
CREATE OR REPLACE FUNCTION master.fn_label_fallback_name(p_entity text, p_code text, p_locale text)
RETURNS text LANGUAGE plpgsql STABLE SET search_path = master AS $$
declare
  v_name   text;
  v_parts  text[];
  v_lang   text;
  v_script text;
  v_candidates text[];
begin
  v_candidates := ARRAY[p_locale];

  if p_locale ~ '-' then
    v_parts := string_to_array(p_locale, '-');
    v_lang  := v_parts[1];
    if array_length(v_parts, 1) >= 2 and v_parts[2] ~ '^[A-Z][a-z]{3}$' then
      v_script := v_parts[2];
    end if;

    if v_script is not null and array_length(v_parts, 1) >= 3 then
      v_candidates := v_candidates || (v_lang || '-' || v_script);
    end if;

    v_candidates := v_candidates || v_lang;
  end if;

  select name into v_name
    from master.label
   where entity = p_entity
     and code = p_code
     and status = 'active'
     and locale_code = any(v_candidates)
   order by array_position(v_candidates, locale_code)
   limit 1;

  return v_name;
end;
$$;

-- Public API: label-only lookup with BCP 47 narrowing.
-- Normalises inputs then delegates to fn_label_fallback_name().
-- Returns NULL if no matching label exists.
CREATE OR REPLACE FUNCTION master.fn_localized_name(p_entity text, p_code text, p_locale text)
RETURNS text LANGUAGE plpgsql STABLE SET search_path = master AS $$
declare
  v_entity text;
  v_code   text;
  v_locale text;
begin
  v_entity := btrim(p_entity);
  v_code   := btrim(p_code);
  if v_entity is null or v_entity = '' or v_code is null or v_code = '' then
    return null;
  end if;
  v_locale := master.fn_normalize_locale_code(p_locale);
  if v_locale is null then return null; end if;

  return master.fn_label_fallback_name(v_entity, v_code, v_locale);
end;
$$;

-- Guaranteed-name resolver — the primary public API for UI display strings.
-- Fallback chain:
--   1. fn_label_fallback_name() in the requested locale
--   2. 'en' locale fallback
--   3. base-table name column via label_entity_type (dynamic SQL)
CREATE OR REPLACE FUNCTION master.fn_display_name(p_entity text, p_code text, p_locale text)
RETURNS text LANGUAGE plpgsql STABLE SET search_path = master AS $$
declare
  v_entity text;
  v_code   text;
  v_locale text;
  v_name   text;
  v_lang   text;
  v_schema text;
  v_table  text;
  v_pk_col text;
  v_nm_col text;
begin
  v_entity := btrim(p_entity);
  v_code   := btrim(p_code);
  if v_entity is null or v_entity = '' or v_code is null or v_code = '' then
    return null;
  end if;
  v_locale := coalesce(master.fn_normalize_locale_code(p_locale), 'en');

  v_name := master.fn_label_fallback_name(v_entity, v_code, v_locale);
  if v_name is not null then return v_name; end if;

  -- 'en' fallback
  v_lang := split_part(v_locale, '-', 1);
  if v_lang <> 'en' then
    select name into v_name from master.label
     where entity = v_entity and code = v_code and locale_code = 'en'
       and status = 'active';
    if v_name is not null then return v_name; end if;
  end if;

  -- base table fallback (registry-driven)
  select source_schema, source_table, pk_column, name_column
    into v_schema, v_table, v_pk_col, v_nm_col
    from master.label_entity_type
   where entity = v_entity;

  if v_schema is not null then
    execute format(
      'select coalesce(%I::text, $1) from %I.%I where %I::text = $1 limit 1',
      v_nm_col, v_schema, v_table, v_pk_col
    ) into v_name using v_code;
  end if;

  return v_name;
end;
$$;

-- BEFORE INSERT/UPDATE trigger on master.label.
-- Normalises locale_code, validates (entity, code) against label_entity_type.
--
-- Migration safety: on UPDATE, if only lifecycle/audit columns changed
-- (status, metadata, updated_at, updated_by) the entity-existence check is
-- skipped. This allows deprecating orphaned labels without first re-registering
-- the entity. On INSERT the check is always enforced.
--
-- Before deploying this trigger for the first time, identify any orphaned rows:
--   SELECT l.entity, l.code, l.locale_code
--   FROM master.label l
--   WHERE NOT EXISTS (
--       SELECT 1 FROM master.label_entity_type r WHERE r.entity = l.entity
--   );
-- Either register the missing entities or DELETE the orphaned labels first.
CREATE OR REPLACE FUNCTION master.trg_label_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
declare
  v_schema text;
  v_table  text;
  v_pk_col text;
  v_found  boolean;
  v_lifecycle_only boolean;
begin
  NEW.entity := nullif(btrim(NEW.entity), '');
  NEW.code   := nullif(btrim(NEW.code), '');
  NEW.locale_code := master.fn_normalize_locale_code(NEW.locale_code);

  -- Detect lifecycle-only UPDATE (status, metadata, audit columns).
  -- These must be allowed even on orphaned labels so they can be deprecated.
  v_lifecycle_only := false;
  if TG_OP = 'UPDATE' then
    if  OLD.entity      is not distinct from NEW.entity
    and OLD.code        is not distinct from NEW.code
    and OLD.locale_code is not distinct from NEW.locale_code
    and OLD.name        is not distinct from NEW.name
    and OLD.description is not distinct from NEW.description
    and OLD.tenant_id   is not distinct from NEW.tenant_id
    then
      v_lifecycle_only := true;
    end if;
  end if;

  select source_schema, source_table, pk_column
    into v_schema, v_table, v_pk_col
    from master.label_entity_type
   where entity = NEW.entity;

  if v_schema is null then
    -- Lifecycle-only updates on existing rows are allowed even when entity
    -- is unregistered — this permits deprecating orphaned labels.
    if v_lifecycle_only then
      return NEW;
    end if;

    raise exception
        'master.label: entity "%" is not registered in label_entity_type',
        NEW.entity
        using errcode = 'foreign_key_violation';
  end if;

  -- Skip the source-table existence check for lifecycle-only updates —
  -- the (entity, code) pair was validated on INSERT and hasn't changed.
  if not v_lifecycle_only then
    execute format(
      'select exists(select 1 from %I.%I where %I::text = $1)',
      v_schema, v_table, v_pk_col
    ) into v_found using NEW.code;

    if not v_found then
      raise exception 'master.label: code "%" does not exist in %.% for entity "%"',
        NEW.code, v_schema, v_table, NEW.entity;
    end if;
  end if;

  return NEW;
end;
$$;

-- BEFORE INSERT/UPDATE trigger on master.label_entity_type.
-- Validates source_schema.source_table exists, pk_column is string-typed unique,
-- and name_column is string-typed.
CREATE OR REPLACE FUNCTION master.trg_label_entity_type_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
declare
  v_relid    oid;
  v_relkind  char;
  v_typname  text;
  v_attnum   smallint;
begin
  begin
    v_relid := format('%I.%I', NEW.source_schema, NEW.source_table)::regclass;
  exception when undefined_table or invalid_schema_name then
    raise exception 'label_entity_type: table %.% does not exist',
      NEW.source_schema, NEW.source_table;
  end;

  select c.relkind into v_relkind from pg_class c where c.oid = v_relid;
  if v_relkind not in ('r', 'p') then
    raise exception 'label_entity_type: %.% is not a table (relkind="%") — only ordinary tables (r) and partitioned tables (p) are supported',
      NEW.source_schema, NEW.source_table, v_relkind;
  end if;

  select t.typname, a.attnum into v_typname, v_attnum
    from pg_attribute a
    join pg_type t on t.oid = a.atttypid
   where a.attrelid = v_relid and a.attname = NEW.pk_column and not a.attisdropped;

  if v_typname is null then
    raise exception 'label_entity_type: column "%" does not exist in %.%',
      NEW.pk_column, NEW.source_schema, NEW.source_table;
  end if;

  if v_typname not in ('text', 'varchar', 'bpchar', 'citext', 'name') then
    raise exception 'label_entity_type: pk_column "%" in %.% has type "%" — must be string-type (text, varchar, char, citext, name)',
      NEW.pk_column, NEW.source_schema, NEW.source_table, v_typname;
  end if;

  if not exists(
    select 1
      from pg_index i
     where i.indrelid = v_relid
       and i.indisunique
       and array_length(i.indkey::int2[], 1) = 1
       and i.indkey::int2[] = ARRAY[v_attnum]::int2[]
  ) then
    raise exception 'label_entity_type: pk_column "%" in %.% must be the sole column of a unique or primary key constraint',
      NEW.pk_column, NEW.source_schema, NEW.source_table;
  end if;

  select t.typname into v_typname
    from pg_attribute a
    join pg_type t on t.oid = a.atttypid
   where a.attrelid = v_relid and a.attname = NEW.name_column and not a.attisdropped;

  if v_typname is null then
    raise exception 'label_entity_type: column "%" does not exist in %.%',
      NEW.name_column, NEW.source_schema, NEW.source_table;
  end if;

  if v_typname not in ('text', 'varchar', 'bpchar', 'citext', 'name') then
    raise exception 'label_entity_type: name_column "%" in %.% has type "%" — must be string-type (text, varchar, char, citext, name)',
      NEW.name_column, NEW.source_schema, NEW.source_table, v_typname;
  end if;

  return NEW;
end;
$$;

-- Guard: keycloak_service_client_id only allowed on service_account principals.
-- Replaces invalid CHECK constraint (subqueries not allowed in CHECK).
CREATE OR REPLACE FUNCTION master.trg_guard_service_client()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
BEGIN
    IF NEW.keycloak_service_client_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM master.principal p
             WHERE p.id = NEW.principal_id
               AND p.tenant_id = NEW.tenant_id
               AND p.is_service_account = true
        ) THEN
            RAISE EXCEPTION
                'keycloak_service_client_id can only be set on service_account principals (principal_id: %)',
                NEW.principal_id
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;


-- ============================================================================
-- Contact Extension Channel Guards
-- ============================================================================

-- contact_email must reference a contact_link with channel_type = 'email'.
CREATE OR REPLACE FUNCTION master.trg_guard_contact_email_channel()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
DECLARE
    v_channel text;
BEGIN
    SELECT channel_type INTO v_channel
    FROM master.contact_link
    WHERE tenant_id = NEW.tenant_id AND id = NEW.contact_link_id;

    IF v_channel IS NULL THEN
        RAISE EXCEPTION
            'contact_email: contact_link % not found for tenant %',
            NEW.contact_link_id, NEW.tenant_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_channel <> 'email' THEN
        RAISE EXCEPTION
            'contact_email: contact_link % has channel_type "%" — must be "email"',
            NEW.contact_link_id, v_channel
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

-- contact_phone must reference a contact_link with phone-compatible channel_type.
CREATE OR REPLACE FUNCTION master.trg_guard_contact_phone_channel()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
DECLARE
    v_channel text;
BEGIN
    SELECT channel_type INTO v_channel
    FROM master.contact_link
    WHERE tenant_id = NEW.tenant_id AND id = NEW.contact_link_id;

    IF v_channel IS NULL THEN
        RAISE EXCEPTION
            'contact_phone: contact_link % not found for tenant %',
            NEW.contact_link_id, NEW.tenant_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_channel NOT IN ('phone', 'sms', 'whatsapp') THEN
        RAISE EXCEPTION
            'contact_phone: contact_link % has channel_type "%" — must be phone, sms, or whatsapp',
            NEW.contact_link_id, v_channel
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;


-- trg_guard_owner_type_in_use — blocks DELETE or deprecation of
-- owner_type codes that still have active contact_link or address_link references.
CREATE OR REPLACE FUNCTION master.trg_guard_owner_type_in_use()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
DECLARE
    v_code text := COALESCE(NEW.code, OLD.code);
BEGIN
    -- Block hard DELETE
    IF TG_OP = 'DELETE' THEN
        IF EXISTS (
            SELECT 1 FROM master.contact_link WHERE owner_type = v_code AND status = 'active'
            UNION ALL
            SELECT 1 FROM master.address_link WHERE owner_type = v_code AND effective_until IS NULL
            LIMIT 1
        ) THEN
            RAISE EXCEPTION
                'Cannot delete owner_type code "%": active contact_link or address_link rows exist.',
                v_code USING ERRCODE = 'foreign_key_violation';
        END IF;
        RETURN OLD;
    END IF;

    -- Block deprecation when active references exist
    IF TG_OP = 'UPDATE'
       AND OLD.status = 'active'
       AND NEW.status = 'deprecated' THEN
        IF EXISTS (
            SELECT 1 FROM master.contact_link WHERE owner_type = v_code AND status = 'active'
            UNION ALL
            SELECT 1 FROM master.address_link WHERE owner_type = v_code AND effective_until IS NULL
            LIMIT 1
        ) THEN
            RAISE EXCEPTION
                'Cannot deprecate owner_type "%" while active contact_link or address_link rows exist. '
                'Migrate or retire those rows first.',
                v_code USING ERRCODE = 'foreign_key_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;


-- fn_trg_immutable_owner_type_code — blocks code renames on owner_type.
-- System codes (tenant_id IS NULL) are always immutable. Tenant codes are
-- immutable while active references exist in contact_link or address_link.
CREATE OR REPLACE FUNCTION master.trg_immutable_owner_type_code()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
BEGIN
    IF OLD.code IS DISTINCT FROM NEW.code THEN
        -- System codes are always immutable, regardless of references
        IF OLD.tenant_id IS NULL THEN
            RAISE EXCEPTION
                'owner_type: system code "%" is immutable.',
                OLD.code USING ERRCODE = 'restrict_violation';
        END IF;
        -- Tenant codes are immutable while active references exist
        IF EXISTS (
            SELECT 1 FROM master.contact_link WHERE owner_type = OLD.code AND status = 'active'
            UNION ALL
            SELECT 1 FROM master.address_link  WHERE owner_type = OLD.code AND effective_until IS NULL
            LIMIT 1
        ) THEN
            RAISE EXCEPTION
                'owner_type: cannot rename code "%" while active references exist.',
                OLD.code USING ERRCODE = 'restrict_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;


-- fn_trg_owner_type_validate — validates the routing contract
-- (schema_name, table_name, pk_column, tenant_column) against the catalog.
-- Catches invalid metadata at write time instead of deferring to runtime
-- dynamic SQL inside fn_trg_validate_owner_ref.
CREATE OR REPLACE FUNCTION master.trg_owner_type_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
DECLARE
    v_relid   oid;
    v_relkind char;
    v_typname text;
BEGIN
    -- Only rows with a backing table contract need validation
    IF NEW.schema_name IS NULL OR NEW.table_name IS NULL THEN
        RETURN NEW;  -- tenant custom types: no backing table, blocked at ref time
    END IF;

    -- Skip re-validation on UPDATE if routing columns unchanged
    IF TG_OP = 'UPDATE'
       AND NEW.schema_name    IS NOT DISTINCT FROM OLD.schema_name
       AND NEW.table_name     IS NOT DISTINCT FROM OLD.table_name
       AND NEW.pk_column      IS NOT DISTINCT FROM OLD.pk_column
       AND NEW.is_tenant_scoped IS NOT DISTINCT FROM OLD.is_tenant_scoped
       AND NEW.tenant_column  IS NOT DISTINCT FROM OLD.tenant_column
    THEN
        RETURN NEW;
    END IF;

    -- 1. Backing table must exist
    BEGIN
        v_relid := format('%I.%I', NEW.schema_name, NEW.table_name)::regclass;
    EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
        RAISE EXCEPTION
            'owner_type: table %.% does not exist',
            NEW.schema_name, NEW.table_name;
    END;

    SELECT c.relkind INTO v_relkind FROM pg_class c WHERE c.oid = v_relid;
    IF v_relkind NOT IN ('r', 'p') THEN
        RAISE EXCEPTION
            'owner_type: %.% is not a table (relkind="%")',
            NEW.schema_name, NEW.table_name, v_relkind;
    END IF;

    -- 2. pk_column must exist and be uuid-typed
    SELECT t.typname INTO v_typname
      FROM pg_attribute a
      JOIN pg_type t ON t.oid = a.atttypid
     WHERE a.attrelid = v_relid
       AND a.attname  = NEW.pk_column
       AND NOT a.attisdropped;

    IF v_typname IS NULL THEN
        RAISE EXCEPTION
            'owner_type: pk_column "%" does not exist in %.%',
            NEW.pk_column, NEW.schema_name, NEW.table_name;
    END IF;

    IF v_typname <> 'uuid' THEN
        RAISE EXCEPTION
            'owner_type: pk_column "%" in %.% has type "%" — must be uuid',
            NEW.pk_column, NEW.schema_name, NEW.table_name, v_typname;
    END IF;

    -- 3. tenant_column must exist and be uuid-typed when is_tenant_scoped = true
    IF NEW.is_tenant_scoped THEN
        SELECT t.typname INTO v_typname
          FROM pg_attribute a
          JOIN pg_type t ON t.oid = a.atttypid
         WHERE a.attrelid = v_relid
           AND a.attname  = NEW.tenant_column
           AND NOT a.attisdropped;

        IF v_typname IS NULL THEN
            RAISE EXCEPTION
                'owner_type: tenant_column "%" does not exist in %.% (is_tenant_scoped=true)',
                NEW.tenant_column, NEW.schema_name, NEW.table_name;
        END IF;

        IF v_typname <> 'uuid' THEN
            RAISE EXCEPTION
                'owner_type: tenant_column "%" in %.% has type "%" — must be uuid',
                NEW.tenant_column, NEW.schema_name, NEW.table_name, v_typname;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;


-- fn_trg_guard_owner_type_no_shadow — prevents tenant rows from reusing codes
-- that already exist as system rows (tenant_id IS NULL). Without this, a tenant
-- could shadow 'principal' and cause fn_trg_validate_owner_ref() to route
-- owner references to the tenant row instead of the system contract.
CREATE OR REPLACE FUNCTION master.trg_guard_owner_type_no_shadow()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
BEGIN
    IF NEW.tenant_id IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM master.owner_type
             WHERE code = NEW.code AND tenant_id IS NULL AND status = 'active'
        ) THEN
            RAISE EXCEPTION
                'owner_type: tenant code "%" shadows system code — '
                'choose a different code.',
                NEW.code USING ERRCODE = 'unique_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;


-- ============================================================================
-- Address Cluster Functions
-- ============================================================================

-- fn_trg_validate_owner_type — trigger-based replacement for CHECK constraints
-- that called master.fn_valid_owner_type(). Used on address_link.owner_type and
-- contact_link.owner_type.
--
-- Session-tolerant: system owner types (tenant_id IS NULL) are validated without
-- requiring a tenant session. Tenant extension types require session context.
-- This allows admin scripts and SECURITY DEFINER functions like
-- fn_create_owner_contact_address to use system owner types without a GUC.
CREATE OR REPLACE FUNCTION master.trg_validate_owner_type()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
BEGIN
    -- System rows are always valid, no session required
    IF EXISTS (
        SELECT 1 FROM master.owner_type
        WHERE code = NEW.owner_type AND tenant_id IS NULL AND status = 'active'
    ) THEN RETURN NEW; END IF;

    -- Tenant extension rows require session context
    IF NOT master.fn_valid_owner_type(NEW.owner_type) THEN
        RAISE EXCEPTION
            '%.%: invalid owner_type "%". Must exist in master.owner_type as active.',
            TG_TABLE_SCHEMA, TG_TABLE_NAME, NEW.owner_type
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;


-- fn_trg_validate_owner_ref — validates owner_id exists in the backing table
-- registered for the given owner_type in owner_type.
-- fn_trg_validate_owner_type checks the *type code* is valid;
-- fn_trg_validate_owner_ref checks the *row* actually exists AND belongs to the same tenant.
--
-- System types (schema_name IS NOT NULL): dynamically queries schema.table.pk_column.
--   For tenant-scoped tables (is_tenant_scoped=true): also checks tenant_column = NEW.tenant_id.
--   For global tables (is_tenant_scoped=false): PK check only.
-- Tenant custom types (schema_name IS NULL): blocked — must register a backing table.
-- Session-tolerant: uses current_tenant_id_soft() so admin/SECURITY DEFINER paths work.
CREATE OR REPLACE FUNCTION master.trg_validate_owner_ref()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
DECLARE
    v_schema           text;
    v_table            text;
    v_pk_col           text;
    v_is_tenant_scoped boolean;
    v_tenant_column    text;
    v_exists           boolean;
    v_session          uuid;
BEGIN
    v_session := shared.current_tenant_id_soft();

    SELECT schema_name, table_name, pk_column, is_tenant_scoped, tenant_column
      INTO v_schema, v_table, v_pk_col, v_is_tenant_scoped, v_tenant_column
      FROM master.owner_type
     WHERE code   = NEW.owner_type
       AND status = 'active'
       AND (tenant_id IS NULL OR tenant_id = v_session)
     ORDER BY tenant_id NULLS FIRST
     LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION '%.%: owner_type "%" not found in owner_type',
            TG_TABLE_SCHEMA, TG_TABLE_NAME, NEW.owner_type
            USING ERRCODE = 'check_violation';
    END IF;

    -- Tenant custom types (schema_name IS NULL): no backing table registered,
    -- so owner_id cannot be DB-validated. Block the reference to prevent orphans.
    -- To allow custom types, register a concrete backing table in owner_type.
    IF v_schema IS NULL THEN
        RAISE EXCEPTION
            '%.%: owner_type "%" has no registered backing table (schema_name IS NULL). '
            'Cannot validate owner_id %. Register a backing table in owner_type '
            'before creating contact or address references.',
            TG_TABLE_SCHEMA, TG_TABLE_NAME, NEW.owner_type, NEW.owner_id
            USING ERRCODE = 'check_violation';
    END IF;

    -- For tenant-scoped tables: validate both PK and tenant ownership
    IF v_is_tenant_scoped THEN
        EXECUTE format(
            'SELECT EXISTS(SELECT 1 FROM %I.%I WHERE %I = $1 AND %I = $2)',
            v_schema, v_table, v_pk_col, v_tenant_column
        ) INTO v_exists USING NEW.owner_id, NEW.tenant_id;

        IF NOT v_exists THEN
            RAISE EXCEPTION
                '%.%: owner_id % does not exist in %.% for tenant % (owner_type="%")',
                TG_TABLE_SCHEMA, TG_TABLE_NAME, NEW.owner_id,
                v_schema, v_table, NEW.tenant_id, NEW.owner_type
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    ELSE
        -- Global/non-tenant-scoped tables: PK only
        EXECUTE format(
            'SELECT EXISTS(SELECT 1 FROM %I.%I WHERE %I = $1)',
            v_schema, v_table, v_pk_col
        ) INTO v_exists USING NEW.owner_id;

        IF NOT v_exists THEN
            RAISE EXCEPTION '%.%: owner_id % does not exist in %.% (owner_type="%")',
                TG_TABLE_SCHEMA, TG_TABLE_NAME, NEW.owner_id,
                v_schema, v_table, NEW.owner_type
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_validate_owner_ref() IS
    'Validates owner_id exists in the backing table registered for owner_type. '
    'System types: dynamically queries schema.table via pk_column. '
    'Tenant custom types (schema_name IS NULL): blocked with EXCEPTION — '
    'must register a backing table before creating contact/address references.';


-- master.fn_valid_owner_type() — defined in 05_pre_constraint_functions/003_master_fn_valid_owner_type.sql.

-- fn_resolve_address — purpose-aware address resolution with fallback.
-- Resolution chain:
--   1. Exact purpose match: address_link WHERE purpose = p_purpose
--   2. Default fallback:    address_link WHERE purpose = 'default'
--   3. NULL (no address configured for this owner)
CREATE OR REPLACE FUNCTION master.fn_resolve_address(
    p_tenant_id     uuid,
    p_owner_type    text,
    p_owner_id      uuid,
    p_purpose       text DEFAULT 'default'
)
RETURNS TABLE (
    address_id      uuid,
    purpose_matched text,
    is_fallback     boolean
)
LANGUAGE sql STABLE PARALLEL SAFE
SET search_path = master
AS $$
    -- 1. Exact purpose match
    SELECT
        al.address_id,
        al.purpose          AS purpose_matched,
        false               AS is_fallback
    FROM master.address_link al
    WHERE al.tenant_id      = p_tenant_id
      AND al.owner_type     = p_owner_type
      AND al.owner_id       = p_owner_id
      AND al.purpose        = p_purpose
      AND al.is_primary     = true
      AND al.effective_from <= CURRENT_DATE
      AND (al.effective_until IS NULL OR al.effective_until > CURRENT_DATE)

    UNION ALL

    -- 2. Default fallback (only fires when p_purpose is not already 'default')
    SELECT
        al.address_id,
        'default'           AS purpose_matched,
        true                AS is_fallback
    FROM master.address_link al
    WHERE p_purpose         <> 'default'
      AND al.tenant_id      = p_tenant_id
      AND al.owner_type     = p_owner_type
      AND al.owner_id       = p_owner_id
      AND al.purpose        = 'default'
      AND al.is_primary     = true
      AND al.effective_from <= CURRENT_DATE
      AND (al.effective_until IS NULL OR al.effective_until > CURRENT_DATE)

    ORDER BY is_fallback     -- exact (false) sorts before fallback (true)
    LIMIT 1;
$$;

COMMENT ON FUNCTION master.fn_resolve_address(uuid, text, uuid, text) IS
  'Resolves the active primary address for owner + purpose. '
  'Chain: exact purpose match → purpose=''default'' fallback → NULL. '
  'Returns (address_id, purpose_matched, is_fallback).';


-- fn_set_primary_address_link — promotes one address_link to is_primary = true
-- and demotes all others in the same (tenant, owner, purpose) bucket.
-- Uses SELECT ... FOR UPDATE to lock the bucket, then two-step demote+promote
-- to avoid transient violations of address_link_one_primary_excl.
CREATE OR REPLACE FUNCTION master.fn_set_primary_address_link(
    p_tenant_id        uuid,
    p_address_link_id  uuid,
    p_actor_id         uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = master, pg_catalog
AS $$
DECLARE
    v_owner_type  text;
    v_owner_id    uuid;
    v_purpose     text;
    v_actor       uuid := COALESCE(p_actor_id, '00000000-0000-0000-0000-000000000000');
BEGIN
    PERFORM master.fn_require_tenant_session(p_tenant_id);

    -- Lock the target row and fetch its bucket context
    SELECT owner_type, owner_id, purpose
      INTO v_owner_type, v_owner_id, v_purpose
      FROM master.address_link
     WHERE id = p_address_link_id AND tenant_id = p_tenant_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'address_link % not found for tenant %',
            p_address_link_id, p_tenant_id
            USING ERRCODE = 'no_data_found';
    END IF;

    -- Lock all rows in the bucket
    PERFORM id FROM master.address_link
     WHERE tenant_id  = p_tenant_id
       AND owner_type = v_owner_type
       AND owner_id   = v_owner_id
       AND purpose    = v_purpose
       FOR UPDATE;

    -- Step 1: demote existing primaries
    UPDATE master.address_link
       SET is_primary  = false,
           updated_by  = v_actor
     WHERE tenant_id  = p_tenant_id
       AND owner_type = v_owner_type
       AND owner_id   = v_owner_id
       AND purpose    = v_purpose
       AND is_primary = true
       AND id        <> p_address_link_id;

    -- Step 2: promote the target
    UPDATE master.address_link
       SET is_primary  = true,
           updated_by  = v_actor
     WHERE id         = p_address_link_id
       AND tenant_id  = p_tenant_id;
END;
$$;

COMMENT ON FUNCTION master.fn_set_primary_address_link IS
    'Promotes address_link to is_primary via locked two-step: demote others, then '
    'promote target. FOR UPDATE locking prevents concurrent collisions. SECURITY DEFINER.';


-- fn_create_owner_contact_address — atomic multi-table insert.
-- Creates a complete owner address + contact context in one transaction:
--   1. master.address          → physical location (dedup or reuse via p_address_id)
--   2. master.address_link     → ties address to owner with purpose (upsert)
--   3. master.contact_link     → email channel (if p_email provided)
--   4. master.contact_email    → email detail extension
--   5. master.contact_link     → phone channel (if p_phone provided)
--   6. master.contact_phone    → phone detail extension
--
-- Address deduplication strategy:
--   • p_address_id IS NOT NULL → reuses that address directly (caller knows the id).
--   • p_address_id IS NULL, line1+postal_code provided → INSERT ON CONFLICT
--     against address_dedup_uq reuses an existing active address with the same
--     (tenant_id, country_code, postal_code, line1, city) fingerprint.
--   • p_address_id IS NULL, line1 or postal_code NULL → always creates a new row
--     (incomplete addresses are not dedup-eligible).
-- Contact inserts always create new rows — use for initial setup only.
CREATE OR REPLACE FUNCTION master.fn_create_owner_contact_address(
    p_tenant_id     uuid,
    p_owner_type    text,
    p_owner_id      uuid,
    p_purpose       text,
    -- address fields
    p_line1         text,
    p_line2         text        DEFAULT NULL,
    p_city          text        DEFAULT NULL,
    p_region        text        DEFAULT NULL,
    p_postal_code   text        DEFAULT NULL,
    p_country_code  text        DEFAULT NULL,
    -- contact fields (optional)
    p_email         text        DEFAULT NULL,
    p_phone         text        DEFAULT NULL,
    -- actor
    p_actor_id      uuid        DEFAULT NULL,
    -- pass an existing address_id to reuse instead of creating a new address row
    p_address_id    uuid        DEFAULT NULL
)
RETURNS TABLE (
    address_id      uuid,
    cl_email_id     uuid,
    cl_phone_id     uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = master, pg_catalog
AS $$
DECLARE
    v_address_id    uuid;
    v_cl_email_id   uuid;
    v_cl_phone_id   uuid;
    v_actor         uuid;
BEGIN
    PERFORM master.fn_require_tenant_session(p_tenant_id);
    v_actor := COALESCE(p_actor_id, '00000000-0000-0000-0000-000000000000');

    -- 1. Resolve master.address — three paths:
    --    a) p_address_id provided → reuse (with tenant ownership check)
    --    b) line1+postal_code populated → INSERT with dedup via address_dedup_uq
    --    c) incomplete postal data → plain INSERT (no dedup possible)
    IF p_address_id IS NOT NULL THEN
        -- Validate the address belongs to the caller's tenant
        IF NOT EXISTS (
            SELECT 1 FROM master.address
             WHERE id = p_address_id AND tenant_id = p_tenant_id
        ) THEN
            RAISE EXCEPTION
                'address % does not exist or does not belong to tenant %',
                p_address_id, p_tenant_id
                USING ERRCODE = 'insufficient_privilege';
        END IF;
        v_address_id := p_address_id;
    ELSE
        INSERT INTO master.address (
            tenant_id, line1, line2, city, region, postal_code, country_code, created_by
        )
        VALUES (
            p_tenant_id, p_line1, p_line2, p_city, p_region, p_postal_code,
            upper(p_country_code), v_actor
        )
        ON CONFLICT (tenant_id, country_code, postal_code, line1, city)
            WHERE line1 IS NOT NULL AND postal_code IS NOT NULL AND status = 'active'
        DO UPDATE SET updated_at = now()   -- no-op touch to allow RETURNING
        RETURNING id INTO v_address_id;
    END IF;

    -- 2a. UPSERT master.address_link — always insert with is_primary = false
    -- to avoid colliding with address_link_one_primary_excl if another primary
    -- exists. fn_set_primary_address_link handles promotion via locked path.
    INSERT INTO master.address_link (
        tenant_id, owner_type, owner_id, address_id, purpose,
        is_primary, effective_from, created_by
    )
    VALUES (
        p_tenant_id, p_owner_type, p_owner_id, v_address_id, p_purpose,
        false, CURRENT_DATE, v_actor
    )
    ON CONFLICT ON CONSTRAINT address_link_owner_purpose_address_uq
    DO UPDATE SET updated_at = now();

    -- 2b. Promote to primary via safe locked path (demotes existing, then promotes)
    PERFORM master.fn_set_primary_address_link(
        p_tenant_id,
        (SELECT id FROM master.address_link
          WHERE tenant_id = p_tenant_id AND owner_type = p_owner_type
            AND owner_id = p_owner_id AND address_id = v_address_id
            AND purpose = p_purpose),
        v_actor
    );

    -- 3+4. Contact (email) — delegate to canonical service
    IF p_email IS NOT NULL AND btrim(p_email) <> '' THEN
        IF p_email NOT LIKE '%@%' THEN
            RAISE EXCEPTION 'Invalid email address: %', p_email
                USING ERRCODE = 'invalid_parameter_value';
        END IF;

        -- fn_upsert_contact_link handles: normalization, validation triggers,
        -- value-level dedup via contact_link_value_uq, primary demote-first logic
        v_cl_email_id := master.fn_upsert_contact_link(
            p_tenant_id, p_owner_type, p_owner_id,
            'email', p_email, p_purpose,
            true,    -- is_primary
            v_actor
        );

        -- contact_email extension: idempotent via ON CONFLICT
        INSERT INTO master.contact_email (
            tenant_id, contact_link_id,
            local_part, domain, created_by
        )
        VALUES (
            p_tenant_id, v_cl_email_id,
            lower(split_part(lower(trim(p_email)), '@', 1)),
            lower(split_part(lower(trim(p_email)), '@', 2)),
            v_actor
        )
        ON CONFLICT (tenant_id, contact_link_id) DO NOTHING;
    END IF;

    -- 5+6. Contact (phone) — delegate to canonical service
    -- E.164 format validated here to prevent orphaned contact_link if contact_phone_e164_chk fails.
    IF p_phone IS NOT NULL AND btrim(p_phone) <> '' THEN
        IF p_phone !~ '^\+[1-9]\d{1,14}$' THEN
            RAISE EXCEPTION 'Phone must be in E.164 format (e.g. +60123456789): %', p_phone
                USING ERRCODE = 'invalid_parameter_value';
        END IF;

        v_cl_phone_id := master.fn_upsert_contact_link(
            p_tenant_id, p_owner_type, p_owner_id,
            'phone', p_phone, p_purpose,
            true,    -- is_primary
            v_actor
        );

        INSERT INTO master.contact_phone (
            tenant_id, contact_link_id, e164, created_by
        )
        VALUES (p_tenant_id, v_cl_phone_id, p_phone, v_actor)
        ON CONFLICT (tenant_id, contact_link_id) DO NOTHING;
    END IF;

    RETURN QUERY SELECT v_address_id, v_cl_email_id, v_cl_phone_id;
END;
$$;

COMMENT ON FUNCTION master.fn_create_owner_contact_address IS
  'Atomic multi-row insert: address + address_link + contact_link(email) + '
  'contact_email + contact_link(phone) + contact_phone. '
  'All rows tied to the same (owner_type, owner_id, purpose) context. '
  'Address dedup: when line1+postal_code are non-null, ON CONFLICT against '
  'address_dedup_uq reuses an existing active address with the same postal '
  'fingerprint. Pass p_address_id to reuse a known address (tenant-validated). '
  'Primary promotion delegated to fn_set_primary_address_link / '
  'fn_set_primary_contact_link (locked paths, safe under concurrency). '
  'p_email and p_phone are optional; omit to skip contact rows.';


-- ============================================================================
-- Service Functions — canonical mutation layer
-- ============================================================================
-- These SECURITY DEFINER functions are the intended write path for tenant
-- sessions. Direct DML via RLS tenant_insert/update/delete policies is
-- permitted as a migration path but should eventually be narrowed.
-- ============================================================================

-- fn_assert_tenant_session — soft cross-tenant guard (legacy/admin-context use).
-- Raises if the session tenant (when set) does not match p_tenant_id.
-- No-op when the GUC is absent — used only by auth/registration entry points
-- that intentionally run without a tenant session.
CREATE OR REPLACE FUNCTION master.fn_assert_tenant_session(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE
SET search_path = master, pg_catalog
AS $$
DECLARE
    v_session uuid := shared.current_tenant_id_soft();
BEGIN
    IF v_session IS NOT NULL AND p_tenant_id <> v_session THEN
        RAISE EXCEPTION
            'Operation on tenant % not permitted from session tenant %',
            p_tenant_id, v_session
            USING ERRCODE = 'insufficient_privilege';
    END IF;
END;
$$;

COMMENT ON FUNCTION master.fn_assert_tenant_session(uuid) IS
    'Soft tenant guard: no-op when GUC is absent (admin context). '
    'Use fn_require_tenant_session for tenant-scoped service functions.';

-- fn_require_tenant_session — strict tenant guard for SECURITY DEFINER
-- service functions. Requires app.current_tenant_id to be set AND to match
-- p_tenant_id. Prevents privilege escalation when middleware omits the GUC.
CREATE OR REPLACE FUNCTION master.fn_require_tenant_session(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql VOLATILE
SET search_path = master, pg_catalog
AS $$
DECLARE
    v_session uuid := shared.current_tenant_id_soft();
BEGIN
    IF v_session IS NULL THEN
        RAISE EXCEPTION
            'Tenant session required: app.current_tenant_id is not set. '
            'Middleware must SET app.current_tenant_id before calling tenant-scoped functions.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_tenant_id <> v_session THEN
        RAISE EXCEPTION
            'Operation on tenant % not permitted from session tenant %',
            p_tenant_id, v_session
            USING ERRCODE = 'insufficient_privilege';
    END IF;
END;
$$;

COMMENT ON FUNCTION master.fn_require_tenant_session(uuid) IS
    'Strict tenant guard: raises if app.current_tenant_id is absent or mismatched. '
    'Must be used by all tenant-scoped SECURITY DEFINER service functions.';


-- fn_upsert_contact_link — canonical contact creation/update.
-- Deduplicates on (owner, channel, value, purpose) via contact_link_value_uq.
-- Always inserts with is_primary = false to avoid racing against
-- ux_contact_link_one_primary. If p_is_primary = true, delegates to
-- fn_set_primary_contact_link() which uses FOR UPDATE locking.
-- Returns the contact_link id (existing or new).
CREATE OR REPLACE FUNCTION master.fn_upsert_contact_link(
    p_tenant_id     uuid,
    p_owner_type    text,
    p_owner_id      uuid,
    p_channel_type  text,
    p_value         text,
    p_purpose       text    DEFAULT NULL,
    p_is_primary    boolean DEFAULT false,
    p_actor_id      uuid    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = master, pg_catalog
AS $$
DECLARE
    v_id    uuid;
    v_actor uuid := COALESCE(p_actor_id, '00000000-0000-0000-0000-000000000000');
    v_value text;
BEGIN
    PERFORM master.fn_require_tenant_session(p_tenant_id);

    IF p_channel_type = 'email' THEN
        v_value := lower(trim(p_value));
    ELSE
        v_value := trim(p_value);
    END IF;

    -- Identity/value upsert only — always is_primary = false here
    INSERT INTO master.contact_link (
        tenant_id, owner_type, owner_id,
        channel_type, value, purpose,
        is_primary, is_verified, status, created_by
    )
    VALUES (
        p_tenant_id, p_owner_type, p_owner_id,
        p_channel_type, v_value, p_purpose,
        false, false, 'active', v_actor
    )
    -- PG 15+: column-list inference matches contact_link_value_uq including its
    -- NULLS NOT DISTINCT semantics. Adding NULLS NOT DISTINCT to the ON CONFLICT
    -- clause is valid PG 15 syntax but not required here — PG applies the
    -- index's null handling automatically during conflict detection.
    ON CONFLICT (tenant_id, owner_type, owner_id, channel_type, value, purpose)
    DO UPDATE SET
        updated_at = now()
    RETURNING id INTO v_id;

    -- If caller wants this to be primary, delegate to the locked primary setter
    IF p_is_primary THEN
        PERFORM master.fn_set_primary_contact_link(p_tenant_id, v_id, p_actor_id);
    END IF;

    RETURN v_id;
END;
$$;

COMMENT ON FUNCTION master.fn_upsert_contact_link IS
    'Canonical contact creation/update. Deduplicates on (owner, channel, value, purpose) '
    'via contact_link_value_uq. When p_is_primary=true, delegates to '
    'fn_set_primary_contact_link() (locked path). Returns contact_link id. SECURITY DEFINER.';


-- fn_verify_contact_link — marks a contact as verified.
-- Sets is_verified = true, verified_at = now(), triggers login_email cache sync.
CREATE OR REPLACE FUNCTION master.fn_verify_contact_link(
    p_tenant_id       uuid,
    p_contact_link_id uuid,
    p_actor_id        uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = master, pg_catalog
AS $$
BEGIN
    PERFORM master.fn_require_tenant_session(p_tenant_id);

    -- First check the row exists and belongs to the tenant (404 vs idempotent no-op)
    IF NOT EXISTS (
        SELECT 1 FROM master.contact_link
         WHERE id = p_contact_link_id AND tenant_id = p_tenant_id
    ) THEN
        RAISE EXCEPTION 'contact_link % not found for tenant %',
            p_contact_link_id, p_tenant_id
            USING ERRCODE = 'no_data_found';
    END IF;

    -- Attempt the update; if NOT FOUND, it was already verified — idempotent no-op
    UPDATE master.contact_link
       SET is_verified  = true,
           verified_at  = now(),
           updated_by   = COALESCE(p_actor_id, '00000000-0000-0000-0000-000000000000')
     WHERE id        = p_contact_link_id
       AND tenant_id = p_tenant_id
       AND is_verified = false;
END;
$$;

COMMENT ON FUNCTION master.fn_verify_contact_link IS
    'Marks contact_link as verified and stamps verified_at. '
    'Triggers fn_sync_principal_login_email via AFTER trigger. SECURITY DEFINER.';


-- fn_set_primary_contact_link — promotes one contact to is_primary = true
-- and demotes all others in the same (owner, channel, purpose) bucket.
-- Uses SELECT ... FOR UPDATE to lock the bucket before mutation, preventing
-- concurrent callers from colliding on the partial unique index.
CREATE OR REPLACE FUNCTION master.fn_set_primary_contact_link(
    p_tenant_id       uuid,
    p_contact_link_id uuid,
    p_actor_id        uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = master, pg_catalog
AS $$
DECLARE
    v_owner_type  text;
    v_owner_id    uuid;
    v_channel     text;
    v_purpose     text;
    v_actor       uuid := COALESCE(p_actor_id, '00000000-0000-0000-0000-000000000000');
BEGIN
    PERFORM master.fn_require_tenant_session(p_tenant_id);

    -- Lock the target row and fetch its bucket context
    SELECT owner_type, owner_id, channel_type, purpose
      INTO v_owner_type, v_owner_id, v_channel, v_purpose
      FROM master.contact_link
     WHERE id = p_contact_link_id AND tenant_id = p_tenant_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'contact_link % not found for tenant %',
            p_contact_link_id, p_tenant_id
            USING ERRCODE = 'no_data_found';
    END IF;

    -- Lock all rows in the bucket to prevent concurrent primary changes
    PERFORM id FROM master.contact_link
     WHERE tenant_id    = p_tenant_id
       AND owner_type   = v_owner_type
       AND owner_id     = v_owner_id
       AND channel_type = v_channel
       AND (purpose IS NOT DISTINCT FROM v_purpose)
       FOR UPDATE;

    -- Step 1: demote existing primaries (safe — removes the constraint conflict)
    UPDATE master.contact_link
       SET is_primary  = false,
           updated_by  = v_actor
     WHERE tenant_id    = p_tenant_id
       AND owner_type   = v_owner_type
       AND owner_id     = v_owner_id
       AND channel_type = v_channel
       AND (purpose IS NOT DISTINCT FROM v_purpose)
       AND is_primary   = true
       AND id          <> p_contact_link_id;

    -- Step 2: promote the target
    UPDATE master.contact_link
       SET is_primary  = true,
           updated_by  = v_actor
     WHERE id          = p_contact_link_id
       AND tenant_id   = p_tenant_id;
END;
$$;

COMMENT ON FUNCTION master.fn_set_primary_contact_link IS
    'Promotes contact_link to is_primary via locked two-step: demote others, then '
    'promote target. FOR UPDATE locking prevents concurrent collisions. SECURITY DEFINER.';


-- fn_update_tenant_profile — tenant self-service display/metadata update.
-- Allows tenants to update name, display_name, region without touching status.
CREATE OR REPLACE FUNCTION master.fn_update_tenant_profile(
    p_tenant_id    uuid,
    p_name         text    DEFAULT NULL,
    p_display_name text    DEFAULT NULL,
    p_region       text    DEFAULT NULL,
    p_metadata     jsonb   DEFAULT NULL,
    p_actor_id     uuid    DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = master, pg_catalog
AS $$
BEGIN
    PERFORM master.fn_require_tenant_session(p_tenant_id);

    -- Reject empty strings before they hit the CHECK constraint with a cryptic error
    IF p_name IS NOT NULL AND btrim(p_name) = '' THEN
        RAISE EXCEPTION 'name cannot be empty'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF p_display_name IS NOT NULL AND btrim(p_display_name) = '' THEN
        RAISE EXCEPTION 'display_name cannot be empty'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    UPDATE master.tenant
       SET name         = COALESCE(p_name,         name),
           display_name = COALESCE(p_display_name, display_name),
           region       = COALESCE(p_region,       region),
           metadata     = COALESCE(p_metadata,     metadata),
           updated_by   = COALESCE(p_actor_id, '00000000-0000-0000-0000-000000000000')
     WHERE id = p_tenant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'tenant % not found', p_tenant_id
            USING ERRCODE = 'no_data_found';
    END IF;
END;
$$;

COMMENT ON FUNCTION master.fn_update_tenant_profile IS
    'Tenant self-service profile update. Allows name/display_name/region/metadata '
    'changes without mutating status or subscription. SECURITY DEFINER.';


-- RBAC Phase 2: OU hierarchy functions removed — table dropped in company_code migration.
DROP FUNCTION IF EXISTS master.trg_validate_ou_hierarchy();
DROP FUNCTION IF EXISTS master.trg_project_ou_lifecycle();


-- ============================================================================
-- RBAC Phase 4: Runtime auth functions
-- ============================================================================

-- ── derive_effective_roles ──────────────────────────────────
-- Returns all role assignments with two-dimension scope for a principal.

-- Drop old version to allow return-type change (scope/company_code_id → two-dimension model)
DROP FUNCTION IF EXISTS master.derive_effective_roles(uuid, uuid);
CREATE OR REPLACE FUNCTION master.derive_effective_roles(
    p_tenant_id    uuid,
    p_principal_id uuid
) RETURNS TABLE (
    role_id                    uuid,
    visibility_scope           text,
    assignment_scope_type      text,
    assignment_scope_ref_id    uuid,
    include_descendants        boolean,
    source_group               uuid
) LANGUAGE sql STABLE PARALLEL SAFE
SET search_path = master, pg_catalog
AS $$
    SELECT
        gr.role_id,
        gr.visibility_scope,
        gr.assignment_scope_type,
        gr.assignment_scope_ref_id,
        gr.include_descendants,
        pgm.group_id AS source_group
    FROM master.auth_group_member pgm
    JOIN master.auth_group_role gr
        ON gr.group_id  = pgm.group_id
       AND gr.tenant_id = pgm.tenant_id
       AND gr.status    = 'active'
       AND (gr.expires_at IS NULL OR gr.expires_at > now())
    WHERE pgm.tenant_id    = p_tenant_id
      AND pgm.principal_id = p_principal_id;
$$;

COMMENT ON FUNCTION master.derive_effective_roles IS
    'Returns all role assignments with two-dimension scope for a principal. '
    'visibility_scope + assignment_scope_type/ref_id/include_descendants. '
    'Filters out expired and inactive auth_group_role assignments.';


-- ── check_permission ────────────────────────────────────────
-- Main 7-step auth evaluation function. Returns allow/deny/not_found/not_in_plan.

CREATE OR REPLACE FUNCTION master.check_permission(
    p_tenant_id     uuid,
    p_principal_id  uuid,
    p_permission_id uuid
) RETURNS text  -- 'allow' | 'deny' | 'not_found' | 'not_in_plan'
LANGUAGE plpgsql STABLE
SET search_path = master, shared, pg_catalog AS $$
DECLARE
    v_is_restricted  boolean;
    v_plan_code      text;
    v_role_ids       uuid[];
    v_group_ids      uuid[];
    v_has_allow      boolean := false;
BEGIN
    -- Step 1: Check plan gate for restricted permissions
    SELECT p.is_plan_restricted INTO v_is_restricted
    FROM shared.permission p WHERE p.id = p_permission_id;

    IF NOT FOUND THEN
        RETURN 'not_found';
    END IF;

    IF v_is_restricted THEN
        SELECT t.subscription INTO v_plan_code
        FROM master.tenant t WHERE t.id = p_tenant_id;

        -- Check tenant override first
        IF NOT EXISTS (
            SELECT 1 FROM master.tenant_permission_override
            WHERE tenant_id = p_tenant_id
              AND permission_id = p_permission_id
              AND is_granted = true
              AND (expires_at IS NULL OR expires_at > now())
        ) THEN
            -- Check plan access
            IF NOT EXISTS (
                SELECT 1 FROM shared.plan_permission_access ppa
                JOIN shared.subscription_plan sp ON sp.id = ppa.plan_id
                WHERE sp.code = v_plan_code
                  AND ppa.permission_id = p_permission_id
                  AND ppa.is_included = true
            ) THEN
                RETURN 'not_in_plan';
            END IF;
        END IF;
    END IF;

    -- Step 2: Get principal's groups and roles
    SELECT ARRAY_AGG(DISTINCT gr.role_id) INTO v_role_ids
    FROM master.auth_group_member pgm
    JOIN master.auth_group_role gr ON gr.group_id = pgm.group_id
      AND gr.tenant_id = pgm.tenant_id AND gr.status = 'active'
      AND (gr.expires_at IS NULL OR gr.expires_at > now())
    WHERE pgm.tenant_id = p_tenant_id AND pgm.principal_id = p_principal_id;

    SELECT ARRAY_AGG(DISTINCT group_id) INTO v_group_ids
    FROM master.auth_group_member
    WHERE tenant_id = p_tenant_id AND principal_id = p_principal_id;

    -- Step 3: Check persona_permission (base RBAC)
    SELECT pp.is_granted INTO v_has_allow
    FROM master.principal_persona pp_a
    JOIN shared.persona_permission pp ON pp.persona_id = pp_a.persona_id
    WHERE pp_a.tenant_id    = p_tenant_id
      AND pp_a.principal_id = p_principal_id
      AND pp.permission_id  = p_permission_id
      AND (pp_a.expires_at IS NULL OR pp_a.expires_at > now());

    IF v_has_allow IS NULL THEN
        v_has_allow := false;
    END IF;

    -- Step 4: Check access_grant allow (if persona didn't grant)
    IF NOT v_has_allow THEN
        SELECT EXISTS (
            SELECT 1 FROM master.access_grant ag
            WHERE ag.tenant_id     = p_tenant_id
              AND ag.permission_id = p_permission_id
              AND ag.effect        = 'allow'
              AND ag.status        = 'active'
              AND (ag.expires_at IS NULL OR ag.expires_at > now())
              AND (
                  ag.role_id      = ANY(v_role_ids)
               OR ag.group_id     = ANY(v_group_ids)
               OR ag.principal_id = p_principal_id
              )
        ) INTO v_has_allow;
    END IF;

    -- Step 5: Final deny check — ALWAYS runs, beats all allows
    IF EXISTS (
        SELECT 1 FROM master.access_grant ag
        WHERE ag.tenant_id     = p_tenant_id
          AND ag.principal_id  = p_principal_id
          AND ag.permission_id = p_permission_id
          AND ag.effect        = 'deny'
          AND ag.status        = 'active'
          AND (ag.expires_at IS NULL OR ag.expires_at > now())
    ) THEN
        RETURN 'deny';
    END IF;

    RETURN CASE WHEN v_has_allow THEN 'allow' ELSE 'not_found' END;
END;
$$;

COMMENT ON FUNCTION master.check_permission IS
    'Main RBAC auth evaluation. 5-step process: '
    '1) Plan gate check for restricted permissions, '
    '2) Derive groups/roles, '
    '3) Check persona base permissions, '
    '4) Check access_grant allows, '
    '5) Check access_grant denies (always wins). '
    'Returns: allow | deny | not_found | not_in_plan.';


-- ── resolve_allowed_companies ───────────────────────────────
-- Replaces get_effective_scope (which was lossy LIMIT 1 and conflated both scope dims).
-- Returns the full set of company_code_ids the principal is allowed for a permission.
-- Sources: persona (tenant-wide) + auth_group_role (scoped) + access_grant (scoped).
-- Deny checked first.

DROP FUNCTION IF EXISTS master.get_effective_scope(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION master.resolve_allowed_companies(
    p_tenant_id     uuid,
    p_principal_id  uuid,
    p_permission_id uuid
) RETURNS TABLE (company_code_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = master, shared, pg_catalog
AS $$
BEGIN
    -- Deny check (matches check_permission step 5)
    IF EXISTS (
        SELECT 1 FROM master.access_grant ag
        WHERE ag.tenant_id     = p_tenant_id
          AND ag.principal_id  = p_principal_id
          AND ag.permission_id = p_permission_id
          AND ag.effect        = 'deny'
          AND ag.status        = 'active'
          AND (ag.expires_at IS NULL OR ag.expires_at > now())
    ) THEN
        RETURN;
    END IF;

    RETURN QUERY

    -- Source 1: persona_permission → tenant-wide
    SELECT cc.id
    FROM master.company_code cc
    WHERE cc.tenant_id = p_tenant_id
      AND cc.is_active = true
      AND EXISTS (
          SELECT 1
          FROM master.principal_persona ppa
          JOIN shared.persona_permission pp
              ON pp.persona_id    = ppa.persona_id
             AND pp.permission_id = p_permission_id
             AND pp.is_granted    = true
          WHERE ppa.tenant_id    = p_tenant_id
            AND ppa.principal_id = p_principal_id
            AND (ppa.expires_at IS NULL OR ppa.expires_at > now())
      )

    UNION

    -- Source 2a: auth_group_role — tenant scope
    SELECT cc.id
    FROM master.company_code cc
    WHERE cc.tenant_id = p_tenant_id
      AND cc.is_active = true
      AND EXISTS (
          SELECT 1
          FROM master.auth_group_member pgm
          JOIN master.auth_group_role gr
              ON gr.group_id  = pgm.group_id
             AND gr.tenant_id = pgm.tenant_id
             AND gr.status    = 'active'
             AND (gr.expires_at IS NULL OR gr.expires_at > now())
          JOIN shared.role r ON r.id = gr.role_id AND r.status = 'active'
          JOIN shared.persona_permission pp
              ON pp.persona_id    = r.persona_id
             AND pp.permission_id = p_permission_id
             AND pp.is_granted    = true
          WHERE pgm.tenant_id              = p_tenant_id
            AND pgm.principal_id           = p_principal_id
            AND gr.assignment_scope_type   = 'tenant'
      )

    UNION

    -- Source 2b: auth_group_role — company_code scope
    SELECT gr.assignment_scope_ref_id
    FROM master.auth_group_member pgm
    JOIN master.auth_group_role gr
        ON gr.group_id  = pgm.group_id
       AND gr.tenant_id = pgm.tenant_id
       AND gr.status    = 'active'
       AND (gr.expires_at IS NULL OR gr.expires_at > now())
    JOIN shared.role r ON r.id = gr.role_id AND r.status = 'active'
    JOIN shared.persona_permission pp
        ON pp.persona_id    = r.persona_id
       AND pp.permission_id = p_permission_id
       AND pp.is_granted    = true
    WHERE pgm.tenant_id            = p_tenant_id
      AND pgm.principal_id         = p_principal_id
      AND gr.assignment_scope_type = 'company_code'

    UNION

    -- Source 2c: auth_group_role — legal_entity with full descendant subtree
    SELECT sub.company_code_id
    FROM master.auth_group_member pgm
    JOIN master.auth_group_role gr
        ON gr.group_id  = pgm.group_id
       AND gr.tenant_id = pgm.tenant_id
       AND gr.status    = 'active'
       AND (gr.expires_at IS NULL OR gr.expires_at > now())
    JOIN shared.role r ON r.id = gr.role_id AND r.status = 'active'
    JOIN shared.persona_permission pp
        ON pp.persona_id    = r.persona_id
       AND pp.permission_id = p_permission_id
       AND pp.is_granted    = true
    CROSS JOIN LATERAL master.fn_resolve_le_subtree_companies(
        p_tenant_id, gr.assignment_scope_ref_id
    ) sub
    WHERE pgm.tenant_id              = p_tenant_id
      AND pgm.principal_id           = p_principal_id
      AND gr.assignment_scope_type   = 'legal_entity'
      AND gr.include_descendants     = true

    UNION

    -- Source 2d: auth_group_role — legal_entity direct companies only
    SELECT cc.id
    FROM master.auth_group_member pgm
    JOIN master.auth_group_role gr
        ON gr.group_id  = pgm.group_id
       AND gr.tenant_id = pgm.tenant_id
       AND gr.status    = 'active'
       AND (gr.expires_at IS NULL OR gr.expires_at > now())
    JOIN shared.role r ON r.id = gr.role_id AND r.status = 'active'
    JOIN shared.persona_permission pp
        ON pp.persona_id    = r.persona_id
       AND pp.permission_id = p_permission_id
       AND pp.is_granted    = true
    JOIN master.company_code cc
        ON cc.legal_entity_id = gr.assignment_scope_ref_id
       AND cc.tenant_id       = p_tenant_id
       AND cc.is_active       = true
    WHERE pgm.tenant_id              = p_tenant_id
      AND pgm.principal_id           = p_principal_id
      AND gr.assignment_scope_type   = 'legal_entity'
      AND gr.include_descendants     = false

    UNION

    -- Source 3a: access_grant — tenant scope
    SELECT cc.id
    FROM master.company_code cc
    WHERE cc.tenant_id = p_tenant_id
      AND cc.is_active = true
      AND EXISTS (
          SELECT 1 FROM master.access_grant ag
          WHERE ag.tenant_id              = p_tenant_id
            AND ag.permission_id          = p_permission_id
            AND ag.effect                 = 'allow'
            AND ag.status                 = 'active'
            AND (ag.expires_at IS NULL OR ag.expires_at > now())
            AND ag.assignment_scope_type  = 'tenant'
            AND (
                ag.principal_id = p_principal_id
             OR ag.group_id IN (
                    SELECT group_id FROM master.auth_group_member
                    WHERE tenant_id = p_tenant_id AND principal_id = p_principal_id)
             OR ag.role_id IN (
                    SELECT gr2.role_id FROM master.auth_group_member pgm2
                    JOIN master.auth_group_role gr2
                        ON gr2.group_id  = pgm2.group_id
                       AND gr2.tenant_id = pgm2.tenant_id
                       AND gr2.status    = 'active'
                    WHERE pgm2.tenant_id    = p_tenant_id
                      AND pgm2.principal_id = p_principal_id)
            )
      )

    UNION

    -- Source 3b: access_grant — company_code scope
    SELECT ag.assignment_scope_ref_id
    FROM master.access_grant ag
    WHERE ag.tenant_id              = p_tenant_id
      AND ag.permission_id          = p_permission_id
      AND ag.effect                 = 'allow'
      AND ag.status                 = 'active'
      AND (ag.expires_at IS NULL OR ag.expires_at > now())
      AND ag.assignment_scope_type  = 'company_code'
      AND (
          ag.principal_id = p_principal_id
       OR ag.group_id IN (
              SELECT group_id FROM master.auth_group_member
              WHERE tenant_id = p_tenant_id AND principal_id = p_principal_id)
       OR ag.role_id IN (
              SELECT gr2.role_id FROM master.auth_group_member pgm2
              JOIN master.auth_group_role gr2
                  ON gr2.group_id  = pgm2.group_id
                 AND gr2.tenant_id = pgm2.tenant_id
                 AND gr2.status    = 'active'
              WHERE pgm2.tenant_id    = p_tenant_id
                AND pgm2.principal_id = p_principal_id)
      )

    UNION

    -- Source 3c: access_grant — legal_entity (always full subtree)
    SELECT sub.company_code_id
    FROM master.access_grant ag
    CROSS JOIN LATERAL master.fn_resolve_le_subtree_companies(
        p_tenant_id, ag.assignment_scope_ref_id
    ) sub
    WHERE ag.tenant_id              = p_tenant_id
      AND ag.permission_id          = p_permission_id
      AND ag.effect                 = 'allow'
      AND ag.status                 = 'active'
      AND (ag.expires_at IS NULL OR ag.expires_at > now())
      AND ag.assignment_scope_type  = 'legal_entity'
      AND (
          ag.principal_id = p_principal_id
       OR ag.group_id IN (
              SELECT group_id FROM master.auth_group_member
              WHERE tenant_id = p_tenant_id AND principal_id = p_principal_id)
       OR ag.role_id IN (
              SELECT gr2.role_id FROM master.auth_group_member pgm2
              JOIN master.auth_group_role gr2
                  ON gr2.group_id  = pgm2.group_id
                 AND gr2.tenant_id = pgm2.tenant_id
                 AND gr2.status    = 'active'
              WHERE pgm2.tenant_id    = p_tenant_id
                AND pgm2.principal_id = p_principal_id)
      )

    UNION

    -- Source 3d: access_grant — unscoped (NULL assignment_scope_type) → all CCs
    SELECT cc.id
    FROM master.company_code cc
    WHERE cc.tenant_id = p_tenant_id
      AND cc.is_active = true
      AND EXISTS (
          SELECT 1 FROM master.access_grant ag
          WHERE ag.tenant_id             = p_tenant_id
            AND ag.permission_id         = p_permission_id
            AND ag.effect                = 'allow'
            AND ag.status                = 'active'
            AND (ag.expires_at IS NULL OR ag.expires_at > now())
            AND ag.assignment_scope_type IS NULL
            AND (
                ag.principal_id = p_principal_id
             OR ag.group_id IN (
                    SELECT group_id FROM master.auth_group_member
                    WHERE tenant_id = p_tenant_id AND principal_id = p_principal_id)
             OR ag.role_id IN (
                    SELECT gr2.role_id FROM master.auth_group_member pgm2
                    JOIN master.auth_group_role gr2
                        ON gr2.group_id  = pgm2.group_id
                       AND gr2.tenant_id = pgm2.tenant_id
                       AND gr2.status    = 'active'
                    WHERE pgm2.tenant_id    = p_tenant_id
                      AND pgm2.principal_id = p_principal_id)
            )
      );
END;
$$;

COMMENT ON FUNCTION master.resolve_allowed_companies IS
    'Returns the full set of allowed company_code_ids for a principal + permission. '
    'Replaces the old get_effective_scope() which was lossy (LIMIT 1) and conflated '
    'visibility scope with assignment scope. '
    'Evaluation: persona (tenant-wide) + auth_group_role (scoped) + access_grant (scoped). '
    'Deny checked first. LE scope on access_grant always means full subtree.';


-- ── get_effective_visibility_scope ──────────────────────────
-- Returns the widest visibility_scope (all > team > own) for a principal + permission.
-- Row-filtering dimension only. CC boundary: resolve_allowed_companies().

CREATE OR REPLACE FUNCTION master.get_effective_visibility_scope(
    p_tenant_id     uuid,
    p_principal_id  uuid,
    p_permission_id uuid
) RETURNS text
LANGUAGE sql STABLE PARALLEL SAFE
SET search_path = master, shared, pg_catalog
AS $$
    SELECT vs FROM (
        -- Persona → always 'all'
        SELECT 'all'::text AS vs
        FROM master.principal_persona ppa
        JOIN shared.persona_permission pp
            ON pp.persona_id    = ppa.persona_id
           AND pp.permission_id = p_permission_id
           AND pp.is_granted    = true
        WHERE ppa.tenant_id    = p_tenant_id
          AND ppa.principal_id = p_principal_id
          AND (ppa.expires_at IS NULL OR ppa.expires_at > now())

        UNION ALL

        -- Group role
        SELECT gr.visibility_scope AS vs
        FROM master.auth_group_member pgm
        JOIN master.auth_group_role gr
            ON gr.group_id  = pgm.group_id
           AND gr.tenant_id = pgm.tenant_id
           AND gr.status    = 'active'
           AND (gr.expires_at IS NULL OR gr.expires_at > now())
        JOIN shared.role r ON r.id = gr.role_id AND r.status = 'active'
        JOIN shared.persona_permission pp
            ON pp.persona_id    = r.persona_id
           AND pp.permission_id = p_permission_id
           AND pp.is_granted    = true
        WHERE pgm.tenant_id    = p_tenant_id
          AND pgm.principal_id = p_principal_id

        UNION ALL

        -- Access grant allows
        SELECT ag.visibility_scope AS vs
        FROM master.access_grant ag
        WHERE ag.tenant_id     = p_tenant_id
          AND ag.permission_id = p_permission_id
          AND ag.effect        = 'allow'
          AND ag.status        = 'active'
          AND (ag.expires_at IS NULL OR ag.expires_at > now())
          AND ag.visibility_scope IS NOT NULL
          AND (
              ag.principal_id = p_principal_id
           OR ag.group_id IN (
                  SELECT group_id FROM master.auth_group_member
                  WHERE tenant_id = p_tenant_id AND principal_id = p_principal_id)
           OR ag.role_id IN (
                  SELECT gr2.role_id FROM master.auth_group_member pgm2
                  JOIN master.auth_group_role gr2
                      ON gr2.group_id  = pgm2.group_id
                     AND gr2.tenant_id = pgm2.tenant_id
                     AND gr2.status    = 'active'
                  WHERE pgm2.tenant_id    = p_tenant_id
                    AND pgm2.principal_id = p_principal_id)
          )
    ) all_scopes
    ORDER BY
        CASE vs
            WHEN 'all'  THEN 1
            WHEN 'team' THEN 2
            WHEN 'own'  THEN 3
            ELSE 4
        END
    LIMIT 1;
$$;

COMMENT ON FUNCTION master.get_effective_visibility_scope IS
    'Returns the widest visibility_scope (all > team > own) for a principal + permission. '
    'Row-filtering dimension only. CC boundary: resolve_allowed_companies(). '
    'Replaces the old get_effective_scope() which conflated both dimensions.';


-- get_ou_subtree removed: OU hierarchy was retired in the company_code migration.
DROP FUNCTION IF EXISTS master.get_ou_subtree(uuid, uuid);


-- ── trg_validate_assignment_scope ───────────────────────────
-- Shared trigger function: validates assignment_scope_ref_id exists in the
-- correct target table (company_code or legal_entity) for the same tenant.
-- Attached to both auth_group_role and access_grant (TG_ARGV[0] = table name for error msgs).

CREATE OR REPLACE FUNCTION master.trg_validate_assignment_scope()
RETURNS trigger LANGUAGE plpgsql STABLE
SET search_path = master, pg_temp
AS $$
DECLARE
    v_source text := coalesce(TG_ARGV[0], TG_TABLE_NAME);
BEGIN
    IF NEW.assignment_scope_type IS NULL THEN
        RETURN NEW;
    END IF;

    CASE NEW.assignment_scope_type
        WHEN 'tenant' THEN
            IF NEW.assignment_scope_ref_id IS NOT NULL THEN
                RAISE EXCEPTION '%: ref_id must be NULL for tenant scope',
                    v_source USING ERRCODE = 'check_violation';
            END IF;

        WHEN 'company_code' THEN
            IF NOT EXISTS (
                SELECT 1 FROM master.company_code
                WHERE id        = NEW.assignment_scope_ref_id
                  AND tenant_id = NEW.tenant_id
            ) THEN
                RAISE EXCEPTION '%: ref_id % not found in company_code for tenant %',
                    v_source, NEW.assignment_scope_ref_id, NEW.tenant_id
                    USING ERRCODE = 'foreign_key_violation';
            END IF;

        WHEN 'legal_entity' THEN
            IF NOT EXISTS (
                SELECT 1 FROM master.legal_entity
                WHERE id        = NEW.assignment_scope_ref_id
                  AND tenant_id = NEW.tenant_id
            ) THEN
                RAISE EXCEPTION '%: ref_id % not found in legal_entity for tenant %',
                    v_source, NEW.assignment_scope_ref_id, NEW.tenant_id
                    USING ERRCODE = 'foreign_key_violation';
            END IF;

        ELSE
            RAISE EXCEPTION '%: unknown assignment_scope_type %',
                v_source, NEW.assignment_scope_type
                USING ERRCODE = 'check_violation';
    END CASE;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_validate_assignment_scope IS
    'Validates assignment_scope_ref_id exists in the target table (company_code '
    'or legal_entity) and belongs to the same tenant. Shared by auth_group_role and '
    'access_grant. TG_ARGV[0] = source table name for error messages.';


-- ============================================================================
-- RBAC Phase 5: IAM outbox trigger functions
-- ============================================================================

-- ── Generic outbox emitter trigger function ─────────────────
-- Parameterised: TG_ARGV[0] = topic, TG_ARGV[1] = event_type.
-- Emits INSERT/UPDATE/DELETE events to the unified event.outbox.

CREATE OR REPLACE FUNCTION master.trg_emit_outbox_event()
RETURNS trigger LANGUAGE plpgsql VOLATILE
SET search_path = master, event, pg_catalog AS $$
DECLARE
    v_topic      text;
    v_event_type text;
    v_payload    jsonb;
    v_tenant     uuid;
    v_actor      uuid;
    v_entity_id  uuid;
BEGIN
    v_topic      := TG_ARGV[0];
    v_event_type := TG_ARGV[1];

    IF TG_OP = 'DELETE' THEN
        v_tenant    := OLD.tenant_id;
        v_actor     := COALESCE(OLD.created_by, '00000000-0000-0000-0000-000000000000'::uuid);
        v_entity_id := OLD.id;
        v_payload   := jsonb_build_object(
            'op', 'DELETE',
            'table', TG_TABLE_NAME,
            'old', to_jsonb(OLD)
        );
    ELSIF TG_OP = 'INSERT' THEN
        v_tenant    := NEW.tenant_id;
        v_actor     := COALESCE(NEW.created_by, '00000000-0000-0000-0000-000000000000'::uuid);
        v_entity_id := NEW.id;
        v_payload   := jsonb_build_object(
            'op', 'INSERT',
            'table', TG_TABLE_NAME,
            'new', to_jsonb(NEW)
        );
    ELSE -- UPDATE
        v_tenant    := NEW.tenant_id;
        v_actor     := COALESCE(NEW.updated_by, NEW.created_by, '00000000-0000-0000-0000-000000000000'::uuid);
        v_entity_id := NEW.id;
        v_payload   := jsonb_build_object(
            'op', 'UPDATE',
            'table', TG_TABLE_NAME,
            'old', to_jsonb(OLD),
            'new', to_jsonb(NEW)
        );
    END IF;

    PERFORM event.fn_outbox_emit(
        p_tenant_id   := v_tenant,
        p_topic       := v_topic,
        p_event_type  := v_event_type,
        p_payload     := v_payload,
        p_created_by  := v_actor,
        p_entity_type := TG_TABLE_NAME,
        p_entity_id   := v_entity_id,
        p_source      := 'trigger'
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_emit_outbox_event IS
    'Generic outbox emitter trigger. TG_ARGV[0] = topic, TG_ARGV[1] = event_type. '
    'Emits INSERT/UPDATE/DELETE payloads to event.outbox. '
    'Used by IAM (topic=iam) and extensible for other domains.';


-- ============================================================================
-- CORE FINANCE MASTER — TRIGGER FUNCTIONS
-- ============================================================================

-- Hierarchy: parent must belong to same company_code_id
CREATE OR REPLACE FUNCTION master.trg_enforce_parent_same_company()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
DECLARE
    v_parent_company uuid;
    v_parent_val     uuid;
BEGIN
    IF TG_TABLE_NAME = 'site' THEN
        v_parent_val := NEW.parent_site_id;
    ELSIF TG_TABLE_NAME = 'project' THEN
        v_parent_val := NEW.parent_project_id;
    ELSIF TG_TABLE_NAME = 'project_item' THEN
        v_parent_val := NEW.parent_item_id;
    ELSE
        v_parent_val := NEW.parent_id;
    END IF;
    IF v_parent_val IS NULL THEN RETURN NEW; END IF;

    EXECUTE format(
        'SELECT company_code_id FROM %I.%I WHERE id = $1',
        TG_TABLE_SCHEMA, TG_TABLE_NAME
    ) INTO v_parent_company USING v_parent_val;

    IF v_parent_company IS DISTINCT FROM NEW.company_code_id THEN
        RAISE EXCEPTION '%.% hierarchy violation: parent company (%) != child (%)',
            TG_TABLE_SCHEMA, TG_TABLE_NAME, v_parent_company, NEW.company_code_id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
COMMENT ON FUNCTION master.trg_enforce_parent_same_company IS
    'Hierarchy guard: parent row must belong to same company_code_id as child. '
    'Generic — handles site.parent_site_id, project.parent_project_id, etc.';

-- Hierarchy: auto-calculate level_no from parent depth
CREATE OR REPLACE FUNCTION master.trg_auto_set_level()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
DECLARE
    v_parent_level smallint;
    v_parent_val   uuid;
BEGIN
    IF TG_TABLE_NAME = 'site' THEN
        v_parent_val := NEW.parent_site_id;
    ELSIF TG_TABLE_NAME = 'project' THEN
        v_parent_val := NEW.parent_project_id;
    ELSIF TG_TABLE_NAME = 'project_item' THEN
        v_parent_val := NEW.parent_item_id;
    ELSE
        v_parent_val := NEW.parent_id;
    END IF;
    IF v_parent_val IS NULL THEN
        NEW.level_no := 1;
    ELSE
        EXECUTE format(
            'SELECT level_no FROM %I.%I WHERE id = $1',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
        ) INTO v_parent_level USING v_parent_val;
        NEW.level_no := COALESCE(v_parent_level, 0) + 1;
    END IF;
    RETURN NEW;
END;
$$;
COMMENT ON FUNCTION master.trg_auto_set_level IS
    'Auto-calculates level_no from parent depth. Root nodes = 1. '
    'Generic — handles all hierarchical finance tables.';

-- Cost center cross-ref: profit_center_id and site_id must be same company
CREATE OR REPLACE FUNCTION master.trg_cc_cross_refs_same_company()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
DECLARE v_ref uuid;
BEGIN
    IF NEW.profit_center_id IS NOT NULL THEN
        SELECT company_code_id INTO v_ref
        FROM master.profit_center WHERE id = NEW.profit_center_id;
        IF v_ref IS DISTINCT FROM NEW.company_code_id THEN
            RAISE EXCEPTION 'cost_center.profit_center_id: company mismatch (CC:%, PC:%)',
                NEW.company_code_id, v_ref USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    IF NEW.site_id IS NOT NULL THEN
        SELECT company_code_id INTO v_ref
        FROM master.site WHERE id = NEW.site_id;
        IF v_ref IS DISTINCT FROM NEW.company_code_id THEN
            RAISE EXCEPTION 'cost_center.site_id: company mismatch (CC:%, Site:%)',
                NEW.company_code_id, v_ref USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
COMMENT ON FUNCTION master.trg_cc_cross_refs_same_company IS
    'Ensures cost_center.profit_center_id and cost_center.site_id belong to same company_code.';

-- project_item: company_code_id must match parent project + parent_item same-company
CREATE OR REPLACE FUNCTION master.trg_project_item_company_integrity()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
DECLARE
    v_project_company uuid;
    v_parent_company  uuid;
BEGIN
    SELECT company_code_id INTO v_project_company
    FROM master.project WHERE id = NEW.project_id;

    IF v_project_company IS DISTINCT FROM NEW.company_code_id THEN
        RAISE EXCEPTION 'project_item.company_code_id (%) must match project.company_code_id (%)',
            NEW.company_code_id, v_project_company
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.parent_item_id IS NOT NULL THEN
        SELECT company_code_id INTO v_parent_company
        FROM master.project_item WHERE id = NEW.parent_item_id;

        IF v_parent_company IS DISTINCT FROM NEW.company_code_id THEN
            RAISE EXCEPTION 'project_item parent (%) belongs to different company (%)',
                NEW.parent_item_id, v_parent_company
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;
COMMENT ON FUNCTION master.trg_project_item_company_integrity IS
    'Ensures project_item.company_code_id matches parent project and parent_item.';

-- company_code_gl_account: default_cost_center_id and default_site_id must be same company
CREATE OR REPLACE FUNCTION master.trg_ccga_defaults_same_company()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
DECLARE v_ref uuid;
BEGIN
    IF NEW.default_cost_center_id IS NOT NULL THEN
        SELECT company_code_id INTO v_ref
        FROM master.cost_center WHERE id = NEW.default_cost_center_id;
        IF v_ref IS DISTINCT FROM NEW.company_code_id THEN
            RAISE EXCEPTION 'company_code_gl_account.default_cost_center_id: company mismatch '
                '(row company: %, cost_center company: %)',
                NEW.company_code_id, v_ref
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF NEW.default_site_id IS NOT NULL THEN
        SELECT company_code_id INTO v_ref
        FROM master.site WHERE id = NEW.default_site_id;
        IF v_ref IS DISTINCT FROM NEW.company_code_id THEN
            RAISE EXCEPTION 'company_code_gl_account.default_site_id: company mismatch '
                '(row company: %, site company: %)',
                NEW.company_code_id, v_ref
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;
COMMENT ON FUNCTION master.trg_ccga_defaults_same_company IS
    'Ensures ccga defaults (cost_center, site) belong to same company_code.';

-- gl_account: parent-child account_class consistency
CREATE OR REPLACE FUNCTION master.trg_gl_account_parent_class_check()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
DECLARE
    v_parent_class  text;
    v_parent_chart  uuid;
BEGIN
    IF NEW.parent_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT account_class, chart_of_account_id
    INTO   v_parent_class, v_parent_chart
    FROM   master.gl_account
    WHERE  id = NEW.parent_id;

    IF v_parent_chart IS DISTINCT FROM NEW.chart_of_account_id THEN
        RAISE EXCEPTION 'gl_account parent (%) belongs to chart %, but child belongs to chart %',
            NEW.parent_id, v_parent_chart, NEW.chart_of_account_id
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_parent_class IS DISTINCT FROM NEW.account_class THEN
        -- Allow contra_* accounts to nest under their corresponding base class header
        IF NOT (
            (NEW.account_class = 'contra_asset'     AND v_parent_class = 'asset')     OR
            (NEW.account_class = 'contra_liability'  AND v_parent_class = 'liability') OR
            (NEW.account_class = 'contra_equity'    AND v_parent_class = 'equity')    OR
            (NEW.account_class = 'contra_revenue'   AND v_parent_class IN ('income', 'revenue')) OR
            (NEW.account_class = 'contra_expense'   AND v_parent_class = 'expense')
        ) THEN
            RAISE EXCEPTION 'gl_account hierarchy violation: child account_class (%) '
                'differs from parent account_class (%). '
                'An % account cannot nest under an % header.',
                NEW.account_class, v_parent_class,
                NEW.account_class, v_parent_class
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;
COMMENT ON FUNCTION master.trg_gl_account_parent_class_check IS
    'Enforces GL account hierarchy: child account_class must match parent. '
    'Also validates parent belongs to same chart_of_account.';

-- Hierarchy path rebuild utility
CREATE OR REPLACE FUNCTION master.fn_rebuild_hierarchy_paths(
    p_tenant_id    uuid,
    p_table_schema text,
    p_table_name   text,
    p_scope_column text DEFAULT NULL,
    p_scope_value  uuid DEFAULT NULL
) RETURNS integer LANGUAGE plpgsql SET search_path = master AS $$
DECLARE
    v_updated   integer;
    v_parent    text;
    v_scope_sql text := '';
BEGIN
    v_parent := CASE p_table_name
        WHEN 'site'         THEN 'parent_site_id'
        WHEN 'project'      THEN 'parent_project_id'
        WHEN 'project_item' THEN 'parent_item_id'
        ELSE 'parent_id'
    END;
    IF p_scope_column IS NOT NULL AND p_scope_value IS NOT NULL THEN
        v_scope_sql := format(' AND %I = %L', p_scope_column, p_scope_value);
    END IF;
    EXECUTE format('
        WITH RECURSIVE tree AS (
            SELECT id, code, code::text AS cp, 1 AS cl
            FROM %I.%I
            WHERE tenant_id = $1 AND %I IS NULL %s
            UNION ALL
            SELECT c.id, c.code, tree.cp || ''/'' || c.code, tree.cl + 1
            FROM %I.%I c
            JOIN tree ON tree.id = c.%I
            WHERE c.tenant_id = $1 %s
        )
        UPDATE %I.%I t
        SET path = tree.cp, level_no = tree.cl
        FROM tree
        WHERE t.id = tree.id
          AND (t.path IS DISTINCT FROM tree.cp
               OR t.level_no IS DISTINCT FROM tree.cl)
    ', p_table_schema, p_table_name, v_parent, v_scope_sql,
       p_table_schema, p_table_name, v_parent, v_scope_sql,
       p_table_schema, p_table_name)
    USING p_tenant_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated;
END;
$$;
COMMENT ON FUNCTION master.fn_rebuild_hierarchy_paths IS
    'Rebuilds path + level_no for hierarchical finance tables using recursive CTE. '
    'Optional scope filter (e.g. company_code_id) for partial rebuild.';


-- =============================================================================
-- MODULE 400 — Party, Product, and Classification Bridge
-- =============================================================================

-- fn_trg_cc_validate_owner — polymorphic owner FK validation for commodity_classification
CREATE OR REPLACE FUNCTION master.trg_cc_validate_owner()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
DECLARE
    v_exists boolean;
BEGIN
    IF NEW.owner_type IS NULL OR NEW.owner_id IS NULL THEN
        RETURN NEW;
    END IF;

    CASE NEW.owner_type
        WHEN 'product' THEN
            SELECT EXISTS(SELECT 1 FROM master.product WHERE id = NEW.owner_id AND tenant_id = NEW.tenant_id) INTO v_exists;
        WHEN 'item_category' THEN
            SELECT EXISTS(SELECT 1 FROM master.item_category WHERE id = NEW.owner_id AND tenant_id = NEW.tenant_id) INTO v_exists;
        WHEN 'spend_category' THEN
            SELECT EXISTS(SELECT 1 FROM master.spend_category WHERE id = NEW.owner_id AND tenant_id = NEW.tenant_id) INTO v_exists;
        WHEN 'item' THEN
            SELECT EXISTS(SELECT 1 FROM master.item WHERE id = NEW.owner_id AND tenant_id = NEW.tenant_id) INTO v_exists;
        WHEN 'customer' THEN
            SELECT EXISTS(SELECT 1 FROM master.customer WHERE id = NEW.owner_id AND tenant_id = NEW.tenant_id) INTO v_exists;
        WHEN 'supplier' THEN
            SELECT EXISTS(SELECT 1 FROM master.supplier WHERE id = NEW.owner_id AND tenant_id = NEW.tenant_id) INTO v_exists;
        ELSE
            RAISE EXCEPTION 'commodity_classification: unknown owner_type "%"', NEW.owner_type
                USING ERRCODE = 'foreign_key_violation';
    END CASE;

    IF NOT v_exists THEN
        RAISE EXCEPTION 'commodity_classification: owner_id (%) not found in master.% for tenant %',
            NEW.owner_id, NEW.owner_type, NEW.tenant_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_cc_validate_owner IS
    'Polymorphic owner FK validation for commodity_classification. '
    'Dispatches to product, item_category, spend_category, item, customer, supplier.';


-- fn_trg_cc_validate_code — polymorphic code FK + domain_code match validation
CREATE OR REPLACE FUNCTION master.trg_cc_validate_code()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
DECLARE
    v_actual_domain text;
BEGIN
    IF NEW.classification_type IS NULL OR NEW.code_id IS NULL THEN
        RETURN NEW;
    END IF;

    CASE NEW.classification_type
        WHEN 'commodity' THEN
            SELECT domain_code INTO v_actual_domain
            FROM shared.commodity_code WHERE id = NEW.code_id;
            IF v_actual_domain IS NULL THEN
                RAISE EXCEPTION 'commodity_classification: code_id (%) not found in shared.commodity_code',
                    NEW.code_id
                    USING ERRCODE = 'foreign_key_violation';
            END IF;
        WHEN 'industry' THEN
            SELECT domain_code INTO v_actual_domain
            FROM shared.industry_code WHERE id = NEW.code_id;
            IF v_actual_domain IS NULL THEN
                RAISE EXCEPTION 'commodity_classification: code_id (%) not found in shared.industry_code',
                    NEW.code_id
                    USING ERRCODE = 'foreign_key_violation';
            END IF;
        ELSE
            RAISE EXCEPTION 'commodity_classification: unknown classification_type "%"', NEW.classification_type
                USING ERRCODE = 'foreign_key_violation';
    END CASE;

    IF v_actual_domain IS DISTINCT FROM NEW.domain_code THEN
        RAISE EXCEPTION 'commodity_classification: domain_code mismatch — row says %, code says %',
            NEW.domain_code, v_actual_domain
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_cc_validate_code IS
    'Polymorphic code FK + domain_code validation for commodity_classification. '
    'Verifies code_id exists in shared.commodity_code or shared.industry_code '
    'and that the code''s domain_code matches the row''s domain_code.';


-- fn_trg_cc_validate_owner_type — cross-validates owner_type against
-- owner_type system rows (tenant_id IS NULL).
-- Stronger than lookup-only — ensures routing contract exists.
CREATE OR REPLACE FUNCTION master.trg_cc_validate_owner_type()
RETURNS trigger LANGUAGE plpgsql
    SET search_path = master, pg_temp
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM master.owner_type
        WHERE code      = NEW.owner_type
          AND tenant_id IS NULL
          AND status    = 'active'
    ) THEN
        RAISE EXCEPTION
            'commodity_classification: owner_type "%" not found in owner_type (system rows)',
            NEW.owner_type
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_cc_validate_owner_type IS
    'Cross-validates commodity_classification.owner_type against '
    'owner_type system rows (tenant_id IS NULL). '
    'Stronger than lookup-only — ensures routing contract exists.';


-- ── access_grant status-change tracker ────────────────────────────────────
-- Stamps status_changed_at/by whenever access_grant.status transitions.
-- updated_by must be set by the application layer before the UPDATE;
-- this function copies it into status_changed_by for audit consistency.
CREATE OR REPLACE FUNCTION master.trg_access_grant_status_changed()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        NEW.status_changed_at := now();
        NEW.status_changed_by := NEW.updated_by;
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_access_grant_status_changed() IS
    'Stamps status_changed_at/by when access_grant.status changes. '
    'Mirrors the pattern used by full-lifecycle Archetype A tables.';


-- =============================================================================
-- DIMENSION FRAMEWORK — trigger functions + resolve_dimension_set
-- Naming convention: master.trg_{table_abbrev}_{purpose}()
--   dt  = dimension_type
--   dv  = dimension_value
--   dsi = dimension_set_item
-- =============================================================================

-- ── master.trg_dt_deactivation_guard ──────────────────────────────────────
-- Blocks status transitions to inactive/archived when active dimension_value rows
-- still reference this type. Called: BEFORE UPDATE OF status ON dimension_type.
CREATE OR REPLACE FUNCTION master.trg_dt_deactivation_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
DECLARE
    v_ref_count bigint;
BEGIN
    IF OLD.status = 'active' AND NEW.status IN ('inactive','archived') THEN
        SELECT count(*) INTO v_ref_count
        FROM master.dimension_value dv
        WHERE dv.dimension_type_id = NEW.id
          AND dv.tenant_id         = NEW.tenant_id
          AND dv.status            = 'active';

        IF v_ref_count > 0 THEN
            RAISE EXCEPTION
                'Cannot deactivate dimension_type "%" — % active value(s) still reference it.',
                NEW.code, v_ref_count
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_dt_deactivation_guard() IS
    'Blocks deactivation/archival of dimension_type when active dimension_value rows '
    'still reference it. Fires BEFORE UPDATE OF status on master.dimension_type.';


-- ── master.trg_dv_parent_guard ────────────────────────────────────────────
-- Validates parent-child relationships: same tenant, same type, compatible company scope.
-- Called: BEFORE INSERT OR UPDATE OF parent_id, dimension_type_id, company_code_id
--         ON dimension_value.
CREATE OR REPLACE FUNCTION master.trg_dv_parent_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
DECLARE
    v_parent record;
BEGIN
    IF NEW.parent_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT tenant_id, dimension_type_id, company_code_id
    INTO v_parent
    FROM master.dimension_value
    WHERE id = NEW.parent_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Parent dimension_value % does not exist.', NEW.parent_id;
    END IF;

    IF v_parent.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
        RAISE EXCEPTION 'dimension_value parent belongs to a different tenant.';
    END IF;

    IF v_parent.dimension_type_id IS DISTINCT FROM NEW.dimension_type_id THEN
        RAISE EXCEPTION
            'dimension_value parent belongs to dimension_type %, child is %. Must match.',
            v_parent.dimension_type_id, NEW.dimension_type_id;
    END IF;

    -- Company scope compatibility:
    --   Global parent (NULL) may have global or company-scoped children.
    --   Company-scoped parent may only have children of the SAME company.
    IF v_parent.company_code_id IS NOT NULL
       AND v_parent.company_code_id IS DISTINCT FROM NEW.company_code_id THEN
        RAISE EXCEPTION
            'dimension_value: company-scoped parent (%) requires child to share the same '
            'company or be global. Child company_code_id = %.',
            v_parent.company_code_id, NEW.company_code_id;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_dv_parent_guard() IS
    'Validates dimension_value parent-child relationships: same tenant, same type, '
    'compatible company scope (global parent may have company-scoped children; '
    'company-scoped parent requires same company or global child). '
    'Fires BEFORE INSERT OR UPDATE OF parent_id on master.dimension_value.';


-- ── master.trg_dv_company_scope_guard ─────────────────────────────────────
-- Ensures company_code_id is only set when the dimension_type allows it.
-- Called: BEFORE INSERT OR UPDATE OF company_code_id ON dimension_value.
CREATE OR REPLACE FUNCTION master.trg_dv_company_scope_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
DECLARE
    v_allowed boolean;
BEGIN
    IF NEW.company_code_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT is_company_scoped_allowed INTO v_allowed
    FROM master.dimension_type
    WHERE id = NEW.dimension_type_id AND tenant_id = NEW.tenant_id;

    IF NOT v_allowed THEN
        RAISE EXCEPTION
            'dimension_type % does not allow company-scoped values. '
            'Set is_company_scoped_allowed = true on dimension_type first.',
            NEW.dimension_type_id;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_dv_company_scope_guard() IS
    'Blocks company_code_id being set on a dimension_value when the parent '
    'dimension_type has is_company_scoped_allowed = false. '
    'Fires BEFORE INSERT OR UPDATE OF company_code_id on master.dimension_value.';


-- ── master.trg_dsi_type_value_consistency ─────────────────────────────────
-- Ensures dimension_value_id belongs to the declared dimension_type_id.
-- Called: BEFORE INSERT ON dimension_set_item.
CREATE OR REPLACE FUNCTION master.trg_dsi_type_value_consistency()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
DECLARE
    v_actual_type uuid;
BEGIN
    SELECT dimension_type_id INTO v_actual_type
    FROM master.dimension_value
    WHERE id = NEW.dimension_value_id AND tenant_id = NEW.tenant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'dimension_value % not found for tenant %.',
            NEW.dimension_value_id, NEW.tenant_id;
    END IF;

    IF v_actual_type IS DISTINCT FROM NEW.dimension_type_id THEN
        RAISE EXCEPTION
            'dimension_set_item: dimension_value % belongs to type %, '
            'but set item declares type %. Must match.',
            NEW.dimension_value_id, v_actual_type, NEW.dimension_type_id;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_dsi_type_value_consistency() IS
    'Ensures each dimension_set_item''s value belongs to the declared dimension_type. '
    'Fires BEFORE INSERT on master.dimension_set_item.';


-- ── master.trg_dsi_immutable ──────────────────────────────────────────────
-- Blocks UPDATE and DELETE on dimension_set_item rows — they are write-once.
-- Called: BEFORE UPDATE ON dsi, BEFORE DELETE ON dsi.
CREATE OR REPLACE FUNCTION master.trg_dsi_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
BEGIN
    RAISE EXCEPTION
        'master.dimension_set_item is immutable — % is not permitted. '
        'Create a new dimension_set instead.',
        TG_OP
        USING ERRCODE = 'object_not_in_prerequisite_state';
END;
$$;

COMMENT ON FUNCTION master.trg_dsi_immutable() IS
    'Blocks UPDATE and DELETE on dimension_set_item. Rows are write-once. '
    'To change a dimension combination, create a new dimension_set.';


-- ── master.resolve_dimension_set ─────────────────────────────────────────────
-- Resolves or creates a dimension set from a JSONB array of {type_id, value_id} pairs.
-- Content-addressed via SHA-256 hash of the sorted signature.
-- Input MUST be sorted by type_id ascending (validated internally).
-- Race-safe: ON CONFLICT on the unique hash index + fallback SELECT.
CREATE OR REPLACE FUNCTION master.resolve_dimension_set(
    p_tenant_id  uuid,
    p_pairs      jsonb,
    p_created_by uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid
) RETURNS uuid
LANGUAGE plpgsql
SET search_path = master
AS $$
DECLARE
    v_hash      text;
    v_set_id    uuid;
    v_count     smallint;
    v_pair      jsonb;
    v_ordinal   smallint := 0;
    v_parts     text[]   := '{}';
    v_signature text;
    v_labels    text[]   := '{}';
    v_type_code text;
    v_val_code  text;
    v_prev_type text     := '';
    v_cur_type  text;
BEGIN
    -- Empty set = undimensioned (callers should use NULL dimension_set_id)
    IF p_pairs IS NULL OR jsonb_array_length(p_pairs) = 0 THEN
        RETURN NULL;
    END IF;

    v_count := jsonb_array_length(p_pairs)::smallint;

    -- Build hash input; validate sort order and uniqueness
    FOR v_pair IN SELECT * FROM jsonb_array_elements(p_pairs)
    LOOP
        v_cur_type := v_pair->>'type_id';

        IF v_cur_type = v_prev_type THEN
            RAISE EXCEPTION
                'resolve_dimension_set: duplicate dimension_type_id % in input.', v_cur_type;
        END IF;

        IF v_cur_type < v_prev_type THEN
            RAISE EXCEPTION
                'resolve_dimension_set: input not sorted by type_id — % came after %.',
                v_cur_type, v_prev_type;
        END IF;

        v_prev_type := v_cur_type;
        v_parts     := v_parts || (v_cur_type || ':' || (v_pair->>'value_id'));
    END LOOP;

    v_signature := array_to_string(v_parts, '|');
    v_hash      := encode(sha256(v_signature::bytea), 'hex');

    -- Fast path: hash lookup (most calls hit this path)
    SELECT id INTO v_set_id
    FROM master.dimension_set
    WHERE tenant_id = p_tenant_id AND set_hash = v_hash;

    IF v_set_id IS NOT NULL THEN
        RETURN v_set_id;
    END IF;

    -- Build human-readable display label
    FOR v_pair IN SELECT * FROM jsonb_array_elements(p_pairs)
    LOOP
        SELECT dt.code INTO v_type_code
        FROM master.dimension_type dt
        WHERE dt.id = (v_pair->>'type_id')::uuid AND dt.tenant_id = p_tenant_id;

        SELECT dv.code INTO v_val_code
        FROM master.dimension_value dv
        WHERE dv.id = (v_pair->>'value_id')::uuid AND dv.tenant_id = p_tenant_id;

        v_labels := v_labels
            || (COALESCE(v_type_code,'?') || ':' || COALESCE(v_val_code,'?'));
    END LOOP;

    -- Create the set (race-safe via ON CONFLICT DO NOTHING)
    INSERT INTO master.dimension_set
        (tenant_id, set_hash, signature, dimension_count, display_label, created_by)
    VALUES
        (p_tenant_id, v_hash, v_signature, v_count,
         array_to_string(v_labels, ' | '), p_created_by)
    ON CONFLICT (tenant_id, set_hash) DO NOTHING
    RETURNING id INTO v_set_id;

    -- Race condition: another transaction created the same set concurrently
    IF v_set_id IS NULL THEN
        SELECT id INTO v_set_id
        FROM master.dimension_set
        WHERE tenant_id = p_tenant_id AND set_hash = v_hash;
        RETURN v_set_id;
    END IF;

    -- Create set items
    v_ordinal := 0;
    FOR v_pair IN SELECT * FROM jsonb_array_elements(p_pairs)
    LOOP
        v_ordinal := v_ordinal + 1;
        INSERT INTO master.dimension_set_item
            (tenant_id, dimension_set_id, dimension_type_id, dimension_value_id,
             ordinal, created_by)
        VALUES
            (p_tenant_id, v_set_id,
             (v_pair->>'type_id')::uuid, (v_pair->>'value_id')::uuid,
             v_ordinal, p_created_by);
    END LOOP;

    RETURN v_set_id;
END;
$$;

COMMENT ON FUNCTION master.resolve_dimension_set IS
    'Resolves or creates a dimension set from a JSONB array of {type_id, value_id} pairs. '
    'Content-addressed deduplication via SHA-256 hash. '
    'Input MUST be sorted by type_id ascending — rejects duplicates and unsorted input. '
    'Race-safe via ON CONFLICT on the hash unique index + fallback SELECT.';


-- =============================================================================
-- OU + INTENT + CLASSIFICATION ENGINE — trigger functions
-- =============================================================================

-- ── §BI  master.trg_bi_parent_guard ───────────────────────────────────────
-- Validates: (1) parent exists, (2) same tenant, (3) same domain.
-- Called by trg_bi_parent_guard (09_triggers/003_master.sql).

CREATE OR REPLACE FUNCTION master.trg_bi_parent_guard()
RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = master, pg_temp
AS $$
DECLARE
    v_parent_tenant uuid;
    v_parent_domain text;
BEGIN
    IF NEW.parent_id IS NULL THEN RETURN NEW; END IF;

    SELECT tenant_id, domain
    INTO v_parent_tenant, v_parent_domain
    FROM master.business_intent
    WHERE id = NEW.parent_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Parent business_intent % not found.', NEW.parent_id;
    END IF;

    IF v_parent_tenant IS DISTINCT FROM NEW.tenant_id THEN
        RAISE EXCEPTION
            'Cross-tenant hierarchy not allowed: parent tenant=%, child tenant=%.',
            v_parent_tenant, NEW.tenant_id;
    END IF;

    IF v_parent_domain IS DISTINCT FROM NEW.domain THEN
        RAISE EXCEPTION
            'Domain mismatch: child domain "%" must match parent domain "%".',
            NEW.domain, v_parent_domain;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_bi_parent_guard IS
    'Parent guard for master.business_intent. Validates parent existence, '
    'same-tenant constraint, and domain consistency within the hierarchy subtree.';


-- ── §ODD  master.trg_odd_scope_guard ──────────────────────────────────────
-- Company-scope validation for company_code_dimension_default.
-- Enforces: dimension values with a non-NULL company_code_id must match
-- the company_code_id of the default row. Global values (NULL) always pass.

CREATE OR REPLACE FUNCTION master.trg_odd_scope_guard()
RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = master, pg_temp
AS $$
DECLARE
    v_val_company uuid;
BEGIN
    -- Global values (NULL company_code_id) are always compatible
    SELECT dv.company_code_id INTO v_val_company
    FROM master.dimension_value dv
    WHERE dv.id = NEW.dimension_value_id AND dv.tenant_id = NEW.tenant_id;

    IF v_val_company IS NULL THEN RETURN NEW; END IF;

    -- Company-scoped value must match the row's company_code_id
    IF v_val_company IS DISTINCT FROM NEW.company_code_id THEN
        RAISE EXCEPTION
            'Company-scoped dimension value (company %) cannot be assigned to '
            'company_code_dimension_default for company %.',
            v_val_company, NEW.company_code_id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_odd_scope_guard IS
    'Company-scope guard for master.company_code_dimension_default. '
    'Rejects dimension values whose company_code_id does not match the row''s company_code_id. '
    'Global dimension values (NULL company_code_id) are always accepted.';


-- ── §ODD  master.validate_dimension_company_scope ────────────────────────────
-- Runtime validation called by the posting engine when company_code_id is known.
-- Returns {is_valid: bool, errors: [{type_code, value_code, error}]}.

-- Drop the old 4-parameter signature (p_ou_id was unused).
DROP FUNCTION IF EXISTS master.validate_ou_dimension_company_scope(uuid, uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION master.validate_dimension_company_scope(
    p_tenant_id        uuid,
    p_dimension_set_id uuid,
    p_company_code_id  uuid
) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path = master, pg_temp
AS $$
DECLARE
    v_item   record;
    v_errors jsonb := '[]'::jsonb;
BEGIN
    FOR v_item IN
        SELECT dsi.dimension_type_id,
               dsi.dimension_value_id,
               dv.company_code_id AS val_company,
               dv.code            AS val_code,
               dt.code            AS type_code
        FROM master.dimension_set_item dsi
        JOIN master.dimension_value dv
            ON dv.id = dsi.dimension_value_id AND dv.tenant_id = p_tenant_id
        JOIN master.dimension_type dt
            ON dt.id = dsi.dimension_type_id AND dt.tenant_id = p_tenant_id
        WHERE dsi.dimension_set_id = p_dimension_set_id
          AND dsi.tenant_id = p_tenant_id
    LOOP
        IF v_item.val_company IS NOT NULL
           AND v_item.val_company IS DISTINCT FROM p_company_code_id THEN
            v_errors := v_errors || jsonb_build_object(
                'type_code',     v_item.type_code,
                'value_code',    v_item.val_code,
                'value_company', v_item.val_company,
                'txn_company',   p_company_code_id,
                'error',         format(
                    'Dimension value "%s" belongs to company %s but transaction company is %s.',
                    v_item.val_code, v_item.val_company, p_company_code_id)
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'is_valid', jsonb_array_length(v_errors) = 0,
        'errors',   v_errors
    );
END;
$$;

COMMENT ON FUNCTION master.validate_dimension_company_scope IS
    'Runtime company-scope validation for dimension sets. '
    'Called by the posting engine when company_code_id is known. '
    'Checks each dimension_value.company_code_id against the transaction company. '
    'Returns {is_valid: bool, errors: [{type_code, value_code, error}]}.';


-- ============================================================================
-- §  master.get_fx_rate
-- FX rate lookup: direct → inverse (with effective_time ordering) →
-- triangulation via configurable pivot currency (default USD).
-- Returns JSONB with: rate, method, source, effective_date, from, to.
-- Returns rate=NULL with method='NOT_FOUND' when no rate is available.
-- ============================================================================
CREATE OR REPLACE FUNCTION master.get_fx_rate(
    p_tenant_id     uuid,
    p_from          character(3),
    p_to            character(3),
    p_rate_type     text          DEFAULT 'SPOT',
    p_as_of         date          DEFAULT CURRENT_DATE,
    p_pivot_currency character(3) DEFAULT 'USD'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = master, shared, pg_temp
AS $$
DECLARE
    v   record;
    vc  record;
BEGIN
    -- Identity shortcut
    IF p_from = p_to THEN
        RETURN jsonb_build_object(
            'rate', 1.0, 'method', 'IDENTITY', 'from', p_from, 'to', p_to);
    END IF;

    -- Direct lookup
    SELECT rate, source, effective_date INTO v
    FROM master.fx_rate
    WHERE tenant_id    = p_tenant_id
      AND from_currency = p_from
      AND to_currency   = p_to
      AND rate_type     = p_rate_type
      AND effective_date <= p_as_of
      AND is_active = true
    ORDER BY effective_date DESC,
             COALESCE(effective_time, '23:59:59'::time) DESC
    LIMIT 1;
    IF v IS NOT NULL THEN
        RETURN jsonb_build_object(
            'rate', v.rate, 'method', 'DIRECT',
            'source', v.source, 'effective_date', v.effective_date,
            'from', p_from, 'to', p_to);
    END IF;

    -- Inverse lookup (ordered by effective_time to get the most recent intraday rate)
    SELECT rate, source, effective_date INTO v
    FROM master.fx_rate
    WHERE tenant_id    = p_tenant_id
      AND from_currency = p_to
      AND to_currency   = p_from
      AND rate_type     = p_rate_type
      AND effective_date <= p_as_of
      AND is_active = true
    ORDER BY effective_date DESC,
             COALESCE(effective_time, '23:59:59'::time) DESC
    LIMIT 1;
    IF v IS NOT NULL THEN
        RETURN jsonb_build_object(
            'rate', ROUND(1.0 / v.rate, 10), 'method', 'INVERSE',
            'source', v.source, 'effective_date', v.effective_date,
            'from', p_from, 'to', p_to);
    END IF;

    -- Triangulation via configurable pivot (default USD; pass EUR for eurozone tenants)
    SELECT r1.rate AS l1, r2.rate AS l2 INTO vc
    FROM master.fx_rate r1
    JOIN master.fx_rate r2
        ON  r2.tenant_id      = r1.tenant_id
        AND r2.from_currency  = p_pivot_currency
        AND r2.to_currency    = p_to
        AND r2.rate_type      = p_rate_type
        AND r2.effective_date <= p_as_of
        AND r2.is_active = true
    WHERE r1.tenant_id      = p_tenant_id
      AND r1.from_currency  = p_from
      AND r1.to_currency    = p_pivot_currency
      AND r1.rate_type      = p_rate_type
      AND r1.effective_date <= p_as_of
      AND r1.is_active = true
    ORDER BY r1.effective_date DESC,
             COALESCE(r1.effective_time, '23:59:59'::time) DESC,
             r2.effective_date DESC,
             COALESCE(r2.effective_time, '23:59:59'::time) DESC
    LIMIT 1;
    IF vc IS NOT NULL THEN
        RETURN jsonb_build_object(
            'rate', ROUND(vc.l1 * vc.l2, 10),
            'method', 'TRIANGULATION_' || p_pivot_currency,
            'pivot', p_pivot_currency, 'from', p_from, 'to', p_to);
    END IF;

    RETURN jsonb_build_object(
        'rate', NULL, 'method', 'NOT_FOUND', 'from', p_from, 'to', p_to,
        'error', format('No rate for %s→%s (%s) as of %s (pivot: %s)',
                        p_from, p_to, p_rate_type, p_as_of, p_pivot_currency));
END;
$$;

COMMENT ON FUNCTION master.get_fx_rate IS
    'FX rate lookup: direct → inverse (effective_time-ordered) → '
    'triangulation via configurable pivot currency (default USD, pass EUR for eurozone). '
    'Returns JSONB: {rate, method, source, effective_date, from, to}. '
    'rate=NULL + method=NOT_FOUND when no rate exists.';


-- =============================================================================
-- §SC-ROOT  Spend-category root-category maintenance
-- =============================================================================
-- Walks up the parent chain to find the root ancestor and sets
-- root_category_id on the current row.  On re-parenting, cascades to all
-- descendants via a single recursive UPDATE.

CREATE OR REPLACE FUNCTION master.trg_sc_maintain_root_category()
RETURNS trigger LANGUAGE plpgsql
SET search_path = master AS $$
DECLARE
    v_root_id   uuid;
    v_cursor    uuid;
    v_depth     int := 0;
    v_max_depth CONSTANT int := 50;  -- cycle guard
BEGIN
    -- Root category: no parent ⇒ root is itself
    IF NEW.parent_id IS NULL THEN
        NEW.root_category_id := NEW.id;

        -- Re-parented to become a root: cascade to all descendants
        IF TG_OP = 'UPDATE'
           AND OLD.parent_id IS DISTINCT FROM NEW.parent_id
        THEN
            WITH RECURSIVE descendants AS (
                SELECT id FROM master.spend_category
                WHERE parent_id = NEW.id AND tenant_id = NEW.tenant_id
                UNION ALL
                SELECT sc.id FROM master.spend_category sc
                INNER JOIN descendants d ON sc.parent_id = d.id
                    AND sc.tenant_id = NEW.tenant_id
            )
            UPDATE master.spend_category
            SET root_category_id = NEW.root_category_id
            WHERE id IN (SELECT id FROM descendants)
              AND tenant_id = NEW.tenant_id;
        END IF;

        RETURN NEW;
    END IF;

    -- Non-root: walk up to find root
    v_cursor := NEW.parent_id;
    LOOP
        SELECT sc.parent_id, sc.id INTO v_cursor, v_root_id
        FROM master.spend_category sc
        WHERE sc.id = v_cursor AND sc.tenant_id = NEW.tenant_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Broken parent chain: could not find category % for tenant %',
                v_cursor, NEW.tenant_id
                USING ERRCODE = 'foreign_key_violation';
        END IF;

        -- This node has no parent ⇒ it is the root
        IF v_cursor IS NULL THEN
            EXIT;  -- v_root_id holds the root's id
        END IF;

        v_depth := v_depth + 1;
        IF v_depth > v_max_depth THEN
            RAISE EXCEPTION 'Cycle or excessive depth (>%) in spend_category hierarchy for tenant %',
                v_max_depth, NEW.tenant_id
                USING ERRCODE = 'program_limit_exceeded';
        END IF;
    END LOOP;

    NEW.root_category_id := v_root_id;

    -- Re-parented under a different branch: cascade to all descendants
    IF TG_OP = 'UPDATE'
       AND OLD.parent_id IS DISTINCT FROM NEW.parent_id
    THEN
        WITH RECURSIVE descendants AS (
            SELECT id FROM master.spend_category
            WHERE parent_id = NEW.id AND tenant_id = NEW.tenant_id
            UNION ALL
            SELECT sc.id FROM master.spend_category sc
            INNER JOIN descendants d ON sc.parent_id = d.id
                AND sc.tenant_id = NEW.tenant_id
        )
        UPDATE master.spend_category
        SET root_category_id = NEW.root_category_id
        WHERE id IN (SELECT id FROM descendants)
          AND tenant_id = NEW.tenant_id;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_sc_maintain_root_category IS
    'BEFORE INSERT/UPDATE trigger — computes root_category_id by walking '
    'the parent chain to the root ancestor. On re-parenting (parent_id change), '
    'cascades the new root to all descendants via recursive CTE. '
    'Trigger is registered as UPDATE OF parent_id to prevent re-firing '
    'during the descendant cascade (which only sets root_category_id).';


-- =============================================================================
-- §P7b-FN  fn_resolve_spend_category_defaults
-- =============================================================================
-- Resolves effective defaults for a spend category within a company code.
-- Looks up company_code_spend_policy directly (one row per company code + category).
-- NULL columns fall back to spend_category base governance.
-- Returns a single composite row with all resolved values.

-- Drop old OU-hierarchy version if it exists from a prior schema revision.
DROP FUNCTION IF EXISTS master.fn_resolve_spend_category_ou_defaults(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION master.fn_resolve_spend_category_defaults(
    p_tenant_id          uuid,
    p_spend_category_id  uuid,
    p_company_code_id    uuid
)
RETURNS TABLE (
    -- Financial defaults
    resolved_gl_account_id           uuid,
    resolved_tax_group_id            uuid,
    resolved_intent_id               uuid,
    -- Asset routing
    resolved_asset_class_id          uuid,
    -- Capex screening
    resolved_capex_threshold         numeric(18,4),
    resolved_capex_currency          character(3),
    resolved_asset_tagging_required  boolean,
    -- Governance (effective)
    resolved_visibility              text,
    resolved_classification_required boolean,
    resolved_hs_required             boolean,
    resolved_is_regulated            boolean,
    -- Access control
    resolved_mapping_mode            text,
    -- Source (NULL = fell back entirely to spend_category base)
    source_company_code_id           uuid
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_row    record;
    v_found  boolean := false;
BEGIN
    -- Direct lookup: one row per company_code + category (no hierarchy walk needed).
    SELECT * INTO v_row
    FROM master.company_code_spend_policy m
    WHERE m.tenant_id = p_tenant_id
      AND m.spend_category_id = p_spend_category_id
      AND m.company_code_id = p_company_code_id
      AND m.is_active = true;

    v_found := FOUND;

    -- Merge with spend_category base defaults for NULL columns.
    RETURN QUERY
    SELECT
        v_row.default_gl_account_id,
        v_row.default_tax_group_id,
        COALESCE(v_row.default_intent_id,               sc.default_intent_id),
        v_row.asset_class_id,
        v_row.capex_screening_threshold,
        v_row.capex_screening_currency,
        v_row.is_asset_tagging_required,
        COALESCE(v_row.override_visibility,              sc.visibility),
        COALESCE(v_row.override_is_classification_required, sc.is_classification_required),
        COALESCE(v_row.override_is_hs_required,          sc.is_hs_required),
        COALESCE(v_row.override_is_regulated,            sc.is_regulated),
        COALESCE(v_row.mapping_mode, 'ALLOW'),
        CASE WHEN v_found THEN p_company_code_id ELSE NULL END
    FROM master.spend_category sc
    WHERE sc.id = p_spend_category_id AND sc.tenant_id = p_tenant_id;
END;
$$;

COMMENT ON FUNCTION master.fn_resolve_spend_category_defaults IS
    'Resolves effective operational defaults for a spend category within a company code. '
    'Looks up company_code_spend_policy directly (no hierarchy walk). '
    'Governance columns (visibility, classification_required, hs_required, is_regulated) '
    'and default_intent_id fall back to spend_category base if no company-code policy exists. '
    'source_company_code_id is NULL when falling back entirely to base defaults.';


-- ============================================================================
-- BANK ENGINE — Guard Functions
-- ============================================================================

-- Guard: bank_account_house_config must reference a bank_account_link
-- where owner_type = 'company_code'. Same pattern as trg_guard_contact_email_channel.
CREATE OR REPLACE FUNCTION master.trg_guard_house_config_owner()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
DECLARE
    v_owner_type text;
BEGIN
    SELECT owner_type INTO v_owner_type
    FROM master.bank_account_link
    WHERE tenant_id = NEW.tenant_id AND id = NEW.bank_account_link_id;

    IF v_owner_type IS NULL THEN
        RAISE EXCEPTION
            'bank_account_house_config: bank_account_link_id (%) not found for tenant %',
            NEW.bank_account_link_id, NEW.tenant_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_owner_type <> 'company_code' THEN
        RAISE EXCEPTION
            'bank_account_house_config: bank_account_link_id (%) has owner_type "%" — '
            'must be "company_code". House config only applies to company-owned accounts.',
            NEW.bank_account_link_id, v_owner_type
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_guard_house_config_owner IS
    'Validates that bank_account_house_config references a bank_account_link '
    'with owner_type = ''company_code''. Same pattern as trg_guard_contact_email_channel.';

-- Guard: GL postability for house config.
CREATE OR REPLACE FUNCTION master.trg_house_config_gl_postable()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
DECLARE
    v_company_code_id uuid;
    v_populated       boolean;
BEGIN
    SELECT owner_id INTO v_company_code_id
    FROM master.bank_account_link
    WHERE tenant_id = NEW.tenant_id AND id = NEW.bank_account_link_id;

    IF v_company_code_id IS NULL THEN
        RAISE EXCEPTION
            'bank_account_house_config: parent bank_account_link not found'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    SELECT c.relispopulated INTO v_populated
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'master'
      AND c.relname = 'mv_company_postable_account'
      AND c.relkind = 'm';

    IF v_populated IS NULL OR v_populated = false THEN
        RAISE WARNING
            'bank_account_house_config: mv_company_postable_account not yet populated — '
            'skipping GL postability check for gl_account_id (%). '
            'Run REFRESH MATERIALIZED VIEW master.mv_company_postable_account.',
            NEW.gl_account_id;
        RETURN NEW;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM master.mv_company_postable_account mpa
        WHERE mpa.tenant_id       = NEW.tenant_id
          AND mpa.company_code_id = v_company_code_id
          AND mpa.gl_account_id   = NEW.gl_account_id
    ) THEN
        RAISE EXCEPTION
            'bank_account_house_config: gl_account_id (%) is not postable for '
            'company_code_id (%). Check mv_company_postable_account.',
            NEW.gl_account_id, v_company_code_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_house_config_gl_postable IS
    'Validates GL postability for house-bank config. Resolves company_code_id '
    'from parent bank_account_link.owner_id. Gracefully skips when '
    'mv_company_postable_account has not been refreshed yet.';

-- Guard: default disbursement/collection uniqueness (temporally aware).
CREATE OR REPLACE FUNCTION master.trg_house_config_default_unique()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
DECLARE
    v_company_id    uuid;
    v_currency      character(3);
    v_eff_from      date;
    v_eff_until     date;
    v_conflict_id   uuid;
BEGIN
    IF NOT NEW.is_default_disbursement AND NOT NEW.is_default_collection THEN
        RETURN NEW;
    END IF;

    SELECT bal.owner_id, ba.currency_code, bal.effective_from, bal.effective_until
    INTO v_company_id, v_currency, v_eff_from, v_eff_until
    FROM master.bank_account_link bal
    JOIN master.bank_account ba ON ba.tenant_id = bal.tenant_id AND ba.id = bal.bank_account_id
    WHERE bal.tenant_id = NEW.tenant_id AND bal.id = NEW.bank_account_link_id;

    IF NEW.is_default_disbursement THEN
        SELECT hc.id INTO v_conflict_id
        FROM master.bank_account_house_config hc
        JOIN master.bank_account_link bal2 ON bal2.tenant_id = hc.tenant_id AND bal2.id = hc.bank_account_link_id
        JOIN master.bank_account ba2 ON ba2.tenant_id = bal2.tenant_id AND ba2.id = bal2.bank_account_id
        WHERE hc.tenant_id = NEW.tenant_id
          AND hc.id != NEW.id
          AND hc.is_default_disbursement = true
          AND hc.status = 'active'
          AND bal2.owner_id = v_company_id
          AND ba2.currency_code = v_currency
          AND daterange(bal2.effective_from, COALESCE(bal2.effective_until, '9999-12-31'::date), '[)')
              &&
              daterange(v_eff_from, COALESCE(v_eff_until, '9999-12-31'::date), '[)')
        LIMIT 1;

        IF v_conflict_id IS NOT NULL THEN
            RAISE EXCEPTION
                'bank_account_house_config: another config (%) is already the default '
                'disbursement account for company_code (%) + currency (%) in an overlapping period',
                v_conflict_id, v_company_id, v_currency
                USING ERRCODE = 'unique_violation';
        END IF;
    END IF;

    IF NEW.is_default_collection THEN
        SELECT hc.id INTO v_conflict_id
        FROM master.bank_account_house_config hc
        JOIN master.bank_account_link bal2 ON bal2.tenant_id = hc.tenant_id AND bal2.id = hc.bank_account_link_id
        JOIN master.bank_account ba2 ON ba2.tenant_id = bal2.tenant_id AND ba2.id = bal2.bank_account_id
        WHERE hc.tenant_id = NEW.tenant_id
          AND hc.id != NEW.id
          AND hc.is_default_collection = true
          AND hc.status = 'active'
          AND bal2.owner_id = v_company_id
          AND ba2.currency_code = v_currency
          AND daterange(bal2.effective_from, COALESCE(bal2.effective_until, '9999-12-31'::date), '[)')
              &&
              daterange(v_eff_from, COALESCE(v_eff_until, '9999-12-31'::date), '[)')
        LIMIT 1;

        IF v_conflict_id IS NOT NULL THEN
            RAISE EXCEPTION
                'bank_account_house_config: another config (%) is already the default '
                'collection account for company_code (%) + currency (%) in an overlapping period',
                v_conflict_id, v_company_id, v_currency
                USING ERRCODE = 'unique_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_house_config_default_unique IS
    'Enforces one default disbursement and one default collection account per '
    '(company_code + currency) within overlapping effective periods. '
    'Trigger-based because currency and effective dates live on joined tables.';

-- Guard: re-validate default house configs when parent link dates change.
CREATE OR REPLACE FUNCTION master.trg_bal_recheck_default_on_date_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
DECLARE
    v_hc           RECORD;
    v_company_id   uuid;
    v_currency     character(3);
    v_conflict_id  uuid;
BEGIN
    IF NEW.effective_from IS NOT DISTINCT FROM OLD.effective_from
       AND NEW.effective_until IS NOT DISTINCT FROM OLD.effective_until THEN
        RETURN NEW;
    END IF;

    SELECT hc.id, hc.is_default_disbursement, hc.is_default_collection
    INTO v_hc
    FROM master.bank_account_house_config hc
    WHERE hc.tenant_id = NEW.tenant_id
      AND hc.bank_account_link_id = NEW.id
      AND hc.status = 'active'
      AND (hc.is_default_disbursement OR hc.is_default_collection);

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    SELECT NEW.owner_id, ba.currency_code
    INTO v_company_id, v_currency
    FROM master.bank_account ba
    WHERE ba.tenant_id = NEW.tenant_id AND ba.id = NEW.bank_account_id;

    IF v_hc.is_default_disbursement THEN
        SELECT hc2.id INTO v_conflict_id
        FROM master.bank_account_house_config hc2
        JOIN master.bank_account_link bal2 ON bal2.tenant_id = hc2.tenant_id AND bal2.id = hc2.bank_account_link_id
        JOIN master.bank_account ba2 ON ba2.tenant_id = bal2.tenant_id AND ba2.id = bal2.bank_account_id
        WHERE hc2.tenant_id = NEW.tenant_id
          AND hc2.id != v_hc.id
          AND hc2.is_default_disbursement = true
          AND hc2.status = 'active'
          AND bal2.owner_id = v_company_id
          AND ba2.currency_code = v_currency
          AND daterange(bal2.effective_from, COALESCE(bal2.effective_until, '9999-12-31'::date), '[)')
              &&
              daterange(NEW.effective_from, COALESCE(NEW.effective_until, '9999-12-31'::date), '[)')
        LIMIT 1;

        IF v_conflict_id IS NOT NULL THEN
            RAISE EXCEPTION
                'bank_account_link date change would create overlapping default '
                'disbursement for company_code (%) + currency (%). Conflicting config: %',
                v_company_id, v_currency, v_conflict_id
                USING ERRCODE = 'unique_violation';
        END IF;
    END IF;

    IF v_hc.is_default_collection THEN
        SELECT hc2.id INTO v_conflict_id
        FROM master.bank_account_house_config hc2
        JOIN master.bank_account_link bal2 ON bal2.tenant_id = hc2.tenant_id AND bal2.id = hc2.bank_account_link_id
        JOIN master.bank_account ba2 ON ba2.tenant_id = bal2.tenant_id AND ba2.id = bal2.bank_account_id
        WHERE hc2.tenant_id = NEW.tenant_id
          AND hc2.id != v_hc.id
          AND hc2.is_default_collection = true
          AND hc2.status = 'active'
          AND bal2.owner_id = v_company_id
          AND ba2.currency_code = v_currency
          AND daterange(bal2.effective_from, COALESCE(bal2.effective_until, '9999-12-31'::date), '[)')
              &&
              daterange(NEW.effective_from, COALESCE(NEW.effective_until, '9999-12-31'::date), '[)')
        LIMIT 1;

        IF v_conflict_id IS NOT NULL THEN
            RAISE EXCEPTION
                'bank_account_link date change would create overlapping default '
                'collection for company_code (%) + currency (%). Conflicting config: %',
                v_company_id, v_currency, v_conflict_id
                USING ERRCODE = 'unique_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_bal_recheck_default_on_date_change IS
    'Companion to fn_trg_house_config_default_unique. Fires when '
    'bank_account_link.effective_from or effective_until is updated. '
    'Re-validates temporal overlap for any linked house_config with default flags.';

-- Guard: block owner_type/owner_id changes on bank_account_link when a
-- linked bank_account_house_config exists.
CREATE OR REPLACE FUNCTION master.trg_bal_guard_owner_change_with_config()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
BEGIN
    IF NEW.owner_type IS NOT DISTINCT FROM OLD.owner_type
       AND NEW.owner_id IS NOT DISTINCT FROM OLD.owner_id THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1 FROM master.bank_account_house_config
        WHERE tenant_id = NEW.tenant_id
          AND bank_account_link_id = NEW.id
    ) THEN
        RAISE EXCEPTION
            'bank_account_link: cannot change owner_type/owner_id on link (%) '
            'because a bank_account_house_config is attached. '
            'Delete the house config first, then reassign the link.',
            NEW.id
            USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_bal_guard_owner_change_with_config IS
    'Blocks owner_type/owner_id changes on bank_account_link when ANY '
    'bank_account_house_config is attached (regardless of config status).';


-- ############################################################################
--  PROFILE EXTENSION — Trigger Functions
-- ############################################################################

-- ── tenant_profile: normalize weekend_days to sorted unique array ──────────
CREATE OR REPLACE FUNCTION master.trg_normalize_weekend_days()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
BEGIN
    IF NEW.weekend_days IS NOT NULL THEN
        SELECT ARRAY(
            SELECT DISTINCT unnest(NEW.weekend_days) ORDER BY 1
        ) INTO NEW.weekend_days;
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_normalize_weekend_days IS
    'Normalizes weekend_days to a sorted, deduplicated array. '
    'Prevents {5,5} or {6,0} — always stored as sorted unique.';


-- ── company_code_customer_profile: default_receipt_method_id direction guard ─────
CREATE OR REPLACE FUNCTION master.trg_ccp_validate_receipt_method_direction()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
DECLARE
    v_direction text;
BEGIN
    IF NEW.default_receipt_method_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT direction INTO v_direction
    FROM master.payment_method
    WHERE tenant_id = NEW.tenant_id AND id = NEW.default_receipt_method_id;

    IF v_direction IS NULL THEN
        RAISE EXCEPTION
            'company_code_customer_profile: default_receipt_method_id (%) not found',
            NEW.default_receipt_method_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF lower(v_direction) NOT IN ('inbound', 'both') THEN
        RAISE EXCEPTION
            'company_code_customer_profile: default_receipt_method_id (%) has direction "%" '
            '— must be INBOUND or BOTH for receipt/collection methods',
            NEW.default_receipt_method_id, v_direction
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_ccp_validate_receipt_method_direction IS
    'Validates that default_receipt_method_id on company_code_customer_profile '
    'references a payment_method with direction INBOUND or BOTH.';


-- ── company_code_supplier_profile: payment_method_id direction guard ────────────
CREATE OR REPLACE FUNCTION master.trg_scp_validate_payment_method_direction()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
DECLARE
    v_direction text;
BEGIN
    IF NEW.payment_method_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT direction INTO v_direction
    FROM master.payment_method
    WHERE tenant_id = NEW.tenant_id AND id = NEW.payment_method_id;

    IF v_direction IS NULL THEN
        RAISE EXCEPTION
            'company_code_supplier_profile: payment_method_id (%) not found',
            NEW.payment_method_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF lower(v_direction) NOT IN ('outbound', 'both') THEN
        RAISE EXCEPTION
            'company_code_supplier_profile: payment_method_id (%) has direction "%" '
            '— must be OUTBOUND or BOTH for supplier disbursement methods',
            NEW.payment_method_id, v_direction
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_scp_validate_payment_method_direction IS
    'Validates that payment_method_id on company_code_supplier_profile '
    'references a payment_method with direction OUTBOUND or BOTH.';


-- ── company_code_supplier_profile: preferred_remittance_bank_link_id guard ──────
CREATE OR REPLACE FUNCTION master.trg_scp_validate_remittance_bank_link()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
DECLARE
    v_link_owner_type  text;
    v_link_owner_id    uuid;
    v_link_company_id  uuid;
BEGIN
    IF NEW.preferred_remittance_bank_link_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT owner_type, owner_id, company_code_id
    INTO v_link_owner_type, v_link_owner_id, v_link_company_id
    FROM master.bank_account_link
    WHERE tenant_id = NEW.tenant_id AND id = NEW.preferred_remittance_bank_link_id;

    IF v_link_owner_type IS NULL THEN
        RAISE EXCEPTION
            'company_code_supplier_profile: preferred_remittance_bank_link_id (%) not found',
            NEW.preferred_remittance_bank_link_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- Owner must be the same supplier
    IF v_link_owner_type <> 'supplier' THEN
        RAISE EXCEPTION
            'company_code_supplier_profile: bank_account_link (%) has owner_type "%" '
            '— must be "supplier" for supplier remittance',
            NEW.preferred_remittance_bank_link_id, v_link_owner_type
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_link_owner_id <> NEW.supplier_id THEN
        RAISE EXCEPTION
            'company_code_supplier_profile: bank_account_link (%) belongs to supplier (%), '
            'but this profile is for supplier (%). Must match.',
            NEW.preferred_remittance_bank_link_id, v_link_owner_id, NEW.supplier_id
            USING ERRCODE = 'check_violation';
    END IF;

    -- Company scope: link must be tenant-wide (NULL) or match this company
    IF v_link_company_id IS NOT NULL AND v_link_company_id <> NEW.company_code_id THEN
        RAISE EXCEPTION
            'company_code_supplier_profile: bank_account_link (%) is scoped to company (%), '
            'but this profile is for company (%). Must match or be tenant-wide.',
            NEW.preferred_remittance_bank_link_id, v_link_company_id, NEW.company_code_id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_scp_validate_remittance_bank_link IS
    'Validates that preferred_remittance_bank_link_id on company_code_supplier_profile '
    'references a bank_account_link owned by the same supplier and scoped to '
    'the same or tenant-wide company.';


-- ── principal_identity_binding: service_client_id guard ────────────────────────
CREATE OR REPLACE FUNCTION master.trg_guard_auth_binding_service_client()
RETURNS trigger LANGUAGE plpgsql SET search_path = master AS $$
DECLARE
    v_is_service boolean;
BEGIN
    IF NEW.service_client_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT is_service_account INTO v_is_service
    FROM master.principal
    WHERE tenant_id = NEW.tenant_id AND id = NEW.principal_id;

    IF v_is_service IS NULL THEN
        RAISE EXCEPTION 'principal_identity_binding: principal_id (%) not found', NEW.principal_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NOT v_is_service THEN
        RAISE EXCEPTION
            'principal_identity_binding: service_client_id is set but principal (%) '
            'is not a service account', NEW.principal_id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_guard_auth_binding_service_client IS
    'Validates service_client_id is only set on service-account principals. '
    'Trigger-only enforcement — no inline CHECK.';


-- ── Phase 4 migration function: keycloak_* → principal_identity_binding ────────
CREATE OR REPLACE FUNCTION master.fn_migrate_principal_identity_bindings(
    p_dry_run boolean DEFAULT true
)
RETURNS TABLE (
    migrated_count  bigint,
    skipped_count   bigint,
    error_count     bigint
)
LANGUAGE plpgsql
SET search_path = master
AS $$
DECLARE
    v_migrated bigint := 0;
    v_skipped  bigint := 0;
BEGIN
    IF p_dry_run THEN
        SELECT count(*) INTO v_migrated
        FROM master.principal_profile pp
        WHERE pp.keycloak_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM master.principal_identity_binding pab
              WHERE pab.tenant_id = pp.tenant_id
                AND pab.principal_id = pp.principal_id
                AND pab.provider_code = 'keycloak'
          );

        SELECT count(*) INTO v_skipped
        FROM master.principal_profile pp
        WHERE pp.keycloak_id IS NOT NULL
          AND EXISTS (
              SELECT 1 FROM master.principal_identity_binding pab
              WHERE pab.tenant_id = pp.tenant_id
                AND pab.principal_id = pp.principal_id
                AND pab.provider_code = 'keycloak'
          );

        RETURN QUERY SELECT v_migrated, v_skipped, 0::bigint;
        RETURN;
    END IF;

    WITH inserted AS (
        INSERT INTO master.principal_identity_binding (
            tenant_id, principal_id, provider_code, subject_id,
            username, federation_link, created_at_millis, not_before,
            service_client_id, required_actions,
            synced_at, sync_status,
            idp_snapshot, provider_attributes,
            created_by
        )
        SELECT
            pp.tenant_id,
            pp.principal_id,
            'keycloak',
            pp.keycloak_id,
            pp.keycloak_username,
            pp.keycloak_federation_link,
            pp.keycloak_created_at_millis,
            pp.keycloak_not_before,
            pp.keycloak_service_client_id,
            pp.keycloak_required_actions,
            pp.keycloak_synced_at,
            pp.keycloak_sync_status,
            pp.idp_snapshot,
            pp.attributes,
            pp.created_by
        FROM master.principal_profile pp
        WHERE pp.keycloak_id IS NOT NULL
        ON CONFLICT (tenant_id, principal_id, provider_code) DO NOTHING
        RETURNING 1
    )
    SELECT count(*) INTO v_migrated FROM inserted;

    RETURN QUERY SELECT v_migrated, 0::bigint, 0::bigint;
END;
$$;

COMMENT ON FUNCTION master.fn_migrate_principal_identity_bindings IS
    'Phase 4 migration: copies keycloak_* and idp_snapshot from principal_profile '
    'into principal_identity_binding. Pass p_dry_run=true for impact analysis.';


-- ============================================================================
-- UI principal functions (principal_ui_profile, saved_view, dashboard)
-- ============================================================================
-- ════════════════════════════════════════════════════════════════════════════
-- fn_resolve_principal_ui
-- ════════════════════════════════════════════════════════════════════════════
-- Returns effective UI settings for a single principal, applying the cascade:
--   platform defaults → tenant_profile → principal_ui_profile
-- Working-context defaults (company, OU) fall back to principal_profile.
--
-- Security gates (SECURITY DEFINER, owned by athyperadmin):
--   1. p_tenant_id must match shared.current_tenant_id() (raises if GUC unset).
--   2. Caller must be the target principal OR a member of athyperadmin.
--      Uses session_user (not current_user) because inside SECURITY DEFINER
--      current_user is the function owner, not the original caller.
-- Returns NULL if the principal is not found or is inactive.

CREATE OR REPLACE FUNCTION master.fn_resolve_principal_ui(
    p_tenant_id     uuid,
    p_principal_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
PARALLEL RESTRICTED          -- reads GUCs (session_user, current_setting); safe in
                             -- parallel workers but RESTRICTED matches project convention
                             -- for any function that touches session context.
SECURITY DEFINER
SET search_path = master, shared, pg_catalog
AS $$
DECLARE
    v_session_tenant    uuid;
    v_session_principal uuid;
    v_is_admin          boolean;
BEGIN
    -- ── Gate 1: tenant isolation ───────────────────────────────────────────
    -- current_tenant_id() raises if GUC is unset — intentional.
    v_session_tenant := shared.current_tenant_id();

    IF v_session_tenant IS DISTINCT FROM p_tenant_id THEN
        RAISE EXCEPTION
            'fn_resolve_principal_ui: session tenant (%) does not match requested tenant (%)',
            v_session_tenant, p_tenant_id
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- ── Gate 2: caller identity ────────────────────────────────────────────
    -- CRITICAL: must use session_user, not current_user.
    -- Inside SECURITY DEFINER, current_user is the function owner (definer),
    -- not the caller. session_user is the original login role and is unaffected
    -- by SECURITY DEFINER context.
    v_is_admin := pg_has_role(session_user, 'athyperadmin', 'MEMBER');

    IF NOT v_is_admin THEN
        v_session_principal := nullif(current_setting('app.current_principal_id', true), '')::uuid;

        IF v_session_principal IS NULL THEN
            RAISE EXCEPTION
                'fn_resolve_principal_ui: app.current_principal_id is not set'
                USING ERRCODE = 'insufficient_privilege';
        END IF;

        IF v_session_principal IS DISTINCT FROM p_principal_id THEN
            RAISE EXCEPTION
                'fn_resolve_principal_ui: session principal (%) cannot resolve another principal (%)',
                v_session_principal, p_principal_id
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    END IF;

    -- ── Resolution query ───────────────────────────────────────────────────
    RETURN (
        SELECT jsonb_build_object(
            'principal_id',            p.id,
            'tenant_id',               p.tenant_id,

            -- Locale
            'locale_code',             COALESCE(pui.locale_code,   tp.locale_code,   'en'),
            'language_code',           COALESCE(pui.language_code, tp.language_code,  'en'),
            'timezone_code',           COALESCE(pui.timezone_code, tp.timezone_code,  'UTC'),
            'date_format',             COALESCE(pui.date_format,   tp.date_format,   '%Y-%m-%d'),
            'number_format',           COALESCE(pui.number_format, tp.number_format),
            'week_start',              COALESCE(pui.week_start,    tp.week_start,    1),

            -- Appearance
            'appearance_mode',         COALESCE(pui.appearance_mode, 'system'),
            'density_code',            COALESCE(pui.density_code,    'comfortable'),

            -- Navigation
            'home_workspace_code',     pui.home_workspace_code,
            'home_module_code',        pui.home_module_code,

            -- Working-context defaults
            'default_company_code_id', COALESCE(pui.default_company_code_id, pp.default_company_code_id),
            'default_book_id',         pui.default_book_id,
            'default_dashboard_id',    pui.default_dashboard_id
        )
        FROM master.principal p
        LEFT JOIN master.principal_profile      pp  ON pp.principal_id = p.id AND pp.tenant_id = p.tenant_id
        LEFT JOIN master.principal_ui_profile   pui ON pui.principal_id = p.id AND pui.tenant_id = p.tenant_id
        LEFT JOIN master.tenant_profile         tp  ON tp.tenant_id = p.tenant_id
        WHERE p.id        = p_principal_id
          AND p.tenant_id = p_tenant_id
          AND p.status    = 'active'
    );
END;
$$;

COMMENT ON FUNCTION master.fn_resolve_principal_ui IS
    'Returns effective UI settings for a single principal as JSONB. '
    'Applies resolution cascade: platform defaults → tenant_profile → principal_ui_profile. '
    'Working-context defaults fall back to principal_profile (HR/operational). '
    'SECURITY DEFINER — owned by athyperadmin (see 12_function_security). '
    'Gates: (1) p_tenant_id must match session tenant (current_tenant_id()); '
    '        (2) caller must be the target principal or athyperadmin. '
    'Admin check uses session_user (not current_user) — inside SECURITY DEFINER '
    'current_user resolves to the function owner, not the caller. '
    'Returns NULL if principal not found or inactive.';


-- ════════════════════════════════════════════════════════════════════════════
-- fn_set_principal_ui_preference
-- ════════════════════════════════════════════════════════════════════════════
-- Upsert a single preference key for a principal.  No admin bypass on the
-- write path — preferences may only be set by the owning principal.
-- Admin-initiated preference provisioning must use direct INSERT with the
-- system principal (00000000-…-0000) as the session principal.
--
-- ⚠  Requires the unique index on principal_ui_preference to use
--    NULLS NOT DISTINCT (or a sentinel value) for NULL surface_code.
--    See file-header note.

CREATE OR REPLACE FUNCTION master.fn_set_principal_ui_preference(
    p_tenant_id         uuid,
    p_principal_id      uuid,
    p_preference_code   text,
    p_surface_code      text,          -- NULL for global preferences
    p_preference_value  jsonb
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = master, shared, pg_catalog
AS $$
DECLARE
    v_session_tenant    uuid;
    v_session_principal uuid;
    v_id                uuid;
BEGIN
    -- ── Gate 1: tenant isolation ───────────────────────────────────────────
    v_session_tenant := shared.current_tenant_id();

    IF v_session_tenant IS DISTINCT FROM p_tenant_id THEN
        RAISE EXCEPTION
            'fn_set_principal_ui_preference: session tenant (%) does not match requested tenant (%)',
            v_session_tenant, p_tenant_id
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- ── Gate 2: principal identity ─────────────────────────────────────────
    -- No admin bypass: the write path is owner-only.
    -- Admin-initiated provisioning must set app.current_principal_id to the
    -- system principal (00000000-0000-0000-0000-000000000000) before calling.
    v_session_principal := nullif(current_setting('app.current_principal_id', true), '')::uuid;

    IF v_session_principal IS NULL THEN
        RAISE EXCEPTION
            'fn_set_principal_ui_preference: app.current_principal_id is not set'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF v_session_principal IS DISTINCT FROM p_principal_id THEN
        RAISE EXCEPTION
            'fn_set_principal_ui_preference: session principal (%) does not match target (%)',
            v_session_principal, p_principal_id
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- ── Upsert ─────────────────────────────────────────────────────────────
    -- created_by is stamped to v_session_principal here; trg_puipref_enforce_created_by
    -- sees current_user = athyperadmin (SECURITY DEFINER) and trusts the pre-stamped value.
    -- updated_at / updated_by on the UPDATE path are stamped by trg_puipref_updated_at
    -- (defined in 09_triggers/003b_master_ui_principal.sql).
    INSERT INTO master.principal_ui_preference (
        tenant_id, principal_id, preference_code, surface_code,
        preference_value, created_by
    ) VALUES (
        p_tenant_id, p_principal_id, p_preference_code, p_surface_code,
        p_preference_value, v_session_principal
    )
    ON CONFLICT (tenant_id, principal_id, preference_code, surface_code)
    DO UPDATE SET
        preference_value = EXCLUDED.preference_value
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

COMMENT ON FUNCTION master.fn_set_principal_ui_preference IS
    'Upsert a principal UI preference row. INSERT ON CONFLICT UPDATE. '
    'SECURITY DEFINER — owned by athyperadmin (see 12_function_security). '
    'Gates: (1) p_tenant_id must match session tenant; '
    '        (2) session principal must match target principal (no admin bypass). '
    'Admin-initiated provisioning: set app.current_principal_id = system principal first. '
    'updated_at/updated_by stamped by trg_puipref_updated_at on UPDATE path. '
    'Lookup validation on preference_code/surface_code enforced by row triggers. '
    '⚠  Requires NULLS NOT DISTINCT unique index on (tenant_id, principal_id, '
    'preference_code, surface_code) for NULL surface_code upserts to work correctly.';


-- ════════════════════════════════════════════════════════════════════════════
-- trg_enforce_created_by  (trigger function)
-- ════════════════════════════════════════════════════════════════════════════
-- INSERT: stamps created_by from app.current_principal_id GUC, overwriting
--         whatever the caller passed. athyperadmin bypass trusts an explicit
--         value (seed/migration) or falls back to the system principal.
-- UPDATE: blocks any change to created_by (immutability).
--
-- Security note — current_user vs session_user:
--   This is a plain trigger function (not SECURITY DEFINER). When invoked
--   from inside a SECURITY DEFINER caller (e.g. fn_set_principal_ui_preference),
--   current_user is the definer role (athyperadmin). That is safe: the caller
--   has already validated the session and stamped created_by correctly. The
--   admin branch merely trusts the pre-stamped value rather than overwriting it.
--
-- Attach to tables where created_by has security weight (shared-scope update RLS
-- grants edit rights to the row creator — spoofing it would grant unintended access).

CREATE OR REPLACE FUNCTION master.trg_enforce_created_by()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master, shared, pg_catalog
AS $$
DECLARE
    v_session_principal uuid;
BEGIN
    -- ── UPDATE: created_by is immutable ────────────────────────────────────
    IF TG_OP = 'UPDATE' THEN
        IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
            RAISE EXCEPTION '%.%: created_by is immutable after insert (cannot change "%" to "%")',
                TG_TABLE_SCHEMA, TG_TABLE_NAME, OLD.created_by, NEW.created_by
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    -- ── INSERT: stamp created_by from session ──────────────────────────────
    -- Admin bypass: athyperadmin may set created_by explicitly (seed/migration).
    -- current_user is intentional here: when called from within a SECURITY DEFINER
    -- function the definer role is visible as current_user, which is the admin —
    -- the caller has already stamped created_by to the correct session principal.
    IF pg_has_role(current_user, 'athyperadmin', 'MEMBER') THEN
        IF NEW.created_by IS NULL THEN
            -- Fallback: system principal for admin-initiated inserts without an explicit value.
            NEW.created_by := '00000000-0000-0000-0000-000000000000'::uuid;
        END IF;
        RETURN NEW;
    END IF;

    -- Regular sessions: app.current_principal_id must be set.
    v_session_principal := nullif(current_setting('app.current_principal_id', true), '')::uuid;

    IF v_session_principal IS NULL THEN
        RAISE EXCEPTION '%.%: cannot INSERT without app.current_principal_id session context',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Overwrite whatever the caller passed — session principal is canonical.
    NEW.created_by := v_session_principal;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_enforce_created_by IS
    'Enforces created_by = session principal on INSERT; immutability on UPDATE. '
    'INSERT: overwrites created_by with app.current_principal_id GUC. '
    'Raises if GUC unset, unless current_user is athyperadmin (may set explicitly). '
    'UPDATE: raises check_violation on any change to created_by. '
    'Prevents created_by spoofing on tables where shared-scope update RLS '
    'grants edit rights to the row creator. '
    'Attach via 09_triggers/003b_master_ui_principal.sql.';


-- ============================================================================
-- UI principal supplementary (scope/owner immutability, deleted_at sync)
-- ============================================================================
-- ════════════════════════════════════════════════════════════════════════════
-- §1  trg_guard_scope_owner_immutable
-- ════════════════════════════════════════════════════════════════════════════
-- Blocks any UPDATE that changes scope or owner_principal_id after initial INSERT.
-- Scope and owner are assigned at creation time and must never change because:
--   • scope is used in RLS SELECT policies — a mid-flight change would
--     silently widen or narrow visibility for other principals.
--   • owner_principal_id is used in RLS UPDATE/DELETE policies — a change
--     would transfer write-authority without an explicit ownership-transfer workflow.
--
-- Fires BEFORE UPDATE only (INSERT path does not apply).
-- Attach to: master.saved_view, master.dashboard.

CREATE OR REPLACE FUNCTION master.trg_guard_scope_owner_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master
AS $$
BEGIN
    IF NEW.scope IS DISTINCT FROM OLD.scope THEN
        RAISE EXCEPTION '%.%: scope is immutable after insert (cannot change "%" to "%")',
            TG_TABLE_SCHEMA, TG_TABLE_NAME, OLD.scope, NEW.scope
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.owner_principal_id IS DISTINCT FROM OLD.owner_principal_id THEN
        RAISE EXCEPTION '%.%: owner_principal_id is immutable after insert (cannot change "%" to "%")',
            TG_TABLE_SCHEMA, TG_TABLE_NAME, OLD.owner_principal_id, NEW.owner_principal_id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_guard_scope_owner_immutable IS
    'Blocks UPDATE changes to scope and owner_principal_id on saved_view and dashboard. '
    'scope is immutable: mid-flight changes would silently alter RLS visibility. '
    'owner_principal_id is immutable: changes would transfer write-authority without a workflow. '
    'To change scope/owner: archive the old artifact and create a new one. '
    'Fires BEFORE UPDATE on master.saved_view and master.dashboard.';


-- ════════════════════════════════════════════════════════════════════════════
-- §2  trg_sync_deleted_at_with_status
-- ════════════════════════════════════════════════════════════════════════════
-- Synchronises deleted_at with the status lifecycle column.
-- Rules:
--   status → 'archived' : stamps deleted_at = now() if not already set.
--   status → 'active'   : clears deleted_at (un-archive / restore).
--   direct deleted_at change without status change : blocked (check_violation).
--
-- Rationale: deleted_at must track status, not be set arbitrarily.
-- Application code must change status — this trigger follows automatically.
--
-- Fires BEFORE UPDATE only.
-- Attach to: master.saved_view, master.dashboard.

CREATE OR REPLACE FUNCTION master.trg_sync_deleted_at_with_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = master
AS $$
BEGIN
    -- Status changed: sync deleted_at accordingly
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NEW.status = 'archived' AND NEW.deleted_at IS NULL THEN
            NEW.deleted_at := now();
        ELSIF NEW.status = 'active' THEN
            NEW.deleted_at := NULL;
        END IF;
        RETURN NEW;
    END IF;

    -- Status unchanged but deleted_at was directly modified: block it
    IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
        RAISE EXCEPTION
            '%.%: deleted_at cannot be set directly — change status to ''archived'' instead',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_sync_deleted_at_with_status IS
    'Synchronises deleted_at with status lifecycle for saved_view and dashboard. '
    'status → ''archived'': stamps deleted_at = now(). '
    'status → ''active'': clears deleted_at (restore / un-archive). '
    'Blocks direct deleted_at manipulation when status is unchanged. '
    'Fires BEFORE UPDATE on master.saved_view and master.dashboard.';


-- ============================================================================
-- Finance master functions (fn_resolve_scope_companies)
-- ============================================================================
-- =============================================================================
-- master.fn_resolve_scope_companies
-- =============================================================================
-- Resolves a FinanceScope (company | legal_entity | group) to the set of
-- company_code rows that should be included in a financial query.
--
-- p_scope_type:
--   'company'       -> single company_code by code value
--   'legal_entity'  -> all active companies under that legal_entity.id
--   'group'         -> all active companies in the tenant (recursive tree)
--
-- Returns TABLE(company_code_id uuid, company_code text)
-- so callers can use: WHERE cc.id = ANY(SELECT company_code_id FROM ...)
-- =============================================================================

CREATE OR REPLACE FUNCTION master.fn_resolve_scope_companies(
  p_tenant_id  uuid,
  p_scope_type text,
  p_scope_id   text
) RETURNS TABLE (company_code_id uuid, company_code text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = master, pg_catalog
AS $$
BEGIN
  CASE p_scope_type

    WHEN 'company' THEN
      RETURN QUERY
        SELECT cc.id, cc.code
        FROM master.company_code cc
        WHERE cc.tenant_id = p_tenant_id
          AND cc.code      = p_scope_id
          AND cc.is_active = true;

    WHEN 'legal_entity' THEN
      RETURN QUERY
        SELECT cc.id, cc.code
        FROM master.company_code cc
        WHERE cc.tenant_id       = p_tenant_id
          AND cc.legal_entity_id = p_scope_id::uuid
          AND cc.is_active       = true;

    WHEN 'group' THEN
      -- Recursive CTE: walk the legal_entity tree from all roots,
      -- collect every company_code in the tenant.
      RETURN QUERY
        WITH RECURSIVE le_tree AS (
          -- Roots: legal entities with no parent
          SELECT le.id
          FROM master.legal_entity le
          WHERE le.tenant_id         = p_tenant_id
            AND le.parent_entity_id IS NULL
            AND le.is_active         = true
          UNION ALL
          -- Children
          SELECT le.id
          FROM master.legal_entity le
          INNER JOIN le_tree t ON le.parent_entity_id = t.id
          WHERE le.tenant_id = p_tenant_id
            AND le.is_active = true
        )
        SELECT cc.id, cc.code
        FROM master.company_code cc
        INNER JOIN le_tree ON cc.legal_entity_id = le_tree.id
        WHERE cc.tenant_id = p_tenant_id
          AND cc.is_active = true;

    ELSE
      -- Unknown scope type: return empty set (fail-safe)
      RETURN;

  END CASE;
END;
$$;

COMMENT ON FUNCTION master.fn_resolve_scope_companies IS
  'Resolves a FinanceScope to a set of company_code rows. '
  'scope_type: company | legal_entity | group. '
  'Used by all financial read-model queries as the scope entry point.';


-- =============================================================================
-- master.fn_resolve_le_subtree_companies
-- =============================================================================
-- Resolves a legal_entity_id to ALL company_code_ids in its full descendant
-- subtree. Recursive CTE walks master.legal_entity.parent_entity_id from the
-- anchor LE downward.
--
-- Unlike fn_resolve_scope_companies('legal_entity'), which returns only direct
-- (non-recursive) CCs under a single LE, this function walks the full tree.
-- Used by resolve_allowed_companies() for RBAC assignment-scope evaluation.
-- =============================================================================

CREATE OR REPLACE FUNCTION master.fn_resolve_le_subtree_companies(
    p_tenant_id       uuid,
    p_legal_entity_id uuid
) RETURNS TABLE (company_code_id uuid)
LANGUAGE sql STABLE PARALLEL SAFE
SET search_path = master, pg_catalog
AS $$
    WITH RECURSIVE le_tree AS (
        SELECT le.id
        FROM master.legal_entity le
        WHERE le.id        = p_legal_entity_id
          AND le.tenant_id = p_tenant_id
          AND le.is_active = true
        UNION ALL
        SELECT child.id
        FROM master.legal_entity child
        INNER JOIN le_tree parent ON child.parent_entity_id = parent.id
        WHERE child.tenant_id = p_tenant_id
          AND child.is_active = true
    )
    SELECT cc.id
    FROM master.company_code cc
    INNER JOIN le_tree ON cc.legal_entity_id = le_tree.id
    WHERE cc.tenant_id = p_tenant_id
      AND cc.is_active = true;
$$;

COMMENT ON FUNCTION master.fn_resolve_le_subtree_companies IS
    'Resolves a legal_entity_id to all company_code_ids in its full descendant subtree. '
    'Recursive CTE walks master.legal_entity.parent_entity_id from the anchor LE down. '
    'Unlike fn_resolve_scope_companies(''legal_entity''), which returns only direct CCs, '
    'this walks the full tree. Used by resolve_allowed_companies().';
