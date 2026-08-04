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
    v_su      uuid;
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
    v_su := nullif(trim(current_setting('app.current_principal_id', true)), '')::uuid;
    IF v_su IS NULL THEN
        RAISE EXCEPTION '[seed] app.current_principal_id not set';
    END IF;

    v_meta := jsonb_build_object('_seed', jsonb_build_object(
        'pack', v_pack, 'version', v_version, 'seeded_at', now()::text));

    -- ── STAGE B: Stage class templates ───────────────────────────────────────
    CREATE TEMP TABLE tmp_ac (
        code            text     NOT NULL PRIMARY KEY,
        name            text     NOT NULL,
        description     text,
        parent_code     text,
        asset_nature    text     NOT NULL,
        is_componentization_required boolean NOT NULL DEFAULT false,
        sort_order      smallint NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO tmp_ac VALUES
    -- L1 Headers (is_leaf = false, non-depreciable until overridden at leaf)
    ('TANGIBLE',   'Tangible Fixed Assets',    'IAS 16 PPE',                     NULL,       'tangible',   false, 100),
    ('INTANGIBLE', 'Intangible Assets',        'IAS 38 intangibles',             NULL,       'intangible', false, 200),
    ('ROU',        'Right-of-Use Assets',      'IFRS 16 leased assets',          NULL,       'right_of_use', false, 300),
    ('CWIP',       'Capital Work in Progress', 'Under construction',             NULL,       'cwip',       false, 400),
    -- L2 Tangible
    ('LAND',       'Land',                     'Non-depreciable (IAS 16)',        'TANGIBLE', 'land',       false, 110),
    ('BUILDINGS',  'Buildings',                'Office, warehouse, plant',        'TANGIBLE', 'tangible',   true,  120),
    ('PLANT',      'Plant & Machinery',        'Production equipment',            'TANGIBLE', 'tangible',   true,  130),
    ('VEHICLES',   'Vehicles',                 'Fleet, cars, forklifts',          'TANGIBLE', 'tangible',   false, 140),
    ('IT-EQUIP',   'IT Equipment',             'Servers, network, desktops',      'TANGIBLE', 'tangible',   false, 150),
    ('FURNITURE',  'Furniture & Fixtures',     'Office furniture, fittings',      'TANGIBLE', 'tangible',   false, 160),
    ('LHI',        'Leasehold Improvements',   'Tenant improvements',             'TANGIBLE', 'leasehold_improvement', false, 170),
    ('TOOLS',      'Tools & Dies',             'Specialised tooling',             'TANGIBLE', 'tangible',   false, 180),
    -- L2 Intangible
    ('SOFTWARE',   'Software & Licences',      'Purchased/developed software',    'INTANGIBLE', 'intangible', false, 210),
    -- L2 ROU
    ('ROU-PROP',   'ROU - Property',           'IFRS 16 leased buildings',        'ROU', 'right_of_use', false, 310),
    ('ROU-EQUIP',  'ROU - Equipment',          'IFRS 16 leased equipment',        'ROU', 'right_of_use', false, 320),
    -- L2 CWIP
    ('CWIP-GEN',   'General CWIP',             'Reclassified on capitalization',  'CWIP', 'cwip', false, 410);

    -- ── STAGE C: Upsert L1 headers ───────────────────────────────────────────
    INSERT INTO master.asset_class (
        tenant_id,
        code, name, description,
        parent_id, asset_nature, is_componentization_required,
        sort_order, metadata, status, created_by
    )
    SELECT v_tid,
        t.code, t.name, t.description,
        NULL, t.asset_nature, t.is_componentization_required,
        t.sort_order, v_meta, 'active', v_su
    FROM tmp_ac t WHERE t.parent_code IS NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        asset_nature = EXCLUDED.asset_nature,
        is_componentization_required = EXCLUDED.is_componentization_required,
        sort_order  = EXCLUDED.sort_order,
        updated_at  = now(), updated_by = v_su
    WHERE (master.asset_class.name, master.asset_class.description,
           master.asset_class.asset_nature, master.asset_class.is_componentization_required,
           master.asset_class.sort_order)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.description, EXCLUDED.asset_nature,
           EXCLUDED.is_componentization_required, EXCLUDED.sort_order);

    -- ── STAGE D: Upsert L2 leaves (parent must exist first) ──────────────────
    INSERT INTO master.asset_class (
        tenant_id,
        code, name, description,
        parent_id, asset_nature, is_componentization_required,
        sort_order, metadata, status, created_by
    )
    SELECT v_tid,
        t.code, t.name, t.description,
        p.id, t.asset_nature, t.is_componentization_required,
        t.sort_order, v_meta, 'active', v_su
    FROM tmp_ac t
    JOIN master.asset_class p ON p.tenant_id = v_tid AND p.code = t.parent_code
    WHERE t.parent_code IS NOT NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        parent_id   = EXCLUDED.parent_id,
        asset_nature = EXCLUDED.asset_nature,
        is_componentization_required = EXCLUDED.is_componentization_required,
        sort_order  = EXCLUDED.sort_order,
        updated_at  = now(), updated_by = v_su
    WHERE (master.asset_class.name, master.asset_class.parent_id,
           master.asset_class.description, master.asset_class.asset_nature,
           master.asset_class.is_componentization_required, master.asset_class.sort_order)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.parent_id,
           EXCLUDED.description, EXCLUDED.asset_nature,
           EXCLUDED.is_componentization_required, EXCLUDED.sort_order);

    -- ── STAGE E: Assertions ───────────────────────────────────────────────────

    -- E1: Total = 16
    SELECT count(*) INTO v_count FROM master.asset_class
    WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack;
    IF v_count != 16 THEN
        RAISE EXCEPTION '[340] Expected 16 asset classes, got %', v_count;
    END IF;

    -- E2: 4 L1 headers
    SELECT count(*) INTO v_count FROM master.asset_class
    WHERE tenant_id = v_tid AND parent_id IS NULL AND metadata->'_seed'->>'pack' = v_pack;
    IF v_count != 4 THEN
        RAISE EXCEPTION '[340] Expected 4 L1 headers, got %', v_count;
    END IF;

    -- E3: 12 L2 leaves
    SELECT count(*) INTO v_count FROM master.asset_class
    WHERE tenant_id = v_tid AND parent_id IS NOT NULL AND metadata->'_seed'->>'pack' = v_pack;
    IF v_count != 12 THEN
        RAISE EXCEPTION '[340] Expected 12 L2 leaves, got %', v_count;
    END IF;

    -- E4: Every non-root class has a valid same-tenant parent.
    IF EXISTS (
        SELECT id FROM master.asset_class
        WHERE tenant_id = v_tid AND code NOT IN ('TANGIBLE','INTANGIBLE','ROU','CWIP') AND parent_id IS NULL
          AND metadata->'_seed'->>'pack' = v_pack
    ) THEN
        RAISE EXCEPTION '[340] L2 leaf found with NULL parent_id';
    END IF;

    RAISE NOTICE '[340] OK: % asset classes (% L1 headers + % L2 leaves) seeded for tenant %',
        (SELECT count(*) FROM master.asset_class WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.asset_class WHERE tenant_id = v_tid AND parent_id IS NULL AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.asset_class WHERE tenant_id = v_tid AND parent_id IS NOT NULL AND metadata->'_seed'->>'pack' = v_pack),
        v_tid;

END $seed$;
