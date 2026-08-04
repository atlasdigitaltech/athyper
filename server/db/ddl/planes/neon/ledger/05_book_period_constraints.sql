ALTER TABLE ledger.book_period_status
    ADD CONSTRAINT book_period_status_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT book_period_status_book_fk
        FOREIGN KEY (tenant_id, ledger_book_id) REFERENCES master.ledger_book(tenant_id, id),
    ADD CONSTRAINT book_period_status_period_fk
        FOREIGN KEY (tenant_id, fiscal_period_id) REFERENCES master.fiscal_period(tenant_id, id),
    ADD CONSTRAINT book_period_status_opened_by_fk
        FOREIGN KEY (tenant_id, opened_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT book_period_status_soft_by_fk
        FOREIGN KEY (tenant_id, soft_closed_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT book_period_status_hard_by_fk
        FOREIGN KEY (tenant_id, hard_closed_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT book_period_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT book_period_status_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT book_period_status_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id);
