CREATE INDEX permission_published_resource_idx
    ON authz.permission (resource_code, operation_code, canonical_code)
    WHERE status = 'published';

CREATE INDEX permission_module_idx
    ON authz.permission (module_id, status)
    WHERE module_id IS NOT NULL;

CREATE UNIQUE INDEX plane_membership_current_uidx
    ON authz.plane_membership (tenant_id, principal_id)
    WHERE status <> 'revoked';

CREATE INDEX scope_target_parent_idx
    ON authz.scope_target (tenant_id, parent_scope_target_id)
    WHERE parent_scope_target_id IS NOT NULL;

CREATE INDEX scope_target_active_kind_idx
    ON authz.scope_target (tenant_id, scope_kind, scope_key)
    WHERE status = 'active';

CREATE INDEX role_permission_permission_idx
    ON authz.role_permission (permission_id, tenant_id, role_id);

CREATE UNIQUE INDEX principal_group_iam_source_uidx
    ON authz.principal_group (tenant_id, source_ref)
    WHERE group_kind = 'iam_managed'
      AND status <> 'retired';

CREATE UNIQUE INDEX group_member_current_uidx
    ON authz.group_member (tenant_id, group_id, principal_id)
    WHERE status <> 'revoked';

CREATE INDEX group_member_principal_idx
    ON authz.group_member (tenant_id, principal_id, group_id)
    WHERE status = 'active';

CREATE UNIQUE INDEX group_role_current_uidx
    ON authz.group_role (tenant_id, group_id, role_id, scope_target_id)
    WHERE status <> 'revoked';

CREATE INDEX group_role_scope_idx
    ON authz.group_role (tenant_id, scope_target_id, role_id)
    WHERE status = 'active';

CREATE INDEX group_role_role_fk_idx
    ON authz.group_role (tenant_id, role_id);

CREATE UNIQUE INDEX deny_rule_active_uq
    ON authz.deny_rule (
        tenant_id,
        permission_id,
        scope_target_id,
        subject_kind,
        principal_id,
        group_id
    ) NULLS NOT DISTINCT
    WHERE status = 'active';

CREATE INDEX deny_rule_principal_idx
    ON authz.deny_rule
       (tenant_id, principal_id, permission_id, scope_target_id)
    WHERE status = 'active' AND subject_kind = 'principal';

CREATE INDEX deny_rule_group_idx
    ON authz.deny_rule
       (tenant_id, group_id, permission_id, scope_target_id)
    WHERE status = 'active' AND subject_kind = 'group';

CREATE INDEX deny_rule_permission_fk_idx
    ON authz.deny_rule (permission_id);

CREATE INDEX deny_rule_scope_fk_idx
    ON authz.deny_rule (tenant_id, scope_target_id);

CREATE INDEX delegation_delegator_idx
    ON authz.delegation (tenant_id, delegator_id, effective_until)
    WHERE status = 'active';

CREATE INDEX delegation_delegate_idx
    ON authz.delegation (tenant_id, delegate_id, effective_until)
    WHERE status = 'active';

CREATE INDEX delegation_approved_by_fk_idx
    ON authz.delegation (tenant_id, approved_by)
    WHERE approved_by IS NOT NULL;

CREATE INDEX delegation_revoked_by_fk_idx
    ON authz.delegation (tenant_id, revoked_by)
    WHERE revoked_by IS NOT NULL;

CREATE INDEX delegation_grant_lookup_idx
    ON authz.delegation_grant
       (tenant_id, delegation_id, permission_id, scope_target_id);

CREATE INDEX delegation_grant_permission_fk_idx
    ON authz.delegation_grant (permission_id);

CREATE INDEX delegation_grant_scope_fk_idx
    ON authz.delegation_grant (tenant_id, scope_target_id);

CREATE UNIQUE INDEX override_nonterminal_uq
    ON authz.override
       (tenant_id, principal_id, permission_id, scope_target_id)
    WHERE status IN ('pending', 'active');

CREATE INDEX override_principal_idx
    ON authz.override
       (tenant_id, principal_id, permission_id, effective_until)
    WHERE status = 'active';

CREATE INDEX override_permission_fk_idx
    ON authz.override (permission_id);

CREATE INDEX override_scope_fk_idx
    ON authz.override (tenant_id, scope_target_id);

CREATE INDEX override_approved_by_fk_idx
    ON authz.override (tenant_id, approved_by)
    WHERE approved_by IS NOT NULL;

CREATE INDEX override_revoked_by_fk_idx
    ON authz.override (tenant_id, revoked_by)
    WHERE revoked_by IS NOT NULL;

CREATE UNIQUE INDEX record_acl_active_uq
    ON authz.record_acl (
        tenant_id,
        resource_code,
        record_id,
        permission_id,
        subject_kind,
        principal_id,
        group_id
    ) NULLS NOT DISTINCT
    WHERE status = 'active';

CREATE INDEX record_acl_principal_idx
    ON authz.record_acl
       (tenant_id, principal_id, resource_code, record_id, permission_id)
    WHERE status = 'active' AND subject_kind = 'principal';

CREATE INDEX record_acl_group_idx
    ON authz.record_acl
       (tenant_id, group_id, resource_code, record_id, permission_id)
    WHERE status = 'active' AND subject_kind = 'group';

CREATE INDEX record_acl_permission_fk_idx
    ON authz.record_acl (permission_id);

CREATE INDEX record_acl_granted_by_fk_idx
    ON authz.record_acl (tenant_id, granted_by);

CREATE INDEX record_acl_revoked_by_fk_idx
    ON authz.record_acl (tenant_id, revoked_by)
    WHERE revoked_by IS NOT NULL;

CREATE INDEX trusted_device_active_principal_idx
    ON authz.trusted_device
       (tenant_id, principal_id, expires_at, last_seen_at DESC)
    WHERE revoked_at IS NULL;

CREATE INDEX trusted_device_revoked_by_fk_idx
    ON authz.trusted_device (tenant_id, revoked_by)
    WHERE revoked_by IS NOT NULL;
