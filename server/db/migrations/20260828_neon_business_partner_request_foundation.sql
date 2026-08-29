-- Install the NEON source-neutral Business Partner request, evidence, and
-- validation foundation. This migration is intentionally NEON-only.
BEGIN;

DO $$
BEGIN
  IF current_database() <> 'athyper_neon' THEN
    RAISE EXCEPTION 'Business Partner request foundation must target athyper_neon';
  END IF;
END $$;

CREATE TABLE document.business_partner_request (
  id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
  request_no text NOT NULL, request_kind text NOT NULL, source_kind text NOT NULL,
  target_business_partner_id uuid, base_record_version bigint,
  base_snapshot_id uuid, base_payload_hash text,
  source_system_code text, source_entity_code text, source_entity_id text,
  source_entity_code_value text, source_projection_id uuid,
  source_version bigint, source_payload_hash text,
  requested_role master.partner_role_d, operating_organization_id uuid, company_code_id uuid,
  payload_schema_code text NOT NULL, payload_schema_version integer NOT NULL,
  payload_schema_hash text NOT NULL, proposed_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  duplicate_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  change_impact jsonb NOT NULL DEFAULT '{}'::jsonb,
  workflow_request_id uuid, materialized_business_partner_id uuid,
  decision_fingerprint text, idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'draft', submitted_at timestamptz, submitted_by uuid,
  approved_at timestamptz, approved_by uuid, applied_at timestamptz, applied_by uuid,
  failure_code text, failure_detail text, support_reference text,
  row_version bigint NOT NULL DEFAULT 1, status_changed_at timestamptz, status_changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
  updated_at timestamptz, updated_by uuid,
  CONSTRAINT business_partner_request_pkey PRIMARY KEY(id),
  CONSTRAINT business_partner_request_tenant_id_uq UNIQUE(tenant_id,id),
  CONSTRAINT business_partner_request_no_uq UNIQUE(tenant_id,request_no),
  CONSTRAINT business_partner_request_idempotency_uq UNIQUE(tenant_id,idempotency_key),
  CONSTRAINT business_partner_request_no_chk CHECK(request_no~'^[A-Z][A-Z0-9_.-]{2,62}$'),
  CONSTRAINT business_partner_request_kind_chk CHECK(request_kind IN(
    'new_partner','amend_partner','add_supplier','add_customer','assign_organization',
    'configure_company','change_bank','deactivate','reactivate','archive')),
  CONSTRAINT business_partner_request_source_chk CHECK(source_kind IN('manual','mesh','import','api')),
  CONSTRAINT business_partner_request_target_chk CHECK(
    (request_kind='new_partner' AND target_business_partner_id IS NULL) OR
    (request_kind<>'new_partner' AND target_business_partner_id IS NOT NULL)),
  CONSTRAINT business_partner_request_base_chk CHECK(base_record_version IS NULL OR base_record_version>=1),
  CONSTRAINT business_partner_request_base_snapshot_chk CHECK(
    (base_snapshot_id IS NULL)=(base_payload_hash IS NULL) AND
    (base_payload_hash IS NULL OR base_payload_hash~'^[a-f0-9]{64}$')),
  CONSTRAINT business_partner_request_source_coordinates_chk CHECK(source_kind<>'mesh' OR(
    source_system_code='athyper_mesh' AND nullif(btrim(source_entity_code),'') IS NOT NULL AND
    nullif(btrim(source_entity_id),'') IS NOT NULL AND source_projection_id IS NOT NULL AND
    source_version>=1 AND source_payload_hash~'^[a-f0-9]{64}$')),
  CONSTRAINT business_partner_request_source_code_chk CHECK(
    source_system_code IS NULL OR source_system_code~'^[a-z][a-z0-9_.-]{1,62}$'),
  CONSTRAINT business_partner_request_source_entity_chk CHECK(
    source_entity_code IS NULL OR source_entity_code~'^[a-z][a-z0-9_.-]{1,126}$'),
  CONSTRAINT business_partner_request_source_version_chk CHECK(source_version IS NULL OR source_version>=1),
  CONSTRAINT business_partner_request_source_hash_chk CHECK(
    source_payload_hash IS NULL OR source_payload_hash~'^[a-f0-9]{64}$'),
  CONSTRAINT business_partner_request_schema_chk CHECK(
    payload_schema_code~'^[a-z][a-z0-9_.-]{1,126}$' AND payload_schema_version>=1 AND
    payload_schema_hash~'^[a-f0-9]{64}$'),
  CONSTRAINT business_partner_request_payload_chk CHECK(
    jsonb_typeof(proposed_payload)='object' AND jsonb_typeof(validation_summary)='object' AND
    jsonb_typeof(duplicate_summary)='object' AND jsonb_typeof(change_impact)='object' AND
    pg_column_size(proposed_payload)<=1048576 AND pg_column_size(validation_summary)<=262144 AND
    pg_column_size(duplicate_summary)<=262144 AND pg_column_size(change_impact)<=262144),
  CONSTRAINT business_partner_request_fingerprint_chk CHECK(
    decision_fingerprint IS NULL OR decision_fingerprint~'^[a-f0-9]{64}$'),
  CONSTRAINT business_partner_request_idempotency_chk CHECK(
    btrim(idempotency_key)=idempotency_key AND length(idempotency_key) BETWEEN 8 AND 200),
  CONSTRAINT business_partner_request_status_chk CHECK(status IN(
    'draft','validating','validation_failed','pending_approval','returned','approved','rejected',
    'applying','applied','failed','cancelled','superseded')),
  CONSTRAINT business_partner_request_submission_pair_chk CHECK((submitted_at IS NULL)=(submitted_by IS NULL)),
  CONSTRAINT business_partner_request_approval_pair_chk CHECK((approved_at IS NULL)=(approved_by IS NULL)),
  CONSTRAINT business_partner_request_apply_pair_chk CHECK((applied_at IS NULL)=(applied_by IS NULL)),
  CONSTRAINT business_partner_request_no_self_approval_chk CHECK(approved_by IS NULL OR approved_by IS DISTINCT FROM submitted_by),
  CONSTRAINT business_partner_request_failure_chk CHECK(
    (status='failed' AND nullif(btrim(failure_code),'') IS NOT NULL AND nullif(btrim(support_reference),'') IS NOT NULL)
    OR(status<>'failed' AND failure_code IS NULL AND failure_detail IS NULL)),
  CONSTRAINT business_partner_request_row_version_chk CHECK(row_version>=1),
  CONSTRAINT business_partner_request_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
  CONSTRAINT business_partner_request_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL)),
  CONSTRAINT business_partner_request_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
  CONSTRAINT business_partner_request_target_fk FOREIGN KEY(tenant_id,target_business_partner_id) REFERENCES master.business_partner(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT business_partner_request_base_snapshot_fk FOREIGN KEY(tenant_id,base_snapshot_id) REFERENCES snapshot.entity_snapshot_identity(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT business_partner_request_operating_org_fk FOREIGN KEY(tenant_id,operating_organization_id) REFERENCES master.operating_organization(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT business_partner_request_company_fk FOREIGN KEY(tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT business_partner_request_workflow_fk FOREIGN KEY(tenant_id,workflow_request_id) REFERENCES document.workflow_request(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT business_partner_request_materialized_fk FOREIGN KEY(tenant_id,materialized_business_partner_id) REFERENCES master.business_partner(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT business_partner_request_submitted_by_fk FOREIGN KEY(tenant_id,submitted_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT business_partner_request_approved_by_fk FOREIGN KEY(tenant_id,approved_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT business_partner_request_applied_by_fk FOREIGN KEY(tenant_id,applied_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT business_partner_request_status_by_fk FOREIGN KEY(tenant_id,status_changed_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT business_partner_request_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT business_partner_request_updated_by_fk FOREIGN KEY(tenant_id,updated_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT
);

CREATE TABLE document.business_partner_request_evidence (
  id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, request_id uuid NOT NULL,
  evidence_kind text NOT NULL, attachment_id uuid, snapshot_id uuid, source_reference text,
  content_hash text NOT NULL, classification_code text NOT NULL DEFAULT 'internal',
  verification_status text NOT NULL DEFAULT 'pending', verified_at timestamptz, verified_by uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
  CONSTRAINT business_partner_request_evidence_pkey PRIMARY KEY(id),
  CONSTRAINT business_partner_request_evidence_tenant_id_uq UNIQUE(tenant_id,id),
  CONSTRAINT business_partner_request_evidence_kind_chk CHECK(evidence_kind~'^[a-z][a-z0-9_.-]{1,62}$'),
  CONSTRAINT business_partner_request_evidence_source_chk CHECK(num_nonnulls(attachment_id,snapshot_id,source_reference)=1),
  CONSTRAINT business_partner_request_evidence_reference_chk CHECK(source_reference IS NULL OR length(btrim(source_reference)) BETWEEN 1 AND 1024),
  CONSTRAINT business_partner_request_evidence_hash_chk CHECK(content_hash~'^[a-f0-9]{64}$'),
  CONSTRAINT business_partner_request_evidence_classification_chk CHECK(classification_code IN('public','internal','confidential','restricted')),
  CONSTRAINT business_partner_request_evidence_verification_chk CHECK(verification_status IN('pending','verified','rejected','expired')),
  CONSTRAINT business_partner_request_evidence_verification_pair_chk CHECK((verified_at IS NULL)=(verified_by IS NULL)),
  CONSTRAINT business_partner_request_evidence_metadata_chk CHECK(jsonb_typeof(metadata)='object' AND pg_column_size(metadata)<=65536),
  CONSTRAINT business_partner_request_evidence_request_fk FOREIGN KEY(tenant_id,request_id) REFERENCES document.business_partner_request(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT business_partner_request_evidence_attachment_fk FOREIGN KEY(tenant_id,attachment_id) REFERENCES document.attachment(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT business_partner_request_evidence_snapshot_fk FOREIGN KEY(tenant_id,snapshot_id) REFERENCES snapshot.entity_snapshot_identity(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT business_partner_request_evidence_verified_by_fk FOREIGN KEY(tenant_id,verified_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT business_partner_request_evidence_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT
);

CREATE TABLE document.business_partner_request_validation (
  id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, request_id uuid NOT NULL,
  evaluation_id uuid NOT NULL, rule_code text NOT NULL, ruleset_code text NOT NULL,
  ruleset_version integer NOT NULL, ruleset_hash text NOT NULL, severity text NOT NULL,
  field_path text NOT NULL DEFAULT '$', outcome text NOT NULL, message_code text NOT NULL,
  evidence_reference jsonb NOT NULL DEFAULT '{}'::jsonb, evaluated_at timestamptz NOT NULL DEFAULT now(),
  evaluated_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
  CONSTRAINT business_partner_request_validation_pkey PRIMARY KEY(id),
  CONSTRAINT business_partner_request_validation_tenant_id_uq UNIQUE(tenant_id,id),
  CONSTRAINT business_partner_request_validation_coordinate_uq UNIQUE(tenant_id,request_id,evaluation_id,rule_code,field_path),
  CONSTRAINT business_partner_request_validation_rule_chk CHECK(rule_code~'^[a-z][a-z0-9_.-]{1,126}$'),
  CONSTRAINT business_partner_request_validation_ruleset_chk CHECK(ruleset_code~'^[a-z][a-z0-9_.-]{1,126}$' AND ruleset_version>=1 AND ruleset_hash~'^[a-f0-9]{64}$'),
  CONSTRAINT business_partner_request_validation_severity_chk CHECK(severity IN('info','warning','error')),
  CONSTRAINT business_partner_request_validation_path_chk CHECK(length(btrim(field_path)) BETWEEN 1 AND 512),
  CONSTRAINT business_partner_request_validation_outcome_chk CHECK(outcome IN('passed','failed','skipped')),
  CONSTRAINT business_partner_request_validation_message_chk CHECK(message_code~'^[A-Z][A-Z0-9_.-]{1,126}$'),
  CONSTRAINT business_partner_request_validation_evidence_chk CHECK(jsonb_typeof(evidence_reference)='object' AND pg_column_size(evidence_reference)<=65536),
  CONSTRAINT business_partner_request_validation_request_fk FOREIGN KEY(tenant_id,request_id) REFERENCES document.business_partner_request(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT business_partner_request_validation_evaluated_by_fk FOREIGN KEY(tenant_id,evaluated_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT business_partner_request_validation_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT
);

CREATE INDEX business_partner_request_status_idx ON document.business_partner_request(tenant_id,status,created_at DESC);
CREATE INDEX business_partner_request_target_idx ON document.business_partner_request(tenant_id,target_business_partner_id,created_at DESC) WHERE target_business_partner_id IS NOT NULL;
CREATE INDEX business_partner_request_workflow_idx ON document.business_partner_request(tenant_id,workflow_request_id) WHERE workflow_request_id IS NOT NULL;
CREATE INDEX business_partner_request_org_idx ON document.business_partner_request(tenant_id,operating_organization_id,status,created_at DESC) WHERE operating_organization_id IS NOT NULL;
CREATE INDEX business_partner_request_company_idx ON document.business_partner_request(tenant_id,company_code_id,status,created_at DESC) WHERE company_code_id IS NOT NULL;
CREATE INDEX business_partner_request_source_idx ON document.business_partner_request(tenant_id,source_system_code,source_entity_code,source_entity_id,source_version DESC) WHERE source_system_code IS NOT NULL;
CREATE UNIQUE INDEX business_partner_request_one_open_source_version_uq ON document.business_partner_request(tenant_id,source_system_code,source_entity_code,source_entity_id,source_version,request_kind) WHERE source_system_code IS NOT NULL AND status NOT IN('rejected','cancelled','superseded','applied');
CREATE INDEX business_partner_request_evidence_request_idx ON document.business_partner_request_evidence(tenant_id,request_id,created_at);
CREATE INDEX business_partner_request_validation_request_idx ON document.business_partner_request_validation(tenant_id,request_id,evaluation_id,severity,outcome);

CREATE OR REPLACE FUNCTION document.trg_guard_business_partner_request()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
DECLARE v_valid boolean:=false;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Business Partner requests cannot be deleted; cancel or supersede the request' USING ERRCODE='restrict_violation'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'draft' OR NEW.workflow_request_id IS NOT NULL OR NEW.materialized_business_partner_id IS NOT NULL OR
       NEW.submitted_at IS NOT NULL OR NEW.submitted_by IS NOT NULL OR NEW.approved_at IS NOT NULL OR
       NEW.approved_by IS NOT NULL OR NEW.applied_at IS NOT NULL OR NEW.applied_by IS NOT NULL
    THEN RAISE EXCEPTION 'New Business Partner requests must start as evidence-free drafts' USING ERRCODE='check_violation'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR
     NEW.request_no IS DISTINCT FROM OLD.request_no OR NEW.request_kind IS DISTINCT FROM OLD.request_kind OR
     NEW.source_kind IS DISTINCT FROM OLD.source_kind OR NEW.target_business_partner_id IS DISTINCT FROM OLD.target_business_partner_id OR
     NEW.source_system_code IS DISTINCT FROM OLD.source_system_code OR NEW.source_entity_code IS DISTINCT FROM OLD.source_entity_code OR
     NEW.source_entity_id IS DISTINCT FROM OLD.source_entity_id OR NEW.source_entity_code_value IS DISTINCT FROM OLD.source_entity_code_value OR
     NEW.source_projection_id IS DISTINCT FROM OLD.source_projection_id OR NEW.source_version IS DISTINCT FROM OLD.source_version OR
     NEW.source_payload_hash IS DISTINCT FROM OLD.source_payload_hash OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key OR
     NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by
  THEN RAISE EXCEPTION 'Business Partner request identity, target, kind, and creation evidence are immutable' USING ERRCODE='check_violation'; END IF;
  IF OLD.workflow_request_id IS NOT NULL AND NEW.workflow_request_id IS DISTINCT FROM OLD.workflow_request_id THEN
    RAISE EXCEPTION 'Business Partner request workflow binding is immutable once assigned' USING ERRCODE='check_violation'; END IF;
  IF OLD.approved_at IS NOT NULL AND(NEW.approved_at IS DISTINCT FROM OLD.approved_at OR NEW.approved_by IS DISTINCT FROM OLD.approved_by) THEN
    RAISE EXCEPTION 'Business Partner request approval evidence is immutable once recorded' USING ERRCODE='check_violation'; END IF;
  IF OLD.applied_at IS NOT NULL AND(NEW.applied_at IS DISTINCT FROM OLD.applied_at OR NEW.applied_by IS DISTINCT FROM OLD.applied_by OR NEW.materialized_business_partner_id IS DISTINCT FROM OLD.materialized_business_partner_id) THEN
    RAISE EXCEPTION 'Business Partner request application evidence is immutable once recorded' USING ERRCODE='check_violation'; END IF;
  IF OLD.status NOT IN('draft','validation_failed','returned') AND(
    NEW.base_record_version IS DISTINCT FROM OLD.base_record_version OR NEW.base_snapshot_id IS DISTINCT FROM OLD.base_snapshot_id OR NEW.base_payload_hash IS DISTINCT FROM OLD.base_payload_hash OR
    NEW.requested_role IS DISTINCT FROM OLD.requested_role OR NEW.operating_organization_id IS DISTINCT FROM OLD.operating_organization_id OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id OR
    NEW.payload_schema_code IS DISTINCT FROM OLD.payload_schema_code OR NEW.payload_schema_version IS DISTINCT FROM OLD.payload_schema_version OR NEW.payload_schema_hash IS DISTINCT FROM OLD.payload_schema_hash OR
    NEW.proposed_payload IS DISTINCT FROM OLD.proposed_payload OR NEW.validation_summary IS DISTINCT FROM OLD.validation_summary OR NEW.duplicate_summary IS DISTINCT FROM OLD.duplicate_summary OR
    NEW.change_impact IS DISTINCT FROM OLD.change_impact OR NEW.decision_fingerprint IS DISTINCT FROM OLD.decision_fingerprint)
  THEN RAISE EXCEPTION 'Submitted Business Partner request review coordinates and payload are immutable' USING ERRCODE='check_violation'; END IF;
  IF NEW.status=OLD.status THEN RETURN NEW; END IF;
  v_valid:=CASE OLD.status
    WHEN 'draft' THEN NEW.status IN('validating','cancelled')
    WHEN 'validating' THEN NEW.status IN('draft','validation_failed','pending_approval','cancelled')
    WHEN 'validation_failed' THEN NEW.status IN('draft','validating','cancelled')
    WHEN 'pending_approval' THEN NEW.status IN('returned','approved','rejected','cancelled')
    WHEN 'returned' THEN NEW.status IN('validating','cancelled','superseded')
    WHEN 'approved' THEN NEW.status='applying'
    WHEN 'applying' THEN NEW.status IN('applied','failed')
    WHEN 'failed' THEN NEW.status IN('applying','superseded') ELSE false END;
  IF NOT v_valid THEN RAISE EXCEPTION 'Invalid Business Partner request transition: % -> %',OLD.status,NEW.status USING ERRCODE='check_violation'; END IF;
  IF NEW.status IN('pending_approval','returned','approved','rejected','applying','applied','failed') AND
     (NEW.submitted_at IS NULL OR NEW.submitted_by IS NULL OR NEW.workflow_request_id IS NULL OR NEW.decision_fingerprint IS NULL)
  THEN RAISE EXCEPTION 'Submitted Business Partner request requires submission, workflow, and fingerprint evidence' USING ERRCODE='check_violation'; END IF;
  IF NEW.status IN('approved','applying','applied','failed') AND(NEW.approved_at IS NULL OR NEW.approved_by IS NULL)
  THEN RAISE EXCEPTION 'Approved Business Partner request requires approval evidence' USING ERRCODE='check_violation'; END IF;
  IF NEW.status='applied' AND(NEW.applied_at IS NULL OR NEW.applied_by IS NULL OR NEW.materialized_business_partner_id IS NULL)
  THEN RAISE EXCEPTION 'Applied Business Partner request requires application evidence and materialized partner' USING ERRCODE='check_violation'; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_business_partner_request_10_guard BEFORE INSERT OR UPDATE OR DELETE ON document.business_partner_request FOR EACH ROW EXECUTE FUNCTION document.trg_guard_business_partner_request();
CREATE TRIGGER trg_business_partner_request_20_status BEFORE UPDATE OF status,status_changed_at,status_changed_by ON document.business_partner_request FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence();
CREATE TRIGGER trg_business_partner_request_80_version BEFORE UPDATE ON document.business_partner_request FOR EACH ROW EXECUTE FUNCTION document.trg_increment_row_version();
CREATE TRIGGER trg_business_partner_request_90_updated BEFORE UPDATE ON document.business_partner_request FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER trg_business_partner_request_evidence_immutable BEFORE UPDATE OR DELETE ON document.business_partner_request_evidence FOR EACH ROW EXECUTE FUNCTION document.trg_reject_update();
CREATE TRIGGER trg_business_partner_request_validation_immutable BEFORE UPDATE OR DELETE ON document.business_partner_request_validation FOR EACH ROW EXECUTE FUNCTION document.trg_reject_update();

ALTER TABLE document.business_partner_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.business_partner_request FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON document.business_partner_request FOR ALL USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON document.business_partner_request FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
ALTER TABLE document.business_partner_request_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.business_partner_request_evidence FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON document.business_partner_request_evidence FOR SELECT USING(tenant_id=shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.business_partner_request_evidence FOR INSERT WITH CHECK(tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON document.business_partner_request_evidence FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
ALTER TABLE document.business_partner_request_validation ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.business_partner_request_validation FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON document.business_partner_request_validation FOR SELECT USING(tenant_id=shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.business_partner_request_validation FOR INSERT WITH CHECK(tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON document.business_partner_request_validation FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);

DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
    GRANT SELECT,INSERT,UPDATE ON document.business_partner_request TO athyperapp;
    GRANT SELECT,INSERT ON document.business_partner_request_evidence,document.business_partner_request_validation TO athyperapp;
    GRANT EXECUTE ON FUNCTION document.trg_guard_business_partner_request() TO athyperapp;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
    GRANT ALL PRIVILEGES ON document.business_partner_request,document.business_partner_request_evidence,document.business_partner_request_validation TO athyperadmin;
    GRANT EXECUTE ON FUNCTION document.trg_guard_business_partner_request() TO athyperadmin;
  END IF;
END $$;
REVOKE ALL ON document.business_partner_request,document.business_partner_request_evidence,document.business_partner_request_validation FROM PUBLIC;

COMMENT ON TABLE document.business_partner_request IS 'Source-neutral governed request for NEON Business Partner onboarding and change. Source systems never write the approved master directly.';
COMMENT ON TABLE document.business_partner_request_evidence IS 'Append-only evidence manifest for a Business Partner request.';
COMMENT ON TABLE document.business_partner_request_validation IS 'Append-only, ruleset-pinned validation result for a Business Partner request.';

COMMIT;
