-- Tenant-default inventory policy for stockable commodity_category rows only
-- (inventory_allowed=true). Covers valuation method, tracking requirements,
-- reorder method, warehouse class. Company/warehouse-specific overrides come
-- from tenant setup scripts.

DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_pack    text := '029_commodity_inventory_policy';
    v_version text := '1.0.0';
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM master.commodity_category WHERE tenant_id = v_tid AND code = 'SC-IT') THEN
        RAISE EXCEPTION '[029] commodity_categories not seeded — run 023 first';
    END IF;

    DELETE FROM control.commodity_category_inventory_policy
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack;

    CREATE TEMP TABLE tmp_inv_policy (
        cc_code             text NOT NULL,
        valuation_method    text,
        reorder_method      text DEFAULT 'MIN_MAX',
        lot_allowed         boolean NOT NULL DEFAULT false,
        lot_required        boolean NOT NULL DEFAULT false,
        serial_allowed      boolean NOT NULL DEFAULT false,
        serial_required     boolean NOT NULL DEFAULT false,
        warehouse_class     text
    ) ON COMMIT DROP;

    INSERT INTO tmp_inv_policy VALUES
    ('SC-IT-HW',        'weighted_avg', 'MANUAL',   false, false, true,  true,  'ELECTRONICS'),
    ('SC-OFFICE-SUP',   'weighted_avg', 'MIN_MAX',  false, false, false, false, 'GENERAL'),
    ('SC-OFFICE-FURN',  'weighted_avg', 'MANUAL',   false, false, false, false, 'GENERAL'),
    ('SC-OFFICE-EQUIP', 'weighted_avg', 'MANUAL',   false, false, false, false, 'ELECTRONICS'),
    -- Fleet
    ('SC-FLEET-VEH',    'specific_id',  'MANUAL',   false, false, true,  true,  'FLEET'),
    ('SC-FLEET-FUEL',   'weighted_avg', 'MIN_MAX',  false, false, false, false, 'BULK_LIQUID');

    INSERT INTO tmp_inv_policy VALUES
    ('SC-RAW-METAL',        'weighted_avg', 'MIN_MAX',  false, false, false, false, 'RAW_MATERIAL'),
    ('SC-RAW-CHEM',         'fifo',         'MIN_MAX',  true,  true,  false, false, 'HAZMAT'),
    ('SC-RAW-AGRI',         'fifo',         'MIN_MAX',  true,  true,  false, false, 'PERISHABLE'),
    -- Components
    ('SC-COMP-MECH',        'weighted_avg', 'MIN_MAX',  false, false, false, false, 'COMPONENTS'),
    ('SC-COMP-ELEC',        'weighted_avg', 'MIN_MAX',  false, false, false, false, 'ELECTRONICS'),
    ('SC-COMP-STRUCT',      'weighted_avg', 'MIN_MAX',  false, false, false, false, 'BULK'),
    -- Packaging
    ('SC-PKG-PRIMARY',      'weighted_avg', 'MIN_MAX',  false, false, false, false, 'PACKAGING'),
    ('SC-PKG-SECONDARY',    'weighted_avg', 'MIN_MAX',  false, false, false, false, 'PACKAGING'),
    ('SC-PKG-TRANSIT',      'weighted_avg', 'MIN_MAX',  false, false, false, false, 'PACKAGING'),
    -- Consumables — lot tracking for regulated chemicals/lab
    ('SC-CONSUM-CHEM',      'fifo',         'MIN_MAX',  true,  true,  false, false, 'HAZMAT'),
    ('SC-CONSUM-LAB',       'fifo',         'MIN_MAX',  true,  true,  false, false, 'LAB'),
    ('SC-CONSUM-CLEAN',     'weighted_avg', 'MIN_MAX',  false, false, false, false, 'GENERAL'),
    -- MRO
    ('SC-MRO-SPARE',        'weighted_avg', 'MIN_MAX',  false, false, false, false, 'MRO'),
    ('SC-MRO-TOOL',         'weighted_avg', 'MANUAL',   false, false, false, false, 'MRO'),
    ('SC-MRO-SUPPLY',       'weighted_avg', 'MIN_MAX',  false, false, false, false, 'MRO'),
    -- Capital Equipment — serial-tracked, specific ID valuation
    ('SC-CAPEQUIP-MACH',    'specific_id',  'MANUAL',   false, false, true,  true,  'HEAVY_EQUIPMENT'),
    ('SC-CAPEQUIP-LINE',    'specific_id',  'MANUAL',   false, false, true,  true,  'HEAVY_EQUIPMENT'),
    ('SC-CAPEQUIP-TOOL',    'weighted_avg', 'MANUAL',   false, false, false, false, 'TOOLING');

    INSERT INTO control.commodity_category_inventory_policy (
        tenant_id,
        commodity_category_id,
        scope_type, scope_id, company_code_id,
        valuation_method,
        override_lot_tracking_required, override_serial_tracking_required,
        effective_from,
        metadata, created_by
    )
    SELECT
        v_tid,
        cc.id,
        'TENANT', NULL, NULL,
        t.valuation_method,
        t.lot_required, t.serial_required,
        CURRENT_DATE,
        jsonb_build_object(
            '_seed', jsonb_build_object(
                'pack', v_pack, 'version', v_version, 'seeded_at', now()::text
            ),
            'inventory_policy', jsonb_build_object(
                'warehouse_class', t.warehouse_class,
                'reorder_method', t.reorder_method,
                'lot_tracking_allowed', t.lot_allowed,
                'serial_tracking_allowed', t.serial_allowed
            )
        ),
        v_su
    FROM tmp_inv_policy t
    JOIN master.commodity_category cc
      ON cc.tenant_id = v_tid
     AND cc.code = t.cc_code
     AND cc.inventory_allowed = true;

    RAISE NOTICE '[029_commodity_inventory_policy] % tenant-level inventory policy rows inserted',
        (SELECT count(*) FROM control.commodity_category_inventory_policy
         WHERE tenant_id = v_tid AND metadata->'_seed'->>'pack' = v_pack);

END $seed$;
