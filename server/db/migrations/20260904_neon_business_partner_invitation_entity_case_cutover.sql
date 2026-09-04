-- Transitional invitation identity for the governed Business Partner case
-- cutover. Existing accepted invitations retain their legacy request binding;
-- new acceptances bind only an entity case. No dual-write state is permitted.

DO $$ BEGIN
  IF current_database()<>'athyper_neon' OR current_setting('app.database_plane',true)<>'neon' THEN
    RAISE EXCEPTION 'Business Partner invitation case cutover requires NEON';
  END IF;
END $$;

ALTER TABLE document.business_partner_invitation ADD COLUMN entity_case_id uuid;
ALTER TABLE document.business_partner_invitation_recovery
  ALTER COLUMN request_id DROP NOT NULL,
  ADD COLUMN entity_case_id uuid;

ALTER TABLE document.business_partner_invitation
  DROP CONSTRAINT business_partner_invitation_lifecycle_chk,
  ADD CONSTRAINT business_partner_invitation_lifecycle_chk CHECK(
    (status='pending' AND applicant_principal_id IS NULL AND business_partner_request_id IS NULL AND entity_case_id IS NULL AND accepted_at IS NULL AND cancelled_at IS NULL AND superseded_at IS NULL)
    OR (status='accepted' AND applicant_principal_id IS NOT NULL AND num_nonnulls(business_partner_request_id,entity_case_id)=1 AND accepted_at IS NOT NULL AND cancelled_at IS NULL AND superseded_at IS NULL)
    OR (status='cancelled' AND accepted_at IS NULL AND cancelled_at IS NOT NULL AND superseded_at IS NULL)
    OR (status='expired' AND accepted_at IS NULL AND cancelled_at IS NULL AND superseded_at IS NULL)
    OR (status='superseded' AND accepted_at IS NULL AND cancelled_at IS NULL AND superseded_at IS NOT NULL)
  ),
  ADD CONSTRAINT business_partner_invitation_entity_case_fk
    FOREIGN KEY(tenant_id,entity_case_id) REFERENCES document.entity_case(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE document.business_partner_invitation_recovery
  ADD CONSTRAINT business_partner_invitation_recovery_subject_chk CHECK(num_nonnulls(request_id,entity_case_id)=1),
  ADD CONSTRAINT business_partner_invitation_recovery_entity_case_fk
    FOREIGN KEY(tenant_id,entity_case_id) REFERENCES document.entity_case(tenant_id,id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX business_partner_invitation_entity_case_uq
  ON document.business_partner_invitation(tenant_id,entity_case_id)
  WHERE entity_case_id IS NOT NULL;

COMMENT ON COLUMN document.business_partner_invitation.entity_case_id IS
  'Governed case created by a new invitation acceptance. Mutually exclusive with the retained historical business_partner_request_id.';
COMMENT ON COLUMN document.business_partner_invitation_recovery.entity_case_id IS
  'Governed recovery subject for post-cutover invitations; mutually exclusive with the historical request_id.';

CREATE OR REPLACE FUNCTION document.trg_guard_entity_case_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,event AS $$
DECLARE execution uuid:=NULLIF(current_setting('app.entity_case_command_execution_id',true),'')::uuid;tenant uuid:=COALESCE(NEW.tenant_id,OLD.tenant_id);
BEGIN
 IF execution IS NULL OR NOT EXISTS(SELECT 1 FROM event.command_execution e WHERE e.id=execution AND e.tenant_id=tenant AND e.command_code IN('entity.case.draft.write','entity.case.lifecycle','entity.case.materialize.internal_business_partner','entity.case.materialize.business_partner_role','entity.case.backfill.business_partner_request') AND e.status='processing' AND e.actor_principal_id=master.current_principal_id_soft()) THEN RAISE EXCEPTION 'Entity case mutations require the governed command' USING ERRCODE='insufficient_privilege';END IF;RETURN COALESCE(NEW,OLD);
END $$;

\ir ../ddl/planes/neon/document/07_g6_business_partner_request_case_backfill.sql
