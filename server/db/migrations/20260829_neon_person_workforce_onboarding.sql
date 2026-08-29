BEGIN;

DO $$ BEGIN
  IF current_database()<>'athyper_neon' OR current_setting('app.database_plane',true)<>'neon' THEN
    RAISE EXCEPTION 'Person workforce onboarding migration requires the NEON plane';
  END IF;
  IF EXISTS(SELECT 1 FROM master.person WHERE business_partner_id IS NULL) THEN
    RAISE EXCEPTION 'Legacy Person rows remain without an approved Business Partner match';
  END IF;
  IF EXISTS(SELECT 1 FROM master.business_partner partner WHERE partner.partner_category='person' AND partner.status='active' AND (SELECT count(*) FROM master.person person WHERE person.tenant_id=partner.tenant_id AND person.business_partner_id=partner.id)<>1) THEN
    RAISE EXCEPTION 'Active person-category Business Partners do not have exactly one Person profile';
  END IF;
END $$;

ALTER TABLE master.business_partner VALIDATE CONSTRAINT business_partner_person_facts_chk;
ALTER TABLE master.person VALIDATE CONSTRAINT person_business_partner_required_chk;
ALTER TABLE master.person ALTER COLUMN business_partner_id SET NOT NULL;

CREATE OR REPLACE FUNCTION master.trg_assert_active_person_business_partner() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,master AS $$
DECLARE v_partner_id uuid;v_tenant_id uuid;v_category master.business_partner_category_d;v_status master.business_partner_status_d;v_people bigint;
BEGIN
  IF TG_TABLE_NAME='business_partner' THEN IF TG_OP='DELETE' THEN v_partner_id:=OLD.id;v_tenant_id:=OLD.tenant_id;ELSE v_partner_id:=NEW.id;v_tenant_id:=NEW.tenant_id;END IF;
  ELSE IF TG_OP='DELETE' THEN v_partner_id:=OLD.business_partner_id;v_tenant_id:=OLD.tenant_id;ELSE v_partner_id:=NEW.business_partner_id;v_tenant_id:=NEW.tenant_id;END IF;END IF;
  SELECT partner_category,status INTO v_category,v_status FROM master.business_partner WHERE tenant_id=v_tenant_id AND id=v_partner_id;
  IF FOUND AND v_category='person' AND v_status='active' THEN SELECT count(*) INTO v_people FROM master.person WHERE tenant_id=v_tenant_id AND business_partner_id=v_partner_id;IF v_people<>1 THEN RAISE EXCEPTION 'Active person-category Business Partner requires exactly one Person profile' USING ERRCODE='check_violation';END IF;END IF;
  IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER trg_business_partner_person_cardinality AFTER INSERT OR UPDATE ON master.business_partner DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION master.trg_assert_active_person_business_partner();
CREATE CONSTRAINT TRIGGER trg_person_business_partner_cardinality AFTER INSERT OR UPDATE OR DELETE ON master.person DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION master.trg_assert_active_person_business_partner();

CREATE DOMAIN document.business_partner_requested_role_d AS text CHECK(VALUE IN('supplier','customer','workforce'));
CREATE DOMAIN document.business_partner_request_kind_d AS text CHECK(VALUE IN('new_partner','amend_partner','add_supplier','add_customer','add_workforce','assign_organization','configure_company','change_bank','change_employment','deactivate','reactivate','archive'));

ALTER TABLE document.business_partner_request
  ALTER COLUMN requested_role TYPE document.business_partner_requested_role_d USING requested_role::text::document.business_partner_requested_role_d,
  ALTER COLUMN request_kind TYPE document.business_partner_request_kind_d USING request_kind::text::document.business_partner_request_kind_d,
  ADD COLUMN legal_entity_id uuid,
  ADD COLUMN org_unit_id uuid,
  ADD COLUMN position_id uuid,
  ADD COLUMN materialized_person_id uuid,
  ADD COLUMN materialized_employee_id uuid,
  ADD COLUMN materialized_employment_id uuid,
  ADD COLUMN materialized_work_assignment_id uuid,
  ADD COLUMN materialized_principal_id uuid;

ALTER TABLE document.business_partner_request DROP CONSTRAINT business_partner_request_kind_chk;
ALTER TABLE document.business_partner_request ADD CONSTRAINT business_partner_request_kind_chk CHECK(request_kind IN('new_partner','amend_partner','add_supplier','add_customer','add_workforce','assign_organization','configure_company','change_bank','change_employment','deactivate','reactivate','archive'));
ALTER TABLE document.business_partner_request ADD CONSTRAINT business_partner_request_role_scope_chk CHECK(
  (requested_role='workforce' AND legal_entity_id IS NOT NULL AND company_code_id IS NOT NULL AND org_unit_id IS NOT NULL AND operating_organization_id IS NULL)
  OR (requested_role IN('supplier','customer') AND operating_organization_id IS NOT NULL AND legal_entity_id IS NULL AND org_unit_id IS NULL AND position_id IS NULL)
  OR requested_role IS NULL) NOT VALID;
ALTER TABLE document.business_partner_request VALIDATE CONSTRAINT business_partner_request_role_scope_chk;

ALTER TABLE document.business_partner_request DROP CONSTRAINT business_partner_request_materialization_evidence_chk;
ALTER TABLE document.business_partner_request ADD CONSTRAINT business_partner_request_materialization_evidence_chk CHECK((status='applied')=(
  materialized_business_partner_id IS NOT NULL AND materialization_snapshot_id IS NOT NULL AND application_idempotency_key IS NOT NULL AND application_fingerprint IS NOT NULL AND applied_at IS NOT NULL AND applied_by IS NOT NULL AND (
    (requested_role IN('supplier','customer') AND num_nonnulls(materialized_supplier_id,materialized_customer_id)=1 AND num_nonnulls(materialized_supplier_company_profile_id,materialized_customer_company_profile_id)=CASE WHEN request_kind='configure_company' THEN 1 ELSE 0 END AND materialized_operating_organization_assignment_id IS NOT NULL AND num_nonnulls(materialized_person_id,materialized_employee_id,materialized_employment_id,materialized_work_assignment_id,materialized_principal_id)=0)
    OR (requested_role='workforce' AND materialized_person_id IS NOT NULL AND materialized_employee_id IS NOT NULL AND materialized_employment_id IS NOT NULL AND materialized_work_assignment_id IS NOT NULL AND num_nonnulls(materialized_supplier_id,materialized_customer_id,materialized_supplier_company_profile_id,materialized_customer_company_profile_id,materialized_operating_organization_assignment_id)=0))));

ALTER TABLE document.business_partner_request
  ADD CONSTRAINT business_partner_request_legal_entity_fk FOREIGN KEY(tenant_id,legal_entity_id) REFERENCES master.legal_entity(tenant_id,id) ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT business_partner_request_org_unit_fk FOREIGN KEY(tenant_id,org_unit_id) REFERENCES master.org_unit(tenant_id,id) ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT business_partner_request_position_fk FOREIGN KEY(tenant_id,position_id) REFERENCES master.position(tenant_id,id) ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT business_partner_request_materialized_person_fk FOREIGN KEY(tenant_id,materialized_person_id) REFERENCES master.person(tenant_id,id) ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT business_partner_request_materialized_employee_fk FOREIGN KEY(tenant_id,materialized_employee_id) REFERENCES master.employee(tenant_id,id) ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT business_partner_request_materialized_employment_fk FOREIGN KEY(tenant_id,materialized_employment_id) REFERENCES master.employment(tenant_id,id) ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT business_partner_request_materialized_work_assignment_fk FOREIGN KEY(tenant_id,materialized_work_assignment_id) REFERENCES master.work_assignment(tenant_id,id) ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT business_partner_request_materialized_principal_fk FOREIGN KEY(tenant_id,materialized_principal_id) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE document.business_partner_request VALIDATE CONSTRAINT business_partner_request_legal_entity_fk;
ALTER TABLE document.business_partner_request VALIDATE CONSTRAINT business_partner_request_org_unit_fk;
ALTER TABLE document.business_partner_request VALIDATE CONSTRAINT business_partner_request_position_fk;
ALTER TABLE document.business_partner_request VALIDATE CONSTRAINT business_partner_request_materialized_person_fk;
ALTER TABLE document.business_partner_request VALIDATE CONSTRAINT business_partner_request_materialized_employee_fk;
ALTER TABLE document.business_partner_request VALIDATE CONSTRAINT business_partner_request_materialized_employment_fk;
ALTER TABLE document.business_partner_request VALIDATE CONSTRAINT business_partner_request_materialized_work_assignment_fk;
ALTER TABLE document.business_partner_request VALIDATE CONSTRAINT business_partner_request_materialized_principal_fk;

DROP INDEX document.business_partner_request_open_role_extension_uq;
CREATE UNIQUE INDEX business_partner_request_open_role_extension_uq ON document.business_partner_request(tenant_id,target_business_partner_id,requested_role) WHERE request_kind IN('add_supplier','add_customer','add_workforce') AND status IN('draft','validating','validation_failed','pending_approval','returned','approved','applying','failed');

CREATE OR REPLACE FUNCTION document.trg_guard_business_partner_request() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
DECLARE v_valid boolean:=false;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Business Partner requests cannot be deleted; cancel or supersede the request' USING ERRCODE='restrict_violation';END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'draft' OR NEW.workflow_request_id IS NOT NULL OR num_nonnulls(NEW.materialized_business_partner_id,NEW.materialized_supplier_id,NEW.materialized_customer_id,NEW.materialized_person_id,NEW.materialized_employee_id,NEW.materialized_employment_id,NEW.materialized_work_assignment_id,NEW.materialized_principal_id,NEW.materialization_snapshot_id)>0 OR NEW.application_idempotency_key IS NOT NULL OR NEW.application_fingerprint IS NOT NULL OR NEW.submitted_at IS NOT NULL OR NEW.submitted_by IS NOT NULL OR NEW.approved_at IS NOT NULL OR NEW.approved_by IS NOT NULL OR NEW.applied_at IS NOT NULL OR NEW.applied_by IS NOT NULL THEN RAISE EXCEPTION 'New Business Partner requests must start as evidence-free drafts' USING ERRCODE='check_violation';END IF;RETURN NEW;
  END IF;
  IF (NEW.id,NEW.tenant_id,NEW.request_no,NEW.request_kind,NEW.source_kind,NEW.registration_mode,NEW.invitation_id,NEW.applicant_principal_id,NEW.represented_party_name,NEW.target_business_partner_id,NEW.source_system_code,NEW.source_entity_code,NEW.source_entity_id,NEW.source_entity_code_value,NEW.source_projection_id,NEW.source_version,NEW.source_payload_hash,NEW.idempotency_key,NEW.created_at,NEW.created_by) IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.request_no,OLD.request_kind,OLD.source_kind,OLD.registration_mode,OLD.invitation_id,OLD.applicant_principal_id,OLD.represented_party_name,OLD.target_business_partner_id,OLD.source_system_code,OLD.source_entity_code,OLD.source_entity_id,OLD.source_entity_code_value,OLD.source_projection_id,OLD.source_version,OLD.source_payload_hash,OLD.idempotency_key,OLD.created_at,OLD.created_by) THEN RAISE EXCEPTION 'Business Partner request identity, target, kind, and creation evidence are immutable' USING ERRCODE='check_violation';END IF;
  IF OLD.workflow_request_id IS NOT NULL AND NEW.workflow_request_id IS DISTINCT FROM OLD.workflow_request_id THEN RAISE EXCEPTION 'Business Partner request workflow binding is immutable once assigned' USING ERRCODE='check_violation';END IF;
  IF OLD.approved_at IS NOT NULL AND (NEW.approved_at,NEW.approved_by) IS DISTINCT FROM (OLD.approved_at,OLD.approved_by) THEN RAISE EXCEPTION 'Business Partner request approval evidence is immutable once recorded' USING ERRCODE='check_violation';END IF;
  IF OLD.applied_at IS NOT NULL AND (NEW.applied_at,NEW.applied_by,NEW.materialized_business_partner_id,NEW.materialized_supplier_id,NEW.materialized_customer_id,NEW.materialized_person_id,NEW.materialized_employee_id,NEW.materialized_employment_id,NEW.materialized_work_assignment_id,NEW.materialized_principal_id,NEW.materialization_snapshot_id,NEW.application_idempotency_key,NEW.application_fingerprint) IS DISTINCT FROM (OLD.applied_at,OLD.applied_by,OLD.materialized_business_partner_id,OLD.materialized_supplier_id,OLD.materialized_customer_id,OLD.materialized_person_id,OLD.materialized_employee_id,OLD.materialized_employment_id,OLD.materialized_work_assignment_id,OLD.materialized_principal_id,OLD.materialization_snapshot_id,OLD.application_idempotency_key,OLD.application_fingerprint) THEN RAISE EXCEPTION 'Business Partner request application evidence is immutable once recorded' USING ERRCODE='check_violation';END IF;
  IF OLD.status NOT IN('draft','validating','validation_failed','returned') AND (NEW.base_record_version,NEW.base_snapshot_id,NEW.base_payload_hash,NEW.requested_role,NEW.operating_organization_id,NEW.company_code_id,NEW.legal_entity_id,NEW.org_unit_id,NEW.position_id,NEW.payload_schema_code,NEW.payload_schema_version,NEW.payload_schema_hash,NEW.proposed_payload,NEW.validation_summary,NEW.duplicate_summary,NEW.change_impact,NEW.decision_fingerprint) IS DISTINCT FROM (OLD.base_record_version,OLD.base_snapshot_id,OLD.base_payload_hash,OLD.requested_role,OLD.operating_organization_id,OLD.company_code_id,OLD.legal_entity_id,OLD.org_unit_id,OLD.position_id,OLD.payload_schema_code,OLD.payload_schema_version,OLD.payload_schema_hash,OLD.proposed_payload,OLD.validation_summary,OLD.duplicate_summary,OLD.change_impact,OLD.decision_fingerprint) THEN RAISE EXCEPTION 'Submitted Business Partner request review coordinates and payload are immutable' USING ERRCODE='check_violation';END IF;
  IF NEW.status=OLD.status THEN RETURN NEW;END IF;
  v_valid:=CASE OLD.status WHEN 'draft' THEN NEW.status IN('validating','cancelled') WHEN 'validating' THEN NEW.status IN('draft','validation_failed','pending_approval','cancelled') WHEN 'validation_failed' THEN NEW.status IN('draft','validating','cancelled') WHEN 'pending_approval' THEN NEW.status IN('returned','approved','rejected','cancelled') WHEN 'returned' THEN NEW.status IN('validating','cancelled','superseded') WHEN 'approved' THEN NEW.status='applying' WHEN 'applying' THEN NEW.status IN('applied','failed') WHEN 'failed' THEN NEW.status IN('applying','superseded') ELSE false END;
  IF NOT v_valid THEN RAISE EXCEPTION 'Invalid Business Partner request transition: % -> %',OLD.status,NEW.status USING ERRCODE='check_violation';END IF;
  IF NEW.status IN('pending_approval','returned','approved','rejected','applying','applied','failed') AND (NEW.submitted_at IS NULL OR NEW.submitted_by IS NULL OR NEW.workflow_request_id IS NULL OR NEW.decision_fingerprint IS NULL) THEN RAISE EXCEPTION 'Submitted Business Partner request requires submission, workflow, and fingerprint evidence' USING ERRCODE='check_violation';END IF;
  IF NEW.status IN('approved','applying','applied','failed') AND (NEW.approved_at IS NULL OR NEW.approved_by IS NULL) THEN RAISE EXCEPTION 'Approved Business Partner request requires approval evidence' USING ERRCODE='check_violation';END IF;
  IF NEW.status='applied' AND (NEW.applied_at IS NULL OR NEW.applied_by IS NULL OR NEW.materialized_business_partner_id IS NULL OR NEW.materialization_snapshot_id IS NULL OR NEW.application_idempotency_key IS NULL OR NEW.application_fingerprint IS NULL OR NOT ((NEW.requested_role IN('supplier','customer') AND num_nonnulls(NEW.materialized_supplier_id,NEW.materialized_customer_id)=1 AND NEW.materialized_operating_organization_assignment_id IS NOT NULL AND num_nonnulls(NEW.materialized_person_id,NEW.materialized_employee_id,NEW.materialized_employment_id,NEW.materialized_work_assignment_id,NEW.materialized_principal_id)=0) OR (NEW.requested_role='workforce' AND NEW.materialized_person_id IS NOT NULL AND NEW.materialized_employee_id IS NOT NULL AND NEW.materialized_employment_id IS NOT NULL AND NEW.materialized_work_assignment_id IS NOT NULL AND num_nonnulls(NEW.materialized_supplier_id,NEW.materialized_customer_id,NEW.materialized_supplier_company_profile_id,NEW.materialized_customer_company_profile_id,NEW.materialized_operating_organization_assignment_id)=0))) THEN RAISE EXCEPTION 'Applied Business Partner request requires role-aware application evidence' USING ERRCODE='check_violation';END IF;
  RETURN NEW;
END $$;

COMMIT;
