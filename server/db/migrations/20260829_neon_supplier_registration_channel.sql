-- Secure supplier-registration invitations and typed Business Partner request channels.

DO $$
BEGIN
  IF current_database() <> 'athyper_neon' OR current_setting('app.database_plane', true) <> 'neon' THEN
    RAISE EXCEPTION 'Supplier registration channel migration requires the NEON plane';
  END IF;
END $$;

CREATE TABLE document.supplier_registration_invitation (
  id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
  invitation_no text NOT NULL, requested_operating_organization_id uuid NOT NULL,
  optional_company_code_id uuid, intended_supplier_name text NOT NULL,
  invitee_email_hash text NOT NULL, token_hash text NOT NULL, expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending', applicant_principal_id uuid,
  business_partner_request_id uuid, accepted_at timestamptz, cancelled_at timestamptz,
  idempotency_key text NOT NULL, row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
  updated_at timestamptz, updated_by uuid,
  CONSTRAINT supplier_registration_invitation_pkey PRIMARY KEY(id),
  CONSTRAINT supplier_registration_invitation_tenant_id_uq UNIQUE(tenant_id,id),
  CONSTRAINT supplier_registration_invitation_no_uq UNIQUE(tenant_id,invitation_no),
  CONSTRAINT supplier_registration_invitation_idempotency_uq UNIQUE(tenant_id,idempotency_key),
  CONSTRAINT supplier_registration_invitation_token_uq UNIQUE(tenant_id,token_hash),
  CONSTRAINT supplier_registration_invitation_no_chk CHECK(invitation_no~'^SRI-[A-Z0-9][A-Z0-9.-]{2,58}$'),
  CONSTRAINT supplier_registration_invitation_name_chk CHECK(length(btrim(intended_supplier_name)) BETWEEN 1 AND 512),
  CONSTRAINT supplier_registration_invitation_hash_chk CHECK(invitee_email_hash~'^[a-f0-9]{64}$' AND token_hash~'^[a-f0-9]{64}$'),
  CONSTRAINT supplier_registration_invitation_status_chk CHECK(status IN('pending','accepted','cancelled','expired')),
  CONSTRAINT supplier_registration_invitation_lifecycle_chk CHECK(
    (status='pending' AND applicant_principal_id IS NULL AND business_partner_request_id IS NULL AND accepted_at IS NULL AND cancelled_at IS NULL)
    OR (status='accepted' AND applicant_principal_id IS NOT NULL AND business_partner_request_id IS NOT NULL AND accepted_at IS NOT NULL AND cancelled_at IS NULL)
    OR (status='cancelled' AND accepted_at IS NULL AND cancelled_at IS NOT NULL)
    OR (status='expired' AND accepted_at IS NULL AND cancelled_at IS NULL)),
  CONSTRAINT supplier_registration_invitation_expiry_chk CHECK(expires_at>created_at),
  CONSTRAINT supplier_registration_invitation_idempotency_chk CHECK(btrim(idempotency_key)=idempotency_key AND length(idempotency_key) BETWEEN 8 AND 200),
  CONSTRAINT supplier_registration_invitation_row_version_chk CHECK(row_version>=1),
  CONSTRAINT supplier_registration_invitation_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL)),
  CONSTRAINT supplier_registration_invitation_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
  CONSTRAINT supplier_registration_invitation_operating_org_fk FOREIGN KEY(tenant_id,requested_operating_organization_id) REFERENCES master.operating_organization(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT supplier_registration_invitation_company_fk FOREIGN KEY(tenant_id,optional_company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT supplier_registration_invitation_applicant_fk FOREIGN KEY(tenant_id,applicant_principal_id) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT supplier_registration_invitation_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT supplier_registration_invitation_updated_by_fk FOREIGN KEY(tenant_id,updated_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT
);

ALTER TABLE document.business_partner_request
  ADD COLUMN registration_mode text NOT NULL DEFAULT 'direct',
  ADD COLUMN invitation_id uuid,
  ADD COLUMN applicant_principal_id uuid,
  ADD COLUMN represented_party_name text,
  ADD COLUMN representation_evidence_id uuid;

UPDATE document.business_partner_request
SET registration_mode=CASE source_kind WHEN 'manual' THEN 'direct' ELSE 'integration' END;

ALTER TABLE document.business_partner_request DROP CONSTRAINT business_partner_request_source_chk;
ALTER TABLE document.business_partner_request
  ADD CONSTRAINT business_partner_request_source_chk CHECK(source_kind IN('manual','portal','mesh','import','api')),
  ADD CONSTRAINT business_partner_request_registration_mode_chk CHECK(registration_mode IN('direct','self_service','on_behalf','integration')),
  ADD CONSTRAINT business_partner_request_registration_channel_chk CHECK(
    (registration_mode='self_service' AND source_kind='portal' AND invitation_id IS NOT NULL AND applicant_principal_id IS NOT NULL AND represented_party_name IS NULL AND representation_evidence_id IS NULL)
    OR (registration_mode='on_behalf' AND source_kind='manual' AND invitation_id IS NULL AND applicant_principal_id IS NULL AND nullif(btrim(represented_party_name),'') IS NOT NULL)
    OR (registration_mode='integration' AND source_kind IN('mesh','import','api') AND invitation_id IS NULL AND applicant_principal_id IS NULL AND represented_party_name IS NULL AND representation_evidence_id IS NULL)
    OR (registration_mode='direct' AND source_kind='manual' AND invitation_id IS NULL AND applicant_principal_id IS NULL AND represented_party_name IS NULL AND representation_evidence_id IS NULL)),
  ADD CONSTRAINT business_partner_request_invitation_fk FOREIGN KEY(tenant_id,invitation_id) REFERENCES document.supplier_registration_invitation(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT business_partner_request_applicant_fk FOREIGN KEY(tenant_id,applicant_principal_id) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT business_partner_request_representation_evidence_fk FOREIGN KEY(tenant_id,representation_evidence_id) REFERENCES document.business_partner_request_evidence(tenant_id,id) ON DELETE RESTRICT;

ALTER TABLE document.supplier_registration_invitation
  ADD CONSTRAINT supplier_registration_invitation_request_fk FOREIGN KEY(tenant_id,business_partner_request_id) REFERENCES document.business_partner_request(tenant_id,id) ON DELETE RESTRICT;

CREATE INDEX supplier_registration_invitation_status_idx ON document.supplier_registration_invitation(tenant_id,status,expires_at);
CREATE INDEX supplier_registration_invitation_org_idx ON document.supplier_registration_invitation(tenant_id,requested_operating_organization_id,created_at DESC);
CREATE INDEX supplier_registration_invitation_request_idx ON document.supplier_registration_invitation(tenant_id,business_partner_request_id) WHERE business_partner_request_id IS NOT NULL;
CREATE UNIQUE INDEX business_partner_request_invitation_uq ON document.business_partner_request(tenant_id,invitation_id) WHERE invitation_id IS NOT NULL;

CREATE OR REPLACE FUNCTION document.trg_guard_supplier_registration_invitation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Supplier registration invitations cannot be deleted; cancel or expire the invitation' USING ERRCODE='restrict_violation'; END IF;
  IF TG_OP='UPDATE' AND (NEW.id,NEW.tenant_id,NEW.invitation_no,NEW.requested_operating_organization_id,NEW.optional_company_code_id,NEW.intended_supplier_name,NEW.invitee_email_hash,NEW.token_hash,NEW.expires_at,NEW.idempotency_key,NEW.created_at,NEW.created_by) IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.invitation_no,OLD.requested_operating_organization_id,OLD.optional_company_code_id,OLD.intended_supplier_name,OLD.invitee_email_hash,OLD.token_hash,OLD.expires_at,OLD.idempotency_key,OLD.created_at,OLD.created_by) THEN RAISE EXCEPTION 'Supplier registration invitation authority and creation evidence are immutable' USING ERRCODE='check_violation'; END IF;
  IF TG_OP='UPDATE' AND OLD.status<>'pending' THEN RAISE EXCEPTION 'Terminal supplier registration invitations are immutable' USING ERRCODE='check_violation'; END IF;
  IF TG_OP='UPDATE' AND NEW.status NOT IN('accepted','cancelled','expired') THEN RAISE EXCEPTION 'A pending supplier registration invitation may only be accepted, cancelled, or expired' USING ERRCODE='check_violation'; END IF;
  IF TG_OP='UPDATE' AND NEW.status='accepted' AND NEW.expires_at<=statement_timestamp() THEN RAISE EXCEPTION 'An expired supplier registration invitation cannot be accepted' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
  IF TG_OP='UPDATE' AND NEW.status='expired' AND NEW.expires_at>statement_timestamp() THEN RAISE EXCEPTION 'A supplier registration invitation cannot expire before its expiry time' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_supplier_registration_invitation_10_guard BEFORE UPDATE OR DELETE ON document.supplier_registration_invitation FOR EACH ROW EXECUTE FUNCTION document.trg_guard_supplier_registration_invitation();
CREATE TRIGGER trg_supplier_registration_invitation_80_version BEFORE UPDATE ON document.supplier_registration_invitation FOR EACH ROW EXECUTE FUNCTION document.trg_increment_row_version();
CREATE TRIGGER trg_supplier_registration_invitation_90_updated BEFORE UPDATE ON document.supplier_registration_invitation FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE OR REPLACE FUNCTION document.trg_guard_business_partner_request_registration() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
BEGIN
  IF TG_OP='UPDATE' AND (NEW.registration_mode,NEW.invitation_id,NEW.applicant_principal_id,NEW.represented_party_name) IS DISTINCT FROM (OLD.registration_mode,OLD.invitation_id,OLD.applicant_principal_id,OLD.represented_party_name) THEN RAISE EXCEPTION 'Business Partner registration channel identity is immutable' USING ERRCODE='check_violation'; END IF;
  IF TG_OP='UPDATE' AND OLD.status NOT IN('draft','validating','validation_failed','returned') AND NEW.representation_evidence_id IS DISTINCT FROM OLD.representation_evidence_id THEN RAISE EXCEPTION 'Submitted Business Partner representation evidence is immutable' USING ERRCODE='check_violation'; END IF;
  IF NEW.status IN('pending_approval','returned','approved','rejected','applying','applied','failed') AND NEW.registration_mode='on_behalf' AND NEW.representation_evidence_id IS NULL THEN RAISE EXCEPTION 'Submitted on-behalf registration requires representation evidence' USING ERRCODE='check_violation'; END IF;
  IF NEW.status IN('pending_approval','returned','approved','rejected','applying','applied','failed') AND NEW.registration_mode='self_service' AND NOT EXISTS(SELECT 1 FROM document.supplier_registration_invitation invitation WHERE invitation.tenant_id=NEW.tenant_id AND invitation.id=NEW.invitation_id AND invitation.status='accepted' AND invitation.business_partner_request_id=NEW.id AND invitation.applicant_principal_id=NEW.applicant_principal_id) THEN RAISE EXCEPTION 'Submitted self-service registration requires its accepted invitation binding' USING ERRCODE='check_violation'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_business_partner_request_15_registration_guard BEFORE INSERT OR UPDATE ON document.business_partner_request FOR EACH ROW EXECUTE FUNCTION document.trg_guard_business_partner_request_registration();

ALTER TABLE document.supplier_registration_invitation ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.supplier_registration_invitation FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON document.supplier_registration_invitation FOR ALL USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON document.supplier_registration_invitation FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);

DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
    GRANT SELECT,INSERT,UPDATE ON document.supplier_registration_invitation TO athyperapp;
    GRANT EXECUTE ON FUNCTION document.trg_guard_supplier_registration_invitation() TO athyperapp;
    GRANT EXECUTE ON FUNCTION document.trg_guard_business_partner_request_registration() TO athyperapp;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
    GRANT ALL PRIVILEGES ON document.supplier_registration_invitation TO athyperadmin;
    GRANT EXECUTE ON FUNCTION document.trg_guard_supplier_registration_invitation() TO athyperadmin;
    GRANT EXECUTE ON FUNCTION document.trg_guard_business_partner_request_registration() TO athyperadmin;
  END IF;
END $$;
REVOKE ALL ON document.supplier_registration_invitation FROM PUBLIC;

COMMENT ON TABLE document.supplier_registration_invitation IS 'Single-use, tenant-bound authority for external supplier self-registration. Only SHA-256 email and invitation-token hashes are persisted.';
