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

CREATE UNIQUE INDEX workflow_sla_policy_active_uq
    ON control.workflow_sla_policy (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), code)
    WHERE status = 'active';
CREATE INDEX workflow_sla_policy_effective_idx
    ON control.workflow_sla_policy (tenant_id, status, effective_from DESC);
CREATE UNIQUE INDEX bank_format_rule_active_uq
    ON control.bank_format_rule (
        COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid),
        country_code, payment_network, direction, COALESCE(currency_code, '***'::character(3)), priority
    ) WHERE status = 'active';
CREATE INDEX bank_format_rule_resolution_idx
    ON control.bank_format_rule (country_code, payment_network, direction, currency_code, priority DESC)
    WHERE status = 'active';
