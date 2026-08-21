-- Common all-plane authorization authority. Rows remain plane-local unless explicitly marked as a published projection.
CREATE VIEW authz.permission_catalog
WITH (security_barrier = true)
AS
SELECT
    permission.id,
    permission.canonical_code,
    permission.permission_kind,
    permission.module_id,
    permission.risk_tier,
    permission.requires_mfa,
    permission.requires_sod,
    permission.is_shareable,
    permission.is_delegable,
    permission.is_overridable
FROM authz.permission AS permission
WHERE permission.status = 'published';

COMMENT ON VIEW authz.permission_catalog IS
  'Current published plane-local permission and permitted-scope catalog.';

CREATE VIEW authz.current_principal_plane_membership
WITH (security_barrier = true)
AS
SELECT
    membership.id AS membership_id,
    membership.tenant_id,
    membership.principal_id,
    membership.membership_kind,
    membership.effective_from,
    membership.effective_until
FROM authz.plane_membership AS membership
WHERE membership.tenant_id = shared.current_tenant_id_soft()
  AND membership.principal_id = master.current_principal_id_soft()
  AND membership.status = 'active'
  AND membership.effective_from <= statement_timestamp()
  AND (
      membership.effective_until IS NULL
      OR membership.effective_until > statement_timestamp()
  );

COMMENT ON VIEW authz.current_principal_plane_membership IS
  'Current caller plane-admission evidence. It is a gate and not a permission grant.';

CREATE VIEW authz.current_principal_group_role_grant
WITH (security_barrier = true)
AS
SELECT
    membership.tenant_id,
    membership.principal_id,
    group_member.group_id,
    group_role.role_id,
    role_permission.permission_id,
    permission.canonical_code,
    group_role.scope_target_id,
    scope_target.scope_kind,
    scope_target.scope_key,
    group_role.propagation_mode,
    group_member.id AS group_member_id,
    group_role.id AS group_role_id,
    role_permission.id AS role_permission_id
FROM authz.plane_membership AS membership
JOIN authz.group_member AS group_member
  ON group_member.tenant_id = membership.tenant_id
 AND group_member.principal_id = membership.principal_id
JOIN authz.principal_group AS principal_group
  ON principal_group.tenant_id = group_member.tenant_id
 AND principal_group.id = group_member.group_id
JOIN authz.group_role AS group_role
  ON group_role.tenant_id = principal_group.tenant_id
 AND group_role.group_id = principal_group.id
JOIN authz.role AS role
  ON role.tenant_id = group_role.tenant_id
 AND role.id = group_role.role_id
JOIN authz.role_permission AS role_permission
  ON role_permission.tenant_id = role.tenant_id
 AND role_permission.role_id = role.id
JOIN authz.permission AS permission
  ON permission.id = role_permission.permission_id
JOIN authz.scope_target AS scope_target
  ON scope_target.tenant_id = group_role.tenant_id
 AND scope_target.id = group_role.scope_target_id
WHERE membership.tenant_id = shared.current_tenant_id_soft()
  AND membership.principal_id = master.current_principal_id_soft()
  AND membership.status = 'active'
  AND group_member.status = 'active'
  AND principal_group.status = 'active'
  AND group_role.status = 'active'
  AND role.status = 'active'
  AND permission.status = 'published'
  AND scope_target.status = 'active'
  AND statement_timestamp() >= membership.effective_from
  AND (membership.effective_until IS NULL OR statement_timestamp() < membership.effective_until)
  AND statement_timestamp() >= group_member.effective_from
  AND (group_member.effective_until IS NULL OR statement_timestamp() < group_member.effective_until)
  AND statement_timestamp() >= group_role.effective_from
  AND (group_role.effective_until IS NULL OR statement_timestamp() < group_role.effective_until);

COMMENT ON VIEW authz.current_principal_group_role_grant IS
  'Current scoped group-role allow proofs only. Denies, delegation, ACLs, overrides, MFA, SoD, entitlement, and hard gates still require evaluator processing.';

-- Athyper-published and reconciled authorization projections.
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
