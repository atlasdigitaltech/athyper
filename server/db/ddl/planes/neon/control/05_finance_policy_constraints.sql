ALTER TABLE control.rounding_rule
    ADD CONSTRAINT rounding_rule_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT rounding_rule_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT rounding_rule_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT rounding_rule_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.procurement_match_tolerance_policy
    ADD CONSTRAINT procurement_match_tolerance_policy_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT procurement_match_tolerance_policy_company_fk
        FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT procurement_match_tolerance_policy_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT procurement_match_tolerance_policy_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT procurement_match_tolerance_policy_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.procurement_match_tolerance_policy
    ADD CONSTRAINT procurement_match_tolerance_tenant_period_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        match_type WITH =,
        daterange(
            effective_from,
            COALESCE(effective_to + 1, 'infinity'::date),
            '[)'
        ) WITH &&
    ) WHERE (status = 'active' AND company_code_id IS NULL),
    ADD CONSTRAINT procurement_match_tolerance_company_period_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        company_code_id WITH =,
        match_type WITH =,
        daterange(
            effective_from,
            COALESCE(effective_to + 1, 'infinity'::date),
            '[)'
        ) WITH &&
    ) WHERE (status = 'active' AND company_code_id IS NOT NULL);

ALTER TABLE control.fx_policy
    ADD CONSTRAINT fx_policy_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT fx_policy_company_fk
        FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT fx_policy_ledger_book_fk
        FOREIGN KEY (tenant_id, ledger_book_id)
        REFERENCES master.ledger_book(tenant_id, id),
    ADD CONSTRAINT fx_policy_pivot_currency_fk
        FOREIGN KEY (pivot_currency_code) REFERENCES shared.currency(code),
    ADD CONSTRAINT fx_policy_supersedes_fk
        FOREIGN KEY (tenant_id, supersedes_id)
        REFERENCES control.fx_policy(tenant_id, id),
    ADD CONSTRAINT fx_policy_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT fx_policy_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT fx_policy_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal(tenant_id, id);

ALTER TABLE control.fx_policy
    ADD CONSTRAINT fx_policy_active_period_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        COALESCE(company_code_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        COALESCE(ledger_book_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        transaction_context WITH =,
        daterange(
            effective_from,
            COALESCE(effective_to + 1, 'infinity'::date),
            '[)'
        ) WITH &&
    ) WHERE (status = 'active');

ALTER TABLE control.dimension_policy
    ADD CONSTRAINT dimension_policy_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT dimension_policy_dimension_type_fk
        FOREIGN KEY (tenant_id, dimension_type_id)
        REFERENCES master.dimension_type(tenant_id, id),
    ADD CONSTRAINT dimension_policy_company_fk
        FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code(tenant_id, id),
    ADD CONSTRAINT dimension_policy_account_fk
        FOREIGN KEY (tenant_id, scope_account_id)
        REFERENCES master.gl_account(tenant_id, id),
    ADD CONSTRAINT dimension_policy_book_fk
        FOREIGN KEY (tenant_id, scope_book_id)
        REFERENCES master.ledger_book(tenant_id, id),
    ADD CONSTRAINT dimension_policy_depends_type_fk
        FOREIGN KEY (tenant_id, depends_on_dimension_type_id)
        REFERENCES master.dimension_type(tenant_id, id),
    ADD CONSTRAINT dimension_policy_exclusive_type_fk
        FOREIGN KEY (tenant_id, mutually_exclusive_dimension_type_id)
        REFERENCES master.dimension_type(tenant_id, id),
    ADD CONSTRAINT dimension_policy_supersedes_fk
        FOREIGN KEY (tenant_id, supersedes_id)
        REFERENCES control.dimension_policy(tenant_id, id),
    ADD CONSTRAINT dimension_policy_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT dimension_policy_updated_by_fk
        FOREIGN KEY (tenant_id, updated_by)
        REFERENCES master.principal(tenant_id, id),
    ADD CONSTRAINT dimension_policy_status_changed_by_fk
        FOREIGN KEY (tenant_id, status_changed_by)
        REFERENCES master.principal(tenant_id, id);

-- Identical active scopes may not overlap in time. Tenant-global and more
-- specific scopes remain distinct coordinates and are resolved by specificity.
ALTER TABLE control.dimension_policy
    ADD CONSTRAINT dimension_policy_active_scope_period_excl
    EXCLUDE USING gist (
        tenant_id WITH =,
        dimension_type_id WITH =,
        COALESCE(company_code_id,
            '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        COALESCE(scope_account_class::text, '*') WITH =,
        COALESCE(scope_account_id,
            '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        COALESCE(scope_subledger_type::text, '*') WITH =,
        COALESCE(scope_book_id,
            '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        COALESCE(scope_document_type, '*') WITH =,
        daterange(
            effective_from,
            COALESCE(effective_to + 1, 'infinity'::date),
            '[)'
        ) WITH &&
    ) WHERE (status = 'active');

ALTER TABLE control.dimension_policy_allowed_value
    ADD CONSTRAINT dimension_policy_allowed_value_tenant_fk
        FOREIGN KEY (tenant_id) REFERENCES master.tenant(id),
    ADD CONSTRAINT dimension_policy_allowed_value_policy_fk
        FOREIGN KEY (tenant_id, policy_id, dimension_type_id)
        REFERENCES control.dimension_policy(tenant_id, id, dimension_type_id)
        ON DELETE CASCADE,
    ADD CONSTRAINT dimension_policy_allowed_value_value_fk
        FOREIGN KEY (tenant_id, dimension_type_id, dimension_value_id)
        REFERENCES master.dimension_value(tenant_id, dimension_type_id, id),
    ADD CONSTRAINT dimension_policy_allowed_value_created_by_fk
        FOREIGN KEY (tenant_id, created_by)
        REFERENCES master.principal(tenant_id, id);
