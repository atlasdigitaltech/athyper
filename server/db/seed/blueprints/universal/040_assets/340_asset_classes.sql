-- master.asset_class — 16 IAS 16/IFRS-compliant rows per tenant:
--   L1 headers (4): TANGIBLE, INTANGIBLE, ROU, CWIP
--   L2 leaves (12): LAND, BUILDINGS, PLANT, VEHICLES, IT-EQUIP, FURNITURE,
--                   LHI, TOOLS, SOFTWARE, ROU-PROP, ROU-EQUIP, CWIP-GEN
-- Tenant-scoped — all company_codes share the same taxonomy. Per-company
-- depreciation parameters and capitalisation thresholds live in
-- control.asset_class_book_policy (seeded by 341 or setup UI).

DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_pack    text := '340_asset';
    v_version text := '1.0.0';
    v_meta    jsonb;
    v_count   int;
BEGIN
    -- ── STAGE A: Resolve tenant ──────────────────────────────────────────────
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    v_meta := jsonb_build_object('_seed', jsonb_build_object(
        'pack', v_pack, 'version', v_version, 'seeded_at', now()::text));

    -- ── STAGE B: Stage class templates ───────────────────────────────────────
    CREATE TEMP TABLE tmp_ac (
        code            text     NOT NULL PRIMARY KEY,
        name            text     NOT NULL,
        description     text,
        parent_code     text,
        level_no        smallint NOT NULL,
        is_leaf         boolean  NOT NULL,
        asset_nature    text     NOT NULL,
        is_depreciable  boolean  NOT NULL DEFAULT true,
        is_componentization_required boolean NOT NULL DEFAULT false,
        revaluation_allowed          boolean NOT NULL DEFAULT false,
        useful_life_override_policy  text    NOT NULL DEFAULT 'allow',
        sort_order      smallint NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO tmp_ac VALUES
    -- L1 Headers (is_leaf = false, non-depreciable until overridden at leaf)
    ('TANGIBLE',   'Tangible Fixed Assets',    'IAS 16 PPE',                     NULL,       1, false, 'tangible',   true,  false, false, 'allow',  100),
    ('INTANGIBLE', 'Intangible Assets',        'IAS 38 intangibles',             NULL,       1, false, 'intangible', true,  false, false, 'allow',  200),
    ('ROU',        'Right-of-Use Assets',      'IFRS 16 leased assets',          NULL,       1, false, 'rou',        true,  false, false, 'forbid', 300),
    ('CWIP',       'Capital Work in Progress', 'Under construction',             NULL,       1, false, 'cwip',       false, false, false, 'forbid', 400),
    -- L2 Tangible
    ('LAND',       'Land',                     'Non-depreciable (IAS 16)',        'TANGIBLE', 2, true,  'land',       false, false, true,  'forbid', 110),
    ('BUILDINGS',  'Buildings',                'Office, warehouse, plant',        'TANGIBLE', 2, true,  'tangible',   true,  true,  true,  'allow',  120),
    ('PLANT',      'Plant & Machinery',        'Production equipment',            'TANGIBLE', 2, true,  'tangible',   true,  true,  false, 'allow',  130),
    ('VEHICLES',   'Vehicles',                 'Fleet, cars, forklifts',          'TANGIBLE', 2, true,  'tangible',   true,  false, false, 'allow',  140),
    ('IT-EQUIP',   'IT Equipment',             'Servers, network, desktops',      'TANGIBLE', 2, true,  'tangible',   true,  false, false, 'allow',  150),
    ('FURNITURE',  'Furniture & Fixtures',     'Office furniture, fittings',      'TANGIBLE', 2, true,  'tangible',   true,  false, false, 'allow',  160),
    ('LHI',        'Leasehold Improvements',   'Tenant improvements',             'TANGIBLE', 2, true,  'leasehold_improvement', true, false, false, 'allow', 170),
    ('TOOLS',      'Tools & Dies',             'Specialised tooling',             'TANGIBLE', 2, true,  'tangible',   true,  false, false, 'allow',  180),
    -- L2 Intangible
    ('SOFTWARE',   'Software & Licences',      'Purchased/developed software',    'INTANGIBLE',2,true,  'intangible', true,  false, false, 'allow',  210),
    -- L2 ROU
    ('ROU-PROP',   'ROU - Property',           'IFRS 16 leased buildings',        'ROU',      2, true,  'rou',        true,  false, false, 'forbid', 310),
    ('ROU-EQUIP',  'ROU - Equipment',          'IFRS 16 leased equipment',        'ROU',      2, true,  'rou',        true,  false, false, 'forbid', 320),
    -- L2 CWIP
    ('CWIP-GEN',   'General CWIP',             'Reclassified on capitalization',  'CWIP',     2, true,  'cwip',       false, false, false, 'forbid', 410);

    -- ── STAGE C: Upsert L1 headers ───────────────────────────────────────────
    INSERT INTO master.asset_class (
        tenant_id,
        code, name, description,
        parent_id, level_no, path, is_leaf,
        asset_nature, is_depreciable,
        is_componentization_required, revaluation_allowed,
        useful_life_override_policy,
        sort_order, metadata, status, created_by
    )
    SELECT v_tid,
        t.code, t.name, t.description,
        NULL, t.level_no, t.code, t.is_leaf,
        t.asset_nature, t.is_depreciable,
        t.is_componentization_required, t.revaluation_allowed,
        t.useful_life_override_policy,
        t.sort_order, v_meta, 'active', v_su
    FROM tmp_ac t WHERE t.parent_code IS NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        asset_nature = EXCLUDED.asset_nature,
        is_depreciable = EXCLUDED.is_depreciable,
        is_leaf     = EXCLUDED.is_leaf,
        sort_order  = EXCLUDED.sort_order,
        updated_at  = now(), updated_by = v_su
    WHERE (master.asset_class.name, master.asset_class.asset_nature,
           master.asset_class.is_depreciable, master.asset_class.is_leaf)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.asset_nature,
           EXCLUDED.is_depreciable, EXCLUDED.is_leaf);

    -- ── STAGE D: Upsert L2 leaves (parent must exist first) ──────────────────
    INSERT INTO master.asset_class (
        tenant_id,
        code, name, description,
        parent_id, level_no, path, is_leaf,
        asset_nature, is_depreciable,
        is_componentization_required, revaluation_allowed,
        useful_life_override_policy,
        sort_order, metadata, status, created_by
    )
    SELECT v_tid,
        t.code, t.name, t.description,
        p.id, t.level_no, p.path || '/' || t.code, t.is_leaf,
        t.asset_nature, t.is_depreciable,
        t.is_componentization_required, t.revaluation_allowed,
        t.useful_life_override_policy,
        t.sort_order, v_meta, 'active', v_su
    FROM tmp_ac t
    JOIN master.asset_class p ON p.tenant_id = v_tid AND p.code = t.parent_code
    WHERE t.parent_code IS NOT NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        parent_id   = EXCLUDED.parent_id,
        path        = EXCLUDED.path,
        asset_nature = EXCLUDED.asset_nature,
        is_depreciable = EXCLUDED.is_depreciable,
        is_leaf     = EXCLUDED.is_leaf,
        sort_order  = EXCLUDED.sort_order,
        updated_at  = now(), updated_by = v_su
    WHERE (master.asset_class.name, master.asset_class.parent_id,
           master.asset_class.asset_nature, master.asset_class.is_depreciable,
           master.asset_class.is_leaf)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.parent_id,
           EXCLUDED.asset_nature, EXCLUDED.is_depreciable,
           EXCLUDED.is_leaf);

    -- ── STAGE E: Assertions ───────────────────────────────────────────────────

    -- E1: Total = 16
    SELECT count(*) INTO v_count FROM master.asset_class
    WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack;
    IF v_count != 16 THEN
        RAISE EXCEPTION '[340] Expected 16 asset classes, got %', v_count;
    END IF;

    -- E2: 4 L1 headers
    SELECT count(*) INTO v_count FROM master.asset_class
    WHERE tenant_id = v_tid AND level_no = 1 AND metadata->'_seed'->>'pack' = v_pack;
    IF v_count != 4 THEN
        RAISE EXCEPTION '[340] Expected 4 L1 headers, got %', v_count;
    END IF;

    -- E3: 12 L2 leaves
    SELECT count(*) INTO v_count FROM master.asset_class
    WHERE tenant_id = v_tid AND level_no = 2 AND metadata->'_seed'->>'pack' = v_pack;
    IF v_count != 12 THEN
        RAISE EXCEPTION '[340] Expected 12 L2 leaves, got %', v_count;
    END IF;

    -- E4: Land/CWIP not depreciable
    IF EXISTS (
        SELECT id FROM master.asset_class
        WHERE tenant_id = v_tid
          AND asset_nature IN ('land', 'cwip')
          AND is_depreciable = true
    ) THEN
        RAISE EXCEPTION '[340] Land/CWIP class marked as depreciable';
    END IF;

    -- E5: All L2 leaves have a valid parent
    IF EXISTS (
        SELECT id FROM master.asset_class
        WHERE tenant_id = v_tid AND level_no = 2 AND parent_id IS NULL
          AND metadata->'_seed'->>'pack' = v_pack
    ) THEN
        RAISE EXCEPTION '[340] L2 leaf found with NULL parent_id';
    END IF;

    RAISE NOTICE '[340] OK: % asset classes (% L1 headers + % L2 leaves) seeded for tenant %',
        (SELECT count(*) FROM master.asset_class WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.asset_class WHERE tenant_id = v_tid AND level_no = 1 AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.asset_class WHERE tenant_id = v_tid AND level_no = 2 AND metadata->'_seed'->>'pack' = v_pack),
        v_tid;

END $seed$;
