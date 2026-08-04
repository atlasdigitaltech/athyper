CREATE INDEX pdef_effective_idx
    ON control.policy_definition (
        tenant_id,
        entity_type,
        effective_from,
        effective_until
    );

CREATE INDEX pdef_global_entity_active_pidx
    ON control.policy_definition (entity_type, priority)
    WHERE tenant_id IS NULL AND is_active = true;

CREATE INDEX pdef_module_idx
    ON control.policy_definition (module_id)
    WHERE module_id IS NOT NULL;

CREATE INDEX pdef_tenant_entity_active_idx
    ON control.policy_definition (tenant_id, entity_type, priority)
    WHERE is_active = true;
