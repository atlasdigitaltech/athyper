-- ============================================================================
-- ATHYPER BLUEPRINT — WAREHOUSE SEED: Inventory storage nodes
-- ============================================================================
-- File:     304_warehouses.sql
-- Schema:   master.warehouse
-- Purpose:  Seed 50 warehouses selectively — only where stock, receiving,
--           dispatch, spares, pharmacy, cold-chain, or transit storage are
--           real business objects. No warehouses for pure corporate / services /
--           financial / IT / education companies.
-- Depends:  303_sites.sql              (master.site must exist)
--           199_gl_preseed.sql         (company codes for cross-validation)
-- Replaces: 303_sites_warehouses.sql   (split into 303 + 304)
-- Idempotent: Yes — ON CONFLICT (tenant_id, site_id, code) DO UPDATE
-- Notes:
--   • warehouse_type  — validated by trigger trg_wh_type_lookup against
--                        master.warehouse_type (raw, finished_goods, spares,
--                        transit, returns)
--   • status          — validated by control.validate_status_transition against snapshot.status_route
--   • manager_id      — left NULL; principal seeds not yet stable
--   • company_code    — included in tmp for cross-validation join through
--                        site → company_code chain
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

    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[304_warehouses] Tenant ATHYPER not found — run 000_athyper_tenant.sql first';
    END IF;

    v_meta := jsonb_build_object('_seed', jsonb_build_object(
        'pack',      v_pack,
        'version',   v_version,
        'seeded_at', now()::text
    ));

    -- Verify sites are loaded (from 303_sites.sql with pack 340_org)
    IF (SELECT count(*) FROM master.site
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack AND status = 'active') < 30 THEN
        RAISE EXCEPTION '[304_warehouses] Sites not loaded — run 303_sites.sql first';
    END IF;

    -- ── Full lookup validation: all warehouse_type values used by this seed
    IF EXISTS (
        SELECT v.code FROM (VALUES
            ('raw'), ('finished_goods'), ('spares'), ('transit'), ('returns')
        ) AS v(code)
        WHERE NOT EXISTS (
            SELECT 1 FROM control.lookup_value lv
            WHERE lv.domain_code = 'master.warehouse_type'
              AND lv.code = v.code
              AND lv.tenant_id IS NULL
        )
    ) THEN
        RAISE EXCEPTION '[304_warehouses] Missing warehouse_type lookup value(s) — need: raw, finished_goods, spares, transit, returns';
    END IF;

    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE B: Temp table (includes company_code for cross-validation)
    -- ════════════════════════════════════════════════════════════════════════

    CREATE TEMP TABLE tmp_wh (
        seed_id                   uuid DEFAULT shared.uuidv7(),
        company_code              text    NOT NULL,
        site_code                 text    NOT NULL,
        code                      text    NOT NULL,
        name                      text    NOT NULL,
        description               text,
        warehouse_type            text    NOT NULL DEFAULT 'finished_goods',
        is_negative_stock_allowed boolean NOT NULL DEFAULT false
    ) ON COMMIT DROP;

    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE C: Insert warehouse data
    --
    -- Selection rule:
    --   NO warehouse:  ATHQ, AUIC, ASGF, AJED (pure corporate/services)
    --   BASIC:         AMRE (1), ASAH (2)
    --   OPERATIONAL:   everything else (3-6 per company)
    --
    -- warehouse_type values: raw, finished_goods, spares, transit, returns
    -- ════════════════════════════════════════════════════════════════════════

    -- ── AMRE — Malaysia Real Estate (1 warehouse) ───────────────────────
    -- Maintenance spares and consumables at the property operations centre
    INSERT INTO tmp_wh (company_code, site_code, code, name, description, warehouse_type) VALUES
    ('AMRE', 'AMRE-SITE-PROP-OPS', 'WH-MAINT',
     'Maintenance Store',
     'Building maintenance spares, tools, and consumables',
     'spares');

    -- ── AQTU — Qatar Utilities (3 warehouses) ───────────────────────────
    -- Plant spares, consumables, and a returns/defect bay
    INSERT INTO tmp_wh (company_code, site_code, code, name, description, warehouse_type) VALUES
    ('AQTU', 'AQTU-SITE-PLANT-01', 'WH-SPARES',
     'Plant Spares',
     'Critical and rotable spares for generation equipment',
     'spares'),
    ('AQTU', 'AQTU-SITE-PLANT-01', 'WH-CONSUM',
     'Consumables',
     'Chemicals, lubricants, filters, and operational consumables',
     'raw'),
    ('AQTU', 'AQTU-SITE-PLANT-01', 'WH-RETURNS',
     'Returns & Defects',
     'Defective parts pending supplier return or disposal',
     'returns');

    -- ── ASAC — Saudi Construction (4 warehouses) ────────────────────────
    -- Materials, tooling, spares, and returns at the main equipment yard
    INSERT INTO tmp_wh (company_code, site_code, code, name, description, warehouse_type) VALUES
    ('ASAC', 'ASAC-SITE-YARD-01', 'WH-MAT',
     'Construction Materials',
     'Bulk materials — cement, rebar, aggregates, timber',
     'raw'),
    ('ASAC', 'ASAC-SITE-YARD-01', 'WH-TOOLS',
     'Tools & Small Equipment',
     'Power tools, hand tools, PPE, and small plant',
     'spares'),
    ('ASAC', 'ASAC-SITE-YARD-01', 'WH-SPARES',
     'Equipment Spares',
     'Spare parts for heavy plant and vehicles',
     'spares'),
    ('ASAC', 'ASAC-SITE-YARD-01', 'WH-RETURNS',
     'Returns & Salvage',
     'Damaged materials and salvage pending disposition',
     'returns');

    -- ── AQTS — Qatar Transport & Storage (3 warehouses) ─────────────────
    -- Transit, cross-dock, and fleet spares at the main depot
    INSERT INTO tmp_wh (company_code, site_code, code, name, description, warehouse_type, is_negative_stock_allowed) VALUES
    ('AQTS', 'AQTS-SITE-DEPOT-01', 'WH-TRANSIT',
     'In-Transit Store',
     'Goods in transit between origin and destination',
     'transit', true),
    ('AQTS', 'AQTS-SITE-DEPOT-01', 'WH-CROSSDOCK',
     'Cross-Dock',
     'Short-hold cross-docking area for same-day dispatch',
     'transit', true),
    ('AQTS', 'AQTS-SITE-DEPOT-01', 'WH-SPARES',
     'Fleet Spares',
     'Tyres, brake components, and vehicle parts',
     'spares', false);

    -- ── AUET — UAE Trading (3 warehouses) ───────────────────────────────
    -- Finished goods, returns, and transit at the distribution centre
    INSERT INTO tmp_wh (company_code, site_code, code, name, description, warehouse_type, is_negative_stock_allowed) VALUES
    ('AUET', 'AUET-SITE-DC-01', 'WH-FG',
     'Finished Goods',
     'Pick-pack-ship warehouse for customer orders',
     'finished_goods', false),
    ('AUET', 'AUET-SITE-DC-01', 'WH-RETURNS',
     'Customer Returns',
     'Returns processing — inspection, restock, or disposal',
     'returns', false),
    ('AUET', 'AUET-SITE-DC-01', 'WH-TRANSIT',
     'In-Transit Store',
     'Goods awaiting customs clearance or onward shipment',
     'transit', true);

    -- ── ASAH — Saudi Hospitality (2 warehouses) ─────────────────────────
    -- Food & beverage and housekeeping at the hotel
    INSERT INTO tmp_wh (company_code, site_code, code, name, description, warehouse_type) VALUES
    ('ASAH', 'ASAH-SITE-HOTEL-01', 'WH-FB',
     'Food & Beverage Store',
     'Dry goods, perishables, and beverage inventory for kitchen and bar',
     'raw'),
    ('ASAH', 'ASAH-SITE-HOTEL-01', 'WH-HK',
     'Housekeeping Store',
     'Linen, cleaning supplies, amenities, and guest consumables',
     'spares');

    -- ── AITM — India Textile & Leather Mfg (5 warehouses) ──────────────
    INSERT INTO tmp_wh (company_code, site_code, code, name, description, warehouse_type) VALUES
    ('AITM', 'AITM-SITE-PLANT-01', 'WH-RAW',
     'Raw Materials',
     'Cotton bales, yarn, dyes, chemicals, and leather hides',
     'raw'),
    ('AITM', 'AITM-SITE-PLANT-01', 'WH-WIP',
     'Work-in-Progress',
     'Partially processed goods between production stages',
     'raw'),
    ('AITM', 'AITM-SITE-PLANT-01', 'WH-FG',
     'Finished Goods',
     'Finished textiles and leather goods ready for dispatch',
     'finished_goods'),
    ('AITM', 'AITM-SITE-PLANT-01', 'WH-SPARES',
     'Machine Spares',
     'Spare parts for looms, spinning frames, and dyeing equipment',
     'spares'),
    ('AITM', 'AITM-SITE-PLANT-01', 'WH-QC',
     'Quality Hold',
     'Materials or products held pending quality inspection',
     'raw');

    -- ── ACFB — Canada Food & Beverage Mfg (6 warehouses) ───────────────
    INSERT INTO tmp_wh (company_code, site_code, code, name, description, warehouse_type) VALUES
    ('ACFB', 'ACFB-SITE-PLANT-01', 'WH-RAW',
     'Raw Ingredients',
     'Flour, sugar, oils, flavourings, and agricultural inputs',
     'raw'),
    ('ACFB', 'ACFB-SITE-PLANT-01', 'WH-PACK',
     'Packaging Materials',
     'Cartons, labels, shrink-wrap, and bottles',
     'raw'),
    ('ACFB', 'ACFB-SITE-PLANT-01', 'WH-FG',
     'Finished Goods',
     'Shelf-stable finished products ready for dispatch',
     'finished_goods'),
    ('ACFB', 'ACFB-SITE-PLANT-01', 'WH-COLD',
     'Cold Store',
     'Temperature-controlled storage for perishable products',
     'finished_goods'),
    ('ACFB', 'ACFB-SITE-PLANT-01', 'WH-QC',
     'Quality Hold',
     'Products held for lab testing, batch release, or recall',
     'raw'),
    ('ACFB', 'ACFB-SITE-PLANT-01', 'WH-RETURNS',
     'Returns & Recall',
     'Customer returns and product recall staging',
     'returns');

    -- ── ADPM — Germany Pharmaceutical Mfg (6 warehouses) ────────────────
    INSERT INTO tmp_wh (company_code, site_code, code, name, description, warehouse_type) VALUES
    ('ADPM', 'ADPM-SITE-PLANT-01', 'WH-RAW',
     'Raw Materials',
     'APIs, excipients, and raw pharma materials',
     'raw'),
    ('ADPM', 'ADPM-SITE-PLANT-01', 'WH-QC',
     'QC Laboratory Hold',
     'Samples and batches under quality control testing',
     'raw'),
    ('ADPM', 'ADPM-SITE-PLANT-01', 'WH-QUAR',
     'Quarantine',
     'Incoming materials in quarantine pending release',
     'raw'),
    ('ADPM', 'ADPM-SITE-PLANT-01', 'WH-FG',
     'Finished Goods',
     'Released pharmaceutical products awaiting dispatch',
     'finished_goods'),
    ('ADPM', 'ADPM-SITE-PLANT-01', 'WH-SPARES',
     'Equipment Spares',
     'GMP-grade spare parts for clean-room and packaging machinery',
     'spares'),
    ('ADPM', 'ADPM-SITE-PLANT-01', 'WH-RETURNS',
     'Returns & Expired',
     'Returned or expired products pending destruction or credit',
     'returns');

    -- ── ATEM — Taiwan Electronics Mfg (5 warehouses) ────────────────────
    INSERT INTO tmp_wh (company_code, site_code, code, name, description, warehouse_type) VALUES
    ('ATEM', 'ATEM-SITE-PLANT-01', 'WH-RAW',
     'Raw Components',
     'PCBs, ICs, resistors, capacitors, and connectors',
     'raw'),
    ('ATEM', 'ATEM-SITE-PLANT-01', 'WH-WIP',
     'Work-in-Progress',
     'Partially assembled boards and sub-assemblies',
     'raw'),
    ('ATEM', 'ATEM-SITE-PLANT-01', 'WH-FG',
     'Finished Goods',
     'Tested and packaged electronic assemblies',
     'finished_goods'),
    ('ATEM', 'ATEM-SITE-PLANT-01', 'WH-SPARES',
     'Line Spares',
     'Nozzles, feeders, and spare parts for SMT lines',
     'spares'),
    ('ATEM', 'ATEM-SITE-PLANT-01', 'WH-RMA',
     'RMA Returns',
     'Customer returns for rework, repair, or scrap',
     'returns');

    -- ── ASPE — South Africa Crude Petroleum (4 warehouses) ──────────────
    INSERT INTO tmp_wh (company_code, site_code, code, name, description, warehouse_type) VALUES
    ('ASPE', 'ASPE-SITE-FIELD-01', 'WH-SPARES',
     'Field Spares',
     'Wellhead valves, pipe fittings, and pump parts',
     'spares'),
    ('ASPE', 'ASPE-SITE-FIELD-01', 'WH-CHEM',
     'Chemicals & Fluids',
     'Drilling fluids, corrosion inhibitors, and treatment chemicals',
     'raw'),
    ('ASPE', 'ASPE-SITE-FIELD-01', 'WH-FIELD',
     'Field Equipment',
     'Rotable equipment, casings, and drilling tools',
     'spares'),
    ('ASPE', 'ASPE-SITE-FIELD-01', 'WH-RETURNS',
     'Returns & Scrap',
     'Worn parts and scrap metal pending disposal or reclaim',
     'returns');

    -- ── AUKA — UK Agriculture (4 warehouses) ────────────────────────────
    INSERT INTO tmp_wh (company_code, site_code, code, name, description, warehouse_type) VALUES
    ('AUKA', 'AUKA-SITE-FARM-01', 'WH-INPUT',
     'Farm Inputs',
     'Seeds, fertiliser, pesticides, and animal feed',
     'raw'),
    ('AUKA', 'AUKA-SITE-FARM-01', 'WH-HARVEST',
     'Harvest Store',
     'Grain silos and bulk crop storage',
     'finished_goods'),
    ('AUKA', 'AUKA-SITE-FARM-01', 'WH-COLD',
     'Cold Store',
     'Chilled and frozen storage for dairy, meat, and produce',
     'finished_goods'),
    ('AUKA', 'AUKA-SITE-FARM-01', 'WH-SPARES',
     'Machinery Spares',
     'Tractor, combine, and irrigation spares',
     'spares');

    -- ── APHS — Philippines Hospital Services (4 warehouses) ─────────────
    INSERT INTO tmp_wh (company_code, site_code, code, name, description, warehouse_type) VALUES
    ('APHS', 'APHS-SITE-HOSPITAL-01', 'WH-PHARM',
     'Pharmacy',
     'Controlled and non-controlled pharmaceutical inventory',
     'finished_goods'),
    ('APHS', 'APHS-SITE-HOSPITAL-01', 'WH-MEDSUP',
     'Medical Supplies',
     'Disposables, PPE, syringes, catheters, and surgical supplies',
     'spares'),
    ('APHS', 'APHS-SITE-HOSPITAL-01', 'WH-STERILE',
     'Sterile Store',
     'Sterilised instruments and implants',
     'spares'),
    ('APHS', 'APHS-SITE-HOSPITAL-01', 'WH-GEN',
     'General Store',
     'Linen, cleaning supplies, office consumables, and maintenance spares',
     'spares');

    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE D-pre: Unmatched temp row detection (fail fast, not silent skip)
    -- ════════════════════════════════════════════════════════════════════════

    -- D-pre-1: Every company_code in tmp must resolve
    SELECT count(*) INTO v_bad
    FROM tmp_wh t
    WHERE NOT EXISTS (
        SELECT 1 FROM master.company_code cc
        WHERE cc.tenant_id = v_tid AND cc.code = t.company_code
    );
    IF v_bad > 0 THEN
        RAISE EXCEPTION '[304_warehouses] % tmp_wh row(s) have unresolvable company_code', v_bad;
    END IF;

    -- D-pre-2: Every site_code in tmp must resolve
    SELECT count(*) INTO v_bad
    FROM tmp_wh t
    WHERE NOT EXISTS (
        SELECT 1 FROM master.site s
        WHERE s.tenant_id = v_tid AND s.code = t.site_code
    );
    IF v_bad > 0 THEN
        RAISE EXCEPTION '[304_warehouses] % tmp_wh row(s) have unresolvable site_code', v_bad;
    END IF;

    -- D-pre-3: Every site_code must belong to the stated company_code
    SELECT count(*) INTO v_bad
    FROM tmp_wh t
    JOIN master.site s ON s.tenant_id = v_tid AND s.code = t.site_code
    JOIN master.company_code cc ON cc.tenant_id = v_tid AND cc.code = t.company_code
    WHERE s.company_code_id != cc.id;
    IF v_bad > 0 THEN
        RAISE EXCEPTION '[304_warehouses] % tmp_wh row(s) have site/company mismatch', v_bad;
    END IF;

    -- Capture expected count before insert
    SELECT count(*) INTO v_expected FROM tmp_wh;

    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE D: UPSERT with company cross-validation
    -- JOIN path: tmp_wh → master.site (on site_code)
    --                    → master.company_code (on company_code)
    --          and verify site.company_code_id = company_code.id
    --
    -- Triggers fire on each INSERT:
    --   trg_wh_type_lookup   — validates warehouse_type against master.warehouse_type
    -- ════════════════════════════════════════════════════════════════════════

    INSERT INTO master.warehouse (
        id, tenant_id, code, name, description,
        site_id, warehouse_type, is_negative_stock_allowed,
        metadata, status, created_by
    )
    SELECT
        t.seed_id,
        v_tid,
        t.code,
        t.name,
        t.description,
        s.id,
        t.warehouse_type,
        t.is_negative_stock_allowed,
        v_meta,
        'active',
        v_su
    FROM tmp_wh t
    JOIN master.site s
      ON s.tenant_id = v_tid AND s.code = t.site_code
    JOIN master.company_code cc
      ON cc.tenant_id = v_tid AND cc.code = t.company_code
    WHERE s.company_code_id = cc.id
    ON CONFLICT (tenant_id, site_id, code) DO UPDATE SET
        name                      = EXCLUDED.name,
        description               = EXCLUDED.description,
        warehouse_type            = EXCLUDED.warehouse_type,
        is_negative_stock_allowed = EXCLUDED.is_negative_stock_allowed,
        status                    = EXCLUDED.status,
        metadata                  = master.warehouse.metadata
                                    || jsonb_build_object('_seed', jsonb_build_object(
                                           'pack',      v_pack,
                                           'version',   v_version,
                                           'seeded_at', now()::text
                                       )),
        updated_at = now(),
        updated_by = v_su
    WHERE (master.warehouse.name, master.warehouse.description,
           master.warehouse.warehouse_type, master.warehouse.is_negative_stock_allowed,
           master.warehouse.status)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.description,
           EXCLUDED.warehouse_type, EXCLUDED.is_negative_stock_allowed,
           EXCLUDED.status);

    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE E: Stale-code cleanup
    -- Deactivate any rows in the same pack whose (site_id, code) combination
    -- no longer appears in tmp_wh. Also deactivates leftover rows from the
    -- old 303_org pack. Preserves FK integrity (no DELETE), but removes stale
    -- rows from the active set so exact-count assertions stay correct on
    -- rerun after code renames.
    -- ════════════════════════════════════════════════════════════════════════

    -- Deactivate stale rows from current pack
    UPDATE master.warehouse w
    SET    status     = 'inactive',
           status_changed_at = now(),
           status_changed_by = v_su,
           updated_at = now(),
           updated_by = v_su
    WHERE  w.tenant_id = v_tid
      AND  w.metadata->'_seed'->>'pack' = v_pack
      AND  w.status = 'active'
      AND  NOT EXISTS (
               SELECT 1
               FROM tmp_wh t
               JOIN master.site s
                 ON s.tenant_id = v_tid AND s.code = t.site_code
               WHERE s.id = w.site_id AND t.code = w.code
           );

    GET DIAGNOSTICS v_stale = ROW_COUNT;

    -- Deactivate leftover rows from the old 303_org pack (migration cleanup)
    UPDATE master.warehouse w
    SET    status     = 'inactive',
           status_changed_at = now(),
           status_changed_by = v_su,
           updated_at = now(),
           updated_by = v_su
    WHERE  w.tenant_id = v_tid
      AND  w.metadata->'_seed'->>'pack' = '303_org'
      AND  w.status = 'active'
      AND  NOT EXISTS (
               SELECT 1
               FROM tmp_wh t
               JOIN master.site s
                 ON s.tenant_id = v_tid AND s.code = t.site_code
               WHERE s.id = w.site_id AND t.code = w.code
           );

    GET DIAGNOSTICS v_bad = ROW_COUNT;
    v_stale := v_stale + v_bad;

    IF v_stale > 0 THEN
        RAISE NOTICE '[304_warehouses] Deactivated % stale warehouse(s) from previous seed run', v_stale;
    END IF;

    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE F: Assertions
    -- Count only active rows in pack (stale rows are now inactive).
    -- ════════════════════════════════════════════════════════════════════════

    SELECT count(*) INTO v_actual
    FROM master.warehouse
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack
      AND status = 'active';

    -- Exact count: active seeded rows must equal tmp_wh rows
    IF v_actual != v_expected THEN
        RAISE EXCEPTION '[304_warehouses] Row count mismatch: expected % (from tmp_wh), got % active in master.warehouse',
            v_expected, v_actual;
    END IF;

    -- No warehouses for pure-services companies
    IF EXISTS (
        SELECT 1 FROM master.warehouse w
        JOIN master.site s ON s.tenant_id = w.tenant_id AND s.id = w.site_id
        JOIN master.company_code cc ON cc.tenant_id = s.tenant_id AND cc.id = s.company_code_id
        WHERE w.tenant_id = v_tid
          AND w.metadata->'_seed'->>'pack' = v_pack
          AND w.status = 'active'
          AND cc.code IN ('ATHQ', 'AUIC', 'ASGF', 'AJED')
    ) THEN
        RAISE EXCEPTION '[304_warehouses] Unexpected warehouse on pure-services company';
    END IF;

    -- Company cross-validation: every active warehouse's site belongs to a real company
    IF EXISTS (
        SELECT w.id
        FROM master.warehouse w
        JOIN master.site s ON s.tenant_id = w.tenant_id AND s.id = w.site_id
        WHERE w.tenant_id = v_tid
          AND w.metadata->'_seed'->>'pack' = v_pack
          AND w.status = 'active'
          AND s.company_code_id IS NULL
    ) THEN
        RAISE EXCEPTION '[304_warehouses] Active warehouse linked to site with no company';
    END IF;

    -- Negative stock only on transit warehouses (active set only)
    IF EXISTS (
        SELECT 1 FROM master.warehouse
        WHERE tenant_id = v_tid
          AND metadata->'_seed'->>'pack' = v_pack
          AND status = 'active'
          AND is_negative_stock_allowed = true
          AND warehouse_type != 'transit'
    ) THEN
        RAISE EXCEPTION '[304_warehouses] Negative stock allowed on non-transit warehouse';
    END IF;

    RAISE NOTICE '[304_warehouses] Seed complete: % active warehouses across % sites (% companies, expected: %, stale deactivated: %)',
        v_actual,
        (SELECT count(DISTINCT w.site_id) FROM master.warehouse w
         WHERE w.tenant_id = v_tid AND w.metadata->'_seed'->>'pack' = v_pack
           AND w.status = 'active'),
        (SELECT count(DISTINCT s.company_code_id)
         FROM master.warehouse w
         JOIN master.site s ON s.tenant_id = w.tenant_id AND s.id = w.site_id
         WHERE w.tenant_id = v_tid AND w.metadata->'_seed'->>'pack' = v_pack
           AND w.status = 'active'),
        v_expected,
        v_stale;

END $seed$;
