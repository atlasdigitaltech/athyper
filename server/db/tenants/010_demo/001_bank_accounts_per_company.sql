-- =============================================================================
-- 040_tenants/010_demo/001_bank_accounts_per_company.sql
-- Seed one primary bank account per Athyper company code.
--
-- Two tenant groups are handled:
--   A) Tenant 019dbe34-2c70-* — all ATHQ/ACFB/ADPM/… Athyper company codes
--   B) Tenant 019dbe34-41a2-* — TKSA/SSK/TEGY/SDTX (already seeded, skipped)
--
-- Idempotent: ON CONFLICT (id) DO NOTHING for bank_account;
--             WHERE NOT EXISTS for bank_account_link.
-- =============================================================================

DO $$
DECLARE
  v_su      constant uuid := '00000000-0000-0000-0000-000000000000';
  v_now     timestamptz   := now();
  v_tenant  uuid;
BEGIN

  -- Resolve tenant from any known Athyper company code
  SELECT tenant_id INTO v_tenant
    FROM master.company_code
   WHERE code = 'ATHQ'
     AND id   = '019dbe34-36ce-7068-94c5-c5e8a7daa088';

  IF v_tenant IS NULL THEN
    RAISE NOTICE 'Athyper tenant not found — bank account seed skipped';
    RETURN;
  END IF;

  -- ── 1. Insert bank_account rows ─────────────────────────────────────────────
  INSERT INTO master.bank_account (
    id, tenant_id, code, name, account_holder_name,
    account_id_type, account_id_value, account_last4,
    currency_code, bic_override, bank_name_override, bank_country_override,
    account_nature, is_verified, verified_at, metadata, status, created_by, created_at
  ) VALUES
    -- ATHQ — Athyper Group Holdings (MYR / Maybank Malaysia)
    ('dd002000-0000-0000-0000-000000000001', v_tenant,
     'ba-athq-myr-01', 'Athyper Group Holdings — Maybank MYR',
     'Athyper Group Holdings Sdn. Bhd.',
     'local', 'MY1234000000000000001', '0001', 'MYR',
     'MBBEMYKL', 'Maybank', 'MY',
     'direct', true, v_now, '{"_seed":{"batch":"001_bank_accounts"}}'::jsonb,
     'active', v_su, v_now),

    -- ACFB — Athyper Canada Food & Bev (CAD / Royal Bank of Canada)
    ('dd002000-0000-0000-0000-000000000002', v_tenant,
     'ba-acfb-cad-01', 'Athyper Canada Food & Bev — RBC CAD',
     'Athyper Canada Food & Beverage Manufacturing Inc.',
     'local', 'CA00020001200000012345', '2345', 'CAD',
     'ROYCCAT2', 'Royal Bank of Canada', 'CA',
     'direct', true, v_now, '{"_seed":{"batch":"001_bank_accounts"}}'::jsonb,
     'active', v_su, v_now),

    -- ADPM — Athyper Germany Pharma (EUR / Deutsche Bank)
    ('dd002000-0000-0000-0000-000000000003', v_tenant,
     'ba-adpm-eur-01', 'Athyper Germany Pharma — Deutsche Bank EUR',
     'Athyper Germany Pharma Manufacturing GmbH',
     'iban', 'DE89370400440532013000', '3000', 'EUR',
     'DEUTDEFF', 'Deutsche Bank', 'DE',
     'direct', true, v_now, '{"_seed":{"batch":"001_bank_accounts"}}'::jsonb,
     'active', v_su, v_now),

    -- AITM — Athyper India Textile (INR / HDFC Bank)
    ('dd002000-0000-0000-0000-000000000004', v_tenant,
     'ba-aitm-inr-01', 'Athyper India Textile — HDFC Bank INR',
     'Athyper India Textile Manufacturing Pvt. Ltd.',
     'local', '50100123456789', '6789', 'INR',
     'HDFCINBB', 'HDFC Bank', 'IN',
     'direct', true, v_now, '{"_seed":{"batch":"001_bank_accounts"}}'::jsonb,
     'active', v_su, v_now),

    -- AJED — Athyper Japan Education (JPY / MUFG Bank)
    ('dd002000-0000-0000-0000-000000000005', v_tenant,
     'ba-ajed-jpy-01', 'Athyper Japan Education — MUFG Bank JPY',
     'Athyper Japan Education K.K.',
     'local', '0005-111-1234567', '4567', 'JPY',
     'BOTKJPJT', 'MUFG Bank', 'JP',
     'direct', true, v_now, '{"_seed":{"batch":"001_bank_accounts"}}'::jsonb,
     'active', v_su, v_now),

    -- AMRE — Athyper Malaysia Real Estate (MYR / Maybank)
    ('dd002000-0000-0000-0000-000000000006', v_tenant,
     'ba-amre-myr-01', 'Athyper Malaysia Real Estate — Maybank MYR',
     'Athyper Malaysia Real Estate Sdn. Bhd.',
     'local', 'MY5678000000000000006', '0006', 'MYR',
     'MBBEMYKL', 'Maybank', 'MY',
     'direct', true, v_now, '{"_seed":{"batch":"001_bank_accounts"}}'::jsonb,
     'active', v_su, v_now),

    -- APHS — Athyper Philippines Hospital (PHP / BDO Unibank)
    ('dd002000-0000-0000-0000-000000000007', v_tenant,
     'ba-aphs-php-01', 'Athyper Philippines Hospital — BDO PHP',
     'Athyper Philippines Hospital Corp.',
     'local', '001480123456789', '6789', 'PHP',
     'BNORPHMM', 'BDO Unibank', 'PH',
     'direct', true, v_now, '{"_seed":{"batch":"001_bank_accounts"}}'::jsonb,
     'active', v_su, v_now),

    -- AQTS — Athyper Qatar Transport (QAR / Qatar National Bank)
    ('dd002000-0000-0000-0000-000000000008', v_tenant,
     'ba-aqts-qar-01', 'Athyper Qatar Transport — QNB QAR',
     'Athyper Qatar Transport W.L.L.',
     'iban', 'QA06QNBA0000000000000123456789', '6789', 'QAR',
     'QNBAQAQA', 'Qatar National Bank', 'QA',
     'direct', true, v_now, '{"_seed":{"batch":"001_bank_accounts"}}'::jsonb,
     'active', v_su, v_now),

    -- AQTU — Athyper Qatar Utilities (QAR / Qatar National Bank)
    ('dd002000-0000-0000-0000-000000000009', v_tenant,
     'ba-aqtu-qar-01', 'Athyper Qatar Utilities — QNB QAR',
     'Athyper Qatar Utilities W.L.L.',
     'iban', 'QA06QNBA0000000000000987654321', '4321', 'QAR',
     'QNBAQAQA', 'Qatar National Bank', 'QA',
     'direct', true, v_now, '{"_seed":{"batch":"001_bank_accounts"}}'::jsonb,
     'active', v_su, v_now),

    -- ASAC — Athyper Saudi Construction (SAR / Al Rajhi Bank)
    ('dd002000-0000-0000-0000-000000000010', v_tenant,
     'ba-asac-sar-01', 'Athyper Saudi Construction — Al Rajhi SAR',
     'Athyper Saudi Construction Co. Ltd.',
     'iban', 'SA0380000000608010167519', '7519', 'SAR',
     'RJHISARI', 'Al Rajhi Bank', 'SA',
     'direct', true, v_now, '{"_seed":{"batch":"001_bank_accounts"}}'::jsonb,
     'active', v_su, v_now),

    -- ASAH — Athyper Saudi Hospitality (SAR / Al Rajhi Bank)
    ('dd002000-0000-0000-0000-000000000011', v_tenant,
     'ba-asah-sar-01', 'Athyper Saudi Hospitality — Al Rajhi SAR',
     'Athyper Saudi Hospitality Co. Ltd.',
     'iban', 'SA3680000000608010298765', '8765', 'SAR',
     'RJHISARI', 'Al Rajhi Bank', 'SA',
     'direct', true, v_now, '{"_seed":{"batch":"001_bank_accounts"}}'::jsonb,
     'active', v_su, v_now),

    -- ASGF — Athyper Singapore Financial (SGD / DBS Bank)
    ('dd002000-0000-0000-0000-000000000012', v_tenant,
     'ba-asgf-sgd-01', 'Athyper Singapore Financial — DBS SGD',
     'Athyper Singapore Financial Pte. Ltd.',
     'local', '0720123456789', '6789', 'SGD',
     'DBSSSGSG', 'DBS Bank', 'SG',
     'direct', true, v_now, '{"_seed":{"batch":"001_bank_accounts"}}'::jsonb,
     'active', v_su, v_now),

    -- ASPE — Athyper SA Petroleum (ZAR / Standard Bank)
    ('dd002000-0000-0000-0000-000000000013', v_tenant,
     'ba-aspe-zar-01', 'Athyper SA Petroleum — Standard Bank ZAR',
     'Athyper South Africa Petroleum Extraction (Pty) Ltd.',
     'local', '012345678901', '8901', 'ZAR',
     'SBZAZAJJ', 'Standard Bank South Africa', 'ZA',
     'direct', true, v_now, '{"_seed":{"batch":"001_bank_accounts"}}'::jsonb,
     'active', v_su, v_now),

    -- ATEM — Athyper Taiwan Electronics (TWD / Taipei Fubon Bank)
    ('dd002000-0000-0000-0000-000000000014', v_tenant,
     'ba-atem-twd-01', 'Athyper Taiwan Electronics — Fubon Bank TWD',
     'Athyper Taiwan Electronics Manufacturing Co., Ltd.',
     'local', '012101234567890', '7890', 'TWD',
     'TPBKTWTP', 'Taipei Fubon Bank', 'TW',
     'direct', true, v_now, '{"_seed":{"batch":"001_bank_accounts"}}'::jsonb,
     'active', v_su, v_now),

    -- AUET — Athyper UAE Trading (AED / Emirates NBD)
    ('dd002000-0000-0000-0000-000000000015', v_tenant,
     'ba-auet-aed-01', 'Athyper UAE Trading — Emirates NBD AED',
     'Athyper UAE Trading LLC',
     'iban', 'AE070331234567890123456', '3456', 'AED',
     'EBILAEAD', 'Emirates NBD', 'AE',
     'direct', true, v_now, '{"_seed":{"batch":"001_bank_accounts"}}'::jsonb,
     'active', v_su, v_now),

    -- AUIC — Athyper US InfoComm (USD / JPMorgan Chase)
    ('dd002000-0000-0000-0000-000000000016', v_tenant,
     'ba-auic-usd-01', 'Athyper US InfoComm — JPMorgan Chase USD',
     'Athyper US Information & Communications Inc.',
     'local', '000000123456789', '6789', 'USD',
     'CHASUS33', 'JPMorgan Chase', 'US',
     'direct', true, v_now, '{"_seed":{"batch":"001_bank_accounts"}}'::jsonb,
     'active', v_su, v_now),

    -- AUKA — Athyper UK Agriculture (GBP / Barclays)
    ('dd002000-0000-0000-0000-000000000017', v_tenant,
     'ba-auka-gbp-01', 'Athyper UK Agriculture — Barclays GBP',
     'Athyper UK Agriculture Ltd.',
     'iban', 'GB29BARC20201530093459', '3459', 'GBP',
     'BARCGB22', 'Barclays Bank', 'GB',
     'direct', true, v_now, '{"_seed":{"batch":"001_bank_accounts"}}'::jsonb,
     'active', v_su, v_now)

  ON CONFLICT (id) DO NOTHING;

  -- ── 2. Insert bank_account_link rows ───────────────────────────────────────
  -- Hard-coded company_code UUIDs resolved from the query above.
  -- WHERE NOT EXISTS guards against re-seeding if a primary link already exists.
  INSERT INTO master.bank_account_link (
    tenant_id, owner_type, owner_id, bank_account_id, company_code_id,
    purpose, is_primary, effective_from, metadata, created_by, created_at
  )
  SELECT
    v_tenant, 'company_code', m.cc_id, m.ba_id, m.cc_id,
    'default', true, '2024-01-01'::date,
    '{"_seed":{"batch":"001_bank_accounts"}}'::jsonb,
    v_su, v_now
  FROM (VALUES
    ('019dbe34-36ce-7068-94c5-c5e8a7daa088'::uuid, 'dd002000-0000-0000-0000-000000000001'::uuid), -- ATHQ
    ('019dbe34-36ce-736b-80fd-a6911bdec9ed'::uuid, 'dd002000-0000-0000-0000-000000000002'::uuid), -- ACFB
    ('019dbe34-36ce-76f4-b89f-02b4e766ba73'::uuid, 'dd002000-0000-0000-0000-000000000003'::uuid), -- ADPM
    ('019dbe34-36ce-719d-b753-4f91f127a237'::uuid, 'dd002000-0000-0000-0000-000000000004'::uuid), -- AITM
    ('019dbe34-36ce-7b35-a4dc-09428a959092'::uuid, 'dd002000-0000-0000-0000-000000000005'::uuid), -- AJED
    ('019dbe34-36ce-74c3-82be-8a621e7badf9'::uuid, 'dd002000-0000-0000-0000-000000000006'::uuid), -- AMRE
    ('019dbe34-36ce-7739-9a4a-882630d8ac90'::uuid, 'dd002000-0000-0000-0000-000000000007'::uuid), -- APHS
    ('019dbe34-36ce-7a40-b1e5-0837328b1321'::uuid, 'dd002000-0000-0000-0000-000000000008'::uuid), -- AQTS
    ('019dbe34-36ce-7b01-afdf-5430341be478'::uuid, 'dd002000-0000-0000-0000-000000000009'::uuid), -- AQTU
    ('019dbe34-36ce-7cb4-a4fe-72c6c202ce23'::uuid, 'dd002000-0000-0000-0000-000000000010'::uuid), -- ASAC
    ('019dbe34-36ce-74fc-9cf6-f0c0ed0bae30'::uuid, 'dd002000-0000-0000-0000-000000000011'::uuid), -- ASAH
    ('019dbe34-36ce-7845-803d-bd7d28dbf2a4'::uuid, 'dd002000-0000-0000-0000-000000000012'::uuid), -- ASGF
    ('019dbe34-36ce-785c-b6e9-66a2fd205a3b'::uuid, 'dd002000-0000-0000-0000-000000000013'::uuid), -- ASPE
    ('019dbe34-36ce-75b9-a111-3d728d4d2f9a'::uuid, 'dd002000-0000-0000-0000-000000000014'::uuid), -- ATEM
    ('019dbe34-36ce-7df9-81a6-99563537c811'::uuid, 'dd002000-0000-0000-0000-000000000015'::uuid), -- AUET
    ('019dbe34-36ce-7153-a0f8-6a0a18d88245'::uuid, 'dd002000-0000-0000-0000-000000000016'::uuid), -- AUIC
    ('019dbe34-36ce-7294-b738-82231c9405e5'::uuid, 'dd002000-0000-0000-0000-000000000017'::uuid)  -- AUKA
  ) AS m(cc_id, ba_id)
  WHERE NOT EXISTS (
    SELECT 1 FROM master.bank_account_link bal
     WHERE bal.company_code_id = m.cc_id
       AND bal.owner_type      = 'company_code'
       AND bal.is_primary      = true
  );

  RAISE NOTICE 'Athyper company bank accounts seeded for tenant %', v_tenant;

END $$;
