-- Canonical posting roles only. Compatibility aliases intentionally remain
-- outside the desired-state database model.
INSERT INTO control.lookup_domain (
    code, name, description, source_schema, is_extensible,
    metadata, status, created_by
)
VALUES (
    'finance.posting_role', 'Finance Posting Role',
    'Canonical semantic account roles emitted by accounting and finance policies.',
    'control', true, '{"canonical":true}'::jsonb, 'active',
    '00000000-0000-0000-0000-000000000000'::uuid
)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    source_schema = EXCLUDED.source_schema,
    is_extensible = EXCLUDED.is_extensible,
    metadata = EXCLUDED.metadata,
    status = 'active';

INSERT INTO control.lookup_value (
    tenant_id, code, name, domain_code, description, category,
    sort_order, is_system, metadata, status, created_by
)
SELECT NULL, v.code, v.name, 'finance.posting_role', v.description,
       v.category, v.sort_order, true,
       jsonb_build_object(
           'normal_balance', v.normal_balance,
           'mandatory_for_readiness', v.mandatory,
           'canonical', true
       ),
       'active', '00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('operating_expense','Operating Expense','Operating expense determined by the selected accounting profile.','general_ledger','debit',false,10::smallint),
    ('inventory_asset','Inventory Asset','Inventory capitalization account.','inventory','debit',false,20::smallint),
    ('fixed_asset_acquisition','Fixed Asset Acquisition','General fixed-asset acquisition account.','fixed_assets','debit',false,30::smallint),
    ('revenue','Revenue','Primary customer revenue account.','revenue','credit',false,40::smallint),
    ('cost_of_goods_sold','Cost of Goods Sold','Expense recognized for delivered inventory.','revenue','debit',false,50::smallint),
    ('ar_trade_receivable','AR Trade Receivable','Trade customer receivable.','receivables','debit',true,60::smallint),
    ('ap_trade_payable','AP Trade Payable','Trade supplier liability.','payables','credit',true,100::smallint),
    ('ap_material_payable','AP Material Payable','Material supplier liability.','payables','credit',false,110::smallint),
    ('ap_clearing','AP Clearing','Accounts-payable settlement clearing.','payables','either',true,120::smallint),
    ('ap_retention_payable','AP Retention Payable','Supplier retention liability.','payables','credit',false,130::smallint),
    ('ap_advance_recovery','AP Advance Recovery','Supplier advance recovery.','payables','credit',false,140::smallint),
    ('ar_clearing','AR Clearing','Accounts-receivable settlement clearing.','receivables','either',false,200::smallint),
    ('input_tax_recoverable','Input Tax Recoverable','Recoverable input VAT or GST.','tax','debit',false,300::smallint),
    ('output_tax_payable','Output Tax Payable','Collected output VAT or GST.','tax','credit',false,310::smallint),
    ('input_tax_nonrecoverable','Input Tax Nonrecoverable','Tax charged to expense or asset cost.','tax','debit',false,320::smallint),
    ('reverse_charge_input','Reverse Charge Input','Self-assessed reverse-charge input.','tax','debit',false,330::smallint),
    ('reverse_charge_output','Reverse Charge Output','Self-assessed reverse-charge output.','tax','credit',false,340::smallint),
    ('wht_payable','Withholding Tax Payable','Withholding tax liability.','tax','credit',false,350::smallint),
    ('wht_receivable','Withholding Tax Receivable','Withholding tax credit receivable.','tax','debit',false,360::smallint),
    ('tax_rounding_variance','Tax Rounding Variance','Tax calculation rounding difference.','tax','either',false,370::smallint),
    ('tax_suspense','Tax Suspense','Unresolved tax amount.','tax','either',false,380::smallint),
    ('bank_settlement','Bank Settlement','Cash or bank settlement.','banking','either',false,400::smallint),
    ('bank_fee','Bank Fee','Bank and transaction charges.','payments','debit',false,410::smallint),
    ('discount_earned','Discount Earned','Early-payment discount earned.','payments','credit',false,420::smallint),
    ('discount_given','Discount Given','Settlement discount given.','payments','debit',false,430::smallint),
    ('fx_gain','FX Gain','Settlement foreign-exchange gain.','general_ledger','credit',false,440::smallint),
    ('fx_loss','FX Loss','Settlement foreign-exchange loss.','general_ledger','debit',false,450::smallint),
    ('payment_suspense','Payment Suspense','Unmatched payment suspense.','payments','either',true,460::smallint)
) AS v(code, name, description, category, normal_balance, mandatory, sort_order)
ON CONFLICT (domain_code, code) WHERE tenant_id IS NULL DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    sort_order = EXCLUDED.sort_order,
    metadata = EXCLUDED.metadata,
    status = 'active';
