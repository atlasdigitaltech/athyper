-- P1: one request-kind-aware application authority and deterministic result contract.
BEGIN;

DO $$ BEGIN
  IF current_database() <> 'athyper_neon' THEN
    RAISE EXCEPTION 'Business Partner application invariants must target athyper_neon';
  END IF;
END $$;

ALTER TABLE document.business_partner_request
  ADD COLUMN application_result_kind text,
  ADD COLUMN application_reason_code text,
  ADD COLUMN materialized_bank_verification_id uuid;

ALTER TABLE document.business_partner_request
  ADD CONSTRAINT business_partner_request_materialized_bank_verification_fk
    FOREIGN KEY(tenant_id,materialized_bank_verification_id)
    REFERENCES document.business_partner_bank_verification(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT business_partner_request_result_kind_chk CHECK(application_result_kind IS NULL OR application_result_kind IN(
    'partner_role_created','workforce_created','partner_amended','organization_assigned','company_configured',
    'bank_verification_started','employment_changed','partner_deactivated','partner_reactivated','partner_archived')),
  ADD CONSTRAINT business_partner_request_safe_reason_chk CHECK(
    application_reason_code IS NULL OR application_reason_code ~ '^[A-Z][A-Z0-9_.-]{2,126}$');

UPDATE document.business_partner_request SET application_result_kind=CASE
  WHEN request_kind IN('new_partner','add_supplier','add_customer') THEN 'partner_role_created'
  WHEN request_kind='add_workforce' OR (request_kind='new_partner' AND requested_role='workforce') THEN 'workforce_created'
  WHEN request_kind='assign_organization' THEN 'organization_assigned'
  WHEN request_kind='configure_company' THEN 'company_configured'
END WHERE status='applied';

ALTER TABLE document.business_partner_request DROP CONSTRAINT business_partner_request_materialization_evidence_chk;
ALTER TABLE document.business_partner_request ADD CONSTRAINT business_partner_request_materialization_evidence_chk CHECK(
  (status='applied') = (
    materialized_business_partner_id IS NOT NULL AND materialization_snapshot_id IS NOT NULL
    AND application_idempotency_key IS NOT NULL AND application_fingerprint IS NOT NULL
    AND application_result_kind IS NOT NULL AND applied_at IS NOT NULL AND applied_by IS NOT NULL
    AND CASE request_kind
      WHEN 'new_partner' THEN CASE requested_role
        WHEN 'workforce' THEN application_result_kind='workforce_created' AND materialized_person_id IS NOT NULL AND materialized_employee_id IS NOT NULL AND materialized_employment_id IS NOT NULL AND materialized_work_assignment_id IS NOT NULL AND num_nonnulls(materialized_supplier_id,materialized_customer_id,materialized_operating_organization_assignment_id,materialized_bank_verification_id)=0
        WHEN 'supplier' THEN application_result_kind='partner_role_created' AND materialized_supplier_id IS NOT NULL AND materialized_customer_id IS NULL AND materialized_operating_organization_assignment_id IS NOT NULL
        WHEN 'customer' THEN application_result_kind='partner_role_created' AND materialized_customer_id IS NOT NULL AND materialized_supplier_id IS NULL AND materialized_operating_organization_assignment_id IS NOT NULL
        ELSE false END
      WHEN 'add_supplier' THEN requested_role='supplier' AND application_result_kind='partner_role_created' AND materialized_supplier_id IS NOT NULL AND materialized_customer_id IS NULL AND materialized_operating_organization_assignment_id IS NOT NULL
      WHEN 'add_customer' THEN requested_role='customer' AND application_result_kind='partner_role_created' AND materialized_customer_id IS NOT NULL AND materialized_supplier_id IS NULL AND materialized_operating_organization_assignment_id IS NOT NULL
      WHEN 'add_workforce' THEN requested_role='workforce' AND application_result_kind='workforce_created' AND materialized_person_id IS NOT NULL AND materialized_employee_id IS NOT NULL AND materialized_employment_id IS NOT NULL AND materialized_work_assignment_id IS NOT NULL
      WHEN 'amend_partner' THEN application_result_kind='partner_amended' AND requested_role IS NULL AND num_nonnulls(materialized_supplier_id,materialized_customer_id,materialized_person_id,materialized_employee_id,materialized_employment_id,materialized_work_assignment_id,materialized_operating_organization_assignment_id,materialized_bank_verification_id)=0
      WHEN 'assign_organization' THEN application_result_kind='organization_assigned' AND requested_role IN('supplier','customer') AND materialized_operating_organization_assignment_id IS NOT NULL AND num_nonnulls(materialized_supplier_company_profile_id,materialized_customer_company_profile_id,materialized_person_id,materialized_employee_id,materialized_employment_id,materialized_work_assignment_id,materialized_bank_verification_id)=0
      WHEN 'configure_company' THEN application_result_kind='company_configured' AND requested_role IN('supplier','customer') AND num_nonnulls(materialized_supplier_company_profile_id,materialized_customer_company_profile_id)=1 AND materialized_operating_organization_assignment_id IS NOT NULL AND num_nonnulls(materialized_person_id,materialized_employee_id,materialized_employment_id,materialized_work_assignment_id,materialized_bank_verification_id)=0
      WHEN 'change_bank' THEN requested_role='supplier' AND application_result_kind='bank_verification_started' AND materialized_bank_verification_id IS NOT NULL AND num_nonnulls(materialized_customer_id,materialized_person_id,materialized_employee_id,materialized_employment_id,materialized_work_assignment_id)=0
      WHEN 'change_employment' THEN requested_role='workforce' AND application_result_kind='employment_changed' AND materialized_person_id IS NOT NULL AND materialized_employee_id IS NOT NULL AND materialized_employment_id IS NOT NULL AND materialized_work_assignment_id IS NOT NULL AND num_nonnulls(materialized_supplier_id,materialized_customer_id,materialized_supplier_company_profile_id,materialized_customer_company_profile_id,materialized_operating_organization_assignment_id,materialized_bank_verification_id)=0
      WHEN 'deactivate' THEN application_result_kind='partner_deactivated' AND application_reason_code IS NOT NULL AND requested_role IS NULL AND num_nonnulls(materialized_supplier_id,materialized_customer_id,materialized_person_id,materialized_employee_id,materialized_employment_id,materialized_work_assignment_id,materialized_supplier_company_profile_id,materialized_customer_company_profile_id,materialized_operating_organization_assignment_id,materialized_bank_verification_id)=0
      WHEN 'reactivate' THEN application_result_kind='partner_reactivated' AND application_reason_code IS NOT NULL AND requested_role IS NULL AND num_nonnulls(materialized_supplier_id,materialized_customer_id,materialized_person_id,materialized_employee_id,materialized_employment_id,materialized_work_assignment_id,materialized_supplier_company_profile_id,materialized_customer_company_profile_id,materialized_operating_organization_assignment_id,materialized_bank_verification_id)=0
      WHEN 'archive' THEN application_result_kind='partner_archived' AND application_reason_code IS NOT NULL AND requested_role IS NULL AND num_nonnulls(materialized_supplier_id,materialized_customer_id,materialized_person_id,materialized_employee_id,materialized_employment_id,materialized_work_assignment_id,materialized_supplier_company_profile_id,materialized_customer_company_profile_id,materialized_operating_organization_assignment_id,materialized_bank_verification_id)=0
      ELSE false END));

ALTER TABLE document.business_partner_request DROP CONSTRAINT business_partner_request_role_scope_chk;
ALTER TABLE document.business_partner_request ADD CONSTRAINT business_partner_request_role_scope_chk CHECK(
  (request_kind IN('add_workforce','change_employment') OR (request_kind='new_partner' AND requested_role='workforce'))
    AND requested_role='workforce' AND legal_entity_id IS NOT NULL AND company_code_id IS NOT NULL AND org_unit_id IS NOT NULL AND operating_organization_id IS NULL
  OR request_kind IN('add_supplier','add_customer','assign_organization','configure_company','change_bank')
    AND requested_role IN('supplier','customer') AND operating_organization_id IS NOT NULL AND legal_entity_id IS NULL AND org_unit_id IS NULL AND position_id IS NULL
  OR request_kind='new_partner' AND requested_role IN('supplier','customer') AND operating_organization_id IS NOT NULL AND legal_entity_id IS NULL AND org_unit_id IS NULL AND position_id IS NULL
  OR request_kind IN('amend_partner','deactivate','reactivate','archive') AND requested_role IS NULL
);

ALTER TABLE document.business_partner_request ADD CONSTRAINT business_partner_request_lifecycle_impact_chk CHECK(
  request_kind NOT IN('deactivate','reactivate','archive') OR status NOT IN('pending_approval','approved','applying','applied') OR (
    jsonb_typeof(change_impact->'dependencies')='array'
    AND change_impact->>'evidenceVersion' ~ '^[1-9][0-9]*$'
    AND change_impact->>'reasonCode' ~ '^[A-Z][A-Z0-9_.-]{2,126}$'
    AND change_impact->>'assessedAt' IS NOT NULL));

-- Preserve the established lifecycle guard while replacing its obsolete role-only
-- applied-row assertion. The request-kind matrix above remains the final authority.
DO $$ DECLARE v_definition text; v_updated text; BEGIN
  SELECT pg_get_functiondef('document.trg_guard_business_partner_request()'::regprocedure) INTO v_definition;
  v_updated:=regexp_replace(v_definition,
    'IF NEW.status=''applied'' AND .*END IF;([[:space:]]+RETURN NEW;)',
    'IF NEW.status=''applied'' AND (NEW.applied_at IS NULL OR NEW.applied_by IS NULL OR NEW.materialized_business_partner_id IS NULL OR NEW.materialization_snapshot_id IS NULL OR NEW.application_idempotency_key IS NULL OR NEW.application_fingerprint IS NULL OR NEW.application_result_kind IS NULL) THEN RAISE EXCEPTION ''Applied Business Partner request requires request-kind-aware application evidence'' USING ERRCODE=''check_violation''; END IF;\1');
  IF v_updated=v_definition THEN RAISE EXCEPTION 'Could not upgrade Business Partner request application guard'; END IF;
  EXECUTE v_updated;
END $$;

CREATE TABLE document.business_partner_duplicate_resolution(
  id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
  duplicate_business_partner_id uuid NOT NULL, surviving_business_partner_id uuid NOT NULL,
  resolution_kind text NOT NULL, reason_code text NOT NULL, dependency_evidence jsonb NOT NULL,
  rekey_manifest jsonb NOT NULL DEFAULT '[]'::jsonb, snapshot_id uuid NOT NULL,
  resolved_at timestamptz NOT NULL DEFAULT now(), resolved_by uuid NOT NULL,
  CONSTRAINT business_partner_duplicate_resolution_pkey PRIMARY KEY(id),
  CONSTRAINT business_partner_duplicate_resolution_tenant_id_uq UNIQUE(tenant_id,id),
  CONSTRAINT business_partner_duplicate_resolution_duplicate_uq UNIQUE(tenant_id,duplicate_business_partner_id),
  CONSTRAINT business_partner_duplicate_resolution_distinct_chk CHECK(duplicate_business_partner_id<>surviving_business_partner_id),
  CONSTRAINT business_partner_duplicate_resolution_kind_chk CHECK(resolution_kind IN('merge','rekey','supersede')),
  CONSTRAINT business_partner_duplicate_resolution_reason_chk CHECK(reason_code ~ '^[A-Z][A-Z0-9_.-]{2,126}$'),
  CONSTRAINT business_partner_duplicate_resolution_evidence_chk CHECK(jsonb_typeof(dependency_evidence)='object' AND dependency_evidence<>'{}'::jsonb AND jsonb_typeof(rekey_manifest)='array'),
  FOREIGN KEY(tenant_id,duplicate_business_partner_id) REFERENCES master.business_partner(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,surviving_business_partner_id) REFERENCES master.business_partner(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,snapshot_id) REFERENCES snapshot.entity_snapshot_identity(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,resolved_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT
);

COMMENT ON TABLE document.business_partner_duplicate_resolution IS
  'Steward-only immutable evidence for category-preserving duplicate merge, explicit foreign-key re-key manifest, and supersession. Category is never corrected in place.';

CREATE OR REPLACE FUNCTION document.trg_guard_business_partner_duplicate_resolution() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,document,master AS $$
DECLARE v_duplicate master.business_partner%ROWTYPE; v_survivor master.business_partner%ROWTYPE;
BEGIN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Business Partner duplicate resolutions are immutable' USING ERRCODE='restrict_violation'; END IF;
  SELECT * INTO v_duplicate FROM master.business_partner WHERE tenant_id=NEW.tenant_id AND id=NEW.duplicate_business_partner_id FOR UPDATE;
  SELECT * INTO v_survivor FROM master.business_partner WHERE tenant_id=NEW.tenant_id AND id=NEW.surviving_business_partner_id FOR UPDATE;
  IF NOT FOUND OR v_duplicate.id IS NULL OR v_duplicate.partner_category<>v_survivor.partner_category OR v_survivor.status='archived' THEN
    RAISE EXCEPTION 'Duplicate resolution requires two same-category partners and an available survivor' USING ERRCODE='check_violation';
  END IF;
  IF v_duplicate.status<>'inactive' THEN RAISE EXCEPTION 'Duplicate must be inactive after dependency review before supersession' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
  IF NEW.resolution_kind IN('merge','rekey') AND COALESCE((NEW.dependency_evidence->>'rekeyComplete')::boolean,false)<>true THEN RAISE EXCEPTION 'Merge and re-key require completed dependency evidence' USING ERRCODE='check_violation'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_business_partner_duplicate_resolution_guard BEFORE INSERT OR UPDATE OR DELETE ON document.business_partner_duplicate_resolution FOR EACH ROW EXECUTE FUNCTION document.trg_guard_business_partner_duplicate_resolution();

CREATE OR REPLACE FUNCTION document.fn_resolve_business_partner_duplicate(p_tenant_id uuid,p_duplicate_id uuid,p_survivor_id uuid,p_resolution_kind text,p_reason_code text,p_dependency_evidence jsonb,p_rekey_manifest jsonb,p_snapshot_id uuid,p_resolved_by uuid) RETURNS uuid
LANGUAGE plpgsql SET search_path=pg_catalog,document,master AS $$ DECLARE v_id uuid; BEGIN
  IF p_tenant_id IS DISTINCT FROM shared.current_tenant_id() THEN RAISE EXCEPTION 'Tenant context mismatch' USING ERRCODE='insufficient_privilege'; END IF;
  INSERT INTO document.business_partner_duplicate_resolution(tenant_id,duplicate_business_partner_id,surviving_business_partner_id,resolution_kind,reason_code,dependency_evidence,rekey_manifest,snapshot_id,resolved_by)
  VALUES(p_tenant_id,p_duplicate_id,p_survivor_id,p_resolution_kind,p_reason_code,p_dependency_evidence,p_rekey_manifest,p_snapshot_id,p_resolved_by) RETURNING id INTO v_id;
  UPDATE master.business_partner SET status='archived',status_changed_at=now(),status_changed_by=p_resolved_by,updated_by=p_resolved_by WHERE tenant_id=p_tenant_id AND id=p_duplicate_id AND status='inactive';
  IF NOT FOUND THEN RAISE EXCEPTION 'Duplicate supersession lost its lifecycle precondition' USING ERRCODE='serialization_failure'; END IF;
  RETURN v_id;
END $$;

ALTER TABLE document.business_partner_duplicate_resolution ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.business_partner_duplicate_resolution FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON document.business_partner_duplicate_resolution USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON document.business_partner_duplicate_resolution FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
REVOKE ALL ON document.business_partner_duplicate_resolution FROM PUBLIC;
REVOKE ALL ON FUNCTION document.fn_resolve_business_partner_duplicate(uuid,uuid,uuid,text,text,jsonb,jsonb,uuid,uuid) FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT SELECT,INSERT ON document.business_partner_duplicate_resolution TO athyperapp; GRANT EXECUTE ON FUNCTION document.fn_resolve_business_partner_duplicate(uuid,uuid,uuid,text,text,jsonb,jsonb,uuid,uuid) TO athyperapp; END IF; END $$;

CREATE OR REPLACE FUNCTION document.trg_guard_business_partner_application_result() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$ BEGIN
  IF TG_OP='INSERT' AND num_nonnulls(NEW.application_result_kind,NEW.application_reason_code,NEW.materialized_bank_verification_id)>0 THEN
    RAISE EXCEPTION 'New Business Partner requests cannot contain application results' USING ERRCODE='check_violation';
  END IF;
  IF TG_OP='UPDATE' AND OLD.applied_at IS NOT NULL AND
    (NEW.application_result_kind,NEW.application_reason_code,NEW.materialized_bank_verification_id)
      IS DISTINCT FROM (OLD.application_result_kind,OLD.application_reason_code,OLD.materialized_bank_verification_id) THEN
    RAISE EXCEPTION 'Business Partner application result is immutable' USING ERRCODE='check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_business_partner_request_16_application_result BEFORE INSERT OR UPDATE ON document.business_partner_request FOR EACH ROW EXECUTE FUNCTION document.trg_guard_business_partner_application_result();
REVOKE ALL ON FUNCTION document.trg_guard_business_partner_application_result() FROM PUBLIC;

COMMIT;
