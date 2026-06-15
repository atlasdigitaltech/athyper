-- ============================================================================
-- control/01z_asset_class_book_policy_clearing_roles.sql
-- Concept: Add class_clearing + expense_low_value posting role codes
-- Depends on: control/01_tables.sql (asset_class_book_policy at line 5392)
-- Spec: docs/specs/purchase_invoice_field_design.md §3.4
--
-- Existing role codes on asset_class_book_policy (per repo audit):
--   • acquisition_posting_role_code        — for asset_posting_target='fixed_asset'
--   • accum_depr_posting_role_code         — depreciation posting
--   • depr_expense_posting_role_code       — depreciation expense
--   • gain_loss_posting_role_code          — disposal P&L
--   • impairment_expense_posting_role_code
--   • impairment_reserve_posting_role_code
--   • revaluation_surplus_posting_role_code
--   • revaluation_loss_posting_role_code
--   • cwip_posting_role_code               — for asset_posting_target='cwip_clearing'
--
-- P3 adds the two routing buckets that today have no policy entry:
--   • class_clearing_posting_role_code     — for asset_posting_target='class_clearing'
--                                            (PIL.asset_treatment='class_pending')
--   • expense_low_value_posting_role_code  — for asset_posting_target='expense'
--                                            (PIL.asset_treatment='expense_low_value')
--
-- These are TEXT role codes (resolved to GL accounts at runtime via
-- control.resolve_entry_account), NOT direct GL account UUIDs.
-- ============================================================================

ALTER TABLE control.asset_class_book_policy
    ADD COLUMN IF NOT EXISTS class_clearing_posting_role_code    text,
    ADD COLUMN IF NOT EXISTS expense_low_value_posting_role_code text;

COMMENT ON COLUMN control.asset_class_book_policy.class_clearing_posting_role_code IS
    'Resolved posting role for AD.asset_posting_target = ''class_clearing''. '
    'Routes the GL hit when PIL.asset_treatment=''class_pending'' (asset class known, '
    'master.asset record not yet created — capitalized later at settlement). '
    'Convention: <CLASS_CODE>_PENDING_CAPITALIZATION_CLEARING.';

COMMENT ON COLUMN control.asset_class_book_policy.expense_low_value_posting_role_code IS
    'Resolved posting role for AD.asset_posting_target = ''expense''. '
    'Routes the GL hit when PIL.asset_treatment=''expense_low_value'' '
    '(under capitalization threshold per asset_class.capitalization_threshold). '
    'Convention: <CLASS_CODE>_LOW_VALUE_EXPENSE.';


-- =============================================================================
-- End of 01z_asset_class_book_policy_clearing_roles.sql
-- =============================================================================
