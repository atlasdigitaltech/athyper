\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
  IF current_database() <> 'athyper_neon' OR current_setting('app.database_plane', true) <> 'neon' THEN
    RAISE EXCEPTION 'Internal partner and customer designation migration requires the NEON plane';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('master.legal_entity_internal_partner_link') IS NULL
     AND EXISTS (SELECT 1 FROM pg_class WHERE oid = to_regclass('master.legal_entity_business_partner_link') AND relkind IN ('r','p')) THEN
    ALTER TABLE master.legal_entity_business_partner_link RENAME TO legal_entity_internal_partner_link;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'master.legal_entity_internal_partner_link'::regclass AND conname = 'legal_entity_business_partner_link_pkey') THEN
    ALTER TABLE master.legal_entity_internal_partner_link RENAME CONSTRAINT legal_entity_business_partner_link_pkey TO legal_entity_internal_partner_link_pkey;
    ALTER TABLE master.legal_entity_internal_partner_link RENAME CONSTRAINT legal_entity_business_partner_link_tenant_id_uq TO legal_entity_internal_partner_link_tenant_id_uq;
    ALTER TABLE master.legal_entity_internal_partner_link RENAME CONSTRAINT legal_entity_business_partner_link_range_chk TO legal_entity_internal_partner_link_range_chk;
    ALTER TABLE master.legal_entity_internal_partner_link RENAME CONSTRAINT legal_entity_business_partner_link_metadata_chk TO legal_entity_internal_partner_link_metadata_chk;
    ALTER TABLE master.legal_entity_internal_partner_link RENAME CONSTRAINT legal_entity_business_partner_link_status_pair_chk TO legal_entity_internal_partner_link_status_pair_chk;
    ALTER TABLE master.legal_entity_internal_partner_link RENAME CONSTRAINT legal_entity_business_partner_link_audit_pair_chk TO legal_entity_internal_partner_link_audit_pair_chk;
    ALTER TABLE master.legal_entity_internal_partner_link RENAME CONSTRAINT legal_entity_business_partner_link_legal_entity_fk TO legal_entity_internal_partner_link_legal_entity_fk;
    ALTER TABLE master.legal_entity_internal_partner_link RENAME CONSTRAINT legal_entity_business_partner_link_partner_fk TO legal_entity_internal_partner_link_partner_fk;
  END IF;
  IF to_regclass('master.legal_entity_business_partner_link_legal_uq') IS NOT NULL THEN
    ALTER INDEX master.legal_entity_business_partner_link_legal_uq RENAME TO legal_entity_internal_partner_link_legal_uq;
    ALTER INDEX master.legal_entity_business_partner_link_partner_uq RENAME TO legal_entity_internal_partner_link_partner_uq;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'master.legal_entity_internal_partner_link'::regclass AND tgname = 'trg_legal_entity_business_partner_link_validate') THEN
    ALTER TRIGGER trg_legal_entity_business_partner_link_validate ON master.legal_entity_internal_partner_link RENAME TO trg_legal_entity_internal_partner_link_validate;
  END IF;
END $$;

COMMENT ON TABLE master.legal_entity_internal_partner_link IS
  'Optional effective-dated one-to-one mapping from a statutory legal entity to the internal Business Partner identity used for intercompany counterparty operations.';

CREATE OR REPLACE VIEW master.legal_entity_business_partner_link
WITH (security_invoker = true, security_barrier = true) AS
SELECT id, tenant_id, legal_entity_id, business_partner_id,
       effective_from, effective_until, notes, metadata, status, is_active,
       status_changed_at, status_changed_by, created_at, created_by,
       updated_at, updated_by
FROM master.legal_entity_internal_partner_link;

COMMENT ON VIEW master.legal_entity_business_partner_link IS
  'Deprecated read-compatibility alias. New code must use master.legal_entity_internal_partner_link.';

DO $$ BEGIN
  CREATE DOMAIN control.customer_account_designation_status_d AS text
    CHECK (VALUE IN ('pending', 'approved', 'rejected', 'revoked'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE DOMAIN control.customer_account_designation_type_d AS text
    CHECK (VALUE IN ('key_account', 'strategic', 'priority_service'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS control.customer_account_designation (
  id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
  business_partner_id uuid NOT NULL, customer_id uuid NOT NULL,
  operating_organization_id uuid NOT NULL, company_code_id uuid,
  designation_type control.customer_account_designation_type_d NOT NULL,
  priority_tier smallint, effective_from date NOT NULL, effective_until date,
  rationale text NOT NULL,
  status control.customer_account_designation_status_d NOT NULL DEFAULT 'pending',
  idempotency_key text NOT NULL, decision_reason text, reviewed_at timestamptz, reviewed_by uuid,
  approved_at timestamptz, approved_by uuid, decision_idempotency_key text, decision_fingerprint text,
  revocation_reason text, revoked_at timestamptz, revoked_by uuid,
  revocation_idempotency_key text, revocation_fingerprint text,
  row_version bigint NOT NULL DEFAULT 1, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
  updated_at timestamptz, updated_by uuid,
  CONSTRAINT customer_account_designation_pkey PRIMARY KEY (id),
  CONSTRAINT customer_account_designation_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT customer_account_designation_priority_chk CHECK (priority_tier IS NULL OR priority_tier BETWEEN 1 AND 5),
  CONSTRAINT customer_account_designation_idempotency_chk CHECK (btrim(idempotency_key) = idempotency_key AND length(idempotency_key) BETWEEN 8 AND 200),
  CONSTRAINT customer_account_designation_decision_key_chk CHECK (decision_idempotency_key IS NULL OR (btrim(decision_idempotency_key) = decision_idempotency_key AND length(decision_idempotency_key) BETWEEN 8 AND 200)),
  CONSTRAINT customer_account_designation_revocation_key_chk CHECK (revocation_idempotency_key IS NULL OR (btrim(revocation_idempotency_key) = revocation_idempotency_key AND length(revocation_idempotency_key) BETWEEN 8 AND 200)),
  CONSTRAINT customer_account_designation_fingerprint_chk CHECK ((decision_fingerprint IS NULL OR decision_fingerprint ~ '^[a-f0-9]{64}$') AND (revocation_fingerprint IS NULL OR revocation_fingerprint ~ '^[a-f0-9]{64}$')),
  CONSTRAINT customer_account_designation_range_chk CHECK (effective_until IS NULL OR effective_until > effective_from),
  CONSTRAINT customer_account_designation_reason_chk CHECK (length(rationale) BETWEEN 1 AND 4000 AND (decision_reason IS NULL OR length(decision_reason) BETWEEN 1 AND 4000) AND (revocation_reason IS NULL OR length(revocation_reason) BETWEEN 1 AND 4000)),
  CONSTRAINT customer_account_designation_review_pair_chk CHECK ((reviewed_at IS NULL) = (reviewed_by IS NULL)),
  CONSTRAINT customer_account_designation_approval_pair_chk CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
  CONSTRAINT customer_account_designation_revoke_pair_chk CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
  CONSTRAINT customer_account_designation_state_evidence_chk CHECK (
    (status = 'pending' AND reviewed_at IS NULL AND approved_at IS NULL AND decision_idempotency_key IS NULL AND decision_fingerprint IS NULL AND revoked_at IS NULL AND revocation_idempotency_key IS NULL AND revocation_fingerprint IS NULL)
    OR (status = 'approved' AND reviewed_at IS NOT NULL AND approved_at IS NOT NULL AND decision_idempotency_key IS NOT NULL AND decision_fingerprint IS NOT NULL AND revoked_at IS NULL AND revocation_idempotency_key IS NULL AND revocation_fingerprint IS NULL)
    OR (status = 'rejected' AND reviewed_at IS NOT NULL AND approved_at IS NULL AND decision_idempotency_key IS NOT NULL AND decision_fingerprint IS NOT NULL AND revoked_at IS NULL AND revocation_idempotency_key IS NULL AND revocation_fingerprint IS NULL)
    OR (status = 'revoked' AND reviewed_at IS NOT NULL AND approved_at IS NOT NULL AND decision_idempotency_key IS NOT NULL AND decision_fingerprint IS NOT NULL AND revoked_at IS NOT NULL AND revocation_idempotency_key IS NOT NULL AND revocation_fingerprint IS NOT NULL)),
  CONSTRAINT customer_account_designation_no_self_approval_chk CHECK (reviewed_by IS NULL OR reviewed_by <> created_by),
  CONSTRAINT customer_account_designation_row_version_chk CHECK (row_version >= 1),
  CONSTRAINT customer_account_designation_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT customer_account_designation_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL)),
  CONSTRAINT customer_account_designation_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE RESTRICT,
  CONSTRAINT customer_account_designation_partner_fk FOREIGN KEY (tenant_id, business_partner_id) REFERENCES master.business_partner (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT customer_account_designation_customer_fk FOREIGN KEY (tenant_id, customer_id) REFERENCES master.customer (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT customer_account_designation_org_fk FOREIGN KEY (tenant_id, operating_organization_id) REFERENCES master.operating_organization (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT customer_account_designation_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT customer_account_designation_reviewed_by_fk FOREIGN KEY (tenant_id, reviewed_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT customer_account_designation_approved_by_fk FOREIGN KEY (tenant_id, approved_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT customer_account_designation_revoked_by_fk FOREIGN KEY (tenant_id, revoked_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT customer_account_designation_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT customer_account_designation_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal (tenant_id, id) ON DELETE RESTRICT
);

COMMENT ON TABLE control.customer_account_designation IS
  'Governed effective-dated customer account designation by sales operating organization and optional company code. It models key-account, strategic, and priority-service decisions separately from supplier preference, credit, eligibility, and customer master status.';
COMMENT ON COLUMN control.customer_account_designation.priority_tier IS
  'Optional tenant-defined priority from 1 (highest) through 5 (lowest); it does not grant credit or override blocks.';

CREATE UNIQUE INDEX IF NOT EXISTS customer_account_designation_idempotency_uq ON control.customer_account_designation (tenant_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS customer_account_designation_decision_idempotency_uq ON control.customer_account_designation (tenant_id, decision_idempotency_key) WHERE decision_idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS customer_account_designation_revocation_idempotency_uq ON control.customer_account_designation (tenant_id, revocation_idempotency_key) WHERE revocation_idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS customer_account_designation_resolution_idx ON control.customer_account_designation (tenant_id, business_partner_id, operating_organization_id, company_code_id, designation_type, status, effective_from, effective_until);
CREATE INDEX IF NOT EXISTS customer_account_designation_customer_idx ON control.customer_account_designation (tenant_id, customer_id, operating_organization_id, status);

CREATE OR REPLACE FUNCTION control.trg_validate_customer_account_designation_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, control, master AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM master.customer customer WHERE customer.tenant_id=NEW.tenant_id AND customer.id=NEW.customer_id AND customer.business_partner_id=NEW.business_partner_id AND customer.status<>'archived') THEN
    RAISE EXCEPTION 'Customer does not belong to the selected business partner' USING ERRCODE='check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM master.business_partner_operating_organization_assignment assignment WHERE assignment.tenant_id=NEW.tenant_id AND assignment.business_partner_id=NEW.business_partner_id AND assignment.operating_organization_id=NEW.operating_organization_id AND assignment.partner_role='customer' AND assignment.status='active' AND assignment.effective_from<=NEW.effective_from AND (assignment.effective_until IS NULL OR assignment.effective_until>NEW.effective_from) AND (assignment.effective_until IS NULL OR (NEW.effective_until IS NOT NULL AND assignment.effective_until>=NEW.effective_until))) THEN
    RAISE EXCEPTION 'Customer is not actively assigned to the selected sales organization at effective start' USING ERRCODE='check_violation';
  END IF;
  IF NEW.company_code_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM master.operating_organization_company_assignment assignment WHERE assignment.tenant_id=NEW.tenant_id AND assignment.operating_organization_id=NEW.operating_organization_id AND assignment.company_code_id=NEW.company_code_id AND assignment.status='active' AND assignment.effective_from<=NEW.effective_from AND (assignment.effective_until IS NULL OR assignment.effective_until>NEW.effective_from) AND (assignment.effective_until IS NULL OR (NEW.effective_until IS NOT NULL AND assignment.effective_until>=NEW.effective_until))) THEN
    RAISE EXCEPTION 'Company code does not actively participate in the selected sales organization for the designation period' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION control.trg_guard_customer_account_designation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, control AS $$
BEGIN
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.business_partner_id IS DISTINCT FROM OLD.business_partner_id OR NEW.customer_id IS DISTINCT FROM OLD.customer_id OR NEW.operating_organization_id IS DISTINCT FROM OLD.operating_organization_id OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id OR NEW.designation_type IS DISTINCT FROM OLD.designation_type OR NEW.priority_tier IS DISTINCT FROM OLD.priority_tier OR NEW.effective_from IS DISTINCT FROM OLD.effective_from OR NEW.effective_until IS DISTINCT FROM OLD.effective_until OR NEW.rationale IS DISTINCT FROM OLD.rationale OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by) THEN RAISE EXCEPTION 'Customer account designation scope and creation evidence are immutable' USING ERRCODE='check_violation'; END IF;
  IF TG_OP='UPDATE' AND NEW.row_version<>OLD.row_version+1 THEN RAISE EXCEPTION 'Customer account designation row version must advance exactly once' USING ERRCODE='check_violation'; END IF;
  IF TG_OP='UPDATE' AND OLD.status='pending' AND NEW.status NOT IN('approved','rejected') THEN RAISE EXCEPTION 'Pending customer account designation may only be approved or rejected' USING ERRCODE='check_violation'; END IF;
  IF TG_OP='UPDATE' AND OLD.status='approved' AND NEW.status<>'revoked' THEN RAISE EXCEPTION 'Approved customer account designation may only be revoked' USING ERRCODE='check_violation'; END IF;
  IF TG_OP='UPDATE' AND OLD.status IN('rejected','revoked') THEN RAISE EXCEPTION 'Terminal customer account designation is immutable' USING ERRCODE='check_violation'; END IF;
  IF NEW.status='approved' AND EXISTS (SELECT 1 FROM control.customer_account_designation existing WHERE existing.tenant_id=NEW.tenant_id AND existing.id<>NEW.id AND existing.customer_id=NEW.customer_id AND existing.operating_organization_id=NEW.operating_organization_id AND existing.designation_type=NEW.designation_type AND existing.status='approved' AND (existing.company_code_id IS NULL OR NEW.company_code_id IS NULL OR existing.company_code_id=NEW.company_code_id) AND daterange(existing.effective_from,existing.effective_until,'[)')&&daterange(NEW.effective_from,NEW.effective_until,'[)')) THEN RAISE EXCEPTION 'Overlapping approved customer account designation scope exists' USING ERRCODE='exclusion_violation'; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_customer_account_designation_10_scope ON control.customer_account_designation;
CREATE TRIGGER trg_customer_account_designation_10_scope BEFORE INSERT OR UPDATE OF tenant_id,business_partner_id,customer_id,operating_organization_id,company_code_id,effective_from,effective_until ON control.customer_account_designation FOR EACH ROW EXECUTE FUNCTION control.trg_validate_customer_account_designation_scope();
DROP TRIGGER IF EXISTS trg_customer_account_designation_20_guard ON control.customer_account_designation;
CREATE TRIGGER trg_customer_account_designation_20_guard BEFORE INSERT OR UPDATE ON control.customer_account_designation FOR EACH ROW EXECUTE FUNCTION control.trg_guard_customer_account_designation();
DROP TRIGGER IF EXISTS trg_customer_account_designation_30_updated ON control.customer_account_designation;
CREATE TRIGGER trg_customer_account_designation_30_updated BEFORE UPDATE ON control.customer_account_designation FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

ALTER TABLE control.customer_account_designation ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.customer_account_designation FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_access ON control.customer_account_designation;
CREATE POLICY tenant_access ON control.customer_account_designation FOR ALL USING (tenant_id=shared.current_tenant_id_soft()) WITH CHECK (tenant_id=shared.current_tenant_id());
DROP POLICY IF EXISTS seed_write ON control.customer_account_designation;
CREATE POLICY seed_write ON control.customer_account_designation FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

REVOKE ALL ON master.legal_entity_business_partner_link, control.customer_account_designation FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
    GRANT SELECT ON master.legal_entity_business_partner_link TO athyperapp;
    GRANT SELECT,INSERT,UPDATE ON control.customer_account_designation TO athyperapp;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
    GRANT SELECT ON master.legal_entity_business_partner_link TO athyperadmin;
    GRANT ALL PRIVILEGES ON control.customer_account_designation TO athyperadmin;
    DROP POLICY IF EXISTS admin_access ON control.customer_account_designation;
    CREATE POLICY admin_access ON control.customer_account_designation FOR ALL TO athyperadmin USING(true) WITH CHECK(true);
  END IF;
END $$;

COMMIT;
