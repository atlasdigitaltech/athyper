CREATE OR REPLACE FUNCTION control.resolve_finance_posting_rollout_mode(
  p_tenant_id uuid,p_company_code_id uuid,p_as_of date DEFAULT CURRENT_DATE
) RETURNS text LANGUAGE sql STABLE
SET search_path=control,pg_catalog AS $$
  SELECT COALESCE((
    SELECT policy.rollout_mode
      FROM control.finance_posting_rollout_policy policy
     WHERE policy.tenant_id=p_tenant_id AND policy.status='active' AND policy.effective_from<=p_as_of
       AND (policy.company_code_id IS NULL OR policy.company_code_id=p_company_code_id)
     ORDER BY (policy.company_code_id IS NOT NULL) DESC,policy.effective_from DESC
     LIMIT 1
  ),'observe')
$$;

COMMENT ON FUNCTION control.resolve_finance_posting_rollout_mode(uuid,uuid,date) IS
  'Resolves Company override before tenant default. Missing policy is fail-safe observation mode.';

