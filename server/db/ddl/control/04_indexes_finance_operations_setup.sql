CREATE INDEX IF NOT EXISTS ix_fx_policy_resolution
    ON control.fx_policy (
        tenant_id, transaction_context, company_code_id, ledger_book_id,
        effective_from, priority DESC
    )
    WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS ux_fx_policy_active_scope_version
    ON control.fx_policy (
        tenant_id,
        COALESCE(company_code_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(ledger_book_id, '00000000-0000-0000-0000-000000000000'::uuid),
        transaction_context, effective_from, priority, version_no
    )
    WHERE status IN ('draft','active');

CREATE INDEX IF NOT EXISTS ix_tax_group_rounding_rule
    ON control.tax_group (tenant_id, rounding_rule_id)
    WHERE rounding_rule_id IS NOT NULL;

