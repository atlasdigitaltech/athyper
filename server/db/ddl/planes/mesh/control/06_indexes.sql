CREATE INDEX subscription_plan_active_pidx
    ON control.subscription_plan (sort_order, code)
    WHERE status = 'active';

CREATE UNIQUE INDEX owner_type_platform_code_uq
    ON control.owner_type (code)
    WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX owner_type_tenant_code_uq
    ON control.owner_type (tenant_id, code)
    WHERE tenant_id IS NOT NULL;

CREATE INDEX owner_type_active_capability_idx
    ON control.owner_type
       (tenant_id, supports_address, supports_contact, sort_order, code)
    WHERE status = 'active';

CREATE INDEX owner_type_target_idx
    ON control.owner_type (target_schema, target_table)
    WHERE status <> 'deprecated';

CREATE INDEX owner_type_purpose_lookup_idx
    ON control.owner_type_purpose (capability, purpose_code, owner_type_id);
