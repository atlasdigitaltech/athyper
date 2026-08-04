-- ============================================================================
-- shared/05_functions.sql
-- Concept: Platform Utilities — string helpers, UUID generation, session context
-- Depends on: 04_tables/001_shared.sql, 05_pre_constraint_functions/001_shared.sql
-- All functions: CREATE OR REPLACE, SET search_path = shared.
-- ============================================================================

-- shared.uuidv7() — defined in 03_bootstrap_functions/001_shared.sql (must exist before 04_tables).

-- [0] trg_set_updated_at — stamps updated_at + updated_by on every UPDATE
-- updated_by sourced from session GUC app.current_principal_id, else the
-- caller-supplied NEW.updated_by, else the prior row's updated_by, else the
-- system sentinel principal. The final fallback keeps the audit pair invariant
-- (updated_at IS NULL) = (updated_by IS NULL) intact even for admin/system
-- UPDATEs that never set the GUC.
CREATE OR REPLACE FUNCTION shared.trg_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql VOLATILE
    SET search_path = shared
AS $$
BEGIN
    NEW.updated_at := now();
    NEW.updated_by := COALESCE(
        nullif(current_setting('app.current_principal_id', true), '')::uuid,
        NEW.updated_by,
        OLD.updated_by,
        '00000000-0000-0000-0000-000000000000'::uuid
    );
    RETURN NEW;
END;
$$;

-- [A] Immutability guard — prevents code/natural-key changes after insert

CREATE OR REPLACE FUNCTION shared.trg_immutable_code() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = shared
AS $$
begin
  if OLD.id is distinct from NEW.id then
    raise exception '%.%: id is immutable',
      TG_TABLE_SCHEMA, TG_TABLE_NAME
      using errcode = 'check_violation';
  end if;

  if OLD.code is distinct from NEW.code then
    raise exception '%.%: code is immutable (cannot change "%" to "%")',
      TG_TABLE_SCHEMA, TG_TABLE_NAME, OLD.code, NEW.code;
  end if;

  if TG_TABLE_NAME in ('commodity_code', 'industry_code') then
    if OLD.domain_code is distinct from NEW.domain_code then
      raise exception '%.%: domain_code is immutable (cannot change "%" to "%")',
        TG_TABLE_SCHEMA, TG_TABLE_NAME, OLD.domain_code, NEW.domain_code;
    end if;
    if OLD.parent_code is distinct from NEW.parent_code
       or OLD.level_no is distinct from NEW.level_no then
      raise exception '%.%: parent_code and level_no are immutable',
        TG_TABLE_SCHEMA, TG_TABLE_NAME
        using errcode = 'check_violation';
    end if;
  end if;

  if TG_TABLE_NAME = 'state_region' then
    if OLD.country_code is distinct from NEW.country_code then
      raise exception '%.%: country_code is immutable (cannot change "%" to "%")',
        TG_TABLE_SCHEMA, TG_TABLE_NAME, OLD.country_code, NEW.country_code;
    end if;
    if OLD.parent_code is distinct from NEW.parent_code then
      raise exception 'shared.state_region: parent_code is immutable'
        using errcode = 'check_violation';
    end if;
  end if;

  if TG_TABLE_NAME = 'classification_scheme' then
    if OLD.scheme_kind is distinct from NEW.scheme_kind then
      raise exception 'shared.classification_scheme: scheme_kind is immutable'
        using errcode = 'check_violation';
    end if;
  end if;

  if TG_TABLE_NAME = 'timezone' then
    if OLD.canonical_code is distinct from NEW.canonical_code then
      raise exception 'shared.timezone: canonical_code is immutable'
        using errcode = 'check_violation';
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
  if current_setting('app.reference_seed_mode', true) = 'on' then
    return NEW;
  end if;

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
  if current_setting('app.reference_seed_mode', true) = 'on' then
    return NEW;
  end if;

  if NEW.parent_code is null then return NEW; end if;

  execute format(
    'WITH RECURSIVE chain(code, parent_code) AS (
       SELECT code, parent_code FROM %I.%I
        WHERE domain_code = $1 AND code = $2
       UNION
       SELECT t.code, t.parent_code FROM %I.%I t
         JOIN chain c ON t.domain_code = $1 AND t.code = c.parent_code
     )
     SELECT EXISTS(SELECT 1 FROM chain WHERE code = $3)',
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

  if current_setting('app.reference_seed_mode', true) = 'on' then
    return coalesce(NEW, OLD);
  end if;

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
  v_language_direction text;
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

  select direction
    into v_language_direction
    from shared.language
   where code = NEW.language_code;

  if v_language_direction is null then
    raise exception 'shared.locale: language_code "%" is not registered',
      NEW.language_code
      using errcode = 'foreign_key_violation';
  end if;

  NEW.direction := coalesce(NEW.direction, v_language_direction);

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
  elsif NEW.country_code is not null then
    raise exception
      'shared.locale: country_code requires a matching region subtag in code "%"',
      NEW.code
      using errcode = 'check_violation';
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
        NEW.status_changed_by := coalesce(
            nullif(current_setting('app.current_principal_id', true), '')::uuid,
            NEW.status_changed_by,
            OLD.status_changed_by,
            '00000000-0000-0000-0000-000000000000'::uuid
        );
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
    v_pattern       text;
    v_national      text;
BEGIN
    IF p_phone IS NULL                      THEN RETURN true;  END IF;
    IF btrim(p_phone) = ''                  THEN RETURN false; END IF;
    IF p_country_code IS NULL               THEN RETURN true;  END IF;
    IF p_phone !~ '^\+[1-9][0-9]{1,14}$'   THEN RETURN false; END IF;

    SELECT calling_code, phone_national_pattern
      INTO v_calling_code, v_pattern
      FROM shared.country
     WHERE code = upper(p_country_code)::character(2);

    IF NOT FOUND                            THEN RETURN true;  END IF;
    IF v_calling_code IS NULL               THEN RETURN true;  END IF;
    IF v_pattern IS NULL                    THEN RETURN true;  END IF;
    IF p_phone !~ ('^\+' || v_calling_code) THEN RETURN false; END IF;

    -- E.164 excludes the domestic trunk prefix.
    v_national := regexp_replace(p_phone, '^\+' || v_calling_code, '');

    RETURN v_national ~ v_pattern;
END;
$$;

COMMENT ON FUNCTION shared.fn_validate_phone(text, text) IS
  'Country-aware E.164 phone validator. Requires + plus at most 15 digits and strips the calling code, '
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
    ORDER BY length(calling_code) DESC, code;
$$;

COMMENT ON FUNCTION shared.fn_resolve_calling_code(text) IS
  'Given an E.164 number, returns all matching country candidates ordered by '
  'longest calling-code prefix. Shared plans such as NANP +1 are intentionally '
  'not collapsed to an arbitrary country.';

CREATE OR REPLACE FUNCTION shared.trg_reference_evidence_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = shared, pg_catalog
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION
            'shared.% identity and creation evidence are immutable',
            TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status = 'deprecated' AND NEW.status <> 'deprecated' THEN
        RAISE EXCEPTION
            'deprecated shared.% rows cannot be reactivated',
            TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status_changed_at IS NOT NULL
       AND NEW.status IS NOT DISTINCT FROM OLD.status
       AND (
            NEW.status_changed_at IS DISTINCT FROM OLD.status_changed_at
            OR NEW.status_changed_by IS DISTINCT FROM OLD.status_changed_by
       ) THEN
        RAISE EXCEPTION
            'shared.% recorded status evidence is immutable',
            TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_TABLE_NAME IN ('commodity_crosswalk', 'industry_crosswalk') THEN
        IF OLD.is_verified AND (
            NOT NEW.is_verified
            OR NEW.verified_by IS DISTINCT FROM OLD.verified_by
            OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
            OR NEW.mapping_type IS DISTINCT FROM OLD.mapping_type
            OR NEW.confidence IS DISTINCT FROM OLD.confidence
            OR NEW.provenance IS DISTINCT FROM OLD.provenance
            OR NEW.notes IS DISTINCT FROM OLD.notes
            OR NEW.metadata IS DISTINCT FROM OLD.metadata
        ) THEN
            RAISE EXCEPTION
                'verified shared.% mapping evidence is immutable; deprecate and replace it',
                TG_TABLE_NAME
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION shared.trg_reference_delete_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = shared, pg_catalog
AS $$
BEGIN
    RAISE EXCEPTION
        'shared.%(%) is retained reference evidence; deprecate it instead of deleting',
        TG_TABLE_NAME, OLD.id
        USING ERRCODE = 'check_violation';
END;
$$;

CREATE OR REPLACE FUNCTION shared.trg_crosswalk_identity_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = shared, pg_catalog
AS $$
BEGIN
    IF NEW.source_domain_code IS DISTINCT FROM OLD.source_domain_code
       OR NEW.source_code IS DISTINCT FROM OLD.source_code
       OR NEW.target_domain_code IS DISTINCT FROM OLD.target_domain_code
       OR NEW.target_code IS DISTINCT FROM OLD.target_code THEN
        RAISE EXCEPTION
            'shared.% source and target coordinates are immutable',
            TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION shared.trg_country_profile_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = shared, pg_catalog
AS $$
BEGIN
    BEGIN
        IF NEW.phone_national_pattern IS NOT NULL THEN
            PERFORM '' ~ NEW.phone_national_pattern;
        END IF;
        IF NEW.postal_code_pattern IS NOT NULL THEN
            PERFORM '' ~ NEW.postal_code_pattern;
        END IF;
    EXCEPTION WHEN invalid_regular_expression THEN
        RAISE EXCEPTION
            'shared.country % contains an invalid phone or postal regular expression',
            NEW.code
            USING ERRCODE = 'invalid_regular_expression';
    END;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION shared.trg_timezone_alias_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = shared, pg_catalog
AS $$
BEGIN
    IF NEW.canonical_code IS NULL THEN
        RETURN NEW;
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM shared.timezone AS canonical
         WHERE canonical.code = NEW.canonical_code
           AND NOT canonical.is_alias
           AND canonical.status = 'active'
    ) THEN
        RAISE EXCEPTION
            'timezone alias % must point directly to an active canonical timezone',
            NEW.code
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION shared.trg_state_region_hierarchy_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = shared, pg_catalog
AS $$
DECLARE
    v_cycle boolean;
BEGIN
    IF NEW.parent_code IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.status = 'active' AND NOT EXISTS (
        SELECT 1
          FROM shared.state_region AS parent
         WHERE parent.country_code = NEW.country_code
           AND parent.code = NEW.parent_code
           AND parent.status = 'active'
    ) THEN
        RAISE EXCEPTION
            'active state_region % requires an active parent',
            NEW.code
            USING ERRCODE = 'check_violation';
    END IF;

    WITH RECURSIVE chain(code, parent_code) AS (
        SELECT code, parent_code
          FROM shared.state_region
         WHERE country_code = NEW.country_code
           AND code = NEW.parent_code
        UNION
        SELECT parent.code, parent.parent_code
          FROM shared.state_region AS parent
          JOIN chain AS child
            ON parent.country_code = NEW.country_code
           AND parent.code = child.parent_code
    )
    SELECT EXISTS (SELECT 1 FROM chain WHERE code = NEW.code)
      INTO v_cycle;

    IF v_cycle THEN
        RAISE EXCEPTION 'state_region % parent would create a cycle', NEW.code
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION shared.trg_classification_code_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = shared, pg_catalog
AS $$
DECLARE
    v_expected_kind shared.classification_kind_d :=
        CASE TG_TABLE_NAME
            WHEN 'commodity_code' THEN 'commodity'
            WHEN 'industry_code' THEN 'industry'
        END;
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM shared.classification_scheme AS scheme
         WHERE scheme.code = NEW.domain_code
           AND scheme.scheme_kind = v_expected_kind
           AND scheme.status = 'active'
    ) THEN
        RAISE EXCEPTION
            'active %.% row requires an active % classification scheme',
            NEW.domain_code, NEW.code, v_expected_kind
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.parent_code IS NOT NULL AND NEW.status = 'active' AND NOT EXISTS (
        SELECT 1
          FROM (
                SELECT domain_code, code, status FROM shared.commodity_code
                 WHERE TG_TABLE_NAME = 'commodity_code'
                UNION ALL
                SELECT domain_code, code, status FROM shared.industry_code
                 WHERE TG_TABLE_NAME = 'industry_code'
          ) AS parent
         WHERE parent.domain_code = NEW.domain_code
           AND parent.code = NEW.parent_code
           AND parent.status = 'active'
    ) THEN
        RAISE EXCEPTION
            'active %.% row requires an active parent',
            NEW.domain_code, NEW.code
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION shared.trg_crosswalk_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = shared, pg_catalog
AS $$
DECLARE
    v_code_table regclass :=
        CASE TG_TABLE_NAME
            WHEN 'commodity_crosswalk' THEN 'shared.commodity_code'::regclass
            WHEN 'industry_crosswalk' THEN 'shared.industry_code'::regclass
        END;
    v_valid boolean;
BEGIN
    IF NEW.status <> 'active' THEN
        RETURN NEW;
    END IF;

    EXECUTE format(
        'SELECT (
            EXISTS (
                SELECT 1 FROM %s
                 WHERE domain_code = $1 AND code = $2 AND status = ''active''
            )
            AND EXISTS (
                SELECT 1 FROM %s
                 WHERE domain_code = $3 AND code = $4 AND status = ''active''
            )
        )',
        v_code_table, v_code_table
    )
    INTO v_valid
    USING
        NEW.source_domain_code, NEW.source_code,
        NEW.target_domain_code, NEW.target_code;

    IF NOT v_valid THEN
        RAISE EXCEPTION
            'active shared.% requires active source and target codes',
            TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION shared.validate_reference_seed()
RETURNS void
LANGUAGE plpgsql
SET search_path = shared, pg_catalog
AS $$
DECLARE
    v_problem text;
BEGIN
    SELECT problem
      INTO v_problem
      FROM (
            SELECT 'ISO country code completeness or uniqueness'::text AS problem
             WHERE EXISTS (
                SELECT 1
                  FROM shared.country
                 WHERE status = 'active'
                   AND (code3 IS NULL OR numeric3 IS NULL)
             )
                OR EXISTS (
                    SELECT code3 FROM shared.country WHERE status = 'active'
                     GROUP BY code3 HAVING count(*) > 1
                )
                OR EXISTS (
                    SELECT numeric3 FROM shared.country WHERE status = 'active'
                     GROUP BY numeric3 HAVING count(*) > 1
                )
            UNION ALL
            SELECT 'ISO currency code completeness or uniqueness'
             WHERE EXISTS (
                SELECT 1 FROM shared.currency
                 WHERE status = 'active' AND numeric3 IS NULL
             )
                OR EXISTS (
                    SELECT numeric3 FROM shared.currency WHERE status = 'active'
                     GROUP BY numeric3 HAVING count(*) > 1
                )
            UNION ALL
            SELECT 'ISO language code normalization or uniqueness'
             WHERE EXISTS (
                SELECT 1 FROM shared.language
                 WHERE status = 'active'
                   AND (code <> lower(btrim(code))
                        OR (iso639_2 IS NOT NULL AND iso639_2 <> lower(btrim(iso639_2))))
             )
                OR EXISTS (
                    SELECT iso639_2 FROM shared.language
                     WHERE status = 'active' AND iso639_2 IS NOT NULL
                     GROUP BY iso639_2 HAVING count(*) > 1
                )
            UNION ALL
            SELECT 'state-to-country relationship or ISO 3166-2 prefix mismatch'
             WHERE EXISTS (
                SELECT 1
                  FROM shared.state_region AS subdivision
                  LEFT JOIN shared.country AS country
                    ON country.code = subdivision.country_code
                 WHERE country.id IS NULL
                    OR country.status <> 'active'
                    OR split_part(subdivision.code, '-', 1) <> subdivision.country_code::text
             )
            UNION ALL
            SELECT 'UOM dimension or conversion family invalid'
             WHERE EXISTS (
                SELECT 1
                  FROM shared.uom
                 WHERE quantity_type NOT IN (
                    'angle', 'area', 'concentration', 'density', 'digital',
                    'electrical', 'energy', 'force', 'frequency', 'length',
                    'luminosity', 'mass', 'power', 'pressure', 'quantity',
                    'ratio', 'service', 'speed', 'temperature', 'time', 'volume'
                 )
             )
                OR EXISTS (
                    SELECT required.quantity_type
                      FROM (VALUES
                        ('mass', 'KGM'), ('length', 'MTR'), ('area', 'MTK'),
                        ('volume', 'MTQ'), ('time', 'SEC'), ('temperature', 'CEL'),
                        ('energy', 'JOU'), ('power', 'WTT'), ('pressure', 'PAL'),
                        ('frequency', 'HTZ'), ('angle', 'DD'), ('quantity', 'C62'),
                        ('ratio', 'P1')
                      ) AS required(quantity_type, base_code)
                     WHERE NOT EXISTS (
                        SELECT 1 FROM shared.uom
                         WHERE code = required.base_code
                           AND quantity_type = required.quantity_type
                           AND status = 'active'
                     )
                )
            UNION ALL
            SELECT 'commodity orphan or invalid level'::text AS problem
             WHERE EXISTS (
                SELECT 1
                  FROM shared.commodity_code AS child
                  LEFT JOIN shared.commodity_code AS parent
                    ON parent.domain_code = child.domain_code
                   AND parent.code = child.parent_code
                 WHERE child.parent_code IS NOT NULL
                   AND (
                        parent.id IS NULL
                        OR child.level_no <> parent.level_no + 1
                        OR (child.status = 'active' AND parent.status <> 'active')
                   )
             )
            UNION ALL
            SELECT 'industry orphan or invalid level'
             WHERE EXISTS (
                SELECT 1
                  FROM shared.industry_code AS child
                  LEFT JOIN shared.industry_code AS parent
                    ON parent.domain_code = child.domain_code
                   AND parent.code = child.parent_code
                 WHERE child.parent_code IS NOT NULL
                   AND (
                        parent.id IS NULL
                        OR child.level_no <> parent.level_no + 1
                        OR (child.status = 'active' AND parent.status <> 'active')
                   )
             )
            UNION ALL
            SELECT 'commodity hierarchy cycle'
             WHERE EXISTS (
                WITH RECURSIVE walk(domain_code, code, parent_code, path, cycle) AS (
                    SELECT domain_code, code, parent_code, ARRAY[code], false
                      FROM shared.commodity_code
                    UNION ALL
                    SELECT parent.domain_code, parent.code, parent.parent_code,
                           walk.path || parent.code,
                           parent.code = ANY(walk.path)
                      FROM walk
                      JOIN shared.commodity_code AS parent
                        ON parent.domain_code = walk.domain_code
                       AND parent.code = walk.parent_code
                     WHERE NOT walk.cycle
                )
                SELECT 1 FROM walk WHERE cycle
             )
            UNION ALL
            SELECT 'industry hierarchy cycle'
             WHERE EXISTS (
                WITH RECURSIVE walk(domain_code, code, parent_code, path, cycle) AS (
                    SELECT domain_code, code, parent_code, ARRAY[code], false
                      FROM shared.industry_code
                    UNION ALL
                    SELECT parent.domain_code, parent.code, parent.parent_code,
                           walk.path || parent.code,
                           parent.code = ANY(walk.path)
                      FROM walk
                      JOIN shared.industry_code AS parent
                        ON parent.domain_code = walk.domain_code
                       AND parent.code = walk.parent_code
                     WHERE NOT walk.cycle
                )
                SELECT 1 FROM walk WHERE cycle
             )
            UNION ALL
            SELECT 'commodity hierarchy depth invalid'
             WHERE EXISTS (
                SELECT expected.domain_code
                  FROM (VALUES ('unspsc', 4), ('hs', 3)) AS expected(domain_code, max_depth)
                  LEFT JOIN shared.commodity_code AS code
                    ON code.domain_code = expected.domain_code
                   AND code.status = 'active'
                 GROUP BY expected.domain_code, expected.max_depth
                HAVING min(code.level_no) IS DISTINCT FROM 1
                    OR max(code.level_no) IS DISTINCT FROM expected.max_depth
                    OR count(DISTINCT code.level_no) IS DISTINCT FROM expected.max_depth
             )
            UNION ALL
            SELECT 'industry hierarchy depth invalid'
             WHERE EXISTS (
                SELECT expected.domain_code
                  FROM (VALUES ('isic', 4), ('naics', 3)) AS expected(domain_code, max_depth)
                  LEFT JOIN shared.industry_code AS code
                    ON code.domain_code = expected.domain_code
                   AND code.status = 'active'
                 GROUP BY expected.domain_code, expected.max_depth
                HAVING min(code.level_no) IS DISTINCT FROM 1
                    OR max(code.level_no) IS DISTINCT FROM expected.max_depth
                    OR count(DISTINCT code.level_no) IS DISTINCT FROM expected.max_depth
             )
            UNION ALL
            SELECT 'commodity crosswalk endpoint missing or inactive'
             WHERE EXISTS (
                SELECT 1
                  FROM shared.commodity_crosswalk AS mapping
                  LEFT JOIN shared.commodity_code AS source
                    ON (source.domain_code, source.code) =
                       (mapping.source_domain_code, mapping.source_code)
                  LEFT JOIN shared.commodity_code AS target
                    ON (target.domain_code, target.code) =
                       (mapping.target_domain_code, mapping.target_code)
                 WHERE source.id IS NULL OR target.id IS NULL
                    OR source.status <> 'active' OR target.status <> 'active'
             )
            UNION ALL
            SELECT 'industry crosswalk endpoint missing or inactive'
             WHERE EXISTS (
                SELECT 1
                  FROM shared.industry_crosswalk AS mapping
                  LEFT JOIN shared.industry_code AS source
                    ON (source.domain_code, source.code) =
                       (mapping.source_domain_code, mapping.source_code)
                  LEFT JOIN shared.industry_code AS target
                    ON (target.domain_code, target.code) =
                       (mapping.target_domain_code, mapping.target_code)
                 WHERE source.id IS NULL OR target.id IS NULL
                    OR source.status <> 'active' OR target.status <> 'active'
             )
            UNION ALL
            SELECT 'commodity keyword normalization invalid'
             WHERE EXISTS (
                SELECT 1
                  FROM shared.commodity_code AS code
                  CROSS JOIN LATERAL unnest(code.keywords) AS keyword(value)
                 WHERE keyword.value <> lower(btrim(keyword.value))
                    OR length(keyword.value) < 2
                    OR keyword.value !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
             )
                OR EXISTS (
                    SELECT 1 FROM shared.commodity_code AS code
                     WHERE cardinality(code.keywords) <>
                           (SELECT count(DISTINCT value) FROM unnest(code.keywords) AS value)
                )
            UNION ALL
            SELECT 'industry keyword normalization invalid'
             WHERE EXISTS (
                SELECT 1
                  FROM shared.industry_code AS code
                  CROSS JOIN LATERAL unnest(code.keywords) AS keyword(value)
                 WHERE keyword.value <> lower(btrim(keyword.value))
                    OR length(keyword.value) < 2
                    OR keyword.value !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
             )
                OR EXISTS (
                    SELECT 1 FROM shared.industry_code AS code
                     WHERE cardinality(code.keywords) <>
                           (SELECT count(DISTINCT value) FROM unnest(code.keywords) AS value)
                )
      ) AS problems
     LIMIT 1;

    IF v_problem IS NOT NULL THEN
        RAISE EXCEPTION 'shared reference seed validation failed: %', v_problem
            USING ERRCODE = 'check_violation';
    END IF;

    PERFORM shared.repair_hierarchy_is_leaf('shared.commodity_code'::regclass);
    PERFORM shared.repair_hierarchy_is_leaf('shared.industry_code'::regclass);
END;
$$;
