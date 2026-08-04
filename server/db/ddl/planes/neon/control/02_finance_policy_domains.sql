CREATE DOMAIN control.fx_rate_type_d AS text
    CHECK (VALUE IN (
        'SPOT', 'PERIOD_AVG', 'PERIOD_END',
        'BUDGET', 'CONTRACTED', 'HISTORICAL'
    ));

CREATE DOMAIN control.fx_missing_rate_behavior_d AS text
    CHECK (VALUE IN ('block', 'manual_with_approval', 'fallback'));

CREATE DOMAIN control.fx_policy_status_d AS text
    CHECK (VALUE IN ('draft', 'active', 'inactive', 'superseded'));

CREATE DOMAIN control.finance_policy_status_d AS text
    CHECK (VALUE IN ('draft', 'active', 'inactive', 'archived'));

CREATE DOMAIN control.procurement_match_type_d AS text
    CHECK (VALUE IN ('two_way', 'three_way'));

CREATE DOMAIN control.rounding_method_d AS text
    CHECK (VALUE IN (
        'ROUND_HALF_UP', 'ROUND_HALF_EVEN', 'ROUND_DOWN', 'ROUND_UP'
    ));

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
