-- Preserve the case created by approved request materialization for replay and audit.
ALTER TABLE document.workforce_request
  ADD COLUMN IF NOT EXISTS materialized_offboarding_case_id uuid;
ALTER TABLE document.workforce_request
  ADD CONSTRAINT workforce_request_offboarding_case_fk
    FOREIGN KEY (tenant_id,materialized_offboarding_case_id)
    REFERENCES document.offboarding_case(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.workforce_request
  ADD CONSTRAINT workforce_request_applied_offboarding_case_chk
    CHECK (status<>'applied' OR request_kind<>'offboard_employment' OR materialized_offboarding_case_id IS NOT NULL)
    NOT VALID;
CREATE UNIQUE INDEX IF NOT EXISTS workforce_request_offboarding_case_uq
  ON document.workforce_request(tenant_id,materialized_offboarding_case_id)
  WHERE materialized_offboarding_case_id IS NOT NULL;
