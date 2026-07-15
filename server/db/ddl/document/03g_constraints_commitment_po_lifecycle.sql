-- Phase 0A compatibility migration: add the revisable rejected PO state to an
-- existing document.commitment table. The base table definition contains the
-- same constraint for fresh installations.

ALTER TABLE document.commitment
    DROP CONSTRAINT IF EXISTS cmt_status_chk;

ALTER TABLE document.commitment
    ADD CONSTRAINT cmt_status_chk CHECK (status IN (
        'draft','pending_approval','approved','active','partially_fulfilled',
        'fully_fulfilled','closed','cancelled','expired','suspended','rejected'
    ));
