CREATE INDEX accounting_profile_policy_profile_idx
    ON control.accounting_profile_policy (tenant_id, accounting_profile_id, effective_from DESC);
CREATE INDEX accounting_profile_policy_supersedes_idx
    ON control.accounting_profile_policy (tenant_id, supersedes_policy_id)
    WHERE supersedes_policy_id IS NOT NULL;
CREATE INDEX accounting_profile_policy_created_by_idx
    ON control.accounting_profile_policy (tenant_id, created_by);
CREATE INDEX accounting_profile_policy_updated_by_idx
    ON control.accounting_profile_policy (tenant_id, updated_by)
    WHERE updated_by IS NOT NULL;
CREATE INDEX accounting_profile_policy_status_by_idx
    ON control.accounting_profile_policy (tenant_id, status_changed_by)
    WHERE status_changed_by IS NOT NULL;

CREATE INDEX accounting_profile_event_policy_idx
    ON control.accounting_profile_event (tenant_id, accounting_profile_policy_id, sequence_no);
CREATE INDEX accounting_profile_event_created_by_idx
    ON control.accounting_profile_event (tenant_id, created_by);
CREATE INDEX accounting_profile_entry_event_idx
    ON control.accounting_profile_entry (tenant_id, accounting_profile_event_id, line_no);
CREATE INDEX accounting_profile_entry_role_idx
    ON control.accounting_profile_entry (posting_role_code);
CREATE INDEX accounting_profile_entry_condition_idx
    ON control.accounting_profile_entry (tenant_id, condition_type_id)
    WHERE condition_type_id IS NOT NULL;
CREATE INDEX accounting_profile_entry_created_by_idx
    ON control.accounting_profile_entry (tenant_id, created_by);

CREATE INDEX accounting_profile_assignment_resolution_idx
    ON control.accounting_profile_assignment (
        tenant_id, company_code_id, business_intent_id,
        flow_code, document_type_code, effective_from DESC
    ) WHERE status IN ('scheduled', 'active');
CREATE INDEX accounting_profile_assignment_policy_idx
    ON control.accounting_profile_assignment (tenant_id, accounting_profile_policy_id);
CREATE INDEX accounting_profile_assignment_intent_idx
    ON control.accounting_profile_assignment (tenant_id, business_intent_id)
    WHERE business_intent_id IS NOT NULL;
CREATE INDEX accounting_profile_assignment_created_by_idx
    ON control.accounting_profile_assignment (tenant_id, created_by);
CREATE INDEX accounting_profile_assignment_updated_by_idx
    ON control.accounting_profile_assignment (tenant_id, updated_by)
    WHERE updated_by IS NOT NULL;
CREATE INDEX accounting_profile_assignment_status_by_idx
    ON control.accounting_profile_assignment (tenant_id, status_changed_by)
    WHERE status_changed_by IS NOT NULL;

CREATE INDEX posting_role_account_assignment_resolution_idx
    ON control.posting_role_account_assignment (
        tenant_id, company_code_id, ledger_book_id,
        posting_role_code, effective_from DESC
    ) WHERE status IN ('scheduled', 'active');
CREATE INDEX posting_role_account_assignment_account_idx
    ON control.posting_role_account_assignment (tenant_id, gl_account_id);
CREATE INDEX posting_role_account_assignment_book_idx
    ON control.posting_role_account_assignment (tenant_id, ledger_book_id);
CREATE INDEX posting_role_account_assignment_supersedes_idx
    ON control.posting_role_account_assignment (tenant_id, supersedes_assignment_id)
    WHERE supersedes_assignment_id IS NOT NULL;
CREATE INDEX posting_role_account_assignment_created_by_idx
    ON control.posting_role_account_assignment (tenant_id, created_by);
CREATE INDEX posting_role_account_assignment_updated_by_idx
    ON control.posting_role_account_assignment (tenant_id, updated_by)
    WHERE updated_by IS NOT NULL;
CREATE INDEX posting_role_account_assignment_status_by_idx
    ON control.posting_role_account_assignment (tenant_id, status_changed_by)
    WHERE status_changed_by IS NOT NULL;

CREATE INDEX cross_book_posting_policy_resolution_idx
    ON control.cross_book_posting_policy (
        tenant_id, company_code_id, source_book_id,
        scope_document_type_code, scope_business_intent_id, effective_from DESC
    ) WHERE status IN ('scheduled', 'active');
CREATE INDEX cross_book_posting_policy_source_book_idx
    ON control.cross_book_posting_policy (tenant_id, source_book_id);
CREATE INDEX cross_book_posting_policy_target_book_idx
    ON control.cross_book_posting_policy (tenant_id, target_book_id);
CREATE INDEX cross_book_posting_policy_intent_idx
    ON control.cross_book_posting_policy (tenant_id, scope_business_intent_id)
    WHERE scope_business_intent_id IS NOT NULL;
CREATE INDEX cross_book_posting_policy_supersedes_idx
    ON control.cross_book_posting_policy (tenant_id, supersedes_policy_id)
    WHERE supersedes_policy_id IS NOT NULL;
CREATE INDEX cross_book_posting_policy_created_by_idx
    ON control.cross_book_posting_policy (tenant_id, created_by);
CREATE INDEX cross_book_posting_policy_updated_by_idx
    ON control.cross_book_posting_policy (tenant_id, updated_by)
    WHERE updated_by IS NOT NULL;
CREATE INDEX cross_book_posting_policy_status_by_idx
    ON control.cross_book_posting_policy (tenant_id, status_changed_by)
    WHERE status_changed_by IS NOT NULL;
CREATE INDEX cross_book_account_assignment_source_idx
    ON control.cross_book_account_assignment (tenant_id, source_gl_account_id);
CREATE INDEX cross_book_account_assignment_target_idx
    ON control.cross_book_account_assignment (tenant_id, target_gl_account_id);
CREATE INDEX cross_book_account_assignment_created_by_idx
    ON control.cross_book_account_assignment (tenant_id, created_by);
