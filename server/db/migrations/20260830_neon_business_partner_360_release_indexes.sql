BEGIN;

DO $$
BEGIN
  IF current_database() <> 'athyper_neon' THEN
    RAISE EXCEPTION 'Business Partner 360 release indexes must target athyper_neon';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS business_partner_request_materialized_partner_idx
  ON document.business_partner_request
     (tenant_id, materialized_business_partner_id, created_at DESC, id DESC)
  WHERE materialized_business_partner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS business_partner_bank_verification_partner_idx
  ON document.business_partner_bank_verification
     (tenant_id, business_partner_id, company_code_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS certification_current_owner_idx
  ON master.certification
     (tenant_id, owner_type, owner_id, effective_from, effective_until)
  WHERE status = 'active';

COMMIT;
