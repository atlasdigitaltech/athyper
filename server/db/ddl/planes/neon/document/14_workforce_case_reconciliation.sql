-- Add the lifecycle coordinates already consumed by the Workforce repositories.
-- Existing cases remain intact; all new fields are nullable except safe versions.
ALTER TABLE document.onboarding_case
  ADD COLUMN IF NOT EXISTS row_version bigint NOT NULL DEFAULT 1;
ALTER TABLE document.onboarding_case
  ADD CONSTRAINT onboarding_case_row_version_chk CHECK (row_version >= 1);

ALTER TABLE document.offboarding_case
  ADD COLUMN IF NOT EXISTS employment_id uuid,
  ADD COLUMN IF NOT EXISTS employment_terminated_at timestamptz,
  ADD COLUMN IF NOT EXISTS resource_checklist_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS access_deprovision_status text NOT NULL DEFAULT 'not_requested',
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS row_version bigint NOT NULL DEFAULT 1;
ALTER TABLE document.offboarding_case
  ADD CONSTRAINT offboarding_case_row_version_chk CHECK (row_version >= 1),
  ADD CONSTRAINT offboarding_case_access_status_chk CHECK (access_deprovision_status IN ('not_requested','requested','provisioning','deprovisioned','failed')),
  ADD CONSTRAINT offboarding_case_idempotency_chk CHECK (idempotency_key IS NULL OR length(btrim(idempotency_key)) BETWEEN 8 AND 160),
  ADD CONSTRAINT offboarding_case_employment_fk FOREIGN KEY (tenant_id,employment_id) REFERENCES master.employment(tenant_id,id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS offboarding_case_idempotency_uq
  ON document.offboarding_case(tenant_id,idempotency_key) WHERE idempotency_key IS NOT NULL;

-- The employment may be absent on legacy cases, but any supplied value must
-- belong to the case employee in the same tenant.
CREATE OR REPLACE FUNCTION document.trg_validate_offboarding_employment()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document,master AS $$
BEGIN
  IF NEW.employment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM master.employment employment
    WHERE employment.tenant_id=NEW.tenant_id AND employment.id=NEW.employment_id
      AND employment.employee_id=NEW.employee_id
  ) THEN
    RAISE EXCEPTION 'Offboarding employment must belong to the case employee'
      USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_offboarding_case_14_employment ON document.offboarding_case;
CREATE TRIGGER trg_offboarding_case_14_employment
  BEFORE INSERT OR UPDATE OF employee_id,employment_id ON document.offboarding_case
  FOR EACH ROW EXECUTE FUNCTION document.trg_validate_offboarding_employment();
REVOKE ALL ON FUNCTION document.trg_validate_offboarding_employment() FROM PUBLIC;
