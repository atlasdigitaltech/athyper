-- ============================================================================
-- 320_tax_jurisdictions.sql — Tax jurisdictions (14 countries + sub-jurisdictions)
-- ============================================================================
-- Tables: master.tax_jurisdiction
-- Phase 1 base: federal/country level for all 13 ATHYPER jurisdictions
--   Sub-jurisdictions only where structurally needed (India SGST, US state tax)
-- Future phases may add: DE municipal trade tax, CA provincial, IN more states
-- Depends: master.tenant
-- ============================================================================

DO $seed$
DECLARE
    v_tid  uuid;
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb := '{"_seed": {"pack": "320_org", "version": "2.0.0"}}'::jsonb;
    v_in   uuid;  -- India parent for sub-jurisdictions
    v_us   uuid;  -- US parent for sub-jurisdictions
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- C0: Remove stale L1 entries not in the current 14-country list
    --     (left over from older seed versions that had different countries).
    --
    --     Dependency order (all have no ON DELETE CASCADE):
    --       ledger.tax_calculation      → control.tax_rate_schedule
    --       control.tax_group_component → control.tax_rate_schedule
    --       control.tax_rate_schedule   → master.tax_jurisdiction
    --       tax_jurisdiction L2         → tax_jurisdiction L1
    -- ══════════════════════════════════════════════════════════════════════

    -- Step 1: ledger rows that reference schedules tied to stale jurisdictions
    DELETE FROM ledger.tax_calculation
    WHERE tenant_id = v_tid
      AND tax_rate_schedule_id IN (
          SELECT id FROM control.tax_rate_schedule
          WHERE tenant_id    = v_tid
            AND jurisdiction_id IN (
                SELECT id FROM master.tax_jurisdiction
                WHERE tenant_id = v_tid
                  AND code NOT IN (
                    'TJ-MY','TJ-QA','TJ-SA','TJ-AE','TJ-US','TJ-SG',
                    'TJ-IN','TJ-CA','TJ-DE','TJ-TW','TJ-ZA','TJ-GB','TJ-JP','TJ-PH'
                  )));

    -- Step 2: tax_group_component rows referencing those schedules
    DELETE FROM control.tax_group_component
    WHERE tenant_id = v_tid
      AND tax_rate_schedule_id IN (
          SELECT id FROM control.tax_rate_schedule
          WHERE tenant_id    = v_tid
            AND jurisdiction_id IN (
                SELECT id FROM master.tax_jurisdiction
                WHERE tenant_id = v_tid
                  AND code NOT IN (
                    'TJ-MY','TJ-QA','TJ-SA','TJ-AE','TJ-US','TJ-SG',
                    'TJ-IN','TJ-CA','TJ-DE','TJ-TW','TJ-ZA','TJ-GB','TJ-JP','TJ-PH'
                  )));

    -- Step 3: rate schedules that reference stale jurisdictions
    DELETE FROM control.tax_rate_schedule
    WHERE tenant_id    = v_tid
      AND jurisdiction_id IN (
          SELECT id FROM master.tax_jurisdiction
          WHERE tenant_id = v_tid
            AND code NOT IN (
              'TJ-MY','TJ-QA','TJ-SA','TJ-AE','TJ-US','TJ-SG',
              'TJ-IN','TJ-CA','TJ-DE','TJ-TW','TJ-ZA','TJ-GB','TJ-JP','TJ-PH'
            ));

    -- Step 4a: stale L2 entries whose parent is still canonical but whose own code
    --          is not in the current L2 whitelist (e.g. a previously-seeded 3rd India
    --          state).  Must come before Step 4b so the FK from tax_rate_schedule is
    --          cleared first.
    DELETE FROM ledger.tax_calculation
    WHERE tenant_id = v_tid
      AND tax_rate_schedule_id IN (
          SELECT id FROM control.tax_rate_schedule
          WHERE tenant_id = v_tid
            AND jurisdiction_id IN (
                SELECT id FROM master.tax_jurisdiction
                WHERE tenant_id = v_tid AND level_no = 2
                  AND code NOT IN ('TJ-IN-TN','TJ-IN-MH','TJ-US-CA')));

    DELETE FROM control.tax_group_component
    WHERE tenant_id = v_tid
      AND tax_rate_schedule_id IN (
          SELECT id FROM control.tax_rate_schedule
          WHERE tenant_id = v_tid
            AND jurisdiction_id IN (
                SELECT id FROM master.tax_jurisdiction
                WHERE tenant_id = v_tid AND level_no = 2
                  AND code NOT IN ('TJ-IN-TN','TJ-IN-MH','TJ-US-CA')));

    DELETE FROM control.tax_rate_schedule
    WHERE tenant_id = v_tid
      AND jurisdiction_id IN (
          SELECT id FROM master.tax_jurisdiction
          WHERE tenant_id = v_tid AND level_no = 2
            AND code NOT IN ('TJ-IN-TN','TJ-IN-MH','TJ-US-CA'));

    DELETE FROM master.tax_jurisdiction
    WHERE tenant_id = v_tid
      AND level_no  = 2
      AND code NOT IN ('TJ-IN-TN','TJ-IN-MH','TJ-US-CA');

    -- Step 4b: L2 children of stale L1 entries
    DELETE FROM master.tax_jurisdiction
    WHERE tenant_id = v_tid
      AND level_no  = 2
      AND parent_id IN (
          SELECT id FROM master.tax_jurisdiction
          WHERE tenant_id = v_tid AND level_no = 1
            AND code NOT IN (
              'TJ-MY','TJ-QA','TJ-SA','TJ-AE','TJ-US','TJ-SG',
              'TJ-IN','TJ-CA','TJ-DE','TJ-TW','TJ-ZA','TJ-GB','TJ-JP','TJ-PH'
            ));

    -- Step 5: stale L1 entries
    DELETE FROM master.tax_jurisdiction
    WHERE tenant_id = v_tid
      AND level_no  = 1
      AND code NOT IN (
          'TJ-MY','TJ-QA','TJ-SA','TJ-AE','TJ-US','TJ-SG',
          'TJ-IN','TJ-CA','TJ-DE','TJ-TW','TJ-ZA','TJ-GB','TJ-JP','TJ-PH'
      );

    -- ══════════════════════════════════════════════════════════════════════
    -- L1: Federal / country jurisdictions (14 countries)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO master.tax_jurisdiction
        (tenant_id, code, name, description, country_code,
         jurisdiction_type, level_no, parent_id,
         authority_name, registration_required, filing_frequency,
         currency_code, sort_order, status, created_by, metadata)
    VALUES
    (v_tid,'TJ-MY','Malaysia',           'Malaysian federal tax authority',      'MY','COUNTRY',1,NULL,'Lembaga Hasil Dalam Negeri (LHDN)',true, 'MONTHLY',   'MYR', 10,'active',v_su,v_meta),
    (v_tid,'TJ-QA','Qatar',              'Qatar federal — limited tax regime',   'QA','COUNTRY',1,NULL,'General Tax Authority (GTA)',       false,'ANNUAL',    'QAR', 20,'active',v_su,v_meta),
    (v_tid,'TJ-SA','Saudi Arabia',       'Saudi tax + zakat authority',          'SA','COUNTRY',1,NULL,'ZATCA',                            true, 'MONTHLY',   'SAR', 30,'active',v_su,v_meta),
    (v_tid,'TJ-AE','United Arab Emirates','UAE federal tax authority',           'AE','COUNTRY',1,NULL,'Federal Tax Authority (FTA)',       true, 'QUARTERLY', 'AED', 40,'active',v_su,v_meta),
    (v_tid,'TJ-US','United States',      'US federal tax (IRS)',                 'US','COUNTRY',1,NULL,'Internal Revenue Service (IRS)',    true, 'QUARTERLY', 'USD', 50,'active',v_su,v_meta),
    (v_tid,'TJ-SG','Singapore',          'Singapore single-tier tax',            'SG','COUNTRY',1,NULL,'IRAS',                             true, 'QUARTERLY', 'SGD', 60,'active',v_su,v_meta),
    (v_tid,'TJ-IN','India',              'India central government taxes',        'IN','COUNTRY',1,NULL,'CBIC',                             true, 'MONTHLY',   'INR', 70,'active',v_su,v_meta),
    (v_tid,'TJ-CA','Canada',             'Canada federal (CRA)',                  'CA','COUNTRY',1,NULL,'Canada Revenue Agency (CRA)',       true, 'QUARTERLY', 'CAD', 80,'active',v_su,v_meta),
    (v_tid,'TJ-DE','Germany',            'German federal tax office',             'DE','COUNTRY',1,NULL,'Bundeszentralamt für Steuern',      true, 'MONTHLY',   'EUR', 90,'active',v_su,v_meta),
    (v_tid,'TJ-TW','Taiwan',             'Taiwan Ministry of Finance',            'TW','COUNTRY',1,NULL,'National Taxation Bureau',          true, 'BIMONTHLY', 'TWD',100,'active',v_su,v_meta),
    (v_tid,'TJ-ZA','South Africa',       'South African Revenue Service',         'ZA','COUNTRY',1,NULL,'SARS',                             true, 'MONTHLY',   'ZAR',110,'active',v_su,v_meta),
    (v_tid,'TJ-GB','United Kingdom',     'HMRC',                                  'GB','COUNTRY',1,NULL,'HM Revenue & Customs (HMRC)',       true, 'QUARTERLY', 'GBP',120,'active',v_su,v_meta),
    (v_tid,'TJ-JP','Japan',              'Japan National Tax Agency',              'JP','COUNTRY',1,NULL,'National Tax Agency (NTA)',         true, 'MONTHLY',   'JPY',130,'active',v_su,v_meta),
    (v_tid,'TJ-PH','Philippines',        'Bureau of Internal Revenue',             'PH','COUNTRY',1,NULL,'Bureau of Internal Revenue (BIR)', true, 'MONTHLY',   'PHP',140,'active',v_su,v_meta)
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, authority_name = EXCLUDED.authority_name,
        updated_at = now(), updated_by = v_su
    WHERE (master.tax_jurisdiction.name, master.tax_jurisdiction.authority_name)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.authority_name);

    -- ══════════════════════════════════════════════════════════════════════
    -- L2: Sub-jurisdictions (only where structurally needed)
    -- ══════════════════════════════════════════════════════════════════════
    SELECT id INTO v_in FROM master.tax_jurisdiction
    WHERE tenant_id = v_tid AND code = 'TJ-IN';
    SELECT id INTO v_us FROM master.tax_jurisdiction
    WHERE tenant_id = v_tid AND code = 'TJ-US';

    INSERT INTO master.tax_jurisdiction
        (tenant_id, code, name, description, country_code,
         state_region_code, jurisdiction_type, level_no, parent_id,
         authority_name, registration_required, filing_frequency,
         currency_code, sort_order, status, created_by, metadata)
    VALUES
    -- India states for SGST split
    (v_tid,'TJ-IN-TN','India — Tamil Nadu',  'SGST jurisdiction','IN','TN','STATE',2,v_in,'TN Commercial Tax Dept',true,'MONTHLY','INR',71,'active',v_su,v_meta),
    (v_tid,'TJ-IN-MH','India — Maharashtra', 'SGST jurisdiction','IN','MH','STATE',2,v_in,'MH GST Dept',          true,'MONTHLY','INR',72,'active',v_su,v_meta),
    -- US state for sales tax
    (v_tid,'TJ-US-CA','United States — California','California state tax','US','CA','STATE',2,v_us,'California FTB',true,'QUARTERLY','USD',51,'active',v_su,v_meta)
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        authority_name = EXCLUDED.authority_name,
        updated_at = now(), updated_by = v_su
    WHERE (master.tax_jurisdiction.name, master.tax_jurisdiction.description,
           master.tax_jurisdiction.authority_name)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.description, EXCLUDED.authority_name);

    -- ══════════════════════════════════════════════════════════════════════
    -- ASSERTIONS
    -- ══════════════════════════════════════════════════════════════════════

    -- A1: Exactly 14 L1 country jurisdictions
    IF (SELECT count(*) FROM master.tax_jurisdiction
        WHERE tenant_id = v_tid AND level_no = 1) != 14
    THEN RAISE EXCEPTION '320 FAIL: expected 14 L1 country jurisdictions, got %',
        (SELECT count(*) FROM master.tax_jurisdiction WHERE tenant_id = v_tid AND level_no = 1);
    END IF;

    -- A2: Every L2 jurisdiction has a valid L1 parent
    IF EXISTS (
        SELECT id FROM master.tax_jurisdiction
        WHERE tenant_id = v_tid AND level_no = 2
          AND (parent_id IS NULL OR parent_id NOT IN (
              SELECT id FROM master.tax_jurisdiction
              WHERE tenant_id = v_tid AND level_no = 1))
    ) THEN RAISE EXCEPTION '320 FAIL: L2 jurisdiction with missing or invalid parent'; END IF;

    -- A3: No duplicate country_codes at L1
    IF EXISTS (
        SELECT country_code, count(*) FROM master.tax_jurisdiction
        WHERE tenant_id = v_tid AND level_no = 1
        GROUP BY country_code HAVING count(*) > 1
    ) THEN RAISE EXCEPTION '320 FAIL: duplicate country_code at L1'; END IF;

    -- A4: Minimum jurisdiction count
    IF (SELECT count(*) FROM master.tax_jurisdiction WHERE tenant_id = v_tid) < 17
    THEN RAISE EXCEPTION '320 FAIL: expected ≥17 jurisdictions (14 L1 + 3 L2), got %',
        (SELECT count(*) FROM master.tax_jurisdiction WHERE tenant_id = v_tid);
    END IF;

    RAISE NOTICE '320: % jurisdictions (14 L1 countries + 3 L2 states)',
        (SELECT count(*) FROM master.tax_jurisdiction WHERE tenant_id = v_tid);
END $seed$;
