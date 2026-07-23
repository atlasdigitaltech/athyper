CREATE INDEX IF NOT EXISTS ix_bal_company_effective_stage_e ON master.bank_account_link
  (tenant_id,owner_id,effective_from,effective_until) WHERE owner_type='company_code';
CREATE INDEX IF NOT EXISTS ix_ba_treasury_currency ON master.bank_account(tenant_id,currency_code,status);
