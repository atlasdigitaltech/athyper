-- 08_functions/003d_master_finance.sql
-- Finance-specific master functions.
-- Depends on: 04_tables/003b_master_finance.sql

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
