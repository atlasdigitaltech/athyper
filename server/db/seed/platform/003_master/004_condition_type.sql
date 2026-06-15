-- ============================================================================
-- FILE: platform/003_master/004_condition_type.sql
-- Purpose: System-seeded pricing-component condition catalog.
--          Drives document.pricing_component.condition_type_id FK.
--
-- Scope:   tenant_id = NULL, is_system = true → available to all tenants.
--          Tenant-specific custom rows (is_system = false, tenant_id = <uuid>)
--          land via standard CRUD.
--
-- Coverage (~18 system rows across 6 term types):
--   • discount        — commercial, prompt-payment
--   • charge          — freight in/out, insurance transit, packing, customs
--   • tax             — VAT standard/zero/exempt, GST CGST/SGST/IGST, reverse charge
--   • withholding     — 194Q TDS (goods), 194C TDS (services), generic WHT
--   • retention       — warranty, performance, completion
--   • principal_marker — line principal anchor (sequence=0 marker)
--
-- Idempotent: ON CONFLICT (tenant_id, code) DO NOTHING.
-- Created by: system user (00000000-0000-0000-0000-000000000000)
-- ============================================================================

INSERT INTO master.condition_type (
    tenant_id, code, name, description,
    term_type,
    default_basis, default_rate, default_amount,
    default_apportion_basis,
    default_posting_role_code, default_account_source,
    default_tax_group_id, default_is_inclusive, default_recoverable_pct, default_tax_section_code,
    is_taxable, is_apportionable, applies_to_classes,
    is_system, sort_order,
    metadata, status,
    created_by
)
SELECT NULL,
       v.code, v.name, v.description,
       v.term_type,
       v.default_basis, v.default_rate, v.default_amount,
       v.default_apportion_basis,
       v.default_posting_role_code, v.default_account_source,
       NULL, v.default_is_inclusive, v.default_recoverable_pct, v.default_tax_section_code,
       v.is_taxable, v.is_apportionable, '["purchase_invoice","purchase_order"]'::jsonb,
       true, v.sort_order,
       jsonb_build_object('_seed', jsonb_build_object('pack','004_condition_type','version','1.0.0')),
       'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES

    -- ──────────────────────────────────────────────────────────────────────
    -- DISCOUNTS
    -- ──────────────────────────────────────────────────────────────────────
    ('DISC_COMMERCIAL',
     'Commercial Discount',
     'Vendor-extended commercial discount, applied as a percentage on the line subtotal.',
     'discount',
     'percent', 0.0, NULL,
     NULL,
     'DISCOUNT_RECEIVED', 'POSTING_ROLE',
     NULL, NULL, NULL,
     false, true, 10::smallint),

    ('DISC_PROMPT_PAYMENT',
     'Prompt Payment Discount',
     'Early-settlement discount per payment term clause; reduces payable amount.',
     'discount',
     'percent', 0.0, NULL,
     NULL,
     'DISCOUNT_RECEIVED_PROMPT', 'POSTING_ROLE',
     NULL, NULL, NULL,
     false, true, 11::smallint),

    -- ──────────────────────────────────────────────────────────────────────
    -- CHARGES
    -- ──────────────────────────────────────────────────────────────────────
    ('CHG_FREIGHT_IN',
     'Freight In',
     'Inbound transportation charge from supplier to delivery point.',
     'charge',
     'amount', NULL, 0.0,
     'value',
     'EXPENSE_FREIGHT', 'POSTING_ROLE',
     NULL, NULL, NULL,
     true, true, 20::smallint),

    ('CHG_FREIGHT_OUT',
     'Freight Out',
     'Outbound transportation charge to customer.',
     'charge',
     'amount', NULL, 0.0,
     'value',
     'EXPENSE_FREIGHT_OUT', 'POSTING_ROLE',
     NULL, NULL, NULL,
     true, true, 21::smallint),

    ('CHG_INSURANCE_TRANSIT',
     'Transit Insurance',
     'Insurance premium for goods in transit.',
     'charge',
     'amount', NULL, 0.0,
     'value',
     'EXPENSE_INSURANCE', 'POSTING_ROLE',
     NULL, NULL, NULL,
     false, true, 22::smallint),

    ('CHG_PACKING',
     'Packing Charge',
     'Packing and handling fee.',
     'charge',
     'amount', NULL, 0.0,
     'value',
     'EXPENSE_PACKING', 'POSTING_ROLE',
     NULL, NULL, NULL,
     true, true, 23::smallint),

    ('CHG_CUSTOMS_DUTY',
     'Customs Duty',
     'Import customs duty levied on goods crossing borders.',
     'charge',
     'percent', 0.0, NULL,
     'value',
     'EXPENSE_CUSTOMS', 'POSTING_ROLE',
     NULL, NULL, NULL,
     true, true, 24::smallint),

    ('CHG_MISC',
     'Miscellaneous Charge',
     'Generic miscellaneous charge bucket.',
     'charge',
     'amount', NULL, 0.0,
     'value',
     'EXPENSE_MISC', 'POSTING_ROLE',
     NULL, NULL, NULL,
     true, true, 29::smallint),

    -- ──────────────────────────────────────────────────────────────────────
    -- TAXES
    -- ──────────────────────────────────────────────────────────────────────
    ('TAX_VAT_STANDARD',
     'VAT — Standard Rate',
     'Standard value-added tax; recoverable input VAT.',
     'tax',
     'percent', 0.0, NULL,
     NULL,
     'AP_VAT_INPUT', 'POSTING_ROLE',
     false, 100.00, NULL,
     false, false, 30::smallint),

    ('TAX_VAT_ZERO',
     'VAT — Zero Rated',
     'Zero-rated supply; no VAT charged.',
     'tax',
     'percent', 0.0, NULL,
     NULL,
     'AP_VAT_INPUT', 'POSTING_ROLE',
     false, 100.00, NULL,
     false, false, 31::smallint),

    ('TAX_VAT_EXEMPT',
     'VAT — Exempt',
     'Exempt supply; no input VAT recovery.',
     'tax',
     'percent', 0.0, NULL,
     NULL,
     'AP_VAT_INPUT', 'POSTING_ROLE',
     false, 0.00, NULL,
     false, false, 32::smallint),

    ('TAX_VAT_REVERSE',
     'VAT — Reverse Charge',
     'Reverse-charge VAT (recipient self-accounts).',
     'tax',
     'percent', 0.0, NULL,
     NULL,
     'AP_VAT_REVERSE', 'POSTING_ROLE',
     false, 100.00, NULL,
     false, false, 33::smallint),

    ('TAX_GST_CGST',
     'GST — CGST',
     'Central GST component (India).',
     'tax',
     'percent', 0.0, NULL,
     NULL,
     'AP_CGST_INPUT', 'POSTING_ROLE',
     false, 100.00, NULL,
     false, false, 34::smallint),

    ('TAX_GST_SGST',
     'GST — SGST',
     'State GST component (India).',
     'tax',
     'percent', 0.0, NULL,
     NULL,
     'AP_SGST_INPUT', 'POSTING_ROLE',
     false, 100.00, NULL,
     false, false, 35::smallint),

    ('TAX_GST_IGST',
     'GST — IGST',
     'Integrated GST (interstate, India).',
     'tax',
     'percent', 0.0, NULL,
     NULL,
     'AP_IGST_INPUT', 'POSTING_ROLE',
     false, 100.00, NULL,
     false, false, 36::smallint),

    -- ──────────────────────────────────────────────────────────────────────
    -- WITHHOLDING
    -- ──────────────────────────────────────────────────────────────────────
    ('WHT_194Q',
     'TDS — Section 194Q',
     'Tax deducted at source on purchase of goods above threshold (India 194Q).',
     'withholding',
     'percent', 0.10, NULL,
     NULL,
     'WHT_PAYABLE_194Q', 'POSTING_ROLE',
     false, NULL, '194Q',
     false, false, 40::smallint),

    ('WHT_194C',
     'TDS — Section 194C',
     'Tax deducted at source on contractor payments (India 194C).',
     'withholding',
     'percent', 1.00, NULL,
     NULL,
     'WHT_PAYABLE_194C', 'POSTING_ROLE',
     false, NULL, '194C',
     false, false, 41::smallint),

    ('WHT_GENERIC',
     'Generic Withholding',
     'Generic withholding tax (jurisdiction-agnostic).',
     'withholding',
     'percent', 0.0, NULL,
     NULL,
     'WHT_PAYABLE', 'POSTING_ROLE',
     false, NULL, NULL,
     false, false, 49::smallint),

    -- ──────────────────────────────────────────────────────────────────────
    -- RETENTION
    -- ──────────────────────────────────────────────────────────────────────
    ('RET_WARRANTY',
     'Warranty Retention',
     'Warranty-period retention held until milestone met.',
     'retention',
     'percent', 5.00, NULL,
     NULL,
     'AP_RETENTION_PAYABLE', 'POSTING_ROLE',
     NULL, NULL, NULL,
     false, false, 50::smallint),

    ('RET_PERFORMANCE',
     'Performance Retention',
     'Performance-based retention released on completion or KPI achievement.',
     'retention',
     'percent', 10.00, NULL,
     NULL,
     'AP_RETENTION_PAYABLE', 'POSTING_ROLE',
     NULL, NULL, NULL,
     false, false, 51::smallint),

    ('RET_COMPLETION',
     'Completion Retention',
     'Released on project / milestone completion sign-off.',
     'retention',
     'percent', 5.00, NULL,
     NULL,
     'AP_RETENTION_PAYABLE', 'POSTING_ROLE',
     NULL, NULL, NULL,
     false, false, 52::smallint),

    -- ──────────────────────────────────────────────────────────────────────
    -- PRINCIPAL MARKER (audit-only)
    -- ──────────────────────────────────────────────────────────────────────
    ('PRINCIPAL_MARKER',
     'Principal Line Marker',
     'Audit-only marker for the principal line amount; not posted as a separate term. '
     'Sequence=0 by convention.',
     'principal_marker',
     'amount', NULL, 0.0,
     NULL,
     NULL, NULL,
     NULL, NULL, NULL,
     false, false, 0::smallint)

) AS v(
    code, name, description, term_type,
    default_basis, default_rate, default_amount,
    default_apportion_basis,
    default_posting_role_code, default_account_source,
    default_is_inclusive, default_recoverable_pct, default_tax_section_code,
    is_taxable, is_apportionable, sort_order
)
ON CONFLICT (tenant_id, code) DO NOTHING;


-- =============================================================================
-- End of 004_condition_type.sql
-- =============================================================================
