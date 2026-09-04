\set ON_ERROR_STOP on

DO $$ BEGIN
  IF current_database()<>'athyper_neon' OR current_setting('app.database_plane',true)<>'neon' THEN
    RAISE EXCEPTION 'Business Partner workflow resolver migration is NEON-only';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION document.fn_business_partner_request_approvers(
  p_tenant_id uuid,p_operating_organization_id uuid,p_company_code_id uuid,p_excluded_principal_id uuid
) RETURNS TABLE(principal_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,document,authz,master,shared
AS $$
BEGIN
  IF p_tenant_id IS DISTINCT FROM shared.current_tenant_id()
     OR p_operating_organization_id IS NULL
     OR NOT EXISTS(SELECT 1 FROM master.operating_organization organization WHERE organization.tenant_id=p_tenant_id AND organization.id=p_operating_organization_id)
     OR (p_company_code_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM master.company_code company WHERE company.tenant_id=p_tenant_id AND company.id=p_company_code_id)) THEN
    RAISE EXCEPTION 'Business Partner approver scope is invalid' USING ERRCODE='insufficient_privilege';
  END IF;
  RETURN QUERY
  SELECT DISTINCT member.principal_id
  FROM authz.group_member member
  JOIN master.principal principal ON principal.tenant_id=member.tenant_id AND principal.id=member.principal_id AND principal.status='active'
  JOIN authz.plane_membership membership ON membership.tenant_id=member.tenant_id AND membership.principal_id=member.principal_id AND membership.status='active' AND membership.effective_from<=now() AND (membership.effective_until IS NULL OR membership.effective_until>now())
  JOIN authz.group_role grant_row ON grant_row.tenant_id=member.tenant_id AND grant_row.group_id=member.group_id AND grant_row.status='active' AND grant_row.effective_from<=now() AND (grant_row.effective_until IS NULL OR grant_row.effective_until>now())
  JOIN authz.role role_row ON role_row.tenant_id=grant_row.tenant_id AND role_row.id=grant_row.role_id AND role_row.status='active'
  JOIN authz.role_permission role_permission ON role_permission.tenant_id=role_row.tenant_id AND role_permission.role_id=role_row.id
  JOIN authz.permission permission ON permission.id=role_permission.permission_id AND permission.canonical_code='neon.relationship.entity_case.decide' AND permission.status='published'
  JOIN authz.scope_target target ON target.tenant_id=grant_row.tenant_id AND target.id=grant_row.scope_target_id AND target.status='active'
  WHERE member.tenant_id=p_tenant_id AND member.status='active' AND member.effective_from<=now() AND (member.effective_until IS NULL OR member.effective_until>now())
    AND member.principal_id IS DISTINCT FROM p_excluded_principal_id
    AND ((target.scope_kind='tenant' AND target.target_id=p_tenant_id) OR (target.scope_kind='operating_organization' AND target.target_id=p_operating_organization_id) OR (p_company_code_id IS NOT NULL AND target.scope_kind='company_code' AND target.target_id=p_company_code_id))
    AND NOT EXISTS(SELECT 1 FROM authz.deny_rule deny WHERE deny.tenant_id=member.tenant_id AND deny.permission_id=permission.id AND deny.status='active' AND deny.effective_from<=now() AND (deny.effective_until IS NULL OR deny.effective_until>now()) AND (deny.subject_kind='tenant' OR (deny.subject_kind='principal' AND deny.principal_id=member.principal_id) OR (deny.subject_kind='group' AND deny.group_id=member.group_id)))
  ORDER BY member.principal_id LIMIT 200;
END;
$$;

REVOKE ALL ON FUNCTION document.fn_business_partner_request_approvers(uuid,uuid,uuid,uuid) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT EXECUTE ON FUNCTION document.fn_business_partner_request_approvers(uuid,uuid,uuid,uuid) TO athyperapp; END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT EXECUTE ON FUNCTION document.fn_business_partner_request_approvers(uuid,uuid,uuid,uuid) TO athyperadmin; END IF;
END $$;

DO $$ BEGIN
  IF NOT has_function_privilege('athyperapp','document.fn_business_partner_request_approvers(uuid,uuid,uuid,uuid)','EXECUTE')
     OR has_function_privilege('public','document.fn_business_partner_request_approvers(uuid,uuid,uuid,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Business Partner approver resolver privilege contract failed';
  END IF;
END $$;
