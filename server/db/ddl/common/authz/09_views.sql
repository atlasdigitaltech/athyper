CREATE VIEW authz.current_plane_membership
WITH (security_invoker = true, security_barrier = true) AS
SELECT id, tenant_id, principal_id, membership_kind, source_type, source_ref,
       effective_from, effective_until, status
FROM authz.plane_membership
WHERE status = 'active'
  AND effective_from <= statement_timestamp()
  AND (effective_until IS NULL OR effective_until > statement_timestamp());

CREATE VIEW authz.current_group_member
WITH (security_invoker = true, security_barrier = true) AS
SELECT member.id, member.tenant_id, member.group_id, member.principal_id,
       principal_group.code AS group_code, principal_group.name AS group_name,
       member.source_type, member.source_ref, member.effective_from, member.effective_until
FROM authz.group_member AS member
JOIN authz.principal_group ON principal_group.tenant_id = member.tenant_id
 AND principal_group.id = member.group_id
WHERE member.status = 'active' AND principal_group.status = 'active'
  AND member.effective_from <= statement_timestamp()
  AND (member.effective_until IS NULL OR member.effective_until > statement_timestamp());

CREATE VIEW authz.current_group_role
WITH (security_invoker = true, security_barrier = true) AS
SELECT grant_row.id, grant_row.tenant_id, grant_row.group_id,
       principal_group.code AS group_code, grant_row.role_id, role.code AS role_code,
       grant_row.scope_target_id, scope.scope_kind, scope.scope_key,
       grant_row.source_type, grant_row.source_ref,
       grant_row.effective_from, grant_row.effective_until
FROM authz.group_role AS grant_row
JOIN authz.principal_group ON principal_group.tenant_id = grant_row.tenant_id AND principal_group.id = grant_row.group_id
JOIN authz.role ON role.tenant_id = grant_row.tenant_id AND role.id = grant_row.role_id
JOIN authz.scope_target AS scope ON scope.tenant_id = grant_row.tenant_id AND scope.id = grant_row.scope_target_id
WHERE grant_row.status = 'active' AND principal_group.status = 'active'
  AND role.status = 'active' AND scope.status = 'active'
  AND grant_row.effective_from <= statement_timestamp()
  AND (grant_row.effective_until IS NULL OR grant_row.effective_until > statement_timestamp());

CREATE VIEW authz.published_role_permission
WITH (security_invoker = true, security_barrier = true) AS
SELECT role_permission.id, role_permission.tenant_id, role_permission.role_id,
       role.code AS role_code, role.name AS role_name,
       role_permission.permission_id, permission.canonical_code AS permission_code
FROM authz.role_permission
JOIN authz.role ON role.tenant_id = role_permission.tenant_id AND role.id = role_permission.role_id
JOIN authz.permission ON permission.id = role_permission.permission_id
WHERE role.status = 'active' AND permission.status = 'published';

CREATE VIEW authz.current_delegation_grant
WITH (security_invoker = true, security_barrier = true) AS
SELECT grant_row.id, grant_row.tenant_id, grant_row.delegation_id,
       delegation.delegator_id, delegation.delegate_id,
       grant_row.permission_id, permission.canonical_code AS permission_code,
       grant_row.scope_target_id, scope.scope_kind, scope.scope_key,
       delegation.effective_from, delegation.effective_until
FROM authz.delegation_grant AS grant_row
JOIN authz.delegation ON delegation.tenant_id = grant_row.tenant_id AND delegation.id = grant_row.delegation_id
JOIN authz.permission ON permission.id = grant_row.permission_id
JOIN authz.scope_target AS scope ON scope.tenant_id = grant_row.tenant_id AND scope.id = grant_row.scope_target_id
WHERE delegation.status = 'active' AND permission.status = 'published' AND scope.status = 'active'
  AND delegation.effective_from <= statement_timestamp()
  AND delegation.effective_until > statement_timestamp();

CREATE VIEW authz.scope_target_catalog
WITH (security_invoker = true, security_barrier = true) AS
SELECT child.id, child.tenant_id, child.scope_kind, child.scope_key,
       child.target_id, child.parent_scope_target_id,
       parent.scope_kind AS parent_scope_kind, parent.scope_key AS parent_scope_key,
       child.display_name, child.status
FROM authz.scope_target AS child
LEFT JOIN authz.scope_target AS parent
  ON parent.tenant_id = child.tenant_id AND parent.id = child.parent_scope_target_id
WHERE child.status = 'active';

COMMENT ON VIEW authz.current_delegation_grant IS
  'Canonical replacement for master.auth_current_delegation_permission_scope_v.';
