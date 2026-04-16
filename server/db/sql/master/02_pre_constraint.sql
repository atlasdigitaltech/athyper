-- ============================================================================
-- master/02_pre_constraint.sql
-- Concept: Owner Type Validation — fn_valid_owner_type() for polymorphic references
-- Depends on: 04_tables/003a_master_identity.sql, 05_pre_constraint_functions/001_shared.sql
-- ============================================================================
-- Execution order: 04_tables → 002_control → THIS → 06_constraints

-- fn_valid_owner_type — validation helper for trigger guards.
-- Returns true if the given code exists in owner_type and is active.
-- Tenant-aware: system rows (tenant_id IS NULL) always valid, plus tenant
-- extension rows if they belong to the current session tenant.
CREATE OR REPLACE FUNCTION master.fn_valid_owner_type(p_code text)
RETURNS boolean
LANGUAGE sql STABLE PARALLEL SAFE
SECURITY DEFINER
SET search_path = master, pg_catalog
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM master.owner_type otr
        WHERE otr.code   = p_code
          AND otr.status = 'active'
          AND (
              otr.tenant_id IS NULL
              OR otr.tenant_id = shared.current_tenant_id()
          )
    );
$$;
