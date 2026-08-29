\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN IF current_database()<>'athyper_neon' OR current_setting('app.database_plane',true)<>'neon' THEN RAISE EXCEPTION 'NEON supplier readiness migration requires athyper_neon and app.database_plane=neon'; END IF; END $$;

CREATE TABLE IF NOT EXISTS document.supplier_activation_evidence (
 id uuid NOT NULL DEFAULT shared.uuidv7(),tenant_id uuid NOT NULL,business_partner_id uuid NOT NULL,supplier_id uuid NOT NULL,
 operating_organization_id uuid NOT NULL,company_code_id uuid,business_date date NOT NULL,prior_status text NOT NULL,resulting_status text NOT NULL DEFAULT 'active',
 readiness_fingerprint text NOT NULL,readiness_evidence jsonb NOT NULL,idempotency_key text NOT NULL,command_fingerprint text NOT NULL,
 activated_at timestamptz NOT NULL DEFAULT now(),activated_by uuid NOT NULL,
 CONSTRAINT supplier_activation_evidence_pkey PRIMARY KEY(id),CONSTRAINT supplier_activation_evidence_tenant_id_uq UNIQUE(tenant_id,id),CONSTRAINT supplier_activation_evidence_idempotency_uq UNIQUE(tenant_id,idempotency_key),
 CONSTRAINT supplier_activation_evidence_status_chk CHECK(prior_status IN('onboarding','suspended','inactive') AND resulting_status='active'),
 CONSTRAINT supplier_activation_evidence_hash_chk CHECK(readiness_fingerprint~'^[a-f0-9]{64}$' AND command_fingerprint~'^[a-f0-9]{64}$'),
 CONSTRAINT supplier_activation_evidence_key_chk CHECK(btrim(idempotency_key)=idempotency_key AND length(idempotency_key) BETWEEN 8 AND 200),
 CONSTRAINT supplier_activation_evidence_payload_chk CHECK(jsonb_typeof(readiness_evidence)='object' AND readiness_evidence->>'decisionFingerprint'=readiness_fingerprint AND readiness_evidence->>'role'='supplier' AND (readiness_evidence->>'eligible')::boolean=true AND pg_column_size(readiness_evidence)<=262144),
 CONSTRAINT supplier_activation_evidence_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
 CONSTRAINT supplier_activation_evidence_partner_fk FOREIGN KEY(tenant_id,business_partner_id) REFERENCES master.business_partner(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT supplier_activation_evidence_supplier_fk FOREIGN KEY(tenant_id,supplier_id) REFERENCES master.supplier(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT supplier_activation_evidence_org_fk FOREIGN KEY(tenant_id,operating_organization_id) REFERENCES master.operating_organization(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT supplier_activation_evidence_company_fk FOREIGN KEY(tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT supplier_activation_evidence_actor_fk FOREIGN KEY(tenant_id,activated_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS supplier_activation_evidence_partner_idx ON document.supplier_activation_evidence(tenant_id,business_partner_id,activated_at DESC);
CREATE OR REPLACE FUNCTION document.trg_guard_supplier_activation_evidence() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'Supplier activation readiness evidence is immutable'; END $$;
DROP TRIGGER IF EXISTS trg_supplier_activation_evidence_immutable ON document.supplier_activation_evidence;
CREATE TRIGGER trg_supplier_activation_evidence_immutable BEFORE UPDATE OR DELETE ON document.supplier_activation_evidence FOR EACH ROW EXECUTE FUNCTION document.trg_guard_supplier_activation_evidence();
ALTER TABLE document.supplier_activation_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.supplier_activation_evidence FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_access ON document.supplier_activation_evidence;
CREATE POLICY tenant_access ON document.supplier_activation_evidence USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
DROP POLICY IF EXISTS seed_write ON document.supplier_activation_evidence;
CREATE POLICY seed_write ON document.supplier_activation_evidence FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT SELECT,INSERT ON document.supplier_activation_evidence TO athyperapp; END IF; IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT SELECT,INSERT ON document.supplier_activation_evidence TO athyperadmin; END IF; END $$;
REVOKE ALL ON FUNCTION document.trg_guard_supplier_activation_evidence() FROM PUBLIC;

CREATE TABLE IF NOT EXISTS document.supplier_registration_recovery (
 id uuid NOT NULL DEFAULT shared.uuidv7(),tenant_id uuid NOT NULL,invitation_id uuid NOT NULL,request_id uuid NOT NULL,
 prior_applicant_principal_id uuid NOT NULL,requested_applicant_principal_id uuid NOT NULL,reason text NOT NULL,status text NOT NULL DEFAULT 'requested',requested_at timestamptz NOT NULL DEFAULT now(),requested_by uuid NOT NULL,
 CONSTRAINT supplier_registration_recovery_pkey PRIMARY KEY(id),CONSTRAINT supplier_registration_recovery_tenant_id_uq UNIQUE(tenant_id,id),
 CONSTRAINT supplier_registration_recovery_status_chk CHECK(status='requested'),CONSTRAINT supplier_registration_recovery_reason_chk CHECK(length(btrim(reason)) BETWEEN 1 AND 4000),CONSTRAINT supplier_registration_recovery_principal_chk CHECK(prior_applicant_principal_id<>requested_applicant_principal_id),
 CONSTRAINT supplier_registration_recovery_invitation_fk FOREIGN KEY(tenant_id,invitation_id) REFERENCES document.supplier_registration_invitation(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT supplier_registration_recovery_request_fk FOREIGN KEY(tenant_id,request_id) REFERENCES document.business_partner_request(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT supplier_registration_recovery_prior_principal_fk FOREIGN KEY(tenant_id,prior_applicant_principal_id) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT supplier_registration_recovery_requested_principal_fk FOREIGN KEY(tenant_id,requested_applicant_principal_id) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT supplier_registration_recovery_actor_fk FOREIGN KEY(tenant_id,requested_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS supplier_registration_recovery_request_idx ON document.supplier_registration_recovery(tenant_id,request_id,requested_at DESC);
DROP TRIGGER IF EXISTS trg_supplier_registration_recovery_immutable ON document.supplier_registration_recovery;
CREATE TRIGGER trg_supplier_registration_recovery_immutable BEFORE UPDATE OR DELETE ON document.supplier_registration_recovery FOR EACH ROW EXECUTE FUNCTION document.trg_reject_update();
ALTER TABLE document.supplier_registration_recovery ENABLE ROW LEVEL SECURITY;ALTER TABLE document.supplier_registration_recovery FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_access ON document.supplier_registration_recovery;CREATE POLICY tenant_access ON document.supplier_registration_recovery USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
DROP POLICY IF EXISTS seed_write ON document.supplier_registration_recovery;CREATE POLICY seed_write ON document.supplier_registration_recovery FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT SELECT,INSERT ON document.supplier_registration_recovery TO athyperapp; END IF; IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT SELECT,INSERT ON document.supplier_registration_recovery TO athyperadmin; END IF; END $$;

CREATE OR REPLACE FUNCTION control.trg_guard_business_partner_qualification() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,control AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.business_partner_id IS DISTINCT FROM OLD.business_partner_id OR NEW.partner_role IS DISTINCT FROM OLD.partner_role OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by) THEN RAISE EXCEPTION 'Qualification identity and creation evidence are immutable' USING ERRCODE='check_violation'; END IF;
 IF TG_OP='UPDATE' AND OLD.decision<>'pending' AND (NOT (OLD.decision IN('approved','conditional') AND NEW.decision='expired') OR NEW.decision_idempotency_key IS DISTINCT FROM OLD.decision_idempotency_key OR NEW.decision_fingerprint IS DISTINCT FROM OLD.decision_fingerprint OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by OR NEW.approved_at IS DISTINCT FROM OLD.approved_at OR NEW.approved_by IS DISTINCT FROM OLD.approved_by) THEN RAISE EXCEPTION 'Qualification decision evidence is immutable' USING ERRCODE='check_violation'; END IF;
 IF TG_OP='UPDATE' AND NEW.row_version<>OLD.row_version+1 THEN RAISE EXCEPTION 'Qualification row version must advance exactly once' USING ERRCODE='check_violation'; END IF;
 IF NEW.decision='pending' AND (NEW.reviewed_at IS NOT NULL OR NEW.approved_at IS NOT NULL) THEN RAISE EXCEPTION 'Pending qualification cannot contain decision evidence' USING ERRCODE='check_violation'; END IF;
 IF NEW.decision IN('approved','conditional') AND NEW.reviewed_at IS NULL THEN RAISE EXCEPTION 'Approved qualification requires review evidence' USING ERRCODE='check_violation'; END IF;
 IF NEW.decision IN('rejected','suspended') AND NEW.reviewed_at IS NULL THEN RAISE EXCEPTION '% qualification requires review evidence',NEW.decision USING ERRCODE='check_violation'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION control.trg_guard_business_partner_qualification() FROM PUBLIC;
COMMIT;
