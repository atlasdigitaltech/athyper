-- S2: make NEON Business Partner organization-only and move workforce changes
-- to the People/Workforce request authority without deleting historical evidence.
BEGIN;

DO $preflight$
DECLARE
    v_open_count bigint;
    v_open_sample jsonb;
BEGIN
    IF current_database() <> 'athyper_neon'
       OR current_setting('app.database_plane', true) <> 'neon' THEN
        RAISE EXCEPTION 'Business Partner organization boundary requires the NEON plane';
    END IF;

    SELECT count(*),
           coalesce(jsonb_agg(request_no ORDER BY request_no) FILTER (WHERE sample_rank <= 20), '[]'::jsonb)
      INTO v_open_count, v_open_sample
      FROM (
          SELECT request_no,
                 row_number() OVER (ORDER BY request_no) AS sample_rank
            FROM document.business_partner_request
           WHERE (
                    request_kind IN ('add_workforce', 'change_employment')
                 OR requested_role = 'workforce'
                 OR coalesce(proposed_payload->>'partnerCategory', proposed_payload->>'partner_category', '')
                    IN ('person', 'individual', 'group')
           )
             AND status NOT IN ('applied', 'rejected', 'cancelled', 'superseded')
      ) AS open_request;

    IF v_open_count > 0 THEN
        RAISE EXCEPTION 'S2 blocked: % non-terminal workforce/person Business Partner requests require disposition', v_open_count
            USING ERRCODE = 'object_not_in_prerequisite_state',
                  DETAIL = jsonb_build_object('count', v_open_count, 'requestNos', v_open_sample)::text,
                  HINT = 'Apply, reject, cancel, or supersede each request through its current governed workflow, then rerun this migration.';
    END IF;

    RAISE NOTICE 'S2 preflight: person links=%, historical workforce/person BP requests=%',
        (SELECT count(*) FROM master.person),
        (SELECT count(*) FROM document.business_partner_request
          WHERE request_kind IN ('add_workforce','change_employment')
             OR requested_role = 'workforce'
             OR coalesce(proposed_payload->>'partnerCategory', proposed_payload->>'partner_category', '')
                IN ('person','individual','group'));
END;
$preflight$;

CREATE TABLE master.person_business_partner_legacy_link (
    tenant_id uuid NOT NULL,
    person_id uuid NOT NULL,
    business_partner_id uuid NOT NULL,
    partner_category text NOT NULL,
    partner_status text NOT NULL,
    captured_at timestamptz NOT NULL,
    captured_by_migration text NOT NULL,
    CONSTRAINT person_business_partner_legacy_link_pkey PRIMARY KEY (tenant_id, person_id),
    CONSTRAINT person_business_partner_legacy_link_partner_uq UNIQUE (tenant_id, business_partner_id),
    CONSTRAINT person_business_partner_legacy_link_category_chk CHECK (partner_category IN ('person','group','organization')),
    CONSTRAINT person_business_partner_legacy_link_migration_chk CHECK (captured_by_migration ~ '^[0-9]{8}_[a-z0-9_]+\.sql$')
);

INSERT INTO master.person_business_partner_legacy_link (
    tenant_id, person_id, business_partner_id, partner_category, partner_status,
    captured_at, captured_by_migration
)
SELECT person.tenant_id, person.id, person.business_partner_id,
       partner.partner_category::text, partner.status::text, statement_timestamp(),
       '20260902_neon_business_partner_organization_boundary.sql'
  FROM master.person AS person
  JOIN master.business_partner AS partner
    ON partner.tenant_id = person.tenant_id
   AND partner.id = person.business_partner_id;

DO $assert_capture$
BEGIN
    IF (SELECT count(*) FROM master.person)
       <> (SELECT count(*) FROM master.person_business_partner_legacy_link) THEN
        RAISE EXCEPTION 'S2 legacy Person-to-Business-Partner capture is incomplete';
    END IF;
END;
$assert_capture$;

DROP TRIGGER IF EXISTS trg_person_business_partner_guard ON master.person;
DROP TRIGGER IF EXISTS trg_person_business_partner_cardinality ON master.person;
DROP TRIGGER IF EXISTS trg_business_partner_person_cardinality ON master.business_partner;
DROP FUNCTION IF EXISTS master.trg_validate_person_business_partner();
DROP FUNCTION IF EXISTS master.trg_assert_active_person_business_partner();

ALTER TABLE master.person
    DROP CONSTRAINT IF EXISTS person_business_partner_required_chk,
    DROP CONSTRAINT IF EXISTS person_business_partner_fk,
    DROP CONSTRAINT IF EXISTS person_business_partner_uq;
DROP INDEX IF EXISTS master.person_business_partner_uq;
ALTER TABLE master.person DROP COLUMN business_partner_id;

ALTER TABLE master.business_partner
    ADD CONSTRAINT business_partner_organization_only_chk
    CHECK (partner_category = 'organization') NOT VALID;

COMMENT ON DOMAIN master.business_partner_category_d IS
  'Compatibility structural kind. S2 permits only organization on new NEON Business Partner rows; person and group remain readable only for pre-S2 history.';
COMMENT ON TABLE master.person IS
  'People/Workforce-owned controlled PII profile. A Person is not a Business Partner; employee, employment, work assignment and external-worker engagement own workforce facts.';
COMMENT ON TABLE master.person_business_partner_legacy_link IS
  'Immutable S2 migration evidence for the retired Person-to-Business-Partner association. It is not an identity, authorization, lookup, or join authority.';

CREATE OR REPLACE FUNCTION master.trg_reject_person_business_partner_legacy_link_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    RAISE EXCEPTION 'Legacy Person-to-Business-Partner evidence is immutable'
        USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER trg_person_business_partner_legacy_link_immutable
BEFORE INSERT OR UPDATE OR DELETE ON master.person_business_partner_legacy_link
FOR EACH ROW EXECUTE FUNCTION master.trg_reject_person_business_partner_legacy_link_mutation();

ALTER TABLE master.person_business_partner_legacy_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.person_business_partner_legacy_link FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON master.person_business_partner_legacy_link
    FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY seed_read ON master.person_business_partner_legacy_link
    FOR SELECT TO CURRENT_USER USING (true);

ALTER TABLE document.business_partner_request
    ADD CONSTRAINT business_partner_request_organization_boundary_chk CHECK (
        request_kind NOT IN ('add_workforce', 'change_employment')
        AND requested_role IS DISTINCT FROM 'workforce'
        AND coalesce(proposed_payload->>'partnerCategory', proposed_payload->>'partner_category', '')
            NOT IN ('person', 'individual', 'group')
        AND num_nonnulls(
            materialized_person_id, materialized_employee_id, materialized_employment_id,
            materialized_work_assignment_id, materialized_principal_id
        ) = 0
    ) NOT VALID;

CREATE TABLE document.workforce_request (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
    request_no text NOT NULL, request_kind text NOT NULL, source_kind text NOT NULL,
    target_person_id uuid, target_employee_id uuid, target_employment_id uuid,
    legal_entity_id uuid NOT NULL, company_code_id uuid, org_unit_id uuid, position_id uuid,
    protected_profile_content_item_id uuid,
    payload_schema_code text NOT NULL, payload_schema_version integer NOT NULL,
    payload_schema_hash text NOT NULL, requested_changes jsonb NOT NULL DEFAULT '{}'::jsonb,
    workflow_request_id uuid,
    materialized_person_id uuid, materialized_employee_id uuid,
    materialized_employment_id uuid, materialized_work_assignment_id uuid,
    materialized_principal_id uuid, materialized_onboarding_case_id uuid,
    materialization_snapshot_id uuid, decision_fingerprint text,
    application_fingerprint text, idempotency_key text NOT NULL,
    status text NOT NULL DEFAULT 'draft', submitted_at timestamptz, submitted_by uuid,
    approved_at timestamptz, approved_by uuid, applied_at timestamptz, applied_by uuid,
    failure_code text, support_reference text, row_version bigint NOT NULL DEFAULT 1,
    status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
    updated_at timestamptz, updated_by uuid,
    CONSTRAINT workforce_request_pkey PRIMARY KEY (id),
    CONSTRAINT workforce_request_tenant_id_uq UNIQUE (tenant_id,id),
    CONSTRAINT workforce_request_no_uq UNIQUE (tenant_id,request_no),
    CONSTRAINT workforce_request_idempotency_uq UNIQUE (tenant_id,idempotency_key),
    CONSTRAINT workforce_request_no_chk CHECK (request_no ~ '^[A-Z][A-Z0-9_.-]{2,62}$'),
    CONSTRAINT workforce_request_kind_chk CHECK (request_kind IN ('onboard_person','add_employment','change_employment','offboard_employment')),
    CONSTRAINT workforce_request_source_chk CHECK (source_kind IN ('manual','portal','import','api')),
    CONSTRAINT workforce_request_target_chk CHECK (
        (request_kind='onboard_person' AND target_person_id IS NULL AND target_employee_id IS NULL AND target_employment_id IS NULL)
        OR (request_kind='add_employment' AND target_person_id IS NOT NULL AND target_employment_id IS NULL)
        OR (request_kind IN ('change_employment','offboard_employment') AND target_person_id IS NOT NULL AND target_employee_id IS NOT NULL AND target_employment_id IS NOT NULL)
    ),
    CONSTRAINT workforce_request_scope_chk CHECK ((request_kind IN ('onboard_person','add_employment','change_employment') AND company_code_id IS NOT NULL AND org_unit_id IS NOT NULL) OR request_kind='offboard_employment'),
    CONSTRAINT workforce_request_profile_evidence_chk CHECK (request_kind<>'onboard_person' OR protected_profile_content_item_id IS NOT NULL),
    CONSTRAINT workforce_request_schema_chk CHECK (payload_schema_code ~ '^[a-z][a-z0-9_.-]{1,126}$' AND payload_schema_version>=1 AND payload_schema_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT workforce_request_payload_chk CHECK (jsonb_typeof(requested_changes)='object' AND pg_column_size(requested_changes)<=262144),
    CONSTRAINT workforce_request_fingerprint_chk CHECK ((decision_fingerprint IS NULL OR decision_fingerprint ~ '^[a-f0-9]{64}$') AND (application_fingerprint IS NULL OR application_fingerprint ~ '^[a-f0-9]{64}$')),
    CONSTRAINT workforce_request_idempotency_chk CHECK (btrim(idempotency_key)=idempotency_key AND length(idempotency_key) BETWEEN 8 AND 200),
    CONSTRAINT workforce_request_status_chk CHECK (status IN ('draft','validating','validation_failed','pending_approval','returned','approved','rejected','applying','applied','failed','cancelled','superseded')),
    CONSTRAINT workforce_request_application_chk CHECK ((status='applied')=(materialization_snapshot_id IS NOT NULL AND application_fingerprint IS NOT NULL AND applied_at IS NOT NULL AND applied_by IS NOT NULL AND CASE request_kind
        WHEN 'onboard_person' THEN materialized_person_id IS NOT NULL AND materialized_employee_id IS NOT NULL AND materialized_employment_id IS NOT NULL AND materialized_work_assignment_id IS NOT NULL
        WHEN 'add_employment' THEN materialized_person_id=target_person_id AND materialized_employee_id IS NOT NULL AND materialized_employment_id IS NOT NULL AND materialized_work_assignment_id IS NOT NULL
        WHEN 'change_employment' THEN materialized_person_id=target_person_id AND materialized_employee_id=target_employee_id AND materialized_employment_id IS NOT NULL AND materialized_work_assignment_id IS NOT NULL
        WHEN 'offboard_employment' THEN materialized_person_id=target_person_id AND materialized_employee_id=target_employee_id AND materialized_employment_id=target_employment_id AND materialized_work_assignment_id IS NULL
        ELSE false END)),
    CONSTRAINT workforce_request_submission_pair_chk CHECK ((submitted_at IS NULL)=(submitted_by IS NULL)),
    CONSTRAINT workforce_request_approval_pair_chk CHECK ((approved_at IS NULL)=(approved_by IS NULL)),
    CONSTRAINT workforce_request_apply_pair_chk CHECK ((applied_at IS NULL)=(applied_by IS NULL)),
    CONSTRAINT workforce_request_no_self_approval_chk CHECK (approved_by IS NULL OR approved_by IS DISTINCT FROM submitted_by),
    CONSTRAINT workforce_request_failure_chk CHECK ((status='failed' AND failure_code ~ '^[A-Z][A-Z0-9_.-]{2,126}$' AND nullif(btrim(support_reference),'') IS NOT NULL) OR (status<>'failed' AND failure_code IS NULL AND support_reference IS NULL)),
    CONSTRAINT workforce_request_row_version_chk CHECK (row_version>=1),
    CONSTRAINT workforce_request_status_pair_chk CHECK ((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT workforce_request_audit_pair_chk CHECK ((updated_at IS NULL)=(updated_by IS NULL))
);

COMMENT ON TABLE document.workforce_request IS
  'People/Workforce-owned request authority for person onboarding and employment lifecycle. It never creates or targets a Business Partner; restricted identity values are referenced through protected content evidence.';

ALTER TABLE document.workforce_request
    ADD CONSTRAINT workforce_request_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT workforce_request_person_fk FOREIGN KEY(tenant_id,target_person_id) REFERENCES master.person(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT workforce_request_employee_fk FOREIGN KEY(tenant_id,target_employee_id) REFERENCES master.employee(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT workforce_request_employment_fk FOREIGN KEY(tenant_id,target_employment_id) REFERENCES master.employment(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT workforce_request_legal_entity_fk FOREIGN KEY(tenant_id,legal_entity_id) REFERENCES master.legal_entity(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT workforce_request_company_fk FOREIGN KEY(tenant_id,company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT workforce_request_org_unit_fk FOREIGN KEY(tenant_id,org_unit_id) REFERENCES master.org_unit(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT workforce_request_position_fk FOREIGN KEY(tenant_id,position_id) REFERENCES master.position(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT workforce_request_profile_content_fk FOREIGN KEY(tenant_id,protected_profile_content_item_id) REFERENCES document.content_item(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT workforce_request_workflow_fk FOREIGN KEY(tenant_id,workflow_request_id) REFERENCES document.workflow_request(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT workforce_request_materialized_person_fk FOREIGN KEY(tenant_id,materialized_person_id) REFERENCES master.person(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT workforce_request_materialized_employee_fk FOREIGN KEY(tenant_id,materialized_employee_id) REFERENCES master.employee(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT workforce_request_materialized_employment_fk FOREIGN KEY(tenant_id,materialized_employment_id) REFERENCES master.employment(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT workforce_request_materialized_assignment_fk FOREIGN KEY(tenant_id,materialized_work_assignment_id) REFERENCES master.work_assignment(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT workforce_request_materialized_principal_fk FOREIGN KEY(tenant_id,materialized_principal_id) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT workforce_request_onboarding_case_fk FOREIGN KEY(tenant_id,materialized_onboarding_case_id) REFERENCES document.onboarding_case(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT workforce_request_snapshot_fk FOREIGN KEY(tenant_id,materialization_snapshot_id) REFERENCES snapshot.entity_snapshot_identity(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT workforce_request_submitted_by_fk FOREIGN KEY(tenant_id,submitted_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT workforce_request_approved_by_fk FOREIGN KEY(tenant_id,approved_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT workforce_request_applied_by_fk FOREIGN KEY(tenant_id,applied_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT workforce_request_status_by_fk FOREIGN KEY(tenant_id,status_changed_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT workforce_request_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT workforce_request_updated_by_fk FOREIGN KEY(tenant_id,updated_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT;

CREATE INDEX workforce_request_queue_idx ON document.workforce_request(tenant_id,status,created_at,id);
CREATE INDEX workforce_request_person_idx ON document.workforce_request(tenant_id,target_person_id,status) WHERE target_person_id IS NOT NULL;
CREATE INDEX workforce_request_employment_idx ON document.workforce_request(tenant_id,target_employment_id,status) WHERE target_employment_id IS NOT NULL;
CREATE INDEX workforce_request_scope_idx ON document.workforce_request(tenant_id,legal_entity_id,company_code_id,org_unit_id,status);
CREATE INDEX workforce_request_workflow_idx ON document.workforce_request(tenant_id,workflow_request_id) WHERE workflow_request_id IS NOT NULL;
CREATE UNIQUE INDEX workforce_request_open_target_kind_uq ON document.workforce_request(tenant_id,target_person_id,request_kind)
 WHERE target_person_id IS NOT NULL AND status IN ('draft','validating','validation_failed','pending_approval','returned','approved','applying','failed');

CREATE OR REPLACE FUNCTION document.fn_workforce_request_payload_has_restricted_key(p_value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
    v_key text;
    v_child jsonb;
    v_normalized text;
BEGIN
    IF jsonb_typeof(p_value) = 'object' THEN
        FOR v_key, v_child IN SELECT key, value FROM jsonb_each(p_value)
        LOOP
            v_normalized := regexp_replace(lower(v_key), '[^a-z0-9]', '', 'g');
            IF v_normalized IN (
                'firstname', 'middlename', 'lastname', 'preferredname', 'displayname',
                'email', 'emailaddress', 'phone', 'phonenumber', 'dateofbirth',
                'gender', 'maritalstatus', 'nationality', 'nationalid',
                'nationalidentifier', 'taxidentifier', 'passport', 'passportnumber',
                'bankaccount', 'iban', 'compensation', 'salary'
            ) THEN
                RETURN true;
            END IF;
            IF document.fn_workforce_request_payload_has_restricted_key(v_child) THEN
                RETURN true;
            END IF;
        END LOOP;
    ELSIF jsonb_typeof(p_value) = 'array' THEN
        FOR v_child IN SELECT value FROM jsonb_array_elements(p_value)
        LOOP
            IF document.fn_workforce_request_payload_has_restricted_key(v_child) THEN
                RETURN true;
            END IF;
        END LOOP;
    END IF;
    RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_workforce_request()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_valid_transition boolean := false;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Workforce requests cannot be deleted; cancel or supersede the request'
            USING ERRCODE = 'restrict_violation';
    END IF;

    IF document.fn_workforce_request_payload_has_restricted_key(NEW.requested_changes) THEN
        RAISE EXCEPTION 'Restricted person values belong in protected profile content, not workforce request JSON'
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'draft'
           OR NEW.workflow_request_id IS NOT NULL
           OR NEW.decision_fingerprint IS NOT NULL
           OR NEW.application_fingerprint IS NOT NULL
           OR num_nonnulls(
                NEW.materialized_person_id, NEW.materialized_employee_id,
                NEW.materialized_employment_id, NEW.materialized_work_assignment_id,
                NEW.materialized_principal_id, NEW.materialized_onboarding_case_id,
                NEW.materialization_snapshot_id
           ) > 0
           OR NEW.submitted_at IS NOT NULL OR NEW.submitted_by IS NOT NULL
           OR NEW.approved_at IS NOT NULL OR NEW.approved_by IS NOT NULL
           OR NEW.applied_at IS NOT NULL OR NEW.applied_by IS NOT NULL THEN
            RAISE EXCEPTION 'New workforce requests must start as evidence-free drafts'
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    IF (NEW.id, NEW.tenant_id, NEW.request_no, NEW.request_kind, NEW.source_kind,
        NEW.target_person_id, NEW.target_employee_id, NEW.target_employment_id,
        NEW.idempotency_key, NEW.created_at, NEW.created_by)
       IS DISTINCT FROM
       (OLD.id, OLD.tenant_id, OLD.request_no, OLD.request_kind, OLD.source_kind,
        OLD.target_person_id, OLD.target_employee_id, OLD.target_employment_id,
        OLD.idempotency_key, OLD.created_at, OLD.created_by) THEN
        RAISE EXCEPTION 'Workforce request identity, target, kind, and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status IN ('applied','rejected','cancelled','superseded') AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'Final workforce request evidence is immutable'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF OLD.status NOT IN ('draft','validation_failed','returned') AND (
        NEW.legal_entity_id IS DISTINCT FROM OLD.legal_entity_id
        OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
        OR NEW.org_unit_id IS DISTINCT FROM OLD.org_unit_id
        OR NEW.position_id IS DISTINCT FROM OLD.position_id
        OR NEW.protected_profile_content_item_id IS DISTINCT FROM OLD.protected_profile_content_item_id
        OR NEW.payload_schema_code IS DISTINCT FROM OLD.payload_schema_code
        OR NEW.payload_schema_version IS DISTINCT FROM OLD.payload_schema_version
        OR NEW.payload_schema_hash IS DISTINCT FROM OLD.payload_schema_hash
        OR NEW.requested_changes IS DISTINCT FROM OLD.requested_changes
        OR NEW.workflow_request_id IS DISTINCT FROM OLD.workflow_request_id
        OR NEW.decision_fingerprint IS DISTINCT FROM OLD.decision_fingerprint
    ) THEN
        RAISE EXCEPTION 'Submitted workforce request scope, payload, workflow, and decision evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status IS DISTINCT FROM NEW.status THEN
        v_valid_transition := CASE OLD.status
            WHEN 'draft' THEN NEW.status IN ('validating','cancelled')
            WHEN 'validating' THEN NEW.status IN ('validation_failed','pending_approval','cancelled')
            WHEN 'validation_failed' THEN NEW.status IN ('draft','validating','cancelled')
            WHEN 'pending_approval' THEN NEW.status IN ('returned','approved','rejected','cancelled')
            WHEN 'returned' THEN NEW.status IN ('validating','cancelled','superseded')
            WHEN 'approved' THEN NEW.status = 'applying'
            WHEN 'applying' THEN NEW.status IN ('applied','failed')
            WHEN 'failed' THEN NEW.status IN ('applying','superseded')
            ELSE false
        END;
        IF NOT v_valid_transition THEN
            RAISE EXCEPTION 'Invalid workforce request transition: % -> %', OLD.status, NEW.status
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF NEW.status IN ('pending_approval','returned','approved','rejected','applying','applied','failed')
       AND (NEW.submitted_at IS NULL OR NEW.submitted_by IS NULL
            OR NEW.workflow_request_id IS NULL OR NEW.decision_fingerprint IS NULL) THEN
        RAISE EXCEPTION 'Reviewed workforce request requires submission, workflow, and fingerprint evidence'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status IN ('approved','applying','applied','failed')
       AND (NEW.approved_at IS NULL OR NEW.approved_by IS NULL) THEN
        RAISE EXCEPTION 'Approved workforce request requires approval evidence'
            USING ERRCODE = 'check_violation';
    END IF;

    NEW.row_version := OLD.row_version + 1;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_workforce_request_00_created_by BEFORE INSERT ON document.workforce_request FOR EACH ROW EXECUTE FUNCTION document.trg_set_commerce_created_by();
CREATE TRIGGER trg_workforce_request_05_creation_guard BEFORE UPDATE ON document.workforce_request FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence();
CREATE TRIGGER trg_workforce_request_15_guard BEFORE INSERT OR UPDATE OR DELETE ON document.workforce_request FOR EACH ROW EXECUTE FUNCTION document.trg_guard_workforce_request();
CREATE TRIGGER trg_workforce_request_20_status_evidence BEFORE UPDATE ON document.workforce_request FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence();
CREATE TRIGGER trg_workforce_request_90_updated_at BEFORE UPDATE ON document.workforce_request FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER trg_zz_audit_row_change
AFTER INSERT OR UPDATE OR DELETE ON document.workforce_request
FOR EACH ROW EXECUTE FUNCTION audit.trg_capture_row_change();

ALTER TABLE document.workforce_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.workforce_request FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_access ON document.workforce_request FOR ALL USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON document.workforce_request FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);

REVOKE ALL ON master.person_business_partner_legacy_link FROM PUBLIC;
REVOKE ALL ON document.workforce_request FROM PUBLIC;
REVOKE ALL ON FUNCTION master.trg_reject_person_business_partner_legacy_link_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION document.fn_workforce_request_payload_has_restricted_key(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION document.trg_guard_workforce_request() FROM PUBLIC;

DO $roles$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
  GRANT SELECT,INSERT,UPDATE ON document.workforce_request TO athyperapp;
  GRANT EXECUTE ON FUNCTION document.fn_workforce_request_payload_has_restricted_key(jsonb) TO athyperapp;
  GRANT EXECUTE ON FUNCTION document.trg_guard_workforce_request() TO athyperapp;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
  CREATE POLICY admin_read ON master.person_business_partner_legacy_link FOR SELECT TO athyperadmin USING(true);
  CREATE POLICY admin_access ON document.workforce_request FOR ALL TO athyperadmin USING(true) WITH CHECK(true);
  GRANT SELECT ON master.person_business_partner_legacy_link TO athyperadmin;
  GRANT ALL PRIVILEGES ON document.workforce_request TO athyperadmin;
  GRANT EXECUTE ON FUNCTION master.trg_reject_person_business_partner_legacy_link_mutation() TO athyperadmin;
  GRANT EXECUTE ON FUNCTION document.fn_workforce_request_payload_has_restricted_key(jsonb) TO athyperadmin;
  GRANT EXECUTE ON FUNCTION document.trg_guard_workforce_request() TO athyperadmin;
 END IF;
END;
$roles$;

INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
SELECT value.id::uuid,value.code,'entity_operation',module.id,value.risk::authz.risk_tier_d,value.mfa,value.sod,false,false,false,'{"_seed":{"pack":"neon.workforce-requests","version":"1.0.0"}}'::jsonb,'published','00000000-0000-0000-0000-000000000000'::uuid
FROM control.module module CROSS JOIN(VALUES
 ('df98bb67-29dc-4e56-b919-64d2c6c7e8b4','neon.workforce.request.create','high',false,false),
 ('9eb487f9-5113-4b2a-934c-3c497ac0910c','neon.workforce.request.read','medium',false,false)
)value(id,code,risk,mfa,sod) WHERE module.code='fnd' AND module.status='active'
ON CONFLICT(canonical_code) DO UPDATE SET risk_tier=EXCLUDED.risk_tier,requires_mfa=EXCLUDED.requires_mfa,requires_sod=EXCLUDED.requires_sod,metadata=EXCLUDED.metadata,status='published';
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by)
SELECT id,'legal_entity','subtree','active','00000000-0000-0000-0000-000000000000'::uuid FROM authz.permission
WHERE canonical_code IN('neon.workforce.request.create','neon.workforce.request.read')
ON CONFLICT(permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active';

COMMIT;

-- Rollback policy: forward-fix only. The immutable legacy link contains every
-- retired Person/BP coordinate needed for an explicitly approved reconstruction;
-- no Person or historical request row is deleted by this migration.
