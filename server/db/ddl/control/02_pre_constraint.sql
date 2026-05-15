-- ============================================================================
-- control/02_pre_constraint.sql
-- Concept: Lookup Validation — fn_valid_lookup() and trg_validate_lookup_columns()
-- Depends on: 04_tables/002_control.sql, 05_pre_constraint_functions/001_shared.sql
-- ============================================================================
-- Execution order: 04_tables → 001_shared → THIS → 06_constraints

-- fn_valid_lookup — tenant-aware validation.
-- Global (system) rows always valid. Tenant extension rows valid only if
-- domain is_extensible=true AND row belongs to the calling tenant's session.
CREATE OR REPLACE FUNCTION control.fn_valid_lookup(p_domain_code text, p_code text)
RETURNS boolean
LANGUAGE sql STABLE PARALLEL SAFE
SECURITY DEFINER
SET search_path = control, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM control.lookup_value  lv
    JOIN control.lookup_domain ld ON ld.code = lv.domain_code
    WHERE lv.domain_code = p_domain_code
      AND lv.code        = p_code
      AND lv.status      = 'active'
      AND (
          lv.tenant_id IS NULL
          OR (
              ld.is_extensible = true
              AND lv.tenant_id = shared.current_tenant_id()
          )
      )
  );
$$;

-- fn_valid_lookup_nullable — overload for nullable columns.
CREATE OR REPLACE FUNCTION control.fn_valid_lookup_nullable(p_domain_code text, p_code text)
RETURNS boolean
LANGUAGE sql STABLE PARALLEL SAFE
SECURITY DEFINER
SET search_path = control, pg_catalog
AS $$
  SELECT p_code IS NULL OR control.fn_valid_lookup(p_domain_code, p_code);
$$;


