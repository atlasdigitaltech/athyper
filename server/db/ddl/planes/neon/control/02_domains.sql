CREATE DOMAIN control.valuation_method_d AS text
    CHECK (VALUE IN (
        'standard_cost', 'weighted_average', 'fifo',
        'moving_average', 'specific_identification'
    ));

CREATE DOMAIN control.stocking_status_d AS text
    CHECK (VALUE IN ('stocked', 'non_stock', 'consumable', 'consignment'));

CREATE DOMAIN control.inventory_policy_status_d AS text
    CHECK (VALUE IN ('draft', 'active', 'inactive', 'archived'));

CREATE DOMAIN control.commodity_policy_status_d AS text
    CHECK (VALUE IN ('draft', 'active', 'inactive', 'archived'));

CREATE DOMAIN control.planning_model_type_d AS text
    CHECK (VALUE IN ('budget', 'forecast', 'capacity', 'headcount', 'scenario'));

CREATE DOMAIN control.planning_granularity_d AS text
    CHECK (VALUE IN ('annual', 'quarterly', 'monthly', 'fiscal_period'));

CREATE DOMAIN control.planning_record_status_d AS text
    CHECK (VALUE IN ('draft', 'active', 'inactive', 'retired'));

CREATE DOMAIN control.planning_driver_type_d AS text
    CHECK (VALUE IN ('quantity', 'rate', 'amount', 'percentage', 'index'));

CREATE DOMAIN control.planning_aggregation_d AS text
    CHECK (VALUE IN ('sum', 'average', 'minimum', 'maximum', 'last_value'));

CREATE DOMAIN control.planning_dependency_type_d AS text
    CHECK (VALUE IN ('input', 'formula', 'allocation'));

CREATE DOMAIN control.budget_period_scope_d AS text
    CHECK (VALUE IN ('current_period', 'year_to_date', 'fiscal_year', 'rolling_12_periods'));

CREATE DOMAIN control.budget_consumption_basis_d AS text
    CHECK (VALUE IN (
        'actuals',
        'actuals_and_commitments',
        'actuals_commitments_and_forecast'
    ));

CREATE DOMAIN control.partner_role_scope_d AS text
    CHECK (VALUE IN ('supplier', 'customer', 'all'));

CREATE DOMAIN control.qualification_decision_d AS text
    CHECK (VALUE IN (
        'pending', 'approved', 'conditional', 'rejected',
        'suspended', 'expired'
    ));

CREATE DOMAIN control.supplier_preference_status_d AS text
    CHECK (VALUE IN ('pending', 'approved', 'rejected', 'revoked'));

CREATE DOMAIN control.customer_account_designation_status_d AS text
    CHECK (VALUE IN ('pending', 'approved', 'rejected', 'revoked'));

CREATE DOMAIN control.customer_account_designation_type_d AS text
    CHECK (VALUE IN ('key_account', 'strategic', 'priority_service'));

CREATE DOMAIN control.partner_block_status_d AS text
    CHECK (VALUE IN ('active', 'lifted', 'cancelled', 'expired'));

CREATE DOMAIN control.payment_execution_delivery_mode_d AS text
    CHECK (VALUE IN ('api', 'sftp', 'file', 'check_print', 'manual'));

CREATE DOMAIN control.payment_execution_profile_status_d AS text
    CHECK (VALUE IN ('draft', 'active', 'paused', 'deprecated'));

CREATE DOMAIN control.commodity_crosswalk_strategy_d AS text
    CHECK (VALUE IN ('exact_only', 'best_match', 'ai_assisted'));

CREATE DOMAIN control.fx_rate_type_d AS text
    CHECK (VALUE IN (
        'SPOT', 'PERIOD_AVG', 'PERIOD_END',
        'BUDGET', 'CONTRACTED', 'HISTORICAL'
    ));

CREATE DOMAIN control.fx_missing_rate_behavior_d AS text
    CHECK (VALUE IN ('block', 'manual_with_approval', 'fallback'));

CREATE DOMAIN control.fx_policy_status_d AS text
    CHECK (VALUE IN ('draft', 'active', 'inactive', 'superseded'));

CREATE DOMAIN control.procurement_match_type_d AS text
    CHECK (VALUE IN ('two_way', 'three_way'));

-- Dimension policies validate accounting coordinates only. Derivation,
-- inheritance, and fixed-value stamping belong to a separate accounting
-- profile rule contract and are intentionally not encoded here.
CREATE DOMAIN control.dimension_policy_enforcement_d AS text
    CHECK (VALUE IN ('required', 'optional', 'forbidden'));

-- Effective-dated tax configuration. A tax-group row is itself one revision;
-- generic snapshot.entity_snapshot supplies immutable activation snapshots.
CREATE DOMAIN control.tax_policy_status_d AS text
    CHECK (VALUE IN ('draft', 'scheduled', 'active', 'expired', 'retired'));

CREATE DOMAIN control.tax_group_kind_d AS text
    CHECK (VALUE IN ('indirect_tax', 'withholding', 'reverse_charge', 'custom'));

CREATE DOMAIN control.tax_direction_d AS text
    CHECK (VALUE IN ('PURCHASE', 'SALE', 'PAYMENT', 'IMPORT', 'EXPORT', 'BOTH'));

CREATE DOMAIN control.tax_rate_kind_d AS text
    CHECK (VALUE IN ('PERCENT', 'FIXED', 'PER_UNIT'));

CREATE DOMAIN control.tax_recoverability_d AS text
    CHECK (VALUE IN ('FULL', 'PARTIAL', 'NONE', 'CONDITIONAL'));

CREATE DOMAIN control.tax_reverse_charge_d AS text
    CHECK (VALUE IN ('NONE', 'SELF_ASSESS', 'FULL'));

CREATE DOMAIN control.tax_calculation_basis_d AS text
    CHECK (VALUE IN (
        'LINE_NET', 'LINE_GROSS', 'DOCUMENT_NET', 'DOCUMENT_GROSS',
        'PAYMENT_AMOUNT'
    ));

CREATE DOMAIN control.tax_wht_basis_d AS text
    CHECK (VALUE IN ('GROSS', 'NET_OF_INDIRECT_TAX', 'PAYMENT_ONLY'));

CREATE DOMAIN control.tax_transaction_direction_d AS text
    CHECK (VALUE IN ('purchase', 'sale', 'payment', 'import', 'export'));

CREATE DOMAIN control.tax_counterparty_status_d AS text
    CHECK (VALUE IN ('REGISTERED', 'UNREGISTERED', 'EXEMPT', 'FOREIGN', 'TREATY'));

CREATE DOMAIN control.wht_threshold_mode_d AS text
    CHECK (VALUE IN ('per_transaction', 'cumulative'));

CREATE DOMAIN control.wht_reset_period_d AS text
    CHECK (VALUE IN ('fiscal_year', 'calendar_year', 'contract'));

-- Neon accounting determination protocol. Stable profile identities live in
-- master.accounting_profile; these domains govern effective control policy.

CREATE DOMAIN control.accounting_policy_status_d AS text
    CHECK (VALUE IN ('draft', 'scheduled', 'active', 'expired', 'retired'));

CREATE DOMAIN control.accounting_journal_action_d AS text
    CHECK (VALUE IN ('post', 'reverse', 'none'));

CREATE DOMAIN control.accounting_posting_side_d AS text
    CHECK (VALUE IN ('debit', 'credit'));

CREATE DOMAIN control.accounting_amount_source_d AS text
    CHECK (VALUE IN (
        'line_net', 'document_net', 'document_gross', 'tax_amount',
        'withholding_amount', 'discount_amount', 'retention_amount',
        'advance_amount', 'advance_recovery', 'net_payable', 'remainder',
        'pricing_component'
    ));

CREATE DOMAIN control.cross_book_posting_mode_d AS text
    CHECK (VALUE IN ('mirror', 'translate'));

CREATE DOMAIN control.cross_book_recognition_d AS text
    CHECK (VALUE IN ('simultaneous', 'deferred'));

CREATE DOMAIN control.fiscal_calendar_type_d AS text
    CHECK (VALUE IN (
        'monthly', 'four_four_five', 'four_five_four',
        'five_four_four', 'thirteen_period', 'custom'
    ));

CREATE DOMAIN control.fiscal_year_label_rule_d AS text
    CHECK (VALUE IN ('start_year', 'end_year'));

CREATE DOMAIN control.fiscal_year_start_rule_d AS text
    CHECK (VALUE IN (
        'fixed_date', 'first_on_or_after',
        'last_on_or_before', 'nearest_weekday'
    ));

CREATE DOMAIN control.fiscal_leap_week_rule_d AS text
    CHECK (VALUE IN ('none', 'last_period'));

CREATE DOMAIN control.fiscal_rule_duration_unit_d AS text
    CHECK (VALUE IN ('point', 'day', 'week', 'month'));

CREATE DOMAIN control.fiscal_rule_anchor_d AS text
    CHECK (VALUE IN ('sequence', 'year_start', 'year_end'));

CREATE DOMAIN control.fiscal_calendar_status_d AS text
    CHECK (VALUE IN ('draft', 'active', 'retired'));

CREATE DOMAIN control.fiscal_calendar_assignment_status_d AS text
    CHECK (VALUE IN ('active', 'inactive'));
