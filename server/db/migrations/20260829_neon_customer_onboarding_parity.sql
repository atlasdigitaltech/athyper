\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database()<>'athyper_neon' OR current_setting('app.database_plane',true)<>'neon' THEN
    RAISE EXCEPTION 'Customer onboarding parity migration requires athyper_neon with app.database_plane=neon';
  END IF;
END $$;

ALTER TABLE document.supplier_registration_invitation ADD COLUMN registration_role master.partner_role_d NOT NULL DEFAULT 'supplier';

CREATE TABLE control.customer_credit_review (
 id uuid NOT NULL DEFAULT shared.uuidv7(),tenant_id uuid NOT NULL,business_partner_id uuid NOT NULL,customer_id uuid NOT NULL,
 operating_organization_id uuid NOT NULL,company_code_id uuid NOT NULL,review_type_code text NOT NULL DEFAULT 'initial',
 requested_credit_limit numeric(20,4),currency_code character(3),risk_class_code text,decision text NOT NULL DEFAULT 'pending',
 decision_reason text,conditions jsonb NOT NULL DEFAULT '[]'::jsonb,effective_from date,effective_until date,idempotency_key text NOT NULL,
 decision_idempotency_key text,decision_fingerprint text,reviewed_at timestamptz,reviewed_by uuid,approved_at timestamptz,approved_by uuid,
 row_version bigint NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL,updated_at timestamptz,updated_by uuid,
 CONSTRAINT customer_credit_review_pkey PRIMARY KEY(id),CONSTRAINT customer_credit_review_tenant_id_uq UNIQUE(tenant_id,id),
 CONSTRAINT customer_credit_review_decision_chk CHECK(decision IN('pending','approved','conditional','rejected','suspended','expired')),
 CONSTRAINT customer_credit_review_limit_chk CHECK(requested_credit_limit IS NULL OR requested_credit_limit>=0),
 CONSTRAINT customer_credit_review_currency_chk CHECK((requested_credit_limit IS NULL)=(currency_code IS NULL)),
 CONSTRAINT customer_credit_review_range_chk CHECK(effective_until IS NULL OR effective_from IS NULL OR effective_until>effective_from),
 CONSTRAINT customer_credit_review_conditions_chk CHECK(jsonb_typeof(conditions)='array'),
 CONSTRAINT customer_credit_review_key_chk CHECK(btrim(idempotency_key)=idempotency_key AND length(idempotency_key) BETWEEN 8 AND 200),
 CONSTRAINT customer_credit_review_decision_evidence_chk CHECK((decision='pending' AND reviewed_at IS NULL AND reviewed_by IS NULL AND decision_reason IS NULL AND decision_idempotency_key IS NULL AND decision_fingerprint IS NULL) OR (decision<>'pending' AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL AND decision_reason IS NOT NULL AND decision_idempotency_key IS NOT NULL AND decision_fingerprint ~ '^[a-f0-9]{64}$')),
 CONSTRAINT customer_credit_review_approval_pair_chk CHECK((approved_at IS NULL)=(approved_by IS NULL)),
 CONSTRAINT customer_credit_review_approved_chk CHECK((decision IN('approved','conditional'))=(approved_at IS NOT NULL)),
 CONSTRAINT customer_credit_review_version_chk CHECK(row_version>=1),CONSTRAINT customer_credit_review_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL)),
 CONSTRAINT customer_credit_review_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
 CONSTRAINT customer_credit_review_partner_fk FOREIGN KEY(tenant_id,business_partner_id) REFERENCES master.business_partner(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT customer_credit_review_customer_fk FOREIGN KEY(tenant_id,customer_id) REFERENCES master.customer(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT customer_credit_review_org_fk FOREIGN KEY(tenant_id,operating_organization_id) REFERENCES master.operating_organization(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT customer_credit_review_company_fk FOREIGN KEY(tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT customer_credit_review_reviewed_by_fk FOREIGN KEY(tenant_id,reviewed_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT customer_credit_review_approved_by_fk FOREIGN KEY(tenant_id,approved_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT customer_credit_review_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT customer_credit_review_updated_by_fk FOREIGN KEY(tenant_id,updated_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX customer_credit_review_idempotency_uq ON control.customer_credit_review(tenant_id,idempotency_key);
CREATE UNIQUE INDEX customer_credit_review_decision_idempotency_uq ON control.customer_credit_review(tenant_id,decision_idempotency_key) WHERE decision_idempotency_key IS NOT NULL;
CREATE INDEX customer_credit_review_scope_idx ON control.customer_credit_review(tenant_id,business_partner_id,operating_organization_id,company_code_id,created_at DESC);
CREATE UNIQUE INDEX customer_credit_review_effective_approved_uq ON control.customer_credit_review(tenant_id,customer_id,operating_organization_id,company_code_id) WHERE decision IN('approved','conditional') AND effective_until IS NULL;

CREATE TABLE control.customer_lifecycle_event (
 id uuid NOT NULL DEFAULT shared.uuidv7(),tenant_id uuid NOT NULL,business_partner_id uuid NOT NULL,customer_id uuid NOT NULL,
 operating_organization_id uuid NOT NULL,company_code_id uuid NOT NULL,action_code text NOT NULL,from_status text NOT NULL,to_status text NOT NULL,
 reason_code text NOT NULL,readiness_fingerprint text,readiness_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,idempotency_key text NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now(),occurred_by uuid NOT NULL,
 CONSTRAINT customer_lifecycle_event_pkey PRIMARY KEY(id),CONSTRAINT customer_lifecycle_event_tenant_id_uq UNIQUE(tenant_id,id),
 CONSTRAINT customer_lifecycle_event_action_chk CHECK(action_code IN('activate','suspend','reactivate')),
 CONSTRAINT customer_lifecycle_event_transition_chk CHECK((action_code='activate' AND from_status='prospect' AND to_status='active') OR(action_code='suspend' AND from_status='active' AND to_status='suspended') OR(action_code='reactivate' AND from_status='suspended' AND to_status='active')),
 CONSTRAINT customer_lifecycle_event_reason_chk CHECK(reason_code ~ '^[A-Z][A-Z0-9_.-]{2,126}$'),
 CONSTRAINT customer_lifecycle_event_fingerprint_chk CHECK(readiness_fingerprint IS NULL OR readiness_fingerprint ~ '^[a-f0-9]{64}$'),
 CONSTRAINT customer_lifecycle_event_evidence_chk CHECK(jsonb_typeof(readiness_evidence)='object'),
 CONSTRAINT customer_lifecycle_event_key_chk CHECK(btrim(idempotency_key)=idempotency_key AND length(idempotency_key) BETWEEN 8 AND 200),
 CONSTRAINT customer_lifecycle_event_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
 CONSTRAINT customer_lifecycle_event_partner_fk FOREIGN KEY(tenant_id,business_partner_id) REFERENCES master.business_partner(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT customer_lifecycle_event_customer_fk FOREIGN KEY(tenant_id,customer_id) REFERENCES master.customer(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT customer_lifecycle_event_org_fk FOREIGN KEY(tenant_id,operating_organization_id) REFERENCES master.operating_organization(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT customer_lifecycle_event_company_fk FOREIGN KEY(tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT customer_lifecycle_event_actor_fk FOREIGN KEY(tenant_id,occurred_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX customer_lifecycle_event_idempotency_uq ON control.customer_lifecycle_event(tenant_id,idempotency_key);
CREATE INDEX customer_lifecycle_event_customer_idx ON control.customer_lifecycle_event(tenant_id,customer_id,occurred_at DESC);

ALTER TABLE control.customer_credit_review ENABLE ROW LEVEL SECURITY;ALTER TABLE control.customer_credit_review FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON control.customer_credit_review USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
CREATE POLICY migration_owner_access ON control.customer_credit_review FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
ALTER TABLE control.customer_lifecycle_event ENABLE ROW LEVEL SECURITY;ALTER TABLE control.customer_lifecycle_event FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON control.customer_lifecycle_event USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
CREATE POLICY migration_owner_access ON control.customer_lifecycle_event FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);
REVOKE ALL ON control.customer_credit_review,control.customer_lifecycle_event FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT SELECT,INSERT,UPDATE ON control.customer_credit_review TO athyperapp;GRANT SELECT,INSERT ON control.customer_lifecycle_event TO athyperapp;END IF;IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT ALL PRIVILEGES ON control.customer_credit_review,control.customer_lifecycle_event TO athyperadmin;END IF;END $$;

CREATE OR REPLACE FUNCTION control.trg_reject_customer_lifecycle_event_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'Customer lifecycle events are immutable' USING ERRCODE='integrity_constraint_violation';END $$;
CREATE TRIGGER trg_customer_lifecycle_event_immutable BEFORE UPDATE OR DELETE ON control.customer_lifecycle_event FOR EACH ROW EXECUTE FUNCTION control.trg_reject_customer_lifecycle_event_mutation();

INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
SELECT value.id::uuid,value.code,'entity_operation',module.id,value.risk::authz.risk_tier_d,value.mfa,value.sod,false,false,false,'{"_seed":{"pack":"neon.customer-onboarding-parity","version":"1.0.0"}}'::jsonb,'published','00000000-0000-0000-0000-000000000000'::uuid
FROM control.module module CROSS JOIN(VALUES
 ('30a20e34-e57e-5d8a-86d4-b31fc6943101','neon.customer.credit.create','high',false,true),
 ('c25dc54d-ce79-5d2e-812c-889a810401d4','neon.customer.credit.decide','critical',true,true),
 ('a59ceba9-57f8-5654-8c08-f9998dc30d27','neon.customer.credit.read','medium',false,false),
 ('c39e35d0-659a-5a90-a6a7-c39dbf84b730','neon.customer.lifecycle.activate','critical',true,true),
 ('87075ec5-2c1c-540a-b209-ed1fb0a18c53','neon.customer.lifecycle.suspend','critical',true,true),
 ('e05ed0ea-5b99-5877-ad9a-b23f49bfec3a','neon.customer.lifecycle.reactivate','critical',true,true)
 ,('d123781f-9f78-5260-a333-5db597b7135b','neon.customer_registration.invitation.create','high',false,true)
 ,('56c3aba8-13e5-5dc2-acfc-f9028830bdc1','neon.customer_registration.invitation.read','medium',false,false)
 ,('ed3dc9f6-151f-53f7-aee2-91b67a477219','neon.customer_registration.invitation.cancel','high',true,true)
 ,('98be6524-80bd-5918-8656-465ff80ca7f6','neon.customer_registration.external.respond','medium',false,false)
)value(id,code,risk,mfa,sod) WHERE module.code='fnd' AND module.status='active' ON CONFLICT(canonical_code) DO UPDATE SET risk_tier=EXCLUDED.risk_tier,requires_mfa=EXCLUDED.requires_mfa,requires_sod=EXCLUDED.requires_sod,metadata=authz.permission.metadata||EXCLUDED.metadata,status='published';
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
SELECT id,'operating_organization','subtree','active','00000000-0000-0000-0000-000000000000'::uuid FROM authz.permission WHERE canonical_code LIKE 'neon.customer.credit.%' OR canonical_code LIKE 'neon.customer.lifecycle.%'
ON CONFLICT(permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active';
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by) SELECT id,'operating_organization','subtree','active','00000000-0000-0000-0000-000000000000'::uuid FROM authz.permission WHERE canonical_code LIKE 'neon.customer_registration.invitation.%' ON CONFLICT(permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active';
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by) SELECT id,'tenant','exact','active','00000000-0000-0000-0000-000000000000'::uuid FROM authz.permission WHERE canonical_code='neon.customer_registration.external.respond' ON CONFLICT(permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active';

CREATE OR REPLACE FUNCTION document.trg_guard_registration_role_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$ BEGIN IF NEW.registration_role IS DISTINCT FROM OLD.registration_role THEN RAISE EXCEPTION 'Registration invitation role is immutable' USING ERRCODE='check_violation';END IF;RETURN NEW;END $$;
CREATE TRIGGER trg_supplier_registration_invitation_05_role BEFORE UPDATE ON document.supplier_registration_invitation FOR EACH ROW EXECUTE FUNCTION document.trg_guard_registration_role_immutable();

-- Person customers carry person evidence but never workforce evidence.
ALTER TABLE document.business_partner_request DROP CONSTRAINT business_partner_request_materialization_evidence_chk;
ALTER TABLE document.business_partner_request ADD CONSTRAINT business_partner_request_materialization_evidence_chk CHECK((status='applied')=(materialized_business_partner_id IS NOT NULL AND materialization_snapshot_id IS NOT NULL AND application_idempotency_key IS NOT NULL AND application_fingerprint IS NOT NULL AND application_result_kind IS NOT NULL AND applied_at IS NOT NULL AND applied_by IS NOT NULL AND CASE request_kind
 WHEN 'new_partner' THEN CASE requested_role WHEN 'workforce' THEN application_result_kind='workforce_created' AND materialized_person_id IS NOT NULL AND materialized_employee_id IS NOT NULL AND materialized_employment_id IS NOT NULL AND materialized_work_assignment_id IS NOT NULL AND num_nonnulls(materialized_supplier_id,materialized_customer_id,materialized_operating_organization_assignment_id,materialized_bank_verification_id)=0 WHEN 'supplier' THEN application_result_kind='partner_role_created' AND materialized_supplier_id IS NOT NULL AND materialized_customer_id IS NULL AND materialized_person_id IS NULL AND materialized_operating_organization_assignment_id IS NOT NULL WHEN 'customer' THEN application_result_kind='partner_role_created' AND materialized_customer_id IS NOT NULL AND materialized_supplier_id IS NULL AND materialized_operating_organization_assignment_id IS NOT NULL AND (CASE WHEN COALESCE(proposed_payload->>'partnerCategory',proposed_payload->>'partner_category') IN('person','individual') THEN materialized_person_id IS NOT NULL ELSE materialized_person_id IS NULL END) AND num_nonnulls(materialized_employee_id,materialized_employment_id,materialized_work_assignment_id)=0 ELSE false END
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
 WHEN 'archive' THEN application_result_kind='partner_archived' AND application_reason_code IS NOT NULL AND requested_role IS NULL AND num_nonnulls(materialized_supplier_id,materialized_customer_id,materialized_person_id,materialized_employee_id,materialized_employment_id,materialized_work_assignment_id,materialized_supplier_company_profile_id,materialized_customer_company_profile_id,materialized_operating_organization_assignment_id,materialized_bank_verification_id)=0 ELSE false END));

COMMENT ON TABLE control.customer_credit_review IS 'Independent company-scoped credit/commercial review; registration approval cannot decide or activate it.';
COMMENT ON TABLE control.customer_lifecycle_event IS 'Immutable customer activation/suspension/reactivation ledger with pinned readiness evidence.';
COMMIT;
