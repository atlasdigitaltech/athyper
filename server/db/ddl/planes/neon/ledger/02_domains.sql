CREATE DOMAIN ledger.budget_transaction_type_d AS text
    CHECK (VALUE IN ('allocate', 'reserve', 'release', 'consume', 'adjust', 'reverse'));

CREATE DOMAIN ledger.budget_direction_d AS text
    CHECK (VALUE IN ('debit', 'credit'));

CREATE DOMAIN ledger.planning_run_status_d AS text
    CHECK (VALUE IN ('pending', 'running', 'completed', 'approved', 'failed', 'cancelled'));

CREATE DOMAIN ledger.book_period_status_d AS text
    CHECK (VALUE IN ('future','open','soft_close','hard_close'));

CREATE DOMAIN ledger.fulfillment_type_d AS text
    CHECK (VALUE IN (
        'goods_receipt','service_acceptance','invoice_match','payment',
        'milestone_completion','advance_recovery','retention_release'
    ));

CREATE DOMAIN ledger.inventory_movement_type_d AS text
    CHECK (VALUE IN (
        'receipt','sales_issue','production_issue','transfer_out','transfer_in',
        'adjustment','scrap','return','opening_balance','reversal_in','reversal_out'
    ));

CREATE DOMAIN ledger.inventory_valuation_method_d AS text
    CHECK (VALUE IN ('standard','moving_average','fifo','lifo','specific_identification'));

CREATE DOMAIN ledger.inventory_layer_method_d AS text
    CHECK (VALUE IN ('fifo','lifo','specific_identification'));

CREATE DOMAIN ledger.tax_direction_d AS text
    CHECK (VALUE IN ('purchase','sale','payment','import','export'));

CREATE DOMAIN ledger.tax_rate_kind_d AS text
    CHECK (VALUE IN ('percent','fixed','per_unit'));

CREATE DOMAIN ledger.tax_treatment_d AS text
    CHECK (VALUE IN (
        'standard','exempt','zero_rated','reverse_charge','withholding','non_taxable'
    ));

CREATE DOMAIN ledger.tax_recoverability_d AS text
    CHECK (VALUE IN ('full','partial','none','conditional'));

CREATE DOMAIN ledger.tax_credit_bucket_d AS text
    CHECK (VALUE IN ('input','output','withholding_deducted','withholding_suffered'));

CREATE DOMAIN ledger.tax_credit_movement_type_d AS text
    CHECK (VALUE IN ('posting','reversal','amendment','carry_forward','adjustment'));

CREATE DOMAIN ledger.asset_reserve_type_d AS text
    CHECK (VALUE IN (
        'revaluation_surplus','revaluation_decrease','impairment','impairment_reversal',
        'reserve_transfer','disposal_release'
    ));

CREATE DOMAIN ledger.fx_balance_type_d AS text
    CHECK (VALUE IN ('receivable','payable','bank','intercompany','loan','other'));

CREATE DOMAIN ledger.ic_elimination_type_d AS text
    CHECK (VALUE IN (
        'revenue_expense','receivable_payable','inventory_markup','intercompany_profit',
        'minority_interest','investment','dividend','loan','other'
    ));
CREATE DOMAIN ledger.cross_book_execution_status_d AS text
    CHECK (VALUE IN ('pending','processing','succeeded','failed','cancelled'));
