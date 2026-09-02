-- S2 People-owned workforce request validation, approval, and materialization lifecycle.
BEGIN;

CREATE TABLE document.workforce_request_validation (
 id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, request_id uuid NOT NULL, evaluation_id uuid NOT NULL,
 rule_code text NOT NULL, ruleset_code text NOT NULL, ruleset_version integer NOT NULL, ruleset_hash text NOT NULL,
 severity text NOT NULL, field_path text NOT NULL DEFAULT '$', outcome text NOT NULL, message_code text NOT NULL,
 evidence_reference jsonb NOT NULL DEFAULT '{}'::jsonb, evaluated_at timestamptz NOT NULL, evaluated_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
 CONSTRAINT workforce_request_validation_pkey PRIMARY KEY(id), CONSTRAINT workforce_request_validation_tenant_id_uq UNIQUE(tenant_id,id),
 CONSTRAINT workforce_request_validation_coordinate_uq UNIQUE(tenant_id,request_id,evaluation_id,rule_code,field_path),
 CONSTRAINT workforce_request_validation_request_fk FOREIGN KEY(tenant_id,request_id) REFERENCES document.workforce_request(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT workforce_request_validation_evaluated_by_fk FOREIGN KEY(tenant_id,evaluated_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT workforce_request_validation_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
 CONSTRAINT workforce_request_validation_rule_chk CHECK(rule_code~'^[a-z][a-z0-9_.-]{1,126}$'),
 CONSTRAINT workforce_request_validation_ruleset_chk CHECK(ruleset_code~'^[a-z][a-z0-9_.-]{1,126}$' AND ruleset_version>=1 AND ruleset_hash~'^[a-f0-9]{64}$'),
 CONSTRAINT workforce_request_validation_severity_chk CHECK(severity IN('info','warning','error')),
 CONSTRAINT workforce_request_validation_path_chk CHECK(length(btrim(field_path)) BETWEEN 1 AND 512),
 CONSTRAINT workforce_request_validation_outcome_chk CHECK(outcome IN('passed','failed','skipped')),
 CONSTRAINT workforce_request_validation_message_chk CHECK(message_code~'^[A-Z][A-Z0-9_.-]{1,126}$'),
 CONSTRAINT workforce_request_validation_evidence_chk CHECK(jsonb_typeof(evidence_reference)='object' AND pg_column_size(evidence_reference)<=65536)
);
CREATE INDEX workforce_request_validation_request_idx ON document.workforce_request_validation(tenant_id,request_id,evaluated_at DESC,evaluation_id);
CREATE TRIGGER trg_workforce_request_validation_immutable BEFORE UPDATE OR DELETE ON document.workforce_request_validation FOR EACH ROW EXECUTE FUNCTION document.trg_reject_update();
ALTER TABLE document.workforce_request_validation ENABLE ROW LEVEL SECURITY;
ALTER TABLE document.workforce_request_validation FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON document.workforce_request_validation FOR SELECT USING(tenant_id=shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON document.workforce_request_validation FOR INSERT WITH CHECK(tenant_id=shared.current_tenant_id());
CREATE POLICY seed_write ON document.workforce_request_validation FOR ALL TO CURRENT_USER USING(true) WITH CHECK(true);

DO $transition$
DECLARE v_before text; v_after text;
BEGIN
 v_before:=pg_get_functiondef('document.trg_guard_workforce_request()'::regprocedure);
 v_after:=replace(v_before,'WHEN ''validating'' THEN NEW.status IN (''validation_failed'',''pending_approval'',''cancelled'')','WHEN ''validating'' THEN NEW.status IN (''draft'',''validation_failed'',''pending_approval'',''cancelled'')');
 v_after:=replace(v_after,'OLD.status NOT IN (''draft'',''validation_failed'',''returned'')','OLD.status NOT IN (''draft'',''validating'',''validation_failed'',''returned'')');
 IF v_after=v_before THEN RAISE EXCEPTION 'Unable to install validated-draft workforce transition'; END IF;
 EXECUTE v_after;
END $transition$;

CREATE OR REPLACE FUNCTION document.fn_workforce_request_approvers(p_tenant_id uuid,p_legal_entity_id uuid,p_company_code_id uuid,p_excluded_principal_id uuid)
RETURNS TABLE(principal_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,document,authz,master,shared AS $$
 SELECT DISTINCT member.principal_id FROM authz.group_member member
 JOIN master.principal principal ON principal.tenant_id=member.tenant_id AND principal.id=member.principal_id AND principal.status='active'
 JOIN authz.plane_membership membership ON membership.tenant_id=member.tenant_id AND membership.principal_id=member.principal_id AND membership.status='active' AND membership.effective_from<=now() AND(membership.effective_until IS NULL OR membership.effective_until>now())
 JOIN authz.group_role grant_row ON grant_row.tenant_id=member.tenant_id AND grant_row.group_id=member.group_id AND grant_row.status='active' AND grant_row.effective_from<=now() AND(grant_row.effective_until IS NULL OR grant_row.effective_until>now())
 JOIN authz.role role_row ON role_row.tenant_id=grant_row.tenant_id AND role_row.id=grant_row.role_id AND role_row.status='active'
 JOIN authz.role_permission rp ON rp.tenant_id=role_row.tenant_id AND rp.role_id=role_row.id
 JOIN authz.permission permission ON permission.id=rp.permission_id AND permission.canonical_code='neon.workforce.request.decide' AND permission.status='published'
 JOIN authz.scope_target target ON target.tenant_id=grant_row.tenant_id AND target.id=grant_row.scope_target_id AND target.status='active'
 WHERE p_tenant_id=shared.current_tenant_id() AND member.tenant_id=p_tenant_id AND member.status='active' AND member.effective_from<=now() AND(member.effective_until IS NULL OR member.effective_until>now()) AND member.principal_id IS DISTINCT FROM p_excluded_principal_id
 AND((target.scope_kind='tenant' AND target.target_id=p_tenant_id) OR(target.scope_kind='legal_entity' AND target.target_id=p_legal_entity_id) OR(p_company_code_id IS NOT NULL AND target.scope_kind='company_code' AND target.target_id=p_company_code_id)) ORDER BY member.principal_id LIMIT 200
$$;
REVOKE ALL ON document.workforce_request_validation FROM PUBLIC;
REVOKE ALL ON FUNCTION document.fn_workforce_request_approvers(uuid,uuid,uuid,uuid) FROM PUBLIC;
DO $roles$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT SELECT,INSERT ON document.workforce_request_validation TO athyperapp; GRANT EXECUTE ON FUNCTION document.fn_workforce_request_approvers(uuid,uuid,uuid,uuid) TO athyperapp; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN CREATE POLICY admin_access ON document.workforce_request_validation FOR ALL TO athyperadmin USING(true) WITH CHECK(true); GRANT ALL PRIVILEGES ON document.workforce_request_validation TO athyperadmin; GRANT EXECUTE ON FUNCTION document.fn_workforce_request_approvers(uuid,uuid,uuid,uuid) TO athyperadmin; END IF;
END $roles$;

INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,requires_sod,is_shareable,is_delegable,is_overridable,metadata,status,created_by)
SELECT value.id::uuid,value.code,'entity_operation',module.id,value.risk::authz.risk_tier_d,value.mfa,value.sod,false,false,false,'{"_seed":{"pack":"neon.workforce-requests","version":"2.0.0"}}'::jsonb,'published','00000000-0000-0000-0000-000000000000'::uuid FROM control.module module CROSS JOIN(VALUES
 ('3f245660-4c10-4e6b-a4f1-91fb9f367b01','neon.workforce.request.validate','high',false,false),('3f245660-4c10-4e6b-a4f1-91fb9f367b02','neon.workforce.request.submit','high',false,true),('3f245660-4c10-4e6b-a4f1-91fb9f367b03','neon.workforce.request.decide','critical',true,true),('3f245660-4c10-4e6b-a4f1-91fb9f367b04','neon.workforce.request.apply','critical',true,true)
)value(id,code,risk,mfa,sod) WHERE module.code='fnd' AND module.status='active' ON CONFLICT(canonical_code) DO NOTHING;
INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,propagation_mode,status,created_by) SELECT id,'legal_entity','subtree','active','00000000-0000-0000-0000-000000000000'::uuid FROM authz.permission WHERE canonical_code IN('neon.workforce.request.validate','neon.workforce.request.submit','neon.workforce.request.decide','neon.workforce.request.apply') ON CONFLICT(permission_id,scope_kind,propagation_mode) DO UPDATE SET status='active';

COMMIT;
