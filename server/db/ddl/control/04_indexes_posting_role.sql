CREATE UNIQUE INDEX IF NOT EXISTS posting_role_alias_global_uq
    ON control.posting_role_alias (alias_code, COALESCE(source_domain_code, ''))
    WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS posting_role_alias_tenant_uq
    ON control.posting_role_alias (tenant_id, alias_code, COALESCE(source_domain_code, ''))
    WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS posting_role_alias_resolution_idx
    ON control.posting_role_alias (alias_code, tenant_id) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS pram_resolution_idx
    ON control.posting_role_account_map
       (tenant_id, company_code_id, ledger_book_id, posting_role_code, priority DESC, effective_from DESC)
    WHERE status = 'active';
CREATE INDEX IF NOT EXISTS pram_account_idx
    ON control.posting_role_account_map (tenant_id, gl_account_id);
CREATE INDEX IF NOT EXISTS pram_book_idx
    ON control.posting_role_account_map (tenant_id, company_code_id, ledger_book_id);

