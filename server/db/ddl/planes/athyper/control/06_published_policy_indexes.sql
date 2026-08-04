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
