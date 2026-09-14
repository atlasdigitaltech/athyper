-- Studio only. No grants or publication/activation rows are changed.
BEGIN;
ALTER TABLE snapshot.business_partner_case_contract_revision
  ALTER COLUMN previous_contract_id DROP NOT NULL,
  ALTER COLUMN previous_contract_hash DROP NOT NULL,
  DROP CONSTRAINT business_partner_case_contract_revisi_previous_release_no_check;
ALTER TABLE snapshot.business_partner_case_contract_revision
  ADD CONSTRAINT business_partner_case_contract_revision_predecessor_check CHECK (
    (previous_contract_id IS NULL AND previous_contract_hash IS NULL AND previous_release_no=0)
    OR (previous_contract_id IS NOT NULL AND previous_contract_hash IS NOT NULL AND previous_release_no>0)
  );
COMMIT;
