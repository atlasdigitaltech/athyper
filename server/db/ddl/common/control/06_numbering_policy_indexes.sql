CREATE UNIQUE INDEX numbering_policy_global_active_code_uq
    ON control.numbering_policy (policy_code)
    WHERE tenant_id IS NULL AND status = 'active';
CREATE UNIQUE INDEX numbering_policy_tenant_active_code_uq
    ON control.numbering_policy (tenant_id, policy_code)
    WHERE tenant_id IS NOT NULL AND status = 'active';
CREATE INDEX numbering_policy_resolve_ix
    ON control.numbering_policy (tenant_id, policy_code, policy_revision)
    WHERE status = 'active';
