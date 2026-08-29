BEGIN;

DO $guard$
BEGIN
  IF current_database()<>'athyper_neon' OR current_setting('app.database_plane',true)<>'neon' THEN
    RAISE EXCEPTION 'Supplier preference migration requires the NEON plane';
  END IF;
END $guard$;

DO $domain$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type type JOIN pg_namespace namespace ON namespace.oid=type.typnamespace WHERE namespace.nspname='control' AND type.typname='supplier_preference_status_d') THEN
    CREATE DOMAIN control.supplier_preference_status_d AS text CHECK (VALUE IN ('pending','approved','rejected','revoked'));
  END IF;
END $domain$;

CREATE TABLE control.supplier_preference_designation (
  id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
  business_partner_id uuid NOT NULL, supplier_id uuid NOT NULL,
  operating_organization_id uuid NOT NULL, company_code_id uuid,
  commodity_category_id uuid, effective_from date NOT NULL, effective_until date,
  rationale text NOT NULL, status control.supplier_preference_status_d NOT NULL DEFAULT 'pending',
  idempotency_key text NOT NULL, decision_reason text, reviewed_at timestamptz, reviewed_by uuid,
  approved_at timestamptz, approved_by uuid, decision_idempotency_key text, decision_fingerprint text,
  revocation_reason text, revoked_at timestamptz, revoked_by uuid,
  revocation_idempotency_key text, revocation_fingerprint text,
  row_version bigint NOT NULL DEFAULT 1, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
  updated_at timestamptz, updated_by uuid,
  CONSTRAINT supplier_preference_designation_pkey PRIMARY KEY(id),
  CONSTRAINT supplier_preference_designation_tenant_id_uq UNIQUE(tenant_id,id),
  CONSTRAINT supplier_preference_designation_idempotency_chk CHECK(btrim(idempotency_key)=idempotency_key AND length(idempotency_key) BETWEEN 8 AND 200),
  CONSTRAINT supplier_preference_designation_decision_key_chk CHECK(decision_idempotency_key IS NULL OR (btrim(decision_idempotency_key)=decision_idempotency_key AND length(decision_idempotency_key) BETWEEN 8 AND 200)),
  CONSTRAINT supplier_preference_designation_revocation_key_chk CHECK(revocation_idempotency_key IS NULL OR (btrim(revocation_idempotency_key)=revocation_idempotency_key AND length(revocation_idempotency_key) BETWEEN 8 AND 200)),
  CONSTRAINT supplier_preference_designation_fingerprint_chk CHECK((decision_fingerprint IS NULL OR decision_fingerprint~'^[a-f0-9]{64}$') AND (revocation_fingerprint IS NULL OR revocation_fingerprint~'^[a-f0-9]{64}$')),
  CONSTRAINT supplier_preference_designation_range_chk CHECK(effective_until IS NULL OR effective_until>effective_from),
  CONSTRAINT supplier_preference_designation_reason_chk CHECK(length(rationale) BETWEEN 1 AND 4000 AND (decision_reason IS NULL OR length(decision_reason) BETWEEN 1 AND 4000) AND (revocation_reason IS NULL OR length(revocation_reason) BETWEEN 1 AND 4000)),
  CONSTRAINT supplier_preference_designation_review_pair_chk CHECK((reviewed_at IS NULL)=(reviewed_by IS NULL)),
  CONSTRAINT supplier_preference_designation_approval_pair_chk CHECK((approved_at IS NULL)=(approved_by IS NULL)),
  CONSTRAINT supplier_preference_designation_revoke_pair_chk CHECK((revoked_at IS NULL)=(revoked_by IS NULL)),
  CONSTRAINT supplier_preference_designation_state_evidence_chk CHECK(
    (status='pending' AND reviewed_at IS NULL AND approved_at IS NULL AND decision_idempotency_key IS NULL AND decision_fingerprint IS NULL AND revoked_at IS NULL AND revocation_idempotency_key IS NULL AND revocation_fingerprint IS NULL)
    OR (status='approved' AND reviewed_at IS NOT NULL AND approved_at IS NOT NULL AND decision_idempotency_key IS NOT NULL AND decision_fingerprint IS NOT NULL AND revoked_at IS NULL AND revocation_idempotency_key IS NULL AND revocation_fingerprint IS NULL)
    OR (status='rejected' AND reviewed_at IS NOT NULL AND approved_at IS NULL AND decision_idempotency_key IS NOT NULL AND decision_fingerprint IS NOT NULL AND revoked_at IS NULL AND revocation_idempotency_key IS NULL AND revocation_fingerprint IS NULL)
    OR (status='revoked' AND reviewed_at IS NOT NULL AND approved_at IS NOT NULL AND decision_idempotency_key IS NOT NULL AND decision_fingerprint IS NOT NULL AND revoked_at IS NOT NULL AND revocation_idempotency_key IS NOT NULL AND revocation_fingerprint IS NOT NULL)),
  CONSTRAINT supplier_preference_designation_no_self_approval_chk CHECK(reviewed_by IS NULL OR reviewed_by<>created_by),
  CONSTRAINT supplier_preference_designation_row_version_chk CHECK(row_version>=1),
  CONSTRAINT supplier_preference_designation_metadata_chk CHECK(jsonb_typeof(metadata)='object'),
  CONSTRAINT supplier_preference_designation_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL)),
  CONSTRAINT supplier_preference_designation_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
  CONSTRAINT supplier_preference_designation_partner_fk FOREIGN KEY(tenant_id,business_partner_id) REFERENCES master.business_partner(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT supplier_preference_designation_supplier_fk FOREIGN KEY(tenant_id,supplier_id) REFERENCES master.supplier(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT supplier_preference_designation_org_fk FOREIGN KEY(tenant_id,operating_organization_id) REFERENCES master.operating_organization(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT supplier_preference_designation_company_fk FOREIGN KEY(tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT supplier_preference_designation_commodity_fk FOREIGN KEY(tenant_id,commodity_category_id) REFERENCES master.commodity_category(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT supplier_preference_designation_reviewed_by_fk FOREIGN KEY(tenant_id,reviewed_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT supplier_preference_designation_approved_by_fk FOREIGN KEY(tenant_id,approved_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT supplier_preference_designation_revoked_by_fk FOREIGN KEY(tenant_id,revoked_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT supplier_preference_designation_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT supplier_preference_designation_updated_by_fk FOREIGN KEY(tenant_id,updated_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX supplier_preference_designation_idempotency_uq ON control.supplier_preference_designation(tenant_id,idempotency_key);
CREATE UNIQUE INDEX supplier_preference_designation_decision_idempotency_uq ON control.supplier_preference_designation(tenant_id,decision_idempotency_key) WHERE decision_idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX supplier_preference_designation_revocation_idempotency_uq ON control.supplier_preference_designation(tenant_id,revocation_idempotency_key) WHERE revocation_idempotency_key IS NOT NULL;
CREATE INDEX supplier_preference_designation_resolution_idx ON control.supplier_preference_designation(tenant_id,business_partner_id,operating_organization_id,company_code_id,commodity_category_id,status,effective_from,effective_until);
CREATE INDEX supplier_preference_designation_supplier_idx ON control.supplier_preference_designation(tenant_id,supplier_id,operating_organization_id,status);

CREATE FUNCTION control.trg_validate_supplier_preference_scope() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,control,master AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM master.supplier supplier WHERE supplier.tenant_id=NEW.tenant_id AND supplier.id=NEW.supplier_id AND supplier.business_partner_id=NEW.business_partner_id AND supplier.status<>'archived') THEN RAISE EXCEPTION 'Supplier does not belong to the selected business partner' USING ERRCODE='check_violation'; END IF;
  IF NOT EXISTS (SELECT 1 FROM master.business_partner_operating_organization_assignment assignment WHERE assignment.tenant_id=NEW.tenant_id AND assignment.business_partner_id=NEW.business_partner_id AND assignment.operating_organization_id=NEW.operating_organization_id AND assignment.partner_role='supplier' AND assignment.status='active' AND assignment.effective_from<=NEW.effective_from AND (assignment.effective_until IS NULL OR assignment.effective_until>NEW.effective_from)) THEN RAISE EXCEPTION 'Supplier is not actively assigned to the selected operating organization at effective start' USING ERRCODE='check_violation'; END IF;
  IF NEW.company_code_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM master.operating_organization_company_assignment assignment WHERE assignment.tenant_id=NEW.tenant_id AND assignment.operating_organization_id=NEW.operating_organization_id AND assignment.company_code_id=NEW.company_code_id AND assignment.status='active' AND assignment.effective_from<=NEW.effective_from AND (assignment.effective_until IS NULL OR assignment.effective_until>NEW.effective_from)) THEN RAISE EXCEPTION 'Company code does not participate in the operating organization at effective start' USING ERRCODE='check_violation'; END IF;
  IF NEW.commodity_category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM master.business_partner_commodity_capability capability WHERE capability.tenant_id=NEW.tenant_id AND capability.business_partner_id=NEW.business_partner_id AND capability.partner_role='supplier' AND capability.commodity_category_id=NEW.commodity_category_id AND capability.status='active' AND capability.effective_from<=NEW.effective_from AND (capability.effective_until IS NULL OR capability.effective_until>NEW.effective_from)) THEN RAISE EXCEPTION 'Supplier has no active capability for the commodity at effective start' USING ERRCODE='check_violation'; END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION control.trg_guard_supplier_preference_designation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,control AS $$
BEGIN
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.business_partner_id IS DISTINCT FROM OLD.business_partner_id OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id OR NEW.operating_organization_id IS DISTINCT FROM OLD.operating_organization_id OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id OR NEW.commodity_category_id IS DISTINCT FROM OLD.commodity_category_id OR NEW.effective_from IS DISTINCT FROM OLD.effective_from OR NEW.effective_until IS DISTINCT FROM OLD.effective_until OR NEW.rationale IS DISTINCT FROM OLD.rationale OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by) THEN RAISE EXCEPTION 'Supplier preference scope and creation evidence are immutable' USING ERRCODE='check_violation'; END IF;
  IF TG_OP='UPDATE' AND NEW.row_version<>OLD.row_version+1 THEN RAISE EXCEPTION 'Supplier preference row version must advance exactly once' USING ERRCODE='check_violation'; END IF;
  IF TG_OP='UPDATE' AND OLD.status='pending' AND NEW.status NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Pending supplier preference may only be approved or rejected' USING ERRCODE='check_violation'; END IF;
  IF TG_OP='UPDATE' AND OLD.status='approved' AND NEW.status<>'revoked' THEN RAISE EXCEPTION 'Approved supplier preference may only be revoked' USING ERRCODE='check_violation'; END IF;
  IF TG_OP='UPDATE' AND OLD.status IN ('rejected','revoked') THEN RAISE EXCEPTION 'Terminal supplier preference is immutable' USING ERRCODE='check_violation'; END IF;
  IF NEW.status='approved' AND EXISTS (SELECT 1 FROM control.supplier_preference_designation existing WHERE existing.tenant_id=NEW.tenant_id AND existing.id<>NEW.id AND existing.supplier_id=NEW.supplier_id AND existing.operating_organization_id=NEW.operating_organization_id AND existing.status='approved' AND (existing.company_code_id IS NULL OR NEW.company_code_id IS NULL OR existing.company_code_id=NEW.company_code_id) AND (existing.commodity_category_id IS NULL OR NEW.commodity_category_id IS NULL OR existing.commodity_category_id=NEW.commodity_category_id) AND daterange(existing.effective_from,existing.effective_until,'[)')&&daterange(NEW.effective_from,NEW.effective_until,'[)')) THEN RAISE EXCEPTION 'Overlapping approved supplier preference scope exists' USING ERRCODE='exclusion_violation'; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_supplier_preference_designation_10_scope BEFORE INSERT OR UPDATE OF tenant_id,business_partner_id,supplier_id,operating_organization_id,company_code_id,commodity_category_id,effective_from,effective_until ON control.supplier_preference_designation FOR EACH ROW EXECUTE FUNCTION control.trg_validate_supplier_preference_scope();
CREATE TRIGGER trg_supplier_preference_designation_20_guard BEFORE INSERT OR UPDATE ON control.supplier_preference_designation FOR EACH ROW EXECUTE FUNCTION control.trg_guard_supplier_preference_designation();
CREATE TRIGGER trg_supplier_preference_designation_30_updated BEFORE UPDATE ON control.supplier_preference_designation FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

ALTER TABLE control.supplier_preference_designation ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.supplier_preference_designation FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON control.supplier_preference_designation FOR ALL USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON control.supplier_preference_designation FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
REVOKE ALL ON control.supplier_preference_designation FROM PUBLIC;
REVOKE ALL ON FUNCTION control.trg_validate_supplier_preference_scope(),control.trg_guard_supplier_preference_designation() FROM PUBLIC;

DO $roles$
BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT SELECT,INSERT,UPDATE ON control.supplier_preference_designation TO athyperapp; END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT ALL PRIVILEGES ON control.supplier_preference_designation TO athyperadmin; CREATE POLICY admin_access ON control.supplier_preference_designation FOR ALL TO athyperadmin USING(true) WITH CHECK(true); END IF;
END $roles$;

INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
SELECT 'b07a67cb-8bb7-5417-83a7-217eb7d2e13d'::uuid,'neon.supplier.preference.admin','entity_operation',module.id,'high',true,true,false,false,false,'{"_seed":{"pack":"neon.supplier-preference-permission","version":"1.0.0"}}'::jsonb,'published','00000000-0000-0000-0000-000000000000'::uuid FROM control.module module WHERE module.code='fnd' AND module.status='active'
ON CONFLICT(canonical_code) DO UPDATE SET risk_tier=EXCLUDED.risk_tier,requires_mfa=EXCLUDED.requires_mfa,requires_sod=EXCLUDED.requires_sod,metadata=authz.permission.metadata||EXCLUDED.metadata,status='published';
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by) SELECT id,'operating_organization','subtree','active','00000000-0000-0000-0000-000000000000'::uuid FROM authz.permission WHERE canonical_code='neon.supplier.preference.admin' ON CONFLICT(permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active';

DO $assertions$
BEGIN
  IF to_regclass('control.supplier_preference_designation') IS NULL THEN RAISE EXCEPTION 'Supplier preference table was not installed'; END IF;
  IF (SELECT count(*) FROM authz.permission WHERE canonical_code='neon.supplier.preference.admin' AND status='published')<>1 THEN RAISE EXCEPTION 'Supplier preference permission was not installed'; END IF;
END $assertions$;

COMMIT;
