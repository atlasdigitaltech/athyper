BEGIN;

DO $$ BEGIN
  IF current_database()<>'athyper_neon' OR current_setting('app.database_plane',true)<>'neon' THEN
    RAISE EXCEPTION 'Workforce lifecycle migration requires the NEON plane';
  END IF;
END $$;

ALTER TABLE document.onboarding_case
  ADD COLUMN business_partner_request_id uuid,
  ADD COLUMN business_partner_id uuid,
  ADD COLUMN employment_id uuid,
  ADD COLUMN work_assignment_id uuid,
  ADD COLUMN row_version bigint NOT NULL DEFAULT 1;

ALTER TABLE document.onboarding_case
  ADD CONSTRAINT onboarding_case_request_uq UNIQUE(tenant_id,business_partner_request_id),
  ADD CONSTRAINT onboarding_case_request_fk FOREIGN KEY(tenant_id,business_partner_request_id) REFERENCES document.business_partner_request(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT onboarding_case_partner_fk FOREIGN KEY(tenant_id,business_partner_id) REFERENCES master.business_partner(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT onboarding_case_employment_fk FOREIGN KEY(tenant_id,employment_id) REFERENCES master.employment(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT onboarding_case_assignment_fk FOREIGN KEY(tenant_id,work_assignment_id) REFERENCES master.work_assignment(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT onboarding_case_request_binding_chk CHECK((business_partner_request_id IS NULL)=(business_partner_id IS NULL) AND (business_partner_request_id IS NULL)=(employment_id IS NULL) AND (business_partner_request_id IS NULL)=(work_assignment_id IS NULL));

ALTER TABLE document.business_partner_request ADD COLUMN materialized_onboarding_case_id uuid;
ALTER TABLE document.business_partner_request ADD CONSTRAINT business_partner_request_onboarding_case_fk
  FOREIGN KEY(tenant_id,materialized_onboarding_case_id) REFERENCES document.onboarding_case(tenant_id,id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE document.business_partner_request VALIDATE CONSTRAINT business_partner_request_onboarding_case_fk;

INSERT INTO document.onboarding_case(tenant_id,code,name,person_id,employee_id,target_start_date,checklist,workflow_request_id,business_partner_request_id,business_partner_id,employment_id,work_assignment_id,status,status_changed_at,status_changed_by,created_at,created_by)
SELECT request.tenant_id,'ONB.'||request.request_no,'Onboarding '||employee.name,request.materialized_person_id,request.materialized_employee_id,employment.hire_date,
  '[{"code":"payroll","label":"Payroll enrollment","category":"payroll","required":true,"status":"pending"},{"code":"equipment","label":"Equipment issued","category":"equipment","required":true,"status":"pending"},{"code":"policy","label":"Policies acknowledged","category":"policy","required":true,"status":"pending"},{"code":"training","label":"Required training","category":"training","required":true,"status":"pending"}]'::jsonb,
  request.workflow_request_id,request.id,request.materialized_business_partner_id,request.materialized_employment_id,request.materialized_work_assignment_id,'draft',NULL,NULL,request.applied_at,request.applied_by
FROM document.business_partner_request request JOIN master.employee employee ON employee.tenant_id=request.tenant_id AND employee.id=request.materialized_employee_id JOIN master.employment employment ON employment.tenant_id=request.tenant_id AND employment.id=request.materialized_employment_id
WHERE request.status='applied' AND request.application_result_kind='workforce_created' AND NOT EXISTS(SELECT 1 FROM document.onboarding_case value WHERE value.tenant_id=request.tenant_id AND value.business_partner_request_id=request.id);
UPDATE document.onboarding_case value SET status='active',status_changed_at=COALESCE(request.applied_at,now()),status_changed_by=request.applied_by,updated_by=request.applied_by FROM document.business_partner_request request WHERE value.tenant_id=request.tenant_id AND value.business_partner_request_id=request.id AND value.status='draft';
UPDATE document.business_partner_request request SET materialized_onboarding_case_id=value.id FROM document.onboarding_case value WHERE value.tenant_id=request.tenant_id AND value.business_partner_request_id=request.id AND request.application_result_kind='workforce_created' AND request.materialized_onboarding_case_id IS NULL;
ALTER TABLE document.business_partner_request ADD CONSTRAINT business_partner_request_workforce_onboarding_chk CHECK(application_result_kind<>'workforce_created' OR materialized_onboarding_case_id IS NOT NULL) NOT VALID;
ALTER TABLE document.business_partner_request VALIDATE CONSTRAINT business_partner_request_workforce_onboarding_chk;

CREATE OR REPLACE FUNCTION document.trg_guard_workforce_onboarding_binding() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF OLD.status='applied' AND NEW.materialized_onboarding_case_id IS DISTINCT FROM OLD.materialized_onboarding_case_id THEN RAISE EXCEPTION 'Applied workforce onboarding binding is immutable' USING ERRCODE='check_violation'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_business_partner_request_onboarding_binding BEFORE UPDATE ON document.business_partner_request FOR EACH ROW EXECUTE FUNCTION document.trg_guard_workforce_onboarding_binding();

CREATE TABLE document.workforce_iam_projection (
  id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, employee_id uuid NOT NULL,
  employer_organization_id uuid NOT NULL, requested_principal_creation boolean NOT NULL DEFAULT false,
  desired_state text NOT NULL DEFAULT 'member', observed_state text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0, last_error_code text, next_attempt_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key text NOT NULL, row_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
  CONSTRAINT workforce_iam_projection_pkey PRIMARY KEY(id),
  CONSTRAINT workforce_iam_projection_tenant_id_uq UNIQUE(tenant_id,id),
  CONSTRAINT workforce_iam_projection_employee_uq UNIQUE(tenant_id,employee_id),
  CONSTRAINT workforce_iam_projection_idempotency_uq UNIQUE(tenant_id,idempotency_key),
  CONSTRAINT workforce_iam_projection_employee_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES master.employee(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT workforce_iam_projection_state_chk CHECK(desired_state IN('member','deprovisioned') AND observed_state IN('pending','provisioned','failed','deprovisioned')),
  CONSTRAINT workforce_iam_projection_attempt_chk CHECK(attempt_count>=0 AND btrim(idempotency_key)<>''),
  CONSTRAINT workforce_iam_projection_audit_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);
COMMENT ON TABLE document.workforce_iam_projection IS 'P7 saga intent. HR materialization commits independently; retries update this row and never recreate person or employee.';

CREATE TABLE document.person_sensitive_access_audit (
  id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, person_id uuid NOT NULL,
  principal_id uuid NOT NULL, purpose_code text NOT NULL, requested_fields text[] NOT NULL,
  disclosed_fields text[] NOT NULL, redacted_fields text[] NOT NULL, request_id uuid NOT NULL,
  accessed_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
  CONSTRAINT person_sensitive_access_audit_pkey PRIMARY KEY(id),
  CONSTRAINT person_sensitive_access_audit_tenant_id_uq UNIQUE(tenant_id,id),
  CONSTRAINT person_sensitive_access_person_fk FOREIGN KEY(tenant_id,person_id) REFERENCES master.person(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT person_sensitive_access_purpose_chk CHECK(purpose_code IN('employment','payroll','benefits','compliance')),
  CONSTRAINT person_sensitive_access_fields_chk CHECK(cardinality(requested_fields)>0 AND disclosed_fields<@requested_fields AND redacted_fields<@requested_fields),
  CONSTRAINT person_sensitive_access_retention_chk CHECK(expires_at>accessed_at)
);
COMMENT ON TABLE document.person_sensitive_access_audit IS 'Append-only purpose and field access evidence. Sensitive values are never copied into the audit row.';

ALTER TABLE document.offboarding_case
  ADD COLUMN employment_id uuid,
  ADD COLUMN employment_terminated_at timestamptz,
  ADD COLUMN resource_checklist_completed_at timestamptz,
  ADD COLUMN access_deprovision_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN idempotency_key text,
  ADD COLUMN row_version bigint NOT NULL DEFAULT 1;
ALTER TABLE document.offboarding_case
  ADD CONSTRAINT offboarding_case_employment_fk FOREIGN KEY(tenant_id,employment_id) REFERENCES master.employment(tenant_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT offboarding_case_idempotency_uq UNIQUE(tenant_id,idempotency_key),
  ADD CONSTRAINT offboarding_case_access_state_chk CHECK(access_deprovision_status IN('pending','requested','completed','failed')),
  ADD CONSTRAINT offboarding_case_separation_chk CHECK(resource_checklist_completed_at IS NULL OR employment_terminated_at IS NOT NULL);

CREATE OR REPLACE FUNCTION master.trg_validate_work_assignment_scope() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,master AS $$
BEGIN
  IF NEW.position_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM master.position p WHERE p.tenant_id=NEW.tenant_id AND p.id=NEW.position_id AND p.company_code_id=NEW.company_code_id AND (p.org_unit_id IS NULL OR p.org_unit_id=NEW.org_unit_id) AND p.status='active') THEN
    RAISE EXCEPTION 'Work assignment position is incompatible with company or organization unit' USING ERRCODE='integrity_constraint_violation';
  END IF;
  IF NEW.manager_employee_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM master.work_assignment manager_assignment WHERE manager_assignment.tenant_id=NEW.tenant_id AND manager_assignment.employee_id=NEW.manager_employee_id AND manager_assignment.company_code_id=NEW.company_code_id AND manager_assignment.assignment_type='primary' AND manager_assignment.status='active' AND daterange(manager_assignment.effective_from,COALESCE(manager_assignment.effective_until,'infinity'::date),'[)') @> NEW.effective_from) THEN
    RAISE EXCEPTION 'Work assignment manager is not effective in the assigned company' USING ERRCODE='integrity_constraint_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_work_assignment_scope BEFORE INSERT OR UPDATE OF tenant_id,employee_id,employment_id,position_id,org_unit_id,company_code_id,manager_employee_id,effective_from ON master.work_assignment FOR EACH ROW EXECUTE FUNCTION master.trg_validate_work_assignment_scope();

CREATE OR REPLACE FUNCTION document.trg_guard_person_sensitive_access_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Person sensitive access audit is append-only' USING ERRCODE='restrict_violation'; END $$;
CREATE TRIGGER trg_person_sensitive_access_audit_immutable BEFORE UPDATE OR DELETE ON document.person_sensitive_access_audit FOR EACH ROW EXECUTE FUNCTION document.trg_guard_person_sensitive_access_audit();

ALTER TABLE document.workforce_iam_projection ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.workforce_iam_projection FORCE ROW LEVEL SECURITY;
CREATE POLICY workforce_iam_projection_tenant ON document.workforce_iam_projection USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
ALTER TABLE document.person_sensitive_access_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.person_sensitive_access_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY person_sensitive_access_audit_tenant ON document.person_sensitive_access_audit USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
GRANT SELECT,INSERT,UPDATE ON document.workforce_iam_projection TO athyperapp;
GRANT SELECT,INSERT ON document.person_sensitive_access_audit TO athyperapp;

INSERT INTO master.audit_event_contract(code,event_code_pattern,priority,allowed_operations,default_severity,allowed_actor_types,allowed_scope,reason_required,capture_mode,max_payload_bytes,schema_version,metadata,status)
VALUES('workforce_lifecycle_event','^workforce\.(onboarding\.task_completed|offboarding\.(started|resource_completed)|iam\.projection_requested|person_evidence\.accessed)$',24,ARRAY['execute']::audit.operation_d[],'warning',ARRAY['user','service_account','integration','system']::audit.actor_type_d[],'tenant',false,'metadata',16384,1,'{"event_category":"business_critical","owner":"people","purpose":"workforce_lifecycle_and_restricted_access_evidence"}'::jsonb,'active') ON CONFLICT(code) DO UPDATE SET event_code_pattern=EXCLUDED.event_code_pattern,schema_version=EXCLUDED.schema_version,status='active';

INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
SELECT value.id::uuid,value.code,'entity_operation',module.id,value.risk::authz.risk_tier_d,value.mfa,value.sod,false,false,false,'{"_seed":{"pack":"neon.workforce-lifecycle","version":"1.0.0"}}'::jsonb,'published','00000000-0000-0000-0000-000000000000'::uuid FROM control.module module CROSS JOIN(VALUES
 ('c789c25f-d318-5d3c-a2db-b4731db7f1a1','neon.workforce.read','medium',false,false),
 ('f91a4d35-032f-5860-a8f1-3d9d3750c78f','neon.workforce.review','medium',false,false),
 ('7b98e305-d6df-58ea-8595-ffda8d5d004e','neon.workforce.onboarding.execute','high',false,false),
 ('86ec05a4-9345-54fc-a595-743ad0df7d76','neon.workforce.offboarding.execute','critical',true,true),
 ('fc257aa5-b438-54bb-bce6-671e48d36ce1','neon.workforce.pii.read','critical',true,false),
 ('9d2f97ba-92dc-590b-baae-cd288fbaab20','neon.workforce.iam.retry','high',true,false),
 ('f90adf73-55f6-55bb-a284-d327f8f2bd98','neon.workforce.integration.import','high',false,false)
)value(id,code,risk,mfa,sod) WHERE module.code='fnd' AND module.status='active' ON CONFLICT(canonical_code) DO UPDATE SET risk_tier=EXCLUDED.risk_tier,requires_mfa=EXCLUDED.requires_mfa,requires_sod=EXCLUDED.requires_sod,status='published';
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by) SELECT id,'tenant','exact','active','00000000-0000-0000-0000-000000000000'::uuid FROM authz.permission WHERE canonical_code LIKE 'neon.workforce.%' ON CONFLICT(permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active';

COMMIT;
