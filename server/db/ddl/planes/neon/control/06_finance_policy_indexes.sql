CREATE INDEX rounding_rule_status_idx
    ON control.rounding_rule (tenant_id, status, code);

CREATE INDEX rounding_rule_created_by_idx
    ON control.rounding_rule (tenant_id, created_by);

CREATE INDEX procurement_match_tolerance_resolution_idx
    ON control.procurement_match_tolerance_policy (
        tenant_id, match_type, company_code_id, effective_from DESC
    ) WHERE status = 'active';

CREATE INDEX procurement_match_tolerance_created_by_idx
    ON control.procurement_match_tolerance_policy (tenant_id, created_by);

CREATE INDEX fx_policy_resolution_idx
    ON control.fx_policy (
        tenant_id, transaction_context,
        company_code_id, ledger_book_id, effective_from DESC, version_no DESC
    ) WHERE status = 'active';

CREATE INDEX fx_policy_supersedes_idx
    ON control.fx_policy (tenant_id, supersedes_id)
    WHERE supersedes_id IS NOT NULL;

CREATE INDEX fx_policy_created_by_idx
    ON control.fx_policy (tenant_id, created_by);

CREATE UNIQUE INDEX dimension_policy_active_code_uq
    ON control.dimension_policy (tenant_id, policy_code)
    WHERE status = 'active';

CREATE INDEX dimension_policy_resolution_idx
    ON control.dimension_policy (
        tenant_id,
        dimension_type_id,
        company_code_id,
        scope_account_id,
        scope_account_class,
        scope_subledger_type,
        scope_book_id,
        scope_document_type,
        effective_from DESC,
        version_no DESC
    ) WHERE status = 'active';

CREATE INDEX dimension_policy_supersedes_idx
    ON control.dimension_policy (tenant_id, supersedes_id)
    WHERE supersedes_id IS NOT NULL;

CREATE INDEX dimension_policy_created_by_idx
    ON control.dimension_policy (tenant_id, created_by);

CREATE INDEX dimension_policy_allowed_value_policy_idx
    ON control.dimension_policy_allowed_value (
        tenant_id, policy_id, dimension_value_id
    );

CREATE INDEX dimension_policy_allowed_value_value_idx
    ON control.dimension_policy_allowed_value (
        tenant_id, dimension_type_id, dimension_value_id
    );
