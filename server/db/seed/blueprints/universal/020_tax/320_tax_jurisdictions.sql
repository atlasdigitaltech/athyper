-- Flat (non-hierarchical) tax_jurisdiction registry: 14 country rows + 3 sub-regions.
-- State rows are independent — distinguished by jurisdiction_type and the
-- (country_code, state_region_code) FK to shared.state_region.
-- Sub-jurisdictions seeded only where structurally needed (IN SGST: TN/MH; US state: CA).
-- Curated canonical 17-row list — C0 deletes any non-canonical rows down the FK chain.

DO $seed$
DECLARE
    v_tid  uuid;
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_meta jsonb := '{"_seed": {"pack": "320_org", "version": "3.0.0"}}'::jsonb;
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    -- C0 prune stale jurisdictions. No ON DELETE CASCADE here, so walk the FK
    -- chain manually: ledger.tax_calculation → tax_rate_schedule → tax_group_component
    -- → tax_rate_schedule → tax_jurisdiction (company_code FKs are protected).
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
                    'TJ-IN','TJ-CA','TJ-DE','TJ-TW','TJ-ZA','TJ-GB','TJ-JP','TJ-PH',
                    'TJ-IN-TN','TJ-IN-MH','TJ-US-CA'
                  )));

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
                    'TJ-IN','TJ-CA','TJ-DE','TJ-TW','TJ-ZA','TJ-GB','TJ-JP','TJ-PH',
                    'TJ-IN-TN','TJ-IN-MH','TJ-US-CA'
                  )));

    DELETE FROM control.tax_rate_schedule
    WHERE tenant_id    = v_tid
      AND jurisdiction_id IN (
          SELECT id FROM master.tax_jurisdiction
          WHERE tenant_id = v_tid
            AND code NOT IN (
              'TJ-MY','TJ-QA','TJ-SA','TJ-AE','TJ-US','TJ-SG',
              'TJ-IN','TJ-CA','TJ-DE','TJ-TW','TJ-ZA','TJ-GB','TJ-JP','TJ-PH',
              'TJ-IN-TN','TJ-IN-MH','TJ-US-CA'
            ));

    -- Skip rows still referenced by an active company_code (cleanup is best-effort).
    DELETE FROM master.tax_jurisdiction tj
    WHERE tenant_id = v_tid
      AND code NOT IN (
          'TJ-MY','TJ-QA','TJ-SA','TJ-AE','TJ-US','TJ-SG',
          'TJ-IN','TJ-CA','TJ-DE','TJ-TW','TJ-ZA','TJ-GB','TJ-JP','TJ-PH',
          'TJ-IN-TN','TJ-IN-MH','TJ-US-CA'
      )
      AND NOT EXISTS (
          SELECT 1
          FROM master.company_code cc
          WHERE cc.tenant_id = v_tid
            AND cc.tax_jurisdiction_id = tj.id
      );

    -- Country-level rows (14). wht_section_required=true on a jurisdiction means
    -- every WHT pricing-component row must carry a section/code (TDS section, BIR
    -- ATC, etc.) — enforced by pricing-component.service.ts WS-B.
    INSERT INTO master.tax_jurisdiction
        (tenant_id, code, name, description, country_code,
         jurisdiction_type,
         authority_name, registration_required, wht_section_required, filing_frequency,
         sort_order, status, created_by, metadata)
    VALUES
    (v_tid,'TJ-MY','Malaysia',           'Malaysian federal tax authority',      'MY','country','Lembaga Hasil Dalam Negeri (LHDN)',true, false,'monthly',    10,'active',v_su,v_meta),
    (v_tid,'TJ-QA','Qatar',              'Qatar federal — limited tax regime',   'QA','country','General Tax Authority (GTA)',       false,false,'annually',   20,'active',v_su,v_meta),
    (v_tid,'TJ-SA','Saudi Arabia',       'Saudi tax + zakat authority',          'SA','country','ZATCA',                             true, false,'monthly',    30,'active',v_su,v_meta),
    (v_tid,'TJ-AE','United Arab Emirates','UAE federal tax authority',           'AE','country','Federal Tax Authority (FTA)',       true, false,'quarterly',  40,'active',v_su,v_meta),
    (v_tid,'TJ-US','United States',      'US federal tax (IRS)',                 'US','country','Internal Revenue Service (IRS)',    true, false,'quarterly',  50,'active',v_su,v_meta),
    (v_tid,'TJ-SG','Singapore',          'Singapore single-tier tax',            'SG','country','IRAS',                              true, false,'quarterly',  60,'active',v_su,v_meta),
    (v_tid,'TJ-IN','India',              'India central government taxes',       'IN','country','CBIC',                              true, true, 'monthly',    70,'active',v_su,v_meta),
    (v_tid,'TJ-CA','Canada',             'Canada federal (CRA)',                 'CA','country','Canada Revenue Agency (CRA)',       true, false,'quarterly',  80,'active',v_su,v_meta),
    (v_tid,'TJ-DE','Germany',            'German federal tax office',            'DE','country','Bundeszentralamt für Steuern',      true, false,'monthly',    90,'active',v_su,v_meta),
    (v_tid,'TJ-TW','Taiwan',             'Taiwan Ministry of Finance',           'TW','country','National Taxation Bureau',          true, false,'bimonthly', 100,'active',v_su,v_meta),
    (v_tid,'TJ-ZA','South Africa',       'South African Revenue Service',        'ZA','country','SARS',                              true, false,'monthly',   110,'active',v_su,v_meta),
    (v_tid,'TJ-GB','United Kingdom',     'HMRC',                                 'GB','country','HM Revenue & Customs (HMRC)',       true, false,'quarterly', 120,'active',v_su,v_meta),
    (v_tid,'TJ-JP','Japan',              'Japan National Tax Agency',            'JP','country','National Tax Agency (NTA)',         true, false,'monthly',   130,'active',v_su,v_meta),
    (v_tid,'TJ-PH','Philippines',        'Bureau of Internal Revenue',           'PH','country','Bureau of Internal Revenue (BIR)',  true, true, 'monthly',   140,'active',v_su,v_meta)
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, authority_name = EXCLUDED.authority_name,
        jurisdiction_type = EXCLUDED.jurisdiction_type,
        wht_section_required = EXCLUDED.wht_section_required,
        filing_frequency = EXCLUDED.filing_frequency,
        updated_at = now(), updated_by = v_su
    WHERE (master.tax_jurisdiction.name, master.tax_jurisdiction.authority_name,
           master.tax_jurisdiction.jurisdiction_type,
           master.tax_jurisdiction.wht_section_required,
           master.tax_jurisdiction.filing_frequency)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.authority_name,
           EXCLUDED.jurisdiction_type,
           EXCLUDED.wht_section_required,
           EXCLUDED.filing_frequency);

    -- State-level rows (3). India SGST jurisdictions inherit IN wht_section_required=true.
    INSERT INTO master.tax_jurisdiction
        (tenant_id, code, name, description, country_code,
         state_region_code, jurisdiction_type,
         authority_name, registration_required, wht_section_required, filing_frequency,
         sort_order, status, created_by, metadata)
    VALUES
    (v_tid,'TJ-IN-TN','India — Tamil Nadu',           'SGST jurisdiction',   'IN','IN-TN','state','TN Commercial Tax Dept', true,true, 'monthly',  71,'active',v_su,v_meta),
    (v_tid,'TJ-IN-MH','India — Maharashtra',          'SGST jurisdiction',   'IN','IN-MH','state','MH GST Dept',            true,true, 'monthly',  72,'active',v_su,v_meta),
    (v_tid,'TJ-US-CA','United States — California',   'California state tax','US','US-CA','state','California FTB',         true,false,'quarterly',51,'active',v_su,v_meta)
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name, description = EXCLUDED.description,
        authority_name = EXCLUDED.authority_name,
        state_region_code = EXCLUDED.state_region_code,
        jurisdiction_type = EXCLUDED.jurisdiction_type,
        wht_section_required = EXCLUDED.wht_section_required,
        filing_frequency = EXCLUDED.filing_frequency,
        updated_at = now(), updated_by = v_su
    WHERE (master.tax_jurisdiction.name, master.tax_jurisdiction.description,
           master.tax_jurisdiction.authority_name, master.tax_jurisdiction.state_region_code,
           master.tax_jurisdiction.jurisdiction_type,
           master.tax_jurisdiction.wht_section_required,
           master.tax_jurisdiction.filing_frequency)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.description, EXCLUDED.authority_name,
           EXCLUDED.state_region_code,
           EXCLUDED.jurisdiction_type,
           EXCLUDED.wht_section_required,
           EXCLUDED.filing_frequency);

    IF (SELECT count(*) FROM master.tax_jurisdiction
        WHERE tenant_id = v_tid
          AND jurisdiction_type = 'country'
          AND code IN (
              'TJ-MY','TJ-QA','TJ-SA','TJ-AE','TJ-US','TJ-SG',
              'TJ-IN','TJ-CA','TJ-DE','TJ-TW','TJ-ZA','TJ-GB','TJ-JP','TJ-PH'
          )) != 14
    THEN RAISE EXCEPTION '320 FAIL: expected 14 country jurisdictions, got %',
        (SELECT count(*) FROM master.tax_jurisdiction
         WHERE tenant_id = v_tid
           AND jurisdiction_type = 'country'
           AND code IN (
               'TJ-MY','TJ-QA','TJ-SA','TJ-AE','TJ-US','TJ-SG',
               'TJ-IN','TJ-CA','TJ-DE','TJ-TW','TJ-ZA','TJ-GB','TJ-JP','TJ-PH'
           ));
    END IF;

    IF EXISTS (
        SELECT country_code FROM master.tax_jurisdiction
        WHERE tenant_id = v_tid
          AND jurisdiction_type = 'country'
          AND code IN (
              'TJ-MY','TJ-QA','TJ-SA','TJ-AE','TJ-US','TJ-SG',
              'TJ-IN','TJ-CA','TJ-DE','TJ-TW','TJ-ZA','TJ-GB','TJ-JP','TJ-PH'
          )
        GROUP BY country_code HAVING count(*) > 1
    ) THEN RAISE EXCEPTION '320 FAIL: duplicate country_code at country level'; END IF;

    IF (SELECT count(*) FROM master.tax_jurisdiction
        WHERE tenant_id = v_tid
          AND jurisdiction_type = 'state'
          AND code IN ('TJ-IN-TN','TJ-IN-MH','TJ-US-CA')
          AND state_region_code IS NOT NULL) != 3
    THEN RAISE EXCEPTION '320 FAIL: expected 3 state jurisdictions with ISO codes'; END IF;

    IF (SELECT count(*) FROM master.tax_jurisdiction WHERE tenant_id = v_tid) < 17
    THEN RAISE EXCEPTION '320 FAIL: expected ≥17 jurisdictions (14 country + 3 state), got %',
        (SELECT count(*) FROM master.tax_jurisdiction WHERE tenant_id = v_tid);
    END IF;

    RAISE NOTICE '320: % jurisdictions (14 country + 3 state)',
        (SELECT count(*) FROM master.tax_jurisdiction WHERE tenant_id = v_tid);
END $seed$;
