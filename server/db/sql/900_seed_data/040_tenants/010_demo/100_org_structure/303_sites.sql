-- ============================================================================
-- ATHYPER BLUEPRINT — SITE SEED: Physical locations across all companies
-- ============================================================================
-- File:     303_sites.sql
-- Schema:   master.site
-- Purpose:  Seed 32 sites across 17 company codes — lean but realistic set
--           covering HQ offices, plants, yards, depots, stores, and branches.
-- Depends:  000_athyper_tenant.sql    (tenant)
--           199_gl_preseed.sql        (legal_entity + company_code)
--           199_gl_preseed.sql        (company_code — replaces operating_unit dependency)
--           shared.country, shared.timezone (reference data)
-- Replaces: 303_sites_warehouses.sql  (split into 303 + 304)
-- Idempotent: Yes — ON CONFLICT (tenant_id, code) DO UPDATE
-- Notes:
--   • entity_code  — column removed from master.site (no longer used)
--   • level_no     — omitted from tmp; trigger trg_site_level handles it
--   • site_type    — validated by trigger trg_site_type_lookup against master.site_type
--   • status       — validated by control.validate_status_transition against snapshot.status_route
--   • parent_code  — resolved in two-pass insert (roots first, children second)
--   • manager_id   — left NULL; principal seeds not yet stable
-- ============================================================================

DO $seed$
DECLARE
    v_tid      uuid;
    v_su       uuid := '00000000-0000-0000-0000-000000000000';
    v_pack     text := '340_org';
    v_version  text := '1.0.0';
    v_meta     jsonb;
    v_expected int;
    v_actual   int;
    v_bad      int;
    v_stale    int;
BEGIN
    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE A: Resolve tenant & verify prerequisites
    -- ════════════════════════════════════════════════════════════════════════

    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[303_sites] Tenant ATHYPER not found — run 000_athyper_tenant.sql first';
    END IF;

    v_meta := jsonb_build_object('_seed', jsonb_build_object(
        'pack',      v_pack,
        'version',   v_version,
        'seeded_at', now()::text
    ));

    -- Verify company codes exist
    IF (SELECT count(*) FROM master.company_code
        WHERE tenant_id = v_tid AND status = 'active') < 17 THEN
        RAISE EXCEPTION '[303_sites] Expected ≥17 active company codes — run 199_gl_preseed.sql first';
    END IF;

    -- ── Full lookup validation: all site_type values used by this seed ───
    IF EXISTS (
        SELECT v.code FROM (VALUES
            ('plant'), ('office'), ('depot'), ('yard'), ('store'), ('branch')
        ) AS v(code)
        WHERE NOT EXISTS (
            SELECT 1 FROM control.lookup_value lv
            WHERE lv.domain_code = 'master.site_type'
              AND lv.code = v.code
              AND lv.tenant_id IS NULL
        )
    ) THEN
        RAISE EXCEPTION '[303_sites] Missing site_type lookup value(s) — need: plant, office, depot, yard, store, branch';
    END IF;

    -- ── Reference data: all country codes used by this seed ─────────────
    IF EXISTS (
        SELECT v.code FROM (VALUES
            ('MY'), ('QA'), ('SA'), ('AE'), ('US'), ('SG'),
            ('IN'), ('CA'), ('DE'), ('TW'), ('ZA'), ('GB'), ('JP'), ('PH')
        ) AS v(code)
        WHERE NOT EXISTS (
            SELECT 1 FROM shared.country c WHERE c.code = v.code
        )
    ) THEN
        RAISE EXCEPTION '[303_sites] Missing shared.country row(s) — check reference data seed';
    END IF;

    -- ── Reference data: all timezone codes used by this seed ────────────
    IF EXISTS (
        SELECT v.code FROM (VALUES
            ('Asia/Kuala_Lumpur'), ('Asia/Qatar'), ('Asia/Riyadh'), ('Asia/Dubai'),
            ('America/New_York'), ('Asia/Singapore'), ('Asia/Kolkata'), ('America/Toronto'),
            ('Europe/Berlin'), ('Asia/Taipei'), ('Africa/Johannesburg'), ('Europe/London'),
            ('Asia/Tokyo'), ('Asia/Manila')
        ) AS v(code)
        WHERE NOT EXISTS (
            SELECT 1 FROM shared.timezone tz WHERE tz.code = v.code
        )
    ) THEN
        RAISE EXCEPTION '[303_sites] Missing shared.timezone row(s) — check reference data seed';
    END IF;

    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE B: Temp table (no entity_code, no level_no — triggers handle both)
    -- ════════════════════════════════════════════════════════════════════════

    CREATE TEMP TABLE tmp_site (
        seed_id         uuid DEFAULT shared.uuidv7(),
        company_code    text    NOT NULL,
        code            text    NOT NULL,
        name            text    NOT NULL,
        description     text,
        site_type       text    NOT NULL,
        parent_code     text,
        sort_order      smallint NOT NULL DEFAULT 0,
        country_code    character(2) NOT NULL,
        timezone_code   text,
        capacity_uom    text,
        capacity_value  numeric(12,2)
    ) ON COMMIT DROP;

    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE C: Insert site data
    -- Code convention: {COMPANY_CODE}-SITE-{DESCRIPTOR}
    -- All codes are tenant-wide unique per UNIQUE (tenant_id, code)
    -- ════════════════════════════════════════════════════════════════════════

    -- ── ATHQ — Group Holdings (Malaysia) ────────────────────────────────
    INSERT INTO tmp_site (company_code, code, name, description, site_type, country_code, timezone_code) VALUES
    ('ATHQ', 'ATHQ-SITE-HQ', 'Group Headquarters',
     'Athyper Group corporate headquarters, Kuala Lumpur',
     'office', 'MY', 'Asia/Kuala_Lumpur');

    -- ── AMRE — Malaysia Real Estate ─────────────────────────────────────
    INSERT INTO tmp_site (company_code, code, name, description, site_type, country_code, timezone_code) VALUES
    ('AMRE', 'AMRE-SITE-HQ', 'Real Estate HQ',
     'Corporate office, Kuala Lumpur',
     'office', 'MY', 'Asia/Kuala_Lumpur'),
    ('AMRE', 'AMRE-SITE-PROP-OPS', 'Property Operations Centre',
     'Facility management and maintenance hub',
     'depot', 'MY', 'Asia/Kuala_Lumpur');

    -- ── AQTU — Qatar Utilities ──────────────────────────────────────────
    INSERT INTO tmp_site (company_code, code, name, description, site_type, country_code, timezone_code, capacity_uom, capacity_value) VALUES
    ('AQTU', 'AQTU-SITE-HQ', 'Utilities HQ',
     'Corporate office, Doha',
     'office', 'QA', 'Asia/Qatar', NULL, NULL),
    ('AQTU', 'AQTU-SITE-PLANT-01', 'Main Generation Plant',
     'Primary power generation and water desalination plant',
     'plant', 'QA', 'Asia/Qatar', 'MW', 500.00);

    -- ── ASAC — Saudi Construction ───────────────────────────────────────
    INSERT INTO tmp_site (company_code, code, name, description, site_type, country_code, timezone_code) VALUES
    ('ASAC', 'ASAC-SITE-HQ', 'Construction HQ',
     'Corporate office, Riyadh',
     'office', 'SA', 'Asia/Riyadh'),
    ('ASAC', 'ASAC-SITE-YARD-01', 'Main Equipment Yard',
     'Heavy equipment staging, materials storage, and prefabrication',
     'yard', 'SA', 'Asia/Riyadh'),
    ('ASAC', 'ASAC-SITE-PROJ-BASE-01', 'Project Base Camp',
     'Field operations base for active project sites',
     'yard', 'SA', 'Asia/Riyadh');

    -- ── AQTS — Qatar Transport & Storage ────────────────────────────────
    INSERT INTO tmp_site (company_code, code, name, description, site_type, country_code, timezone_code, capacity_uom, capacity_value) VALUES
    ('AQTS', 'AQTS-SITE-HQ', 'Transport HQ',
     'Corporate office, Doha',
     'office', 'QA', 'Asia/Qatar', NULL, NULL),
    ('AQTS', 'AQTS-SITE-DEPOT-01', 'Main Fleet Depot',
     'Primary fleet maintenance, parking, and dispatch depot',
     'depot', 'QA', 'Asia/Qatar', 'vehicles', 200.00),
    ('AQTS', 'AQTS-SITE-HUB-01', 'Logistics Hub',
     'Cross-docking and distribution hub',
     'depot', 'QA', 'Asia/Qatar', 'sqm', 12000.00);

    -- ── AUET — UAE Trading ──────────────────────────────────────────────
    INSERT INTO tmp_site (company_code, code, name, description, site_type, country_code, timezone_code, capacity_uom, capacity_value) VALUES
    ('AUET', 'AUET-SITE-HQ', 'Trading HQ',
     'Corporate office, Dubai',
     'office', 'AE', 'Asia/Dubai', NULL, NULL),
    ('AUET', 'AUET-SITE-DC-01', 'Distribution Centre',
     'Main warehouse and distribution centre, Jebel Ali',
     'depot', 'AE', 'Asia/Dubai', 'sqm', 8000.00),
    ('AUET', 'AUET-SITE-STORE-01', 'Retail Showroom',
     'Customer-facing retail and display showroom',
     'store', 'AE', 'Asia/Dubai', NULL, NULL);

    -- ── ASAH — Saudi Hospitality ────────────────────────────────────────
    INSERT INTO tmp_site (company_code, code, name, description, site_type, country_code, timezone_code, capacity_uom, capacity_value) VALUES
    ('ASAH', 'ASAH-SITE-HQ', 'Hospitality HQ',
     'Corporate office, Riyadh',
     'office', 'SA', 'Asia/Riyadh', NULL, NULL),
    ('ASAH', 'ASAH-SITE-HOTEL-01', 'Flagship Hotel',
     'Full-service hotel and conference centre',
     'branch', 'SA', 'Asia/Riyadh', 'rooms', 350.00);

    -- ── AUIC — US Information & Communication ───────────────────────────
    INSERT INTO tmp_site (company_code, code, name, description, site_type, country_code, timezone_code) VALUES
    ('AUIC', 'AUIC-SITE-HQ', 'InfoComm HQ',
     'Corporate and engineering office, New York',
     'office', 'US', 'America/New_York');

    -- ── ASGF — Singapore Financial Services ─────────────────────────────
    INSERT INTO tmp_site (company_code, code, name, description, site_type, country_code, timezone_code) VALUES
    ('ASGF', 'ASGF-SITE-HQ', 'Financial Services HQ',
     'Corporate office, Singapore CBD',
     'office', 'SG', 'Asia/Singapore');

    -- ── AITM — India Textile & Leather Manufacturing ────────────────────
    INSERT INTO tmp_site (company_code, code, name, description, site_type, country_code, timezone_code, capacity_uom, capacity_value) VALUES
    ('AITM', 'AITM-SITE-HQ', 'Textile Mfg HQ',
     'Corporate office, Mumbai',
     'office', 'IN', 'Asia/Kolkata', NULL, NULL),
    ('AITM', 'AITM-SITE-PLANT-01', 'Main Textile Mill',
     'Spinning, weaving, dyeing, and finishing plant',
     'plant', 'IN', 'Asia/Kolkata', 'spindles', 25000.00);

    -- ── ACFB — Canada Food & Beverage Manufacturing ─────────────────────
    INSERT INTO tmp_site (company_code, code, name, description, site_type, country_code, timezone_code, capacity_uom, capacity_value) VALUES
    ('ACFB', 'ACFB-SITE-HQ', 'Food & Bev HQ',
     'Corporate office, Toronto',
     'office', 'CA', 'America/Toronto', NULL, NULL),
    ('ACFB', 'ACFB-SITE-PLANT-01', 'Main Processing Plant',
     'Food processing, packaging, and cold storage facility',
     'plant', 'CA', 'America/Toronto', 'tonnes_day', 120.00);

    -- ── ADPM — Germany Pharmaceutical Manufacturing ─────────────────────
    INSERT INTO tmp_site (company_code, code, name, description, site_type, country_code, timezone_code, capacity_uom, capacity_value) VALUES
    ('ADPM', 'ADPM-SITE-HQ', 'Pharma HQ',
     'Corporate and R&D office, Frankfurt',
     'office', 'DE', 'Europe/Berlin', NULL, NULL),
    ('ADPM', 'ADPM-SITE-PLANT-01', 'GMP Manufacturing Plant',
     'GMP-certified pharmaceutical production and packaging',
     'plant', 'DE', 'Europe/Berlin', 'units_day', 500000.00);

    -- ── ATEM — Taiwan Electronics Manufacturing ─────────────────────────
    INSERT INTO tmp_site (company_code, code, name, description, site_type, country_code, timezone_code, capacity_uom, capacity_value) VALUES
    ('ATEM', 'ATEM-SITE-HQ', 'Electronics HQ',
     'Corporate office, Taipei',
     'office', 'TW', 'Asia/Taipei', NULL, NULL),
    ('ATEM', 'ATEM-SITE-PLANT-01', 'SMT Assembly Plant',
     'Surface-mount assembly, testing, and packaging',
     'plant', 'TW', 'Asia/Taipei', 'units_day', 80000.00);

    -- ── ASPE — South Africa Crude Petroleum Extraction ──────────────────
    INSERT INTO tmp_site (company_code, code, name, description, site_type, country_code, timezone_code, capacity_uom, capacity_value) VALUES
    ('ASPE', 'ASPE-SITE-HQ', 'Petroleum HQ',
     'Corporate office, Johannesburg',
     'office', 'ZA', 'Africa/Johannesburg', NULL, NULL),
    ('ASPE', 'ASPE-SITE-FIELD-01', 'Primary Extraction Field',
     'Wellhead operations, field storage, and pump stations',
     'yard', 'ZA', 'Africa/Johannesburg', 'bpd', 15000.00);

    -- ── AUKA — UK Agriculture ───────────────────────────────────────────
    INSERT INTO tmp_site (company_code, code, name, description, site_type, country_code, timezone_code, capacity_uom, capacity_value) VALUES
    ('AUKA', 'AUKA-SITE-HQ', 'Agriculture HQ',
     'Corporate office, London',
     'office', 'GB', 'Europe/London', NULL, NULL),
    ('AUKA', 'AUKA-SITE-FARM-01', 'Main Farm Estate',
     'Arable and livestock operations, grain storage, and cold store',
     'yard', 'GB', 'Europe/London', 'hectares', 850.00);

    -- ── AJED — Japan Education Services ─────────────────────────────────
    INSERT INTO tmp_site (company_code, code, name, description, site_type, country_code, timezone_code, capacity_uom, capacity_value) VALUES
    ('AJED', 'AJED-SITE-CAMPUS-01', 'Main Campus',
     'Primary teaching campus, lecture halls, and administration',
     'branch', 'JP', 'Asia/Tokyo', 'students', 5000.00);

    -- ── APHS — Philippines Hospital Services ────────────────────────────
    INSERT INTO tmp_site (company_code, code, name, description, site_type, country_code, timezone_code, capacity_uom, capacity_value) VALUES
    ('APHS', 'APHS-SITE-HOSPITAL-01', 'Main Hospital',
     'General hospital with emergency, surgical, and outpatient services',
     'branch', 'PH', 'Asia/Manila', 'beds', 400.00);

    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE D-pre: Unmatched temp row detection (fail fast, not silent skip)
    -- ════════════════════════════════════════════════════════════════════════

    -- D-pre-1: Every company_code in tmp must resolve
    SELECT count(*) INTO v_bad
    FROM tmp_site t
    WHERE NOT EXISTS (
        SELECT 1 FROM master.company_code cc
        WHERE cc.tenant_id = v_tid AND cc.code = t.company_code
    );
    IF v_bad > 0 THEN
        RAISE EXCEPTION '[303_sites] % tmp_site row(s) have unresolvable company_code', v_bad;
    END IF;

    -- D-pre-2: Every parent_code in tmp must resolve to an existing tmp root
    SELECT count(*) INTO v_bad
    FROM tmp_site t
    WHERE t.parent_code IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM tmp_site p
          WHERE p.code = t.parent_code AND p.parent_code IS NULL
      );
    IF v_bad > 0 THEN
        RAISE EXCEPTION '[303_sites] % tmp_site child row(s) reference non-root parent_code', v_bad;
    END IF;

    -- Capture expected count before insert
    SELECT count(*) INTO v_expected FROM tmp_site;

    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE D: UPSERT — Pass 1: Root sites (parent_code IS NULL)
    -- Triggers fire on each INSERT:
    --   trg_site_level         — sets level_no = 1 (no parent)
    --   trg_site_type_lookup   — validates site_type against master.site_type
    -- ════════════════════════════════════════════════════════════════════════

    INSERT INTO master.site (
        id, tenant_id, code, name, description,
        company_code_id, site_type,
        parent_site_id, sort_order,
        country_code, timezone_code,
        capacity_uom, capacity_value,
        metadata, status, created_by
    )
    SELECT
        t.seed_id,
        v_tid,
        t.code,
        t.name,
        t.description,
        cc.id,
        t.site_type,
        NULL,                             -- root: no parent
        t.sort_order,
        t.country_code,
        t.timezone_code,
        t.capacity_uom,
        t.capacity_value,
        v_meta,
        'active',
        v_su
    FROM tmp_site t
    JOIN master.company_code cc
      ON cc.tenant_id = v_tid AND cc.code = t.company_code
    WHERE t.parent_code IS NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name            = EXCLUDED.name,
        description     = EXCLUDED.description,
        company_code_id = EXCLUDED.company_code_id,
        site_type       = EXCLUDED.site_type,
        sort_order      = EXCLUDED.sort_order,
        country_code    = EXCLUDED.country_code,
        timezone_code   = EXCLUDED.timezone_code,
        capacity_uom    = EXCLUDED.capacity_uom,
        capacity_value  = EXCLUDED.capacity_value,
        status          = EXCLUDED.status,
        metadata        = master.site.metadata
                          || jsonb_build_object('_seed', jsonb_build_object(
                                 'pack',      v_pack,
                                 'version',   v_version,
                                 'seeded_at', now()::text
                             )),
        updated_at = now(),
        updated_by = v_su
    WHERE (master.site.name, master.site.description, master.site.company_code_id,
           master.site.site_type, master.site.sort_order, master.site.country_code,
           master.site.timezone_code, master.site.capacity_uom, master.site.capacity_value,
           master.site.status)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.description, EXCLUDED.company_code_id,
           EXCLUDED.site_type, EXCLUDED.sort_order, EXCLUDED.country_code,
           EXCLUDED.timezone_code, EXCLUDED.capacity_uom, EXCLUDED.capacity_value,
           EXCLUDED.status);

    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE E: UPSERT — Pass 2: Child sites (parent_code IS NOT NULL)
    -- Additional triggers:
    --   trg_site_parent_co — enforces parent belongs to same company_code_id
    --   trg_site_level     — sets level_no = parent.level_no + 1
    -- Parent join tightened: ps.company_code_id = cc.id (fail in SQL, not trigger)
    -- ════════════════════════════════════════════════════════════════════════

    INSERT INTO master.site (
        id, tenant_id, code, name, description,
        company_code_id, site_type,
        parent_site_id, sort_order,
        country_code, timezone_code,
        capacity_uom, capacity_value,
        metadata, status, created_by
    )
    SELECT
        t.seed_id,
        v_tid,
        t.code,
        t.name,
        t.description,
        cc.id,
        t.site_type,
        ps.id,                            -- resolved parent
        t.sort_order,
        t.country_code,
        t.timezone_code,
        t.capacity_uom,
        t.capacity_value,
        v_meta,
        'active',
        v_su
    FROM tmp_site t
    JOIN master.company_code cc
      ON cc.tenant_id = v_tid AND cc.code = t.company_code
    JOIN master.site ps
      ON ps.tenant_id = v_tid
     AND ps.code = t.parent_code
     AND ps.company_code_id = cc.id       -- parent must belong to same company
    WHERE t.parent_code IS NOT NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name            = EXCLUDED.name,
        description     = EXCLUDED.description,
        company_code_id = EXCLUDED.company_code_id,
        site_type       = EXCLUDED.site_type,
        parent_site_id  = EXCLUDED.parent_site_id,
        sort_order      = EXCLUDED.sort_order,
        country_code    = EXCLUDED.country_code,
        timezone_code   = EXCLUDED.timezone_code,
        capacity_uom    = EXCLUDED.capacity_uom,
        capacity_value  = EXCLUDED.capacity_value,
        status          = EXCLUDED.status,
        metadata        = master.site.metadata
                          || jsonb_build_object('_seed', jsonb_build_object(
                                 'pack',      v_pack,
                                 'version',   v_version,
                                 'seeded_at', now()::text
                             )),
        updated_at = now(),
        updated_by = v_su
    WHERE (master.site.name, master.site.description, master.site.company_code_id,
           master.site.site_type, master.site.parent_site_id, master.site.sort_order,
           master.site.country_code, master.site.timezone_code,
           master.site.capacity_uom, master.site.capacity_value, master.site.status)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.description, EXCLUDED.company_code_id,
           EXCLUDED.site_type, EXCLUDED.parent_site_id, EXCLUDED.sort_order,
           EXCLUDED.country_code, EXCLUDED.timezone_code,
           EXCLUDED.capacity_uom, EXCLUDED.capacity_value, EXCLUDED.status);

    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE F: Stale-code cleanup
    -- Deactivate any rows in the same pack whose code no longer appears in
    -- tmp_site. Also deactivates leftover rows from the old 303_org pack.
    -- Preserves FK integrity (no DELETE), but removes stale rows from the
    -- active set so exact-count assertions stay correct on rerun.
    -- ════════════════════════════════════════════════════════════════════════

    -- Deactivate stale rows from current pack
    UPDATE master.site
    SET    status     = 'inactive',
           status_changed_at = now(),
           status_changed_by = v_su,
           updated_at = now(),
           updated_by = v_su
    WHERE  tenant_id = v_tid
      AND  metadata->'_seed'->>'pack' = v_pack
      AND  status = 'active'
      AND  code NOT IN (SELECT t.code FROM tmp_site t);

    GET DIAGNOSTICS v_stale = ROW_COUNT;

    -- Deactivate leftover rows from the old 303_org pack (migration cleanup)
    UPDATE master.site
    SET    status     = 'inactive',
           status_changed_at = now(),
           status_changed_by = v_su,
           updated_at = now(),
           updated_by = v_su
    WHERE  tenant_id = v_tid
      AND  metadata->'_seed'->>'pack' = '303_org'
      AND  status = 'active'
      AND  code NOT IN (SELECT t.code FROM tmp_site t);

    GET DIAGNOSTICS v_bad = ROW_COUNT;
    v_stale := v_stale + v_bad;

    IF v_stale > 0 THEN
        RAISE NOTICE '[303_sites] Deactivated % stale site(s) from previous seed run', v_stale;
    END IF;

    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE G: Assertions
    -- Count only active rows in pack (stale rows are now inactive).
    -- ════════════════════════════════════════════════════════════════════════

    SELECT count(*) INTO v_actual
    FROM master.site
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack
      AND status = 'active';

    -- Exact count: active seeded rows must equal tmp_site rows
    IF v_actual != v_expected THEN
        RAISE EXCEPTION '[303_sites] Row count mismatch: expected % (from tmp_site), got % active in master.site',
            v_expected, v_actual;
    END IF;

    -- Every active company_code has at least one active site
    IF EXISTS (
        SELECT cc.code
        FROM master.company_code cc
        WHERE cc.tenant_id = v_tid AND cc.status = 'active'
          AND NOT EXISTS (
              SELECT 1 FROM master.site s
              WHERE s.tenant_id = v_tid AND s.company_code_id = cc.id
                AND s.status = 'active'
          )
    ) THEN
        RAISE EXCEPTION '[303_sites] Orphan company_code found — every active company must have ≥1 active site';
    END IF;

    -- No self-referencing sites (DDL CHECK but verify seed correctness)
    IF EXISTS (
        SELECT 1 FROM master.site
        WHERE tenant_id = v_tid AND parent_site_id = id
    ) THEN
        RAISE EXCEPTION '[303_sites] Self-referencing site detected';
    END IF;

    RAISE NOTICE '[303_sites] Seed complete: % active sites across % companies (expected: %, stale deactivated: %)',
        v_actual,
        (SELECT count(DISTINCT company_code_id) FROM master.site
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack
           AND status = 'active'),
        v_expected,
        v_stale;

END $seed$;
