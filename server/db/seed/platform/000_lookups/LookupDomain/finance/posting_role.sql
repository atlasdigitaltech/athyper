-- Canonical, cross-module posting-role vocabulary. Legacy module-specific
-- domains remain available as compatibility pickers, but runtime resolution
-- always canonicalizes to finance.posting_role.
INSERT INTO control.lookup_domain
    (code, name, description, source_schema, is_extensible, metadata, status, created_by)
SELECT 'finance.posting_role', 'Finance posting role',
       'Canonical role vocabulary used by all finance posting engines.',
       'control', true, '{"canonical":true,"version":1}'::jsonb, 'active',
       '00000000-0000-0000-0000-000000000000'::uuid
WHERE NOT EXISTS (SELECT 1 FROM control.lookup_domain WHERE code = 'finance.posting_role');

INSERT INTO control.lookup_value
    (code, name, domain_code, description, category, sort_order, is_system, metadata, status, created_by)
SELECT v.code, v.name, 'finance.posting_role', v.description, v.category, v.sort_order,
       true,
       jsonb_build_object('normal_balance', v.normal_balance,
                          'mandatory_for_readiness', v.mandatory_for_readiness,
                          'canonical', true),
       'active', '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('ap_trade_payable','AP Trade Payable','Trade supplier liability','payables','credit',true,100),
    ('ap_material_payable','AP Material Payable','Material supplier liability','payables','credit',false,110),
    ('ap_clearing','AP Clearing','Accounts payable settlement clearing','payables','either',true,120),
    ('ap_retention_payable','AP Retention Payable','Supplier retention liability','payables','credit',false,130),
    ('ap_advance_recovery','AP Advance Recovery','Supplier advance recovery','payables','credit',false,140),
    ('ar_clearing','AR Clearing','Accounts receivable settlement clearing','receivables','either',false,200),
    ('input_tax_recoverable','Input Tax Recoverable','Recoverable input VAT or GST','tax','debit',false,300),
    ('wht_payable','Withholding Tax Payable','Withholding tax liability','tax','credit',false,310),
    ('bank_settlement','Bank Settlement','Cash or bank settlement','banking','debit',false,400),
    ('wallet_settlement','Wallet Settlement','Digital wallet settlement','banking','debit',false,410),
    ('bank_fee','Bank Fee','Bank and transaction charges','payments','debit',false,500),
    ('gateway_fee','Gateway Fee','Payment gateway processing fee','payments','debit',false,510),
    ('card_fee','Card Processing Fee','Card processing fee','payments','debit',false,520),
    ('discount_earned','Discount Earned','Early-payment discount earned','payments','credit',false,530),
    ('discount_given','Discount Given','Settlement discount given','payments','debit',false,540),
    ('fx_gain','FX Gain','Settlement foreign-exchange gain','general_ledger','credit',false,550),
    ('fx_loss','FX Loss','Settlement foreign-exchange loss','general_ledger','debit',false,560),
    ('chargeback','Chargeback','Payment chargeback or dispute','payments','debit',false,570),
    ('payment_suspense','Payment Suspense','Unmatched payment suspense','payments','either',true,580),
    ('prepaid_clearing','Prepaid Clearing','Stored-value clearing','payments','either',false,590),
    ('upi_settlement','UPI Settlement','UPI settlement','payments','either',false,600),
    ('fa_acq_land','FA Acquisition - Land','Land acquisition cost','fixed_assets','debit',false,700),
    ('fa_acq_bldg','FA Acquisition - Buildings','Building acquisition cost','fixed_assets','debit',false,701),
    ('fa_acq_plant','FA Acquisition - Plant','Plant acquisition cost','fixed_assets','debit',false,702),
    ('fa_acq_veh','FA Acquisition - Vehicles','Vehicle acquisition cost','fixed_assets','debit',false,703),
    ('fa_acq_it','FA Acquisition - IT','IT equipment acquisition cost','fixed_assets','debit',false,704),
    ('fa_acq_furn','FA Acquisition - Furniture','Furniture acquisition cost','fixed_assets','debit',false,705),
    ('fa_acq_lhi','FA Acquisition - Leasehold Improvements','Leasehold improvement acquisition cost','fixed_assets','debit',false,706),
    ('fa_acq_tools','FA Acquisition - Tools','Tools acquisition cost','fixed_assets','debit',false,707),
    ('fa_acq_sw','FA Acquisition - Software','Software acquisition cost','fixed_assets','debit',false,708),
    ('fa_acq_rou_prop','FA Acquisition - ROU Property','ROU property acquisition cost','fixed_assets','debit',false,709),
    ('fa_acq_rou_equip','FA Acquisition - ROU Equipment','ROU equipment acquisition cost','fixed_assets','debit',false,710),
    ('fa_accum_bldg','Accumulated Depreciation - Buildings','Building accumulated depreciation','fixed_assets','credit',false,720),
    ('fa_accum_plant','Accumulated Depreciation - Plant','Plant accumulated depreciation','fixed_assets','credit',false,721),
    ('fa_accum_veh','Accumulated Depreciation - Vehicles','Vehicle accumulated depreciation','fixed_assets','credit',false,722),
    ('fa_accum_it','Accumulated Depreciation - IT','IT accumulated depreciation','fixed_assets','credit',false,723),
    ('fa_accum_furn','Accumulated Depreciation - Furniture','Furniture accumulated depreciation','fixed_assets','credit',false,724),
    ('fa_accum_lhi','Accumulated Depreciation - Leasehold Improvements','Leasehold improvement accumulated depreciation','fixed_assets','credit',false,725),
    ('fa_accum_tools','Accumulated Depreciation - Tools','Tools accumulated depreciation','fixed_assets','credit',false,726),
    ('fa_accum_rou','Accumulated Depreciation - ROU','ROU accumulated depreciation','fixed_assets','credit',false,727),
    ('fa_amort_sw','Accumulated Amortization - Software','Software accumulated amortization','fixed_assets','credit',false,728),
    ('fa_depr_bldg','Depreciation Expense - Buildings','Building depreciation expense','fixed_assets','debit',false,740),
    ('fa_depr_plant','Depreciation Expense - Plant','Plant depreciation expense','fixed_assets','debit',false,741),
    ('fa_depr_veh','Depreciation Expense - Vehicles','Vehicle depreciation expense','fixed_assets','debit',false,742),
    ('fa_depr_it','Depreciation Expense - IT','IT depreciation expense','fixed_assets','debit',false,743),
    ('fa_depr_furn','Depreciation Expense - Furniture','Furniture depreciation expense','fixed_assets','debit',false,744),
    ('fa_depr_lhi','Depreciation Expense - Leasehold Improvements','Leasehold improvement depreciation expense','fixed_assets','debit',false,745),
    ('fa_depr_tools','Depreciation Expense - Tools','Tools depreciation expense','fixed_assets','debit',false,746),
    ('fa_depr_rou','Depreciation Expense - ROU','ROU depreciation expense','fixed_assets','debit',false,747),
    ('fa_depr_amort','Amortization Expense - Software','Software amortization expense','fixed_assets','debit',false,748),
    ('fa_gainloss_disposal','FA Disposal Gain or Loss','Fixed-asset disposal result','fixed_assets','either',false,760),
    ('fa_cwip','Capital Work in Progress','Capital work in progress','fixed_assets','debit',false,761),
    ('fa_impair_exp','FA Impairment Expense','Fixed-asset impairment expense','fixed_assets','debit',false,762),
    ('fa_impair_rsv','FA Impairment Reserve','Fixed-asset impairment reserve','fixed_assets','credit',false,763),
    ('fa_reval_surplus_land','Revaluation Surplus - Land','Land revaluation surplus','fixed_assets','credit',false,764),
    ('fa_reval_loss_land','Revaluation Loss - Land','Land revaluation loss','fixed_assets','debit',false,765),
    ('fa_reval_surplus_bldg','Revaluation Surplus - Buildings','Building revaluation surplus','fixed_assets','credit',false,766),
    ('fa_reval_loss_bldg','Revaluation Loss - Buildings','Building revaluation loss','fixed_assets','debit',false,767)
) AS v(code, name, description, category, normal_balance, mandatory_for_readiness, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
     WHERE x.domain_code = 'finance.posting_role' AND x.code = v.code AND x.tenant_id IS NULL
);

-- Enrich values that may have been migrated from the legacy payment domain
-- before this canonical seed was applied.
UPDATE control.lookup_value lv
   SET category = v.category,
       metadata = lv.metadata || jsonb_build_object(
         'normal_balance', v.normal_balance,
         'mandatory_for_readiness', v.mandatory,
         'canonical', true
       ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'::uuid
  FROM (VALUES
    ('ap_trade_payable','payables','credit',true),
    ('ap_material_payable','payables','credit',false),
    ('ap_clearing','payables','either',true),
    ('ap_retention_payable','payables','credit',false),
    ('ap_advance_recovery','payables','credit',false),
    ('ar_clearing','receivables','either',false),
    ('input_tax_recoverable','tax','debit',false),
    ('wht_payable','tax','credit',false),
    ('bank_settlement','banking','debit',false),
    ('wallet_settlement','banking','debit',false),
    ('bank_fee','payments','debit',false),
    ('gateway_fee','payments','debit',false),
    ('card_fee','payments','debit',false),
    ('discount_earned','payments','credit',false),
    ('discount_given','payments','debit',false),
    ('fx_gain','general_ledger','credit',false),
    ('fx_loss','general_ledger','debit',false),
    ('chargeback','payments','debit',false),
    ('payment_suspense','payments','either',true),
    ('prepaid_clearing','payments','either',false),
    ('upi_settlement','payments','either',false)
  ) AS v(code, category, normal_balance, mandatory)
 WHERE lv.domain_code = 'finance.posting_role'
   AND lv.tenant_id IS NULL
   AND lv.code = v.code;

INSERT INTO control.posting_role_alias
    (alias_code, canonical_role_code, source_domain_code, description, metadata, status, created_by)
SELECT v.alias_code, v.canonical_role_code, v.source_domain_code,
       'Backward-compatible posting-role alias.', '{"compatibility":true}'::jsonb,
       'active', '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('accounts_payable','ap_trade_payable',NULL::text),
    ('vat_input','input_tax_recoverable',NULL::text),
    ('withholding_tax_payable','wht_payable',NULL::text),
    ('cash_at_bank','bank_settlement',NULL::text)
) AS v(alias_code, canonical_role_code, source_domain_code)
WHERE NOT EXISTS (
    SELECT 1 FROM control.posting_role_alias a
     WHERE a.tenant_id IS NULL AND a.alias_code = v.alias_code
       AND a.source_domain_code IS NOT DISTINCT FROM v.source_domain_code
);
