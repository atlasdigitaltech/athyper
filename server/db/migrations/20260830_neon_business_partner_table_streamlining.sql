BEGIN;

DO $$ BEGIN
  IF current_database() <> 'athyper_neon'
     OR current_setting('app.database_plane', true) IS DISTINCT FROM 'neon' THEN
    RAISE EXCEPTION 'Business Partner table streamlining requires athyper_neon and app.database_plane=neon';
  END IF;
END $$;

-- The generalized invitation aggregate has been the only runtime write authority
-- since the invitation-generalization migration. Do not discard a legacy row
-- unless its exact identity was copied to that authority.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM document.supplier_registration_invitation_legacy legacy
    LEFT JOIN document.business_partner_invitation invitation
      ON invitation.tenant_id = legacy.tenant_id AND invitation.id = legacy.id
    WHERE invitation.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Legacy supplier invitations remain unmigrated';
  END IF;
END $$;

-- Preserve old recovery evidence in the generalized, idempotent authority.
INSERT INTO document.business_partner_invitation_recovery(
  id, tenant_id, invitation_id, request_id,
  prior_applicant_principal_id, requested_applicant_principal_id,
  reason, idempotency_key, status, requested_at, requested_by
)
SELECT
  id, tenant_id, invitation_id, request_id,
  prior_applicant_principal_id, requested_applicant_principal_id,
  reason, 'legacy-supplier-recovery:' || id::text, status, requested_at, requested_by
FROM document.supplier_registration_recovery
ON CONFLICT DO NOTHING;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM document.supplier_registration_recovery legacy
    LEFT JOIN document.business_partner_invitation_recovery recovery
      ON recovery.tenant_id=legacy.tenant_id
     AND recovery.idempotency_key='legacy-supplier-recovery:' || legacy.id::text
    WHERE recovery.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Legacy supplier recovery evidence remains unmigrated';
  END IF;
END $$;

-- The per-invitation policy stored hard-coded actions and fields that were not
-- enforced. Preserve only the independently meaningful revocation state on the
-- invitation authority itself.
ALTER TABLE document.business_partner_invitation
  ADD COLUMN applicant_access_revoked_at timestamptz,
  ADD COLUMN applicant_access_revoked_by uuid,
  ADD CONSTRAINT business_partner_invitation_access_revocation_chk
    CHECK (
      (applicant_access_revoked_at IS NULL AND applicant_access_revoked_by IS NULL)
      OR (status='accepted' AND applicant_principal_id IS NOT NULL AND applicant_access_revoked_at IS NOT NULL AND applicant_access_revoked_by IS NOT NULL)
    ),
  ADD CONSTRAINT business_partner_invitation_access_revoked_by_fk
    FOREIGN KEY (tenant_id, applicant_access_revoked_by)
    REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.business_partner_invitation DISABLE TRIGGER USER;
UPDATE document.business_partner_invitation invitation
SET applicant_access_revoked_at = policy.revoked_at,
    applicant_access_revoked_by = policy.revoked_by
FROM document.business_partner_invitation_applicant_policy policy
WHERE policy.tenant_id = invitation.tenant_id
  AND policy.invitation_id = invitation.id
  AND policy.revoked_at IS NOT NULL;
ALTER TABLE document.business_partner_invitation ENABLE TRIGGER USER;

CREATE OR REPLACE FUNCTION document.trg_guard_business_partner_invitation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Business Partner invitations cannot be deleted' USING ERRCODE='check_violation'; END IF;
 IF (NEW.id,NEW.tenant_id,NEW.invitation_no,NEW.journey_kind,NEW.registration_mode,NEW.requested_role,NEW.scope_kind,NEW.requested_operating_organization_id,NEW.company_code_id,NEW.legal_entity_id,NEW.org_unit_id,NEW.position_id,NEW.intended_party_name,NEW.invitee_email_hash,NEW.idempotency_key,NEW.created_at,NEW.created_by) IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.invitation_no,OLD.journey_kind,OLD.registration_mode,OLD.requested_role,OLD.scope_kind,OLD.requested_operating_organization_id,OLD.company_code_id,OLD.legal_entity_id,OLD.org_unit_id,OLD.position_id,OLD.intended_party_name,OLD.invitee_email_hash,OLD.idempotency_key,OLD.created_at,OLD.created_by) THEN RAISE EXCEPTION 'Invitation journey, authority, scope, recipient, and creation evidence are immutable' USING ERRCODE='check_violation'; END IF;
 IF OLD.status<>'pending' AND NOT (
   OLD.status='accepted' AND NEW.status='accepted'
   AND OLD.applicant_access_revoked_at IS NULL
   AND NEW.applicant_access_revoked_at IS NOT NULL
   AND NEW.applicant_access_revoked_by IS NOT NULL
   AND (to_jsonb(NEW)-ARRAY['applicant_access_revoked_at','applicant_access_revoked_by','row_version','updated_at','updated_by'])
       = (to_jsonb(OLD)-ARRAY['applicant_access_revoked_at','applicant_access_revoked_by','row_version','updated_at','updated_by'])
 ) THEN RAISE EXCEPTION 'Terminal Business Partner invitations are immutable except for one applicant-access revocation' USING ERRCODE='check_violation'; END IF;
 IF NEW.status='accepted' AND NEW.expires_at<=statement_timestamp() THEN RAISE EXCEPTION 'An expired invitation cannot be accepted' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
 IF NEW.status='pending' AND (NEW.token_hash=OLD.token_hash OR NEW.resend_count<>OLD.resend_count+1) AND (NEW.token_hash,NEW.expires_at,NEW.resend_count) IS DISTINCT FROM (OLD.token_hash,OLD.expires_at,OLD.resend_count) THEN RAISE EXCEPTION 'Resend must atomically rotate the token hash' USING ERRCODE='check_violation'; END IF;
 RETURN NEW;
END;
$$;

DROP TABLE document.business_partner_invitation_applicant_policy;
DROP TABLE document.supplier_registration_recovery;
DROP TABLE document.supplier_registration_invitation_legacy;

-- Evidence identity and payload remain immutable; only a single terminal
-- verification decision may replace the initial pending state.
ALTER TABLE document.business_partner_request_evidence
  DROP CONSTRAINT business_partner_request_evidence_verification_pair_chk,
  ADD CONSTRAINT business_partner_request_evidence_verification_pair_chk CHECK (
    (verification_status = 'pending' AND verified_at IS NULL AND verified_by IS NULL)
    OR (verification_status IN ('verified','rejected','expired') AND verified_at IS NOT NULL AND verified_by IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION document.trg_guard_business_partner_request_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Business Partner request evidence cannot be deleted' USING ERRCODE='restrict_violation';
  END IF;
  IF (NEW.id, NEW.tenant_id, NEW.request_id, NEW.evidence_kind, NEW.attachment_id,
      NEW.snapshot_id, NEW.source_reference, NEW.content_hash, NEW.classification_code,
      NEW.metadata, NEW.created_at, NEW.created_by)
     IS DISTINCT FROM
     (OLD.id, OLD.tenant_id, OLD.request_id, OLD.evidence_kind, OLD.attachment_id,
      OLD.snapshot_id, OLD.source_reference, OLD.content_hash, OLD.classification_code,
      OLD.metadata, OLD.created_at, OLD.created_by) THEN
    RAISE EXCEPTION 'Business Partner request evidence identity and payload are immutable' USING ERRCODE='restrict_violation';
  END IF;
  IF OLD.verification_status <> 'pending'
     OR NEW.verification_status NOT IN ('verified','rejected','expired')
     OR NEW.verified_at IS NULL OR NEW.verified_by IS NULL THEN
    RAISE EXCEPTION 'Evidence verification permits one pending-to-terminal transition' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER trg_business_partner_request_evidence_immutable ON document.business_partner_request_evidence;
CREATE TRIGGER trg_business_partner_request_evidence_guard
BEFORE UPDATE OR DELETE ON document.business_partner_request_evidence
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_business_partner_request_evidence();

-- Only the atomic resolution command may create a resolution receipt.
CREATE OR REPLACE FUNCTION document.fn_resolve_business_partner_duplicate(
  p_tenant_id uuid, p_duplicate_id uuid, p_survivor_id uuid,
  p_resolution_kind text, p_reason_code text, p_dependency_evidence jsonb,
  p_rekey_manifest jsonb, p_snapshot_id uuid, p_resolved_by uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, document, master, shared
AS $$
DECLARE v_id uuid;
BEGIN
  IF p_tenant_id IS DISTINCT FROM shared.current_tenant_id()
     OR p_resolved_by IS DISTINCT FROM master.current_principal_id_soft() THEN
    RAISE EXCEPTION 'Tenant or actor context mismatch' USING ERRCODE='insufficient_privilege';
  END IF;
  INSERT INTO document.business_partner_duplicate_resolution(
    tenant_id, duplicate_business_partner_id, surviving_business_partner_id,
    resolution_kind, reason_code, dependency_evidence, rekey_manifest, snapshot_id, resolved_by
  ) VALUES (
    p_tenant_id, p_duplicate_id, p_survivor_id, p_resolution_kind,
    p_reason_code, p_dependency_evidence, p_rekey_manifest, p_snapshot_id, p_resolved_by
  ) RETURNING id INTO v_id;
  UPDATE master.business_partner
  SET status='archived', status_changed_at=now(), status_changed_by=p_resolved_by, updated_by=p_resolved_by
  WHERE tenant_id=p_tenant_id AND id=p_duplicate_id AND status='inactive';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Duplicate supersession lost its lifecycle precondition' USING ERRCODE='serialization_failure';
  END IF;
  RETURN v_id;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
    REVOKE INSERT, UPDATE, DELETE ON document.business_partner_duplicate_resolution FROM athyperapp;
    GRANT SELECT ON document.business_partner_duplicate_resolution TO athyperapp;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
    REVOKE INSERT, UPDATE, DELETE ON document.business_partner_duplicate_resolution FROM athyperadmin;
    GRANT SELECT ON document.business_partner_duplicate_resolution TO athyperadmin;
  END IF;
END $$;

COMMIT;
