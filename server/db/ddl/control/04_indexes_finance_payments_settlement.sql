-- Finance Setup Phase 2, Stage D: resolution/readiness indexes.
CREATE INDEX IF NOT EXISTS ix_pmcp_company_readiness
    ON control.payment_method_company_policy
    (tenant_id,company_code_id,direction,effective_from DESC,priority DESC)
    WHERE status='active';

CREATE INDEX IF NOT EXISTS ix_pmib_deterministic_resolution
    ON control.payment_method_interface_binding
    (tenant_id,payment_method_id,direction,effective_from DESC,priority DESC,id)
    WHERE status='active';

CREATE INDEX IF NOT EXISTS ix_psr_company_readiness
    ON control.payment_settlement_rule
    (tenant_id,company_code_id,payment_method_id,direction,book_code,effective_from DESC)
    WHERE status='active';
