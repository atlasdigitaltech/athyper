-- ============================================================================
-- UNIVERSAL — BASE ITEM CATEGORIES
-- ============================================================================
-- File:     025_base_item_categories.sql
-- Schema:   master.item_category
-- Purpose:  4 L1 roots + ~32 industry-neutral leaf children
-- Depends:  010_platform/099_tenant_bootstrap (tenant must exist)
-- Idempotent: Yes — ON CONFLICT (tenant_id, code) DO UPDATE
-- Spec ref: §14 Item Category Taxonomy — Base + Pack Shape
-- ============================================================================
-- Execution order: runs AFTER 021, BEFORE 022 and 023
--   020 → 021 → 025 → 022 → 023 → 024 → 026
-- ============================================================================
-- item_category answers: "What TYPE of thing is this?"
-- spend_category answers: "What are we BUYING?"
-- They are parallel taxonomies that intersect at the document line.
-- ============================================================================
-- PACK OWNS: IC-GOODS, IC-EQUIP, IC-SVC, IC-CONMAT and all IC-* leaf codes
-- ============================================================================
-- NOTE: default_tax_group_id is NOT populated here (§14.4).
--   The column is added via ALTER TABLE in the tax engine migration.
--   Tax group linkage is a post-integration step after tax_group rows exist.
-- ============================================================================

DO $seed$
DECLARE
    v_tid uuid;
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_pack     text := '025_base';
    v_version  text := '1.0.0';
BEGIN
    -- ── STAGE A: Resolve tenant ──────────────────────────────────────────
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    -- ── STAGE B: Stage item category data ────────────────────────────────
    CREATE TEMP TABLE tmp_ic (
        seed_id       uuid DEFAULT shared.uuidv7(),
        code          text NOT NULL,
        name          text NOT NULL,
        description   text,
        parent_code   text,           -- NULL for roots
        level_no      smallint NOT NULL DEFAULT 1,
        sort_order    smallint NOT NULL DEFAULT 0,
        is_container  boolean NOT NULL DEFAULT false
    ) ON COMMIT DROP;

    -- ══════════════════════════════════════════════════════════════════════
    -- L1 ROOTS (4)  — container-only, no bridge entries
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_ic (code, name, description, level_no, sort_order, is_container) VALUES
    ('IC-GOODS',  'Physical Goods',                    'Tangible materials, components, consumables, and finished goods',     1, 100, true),
    ('IC-EQUIP',  'Equipment & Capital Assets',        'Machinery, vehicles, IT hardware, and durable capital items',         1, 200, true),
    ('IC-SVC',    'Services',                          'Non-physical professional, maintenance, logistics, and IT services',  1, 300, true),
    ('IC-CONMAT', 'Construction & Building Materials', 'Structural, mechanical, electrical, and finishing construction items', 1, 400, true);

    -- ══════════════════════════════════════════════════════════════════════
    -- IC-GOODS children (10 leaves)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_ic (code, name, description, parent_code, level_no, sort_order) VALUES
    ('IC-RAW',    'Raw Materials',                     'Metals, polymers, wood, textiles, and other base materials',          'IC-GOODS', 2, 101),
    ('IC-COMP',   'Components & Sub-assemblies',       'Motors, PCBs, bearings, gears, and assembled modules',               'IC-GOODS', 2, 102),
    ('IC-PACK',   'Packaging',                         'Cartons, bottles, pallets, labels, and shrink wrap',                  'IC-GOODS', 2, 103),
    ('IC-FG',     'Finished Goods',                    'Completed products ready for sale or distribution',                   'IC-GOODS', 2, 104),
    ('IC-SPARE',  'Spare Parts',                       'Rotables, blades, seals, and replacement components',                 'IC-GOODS', 2, 105),
    ('IC-CONSUM', 'Consumables',                       'Office supplies, PPE, cleaning agents, and disposable items',         'IC-GOODS', 2, 106),
    ('IC-CHEM',   'Chemicals',                         'Solvents, lubricants, reagents, industrial gases, and catalysts',     'IC-GOODS', 2, 107),
    ('IC-FUEL',   'Fuel & Energy',                     'Natural gas, diesel, petrol, LPG, and solid fuels',                   'IC-GOODS', 2, 108),
    ('IC-PPE',    'Safety & PPE',                      'Helmets, gloves, harnesses, goggles, and protective clothing',        'IC-GOODS', 2, 109),
    ('IC-FOOD',   'Food & Beverage Ingredients',       'Fresh, frozen, dry ingredients, and beverage raw materials',           'IC-GOODS', 2, 110);

    -- ══════════════════════════════════════════════════════════════════════
    -- IC-EQUIP children (9 leaves)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_ic (code, name, description, parent_code, level_no, sort_order) VALUES
    ('IC-IT-EQ',  'IT Equipment',                      'Servers, laptops, desktops, networking, and peripherals',             'IC-EQUIP', 2, 201),
    ('IC-OFF-EQ', 'Office Equipment',                  'Furniture, printers, AV systems, and presentation equipment',         'IC-EQUIP', 2, 202),
    ('IC-HVY-EQ', 'Heavy Equipment',                   'Cranes, excavators, loaders, bulldozers, and piling rigs',           'IC-EQUIP', 2, 203),
    ('IC-PLT-EQ', 'Plant Equipment',                   'Turbines, generators, transformers, and boilers',                     'IC-EQUIP', 2, 204),
    ('IC-MFG-EQ', 'Manufacturing Equipment',           'CNC machines, moulds, injection moulders, and robots',               'IC-EQUIP', 2, 205),
    ('IC-LAB-EQ', 'Lab & Testing Equipment',           'Spectrometers, chromatographs, gauges, and test benches',            'IC-EQUIP', 2, 206),
    ('IC-MED-EQ', 'Medical Equipment',                 'Imaging devices, surgical instruments, and patient monitors',         'IC-EQUIP', 2, 207),
    ('IC-VEH',    'Vehicles',                          'Cars, trucks, forklifts, buses, and specialised vehicles',            'IC-EQUIP', 2, 208),
    ('IC-AGR-EQ', 'Agricultural Equipment',            'Tractors, harvesters, seeders, and irrigation rigs',                  'IC-EQUIP', 2, 209);

    -- ══════════════════════════════════════════════════════════════════════
    -- IC-SVC children (7 leaves)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_ic (code, name, description, parent_code, level_no, sort_order) VALUES
    ('IC-PROFSVC',  'Professional Services',           'Consulting, legal, audit, and advisory services',                     'IC-SVC', 2, 301),
    ('IC-MAINTSVC', 'Maintenance Services',            'Overhaul, facility management, calibration, and repair',              'IC-SVC', 2, 302),
    ('IC-LOGSVC',   'Logistics & Freight',             'Shipping, trucking, customs brokerage, and 3PL fulfilment',           'IC-SVC', 2, 303),
    ('IC-SUBSVC',   'Subcontractor Services',          'Civil, MEP, finishes, and specialist trade subcontracting',           'IC-SVC', 2, 304),
    ('IC-TESTSVC',  'Testing & Inspection',            'NDT, quality control, lab analysis, and third-party inspection',      'IC-SVC', 2, 305),
    ('IC-CLEANSVC', 'Cleaning & Facility Services',    'Janitorial, waste management, and pest control services',             'IC-SVC', 2, 306),
    ('IC-ITSVC',    'IT Services',                     'Software development, support, managed services, and cybersecurity',  'IC-SVC', 2, 307);

    -- ══════════════════════════════════════════════════════════════════════
    -- IC-CONMAT children (6 leaves)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_ic (code, name, description, parent_code, level_no, sort_order) VALUES
    ('IC-STRUCT',  'Structural',                       'Steel beams, rebar, plates, and prefabricated sections',              'IC-CONMAT', 2, 401),
    ('IC-CONC',    'Concrete & Masonry',               'Ready-mix concrete, blocks, aggregate, and mortar',                   'IC-CONMAT', 2, 402),
    ('IC-ELEC',    'Electrical',                       'Cable, switchgear, panels, transformers, and conduit',                'IC-CONMAT', 2, 403),
    ('IC-MECH',    'Mechanical & Piping',              'Pipes, valves, HVAC ducts, flanges, and fittings',                    'IC-CONMAT', 2, 404),
    ('IC-FINISH',  'Finishing',                        'Tiles, paint, glass, cladding, and ceiling systems',                  'IC-CONMAT', 2, 405),
    ('IC-SCAFF',   'Scaffolding & Formwork',           'Scaffolding systems, formwork, and temporary support structures',     'IC-CONMAT', 2, 406);


    -- ── STAGE C: UPSERT roots (parent_code IS NULL) ─────────────────────
    INSERT INTO master.item_category (
        id, tenant_id, code, name, description, parent_id,
        level_no, sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id,
        v_tid,
        s.code,
        s.name,
        s.description,
        NULL,                   -- root: no parent
        s.level_no,
        s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack',      v_pack,
            'version',   v_version,
            'seeded_at', now()::text,
            'container', true
        )),
        'active',
        v_su
    FROM tmp_ic s
    WHERE s.parent_code IS NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        level_no    = EXCLUDED.level_no,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.item_category.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack',      v_pack,
                             'version',   v_version,
                             'seeded_at', now()::text,
                             'container', true
                         )),
        updated_at  = now(),
        updated_by  = v_su
    WHERE (master.item_category.name, master.item_category.description,
           master.item_category.level_no, master.item_category.sort_order)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.description,
           EXCLUDED.level_no, EXCLUDED.sort_order);

    -- ── STAGE D: UPSERT leaves (parent_code IS NOT NULL) ────────────────
    INSERT INTO master.item_category (
        id, tenant_id, code, name, description, parent_id,
        level_no, sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id,
        v_tid,
        s.code,
        s.name,
        s.description,
        p.id,                     -- resolved parent
        s.level_no,
        s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack',      v_pack,
            'version',   v_version,
            'seeded_at', now()::text
        )),
        'active',
        v_su
    FROM tmp_ic s
    JOIN master.item_category p
      ON p.tenant_id = v_tid AND p.code = s.parent_code
    WHERE s.parent_code IS NOT NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name        = EXCLUDED.name,
        description = EXCLUDED.description,
        parent_id   = EXCLUDED.parent_id,
        level_no    = EXCLUDED.level_no,
        sort_order  = EXCLUDED.sort_order,
        metadata    = master.item_category.metadata
                      || jsonb_build_object('_seed', jsonb_build_object(
                             'pack',      v_pack,
                             'version',   v_version,
                             'seeded_at', now()::text
                         )),
        updated_at  = now(),
        updated_by  = v_su
    WHERE (master.item_category.name, master.item_category.description,
           master.item_category.parent_id, master.item_category.level_no,
           master.item_category.sort_order)
       IS DISTINCT FROM
          (EXCLUDED.name, EXCLUDED.description,
           EXCLUDED.parent_id, EXCLUDED.level_no,
           EXCLUDED.sort_order);

    -- ── STAGE E: Assertions ──────────────────────────────────────────────
    IF (SELECT count(*) FROM master.item_category
        WHERE tenant_id = v_tid
          AND metadata->'_seed'->>'pack' = v_pack) < 36 THEN
        RAISE EXCEPTION '[025_base] Item category load incomplete: expected ≥36, got %',
            (SELECT count(*) FROM master.item_category
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.item_category
        WHERE tenant_id = v_tid AND parent_id IS NULL
          AND metadata->'_seed'->>'pack' = v_pack) <> 4 THEN
        RAISE EXCEPTION '[025_base] Expected 4 root item categories, got %',
            (SELECT count(*) FROM master.item_category
             WHERE tenant_id = v_tid AND parent_id IS NULL
               AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.item_category
        WHERE tenant_id = v_tid
          AND COALESCE((metadata->'_seed'->>'container')::boolean, false) = true
          AND metadata->'_seed'->>'pack' = v_pack) <> 4 THEN
        RAISE EXCEPTION '[025_base] Expected 4 container-only roots, got %',
            (SELECT count(*) FROM master.item_category
             WHERE tenant_id = v_tid
               AND COALESCE((metadata->'_seed'->>'container')::boolean, false) = true
               AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    RAISE NOTICE '[025_base] Item categories loaded: % total (% roots, % leaves)',
        (SELECT count(*) FROM master.item_category
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.item_category
         WHERE tenant_id = v_tid AND parent_id IS NULL
           AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.item_category
         WHERE tenant_id = v_tid AND parent_id IS NOT NULL
           AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;
