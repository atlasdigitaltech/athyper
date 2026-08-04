CREATE INDEX budget_control_policy_resolve_idx
    ON control.budget_control_policy (
        tenant_id, company_code_id, ledger_book_id,
        source_document_type, effective_from, effective_to
    ) WHERE status = 'active';

CREATE INDEX budget_control_policy_supersedes_idx
    ON control.budget_control_policy (tenant_id, supersedes_id)
    WHERE supersedes_id IS NOT NULL;
