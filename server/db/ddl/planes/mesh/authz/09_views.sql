CREATE VIEW authz.permission_catalog
WITH (security_barrier = true)
AS
SELECT
    permission.id,
    permission.canonical_code,
    permission.permission_kind,
    permission.resource_code,
    permission.operation_code,
    permission.module_id,
    permission.risk_tier,
    permission.requires_mfa,
    permission.requires_sod,
    permission.is_shareable,
    permission.is_delegable,
    permission.is_overridable,
    policy.scope_kind,
    policy.propagation_mode
FROM authz.permission AS permission
JOIN authz.permission_scope_policy AS policy
  ON policy.permission_id = permission.id
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
    policy.propagation_mode,
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
JOIN authz.permission_scope_policy AS policy
  ON policy.permission_id = permission.id
 AND policy.scope_kind = scope_target.scope_kind
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
