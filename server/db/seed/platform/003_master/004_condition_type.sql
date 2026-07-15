-- System pricing-component condition catalog (tenant_id=NULL, is_system=true → all tenants).
-- Drives document.pricing_component.condition_type_id; also the back-pointer target for
-- master.tax_type.condition_type_id (jurisdictional WHT variants like TDS/EWT/FWT live there).

INSERT INTO master.condition_type (
    tenant_id, code, name, description,
    term_type, term_sub_type,
    default_basis, default_rate, default_amount,
    default_apportion_basis,
    is_taxable, is_apportionable, applies_to_classes,
    default_cost_effect, default_posting_pattern,
    default_distribution_policy, default_capitalization_policy,
    default_posting_role_code,
    is_system, sort_order,
    metadata, status,
    created_by
)
SELECT NULL,
       v.code, v.name, v.description,
       v.term_type, v.term_sub_type,
       v.default_basis, v.default_rate, v.default_amount,
       v.default_apportion_basis,
       v.is_taxable, v.is_apportionable, v.applies_to_classes::jsonb,
       CASE
         WHEN v.code = 'DISC_COMMERCIAL' THEN 'REDUCE_COST'
         WHEN v.code = 'CHG_FREIGHT_IN' THEN 'ADD_TO_COST'
         WHEN v.code IN ('CHG_CUSTOMS_DUTY') THEN 'ADD_TO_COST'
         WHEN v.term_type = 'tax' AND v.code IN ('TAX_SALES','TAX_PST','TAX_SURCHARGE') THEN 'ADD_TO_COST'
         ELSE 'NO_COST_EFFECT'
       END,
       CASE
         WHEN v.code = 'DISC_COMMERCIAL' THEN 'INHERIT_LINE_ACCOUNT'
         WHEN v.code = 'DISC_PROMPT_PAYMENT' THEN 'SEPARATE_ACCOUNT'
         WHEN v.code IN ('CHG_FREIGHT_IN','CHG_CUSTOMS_DUTY') THEN 'INHERIT_LINE_ACCOUNT'
         WHEN v.term_type = 'charge' THEN 'SEPARATE_ACCOUNT'
         WHEN v.code = 'TAX_USE' THEN 'TAX_SELF_ASSESSED'
         WHEN v.term_type = 'tax' AND v.code IN ('TAX_SALES','TAX_PST','TAX_SURCHARGE') THEN 'INHERIT_LINE_ACCOUNT'
         WHEN v.term_type = 'tax' THEN 'TAX_RECOVERABLE'
         WHEN v.term_type IN ('withholding','retention') THEN 'LIABILITY_SPLIT'
         ELSE 'MEMO_ONLY'
       END,
       CASE
         WHEN v.code = 'CHG_FREIGHT_IN' THEN 'APPORTION_TO_LINES'
         WHEN v.code = 'DISC_COMMERCIAL' OR v.code = 'CHG_CUSTOMS_DUTY'
           OR (v.term_type = 'tax' AND v.code IN ('TAX_SALES','TAX_PST','TAX_SURCHARGE'))
           THEN 'INHERIT_LINE'
         ELSE 'NO_COST_DISTRIBUTION'
       END,
       CASE WHEN v.code IN ('CHG_FREIGHT_IN','CHG_CUSTOMS_DUTY')
              OR v.code = 'DISC_COMMERCIAL'
              OR (v.term_type = 'tax' AND v.code IN ('TAX_SALES','TAX_PST','TAX_SURCHARGE'))
            THEN 'FOLLOW_LINE' ELSE 'NEVER_CAPITALIZE' END,
       CASE
         WHEN v.code = 'DISC_PROMPT_PAYMENT' THEN 'purchase_discount'
         WHEN v.term_type = 'withholding' THEN 'wht_payable'
         WHEN v.term_type = 'retention' THEN 'ap_retention_payable'
         WHEN v.term_type = 'tax' AND v.code NOT IN ('TAX_SALES','TAX_PST','TAX_SURCHARGE','TAX_USE') THEN 'input_tax_recoverable'
         ELSE NULL
       END,
       true, v.sort_order,
       jsonb_build_object('_seed', jsonb_build_object('pack','004_condition_type','version','2.0.0')),
       'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES

    -- DISCOUNTS (sign − in engine)
    ('DISC_COMMERCIAL',
     'Commercial Discount',
     'Vendor-extended commercial discount, applied as a percentage on the line subtotal.',
     'discount', NULL,
     'percent', 0.0, NULL,
     NULL,
     false, true,
     '["purchase_invoice","purchase_order","sales_invoice","sales_order"]',
     10::smallint),

    ('DISC_PROMPT_PAYMENT',
     'Prompt Payment Discount',
     'Early-settlement discount per payment-term clause; reduces payable amount.',
     'discount', 'settlement',
     'percent', 0.0, NULL,
     NULL,
     false, true,
     '["purchase_invoice","purchase_order","sales_invoice","sales_order"]',
     11::smallint),

    -- TAXES (sign + in engine; jurisdictional variants in master.tax_type)
    ('TAX_GST',
     'Goods and Services Tax',
     'GST kind. Jurisdictional variants (IN-CGST/SGST/IGST, SG-GST, CA-GST) classify into this kind.',
     'tax', NULL,
     'percent', 0.0, NULL,
     NULL,
     false, false,
     '["purchase_invoice","purchase_order","sales_invoice","sales_order"]',
     20::smallint),

    ('TAX_HST',
     'Harmonized Sales Tax',
     'HST kind (Canada). Combines federal + provincial portions in a single rate.',
     'tax', NULL,
     'percent', 0.0, NULL,
     NULL,
     false, false,
     '["purchase_invoice","purchase_order","sales_invoice","sales_order"]',
     21::smallint),

    ('TAX_PST',
     'Provincial Sales Tax',
     'Provincial Sales Tax (Canada). Non-recoverable in most provinces.',
     'tax', NULL,
     'percent', 0.0, NULL,
     NULL,
     false, false,
     '["purchase_invoice","purchase_order","sales_invoice","sales_order"]',
     22::smallint),

    ('TAX_SALES',
     'Sales Tax',
     'General Sales Tax kind (US state/local, MY-SST). Typically non-recoverable.',
     'tax', NULL,
     'percent', 0.0, NULL,
     NULL,
     false, false,
     '["purchase_invoice","purchase_order","sales_invoice","sales_order"]',
     23::smallint),

    ('TAX_USE',
     'Use Tax',
     'Self-assessed use tax on out-of-state purchases (US).',
     'tax', NULL,
     'percent', 0.0, NULL,
     NULL,
     false, false,
     '["purchase_invoice","purchase_order"]',
     24::smallint),

    ('TAX_VAT',
     'Value Added Tax',
     'VAT kind. Jurisdictional variants (AE-VAT, SA-VAT, DE-UST, GB-VAT, etc.) classify into this kind. Typically recoverable.',
     'tax', NULL,
     'percent', 0.0, NULL,
     NULL,
     false, false,
     '["purchase_invoice","purchase_order","sales_invoice","sales_order"]',
     25::smallint),

    ('TAX_SURCHARGE',
     'Cess / Surcharge',
     'Bucket for surcharge-style levies: Zakat (SA), Compensation Cess (IN), Mining Royalty (ZA), etc.',
     'tax', NULL,
     'percent', 0.0, NULL,
     NULL,
     false, false,
     '["purchase_invoice","purchase_order","sales_invoice","sales_order"]',
     26::smallint),

    -- WITHHOLDING (sign − in engine; jurisdictional WHT in tax_type)
    ('WHT_GENERIC',
     'Withholding Tax',
     'Withholding Tax kind. Jurisdictional variants (IN-TDS, IN-TCS, PH-EWT/FWT, US-WHT, etc.) classify into this kind. Section codes carried on the PC instance.',
     'withholding', NULL,
     'percent', 0.0, NULL,
     NULL,
     false, false,
     '["purchase_invoice"]',
     30::smallint),

    -- CHARGES (sign + in engine)
    ('CHG_FREIGHT_IN',
     'Freight In',
     'Inbound transportation charge from supplier to delivery point. Landed-cost component.',
     'charge', 'landed',
     'amount', NULL, 0.0,
     'value',
     true, true,
     '["purchase_invoice","purchase_order"]',
     40::smallint),

    ('CHG_FREIGHT_OUT',
     'Freight Out',
     'Outbound transportation charge to customer.',
     'charge', NULL,
     'amount', NULL, 0.0,
     'value',
     true, true,
     '["sales_invoice","sales_order"]',
     41::smallint),

    ('CHG_INSURANCE_TRANSIT',
     'Transit Insurance',
     'Insurance premium for goods in transit.',
     'charge', NULL,
     'amount', NULL, 0.0,
     'value',
     false, true,
     '["purchase_invoice","purchase_order"]',
     42::smallint),

    ('CHG_PACKING',
     'Packing Charge',
     'Packing and handling fee.',
     'charge', NULL,
     'amount', NULL, 0.0,
     'value',
     true, true,
     '["purchase_invoice","purchase_order","sales_invoice","sales_order"]',
     43::smallint),

    ('CHG_CUSTOMS_DUTY',
     'Customs Duty',
     'Import customs duty levied on goods crossing borders. Classified as a landed-cost charge, not a recoverable tax. Jurisdictional customs (IN-CUSTOMS, DE-CUSTOMS, GB-CUSTOMS) classify into this kind.',
     'charge', 'landed',
     'percent', 0.0, NULL,
     'value',
     true, true,
     '["purchase_invoice","purchase_order"]',
     44::smallint),

    ('CHG_MISC',
     'Miscellaneous Charge',
     'Generic miscellaneous charge bucket.',
     'charge', NULL,
     'amount', NULL, 0.0,
     'value',
     true, true,
     '["purchase_invoice","purchase_order","sales_invoice","sales_order"]',
     49::smallint),

    -- RETENTION (sign − in engine; sub_type required)
    ('RET_WARRANTY',
     'Warranty Retention',
     'Warranty-period retention held until milestone met.',
     'retention', 'warranty',
     'percent', 5.00, NULL,
     NULL,
     false, false,
     '["purchase_invoice","purchase_order"]',
     50::smallint),

    ('RET_PERFORMANCE',
     'Performance Retention',
     'Performance-based retention released on completion or KPI achievement.',
     'retention', 'performance',
     'percent', 10.00, NULL,
     NULL,
     false, false,
     '["purchase_invoice","purchase_order"]',
     51::smallint),

    ('RET_COMPLETION',
     'Completion Retention',
     'Released on project / milestone completion sign-off.',
     'retention', 'completion',
     'percent', 5.00, NULL,
     NULL,
     false, false,
     '["purchase_invoice","purchase_order"]',
     52::smallint),

    -- PRINCIPAL MARKER (audit-only; sequence=0 anchor)
    ('PRINCIPAL_MARKER',
     'Principal Line Marker',
     'Audit-only marker for the principal line amount; not posted as a separate term. Sequence=0 by convention.',
     'principal_marker', NULL,
     'amount', NULL, 0.0,
     NULL,
     false, false,
     '["purchase_invoice","purchase_order","sales_invoice","sales_order"]',
     0::smallint)

) AS v(
    code, name, description,
    term_type, term_sub_type,
    default_basis, default_rate, default_amount,
    default_apportion_basis,
    is_taxable, is_apportionable, applies_to_classes,
    sort_order
)
ON CONFLICT (tenant_id, code) DO NOTHING;
