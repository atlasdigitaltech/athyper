CREATE INDEX IF NOT EXISTS ix_payment_term_current_catalog
    ON master.payment_term(tenant_id,code,effective_from DESC,version DESC)
    WHERE is_current_version=true;

CREATE INDEX IF NOT EXISTS ix_house_bank_payment_eligibility
    ON master.bank_account_house_config(tenant_id,bank_account_link_id,priority DESC)
    WHERE status='active';
