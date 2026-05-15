-- =============================================================================
-- 900_seed_data/010_platform/005_domain_registrations/200_document/015_ap_override_permissions.sql
-- AP override permission codes — one per overrideable derivation in the PI create flow.
-- Medium risk: overriding any of these is a governance event worth logging.
-- Depends on: 001_permission_model seed (shared.permission_category finance exists)
-- Idempotent: ON CONFLICT (code) DO NOTHING
-- =============================================================================

INSERT INTO shared.permission (code, name, category_id, scope_type, risk_level, sort_order, created_by)
SELECT v.code, v.name, pc.id, 'record', 'medium', v.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('ap.override_payment_method',     'Override AP Payment Method',     610),
    ('ap.override_cost_center',        'Override AP Cost Center',        620),
    ('ap.override_profit_center',      'Override AP Profit Center',      630),
    ('ap.override_company_code',       'Override AP Company Code',       640),
    ('ap.override_currency',           'Override AP Currency',           650),
    ('ap.override_fx_rate',            'Override AP FX Rate',            660),
    ('ap.override_tax_amount',         'Override AP Tax Amount',         670),
    ('ap.override_wht_amount',         'Override AP WHT Amount',         680),
    ('ap.override_total',              'Override AP Total',              690),
    ('ap.override_payment_term',       'Override AP Payment Term',       700),
    ('ap.override_baseline_date',      'Override AP Baseline Date',      710),
    ('ap.override_due_date',           'Override AP Due Date',           720),
    ('ap.override_posting_date',       'Override AP Posting Date',       730),
    ('ap.override_advance_deduction',  'Override AP Advance Deduction',  740),
    ('ap.override_retention',          'Override AP Retention',          750)
) AS v(code, name, sort_order)
JOIN shared.permission_category pc ON pc.code = 'finance'
ON CONFLICT (code) DO NOTHING;
