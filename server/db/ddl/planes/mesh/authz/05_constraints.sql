ALTER TABLE authz.permission
    ADD CONSTRAINT permission_module_fk
    FOREIGN KEY (module_id)
    REFERENCES control.module (id)
    ON DELETE RESTRICT;

ALTER TABLE authz.permission_scope_policy
    ADD CONSTRAINT permission_scope_policy_permission_fk
    FOREIGN KEY (permission_id)
    REFERENCES authz.permission (id)
    ON DELETE RESTRICT;

ALTER TABLE authz.plane_membership
    ADD CONSTRAINT plane_membership_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE authz.plane_membership
    ADD CONSTRAINT plane_membership_principal_fk
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE authz.scope_target
    ADD CONSTRAINT scope_target_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE authz.scope_target
    ADD CONSTRAINT scope_target_parent_fk
    FOREIGN KEY (tenant_id, parent_scope_target_id)
    REFERENCES authz.scope_target (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE authz.role
    ADD CONSTRAINT role_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE authz.role_permission
    ADD CONSTRAINT role_permission_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE authz.role_permission
    ADD CONSTRAINT role_permission_role_fk
    FOREIGN KEY (tenant_id, role_id)
    REFERENCES authz.role (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE authz.role_permission
    ADD CONSTRAINT role_permission_permission_fk
    FOREIGN KEY (permission_id)
    REFERENCES authz.permission (id)
    ON DELETE RESTRICT;

ALTER TABLE authz.principal_group
    ADD CONSTRAINT principal_group_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE authz.group_member
    ADD CONSTRAINT group_member_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE authz.group_member
    ADD CONSTRAINT group_member_group_fk
    FOREIGN KEY (tenant_id, group_id)
    REFERENCES authz.principal_group (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE authz.group_member
    ADD CONSTRAINT group_member_principal_fk
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE authz.group_role
    ADD CONSTRAINT group_role_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE authz.group_role
    ADD CONSTRAINT group_role_group_fk
    FOREIGN KEY (tenant_id, group_id)
    REFERENCES authz.principal_group (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE authz.group_role
    ADD CONSTRAINT group_role_role_fk
    FOREIGN KEY (tenant_id, role_id)
    REFERENCES authz.role (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE authz.group_role
    ADD CONSTRAINT group_role_scope_fk
    FOREIGN KEY (tenant_id, scope_target_id)
    REFERENCES authz.scope_target (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE authz.deny_rule
    ADD CONSTRAINT deny_rule_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE authz.deny_rule
    ADD CONSTRAINT deny_rule_permission_fk
    FOREIGN KEY (permission_id)
    REFERENCES authz.permission (id)
    ON DELETE RESTRICT;

ALTER TABLE authz.deny_rule
    ADD CONSTRAINT deny_rule_scope_fk
    FOREIGN KEY (tenant_id, scope_target_id)
    REFERENCES authz.scope_target (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE authz.deny_rule
    ADD CONSTRAINT deny_rule_principal_fk
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE authz.deny_rule
    ADD CONSTRAINT deny_rule_group_fk
    FOREIGN KEY (tenant_id, group_id)
    REFERENCES authz.principal_group (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE authz.delegation
    ADD CONSTRAINT delegation_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE authz.delegation
    ADD CONSTRAINT delegation_delegator_fk
    FOREIGN KEY (tenant_id, delegator_id)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE authz.delegation
    ADD CONSTRAINT delegation_delegate_fk
    FOREIGN KEY (tenant_id, delegate_id)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE authz.delegation
    ADD CONSTRAINT delegation_approved_by_fk
    FOREIGN KEY (tenant_id, approved_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE authz.delegation
    ADD CONSTRAINT delegation_revoked_by_fk
    FOREIGN KEY (tenant_id, revoked_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE authz.delegation_grant
    ADD CONSTRAINT delegation_grant_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE authz.delegation_grant
    ADD CONSTRAINT delegation_grant_delegation_fk
    FOREIGN KEY (tenant_id, delegation_id)
    REFERENCES authz.delegation (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE authz.delegation_grant
    ADD CONSTRAINT delegation_grant_permission_fk
    FOREIGN KEY (permission_id)
    REFERENCES authz.permission (id)
    ON DELETE RESTRICT;

ALTER TABLE authz.delegation_grant
    ADD CONSTRAINT delegation_grant_scope_fk
    FOREIGN KEY (tenant_id, scope_target_id)
    REFERENCES authz.scope_target (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE authz.override
    ADD CONSTRAINT override_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE authz.override
    ADD CONSTRAINT override_principal_fk
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE authz.override
    ADD CONSTRAINT override_permission_fk
    FOREIGN KEY (permission_id)
    REFERENCES authz.permission (id)
    ON DELETE RESTRICT;

ALTER TABLE authz.override
    ADD CONSTRAINT override_scope_fk
    FOREIGN KEY (tenant_id, scope_target_id)
    REFERENCES authz.scope_target (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE authz.override
    ADD CONSTRAINT override_approved_by_fk
    FOREIGN KEY (tenant_id, approved_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE authz.override
    ADD CONSTRAINT override_revoked_by_fk
    FOREIGN KEY (tenant_id, revoked_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE authz.record_acl
    ADD CONSTRAINT record_acl_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE authz.record_acl
    ADD CONSTRAINT record_acl_permission_fk
    FOREIGN KEY (permission_id)
    REFERENCES authz.permission (id)
    ON DELETE RESTRICT;

ALTER TABLE authz.record_acl
    ADD CONSTRAINT record_acl_principal_fk
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE authz.record_acl
    ADD CONSTRAINT record_acl_group_fk
    FOREIGN KEY (tenant_id, group_id)
    REFERENCES authz.principal_group (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE authz.record_acl
    ADD CONSTRAINT record_acl_granted_by_fk
    FOREIGN KEY (tenant_id, granted_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE authz.record_acl
    ADD CONSTRAINT record_acl_revoked_by_fk
    FOREIGN KEY (tenant_id, revoked_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE authz.trusted_device
    ADD CONSTRAINT trusted_device_tenant_fk
    FOREIGN KEY (tenant_id)
    REFERENCES master.tenant (id)
    ON DELETE RESTRICT;

ALTER TABLE authz.trusted_device
    ADD CONSTRAINT trusted_device_principal_fk
    FOREIGN KEY (tenant_id, principal_id)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE authz.trusted_device
    ADD CONSTRAINT trusted_device_created_by_fk
    FOREIGN KEY (tenant_id, created_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;

ALTER TABLE authz.trusted_device
    ADD CONSTRAINT trusted_device_revoked_by_fk
    FOREIGN KEY (tenant_id, revoked_by)
    REFERENCES master.principal (tenant_id, id)
    ON DELETE RESTRICT;
