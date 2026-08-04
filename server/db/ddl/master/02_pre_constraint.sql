-- ============================================================================
-- master/02_pre_constraint.sql
-- Order-sensitive routines reconstructed from the live catalog.
-- Generated from the live Neon database master schema. Do not hand-edit.
-- ============================================================================

CREATE OR REPLACE FUNCTION master.fn_valid_owner_type(p_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE PARALLEL SAFE SECURITY DEFINER
 SET search_path TO 'master', 'pg_catalog'
AS $function$
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
$function$;
