ALTER TABLE control.accounting_profile_policy
    ADD CONSTRAINT accounting_profile_policy_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT accounting_profile_policy_profile_fk
        FOREIGN KEY (tenant_id, accounting_profile_id)
        REFERENCES master.accounting_profile(tenant_id, id),
    ADD CONSTRAINT accounting_profile_policy_supersedes_fk
        FOREIGN KEY (tenant_id, supersedes_policy_id)
        REFERENCES control.accounting_profile_policy(tenant_id, id),
    ADD CONSTRAINT accounting_profile_policy_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT accounting_profile_policy_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT accounting_profile_policy_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.accounting_profile_policy
    ADD CONSTRAINT accounting_profile_policy_period_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        accounting_profile_id WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status IN ('scheduled', 'active'));

ALTER TABLE control.accounting_profile_event
    ADD CONSTRAINT accounting_profile_event_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT accounting_profile_event_policy_fk
        FOREIGN KEY (tenant_id, accounting_profile_policy_id)
        REFERENCES control.accounting_profile_policy(tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT accounting_profile_event_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.accounting_profile_entry
    ADD CONSTRAINT accounting_profile_entry_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT accounting_profile_entry_event_fk
        FOREIGN KEY (tenant_id, accounting_profile_event_id)
        REFERENCES control.accounting_profile_event(tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT accounting_profile_entry_condition_type_fk
        FOREIGN KEY (tenant_id, condition_type_id)
        REFERENCES master.condition_type(tenant_id, id),
    ADD CONSTRAINT accounting_profile_entry_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.accounting_profile_assignment
    ADD CONSTRAINT accounting_profile_assignment_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT accounting_profile_assignment_company_fk
        FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT accounting_profile_assignment_intent_fk
        FOREIGN KEY (tenant_id, business_intent_id) REFERENCES master.business_intent(tenant_id, id),
    ADD CONSTRAINT accounting_profile_assignment_policy_fk
        FOREIGN KEY (tenant_id, accounting_profile_policy_id)
        REFERENCES control.accounting_profile_policy(tenant_id, id),
    ADD CONSTRAINT accounting_profile_assignment_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT accounting_profile_assignment_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT accounting_profile_assignment_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.accounting_profile_assignment
    ADD CONSTRAINT accounting_profile_assignment_period_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        COALESCE(company_code_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        COALESCE(business_intent_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        COALESCE(flow_code, '') WITH =,
        COALESCE(document_type_code, '') WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status IN ('scheduled', 'active'));

ALTER TABLE control.posting_role_account_assignment
    ADD CONSTRAINT posting_role_account_assignment_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT posting_role_account_assignment_company_fk
        FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT posting_role_account_assignment_book_fk
        FOREIGN KEY (tenant_id, ledger_book_id) REFERENCES master.ledger_book(tenant_id, id),
    ADD CONSTRAINT posting_role_account_assignment_gl_account_fk
        FOREIGN KEY (tenant_id, gl_account_id) REFERENCES master.gl_account(tenant_id, id),
    ADD CONSTRAINT posting_role_account_assignment_supersedes_fk
        FOREIGN KEY (tenant_id, supersedes_assignment_id)
        REFERENCES control.posting_role_account_assignment(tenant_id, id),
    ADD CONSTRAINT posting_role_account_assignment_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT posting_role_account_assignment_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT posting_role_account_assignment_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.posting_role_account_assignment
    ADD CONSTRAINT posting_role_account_assignment_period_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        company_code_id WITH =,
        ledger_book_id WITH =,
        posting_role_code WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status IN ('scheduled', 'active'));

ALTER TABLE control.cross_book_posting_policy
    ADD CONSTRAINT cross_book_posting_policy_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT cross_book_posting_policy_company_fk
        FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT cross_book_posting_policy_source_book_fk
        FOREIGN KEY (tenant_id, source_book_id) REFERENCES master.ledger_book(tenant_id, id),
    ADD CONSTRAINT cross_book_posting_policy_target_book_fk
        FOREIGN KEY (tenant_id, target_book_id) REFERENCES master.ledger_book(tenant_id, id),
    ADD CONSTRAINT cross_book_posting_policy_intent_fk
        FOREIGN KEY (tenant_id, scope_business_intent_id) REFERENCES master.business_intent(tenant_id, id),
    ADD CONSTRAINT cross_book_posting_policy_supersedes_fk
        FOREIGN KEY (tenant_id, supersedes_policy_id)
        REFERENCES control.cross_book_posting_policy(tenant_id, id),
    ADD CONSTRAINT cross_book_posting_policy_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cross_book_posting_policy_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT cross_book_posting_policy_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.cross_book_posting_policy
    ADD CONSTRAINT cross_book_posting_policy_period_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        company_code_id WITH =,
        source_book_id WITH =,
        target_book_id WITH =,
        COALESCE(scope_document_type_code, '') WITH =,
        COALESCE(scope_business_intent_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
    ) WHERE (status IN ('scheduled', 'active'));

ALTER TABLE control.cross_book_account_assignment
    ADD CONSTRAINT cross_book_account_assignment_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT cross_book_account_assignment_policy_fk
        FOREIGN KEY (tenant_id, cross_book_posting_policy_id)
        REFERENCES control.cross_book_posting_policy(tenant_id, id) ON DELETE CASCADE,
    ADD CONSTRAINT cross_book_account_assignment_source_account_fk
        FOREIGN KEY (tenant_id, source_gl_account_id) REFERENCES master.gl_account(tenant_id, id),
    ADD CONSTRAINT cross_book_account_assignment_target_account_fk
        FOREIGN KEY (tenant_id, target_gl_account_id) REFERENCES master.gl_account(tenant_id, id),
    ADD CONSTRAINT cross_book_account_assignment_created_by_fk
        FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id);
