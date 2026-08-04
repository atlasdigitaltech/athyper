CREATE INDEX asset_class_book_policy_asset_class_idx
    ON control.asset_class_book_policy (tenant_id, asset_class_id)
    WHERE status = 'active';

CREATE INDEX asset_class_book_policy_company_idx
    ON control.asset_class_book_policy (tenant_id, company_code_id)
    WHERE status = 'active';

CREATE INDEX asset_class_book_policy_ledger_book_idx
    ON control.asset_class_book_policy (tenant_id, ledger_book_id)
    WHERE status = 'active';
