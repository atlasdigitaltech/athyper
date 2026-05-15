-- ============================================================================
-- UNIVERSAL — BASE SPEND CATEGORIES — LAYER B: DIRECT OPERATIONS
-- ============================================================================
-- File:     020b_spend_categories_direct_ops.sql
-- Schema:   master.spend_category
-- Purpose:  13 direct-operations roots + 35 leaf children (48 total)
--           Applied to tenants with manufacturing, logistics, or industrial
--           operations. Run AFTER 020_spend_categories.sql (Layer A).
-- Depends:  020_spend_categories.sql (Layer A must be loaded first)
-- Idempotent: Yes — ON CONFLICT (tenant_id, code) DO UPDATE
-- Spec ref: §4 Spend Category Taxonomy — Layer B
-- ============================================================================
-- PACK OWNS: SC-RAW SC-COMP SC-PKG SC-CONSUM SC-MRO SC-PRODSVC SC-CONTRACT
--            SC-FREIGHT SC-WHSE SC-QC SC-CAPEQUIP SC-TEMPWK SC-PROCNRG
--            (and all SC-*-* children)
-- ============================================================================

DO $seed$
DECLARE
    v_tid uuid;
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_pack     text := '020_base_direct_ops';
    v_version  text := '1.0.0';
BEGIN
    -- ── STAGE A: Resolve tenant ──────────────────────────────────────────
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    -- Verify Layer A prerequisite
    IF NOT EXISTS (SELECT 1 FROM master.spend_category
                   WHERE tenant_id = v_tid AND code = 'SC-IT') THEN
        RAISE EXCEPTION '[020b] Layer A not loaded — run 020_spend_categories.sql first';
    END IF;

    -- ── STAGE B: Stage data ───────────────────────────────────────────────
    DROP TABLE IF EXISTS tmp_sc;
    CREATE TEMP TABLE tmp_sc (
        seed_id       uuid DEFAULT shared.uuidv7(),
        code          text NOT NULL,
        name          text NOT NULL,
        description   text,
        parent_code   text,
        procurement_type text NOT NULL DEFAULT 'goods',
        visibility    text NOT NULL DEFAULT 'standard',
        is_classification_required boolean NOT NULL DEFAULT false,
        is_hs_required boolean NOT NULL DEFAULT false,
        is_regulated  boolean NOT NULL DEFAULT false,
        sort_order    smallint NOT NULL DEFAULT 0,
        is_container  boolean NOT NULL DEFAULT false
    ) ON COMMIT DROP;

    -- ══════════════════════════════════════════════════════════════════════
    -- LAYER B — Direct operations roots (13)
    -- ══════════════════════════════════════════════════════════════════════
    INSERT INTO tmp_sc (code, name, description, procurement_type, sort_order, is_container) VALUES
    ('SC-RAW',      'Raw Materials & Feedstock',             'Metals, chemicals, polymers, and agricultural raw materials',              'goods',   200, true),
    ('SC-COMP',     'Components & Sub-assemblies',           'Mechanical, electrical, and structural components',                        'goods',   210, true),
    ('SC-PKG',      'Packaging Materials',                   'Primary, secondary, and transit packaging',                                'goods',   220, true),
    ('SC-CONSUM',   'Consumables & Chemicals',               'Industrial chemicals, lab consumables, and cleaning agents',               'goods',   230, true),
    ('SC-MRO',      'MRO & Spare Parts',                     'Maintenance spare parts, tools, and supplies',                             'goods',   240, true),
    ('SC-PRODSVC',  'Production / Plant Services',           'Calibration, plant operations, and production support services',            'services',250, true),
    ('SC-CONTRACT', 'Contract Manufacturing / Subcontracting','Contract manufacturing and assembly subcontracting',                      'services',260, true),
    ('SC-FREIGHT',  'Freight, Logistics & Customs',          'Road, sea, air freight, and customs brokerage',                            'services',270, true),
    ('SC-WHSE',     'Warehousing & Cold Chain',              'Warehousing, storage, and temperature-controlled logistics',               'services',280, true),
    ('SC-QC',       'Quality, Lab & Testing',                'Testing, certification, and inspection services',                          'services',290, true),
    ('SC-CAPEQUIP', 'Capital Equipment & Tooling',           'Machinery, tooling, fixtures, and production lines',                       'goods',   300, true),
    ('SC-TEMPWK',   'Temporary Works / Site Services',       'Scaffolding, temporary site facilities, and access equipment',             'services',310, true),
    ('SC-PROCNRG',  'Process Energy / Utility Input',        'Steam, compressed air, and process gases used in production',              'services',320, true);

    -- ── Leaves: SC-RAW ────────────────────────────────────────────────────
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-RAW-METAL', 'Metals & Alloys',                   'Steel, aluminium, copper, and specialty alloys',                      'SC-RAW', 'goods', 201),
    ('SC-RAW-CHEM',  'Chemicals & Polymers',              'Base chemicals, resins, polymers, and solvents',                      'SC-RAW', 'goods', 202),
    ('SC-RAW-AGRI',  'Agricultural Raw Materials',        'Cotton, jute, rubber, timber, and other agri commodities',            'SC-RAW', 'goods', 203);

    -- ── Leaves: SC-COMP ───────────────────────────────────────────────────
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-COMP-MECH',   'Mechanical Components',           'Bearings, gears, fasteners, valves, and pumps',                       'SC-COMP', 'goods', 211),
    ('SC-COMP-ELEC',   'Electrical & Electronic Comps',   'PCBs, connectors, relays, sensors, and semiconductors',               'SC-COMP', 'goods', 212),
    ('SC-COMP-STRUCT', 'Structural Components',           'Beams, columns, plates, and prefabricated sections',                  'SC-COMP', 'goods', 213);

    -- ── Leaves: SC-PKG ────────────────────────────────────────────────────
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-PKG-PRIMARY',   'Primary Packaging',             'Bottles, blister packs, pouches, and vials',                           'SC-PKG', 'goods', 221),
    ('SC-PKG-SECONDARY', 'Secondary Packaging',           'Cartons, boxes, shrink wrap, and labels',                              'SC-PKG', 'goods', 222),
    ('SC-PKG-TRANSIT',   'Transit Packaging',             'Pallets, stretch film, crates, and dunnage',                           'SC-PKG', 'goods', 223);

    -- ── Leaves: SC-CONSUM ─────────────────────────────────────────────────
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-CONSUM-CHEM',  'Industrial Chemicals',           'Process chemicals, catalysts, and reagents',                           'SC-CONSUM', 'goods', 231),
    ('SC-CONSUM-LAB',   'Laboratory Consumables',         'Glassware, pipettes, filters, and test kits',                          'SC-CONSUM', 'goods', 232),
    ('SC-CONSUM-CLEAN', 'Cleaning Consumables',           'Solvents, detergents, wipes, and cleanroom supplies',                  'SC-CONSUM', 'goods', 233);

    -- ── Leaves: SC-MRO ────────────────────────────────────────────────────
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-MRO-SPARE',  'Spare Parts',                      'OEM and aftermarket replacement parts',                                'SC-MRO', 'goods', 241),
    ('SC-MRO-TOOL',   'Maintenance Tools',                'Hand tools, power tools, and diagnostic equipment',                    'SC-MRO', 'goods', 242),
    ('SC-MRO-SUPPLY', 'Maintenance Supplies',             'Lubricants, adhesives, tapes, and safety consumables',                 'SC-MRO', 'goods', 243);

    -- ── Leaves: SC-PRODSVC ────────────────────────────────────────────────
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-PRODSVC-CALIB', 'Calibration Services',          'Instrument calibration, metrology, and certification',                 'SC-PRODSVC', 'services', 251),
    ('SC-PRODSVC-PLANT', 'Plant Operations Services',     'Commissioning, shutdown, and turnaround support',                      'SC-PRODSVC', 'services', 252);

    -- ── Leaves: SC-CONTRACT ───────────────────────────────────────────────
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-CONTRACT-MFG', 'Contract Manufacturing',         'Toll manufacturing, white-label, and private-label production',        'SC-CONTRACT', 'services', 261),
    ('SC-CONTRACT-ASM', 'Assembly Subcontracting',        'Sub-assembly, kitting, and final assembly outsourcing',                'SC-CONTRACT', 'services', 262);

    -- ── Leaves: SC-FREIGHT ────────────────────────────────────────────────
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-FREIGHT-ROAD', 'Road Freight',                   'FTL, LTL, and last-mile delivery',                                    'SC-FREIGHT', 'services', 271),
    ('SC-FREIGHT-SEA',  'Sea Freight',                    'FCL, LCL, breakbulk, and tanker shipping',                             'SC-FREIGHT', 'services', 272),
    ('SC-FREIGHT-AIR',  'Air Freight',                    'Express air, charter, and consolidated airfreight',                    'SC-FREIGHT', 'services', 273),
    ('SC-FREIGHT-CUST', 'Customs & Brokerage',            'Customs clearance, brokerage, and trade compliance',                   'SC-FREIGHT', 'services', 274);

    -- ── Leaves: SC-WHSE ───────────────────────────────────────────────────
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-WHSE-STORE', 'Warehousing & Storage',            'Ambient, bonded, and free-zone warehouse space',                      'SC-WHSE', 'services', 281),
    ('SC-WHSE-COLD',  'Cold Chain Services',              'Refrigerated storage, reefer transport, and cold-room operations',     'SC-WHSE', 'services', 282);

    -- ── Leaves: SC-QC ─────────────────────────────────────────────────────
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-QC-TEST',    'Testing & Analysis',               'Chemical, physical, microbiological, and mechanical testing',          'SC-QC', 'services', 291),
    ('SC-QC-CERT',    'Certification & Accreditation',    'ISO, HACCP, GMP, and product certification',                           'SC-QC', 'services', 292),
    ('SC-QC-INSPECT', 'Inspection Services',              'Pre-shipment, in-process, and third-party inspection',                 'SC-QC', 'services', 293);

    -- ── Leaves: SC-CAPEQUIP ───────────────────────────────────────────────
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-CAPEQUIP-MACH', 'Machinery',                     'Industrial machinery, CNC, and automated equipment',                  'SC-CAPEQUIP', 'goods', 301),
    ('SC-CAPEQUIP-TOOL', 'Tooling & Fixtures',            'Dies, moulds, jigs, and special-purpose tooling',                     'SC-CAPEQUIP', 'goods', 302),
    ('SC-CAPEQUIP-LINE', 'Production Lines',              'Assembly lines, conveyors, and process equipment trains',              'SC-CAPEQUIP', 'goods', 303);

    -- ── Leaves: SC-TEMPWK ─────────────────────────────────────────────────
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-TEMPWK-SCAF', 'Scaffolding & Access',            'Scaffolding erection, aerial platforms, and rope access',              'SC-TEMPWK', 'services', 311),
    ('SC-TEMPWK-SITE', 'Site Services',                   'Portable cabins, site welfare, and temporary utilities',               'SC-TEMPWK', 'services', 312);

    -- ── Leaves: SC-PROCNRG ────────────────────────────────────────────────
    INSERT INTO tmp_sc (code, name, description, parent_code, procurement_type, sort_order) VALUES
    ('SC-PROCNRG-STEAM', 'Steam & Thermal',               'Industrial steam generation and thermal energy supply',               'SC-PROCNRG', 'services', 321),
    ('SC-PROCNRG-COMP',  'Compressed Air & Gases',        'Compressed air, nitrogen, oxygen, and specialty gases',               'SC-PROCNRG', 'services', 322);

    -- ── STAGE C: UPSERT roots ────────────────────────────────────────────
    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id,
        root_category_id, procurement_type, visibility,
        is_classification_required, is_hs_required, is_regulated,
        sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        NULL, s.seed_id, s.procurement_type, s.visibility,
        s.is_classification_required, s.is_hs_required, s.is_regulated,
        s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version,
            'seeded_at', now()::text, 'container', true
        )),
        'active', v_su
    FROM tmp_sc s WHERE s.parent_code IS NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name                       = EXCLUDED.name,
        description                = EXCLUDED.description,
        procurement_type           = EXCLUDED.procurement_type,
        visibility                 = EXCLUDED.visibility,
        is_classification_required = EXCLUDED.is_classification_required,
        is_hs_required             = EXCLUDED.is_hs_required,
        is_regulated               = EXCLUDED.is_regulated,
        sort_order                 = EXCLUDED.sort_order,
        metadata                   = master.spend_category.metadata
                                     || jsonb_build_object('_seed', jsonb_build_object(
                                            'pack', v_pack, 'version', v_version,
                                            'seeded_at', now()::text, 'container', true
                                        )),
        updated_at = now(), updated_by = v_su;

    -- ── STAGE D: UPSERT leaves ───────────────────────────────────────────
    INSERT INTO master.spend_category (
        id, tenant_id, code, name, description, parent_id,
        root_category_id, procurement_type, visibility,
        is_classification_required, is_hs_required, is_regulated,
        sort_order, metadata, status, created_by
    )
    SELECT
        s.seed_id, v_tid, s.code, s.name, s.description,
        p.id, p.root_category_id, s.procurement_type, s.visibility,
        s.is_classification_required, s.is_hs_required, s.is_regulated,
        s.sort_order,
        jsonb_build_object('_seed', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
        )),
        'active', v_su
    FROM tmp_sc s
    JOIN master.spend_category p ON p.tenant_id = v_tid AND p.code = s.parent_code
    WHERE s.parent_code IS NOT NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name                       = EXCLUDED.name,
        description                = EXCLUDED.description,
        parent_id                  = EXCLUDED.parent_id,
        root_category_id           = EXCLUDED.root_category_id,
        procurement_type           = EXCLUDED.procurement_type,
        visibility                 = EXCLUDED.visibility,
        is_classification_required = EXCLUDED.is_classification_required,
        is_hs_required             = EXCLUDED.is_hs_required,
        is_regulated               = EXCLUDED.is_regulated,
        sort_order                 = EXCLUDED.sort_order,
        metadata                   = master.spend_category.metadata
                                     || jsonb_build_object('_seed', jsonb_build_object(
                                            'pack', v_pack, 'version', v_version,
                                            'seeded_at', now()::text
                                        )),
        updated_at = now(), updated_by = v_su;

    -- ── STAGE E: Assertions ──────────────────────────────────────────────
    IF (SELECT count(*) FROM master.spend_category
        WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack) <> 48 THEN
        RAISE EXCEPTION '[020b_base_direct_ops] Expected 48 rows (13 roots + 35 leaves), got %',
            (SELECT count(*) FROM master.spend_category
             WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    IF (SELECT count(*) FROM master.spend_category
        WHERE tenant_id = v_tid AND parent_id IS NULL
          AND metadata->'_seed'->>'pack' = v_pack) <> 13 THEN
        RAISE EXCEPTION '[020b_base_direct_ops] Expected 13 root categories, got %',
            (SELECT count(*) FROM master.spend_category
             WHERE tenant_id = v_tid AND parent_id IS NULL
               AND metadata->'_seed'->>'pack' = v_pack);
    END IF;

    RAISE NOTICE '[020b_base_direct_ops] Layer B loaded: % total (% roots, % leaves)',
        (SELECT count(*) FROM master.spend_category
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.spend_category
         WHERE tenant_id = v_tid AND parent_id IS NULL
           AND metadata->'_seed'->>'pack' = v_pack),
        (SELECT count(*) FROM master.spend_category
         WHERE tenant_id = v_tid AND parent_id IS NOT NULL
           AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;
