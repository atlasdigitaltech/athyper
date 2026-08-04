-- Desired-state domains for the first legacy document movement wave.

CREATE DOMAIN document.asset_transaction_status_d AS text
    CHECK (VALUE IN ('draft','posted','reversed','cancelled'));
CREATE DOMAIN document.asset_transaction_type_d AS text
    CHECK (VALUE IN (
        'capitalize','depreciate','revalue_up','revalue_down','impair',
        'impair_reverse','transfer','retire','dispose','adjust_cost',
        'adjust_life','split','merge'
    ));

CREATE DOMAIN document.fx_revaluation_run_status_d AS text
    CHECK (VALUE IN ('draft','calculated','posted','reversed','cancelled'));
CREATE DOMAIN document.fx_rate_source_d AS text
    CHECK (VALUE IN ('MANUAL','MARKET','CENTRAL_BANK','PROVIDER','SYSTEM'));

CREATE DOMAIN document.intercompany_agreement_type_d AS text
    CHECK (VALUE IN ('GOODS','SERVICES','LOAN','ROYALTY','MANAGEMENT_FEE','COST_SHARING','OTHER'));
CREATE DOMAIN document.transfer_pricing_method_d AS text
    CHECK (VALUE IN ('CUP','COST_PLUS','RESALE_MINUS','TNMM','PROFIT_SPLIT','COMPARABLE_PROFIT','OTHER'));
CREATE DOMAIN document.intercompany_conflict_strategy_d AS text
    CHECK (VALUE IN ('HIGHEST_PRIORITY','MOST_SPECIFIC','ERROR_ON_CONFLICT'));
CREATE DOMAIN document.intercompany_agreement_status_d AS text
    CHECK (VALUE IN ('draft','active','suspended','superseded','expired','cancelled'));

CREATE DOMAIN document.intercompany_transaction_type_d AS text
    CHECK (VALUE IN (
        'RECHARGE','PURCHASE','SALE','LOAN_DRAWDOWN','LOAN_REPAYMENT',
        'ROYALTY','MANAGEMENT_FEE','COST_ALLOCATION','DIVIDEND','OTHER'
    ));
CREATE DOMAIN document.intercompany_match_status_d AS text
    CHECK (VALUE IN ('UNMATCHED','MATCHED','DISPUTED','PARTIALLY_MATCHED'));
CREATE DOMAIN document.intercompany_transaction_status_d AS text
    CHECK (VALUE IN ('draft','created','posted','netted','settled','disputed','cancelled','reversed'));

CREATE DOMAIN document.ic_elimination_type_d AS text
    CHECK (VALUE IN (
        'REVENUE_EXPENSE','RECEIVABLE_PAYABLE','INVENTORY_MARKUP','IC_PROFIT',
        'MINORITY_INTEREST','INVESTMENT','DIVIDEND','LOAN','OTHER'
    ));
CREATE DOMAIN document.ic_approval_route_d AS text
    CHECK (VALUE IN ('AUTO','STANDARD','ENHANCED','MANUAL'));
CREATE DOMAIN document.ic_elimination_status_d AS text
    CHECK (VALUE IN ('calculated','approved','posted','reversed','rejected','cancelled'));

CREATE DOMAIN document.match_exception_type_d AS text
    CHECK (VALUE IN (
        'PRICE_VARIANCE','QUANTITY_VARIANCE','AMOUNT_VARIANCE','MISSING_RECEIPT',
        'DUPLICATE_INVOICE','TAX_VARIANCE','FX_VARIANCE','RETENTION_VARIANCE',
        'ADVANCE_RECOVERY_MISMATCH'
    ));
CREATE DOMAIN document.match_exception_resolution_d AS text
    CHECK (VALUE IN (
        'ACCEPTED','FORCE_MATCHED','CREDIT_NOTE_REQUESTED','WRITTEN_OFF',
        'PRICE_ADJUSTMENT','QUANTITY_ADJUSTMENT','REJECTED'
    ));
CREATE DOMAIN document.match_exception_status_d AS text
    CHECK (VALUE IN ('open','pending_approval','approved','rejected','force_matched','written_off','cancelled'));

CREATE DOMAIN document.netting_direction_d AS text
    CHECK (VALUE IN ('A_TO_B','B_TO_A','ZERO'));
CREATE DOMAIN document.netting_batch_status_d AS text
    CHECK (VALUE IN ('draft','calculated','approved','settled','cancelled'));

CREATE DOMAIN document.obligation_tier_d AS text
    CHECK (VALUE IN ('PLANNED','FORECAST','RESERVED','COMMITTED','CONSUMED'));
CREATE DOMAIN document.obligation_spread_method_d AS text
    CHECK (VALUE IN ('EVEN','FRONT_LOADED','BACK_LOADED','MILESTONE','CUSTOM'));
CREATE DOMAIN document.obligation_source_type_d AS text
    CHECK (VALUE IN ('CONTRACT','PO','SUBSCRIPTION','LEASE','FORECAST_MODEL','MANUAL'));
CREATE DOMAIN document.obligation_horizon_status_d AS text
    CHECK (VALUE IN ('active','cancelled','superseded'));

CREATE DOMAIN document.remittance_delivery_method_d AS text
    CHECK (VALUE IN ('EMAIL','PORTAL','EDI','FAX','PRINT','API'));
CREATE DOMAIN document.remittance_delivery_status_d AS text
    CHECK (VALUE IN ('pending','sent','delivered','failed','bounced'));
CREATE DOMAIN document.payment_remittance_status_d AS text
    CHECK (VALUE IN ('draft','generated','sent','delivered','failed','cancelled'));

CREATE DOMAIN document.payment_discount_application_status_d AS text
    CHECK (VALUE IN ('QUALIFIED','NOT_QUALIFIED','PARTIAL','WAIVED','EXPIRED','REVERSED'));

CREATE DOMAIN document.wht_certificate_status_d AS text
    CHECK (VALUE IN ('draft','issued','voided'));

CREATE DOMAIN document.import_file_format_d AS text
    CHECK (VALUE IN ('csv','xlsx','tsv'));
CREATE DOMAIN document.import_mode_d AS text
    CHECK (VALUE IN ('create','update','upsert'));
CREATE DOMAIN document.import_request_status_d AS text
    CHECK (VALUE IN ('uploaded','processing','completed','failed','cancelled'));
CREATE DOMAIN document.import_chunk_status_d AS text
    CHECK (VALUE IN ('pending','queued','processing','completed','failed','cancelled'));

CREATE DOMAIN document.render_output_status_d AS text
    CHECK (VALUE IN ('QUEUED','RENDERING','RENDERED','DELIVERED','FAILED','ARCHIVED','REVOKED'));

CREATE DOMAIN document.render_failure_category_d AS text
    CHECK (VALUE IN ('transient','timeout','permanent','crash'));

CREATE DOMAIN document.profile_update_priority_d AS text
    CHECK (VALUE IN ('low','normal','high','urgent'));
CREATE DOMAIN document.profile_update_request_status_d AS text
    CHECK (VALUE IN ('draft','submitted','awaiting_approval','revision_requested','approved','rejected','cancelled'));
