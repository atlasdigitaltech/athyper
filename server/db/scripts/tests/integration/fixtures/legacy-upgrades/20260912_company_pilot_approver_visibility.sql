-- Bounded eligible-approver lookup must see other active principals under application RLS.
-- The caller, tenant, exact company grants, expiry and deny checks remain mandatory.
BEGIN;
CREATE OR REPLACE FUNCTION document.fn_company_setup_case_approvers(p_tenant_id uuid,p_company_code_id uuid,p_excluded_principal_id uuid)
RETURNS TABLE(principal_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT DISTINCT member.principal_id FROM authz.group_member member
 JOIN authz.principal_group group_row ON group_row.tenant_id=member.tenant_id AND group_row.id=member.group_id AND group_row.status='active'
 JOIN authz.plane_membership membership ON membership.tenant_id=member.tenant_id AND membership.principal_id=member.principal_id AND membership.status='active' AND membership.effective_from<=now() AND (membership.effective_until IS NULL OR membership.effective_until>now())
 JOIN authz.group_role grant_row ON grant_row.tenant_id=member.tenant_id AND grant_row.group_id=member.group_id AND grant_row.status='active' AND grant_row.propagation_mode='exact' AND grant_row.effective_from<=now() AND (grant_row.effective_until IS NULL OR grant_row.effective_until>now())
 JOIN authz.role role_row ON role_row.tenant_id=grant_row.tenant_id AND role_row.id=grant_row.role_id AND role_row.status='active'
 JOIN authz.role_permission role_permission ON role_permission.tenant_id=role_row.tenant_id AND role_permission.role_id=role_row.id
 JOIN authz.permission permission ON permission.id=role_permission.permission_id AND permission.canonical_code='neon.relationship.bp_company_setup_request.decide' AND permission.status='published'
 JOIN authz.permission_scope_kind scope_kind ON scope_kind.permission_id=permission.id AND scope_kind.scope_kind='company_code' AND scope_kind.propagation_mode='exact' AND scope_kind.status='active'
 JOIN authz.scope_target target ON target.tenant_id=grant_row.tenant_id AND target.id=grant_row.scope_target_id AND target.status='active'
 WHERE member.tenant_id=p_tenant_id AND member.status='active' AND member.effective_from<=now() AND (member.effective_until IS NULL OR member.effective_until>now()) AND member.principal_id IS DISTINCT FROM p_excluded_principal_id
   AND p_tenant_id=shared.current_tenant_id()
   AND p_excluded_principal_id=master.current_principal_id_soft()
   AND p_company_code_id IS NOT NULL AND target.scope_kind='company_code' AND target.target_id=p_company_code_id
   AND EXISTS(SELECT 1 FROM master.principal principal WHERE principal.tenant_id=member.tenant_id AND principal.id=member.principal_id AND principal.status='active')
   AND NOT EXISTS(SELECT 1 FROM authz.deny_rule deny WHERE deny.tenant_id=member.tenant_id AND deny.permission_id=permission.id AND deny.status='active' AND deny.effective_from<=now() AND (deny.effective_until IS NULL OR deny.effective_until>now()) AND (deny.subject_kind='tenant' OR (deny.subject_kind='principal' AND deny.principal_id=member.principal_id) OR (deny.subject_kind='group' AND EXISTS(SELECT 1 FROM authz.group_member denied_member WHERE denied_member.tenant_id=member.tenant_id AND denied_member.principal_id=member.principal_id AND denied_member.group_id=deny.group_id AND denied_member.status='active' AND denied_member.effective_from<=now() AND (denied_member.effective_until IS NULL OR denied_member.effective_until>now())))))
   ORDER BY member.principal_id LIMIT 200;
$$;
REVOKE ALL ON FUNCTION document.fn_company_setup_case_approvers(uuid,uuid,uuid) FROM PUBLIC;
DO $grants$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT EXECUTE ON FUNCTION document.fn_company_setup_case_approvers(uuid,uuid,uuid) TO athyperapp; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT EXECUTE ON FUNCTION document.fn_company_setup_case_approvers(uuid,uuid,uuid) TO athyperadmin; END IF;
END $grants$;

COMMIT;
