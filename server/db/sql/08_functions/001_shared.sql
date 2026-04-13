-- 08_functions/001_shared.sql
-- Depends on: 01_schemas/001_schemas.sql, 04_tables/001_shared.sql
-- All functions: CREATE OR REPLACE, SET search_path = shared.

-- shared.uuidv7() — defined in 03_bootstrap_functions/001_shared.sql (must exist before 04_tables).

-- [0] trg_set_updated_at — stamps updated_at + updated_by on every UPDATE
-- updated_by sourced from session GUC app.current_principal_id (NULL if unset)
CREATE OR REPLACE FUNCTION shared.trg_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql VOLATILE
    SET search_path = shared
AS $$
BEGIN
    NEW.updated_at := now();
    NEW.updated_by := nullif(current_setting('app.current_principal_id', true), '')::uuid;
    RETURN NEW;
END;
$$;

-- [A] Immutability guard — prevents code/natural-key changes after insert

CREATE OR REPLACE FUNCTION shared.trg_immutable_code() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = shared
AS $$
begin
  if OLD.code is distinct from NEW.code then
    raise exception '%.%: code is immutable (cannot change "%" to "%")',
      TG_TABLE_SCHEMA, TG_TABLE_NAME, OLD.code, NEW.code;
  end if;

  if TG_TABLE_NAME in ('commodity_code', 'industry_code') then
    if OLD.domain_code is distinct from NEW.domain_code then
      raise exception '%.%: domain_code is immutable (cannot change "%" to "%")',
        TG_TABLE_SCHEMA, TG_TABLE_NAME, OLD.domain_code, NEW.domain_code;
    end if;
  end if;

  if TG_TABLE_NAME = 'state_region' then
    if OLD.country_code is distinct from NEW.country_code then
      raise exception '%.%: country_code is immutable (cannot change "%" to "%")',
        TG_TABLE_SCHEMA, TG_TABLE_NAME, OLD.country_code, NEW.country_code;
    end if;
  end if;

  return NEW;
end;
$$;

-- [B] Hierarchy management — commodity_code & industry_code

CREATE OR REPLACE FUNCTION shared.trg_hierarchy_code_validate() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = shared
AS $$
declare
  v_parent_found boolean;
  v_parent_level integer;
begin
  if NEW.parent_code is null then return NEW; end if;

  execute format(
    'select true, level_no from %I.%I where domain_code = $1 and code = $2',
    TG_TABLE_SCHEMA, TG_TABLE_NAME
  ) into v_parent_found, v_parent_level
    using NEW.domain_code, NEW.parent_code;

  if not coalesce(v_parent_found, false) then
    raise exception '%.%: parent_code "%" not found in domain "%"',
        TG_TABLE_SCHEMA, TG_TABLE_NAME,
        NEW.parent_code, NEW.domain_code
        using errcode = 'foreign_key_violation';
  end if;

  if NEW.level_no is not null and v_parent_level is not null
     and NEW.level_no <> v_parent_level + 1 then
    raise exception '%.%: code "%.%" level_no (%) must be parent level_no (%) + 1',
      TG_TABLE_SCHEMA, TG_TABLE_NAME,
      NEW.domain_code, NEW.code, NEW.level_no, v_parent_level;
  end if;

  return NEW;
end;
$$;

CREATE OR REPLACE FUNCTION shared.trg_hierarchy_cycle_detect() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = shared
AS $$
declare
  v_cycle boolean;
begin
  if NEW.parent_code is null then return NEW; end if;

  execute format(
    'WITH RECURSIVE chain(parent_code, depth) AS (
       SELECT parent_code, 1 FROM %I.%I
        WHERE domain_code = $1 AND code = $2
       UNION ALL
       SELECT t.parent_code, c.depth + 1 FROM %I.%I t
         JOIN chain c ON t.domain_code = $1 AND t.code = c.parent_code
        WHERE c.depth < 100  -- safety: prevent infinite recursion on corrupted data
     )
     SELECT EXISTS(SELECT 1 FROM chain WHERE parent_code = $3)',
    TG_TABLE_SCHEMA, TG_TABLE_NAME,
    TG_TABLE_SCHEMA, TG_TABLE_NAME
  ) INTO v_cycle USING NEW.domain_code, NEW.parent_code, NEW.code;

  if v_cycle then
    raise exception '% %.%: cycle detected in parent chain',
      TG_TABLE_NAME, NEW.domain_code, NEW.code;
  end if;

  return NEW;
end;
$$;

CREATE OR REPLACE FUNCTION shared.recompute_is_leaf(p_table regclass, p_domain text, p_code text) RETURNS void
    LANGUAGE plpgsql
    SET search_path = shared
AS $$
declare
  v_has_children boolean;
begin
  execute format(
    'select exists(select 1 from %s where domain_code = $1 and parent_code = $2 and status = ''active'')',
    p_table
  ) into v_has_children using p_domain, p_code;

  execute format(
    'update %s set is_leaf = $1 where domain_code = $2 and code = $3 and is_leaf is distinct from $1',
    p_table
  ) using not v_has_children, p_domain, p_code;
end;
$$;

CREATE OR REPLACE FUNCTION shared.trg_hierarchy_recompute_parent_leaf() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = shared
AS $$
declare
  v_table regclass;
begin
  v_table := format('%I.%I', TG_TABLE_SCHEMA, TG_TABLE_NAME)::regclass;

  if TG_OP in ('DELETE', 'UPDATE') and OLD.parent_code is not null then
    perform shared.recompute_is_leaf(v_table, OLD.domain_code, OLD.parent_code);
  end if;

  if TG_OP in ('INSERT', 'UPDATE') and NEW.parent_code is not null then
    if TG_OP = 'INSERT'
       or OLD.parent_code is null
       or OLD.parent_code <> NEW.parent_code
       or OLD.domain_code <> NEW.domain_code
       or OLD.status <> NEW.status then
      perform shared.recompute_is_leaf(v_table, NEW.domain_code, NEW.parent_code);
    end if;
  end if;

  return coalesce(NEW, OLD);
end;
$$;

CREATE OR REPLACE FUNCTION shared.trg_hierarchy_guard_is_leaf() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = shared
AS $$
declare
  v_has_children boolean;
begin
  if NEW.is_leaf = true and (OLD.is_leaf = false or OLD.is_leaf is null) then
    execute format(
      'select exists(select 1 from %I.%I where domain_code = $1 and parent_code = $2 and status = ''active'')',
      TG_TABLE_SCHEMA, TG_TABLE_NAME
    ) into v_has_children using NEW.domain_code, NEW.code;

    if v_has_children then
      raise exception '% %.%: cannot set is_leaf = true — active children exist',
        TG_TABLE_NAME, NEW.domain_code, NEW.code;
    end if;
  end if;

  return NEW;
end;
$$;

CREATE OR REPLACE FUNCTION shared.repair_hierarchy_is_leaf(
    p_table regclass DEFAULT NULL
) RETURNS integer
    LANGUAGE plpgsql
    SET search_path = shared
AS $$
declare
  v_fixed integer := 0;
  v_count integer;
  v_tbl   regclass;
begin
  -- Discover all hierarchy tables (have domain_code, parent_code, is_leaf, status).
  -- If p_table is supplied, repair only that table.
  for v_tbl in
    select c.oid::regclass
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'shared'
       and c.relkind = 'r'
       and exists(select 1 from pg_attribute where attrelid = c.oid and attname = 'domain_code' and not attisdropped)
       and exists(select 1 from pg_attribute where attrelid = c.oid and attname = 'parent_code'  and not attisdropped)
       and exists(select 1 from pg_attribute where attrelid = c.oid and attname = 'is_leaf'      and not attisdropped)
       and exists(select 1 from pg_attribute where attrelid = c.oid and attname = 'status'       and not attisdropped)
       and (p_table IS NULL or c.oid = p_table)
  loop
    -- Mark false: has active children but is_leaf = true
    execute format(
      'UPDATE %s c SET is_leaf = false
        WHERE c.is_leaf = true
          AND EXISTS(SELECT 1 FROM %s child
              WHERE child.domain_code = c.domain_code
                AND child.parent_code = c.code
                AND child.status = ''active'')',
      v_tbl, v_tbl
    );
    get diagnostics v_count = row_count; v_fixed := v_fixed + v_count;

    -- Mark true: no active children but is_leaf = false
    execute format(
      'UPDATE %s c SET is_leaf = true
        WHERE c.is_leaf = false
          AND NOT EXISTS(SELECT 1 FROM %s child
              WHERE child.domain_code = c.domain_code
                AND child.parent_code = c.code
                AND child.status = ''active'')',
      v_tbl, v_tbl
    );
    get diagnostics v_count = row_count; v_fixed := v_fixed + v_count;
  end loop;

  return v_fixed;
end;
$$;

-- [C] Locale / Region consistency

CREATE OR REPLACE FUNCTION shared.normalize_locale_code(p_locale text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path = shared
AS $$
declare
  v_parts text[];
begin
  if p_locale is null or btrim(p_locale) = '' then return null; end if;

  v_parts := string_to_array(replace(btrim(p_locale), '_', '-'), '-');
  v_parts[1] := lower(v_parts[1]);

  if array_length(v_parts, 1) >= 2 then
    if v_parts[2] ~ '^[A-Za-z]{4}$' then
      v_parts[2] := upper(left(v_parts[2], 1)) || lower(substr(v_parts[2], 2));
    elsif v_parts[2] ~ '^[A-Za-z]{2}$' then
      v_parts[2] := upper(v_parts[2]);
    elsif v_parts[2] ~ '^[0-9]{3}$' then
      null; -- UN M.49 numeric region kept as-is
    end if;
  end if;

  if array_length(v_parts, 1) >= 3 then
    if v_parts[3] ~ '^[A-Za-z]{2}$' then
      v_parts[3] := upper(v_parts[3]);
    end if;
  end if;

  return array_to_string(v_parts, '-');
end;
$$;

CREATE OR REPLACE FUNCTION shared.trg_locale_consistency_validate() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = shared
AS $$
declare
  v_parts  text[];
  v_lang   text;
  v_script text;
  v_region text;
begin
  NEW.language_code := nullif(btrim(NEW.language_code), '');
  NEW.script        := nullif(btrim(NEW.script), '');
  NEW.code := shared.normalize_locale_code(NEW.code);

  v_parts := string_to_array(NEW.code, '-');
  v_lang  := v_parts[1];

  if v_lang <> NEW.language_code then
    raise exception 'shared.locale: code "%" language subtag "%" does not match language_code "%"',
      NEW.code, v_lang, NEW.language_code;
  end if;

  if array_length(v_parts, 1) >= 2 then
    if v_parts[2] ~ '^[A-Z][a-z]{3}$' then
      v_script := v_parts[2];
      if array_length(v_parts, 1) >= 3 then v_region := v_parts[3]; end if;
    else
      v_region := v_parts[2];
    end if;
  end if;

  if v_script is not null then
    if NEW.script is null then
      raise exception 'shared.locale: code "%" has script subtag "%" but script column is null', NEW.code, v_script;
    elsif v_script <> NEW.script then
      raise exception 'shared.locale: code "%" script subtag "%" does not match script column "%"', NEW.code, v_script, NEW.script;
    end if;
  -- When the BCP 47 code uses suppress-script convention (subtag omitted because
  -- it is the default for the language), the script column may still carry the
  -- canonical ISO 15924 code as metadata — no error in that case.
  end if;

  if v_region is not null then
    if v_region ~ '^[A-Z]{2}$' then
      if NEW.country_code is null then
        raise exception 'shared.locale: code "%" has region subtag "%" but country_code is null', NEW.code, v_region;
      elsif v_region <> NEW.country_code::text then
        raise exception 'shared.locale: code "%" region subtag "%" does not match country_code "%"', NEW.code, v_region, NEW.country_code;
      end if;
    elsif v_region ~ '^[0-9]{3}$' then
      if NEW.country_code is not null then
        raise exception 'shared.locale: code "%" has numeric region "%" (UN M.49) — country_code must be null, got "%"', NEW.code, v_region, NEW.country_code;
      end if;
    end if;
  end if;

  return NEW;
end;
$$;

CREATE OR REPLACE FUNCTION shared.trg_state_region_code_consistency() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = shared
AS $$
declare
  v_prefix text;
begin
  NEW.code := nullif(btrim(NEW.code), '');
  v_prefix := split_part(NEW.code, '-', 1);

  if v_prefix <> NEW.country_code::text then
    raise exception 'shared.state_region: code "%" country prefix "%" does not match country_code "%"',
      NEW.code, v_prefix, NEW.country_code;
  end if;

  return NEW;
end;
$$;

-- [D] Persona protection — blocks deletion/structural mutation of system personas

CREATE OR REPLACE FUNCTION shared.trg_protect_system_persona() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = shared
AS $$
begin
  if tg_op = 'DELETE' then
    if old.is_system = true then
      raise exception 'Cannot delete system persona: %', old.code using errcode = 'restrict_violation';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.is_system = true then
    if old.code       is distinct from new.code
    or old.scope_mode is distinct from new.scope_mode
    or old.priority   is distinct from new.priority
    or old.is_system  is distinct from new.is_system then
      raise exception 'Cannot modify structural fields of system persona: %', old.code using errcode = 'restrict_violation';
    end if;
  end if;

  return new;
end;
$$;

-- [E] Tenant context
-- shared.current_tenant_id() — defined in 05_pre_constraint_functions/001_shared.sql.

-- current_tenant_id_soft — returns NULL instead of raising when GUC unset.
-- Used in RLS USING clauses where unauthenticated access should return zero rows.
CREATE OR REPLACE FUNCTION shared.current_tenant_id_soft()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog AS $$
    SELECT nullif(current_setting('app.current_tenant_id', true), '')::uuid;
$$;

-- [F] Lifecycle — stamps status_changed_at when status changes

CREATE OR REPLACE FUNCTION shared.trg_set_status_changed() RETURNS trigger
    LANGUAGE plpgsql VOLATILE
    SET search_path = shared
AS $$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        NEW.status_changed_at := clock_timestamp();
        NEW.status_changed_by := nullif(current_setting('app.current_principal_id', true), '')::uuid;
    END IF;
    RETURN NEW;
END;
$$;


-- ============================================================================
-- Country-aware validation functions
-- ============================================================================
-- These query shared.country columns directly — no CASE branches.
-- Adding/fixing a country rule = UPDATE shared.country, no code change.
-- ============================================================================

-- fn_validate_postal_code — validates a postal code against the country's pattern.
CREATE OR REPLACE FUNCTION shared.fn_validate_postal_code(
    p_country_code  text,
    p_postal_code   text
)
RETURNS boolean
LANGUAGE plpgsql STABLE PARALLEL SAFE
SET search_path = shared
AS $$
DECLARE
    v_has_postal    boolean;
    v_pattern       text;
BEGIN
    IF p_postal_code IS NULL                THEN RETURN true;  END IF;
    IF btrim(p_postal_code) = ''            THEN RETURN false; END IF;
    IF p_country_code IS NULL               THEN RETURN true;  END IF;

    SELECT has_postal_codes, postal_code_pattern
      INTO v_has_postal, v_pattern
      FROM shared.country
     WHERE code = upper(p_country_code)::character(2);

    IF NOT FOUND                            THEN RETURN true;  END IF;  -- unknown country
    IF v_has_postal = false                 THEN RETURN false; END IF;  -- no postal system
    IF v_pattern IS NULL                    THEN RETURN true;  END IF;  -- pattern not catalogued

    RETURN p_postal_code ~ v_pattern;
END;
$$;

COMMENT ON FUNCTION shared.fn_validate_postal_code(text, text) IS
  'Country-aware postal code validator. Queries shared.country.postal_code_pattern. '
  'Returns TRUE for NULL input, unknown country, or uncatalogued patterns. '
  'Returns FALSE for empty string, no-postal-code countries, or pattern mismatch.';


-- fn_validate_phone — validates an E.164 phone number against the country's pattern.
CREATE OR REPLACE FUNCTION shared.fn_validate_phone(
    p_country_code  text,
    p_phone         text
)
RETURNS boolean
LANGUAGE plpgsql STABLE PARALLEL SAFE
SET search_path = shared
AS $$
DECLARE
    v_calling_code  text;
    v_trunk         text;
    v_pattern       text;
    v_national      text;
BEGIN
    IF p_phone IS NULL                      THEN RETURN true;  END IF;
    IF btrim(p_phone) = ''                  THEN RETURN false; END IF;
    IF p_country_code IS NULL               THEN RETURN true;  END IF;

    SELECT calling_code, phone_trunk_prefix, phone_national_pattern
      INTO v_calling_code, v_trunk, v_pattern
      FROM shared.country
     WHERE code = upper(p_country_code)::character(2);

    IF NOT FOUND                            THEN RETURN true;  END IF;
    IF v_calling_code IS NULL               THEN RETURN true;  END IF;
    IF v_pattern IS NULL                    THEN RETURN true;  END IF;

    -- Strip the calling code prefix, then strip at most one leading trunk character
    v_national := regexp_replace(p_phone, '^\+?' || v_calling_code, '');
    IF v_trunk IS NOT NULL AND v_trunk <> '' THEN
        v_national := regexp_replace(v_national, '^' || v_trunk, '');
    END IF;

    RETURN v_national ~ v_pattern;
END;
$$;

COMMENT ON FUNCTION shared.fn_validate_phone(text, text) IS
  'Country-aware phone number validator. Strips calling code and trunk prefix, '
  'then tests against shared.country.phone_national_pattern. '
  'Returns TRUE for NULL, unknown country, or uncatalogued patterns.';


-- fn_resolve_calling_code — given an E.164 number, find the country by longest-prefix match.
CREATE OR REPLACE FUNCTION shared.fn_resolve_calling_code(p_e164 text)
RETURNS TABLE (country_code character(2), calling_code text)
LANGUAGE sql STABLE PARALLEL SAFE
SET search_path = shared
AS $$
    SELECT code, calling_code
    FROM   shared.country
    WHERE  calling_code IS NOT NULL
      AND  p_e164 ~ ('^\+' || calling_code)
    ORDER BY length(calling_code) DESC  -- longest match wins (+1649 before +1)
    LIMIT 1;
$$;

COMMENT ON FUNCTION shared.fn_resolve_calling_code(text) IS
  'Given an E.164 number, returns the matching country_code and calling_code '
  'by longest-prefix match. Used to auto-populate contact_phone.calling_code.';
