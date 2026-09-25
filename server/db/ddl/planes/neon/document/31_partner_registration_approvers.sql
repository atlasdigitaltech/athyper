CREATE OR REPLACE FUNCTION document.fn_role_free_partner_registration_approvers(p_tenant_id uuid,p_operating_organization_id uuid,p_company_code_id uuid,p_excluded_principal_id uuid)
RETURNS TABLE(principal_id uuid) LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,authz AS $$
 SELECT DISTINCT member.principal_id FROM authz.group_member member
 JOIN authz.plane_membership membership ON membership.tenant_id=member.tenant_id AND membership.principal_id=member.principal_id AND membership.status='active' AND membership.effective_from<=now() AND (membership.effective_until IS NULL OR membership.effective_until>now())
 JOIN authz.group_role grant_row ON grant_row.tenant_id=member.tenant_id AND grant_row.group_id=member.group_id AND grant_row.status='active' AND grant_row.effective_from<=now() AND (grant_row.effective_until IS NULL OR grant_row.effective_until>now())
 JOIN authz.role role_row ON role_row.tenant_id=grant_row.tenant_id AND role_row.id=grant_row.role_id AND role_row.status='active'
 JOIN authz.role_permission role_permission ON role_permission.tenant_id=role_row.tenant_id AND role_permission.role_id=role_row.id
 JOIN authz.permission permission ON permission.id=role_permission.permission_id AND permission.canonical_code='neon.business_partner_registration.decide' AND permission.status='published'
 JOIN authz.scope_target target ON target.tenant_id=grant_row.tenant_id AND target.id=grant_row.scope_target_id AND target.status='active'
 WHERE target.scope_kind='tenant' AND p_operating_organization_id IS NULL AND p_company_code_id IS NULL AND member.tenant_id=p_tenant_id AND member.status='active' AND member.effective_from<=now() AND (member.effective_until IS NULL OR member.effective_until>now()) AND member.principal_id IS DISTINCT FROM p_excluded_principal_id
   AND ((target.scope_kind='tenant' AND target.target_id=p_tenant_id) OR (target.scope_kind='operating_organization' AND target.target_id=p_operating_organization_id) OR (p_company_code_id IS NOT NULL AND target.scope_kind='company_code' AND target.target_id=p_company_code_id));
$$;
REVOKE ALL ON FUNCTION document.fn_role_free_partner_registration_approvers(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION document.fn_role_free_partner_registration_approvers(uuid,uuid,uuid,uuid) TO athyperapp;
