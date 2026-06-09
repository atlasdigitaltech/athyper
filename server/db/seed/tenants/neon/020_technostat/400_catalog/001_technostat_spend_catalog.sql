-- ============================================================================
-- TECHNOSTAT GROUP — COMMODITY CATALOG: Products + Items per Commodity Category
-- ============================================================================
-- File:     400_catalog/001_technostat_spend_catalog.sql
-- Schemas:  master.product, master.item
-- Purpose:  For every active commodity_category in the Technostat tenant:
--             • 1 product  (tenant-scoped,       code = PRD-{SC-CODE})
--             • 1 item per company_code            code = ITM-{SC-CODE})
--           Covers all active commodity categories × 4 company codes
--           (TKSA, SSK, TEGY, SDTX).
--           Re-running after additional commodity categories are applied picks up
--           any new categories automatically.
-- Depends:  blueprints/universal/010_spend_taxonomy/020_commodity_categories.sql
--           020_technostat/003_technostat_production_seed.sql (P03 company codes)
-- Idempotent: Yes — ON CONFLICT ... DO UPDATE throughout
-- ============================================================================

DO $tk_catalog$
DECLARE
    v_tid        uuid;
    v_su         uuid := '00000000-0000-0000-0000-000000000000';
    v_pack       text := 'technostat_spend_catalog';
    v_version    text := '1.0.0';
    v_seed_meta  jsonb;
    v_sc_count   int;
    v_cc_count   int;
    v_prod_count int;
    v_item_count int;
BEGIN

    -- ── STAGE A: Resolve tenant ───────────────────────────────────────────
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'technostat';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[technostat_spend_catalog] tenant "technostat" not found — run 003_technostat_production_seed.sql first';
    END IF;

    v_seed_meta := jsonb_build_object('_seed', jsonb_build_object(
        'pack',      v_pack,
        'version',   v_version,
        'seeded_at', now()::text
    ));

    SELECT count(*) INTO v_sc_count
    FROM master.commodity_category WHERE tenant_id = v_tid AND status = 'active';

    SELECT count(*) INTO v_cc_count
    FROM master.company_code WHERE tenant_id = v_tid AND status = 'active';

    IF v_sc_count = 0 THEN
        RAISE EXCEPTION '[technostat_spend_catalog] No active commodity_categories found — run commodity taxonomy seed first';
    END IF;

    IF v_cc_count = 0 THEN
        RAISE EXCEPTION '[technostat_spend_catalog] No active company_codes found — run 003_technostat_production_seed.sql (P03) first';
    END IF;

    -- ── STAGE B: Products (one per commodity category, tenant-scoped) ─────────
    --   • product_type  = physical (goods) | service (services)
    --   • unit_of_measure = EA for all (demo catalog — cost defaulted to NULL)
    --   • commodity_category_id links product back to its category

    INSERT INTO master.product (
        tenant_id,
        code,
        name,
        description,
        commodity_category_id,
        product_type,
        unit_of_measure,
        is_taxable,
        metadata,
        status,
        created_by
    )
    SELECT
        v_tid,
        'PRD-' || sc.code,
        sc.name,
        'Demo product — ' || sc.name,
        sc.id,
        CASE COALESCE(NULLIF(sc.metadata->>'procurement_type', ''),
                      CASE WHEN sc.inventory_allowed OR sc.buy_allowed THEN 'goods' ELSE 'services' END)
            WHEN 'goods'    THEN 'physical'
            WHEN 'services' THEN 'service'
            ELSE                 'physical'
        END,
        'EA',
        true,
        v_seed_meta,
        'active',
        v_su
    FROM master.commodity_category sc
    WHERE sc.tenant_id = v_tid
      AND sc.status = 'active'
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name              = EXCLUDED.name,
        description       = EXCLUDED.description,
        commodity_category_id = EXCLUDED.commodity_category_id,
        product_type      = EXCLUDED.product_type,
        unit_of_measure   = EXCLUDED.unit_of_measure,
        metadata          = master.product.metadata
                            || jsonb_build_object('_seed', jsonb_build_object(
                                   'pack',      v_pack,
                                   'version',   v_version,
                                   'seeded_at', now()::text
                               )),
        updated_at        = now(),
        updated_by        = v_su;

    -- ── STAGE C: Items (one per commodity category × company code) ────────────
    --   • product_id links to the product created in Stage B (Path A)
    --   • valuation_method = weighted_avg (safe default for demo)
    --   • uom_code = EA (shared.uom FK — EA seeded in 007_uom.sql)
    --   • lot / serial tracking disabled for demo

    INSERT INTO master.item (
        tenant_id,
        company_code_id,
        code,
        name,
        product_id,
        commodity_category_id,
        valuation_method,
        uom_code,
        has_lot_tracking,
        has_serial_tracking,
        metadata,
        status,
        created_by
    )
    SELECT
        v_tid,
        cc.id,
        'ITM-' || sc.code,
        sc.name,
        p.id,
        p.commodity_category_id,
        'weighted_avg',
        'EA',
        false,
        false,
        v_seed_meta,
        'active',
        v_su
    FROM master.commodity_category sc
    CROSS JOIN master.company_code cc
    JOIN master.product p
      ON p.tenant_id = v_tid
     AND p.code      = 'PRD-' || sc.code
    WHERE sc.tenant_id = v_tid AND sc.status = 'active'
      AND cc.tenant_id = v_tid AND cc.status = 'active'
    ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
        name              = EXCLUDED.name,
        product_id        = EXCLUDED.product_id,
        commodity_category_id = EXCLUDED.commodity_category_id,
        uom_code          = EXCLUDED.uom_code,
        metadata          = master.item.metadata
                            || jsonb_build_object('_seed', jsonb_build_object(
                                   'pack',      v_pack,
                                   'version',   v_version,
                                   'seeded_at', now()::text
                               )),
        updated_at        = now(),
        updated_by        = v_su;

    -- ── STAGE D: Report ───────────────────────────────────────────────────
    SELECT count(*) INTO v_prod_count
    FROM master.product
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack;

    SELECT count(*) INTO v_item_count
    FROM master.item
    WHERE tenant_id = v_tid
      AND metadata->'_seed'->>'pack' = v_pack;

    RAISE NOTICE '[technostat_spend_catalog] seeded: % products, % items (% commodity categories × % company codes)',
        v_prod_count, v_item_count, v_sc_count, v_cc_count;

END $tk_catalog$;
