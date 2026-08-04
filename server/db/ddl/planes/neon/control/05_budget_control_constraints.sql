ALTER TABLE control.budget_control_policy
    ADD CONSTRAINT budget_control_policy_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT budget_control_policy_company_fk
        FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT budget_control_policy_book_fk
        FOREIGN KEY (tenant_id, ledger_book_id)
        REFERENCES master.ledger_book(tenant_id, id),
    ADD CONSTRAINT budget_control_policy_override_fk
        FOREIGN KEY (override_policy_definition_id)
        REFERENCES control.policy_definition(id),
    ADD CONSTRAINT budget_control_policy_supersedes_fk
        FOREIGN KEY (tenant_id, supersedes_id)
        REFERENCES control.budget_control_policy(tenant_id, id),
    ADD CONSTRAINT budget_control_policy_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT budget_control_policy_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT budget_control_policy_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT budget_control_policy_active_period_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        policy_code WITH =,
        (COALESCE(company_code_id, '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
        (COALESCE(ledger_book_id, '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
        (COALESCE(source_document_type, '*')) WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status = 'active');
