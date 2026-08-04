CREATE INDEX book_period_status_period_idx
    ON ledger.book_period_status (tenant_id, fiscal_period_id, status);
CREATE INDEX book_period_status_book_status_idx
    ON ledger.book_period_status (tenant_id, ledger_book_id, status);
