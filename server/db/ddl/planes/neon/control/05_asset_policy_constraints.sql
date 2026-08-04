ALTER TABLE control.asset_class_book_policy
    ADD CONSTRAINT asset_class_book_policy_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT asset_class_book_policy_company_fk
        FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT asset_class_book_policy_asset_class_fk
        FOREIGN KEY (tenant_id, asset_class_id)
        REFERENCES master.asset_class(tenant_id, id),
    ADD CONSTRAINT asset_class_book_policy_ledger_book_fk
        FOREIGN KEY (tenant_id, ledger_book_id)
        REFERENCES master.ledger_book(tenant_id, id),
    ADD CONSTRAINT asset_class_book_policy_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT asset_class_book_policy_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT asset_class_book_policy_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.asset_class_book_policy
    ADD CONSTRAINT asset_class_book_policy_active_period_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        company_code_id WITH =,
        asset_class_id WITH =,
        ledger_book_id WITH =,
        daterange(
            effective_from,
            COALESCE(effective_to + 1, 'infinity'::date),
            '[)'
        ) WITH &&
    ) WHERE (status = 'active');
