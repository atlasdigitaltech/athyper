-- ============================================================================
-- control/01z_asset_class_book_policy_clearing_roles.sql
-- Concept: class_clearing + expense_low_value posting role codes
-- Depends on: control/01_tables.sql (asset_class_book_policy)
--
-- Posting role codes on asset_class_book_policy:
--   • acquisition_posting_role_code        — AD.asset_id IS NOT NULL (specific asset capitalised)
--   • cwip_posting_role_code               — AD on an asset line where the line is still in CWIP
--   • class_clearing_posting_role_code     — PIL.asset_class_id IS NOT NULL, AD.asset_id IS NULL
--                                            (class known, master.asset to be created at settlement)
--   • expense_low_value_posting_role_code  — PIL.asset_class_id IS NOT NULL, line amount under
--                                            asset_class.capitalization_threshold
--   • accum_depr_posting_role_code         — depreciation
--   • depr_expense_posting_role_code       — depreciation expense
--   • gain_loss_posting_role_code          — disposal P&L
--   • impairment_expense_posting_role_code, impairment_reserve_posting_role_code
--   • revaluation_surplus_posting_role_code, revaluation_loss_posting_role_code
--
-- Routing is computed at posting time from (AD.asset_id, PIL.asset_class_id,
-- line amount vs class threshold) — there is no asset_posting_target column on AD.
-- These are TEXT role codes (resolved to GL accounts at runtime via
-- control.resolve_entry_account), NOT direct GL account UUIDs.
-- ============================================================================

ALTER TABLE control.asset_class_book_policy
    ADD COLUMN IF NOT EXISTS class_clearing_posting_role_code    text,
    ADD COLUMN IF NOT EXISTS expense_low_value_posting_role_code text;

COMMENT ON COLUMN control.asset_class_book_policy.class_clearing_posting_role_code IS
    'Posting role used when PIL.asset_class_id IS NOT NULL but AD.asset_id IS NULL '
    '(class known, master.asset record not yet created — capitalized later at settlement). '
    'Convention: <CLASS_CODE>_PENDING_CAPITALIZATION_CLEARING.';

COMMENT ON COLUMN control.asset_class_book_policy.expense_low_value_posting_role_code IS
    'Posting role used when PIL.asset_class_id IS NOT NULL and line amount is under '
    'asset_class.capitalization_threshold (expensed rather than capitalised). '
    'Convention: <CLASS_CODE>_LOW_VALUE_EXPENSE.';


-- =============================================================================
-- End of 01z_asset_class_book_policy_clearing_roles.sql
-- =============================================================================
