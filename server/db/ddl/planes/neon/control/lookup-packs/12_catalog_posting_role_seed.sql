-- seed-contract-version: 1
-- seed-pack: neon.control.lookup.catalog_posting_role
-- seed-pack-version: 1.0.0
-- seed-dataset: neon.control.lookup.catalog_posting_role
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Wave 3 legacy lookup rationalization","publisher":"Athyper","source_version":"wave3-lookup-ledger.v1","retrieved_at":"2026-08-03","license":"internal"}
-- seed-plane: neon
-- seed-tenant-scope: none
-- seed-natural-key: control.lookup_domain(code);control.lookup_value(domain_code,code)
-- seed-cross-file-ids: false
-- seed-id-strategy: database-generated
-- seed-expected-row-count: exact:71
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- source-files: server/db/seed/platform/000_lookups/LookupDomain/finance/posting_role.sql

DO $guard$ BEGIN
  IF current_setting('app.database_plane', true) <> 'neon' THEN
    RAISE EXCEPTION 'neon.control.lookup.catalog_posting_role: invalid database plane';
  END IF;
END $guard$;

INSERT INTO control.lookup_domain
  (code, name, description, source_schema, is_extensible, metadata, status, created_by)
VALUES
  ('finance.posting_role', 'Finance Posting Role', 'Canonical semantic account roles emitted by accounting and finance policies.', 'control', true, '{"canonical":true}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (code) DO UPDATE SET
  name = excluded.name, description = excluded.description,
  source_schema = excluded.source_schema, is_extensible = excluded.is_extensible,
  metadata = excluded.metadata, status = excluded.status,
  updated_at = now(), updated_by = excluded.created_by
WHERE (control.lookup_domain.name, control.lookup_domain.description,
       control.lookup_domain.source_schema, control.lookup_domain.is_extensible,
       control.lookup_domain.metadata, control.lookup_domain.status)
  IS DISTINCT FROM
      (excluded.name, excluded.description, excluded.source_schema,
       excluded.is_extensible, excluded.metadata, excluded.status);

INSERT INTO control.lookup_value
  (code, name, domain_code, description, category, sort_order, is_system, metadata, status, created_by)
VALUES
  ('operating_expense', 'Operating Expense', 'finance.posting_role', 'Operating expense determined by the selected accounting profile.', 'general_ledger', 10, true, '{"canonical":true,"normal_balance":"debit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('inventory_asset', 'Inventory Asset', 'finance.posting_role', 'Inventory capitalization account.', 'inventory', 20, true, '{"canonical":true,"normal_balance":"debit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fixed_asset_acquisition', 'Fixed Asset Acquisition', 'finance.posting_role', 'General fixed-asset acquisition account.', 'fixed_assets', 30, true, '{"canonical":true,"normal_balance":"debit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('revenue', 'Revenue', 'finance.posting_role', 'Primary customer revenue account.', 'revenue', 40, true, '{"canonical":true,"normal_balance":"credit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('cost_of_goods_sold', 'Cost of Goods Sold', 'finance.posting_role', 'Expense recognized for delivered inventory.', 'revenue', 50, true, '{"canonical":true,"normal_balance":"debit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('ar_trade_receivable', 'AR Trade Receivable', 'finance.posting_role', 'Trade customer receivable.', 'receivables', 60, true, '{"canonical":true,"normal_balance":"debit","mandatory_for_readiness":true}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('ap_trade_payable', 'AP Trade Payable', 'finance.posting_role', 'Trade supplier liability.', 'payables', 100, true, '{"canonical":true,"normal_balance":"credit","mandatory_for_readiness":true}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('ap_material_payable', 'AP Material Payable', 'finance.posting_role', 'Material supplier liability.', 'payables', 110, true, '{"canonical":true,"normal_balance":"credit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('ap_clearing', 'AP Clearing', 'finance.posting_role', 'Accounts-payable settlement clearing.', 'payables', 120, true, '{"canonical":true,"normal_balance":"either","mandatory_for_readiness":true}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('ap_retention_payable', 'AP Retention Payable', 'finance.posting_role', 'Supplier retention liability.', 'payables', 130, true, '{"canonical":true,"normal_balance":"credit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('ap_advance_recovery', 'AP Advance Recovery', 'finance.posting_role', 'Supplier advance recovery.', 'payables', 140, true, '{"canonical":true,"normal_balance":"credit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('ar_clearing', 'AR Clearing', 'finance.posting_role', 'Accounts-receivable settlement clearing.', 'receivables', 200, true, '{"canonical":true,"normal_balance":"either","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('input_tax_recoverable', 'Input Tax Recoverable', 'finance.posting_role', 'Recoverable input VAT or GST.', 'tax', 300, true, '{"canonical":true,"normal_balance":"debit","readiness_criticality":"required_when_used","mandatory_for_readiness":false,"valid_account_characteristics":{"postable":true,"account_types":["asset"]}}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('output_tax_payable', 'Output Tax Payable', 'finance.posting_role', 'Collected output VAT or GST.', 'tax', 310, true, '{"canonical":true,"normal_balance":"credit","readiness_criticality":"required_when_used","mandatory_for_readiness":false,"valid_account_characteristics":{"postable":true,"account_types":["liability"]}}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('input_tax_nonrecoverable', 'Input Tax Nonrecoverable', 'finance.posting_role', 'Tax charged to expense or asset cost.', 'tax', 320, true, '{"canonical":true,"normal_balance":"debit","readiness_criticality":"required_when_used","mandatory_for_readiness":false,"valid_account_characteristics":{"postable":true,"account_types":["expense","asset"]}}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('reverse_charge_input', 'Reverse Charge Input', 'finance.posting_role', 'Self-assessed reverse-charge input.', 'tax', 330, true, '{"canonical":true,"normal_balance":"debit","readiness_criticality":"required_when_used","mandatory_for_readiness":false,"valid_account_characteristics":{"postable":true,"account_types":["asset"]}}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('reverse_charge_output', 'Reverse Charge Output', 'finance.posting_role', 'Self-assessed reverse-charge output.', 'tax', 340, true, '{"canonical":true,"normal_balance":"credit","readiness_criticality":"required_when_used","mandatory_for_readiness":false,"valid_account_characteristics":{"postable":true,"account_types":["liability"]}}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('wht_payable', 'Withholding Tax Payable', 'finance.posting_role', 'Withholding tax liability.', 'tax', 350, true, '{"canonical":true,"normal_balance":"credit","readiness_criticality":"required_when_used","mandatory_for_readiness":false,"valid_account_characteristics":{"postable":true,"account_types":["liability"]}}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('wht_receivable', 'Withholding Tax Receivable', 'finance.posting_role', 'Withholding tax credit receivable.', 'tax', 360, true, '{"canonical":true,"normal_balance":"debit","readiness_criticality":"required_when_used","mandatory_for_readiness":false,"valid_account_characteristics":{"postable":true,"account_types":["asset"]}}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('tax_rounding_variance', 'Tax Rounding Variance', 'finance.posting_role', 'Tax calculation rounding difference.', 'tax', 370, true, '{"canonical":true,"normal_balance":"either","readiness_criticality":"required_when_used","mandatory_for_readiness":false,"valid_account_characteristics":{"postable":true,"account_types":["expense","revenue"]}}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('tax_suspense', 'Tax Suspense', 'finance.posting_role', 'Unresolved tax amount.', 'tax', 380, true, '{"canonical":true,"normal_balance":"either","readiness_criticality":"required_when_used","mandatory_for_readiness":false,"valid_account_characteristics":{"postable":true,"account_types":["asset","liability"]}}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('bank_settlement', 'Bank Settlement', 'finance.posting_role', 'Cash or bank settlement.', 'banking', 400, true, '{"canonical":true,"normal_balance":"debit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('bank_fee', 'Bank Fee', 'finance.posting_role', 'Bank and transaction charges.', 'payments', 410, true, '{"canonical":true,"normal_balance":"debit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('wallet_settlement', 'Wallet Settlement', 'finance.posting_role', 'Digital wallet settlement', 'banking', 410, true, '{"canonical":true,"normal_balance":"debit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('discount_earned', 'Discount Earned', 'finance.posting_role', 'Early-payment discount earned.', 'payments', 420, true, '{"canonical":true,"normal_balance":"credit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('discount_given', 'Discount Given', 'finance.posting_role', 'Settlement discount given.', 'payments', 430, true, '{"canonical":true,"normal_balance":"debit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fx_gain', 'FX Gain', 'finance.posting_role', 'Settlement foreign-exchange gain.', 'general_ledger', 440, true, '{"canonical":true,"normal_balance":"credit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fx_loss', 'FX Loss', 'finance.posting_role', 'Settlement foreign-exchange loss.', 'general_ledger', 450, true, '{"canonical":true,"normal_balance":"debit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('payment_suspense', 'Payment Suspense', 'finance.posting_role', 'Unmatched payment suspense.', 'payments', 460, true, '{"canonical":true,"normal_balance":"either","mandatory_for_readiness":true}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('gateway_fee', 'Gateway Fee', 'finance.posting_role', 'Payment gateway processing fee', 'payments', 510, true, '{"canonical":true,"normal_balance":"debit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('card_fee', 'Card Processing Fee', 'finance.posting_role', 'Card processing fee', 'payments', 520, true, '{"canonical":true,"normal_balance":"debit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('chargeback', 'Chargeback', 'finance.posting_role', 'Payment chargeback or dispute', 'payments', 570, true, '{"canonical":true,"normal_balance":"debit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('prepaid_clearing', 'Prepaid Clearing', 'finance.posting_role', 'Stored-value clearing', 'payments', 590, true, '{"canonical":true,"normal_balance":"either","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('upi_settlement', 'UPI Settlement', 'finance.posting_role', 'UPI settlement', 'payments', 600, true, '{"canonical":true,"normal_balance":"either","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fa_acq_land', 'FA Acquisition - Land', 'finance.posting_role', 'Land acquisition cost', 'fixed_assets', 700, true, '{"canonical":true,"normal_balance":"debit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fa_acq_bldg', 'FA Acquisition - Buildings', 'finance.posting_role', 'Building acquisition cost', 'fixed_assets', 701, true, '{"canonical":true,"normal_balance":"debit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fa_acq_plant', 'FA Acquisition - Plant', 'finance.posting_role', 'Plant acquisition cost', 'fixed_assets', 702, true, '{"canonical":true,"normal_balance":"debit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fa_acq_veh', 'FA Acquisition - Vehicles', 'finance.posting_role', 'Vehicle acquisition cost', 'fixed_assets', 703, true, '{"canonical":true,"normal_balance":"debit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fa_acq_it', 'FA Acquisition - IT', 'finance.posting_role', 'IT equipment acquisition cost', 'fixed_assets', 704, true, '{"canonical":true,"normal_balance":"debit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fa_acq_furn', 'FA Acquisition - Furniture', 'finance.posting_role', 'Furniture acquisition cost', 'fixed_assets', 705, true, '{"canonical":true,"normal_balance":"debit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fa_acq_lhi', 'FA Acquisition - Leasehold Improvements', 'finance.posting_role', 'Leasehold improvement acquisition cost', 'fixed_assets', 706, true, '{"canonical":true,"normal_balance":"debit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fa_acq_tools', 'FA Acquisition - Tools', 'finance.posting_role', 'Tools acquisition cost', 'fixed_assets', 707, true, '{"canonical":true,"normal_balance":"debit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fa_acq_sw', 'FA Acquisition - Software', 'finance.posting_role', 'Software acquisition cost', 'fixed_assets', 708, true, '{"canonical":true,"normal_balance":"debit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fa_acq_rou_prop', 'FA Acquisition - ROU Property', 'finance.posting_role', 'ROU property acquisition cost', 'fixed_assets', 709, true, '{"canonical":true,"normal_balance":"debit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fa_acq_rou_equip', 'FA Acquisition - ROU Equipment', 'finance.posting_role', 'ROU equipment acquisition cost', 'fixed_assets', 710, true, '{"canonical":true,"normal_balance":"debit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fa_accum_bldg', 'Accumulated Depreciation - Buildings', 'finance.posting_role', 'Building accumulated depreciation', 'fixed_assets', 720, true, '{"canonical":true,"normal_balance":"credit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fa_accum_plant', 'Accumulated Depreciation - Plant', 'finance.posting_role', 'Plant accumulated depreciation', 'fixed_assets', 721, true, '{"canonical":true,"normal_balance":"credit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fa_accum_veh', 'Accumulated Depreciation - Vehicles', 'finance.posting_role', 'Vehicle accumulated depreciation', 'fixed_assets', 722, true, '{"canonical":true,"normal_balance":"credit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fa_accum_it', 'Accumulated Depreciation - IT', 'finance.posting_role', 'IT accumulated depreciation', 'fixed_assets', 723, true, '{"canonical":true,"normal_balance":"credit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fa_accum_furn', 'Accumulated Depreciation - Furniture', 'finance.posting_role', 'Furniture accumulated depreciation', 'fixed_assets', 724, true, '{"canonical":true,"normal_balance":"credit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fa_accum_lhi', 'Accumulated Depreciation - Leasehold Improvements', 'finance.posting_role', 'Leasehold improvement accumulated depreciation', 'fixed_assets', 725, true, '{"canonical":true,"normal_balance":"credit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fa_accum_tools', 'Accumulated Depreciation - Tools', 'finance.posting_role', 'Tools accumulated depreciation', 'fixed_assets', 726, true, '{"canonical":true,"normal_balance":"credit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fa_accum_rou', 'Accumulated Depreciation - ROU', 'finance.posting_role', 'ROU accumulated depreciation', 'fixed_assets', 727, true, '{"canonical":true,"normal_balance":"credit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fa_amort_sw', 'Accumulated Amortization - Software', 'finance.posting_role', 'Software accumulated amortization', 'fixed_assets', 728, true, '{"canonical":true,"normal_balance":"credit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fa_depr_bldg', 'Depreciation Expense - Buildings', 'finance.posting_role', 'Building depreciation expense', 'fixed_assets', 740, true, '{"canonical":true,"normal_balance":"debit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fa_depr_plant', 'Depreciation Expense - Plant', 'finance.posting_role', 'Plant depreciation expense', 'fixed_assets', 741, true, '{"canonical":true,"normal_balance":"debit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fa_depr_veh', 'Depreciation Expense - Vehicles', 'finance.posting_role', 'Vehicle depreciation expense', 'fixed_assets', 742, true, '{"canonical":true,"normal_balance":"debit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fa_depr_it', 'Depreciation Expense - IT', 'finance.posting_role', 'IT depreciation expense', 'fixed_assets', 743, true, '{"canonical":true,"normal_balance":"debit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fa_depr_furn', 'Depreciation Expense - Furniture', 'finance.posting_role', 'Furniture depreciation expense', 'fixed_assets', 744, true, '{"canonical":true,"normal_balance":"debit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fa_depr_lhi', 'Depreciation Expense - Leasehold Improvements', 'finance.posting_role', 'Leasehold improvement depreciation expense', 'fixed_assets', 745, true, '{"canonical":true,"normal_balance":"debit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fa_depr_tools', 'Depreciation Expense - Tools', 'finance.posting_role', 'Tools depreciation expense', 'fixed_assets', 746, true, '{"canonical":true,"normal_balance":"debit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fa_depr_rou', 'Depreciation Expense - ROU', 'finance.posting_role', 'ROU depreciation expense', 'fixed_assets', 747, true, '{"canonical":true,"normal_balance":"debit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fa_depr_amort', 'Amortization Expense - Software', 'finance.posting_role', 'Software amortization expense', 'fixed_assets', 748, true, '{"canonical":true,"normal_balance":"debit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fa_gainloss_disposal', 'FA Disposal Gain or Loss', 'finance.posting_role', 'Fixed-asset disposal result', 'fixed_assets', 760, true, '{"canonical":true,"normal_balance":"either","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fa_cwip', 'Capital Work in Progress', 'finance.posting_role', 'Capital work in progress', 'fixed_assets', 761, true, '{"canonical":true,"normal_balance":"debit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fa_impair_exp', 'FA Impairment Expense', 'finance.posting_role', 'Fixed-asset impairment expense', 'fixed_assets', 762, true, '{"canonical":true,"normal_balance":"debit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fa_impair_rsv', 'FA Impairment Reserve', 'finance.posting_role', 'Fixed-asset impairment reserve', 'fixed_assets', 763, true, '{"canonical":true,"normal_balance":"credit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fa_reval_surplus_land', 'Revaluation Surplus - Land', 'finance.posting_role', 'Land revaluation surplus', 'fixed_assets', 764, true, '{"canonical":true,"normal_balance":"credit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fa_reval_loss_land', 'Revaluation Loss - Land', 'finance.posting_role', 'Land revaluation loss', 'fixed_assets', 765, true, '{"canonical":true,"normal_balance":"debit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fa_reval_surplus_bldg', 'Revaluation Surplus - Buildings', 'finance.posting_role', 'Building revaluation surplus', 'fixed_assets', 766, true, '{"canonical":true,"normal_balance":"credit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
  ('fa_reval_loss_bldg', 'Revaluation Loss - Buildings', 'finance.posting_role', 'Building revaluation loss', 'fixed_assets', 767, true, '{"canonical":true,"normal_balance":"debit","mandatory_for_readiness":false}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (domain_code, code) WHERE tenant_id IS NULL DO UPDATE SET
  name = excluded.name, description = excluded.description, category = excluded.category,
  sort_order = excluded.sort_order, is_system = excluded.is_system,
  metadata = excluded.metadata, status = excluded.status,
  updated_at = now(), updated_by = excluded.created_by
WHERE (control.lookup_value.name, control.lookup_value.description,
       control.lookup_value.category, control.lookup_value.sort_order,
       control.lookup_value.is_system, control.lookup_value.metadata,
       control.lookup_value.status)
  IS DISTINCT FROM
      (excluded.name, excluded.description, excluded.category, excluded.sort_order,
       excluded.is_system, excluded.metadata, excluded.status);

-- seed-assertion: expected-count
-- seed-assertion: orphan
-- seed-assertion: uniqueness
-- seed-assertion: semantic
DO $assertions$ BEGIN
  IF (SELECT count(*) FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['finance.posting_role'])) <> 71 THEN
    RAISE EXCEPTION 'neon.control.lookup.catalog_posting_role: expected-count assertion failed';
  END IF;
  IF EXISTS (SELECT 1 FROM control.lookup_value v LEFT JOIN control.lookup_domain d ON d.code=v.domain_code WHERE v.tenant_id IS NULL AND v.domain_code = ANY(ARRAY['finance.posting_role']) AND d.id IS NULL) THEN
    RAISE EXCEPTION 'neon.control.lookup.catalog_posting_role: orphan assertion failed';
  END IF;
  IF EXISTS (SELECT domain_code, code FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['finance.posting_role']) GROUP BY domain_code, code HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'neon.control.lookup.catalog_posting_role: uniqueness assertion failed';
  END IF;
  IF EXISTS (SELECT 1 FROM control.lookup_value WHERE tenant_id IS NULL AND domain_code = ANY(ARRAY['finance.posting_role']) AND (code <> lower(btrim(code)) OR btrim(name) = '' OR status NOT IN ('active','inactive','deprecated'))) THEN
    RAISE EXCEPTION 'neon.control.lookup.catalog_posting_role: semantic assertion failed';
  END IF;
END $assertions$;
