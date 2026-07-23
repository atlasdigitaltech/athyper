DO $$ BEGIN ALTER TABLE control.finance_posting_rollout_policy ADD CONSTRAINT fprp_tenant_fk
  FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE control.finance_posting_rollout_policy ADD CONSTRAINT fprp_company_fk
  FOREIGN KEY (tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

