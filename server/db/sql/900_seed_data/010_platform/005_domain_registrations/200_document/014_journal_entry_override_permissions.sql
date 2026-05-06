-- =============================================================================
-- 900_seed_data/010_platform/005_domain_registrations/200_document/014_journal_entry_override_permissions.sql
-- JE override permission codes used by the manual Journal Entry create flow.
-- Idempotent: ON CONFLICT (code) DO NOTHING
-- =============================================================================

INSERT INTO shared.permission (code, name, category_id, scope_type, risk_level, sort_order, created_by)
SELECT v.code, v.name, pc.id, 'record', 'medium', v.sort_order,
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('je.override_company_code',  'Override JE Company Code',  760),
    ('je.override_book',          'Override JE Ledger Book',   770),
    ('je.override_document_date', 'Override JE Document Date', 780),
    ('je.override_currency',      'Override JE Currency',      790)
) AS v(code, name, sort_order)
JOIN shared.permission_category pc ON pc.code = 'finance'
ON CONFLICT (code) DO NOTHING;
