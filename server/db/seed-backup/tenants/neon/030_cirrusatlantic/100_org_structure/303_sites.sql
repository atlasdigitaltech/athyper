-- seed-pack-version: 2.1.0
-- ============================================================================
-- CIRRUSATLANTIC — SITE SEED: Physical locations
-- ============================================================================
-- File:     303_sites.sql
-- Schema:   master.site
-- Purpose:  Seed 2 sites for CirrusAtlantic (CATL):
--             • CATL-SITE-HQ     — UK Headquarters (office)
--             • CATL-SITE-OPS-01 — Operations & Logistics Hub (depot)
-- Depends:  000_tenant.sql
--           200_legal_entities.sql  (company_code CATL)
-- Idempotent: Yes — ON CONFLICT ON CONSTRAINT site_code_uq DO UPDATE
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
        RAISE EXCEPTION '[303_sites] Tenant CIRRUSATLANTIC not found — run 000_tenant.sql first';
    END IF;

    IF v_su IS NULL OR NOT EXISTS (
        SELECT 1
        FROM master.principal p
        WHERE p.id = v_su
          AND p.tenant_id = v_tid
          AND p.status = 'active'
    ) THEN
        RAISE EXCEPTION '[303_sites] app.current_principal_id must identify an active tenant-local principal';
    END IF;

    v_meta := jsonb_build_object('_seed', jsonb_build_object(
        'pack',      v_pack,
        'version',   v_version,
        'seeded_at', now()::text
    ));

    -- Verify company code exists
    IF (SELECT count(*) FROM master.company_code
        WHERE tenant_id = v_tid AND status = 'active') < 1 THEN
        RAISE EXCEPTION '[303_sites] Expected ≥1 active company code — run 200_legal_entities.sql first';
    END IF;

    -- Lookup validation: all site_type values used by this seed
    IF EXISTS (
        SELECT v.code FROM (VALUES ('office'), ('depot')) AS v(code)
        WHERE NOT EXISTS (
            SELECT 1 FROM control.lookup_value lv
            WHERE lv.domain_code = 'master.site_type'
              AND lv.code = v.code
              AND lv.tenant_id IS NULL
        )
    ) THEN
        RAISE EXCEPTION '[303_sites] Missing site_type lookup value(s) — need: office, depot';
    END IF;

    -- Reference data: country and timezone
    IF NOT EXISTS (SELECT 1 FROM shared.country WHERE code = 'GB') THEN
        RAISE EXCEPTION '[303_sites] Missing shared.country row for GB';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM shared.timezone WHERE code = 'Europe/London') THEN
        RAISE EXCEPTION '[303_sites] Missing shared.timezone row for Europe/London';
    END IF;

    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE B: Temp table
    -- ════════════════════════════════════════════════════════════════════════

    CREATE TEMP TABLE tmp_site (
        seed_id        uuid,
        company_code   text         NOT NULL,
        code           text         NOT NULL,
        name           text         NOT NULL,
        description    text,
        site_type      text         NOT NULL,
        parent_code    text,
        sort_order     smallint     NOT NULL DEFAULT 0,
        country_code   character(2) NOT NULL,
        timezone_code  text,
        capacity_uom   text,
        capacity_value numeric(12,2)
    ) ON COMMIT DROP;

    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE C: Site data
    -- ════════════════════════════════════════════════════════════════════════

    -- ── CATL — CirrusAtlantic Ltd (UK) ──────────────────────────────────
    INSERT INTO tmp_site (
        seed_id, company_code, code, name, description, site_type, sort_order, country_code, timezone_code
    ) VALUES
    (md5(format('wave5:neon-catl:sites:%s:catl-site-hq', v_tid))::uuid, 'catl', 'catl-site-hq', 'UK Headquarters',
     'CirrusAtlantic head office — finance, procurement, and management',
     'office', 1, 'GB', 'Europe/London'),

    (md5(format('wave5:neon-catl:sites:%s:catl-site-ops-01', v_tid))::uuid, 'catl', 'catl-site-ops-01', 'Operations & Logistics Hub',
     'Goods receiving, storage, and dispatch depot for UK operations',
     'depot',  2, 'GB', 'Europe/London');

    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE D-pre: Unmatched temp row detection
    -- ════════════════════════════════════════════════════════════════════════

    SELECT count(*) INTO v_bad
    FROM tmp_site t
    WHERE NOT EXISTS (
        SELECT 1 FROM master.company_code cc
        WHERE cc.tenant_id = v_tid AND cc.code = t.company_code
    );
    IF v_bad > 0 THEN
        RAISE EXCEPTION '[303_sites] % tmp_site row(s) have unresolvable company_code', v_bad;
    END IF;

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

    SELECT count(*) INTO v_expected FROM tmp_site;

    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE D: UPSERT — Pass 1: Root sites (parent_code IS NULL)
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
        NULL,
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
    ON CONFLICT ON CONSTRAINT site_code_uq DO UPDATE SET
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
        ps.id,
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
     AND ps.company_code_id = cc.id
    WHERE t.parent_code IS NOT NULL
    ON CONFLICT ON CONSTRAINT site_code_uq DO UPDATE SET
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
    -- ════════════════════════════════════════════════════════════════════════

    UPDATE master.site
    SET    status            = 'inactive',
           status_changed_at = now(),
           status_changed_by = v_su,
           updated_at        = now(),
           updated_by        = v_su
    WHERE  tenant_id = v_tid
      AND  metadata->'_seed'->>'pack' = v_pack
      AND  status = 'active'
      AND  code NOT IN (SELECT t.code FROM tmp_site t);

    GET DIAGNOSTICS v_stale = ROW_COUNT;

    IF v_stale > 0 THEN
        RAISE NOTICE '[303_sites] Deactivated % stale site(s) from previous seed run', v_stale;
    END IF;

    -- ════════════════════════════════════════════════════════════════════════
    -- STAGE G: Assertions
    -- ════════════════════════════════════════════════════════════════════════

    SELECT count(*) INTO v_actual
    FROM master.site
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack
      AND status = 'active';

    IF v_actual != v_expected THEN
        RAISE EXCEPTION '[303_sites] Row count mismatch: expected % (from tmp_site), got % active in master.site',
            v_expected, v_actual;
    END IF;

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
        RAISE EXCEPTION '[303_sites] Orphan company_code — every active company must have ≥1 active site';
    END IF;

    IF EXISTS (
        SELECT 1 FROM master.site
        WHERE tenant_id = v_tid AND parent_site_id = id
    ) THEN
        RAISE EXCEPTION '[303_sites] Self-referencing site detected';
    END IF;

    RAISE NOTICE '[303_sites] Seed complete: % active sites (expected: %, stale deactivated: %)',
        v_actual, v_expected, v_stale;

END $seed$;
