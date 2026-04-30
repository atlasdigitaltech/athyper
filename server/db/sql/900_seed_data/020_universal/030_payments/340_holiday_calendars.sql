-- ============================================================================
-- 340_holiday_calendars.sql — Holiday calendars + days for 14 ATHYPER jurisdictions
-- ============================================================================
-- Tables: master.holiday_calendar, master.holiday_calendar_day
-- Scope: 1 tenant-default calendar + 14 country-level calendars
--        Public holidays for 2025 and 2026 (5-10 per country per year)
-- Idempotency: UPSERT headers; delete-owned-then-reinsert days
-- Depends: master.tenant, shared.country
-- ============================================================================

DO $seed$
DECLARE
    v_tid   uuid;
    v_su    uuid := '00000000-0000-0000-0000-000000000000';
    v_pack  text := '340_org';
    v_ver   text := '2.0.0';
    v_meta  jsonb := '{"_seed": {"pack": "340_org", "version": "2.0.0"}}'::jsonb;
    v_cal_count  int;
    v_day_count  int;
    v_min_days   int;
    v_bad_wkend  int;
    r            record;
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- 1. UPSERT HOLIDAY CALENDAR HEADERS (15 total)
    -- ══════════════════════════════════════════════════════════════════════

    DROP TABLE IF EXISTS tmp_cal;
    CREATE TEMP TABLE tmp_cal (
        code            text     NOT NULL PRIMARY KEY,
        name            text     NOT NULL,
        country_code    character(2),
        weekend_pattern text     NOT NULL DEFAULT 'SAT_SUN',
        is_default      boolean  NOT NULL DEFAULT false,
        sort_order      smallint NOT NULL DEFAULT 0
    ) ON COMMIT DROP;

    INSERT INTO tmp_cal (code, name, country_code, weekend_pattern, is_default, sort_order) VALUES
        ('HC-DEFAULT', 'Default Calendar',  NULL, 'SAT_SUN', true,  0),
        ('HC-MY',      'Malaysia',          'MY', 'SAT_SUN', false, 10),
        ('HC-QA',      'Qatar',             'QA', 'FRI_SAT', false, 20),
        ('HC-SA',      'Saudi Arabia',      'SA', 'FRI_SAT', false, 30),
        ('HC-AE',      'UAE',               'AE', 'SAT_SUN', false, 40),
        ('HC-US',      'United States',     'US', 'SAT_SUN', false, 50),
        ('HC-SG',      'Singapore',         'SG', 'SAT_SUN', false, 60),
        ('HC-IN',      'India',             'IN', 'SAT_SUN', false, 70),
        ('HC-CA',      'Canada',            'CA', 'SAT_SUN', false, 80),
        ('HC-DE',      'Germany',           'DE', 'SAT_SUN', false, 90),
        ('HC-TW',      'Taiwan',            'TW', 'SAT_SUN', false, 100),
        ('HC-ZA',      'South Africa',      'ZA', 'SAT_SUN', false, 110),
        ('HC-GB',      'United Kingdom',    'GB', 'SAT_SUN', false, 120),
        ('HC-JP',      'Japan',             'JP', 'SAT_SUN', false, 130),
        ('HC-PH',      'Philippines',       'PH', 'SAT_SUN', false, 140);

    -- is_default is forced to false in both the INSERT and DO UPDATE paths.
    -- trg_hc_single_default fires BEFORE INSERT OR UPDATE OF is_default and does
    -- UPDATE master.holiday_calendar SET is_default=false on other rows. When 15
    -- rows are speculatively inserted in one batch that includes HC-DEFAULT
    -- (is_default=true), the trigger's cross-row UPDATE collides with the other
    -- in-flight rows → "affect row a second time". Forcing false here suppresses
    -- the trigger's cross-row UPDATE; is_default is reconciled below.
    INSERT INTO master.holiday_calendar
        (tenant_id, code, name, country_code, weekend_pattern, is_default, sort_order,
         metadata, status, created_by)
    SELECT
        v_tid, t.code, t.name, t.country_code, t.weekend_pattern,
        false,   -- always false here; reconciled by the UPDATE below
        t.sort_order, v_meta, 'active', v_su
    FROM tmp_cal t
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name            = EXCLUDED.name,
        country_code    = EXCLUDED.country_code,
        weekend_pattern = EXCLUDED.weekend_pattern,
        sort_order      = EXCLUDED.sort_order,
        metadata        = EXCLUDED.metadata,
        updated_at      = now(),
        updated_by      = v_su
    WHERE (master.holiday_calendar.name, master.holiday_calendar.country_code,
           master.holiday_calendar.weekend_pattern,
           master.holiday_calendar.sort_order, master.holiday_calendar.metadata)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.country_code,
           EXCLUDED.weekend_pattern,
           EXCLUDED.sort_order, EXCLUDED.metadata);

    -- Reconcile is_default: single-row UPDATE so trg_hc_single_default fires
    -- exactly once, clearing any stale true flags on other rows safely.
    UPDATE master.holiday_calendar
       SET is_default = true,
           updated_at = now(),
           updated_by = v_su
     WHERE tenant_id = v_tid
       AND code = 'HC-DEFAULT'
       AND is_default = false;

    -- ══════════════════════════════════════════════════════════════════════
    -- 2. BUILD RESOLVE MAP: calendar code -> id
    -- ══════════════════════════════════════════════════════════════════════

    DROP TABLE IF EXISTS tmp_cal_map;
    CREATE TEMP TABLE tmp_cal_map (
        code text PRIMARY KEY,
        cal_id uuid NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO tmp_cal_map (code, cal_id)
    SELECT hc.code, hc.id
    FROM master.holiday_calendar hc
    WHERE hc.tenant_id = v_tid
      AND hc.code IN (SELECT t.code FROM tmp_cal t);

    -- ══════════════════════════════════════════════════════════════════════
    -- 3. STAGE ALL HOLIDAYS IN TEMP TABLE
    -- ══════════════════════════════════════════════════════════════════════

    DROP TABLE IF EXISTS tmp_hol;
    CREATE TEMP TABLE tmp_hol (
        cal_code  text    NOT NULL,
        cal_year  smallint NOT NULL,
        hol_date  date    NOT NULL,
        hol_name  text    NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO tmp_hol (cal_code, cal_year, hol_date, hol_name) VALUES

    -- ─── MALAYSIA (HC-MY) ──────────────────────────────────────────────
    -- 2025
    ('HC-MY', 2025, '2025-01-01', 'New Year''s Day'),
    ('HC-MY', 2025, '2025-01-29', 'Thaipusam'),
    ('HC-MY', 2025, '2025-02-01', 'Federal Territory Day'),
    ('HC-MY', 2025, '2025-03-30', 'Hari Raya Aidilfitri'),
    ('HC-MY', 2025, '2025-03-31', 'Hari Raya Aidilfitri (2nd Day)'),
    ('HC-MY', 2025, '2025-05-01', 'Labour Day'),
    ('HC-MY', 2025, '2025-06-06', 'Hari Raya Haji'),
    ('HC-MY', 2025, '2025-08-31', 'Merdeka Day'),
    ('HC-MY', 2025, '2025-09-16', 'Malaysia Day'),
    ('HC-MY', 2025, '2025-12-25', 'Christmas Day'),
    -- 2026
    ('HC-MY', 2026, '2026-01-01', 'New Year''s Day'),
    ('HC-MY', 2026, '2026-01-17', 'Thaipusam'),
    ('HC-MY', 2026, '2026-02-01', 'Federal Territory Day'),
    ('HC-MY', 2026, '2026-03-20', 'Hari Raya Aidilfitri'),
    ('HC-MY', 2026, '2026-03-21', 'Hari Raya Aidilfitri (2nd Day)'),
    ('HC-MY', 2026, '2026-05-01', 'Labour Day'),
    ('HC-MY', 2026, '2026-05-27', 'Hari Raya Haji'),
    ('HC-MY', 2026, '2026-08-31', 'Merdeka Day'),
    ('HC-MY', 2026, '2026-09-16', 'Malaysia Day'),
    ('HC-MY', 2026, '2026-12-25', 'Christmas Day'),

    -- ─── QATAR (HC-QA) ────────────────────────────────────────────────
    -- 2025
    ('HC-QA', 2025, '2025-02-09', 'Sports Day'),
    ('HC-QA', 2025, '2025-03-30', 'Eid al-Fitr'),
    ('HC-QA', 2025, '2025-03-31', 'Eid al-Fitr (2nd Day)'),
    ('HC-QA', 2025, '2025-04-01', 'Eid al-Fitr (3rd Day)'),
    ('HC-QA', 2025, '2025-06-06', 'Eid al-Adha'),
    ('HC-QA', 2025, '2025-06-07', 'Eid al-Adha (2nd Day)'),
    ('HC-QA', 2025, '2025-06-08', 'Eid al-Adha (3rd Day)'),
    ('HC-QA', 2025, '2025-12-18', 'Qatar National Day'),
    -- 2026
    ('HC-QA', 2026, '2026-02-09', 'Sports Day'),
    ('HC-QA', 2026, '2026-03-19', 'Eid al-Fitr'),
    ('HC-QA', 2026, '2026-03-20', 'Eid al-Fitr (2nd Day)'),
    ('HC-QA', 2026, '2026-03-21', 'Eid al-Fitr (3rd Day)'),
    ('HC-QA', 2026, '2026-05-26', 'Eid al-Adha'),
    ('HC-QA', 2026, '2026-05-27', 'Eid al-Adha (2nd Day)'),
    ('HC-QA', 2026, '2026-05-28', 'Eid al-Adha (3rd Day)'),
    ('HC-QA', 2026, '2026-12-18', 'Qatar National Day'),

    -- ─── SAUDI ARABIA (HC-SA) ─────────────────────────────────────────
    -- 2025
    ('HC-SA', 2025, '2025-02-22', 'Founding Day'),
    ('HC-SA', 2025, '2025-03-30', 'Eid al-Fitr'),
    ('HC-SA', 2025, '2025-03-31', 'Eid al-Fitr (2nd Day)'),
    ('HC-SA', 2025, '2025-04-01', 'Eid al-Fitr (3rd Day)'),
    ('HC-SA', 2025, '2025-06-05', 'Eid al-Adha Eve'),
    ('HC-SA', 2025, '2025-06-06', 'Eid al-Adha'),
    ('HC-SA', 2025, '2025-06-07', 'Eid al-Adha (2nd Day)'),
    ('HC-SA', 2025, '2025-09-23', 'Saudi National Day'),
    -- 2026
    ('HC-SA', 2026, '2026-02-22', 'Founding Day'),
    ('HC-SA', 2026, '2026-03-19', 'Eid al-Fitr'),
    ('HC-SA', 2026, '2026-03-20', 'Eid al-Fitr (2nd Day)'),
    ('HC-SA', 2026, '2026-03-21', 'Eid al-Fitr (3rd Day)'),
    ('HC-SA', 2026, '2026-05-25', 'Eid al-Adha Eve'),
    ('HC-SA', 2026, '2026-05-26', 'Eid al-Adha'),
    ('HC-SA', 2026, '2026-05-27', 'Eid al-Adha (2nd Day)'),
    ('HC-SA', 2026, '2026-05-28', 'Eid al-Adha (3rd Day)'),
    ('HC-SA', 2026, '2026-09-23', 'Saudi National Day'),

    -- ─── UAE (HC-AE) ──────────────────────────────────────────────────
    -- 2025
    ('HC-AE', 2025, '2025-01-01', 'New Year''s Day'),
    ('HC-AE', 2025, '2025-03-30', 'Eid al-Fitr'),
    ('HC-AE', 2025, '2025-03-31', 'Eid al-Fitr (2nd Day)'),
    ('HC-AE', 2025, '2025-04-01', 'Eid al-Fitr (3rd Day)'),
    ('HC-AE', 2025, '2025-06-05', 'Arafat Day'),
    ('HC-AE', 2025, '2025-06-06', 'Eid al-Adha'),
    ('HC-AE', 2025, '2025-06-07', 'Eid al-Adha (2nd Day)'),
    ('HC-AE', 2025, '2025-07-08', 'Al Hijra (Islamic New Year)'),
    ('HC-AE', 2025, '2025-12-02', 'National Day'),
    ('HC-AE', 2025, '2025-12-03', 'National Day (2nd Day)'),
    -- 2026
    ('HC-AE', 2026, '2026-01-01', 'New Year''s Day'),
    ('HC-AE', 2026, '2026-03-19', 'Eid al-Fitr'),
    ('HC-AE', 2026, '2026-03-20', 'Eid al-Fitr (2nd Day)'),
    ('HC-AE', 2026, '2026-03-21', 'Eid al-Fitr (3rd Day)'),
    ('HC-AE', 2026, '2026-05-25', 'Arafat Day'),
    ('HC-AE', 2026, '2026-05-26', 'Eid al-Adha'),
    ('HC-AE', 2026, '2026-05-27', 'Eid al-Adha (2nd Day)'),
    ('HC-AE', 2026, '2026-06-27', 'Al Hijra (Islamic New Year)'),
    ('HC-AE', 2026, '2026-12-02', 'National Day'),
    ('HC-AE', 2026, '2026-12-03', 'National Day (2nd Day)'),

    -- ─── UNITED STATES (HC-US) ────────────────────────────────────────
    -- 2025
    ('HC-US', 2025, '2025-01-01', 'New Year''s Day'),
    ('HC-US', 2025, '2025-01-20', 'Martin Luther King Jr. Day'),
    ('HC-US', 2025, '2025-02-17', 'Presidents'' Day'),
    ('HC-US', 2025, '2025-05-26', 'Memorial Day'),
    ('HC-US', 2025, '2025-07-04', 'Independence Day'),
    ('HC-US', 2025, '2025-09-01', 'Labor Day'),
    ('HC-US', 2025, '2025-11-27', 'Thanksgiving Day'),
    ('HC-US', 2025, '2025-12-25', 'Christmas Day'),
    -- 2026
    ('HC-US', 2026, '2026-01-01', 'New Year''s Day'),
    ('HC-US', 2026, '2026-01-19', 'Martin Luther King Jr. Day'),
    ('HC-US', 2026, '2026-02-16', 'Presidents'' Day'),
    ('HC-US', 2026, '2026-05-25', 'Memorial Day'),
    ('HC-US', 2026, '2026-07-04', 'Independence Day'),
    ('HC-US', 2026, '2026-09-07', 'Labor Day'),
    ('HC-US', 2026, '2026-11-26', 'Thanksgiving Day'),
    ('HC-US', 2026, '2026-12-25', 'Christmas Day'),

    -- ─── SINGAPORE (HC-SG) ────────────────────────────────────────────
    -- 2025
    ('HC-SG', 2025, '2025-01-01', 'New Year''s Day'),
    ('HC-SG', 2025, '2025-01-29', 'Chinese New Year'),
    ('HC-SG', 2025, '2025-03-31', 'Hari Raya Puasa'),
    ('HC-SG', 2025, '2025-04-18', 'Good Friday'),
    ('HC-SG', 2025, '2025-05-01', 'Labour Day'),
    ('HC-SG', 2025, '2025-05-12', 'Vesak Day'),
    ('HC-SG', 2025, '2025-06-07', 'Hari Raya Haji'),
    ('HC-SG', 2025, '2025-08-09', 'National Day'),
    ('HC-SG', 2025, '2025-10-20', 'Deepavali'),
    ('HC-SG', 2025, '2025-12-25', 'Christmas Day'),
    -- 2026
    ('HC-SG', 2026, '2026-01-01', 'New Year''s Day'),
    ('HC-SG', 2026, '2026-02-17', 'Chinese New Year'),
    ('HC-SG', 2026, '2026-03-20', 'Hari Raya Puasa'),
    ('HC-SG', 2026, '2026-04-03', 'Good Friday'),
    ('HC-SG', 2026, '2026-05-01', 'Labour Day'),
    ('HC-SG', 2026, '2026-05-27', 'Hari Raya Haji'),
    ('HC-SG', 2026, '2026-05-31', 'Vesak Day'),
    ('HC-SG', 2026, '2026-08-09', 'National Day'),
    ('HC-SG', 2026, '2026-11-08', 'Deepavali'),
    ('HC-SG', 2026, '2026-12-25', 'Christmas Day'),

    -- ─── INDIA (HC-IN) ────────────────────────────────────────────────
    -- 2025
    ('HC-IN', 2025, '2025-01-26', 'Republic Day'),
    ('HC-IN', 2025, '2025-03-14', 'Holi'),
    ('HC-IN', 2025, '2025-03-31', 'Eid ul-Fitr'),
    ('HC-IN', 2025, '2025-04-18', 'Good Friday'),
    ('HC-IN', 2025, '2025-05-01', 'May Day'),
    ('HC-IN', 2025, '2025-06-07', 'Eid ul-Adha'),
    ('HC-IN', 2025, '2025-08-15', 'Independence Day'),
    ('HC-IN', 2025, '2025-10-02', 'Gandhi Jayanti'),
    ('HC-IN', 2025, '2025-10-20', 'Dussehra'),
    ('HC-IN', 2025, '2025-11-12', 'Diwali'),
    ('HC-IN', 2025, '2025-12-25', 'Christmas Day'),
    -- 2026
    ('HC-IN', 2026, '2026-01-26', 'Republic Day'),
    ('HC-IN', 2026, '2026-03-04', 'Holi'),
    ('HC-IN', 2026, '2026-03-20', 'Eid ul-Fitr'),
    ('HC-IN', 2026, '2026-04-03', 'Good Friday'),
    ('HC-IN', 2026, '2026-05-01', 'May Day'),
    ('HC-IN', 2026, '2026-05-27', 'Eid ul-Adha'),
    ('HC-IN', 2026, '2026-08-15', 'Independence Day'),
    ('HC-IN', 2026, '2026-10-02', 'Gandhi Jayanti'),
    ('HC-IN', 2026, '2026-11-01', 'Diwali'),
    ('HC-IN', 2026, '2026-12-25', 'Christmas Day'),

    -- ─── CANADA (HC-CA) ──────────────────────────────────────────────
    -- 2025
    ('HC-CA', 2025, '2025-01-01', 'New Year''s Day'),
    ('HC-CA', 2025, '2025-02-17', 'Family Day'),
    ('HC-CA', 2025, '2025-04-18', 'Good Friday'),
    ('HC-CA', 2025, '2025-05-19', 'Victoria Day'),
    ('HC-CA', 2025, '2025-07-01', 'Canada Day'),
    ('HC-CA', 2025, '2025-09-01', 'Labour Day'),
    ('HC-CA', 2025, '2025-10-13', 'Thanksgiving Day'),
    ('HC-CA', 2025, '2025-12-25', 'Christmas Day'),
    -- 2026
    ('HC-CA', 2026, '2026-01-01', 'New Year''s Day'),
    ('HC-CA', 2026, '2026-02-16', 'Family Day'),
    ('HC-CA', 2026, '2026-04-03', 'Good Friday'),
    ('HC-CA', 2026, '2026-05-18', 'Victoria Day'),
    ('HC-CA', 2026, '2026-07-01', 'Canada Day'),
    ('HC-CA', 2026, '2026-09-07', 'Labour Day'),
    ('HC-CA', 2026, '2026-10-12', 'Thanksgiving Day'),
    ('HC-CA', 2026, '2026-12-25', 'Christmas Day'),

    -- ─── GERMANY (HC-DE) ─────────────────────────────────────────────
    -- 2025
    ('HC-DE', 2025, '2025-01-01', 'Neujahr'),
    ('HC-DE', 2025, '2025-04-18', 'Karfreitag'),
    ('HC-DE', 2025, '2025-04-21', 'Ostermontag'),
    ('HC-DE', 2025, '2025-05-01', 'Tag der Arbeit'),
    ('HC-DE', 2025, '2025-05-29', 'Christi Himmelfahrt'),
    ('HC-DE', 2025, '2025-06-09', 'Pfingstmontag'),
    ('HC-DE', 2025, '2025-10-03', 'Tag der Deutschen Einheit'),
    ('HC-DE', 2025, '2025-12-25', 'Erster Weihnachtstag'),
    ('HC-DE', 2025, '2025-12-26', 'Zweiter Weihnachtstag'),
    -- 2026
    ('HC-DE', 2026, '2026-01-01', 'Neujahr'),
    ('HC-DE', 2026, '2026-04-03', 'Karfreitag'),
    ('HC-DE', 2026, '2026-04-06', 'Ostermontag'),
    ('HC-DE', 2026, '2026-05-01', 'Tag der Arbeit'),
    ('HC-DE', 2026, '2026-05-14', 'Christi Himmelfahrt'),
    ('HC-DE', 2026, '2026-05-25', 'Pfingstmontag'),
    ('HC-DE', 2026, '2026-10-03', 'Tag der Deutschen Einheit'),
    ('HC-DE', 2026, '2026-12-25', 'Erster Weihnachtstag'),
    ('HC-DE', 2026, '2026-12-26', 'Zweiter Weihnachtstag'),

    -- ─── TAIWAN (HC-TW) ──────────────────────────────────────────────
    -- 2025
    ('HC-TW', 2025, '2025-01-01', 'New Year''s Day'),
    ('HC-TW', 2025, '2025-01-28', 'Lunar New Year Eve'),
    ('HC-TW', 2025, '2025-01-29', 'Lunar New Year'),
    ('HC-TW', 2025, '2025-01-30', 'Lunar New Year (2nd Day)'),
    ('HC-TW', 2025, '2025-01-31', 'Lunar New Year (3rd Day)'),
    ('HC-TW', 2025, '2025-02-28', 'Peace Memorial Day'),
    ('HC-TW', 2025, '2025-04-04', 'Tomb Sweeping Day'),
    ('HC-TW', 2025, '2025-05-01', 'Labour Day'),
    ('HC-TW', 2025, '2025-06-02', 'Dragon Boat Festival'),
    ('HC-TW', 2025, '2025-10-06', 'Mid-Autumn Festival'),
    ('HC-TW', 2025, '2025-10-10', 'National Day'),
    -- 2026
    ('HC-TW', 2026, '2026-01-01', 'New Year''s Day'),
    ('HC-TW', 2026, '2026-02-16', 'Lunar New Year Eve'),
    ('HC-TW', 2026, '2026-02-17', 'Lunar New Year'),
    ('HC-TW', 2026, '2026-02-18', 'Lunar New Year (2nd Day)'),
    ('HC-TW', 2026, '2026-02-19', 'Lunar New Year (3rd Day)'),
    ('HC-TW', 2026, '2026-02-28', 'Peace Memorial Day'),
    ('HC-TW', 2026, '2026-04-05', 'Tomb Sweeping Day'),
    ('HC-TW', 2026, '2026-05-01', 'Labour Day'),
    ('HC-TW', 2026, '2026-06-19', 'Dragon Boat Festival'),
    ('HC-TW', 2026, '2026-09-25', 'Mid-Autumn Festival'),
    ('HC-TW', 2026, '2026-10-10', 'National Day'),

    -- ─── SOUTH AFRICA (HC-ZA) ────────────────────────────────────────
    -- 2025
    ('HC-ZA', 2025, '2025-01-01', 'New Year''s Day'),
    ('HC-ZA', 2025, '2025-03-21', 'Human Rights Day'),
    ('HC-ZA', 2025, '2025-04-18', 'Good Friday'),
    ('HC-ZA', 2025, '2025-04-21', 'Family Day'),
    ('HC-ZA', 2025, '2025-04-27', 'Freedom Day'),
    ('HC-ZA', 2025, '2025-05-01', 'Workers'' Day'),
    ('HC-ZA', 2025, '2025-06-16', 'Youth Day'),
    ('HC-ZA', 2025, '2025-08-09', 'National Women''s Day'),
    ('HC-ZA', 2025, '2025-09-24', 'Heritage Day'),
    ('HC-ZA', 2025, '2025-12-16', 'Day of Reconciliation'),
    ('HC-ZA', 2025, '2025-12-25', 'Christmas Day'),
    ('HC-ZA', 2025, '2025-12-26', 'Day of Goodwill'),
    -- 2026
    ('HC-ZA', 2026, '2026-01-01', 'New Year''s Day'),
    ('HC-ZA', 2026, '2026-03-21', 'Human Rights Day'),
    ('HC-ZA', 2026, '2026-04-03', 'Good Friday'),
    ('HC-ZA', 2026, '2026-04-06', 'Family Day'),
    ('HC-ZA', 2026, '2026-04-27', 'Freedom Day'),
    ('HC-ZA', 2026, '2026-05-01', 'Workers'' Day'),
    ('HC-ZA', 2026, '2026-06-16', 'Youth Day'),
    ('HC-ZA', 2026, '2026-08-09', 'National Women''s Day'),
    ('HC-ZA', 2026, '2026-09-24', 'Heritage Day'),
    ('HC-ZA', 2026, '2026-12-16', 'Day of Reconciliation'),
    ('HC-ZA', 2026, '2026-12-25', 'Christmas Day'),
    ('HC-ZA', 2026, '2026-12-26', 'Day of Goodwill'),

    -- ─── UNITED KINGDOM (HC-GB) ──────────────────────────────────────
    -- 2025
    ('HC-GB', 2025, '2025-01-01', 'New Year''s Day'),
    ('HC-GB', 2025, '2025-04-18', 'Good Friday'),
    ('HC-GB', 2025, '2025-04-21', 'Easter Monday'),
    ('HC-GB', 2025, '2025-05-05', 'Early May Bank Holiday'),
    ('HC-GB', 2025, '2025-05-26', 'Spring Bank Holiday'),
    ('HC-GB', 2025, '2025-08-25', 'Summer Bank Holiday'),
    ('HC-GB', 2025, '2025-12-25', 'Christmas Day'),
    ('HC-GB', 2025, '2025-12-26', 'Boxing Day'),
    -- 2026
    ('HC-GB', 2026, '2026-01-01', 'New Year''s Day'),
    ('HC-GB', 2026, '2026-04-03', 'Good Friday'),
    ('HC-GB', 2026, '2026-04-06', 'Easter Monday'),
    ('HC-GB', 2026, '2026-05-04', 'Early May Bank Holiday'),
    ('HC-GB', 2026, '2026-05-25', 'Spring Bank Holiday'),
    ('HC-GB', 2026, '2026-08-31', 'Summer Bank Holiday'),
    ('HC-GB', 2026, '2026-12-25', 'Christmas Day'),
    ('HC-GB', 2026, '2026-12-26', 'Boxing Day'),

    -- ─── JAPAN (HC-JP) ───────────────────────────────────────────────
    -- 2025
    ('HC-JP', 2025, '2025-01-01', 'New Year''s Day'),
    ('HC-JP', 2025, '2025-01-02', 'New Year Holiday (2nd)'),
    ('HC-JP', 2025, '2025-01-03', 'New Year Holiday (3rd)'),
    ('HC-JP', 2025, '2025-01-13', 'Coming of Age Day'),
    ('HC-JP', 2025, '2025-02-11', 'National Foundation Day'),
    ('HC-JP', 2025, '2025-02-23', 'Emperor''s Birthday'),
    ('HC-JP', 2025, '2025-03-20', 'Vernal Equinox Day'),
    ('HC-JP', 2025, '2025-04-29', 'Showa Day'),
    ('HC-JP', 2025, '2025-05-03', 'Constitution Memorial Day'),
    ('HC-JP', 2025, '2025-05-04', 'Greenery Day'),
    ('HC-JP', 2025, '2025-05-05', 'Children''s Day'),
    ('HC-JP', 2025, '2025-07-21', 'Marine Day'),
    ('HC-JP', 2025, '2025-08-11', 'Mountain Day'),
    ('HC-JP', 2025, '2025-09-15', 'Respect for the Aged Day'),
    ('HC-JP', 2025, '2025-09-23', 'Autumnal Equinox Day'),
    ('HC-JP', 2025, '2025-10-13', 'Sports Day'),
    ('HC-JP', 2025, '2025-11-03', 'Culture Day'),
    ('HC-JP', 2025, '2025-11-23', 'Labour Thanksgiving Day'),
    -- 2026
    ('HC-JP', 2026, '2026-01-01', 'New Year''s Day'),
    ('HC-JP', 2026, '2026-01-02', 'New Year Holiday (2nd)'),
    ('HC-JP', 2026, '2026-01-03', 'New Year Holiday (3rd)'),
    ('HC-JP', 2026, '2026-01-12', 'Coming of Age Day'),
    ('HC-JP', 2026, '2026-02-11', 'National Foundation Day'),
    ('HC-JP', 2026, '2026-02-23', 'Emperor''s Birthday'),
    ('HC-JP', 2026, '2026-03-20', 'Vernal Equinox Day'),
    ('HC-JP', 2026, '2026-04-29', 'Showa Day'),
    ('HC-JP', 2026, '2026-05-03', 'Constitution Memorial Day'),
    ('HC-JP', 2026, '2026-05-04', 'Greenery Day'),
    ('HC-JP', 2026, '2026-05-05', 'Children''s Day'),
    ('HC-JP', 2026, '2026-07-20', 'Marine Day'),
    ('HC-JP', 2026, '2026-08-11', 'Mountain Day'),
    ('HC-JP', 2026, '2026-09-21', 'Respect for the Aged Day'),
    ('HC-JP', 2026, '2026-09-23', 'Autumnal Equinox Day'),
    ('HC-JP', 2026, '2026-10-12', 'Sports Day'),
    ('HC-JP', 2026, '2026-11-03', 'Culture Day'),
    ('HC-JP', 2026, '2026-11-23', 'Labour Thanksgiving Day'),

    -- ─── PHILIPPINES (HC-PH) ─────────────────────────────────────────
    -- 2025
    ('HC-PH', 2025, '2025-01-01', 'New Year''s Day'),
    ('HC-PH', 2025, '2025-02-25', 'EDSA People Power Anniversary'),
    ('HC-PH', 2025, '2025-04-09', 'Araw ng Kagitingan'),
    ('HC-PH', 2025, '2025-04-17', 'Maundy Thursday'),
    ('HC-PH', 2025, '2025-04-18', 'Good Friday'),
    ('HC-PH', 2025, '2025-05-01', 'Labour Day'),
    ('HC-PH', 2025, '2025-06-12', 'Independence Day'),
    ('HC-PH', 2025, '2025-08-21', 'Ninoy Aquino Day'),
    ('HC-PH', 2025, '2025-08-25', 'National Heroes Day'),
    ('HC-PH', 2025, '2025-11-30', 'Bonifacio Day'),
    ('HC-PH', 2025, '2025-12-25', 'Christmas Day'),
    ('HC-PH', 2025, '2025-12-30', 'Rizal Day'),
    -- 2026
    ('HC-PH', 2026, '2026-01-01', 'New Year''s Day'),
    ('HC-PH', 2026, '2026-02-25', 'EDSA People Power Anniversary'),
    ('HC-PH', 2026, '2026-04-02', 'Maundy Thursday'),
    ('HC-PH', 2026, '2026-04-03', 'Good Friday'),
    ('HC-PH', 2026, '2026-04-09', 'Araw ng Kagitingan'),
    ('HC-PH', 2026, '2026-05-01', 'Labour Day'),
    ('HC-PH', 2026, '2026-06-12', 'Independence Day'),
    ('HC-PH', 2026, '2026-08-21', 'Ninoy Aquino Day'),
    ('HC-PH', 2026, '2026-08-31', 'National Heroes Day'),
    ('HC-PH', 2026, '2026-11-30', 'Bonifacio Day'),
    ('HC-PH', 2026, '2026-12-25', 'Christmas Day'),
    ('HC-PH', 2026, '2026-12-30', 'Rizal Day');

    -- ══════════════════════════════════════════════════════════════════════
    -- 4. DELETE SEED-OWNED HOLIDAY DAYS, THEN INSERT FRESH
    -- ══════════════════════════════════════════════════════════════════════

    DELETE FROM master.holiday_calendar_day
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack;

    INSERT INTO master.holiday_calendar_day
        (tenant_id, holiday_calendar_id, calendar_year, holiday_date,
         name, day_type, observance_type, is_half_day,
         metadata, created_by)
    SELECT
        v_tid,
        m.cal_id,
        h.cal_year,
        h.hol_date,
        h.hol_name,
        'HOLIDAY',
        'MANDATORY',
        false,
        v_meta,
        v_su
    FROM tmp_hol h
    JOIN tmp_cal_map m ON m.code = h.cal_code;

    -- ══════════════════════════════════════════════════════════════════════
    -- 5. ASSERTIONS
    -- ══════════════════════════════════════════════════════════════════════

    -- 5a. Exactly 15 calendars (1 default + 14 country)
    SELECT count(*) INTO v_cal_count
    FROM master.holiday_calendar
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack;

    IF v_cal_count <> 15 THEN
        RAISE EXCEPTION '340 FAIL: expected 15 calendars, found %', v_cal_count;
    END IF;

    -- 5b. Every country calendar has >= 5 holidays per year
    FOR r IN
        SELECT hc.code, hcd.calendar_year, count(*) AS cnt
        FROM master.holiday_calendar hc
        JOIN master.holiday_calendar_day hcd ON hcd.holiday_calendar_id = hc.id
        WHERE hc.tenant_id = v_tid
          AND hc.metadata->'_seed'->>'pack' = v_pack
          AND hc.code <> 'HC-DEFAULT'
        GROUP BY hc.code, hcd.calendar_year
        HAVING count(*) < 5
    LOOP
        RAISE EXCEPTION '340 FAIL: calendar % year % has only % holidays (need >= 5)',
            r.code, r.calendar_year, r.cnt;
    END LOOP;

    -- 5c. HC-QA and HC-SA use FRI_SAT weekend pattern
    IF EXISTS (
        SELECT 1 FROM master.holiday_calendar
        WHERE tenant_id = v_tid
          AND code IN ('HC-QA', 'HC-SA')
          AND weekend_pattern <> 'FRI_SAT'
    ) THEN
        RAISE EXCEPTION '340 FAIL: HC-QA and HC-SA must use FRI_SAT weekend pattern';
    END IF;

    -- 5d. Warning: check if any holiday falls on the calendar''s own weekend
    --     (SAT_SUN = dow 0,6; FRI_SAT = dow 5,6)
    SELECT count(*) INTO v_bad_wkend
    FROM master.holiday_calendar hc
    JOIN master.holiday_calendar_day hcd ON hcd.holiday_calendar_id = hc.id
    WHERE hc.tenant_id = v_tid
      AND hc.metadata->'_seed'->>'pack' = v_pack
      AND (
          (hc.weekend_pattern = 'SAT_SUN' AND EXTRACT(DOW FROM hcd.holiday_date) IN (0, 6))
          OR
          (hc.weekend_pattern = 'FRI_SAT' AND EXTRACT(DOW FROM hcd.holiday_date) IN (5, 6))
      );

    IF v_bad_wkend > 0 THEN
        RAISE WARNING '340 WARN: % holiday(s) fall on their calendar''s weekend days (acceptable for observed holidays)',
            v_bad_wkend;
    END IF;

    -- 5e. Total holiday days sanity check
    SELECT count(*) INTO v_day_count
    FROM master.holiday_calendar_day
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack;

    RAISE NOTICE '340 OK: % calendars, % holiday days seeded', v_cal_count, v_day_count;

END $seed$;
