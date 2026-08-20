-- =============================================================================
-- tenants/neon/010_demo/002_bank_account_display_fix.sql
-- Fix bank_account entity display in inline-search pickers.
--
-- Problems:
--   1. control.entity display_config has no title_field/subtitle_field —
--      EntityRefPicker falls back to account_holder_name + code.
--   2. bank_account.name for dd002000-* accounts includes the legal entity name
--      instead of bank-centric info (bank name + masked account number).
--
-- Changes:
--   1. Set display_config.title_field = 'name', subtitle_field = 'account_holder_name'
--   2. Rename dd002000-* bank accounts: "{BankName} — ••••{last4} ({Currency})"
--
-- Idempotent: UPDATE is safe to re-run; name updates are explicit.
-- =============================================================================

-- ── 1. Update bank_account entity display_config ─────────────────────────────
UPDATE control.entity
   SET display_config = jsonb_build_object(
       'detail_renderer',    'master',
       'title_field',        'name',
       'subtitle_field',     'account_holder_name',
       'list_columns',       '["name","account_holder_name","currency_code","status"]'::jsonb,
       'default_sort_field', 'name',
       'default_sort_order', 'asc'
   )
 WHERE table_schema = 'master'
   AND table_name   = 'bank_account'
   AND tenant_id    IS NULL;

-- ── 2. Rename dd002000-* bank accounts to bank-centric format ────────────────
-- Format: "{BankName} — ••••{last4} ({Currency})"
UPDATE master.bank_account
   SET name = CASE id::text
     WHEN 'dd002000-0000-0000-0000-000000000001' THEN 'Maybank — ••••0001 (MYR)'
     WHEN 'dd002000-0000-0000-0000-000000000002' THEN 'Royal Bank of Canada — ••••2345 (CAD)'
     WHEN 'dd002000-0000-0000-0000-000000000003' THEN 'Deutsche Bank — ••••3000 (EUR)'
     WHEN 'dd002000-0000-0000-0000-000000000004' THEN 'HDFC Bank — ••••6789 (INR)'
     WHEN 'dd002000-0000-0000-0000-000000000005' THEN 'MUFG Bank — ••••4567 (JPY)'
     WHEN 'dd002000-0000-0000-0000-000000000006' THEN 'Maybank — ••••0006 (MYR)'
     WHEN 'dd002000-0000-0000-0000-000000000007' THEN 'BDO Unibank — ••••6789 (PHP)'
     WHEN 'dd002000-0000-0000-0000-000000000008' THEN 'Qatar National Bank — ••••6789 (QAR)'
     WHEN 'dd002000-0000-0000-0000-000000000009' THEN 'Qatar National Bank — ••••4321 (QAR)'
     WHEN 'dd002000-0000-0000-0000-000000000010' THEN 'Al Rajhi Bank — ••••7519 (SAR)'
     WHEN 'dd002000-0000-0000-0000-000000000011' THEN 'Al Rajhi Bank — ••••8765 (SAR)'
     WHEN 'dd002000-0000-0000-0000-000000000012' THEN 'DBS Bank — ••••6789 (SGD)'
     WHEN 'dd002000-0000-0000-0000-000000000013' THEN 'Standard Bank — ••••8901 (ZAR)'
     WHEN 'dd002000-0000-0000-0000-000000000014' THEN 'Taipei Fubon Bank — ••••7890 (TWD)'
     WHEN 'dd002000-0000-0000-0000-000000000015' THEN 'Emirates NBD — ••••3456 (AED)'
     WHEN 'dd002000-0000-0000-0000-000000000016' THEN 'JPMorgan Chase — ••••6789 (USD)'
     WHEN 'dd002000-0000-0000-0000-000000000017' THEN 'Barclays Bank — ••••3459 (GBP)'
     ELSE name
   END
 WHERE id IN (
     'dd002000-0000-0000-0000-000000000001',
     'dd002000-0000-0000-0000-000000000002',
     'dd002000-0000-0000-0000-000000000003',
     'dd002000-0000-0000-0000-000000000004',
     'dd002000-0000-0000-0000-000000000005',
     'dd002000-0000-0000-0000-000000000006',
     'dd002000-0000-0000-0000-000000000007',
     'dd002000-0000-0000-0000-000000000008',
     'dd002000-0000-0000-0000-000000000009',
     'dd002000-0000-0000-0000-000000000010',
     'dd002000-0000-0000-0000-000000000011',
     'dd002000-0000-0000-0000-000000000012',
     'dd002000-0000-0000-0000-000000000013',
     'dd002000-0000-0000-0000-000000000014',
     'dd002000-0000-0000-0000-000000000015',
     'dd002000-0000-0000-0000-000000000016',
     'dd002000-0000-0000-0000-000000000017'
 );

-- Also fix the existing dd001000-* accounts (TKSA, SSK, TEGY, SDTX) for consistency
UPDATE master.bank_account
   SET name = CASE id::text
     WHEN 'dd001000-0000-0000-0000-000000000001' THEN 'Riyad Bank — ••••2345 (SAR)'
     WHEN 'dd001000-0000-0000-0000-000000000002' THEN 'Riyad Bank — ••••6789 (SAR)'
     WHEN 'dd001000-0000-0000-0000-000000000003' THEN 'Banque Misr — ••••3456 (EGP)'
     WHEN 'dd001000-0000-0000-0000-000000000004' THEN 'Banque Misr — ••••7654 (EGP)'
     ELSE name
   END
 WHERE id IN (
     'dd001000-0000-0000-0000-000000000001',
     'dd001000-0000-0000-0000-000000000002',
     'dd001000-0000-0000-0000-000000000003',
     'dd001000-0000-0000-0000-000000000004'
 );
