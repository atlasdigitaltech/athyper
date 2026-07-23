CREATE INDEX IF NOT EXISTS ix_fprp_resolve
  ON control.finance_posting_rollout_policy(tenant_id,company_code_id,effective_from DESC)
  WHERE status='active';

