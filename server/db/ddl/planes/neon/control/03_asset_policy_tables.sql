-- Neon fixed-asset accounting defaults.  This is the effective policy used
-- when an asset book is created; it is intentionally separate from the
-- resulting master.asset_book record.
CREATE TABLE control.asset_class_book_policy (
    id                                    uuid                              NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                             uuid                              NOT NULL,
    company_code_id                       uuid                              NOT NULL,
    asset_class_id                        uuid                              NOT NULL,
    ledger_book_id                        uuid                              NOT NULL,
    capitalization_threshold              numeric(18,4)                     NOT NULL DEFAULT 0,
    capitalization_currency               character(3),
    effective_from                        date                              NOT NULL DEFAULT CURRENT_DATE,
    effective_to                          date,
    depreciation_method                   master.depreciation_method_d      NOT NULL,
    useful_life_months                    integer                           NOT NULL,
    residual_value_mode                   text                              NOT NULL DEFAULT 'zero',
    residual_value_amount                 numeric(18,4),
    residual_value_pct                    numeric(9,4),
    convention                            master.depreciation_convention_d,
    prorate_basis                         master.asset_prorate_basis_d      NOT NULL DEFAULT 'monthly',
    depreciation_start_rule               text                              NOT NULL DEFAULT 'in_service_date',
    method_params                         jsonb                             NOT NULL DEFAULT '{}'::jsonb,
    allow_manual_life_override            boolean                           NOT NULL DEFAULT false,
    allow_manual_residual_override        boolean                           NOT NULL DEFAULT false,
    allow_manual_method_override          boolean                           NOT NULL DEFAULT false,
    acquisition_posting_role_code         text,
    accum_depr_posting_role_code          text,
    depr_expense_posting_role_code        text,
    gain_loss_posting_role_code           text,
    impairment_expense_posting_role_code  text,
    impairment_reserve_posting_role_code  text,
    revaluation_surplus_posting_role_code text,
    revaluation_loss_posting_role_code    text,
    cwip_posting_role_code                text,
    class_clearing_posting_role_code      text,
    expense_low_value_posting_role_code   text,
    metadata                              jsonb                             NOT NULL DEFAULT '{}'::jsonb,
    status                                shared.active_inactive_d         NOT NULL DEFAULT 'active',
    is_active                             boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at                     timestamptz,
    status_changed_by                     uuid,
    created_at                            timestamptz                       NOT NULL DEFAULT now(),
    created_by                            uuid                              NOT NULL,
    updated_at                            timestamptz,
    updated_by                            uuid,

    CONSTRAINT asset_class_book_policy_pkey PRIMARY KEY (id),
    CONSTRAINT asset_class_book_policy_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT asset_class_book_policy_effective_from_uq
        UNIQUE (tenant_id, company_code_id, asset_class_id, ledger_book_id, effective_from),
    CONSTRAINT asset_class_book_policy_threshold_chk CHECK (capitalization_threshold >= 0),
    CONSTRAINT asset_class_book_policy_threshold_currency_chk CHECK (
        (capitalization_threshold = 0 AND capitalization_currency IS NULL)
        OR (capitalization_threshold > 0 AND capitalization_currency ~ '^[A-Z]{3}$')
    ),
    CONSTRAINT asset_class_book_policy_effective_range_chk
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT asset_class_book_policy_life_chk CHECK (
        (depreciation_method = 'no_depreciation' AND useful_life_months = 0)
        OR (depreciation_method <> 'no_depreciation' AND useful_life_months > 0)
    ),
    CONSTRAINT asset_class_book_policy_residual_mode_chk
        CHECK (residual_value_mode IN ('zero', 'amount', 'percent')),
    CONSTRAINT asset_class_book_policy_residual_value_chk CHECK (
        (residual_value_mode = 'zero'
            AND residual_value_amount IS NULL AND residual_value_pct IS NULL)
        OR (residual_value_mode = 'amount'
            AND residual_value_amount IS NOT NULL AND residual_value_amount >= 0
            AND residual_value_pct IS NULL)
        OR (residual_value_mode = 'percent'
            AND residual_value_amount IS NULL
            AND residual_value_pct IS NOT NULL AND residual_value_pct BETWEEN 0 AND 100)
    ),
    CONSTRAINT asset_class_book_policy_convention_chk CHECK (
        depreciation_method = 'no_depreciation' OR convention IS NOT NULL
    ),
    CONSTRAINT asset_class_book_policy_start_rule_chk
        CHECK (depreciation_start_rule IN ('in_service_date', 'capitalization_date', 'next_period')),
    CONSTRAINT asset_class_book_policy_required_posting_roles_chk CHECK (
        acquisition_posting_role_code IS NOT NULL
        AND (depreciation_method = 'no_depreciation' OR (
            accum_depr_posting_role_code IS NOT NULL
            AND depr_expense_posting_role_code IS NOT NULL
        ))
    ),
    CONSTRAINT asset_class_book_policy_role_code_fmt_chk CHECK (
        COALESCE(acquisition_posting_role_code, '') ~ '^$|^[a-z][a-z0-9_]{1,62}$'
        AND COALESCE(accum_depr_posting_role_code, '') ~ '^$|^[a-z][a-z0-9_]{1,62}$'
        AND COALESCE(depr_expense_posting_role_code, '') ~ '^$|^[a-z][a-z0-9_]{1,62}$'
        AND COALESCE(gain_loss_posting_role_code, '') ~ '^$|^[a-z][a-z0-9_]{1,62}$'
        AND COALESCE(impairment_expense_posting_role_code, '') ~ '^$|^[a-z][a-z0-9_]{1,62}$'
        AND COALESCE(impairment_reserve_posting_role_code, '') ~ '^$|^[a-z][a-z0-9_]{1,62}$'
        AND COALESCE(revaluation_surplus_posting_role_code, '') ~ '^$|^[a-z][a-z0-9_]{1,62}$'
        AND COALESCE(revaluation_loss_posting_role_code, '') ~ '^$|^[a-z][a-z0-9_]{1,62}$'
        AND COALESCE(cwip_posting_role_code, '') ~ '^$|^[a-z][a-z0-9_]{1,62}$'
        AND COALESCE(class_clearing_posting_role_code, '') ~ '^$|^[a-z][a-z0-9_]{1,62}$'
        AND COALESCE(expense_low_value_posting_role_code, '') ~ '^$|^[a-z][a-z0-9_]{1,62}$'
    ),
    CONSTRAINT asset_class_book_policy_json_chk
        CHECK (jsonb_typeof(method_params) = 'object' AND jsonb_typeof(metadata) = 'object'),
    CONSTRAINT asset_class_book_policy_status_evidence_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT asset_class_book_policy_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.asset_class_book_policy IS
    'Effective Neon fixed-asset accounting policy for one company, asset class and ledger book. It supplies controlled defaults for master.asset_book; it never stores asset balances or depreciation postings.';

COMMENT ON COLUMN control.asset_class_book_policy.ledger_book_id IS
    'Ledger book, not a mutable text code. The policy is valid only while that book is assigned to the company.';

COMMENT ON COLUMN control.asset_class_book_policy.method_params IS
    'Method-specific, non-secret inputs only. General policy fields must remain explicit columns.';
