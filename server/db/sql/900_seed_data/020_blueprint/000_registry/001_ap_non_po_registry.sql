-- ============================================================================
-- FILE: blueprint/000_ap_non_po_registry.sql
-- Purpose: Register the AP Non-PO blueprint pack in control.blueprint_registry
-- Depends on: control.blueprint_registry (created by base pack 020_blueprint/000_registry/)
-- Idempotent: ON CONFLICT (code) DO UPDATE
-- ============================================================================

INSERT INTO control.blueprint_registry (
    code,
    name,
    category,
    industry_vertical,
    framework,
    base_version,
    status,
    dependencies,
    seed_files,
    description,
    metadata,
    created_by
)
VALUES (
    'pack_ap_non_po',
    'AP Non-PO Cycle',
    'industry_pack',
    NULL,
    NULL,
    '1.0.0',
    'active',
    ARRAY['base'],
    ARRAY[
        '300_ap_non_po/005_accounting_profile_ddl.sql',
        '300_ap_non_po/010_posting_roles.sql',
        '300_ap_non_po/020_accounting_profiles.sql',
        '300_ap_non_po/030_acct_profile_configs.sql',
        '300_ap_non_po/040_acct_profile_events.sql',
        '300_ap_non_po/050_acct_profile_entry_templates.sql',
        '300_ap_non_po/060_category_intent_rules.sql',
        '300_ap_non_po/070_intent_profile_rules.sql',
        '300_ap_non_po/080_payment_settlement_rules.sql',
        '300_ap_non_po/090_entity_operations_delta.sql',
        '300_ap_non_po/099_apply.sql'
    ],
    'Complete Non-PO Accounts Payable cycle: invoice capture (plain, VAT, WHT, retention, advance-recovery) through approval, GL posting, settlement, and bank clearing. Delivers 4 accounting profiles, 6 engine rules, 5 new posting roles, extended entity_operation set for purchase_invoice and payment_entry, and the master.accounting_profile identity table.',
    jsonb_build_object(
        'scenarios_covered', ARRAY['A1','A3','A4','A7','A8','vendor_advance'],
        'modules',           ARRAY['ACC','PAY','TREASURY','BUDGET','PAYG'],
        'journal_events',    ARRAY['INVOICE_RECEIVED','ORDER_APPROVAL','SETTLEMENT',
                                    'ADVANCE_PAID','ADVANCE_RECOVERED','RETENTION_RELEASED'],
        'flow_codes',        ARRAY['NON_PO','PURCHASE_CONTRACT']
    ),
    '00000000-0000-0000-0000-000000000000'::uuid
)
ON CONFLICT (code) DO UPDATE
   SET name              = EXCLUDED.name,
       industry_vertical = EXCLUDED.industry_vertical,
       framework         = EXCLUDED.framework,
       base_version      = EXCLUDED.base_version,
       status            = EXCLUDED.status,
       dependencies      = EXCLUDED.dependencies,
       seed_files        = EXCLUDED.seed_files,
       description       = EXCLUDED.description,
       metadata          = EXCLUDED.metadata,
       updated_at        = now();
