-- seed-pack-version: 2.0.0
-- ============================================================================
-- CIRRUSATLANTIC — WAREHOUSE SEED: Inventory storage nodes
-- ============================================================================
-- File:     304_warehouses.sql
-- Schema:   master.warehouse
-- Purpose:  Seed 3 warehouses at the Operations & Logistics Hub (CATL-SITE-OPS-01):
--             • WH-SPARES   — IT & Office Equipment Spares  (spares)
--             • WH-CONSUM   — Consumables & Supplies        (raw)
--             • WH-TRANSIT  — Goods in Transit              (transit)
--           No warehouse at HQ (pure office).
-- Depends:  303_sites.sql  (master.site must exist for pack 340_catl_org)
-- Idempotent: Yes — ON CONFLICT (tenant_id, site_id, code) DO UPDATE
-- ============================================================================

DO $seed$
DECLARE
    v_tid      uuid;
    v_su       uuid := nullif(current_setting('app.current_principal_id', true), '')::uuid;
    v_pack     text := '340_catl_org';
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

    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'cirrusatlantic';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[304_warehouses] Tenant CIRRUSATLANTIC not found — run 000_tenant.sql first';
    END IF;

    IF v_su IS NULL OR NOT EXISTS (
        SELECT 1
        FROM master.principal p
        WHERE p.id = v_su
          AND p.tenant_id = v_tid
          AND p.status = 'active'
    ) THEN
        RAISE EXCEPTION '[304_warehouses] app.current_principal_id must identify an active tenant-local principal';
    END IF;

    v_meta := jsonb_build_object('_seed', jsonb_build_object(
        'pack',      v_pack,
        'version',   v_version,
        'seeded_at', now()::text
    ));

    -- Verify sites are loaded
    IF (SELECT count(*) FROM master.site
        WHERE tenant_id = v_tid
          AND metadata->'_seed'->>'pack' = v_pack
          AND status = 'active') < 1 THEN
        RAISE EXCEPTION '[304_warehouses] Sites not loaded — run 303_sites.sql first';
    END IF;

    -- Lookup validation: all warehouse_type values used by this seed
    IF EXISTS (
        SELECT v.code FROM (VALUES ('spares'), ('raw'), ('transit')) AS v(code)
        WHERE NOT EXISTS (
            SELECT 1 FROM control.lookup_value lv
            WHERE lv.domain_code = 'master.warehouse_type'
              AND lv.code = v.code
              AND lv.tenant_id IS NULL
        )
    ) THEN
        RAISE EXCEPTION '[304_warehouses] Missing warehouse_type lookup value(s) — need: spares, raw, transit';
    END IF;

    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE B: Temp table
    -- ════════════════════════════════════════════════════════════════════════

    CREATE TEMP TABLE tmp_wh (
        seed_id                   uuid,
        company_code              text    NOT NULL,
        site_code                 text    NOT NULL,
        code                      text    NOT NULL,
        name                      text    NOT NULL,
        description               text,
        warehouse_type            text    NOT NULL DEFAULT 'finished_goods',
        is_negative_stock_allowed boolean NOT NULL DEFAULT false
    ) ON COMMIT DROP;

    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE C: Warehouse data
    -- HQ (CATL-SITE-HQ) is a pure office — no warehouse needed.
    -- All inventory held at the Operations & Logistics Hub.
    -- ════════════════════════════════════════════════════════════════════════

    -- ── CATL — Operations & Logistics Hub (3 warehouses) ────────────────
    INSERT INTO tmp_wh (
        seed_id, company_code, site_code, code, name, description, warehouse_type, is_negative_stock_allowed
    ) VALUES
    (md5(format('wave5:neon-catl:warehouses:%s:WH-SPARES', v_tid))::uuid, 'catl', 'catl-site-ops-01', 'WH-SPARES',
     'IT & Office Equipment Spares',
     'Spare parts for IT hardware, office equipment, and facilities',
     'spares', false),

    (md5(format('wave5:neon-catl:warehouses:%s:WH-CONSUM', v_tid))::uuid, 'catl', 'catl-site-ops-01', 'WH-CONSUM',
     'Consumables & Supplies',
     'Office consumables, stationery, cleaning materials, and sundries',
     'raw', false),

    (md5(format('wave5:neon-catl:warehouses:%s:WH-TRANSIT', v_tid))::uuid, 'catl', 'catl-site-ops-01', 'WH-TRANSIT',
     'Goods in Transit',
     'Incoming goods awaiting inspection and put-away',
     'transit', true);

    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE D-pre: Unmatched temp row detection
    -- ════════════════════════════════════════════════════════════════════════

    SELECT count(*) INTO v_bad
    FROM tmp_wh t
    WHERE NOT EXISTS (
        SELECT 1 FROM master.company_code cc
        WHERE cc.tenant_id = v_tid AND cc.code = t.company_code
    );
    IF v_bad > 0 THEN
        RAISE EXCEPTION '[304_warehouses] % tmp_wh row(s) have unresolvable company_code', v_bad;
    END IF;

    SELECT count(*) INTO v_bad
    FROM tmp_wh t
    WHERE NOT EXISTS (
        SELECT 1 FROM master.site s
        WHERE s.tenant_id = v_tid AND s.code = t.site_code
    );
    IF v_bad > 0 THEN
        RAISE EXCEPTION '[304_warehouses] % tmp_wh row(s) have unresolvable site_code', v_bad;
    END IF;

    SELECT count(*) INTO v_bad
    FROM tmp_wh t
    JOIN master.site s ON s.tenant_id = v_tid AND s.code = t.site_code
    JOIN master.company_code cc ON cc.tenant_id = v_tid AND cc.code = t.company_code
    WHERE s.company_code_id != cc.id;
    IF v_bad > 0 THEN
        RAISE EXCEPTION '[304_warehouses] % tmp_wh row(s) have site/company mismatch', v_bad;
    END IF;

    SELECT count(*) INTO v_expected FROM tmp_wh;

    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE D: UPSERT with company cross-validation
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
    -- ════════════════════════════════════════════════════════════════════════

    UPDATE master.warehouse w
    SET    status            = 'inactive',
           status_changed_at = now(),
           status_changed_by = v_su,
           updated_at        = now(),
           updated_by        = v_su
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

    IF v_stale > 0 THEN
        RAISE NOTICE '[304_warehouses] Deactivated % stale warehouse(s) from previous seed run', v_stale;
    END IF;

    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE F: Assertions
    -- ════════════════════════════════════════════════════════════════════════

    SELECT count(*) INTO v_actual
    FROM master.warehouse
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack
      AND status = 'active';

    IF v_actual != v_expected THEN
        RAISE EXCEPTION '[304_warehouses] Row count mismatch: expected % (from tmp_wh), got % active in master.warehouse',
            v_expected, v_actual;
    END IF;

    -- Negative stock only on transit warehouses
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

    -- Every active warehouse linked to a valid site with a company
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

    RAISE NOTICE '[304_warehouses] Seed complete: % active warehouses at CATL-SITE-OPS-01 (expected: %, stale deactivated: %)',
        v_actual, v_expected, v_stale;

END $seed$;
