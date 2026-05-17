-- ============================================================================
-- UNIVERSAL - COMMODITY CATEGORY MODEL MIGRATION
-- ============================================================================
-- File:     028_commodity_category_model.sql
-- Schema:   master/control
-- Purpose:  Build the Phase 1 commodity_category model from existing
--           spend_category, product, item, and classification seeds.
-- Depends:  020/020b spend categories, 021 business intents,
--           022/022b default intent links, 026/026b intent rules,
--           027 commodity bridge
-- Idempotent: Yes
-- ============================================================================

DO $seed$
DECLARE
    v_tid uuid;
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_pack text := '028_commodity_model';
    v_version text := '1.0.0';
    v_effective_from date := DATE '2026-05-16';
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set - run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM master.spend_category WHERE tenant_id = v_tid) THEN
        RAISE EXCEPTION '[028_commodity_model] spend_category seed is required before commodity_category migration';
    END IF;

    INSERT INTO master.owner_type (
        tenant_id, code, name, description,
        schema_name, table_name, pk_column,
        is_tenant_scoped, tenant_column,
        supports_address, supports_contact,
        is_system, category,
        allowed_address_purposes, allowed_contact_purposes,
        status, created_by
    )
    VALUES (
        NULL, 'commodity_category', 'Commodity Category',
        'Shared commodity category. Target for commodity classification bridges across spend, sales, and inventory.',
        'master', 'commodity_category', 'id',
        true, 'tenant_id',
        false, false,
        true, 'custom',
        ARRAY[]::text[], ARRAY[]::text[],
        'active', v_su
    )
    ON CONFLICT (code) WHERE tenant_id IS NULL DO NOTHING;

    -- Stage A: commodity_category from spend_category roots.
    INSERT INTO master.commodity_category (
        id, tenant_id, code, name, description, parent_id, root_category_id,
        level_no, sort_order, metadata, status, created_by
    )
    SELECT
        sc.id,
        sc.tenant_id,
        sc.code,
        sc.name,
        sc.description,
        NULL,
        sc.id,
        1,
        sc.sort_order,
        COALESCE(sc.metadata, '{}'::jsonb)
            || jsonb_build_object('_commodity_model', jsonb_build_object(
                'pack', v_pack, 'version', v_version, 'source_table', 'master.spend_category',
                'source_id', sc.id, 'seeded_at', now()::text
            )),
        sc.status,
        v_su
    FROM master.spend_category sc
    WHERE sc.tenant_id = v_tid
      AND sc.parent_id IS NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name             = EXCLUDED.name,
        description      = EXCLUDED.description,
        parent_id        = NULL,
        root_category_id = master.commodity_category.id,
        level_no         = EXCLUDED.level_no,
        sort_order       = EXCLUDED.sort_order,
        metadata         = master.commodity_category.metadata || jsonb_build_object(
            '_commodity_model', EXCLUDED.metadata -> '_commodity_model'
        ),
        status           = EXCLUDED.status,
        updated_at       = now(),
        updated_by       = v_su;

    -- Stage B: commodity_category from spend_category children.
    INSERT INTO master.commodity_category (
        id, tenant_id, code, name, description, parent_id, root_category_id,
        level_no, sort_order, metadata, status, created_by
    )
    SELECT
        sc.id,
        sc.tenant_id,
        sc.code,
        sc.name,
        sc.description,
        parent_cc.id,
        root_cc.id,
        COALESCE(parent_cc.level_no + 1, 2),
        sc.sort_order,
        COALESCE(sc.metadata, '{}'::jsonb)
            || jsonb_build_object('_commodity_model', jsonb_build_object(
                'pack', v_pack, 'version', v_version, 'source_table', 'master.spend_category',
                'source_id', sc.id, 'seeded_at', now()::text
            )),
        sc.status,
        v_su
    FROM master.spend_category sc
    JOIN master.spend_category parent_sc
      ON parent_sc.tenant_id = sc.tenant_id AND parent_sc.id = sc.parent_id
    JOIN master.spend_category root_sc
      ON root_sc.tenant_id = sc.tenant_id AND root_sc.id = sc.root_category_id
    JOIN master.commodity_category parent_cc
      ON parent_cc.tenant_id = sc.tenant_id AND parent_cc.code = parent_sc.code
    JOIN master.commodity_category root_cc
      ON root_cc.tenant_id = sc.tenant_id AND root_cc.code = root_sc.code
    WHERE sc.tenant_id = v_tid
      AND sc.parent_id IS NOT NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name             = EXCLUDED.name,
        description      = EXCLUDED.description,
        parent_id        = EXCLUDED.parent_id,
        root_category_id = EXCLUDED.root_category_id,
        level_no         = EXCLUDED.level_no,
        sort_order       = EXCLUDED.sort_order,
        metadata         = master.commodity_category.metadata || jsonb_build_object(
            '_commodity_model', EXCLUDED.metadata -> '_commodity_model'
        ),
        status           = EXCLUDED.status,
        updated_at       = now(),
        updated_by       = v_su;

    -- Stage C: buy-side and classification posture from spend_category.
    UPDATE master.commodity_category cc
       SET buy_allowed = true,
           is_classification_required = sc.is_classification_required,
           is_hs_required = sc.is_hs_required,
           is_regulated = sc.is_regulated,
           allowed_classification_domains = CASE
               WHEN sc.is_hs_required
                AND NOT (COALESCE(sc.allowed_domains, '[]'::jsonb) ? 'hs')
               THEN COALESCE(sc.allowed_domains, '[]'::jsonb) || '["hs"]'::jsonb
               ELSE COALESCE(sc.allowed_domains, '[]'::jsonb)
           END,
           metadata = cc.metadata || jsonb_build_object('_commodity_buy', jsonb_build_object(
               'pack', v_pack, 'version', v_version, 'source_table', 'master.spend_category',
               'source_id', sc.id, 'seeded_at', now()::text
           )),
           updated_at = now(),
           updated_by = v_su
      FROM master.spend_category sc
     WHERE sc.tenant_id = v_tid
       AND cc.tenant_id = sc.tenant_id
       AND cc.code = sc.code;

    -- Stage D: backfill item commodity_category_id from linked products.
    WITH resolved_product AS (
        SELECT
            p.id,
            p.commodity_category_id
        FROM master.product p
        WHERE p.tenant_id = v_tid
    )
    UPDATE master.product p
       SET commodity_category_id = rp.commodity_category_id,
           updated_at = now(),
           updated_by = v_su
      FROM resolved_product rp
     WHERE p.id = rp.id
       AND p.tenant_id = v_tid
       AND p.commodity_category_id IS NULL
       AND rp.commodity_category_id IS NOT NULL;

    WITH resolved_item AS (
        SELECT
            i.id,
            COALESCE(i.commodity_category_id, p.commodity_category_id) AS commodity_category_id
        FROM master.item i
        LEFT JOIN master.product p
          ON p.tenant_id = i.tenant_id AND p.id = i.product_id
        WHERE i.tenant_id = v_tid
    )
    UPDATE master.item i
       SET commodity_category_id = ri.commodity_category_id,
           updated_at = now(),
           updated_by = v_su
      FROM resolved_item ri
     WHERE i.id = ri.id
       AND i.tenant_id = v_tid
       AND i.commodity_category_id IS NULL
       AND ri.commodity_category_id IS NOT NULL;

    -- Stage E: sales posture for commodity categories currently used by products.
    WITH product_categories AS (
        SELECT DISTINCT ON (p.tenant_id, p.commodity_category_id)
            p.tenant_id,
            p.commodity_category_id,
            p.id AS product_id
        FROM master.product p
        WHERE p.tenant_id = v_tid
          AND p.commodity_category_id IS NOT NULL
        ORDER BY p.tenant_id, p.commodity_category_id, p.updated_at DESC NULLS LAST, p.created_at DESC
    )
    UPDATE master.commodity_category cc
       SET sell_allowed = true,
           sales_revenue_recognition_method = COALESCE(cc.sales_revenue_recognition_method, 'POINT_IN_TIME'),
           metadata = cc.metadata || jsonb_build_object('_commodity_sales', jsonb_build_object(
               'pack', v_pack, 'version', v_version, 'source_table', 'master.product',
               'source_id', pc.product_id, 'seeded_at', now()::text
           )),
           updated_at = now(),
           updated_by = v_su
      FROM product_categories pc
     WHERE cc.tenant_id = pc.tenant_id
       AND cc.id = pc.commodity_category_id;

    -- Stage F: copy commodity classifications to commodity_category ownership.
    INSERT INTO master.commodity_classification (
        tenant_id, owner_type, owner_id, classification_type, domain_code, code_id,
        mapping_type, confidence, provenance, is_primary, description,
        metadata, status, created_by
    )
    SELECT
        src.tenant_id,
        'commodity_category',
        cc.id,
        src.classification_type,
        src.domain_code,
        src.code_id,
        src.mapping_type,
        src.confidence,
        src.provenance,
        src.is_primary,
        src.description,
        COALESCE(src.metadata, '{}'::jsonb)
            || jsonb_build_object('_commodity_model', jsonb_build_object(
                'pack', v_pack, 'version', v_version, 'source_owner_type', src.owner_type,
                'source_owner_id', src.owner_id, 'seeded_at', now()::text
            )),
        src.status,
        v_su
    FROM master.commodity_classification src
    JOIN LATERAL (
        SELECT sc.code
        FROM master.spend_category sc
        WHERE src.owner_type = 'spend_category'
          AND sc.tenant_id = src.tenant_id
          AND sc.id = src.owner_id
    ) source_category ON true
    JOIN master.commodity_category cc
      ON cc.tenant_id = src.tenant_id AND cc.code = source_category.code
    WHERE src.tenant_id = v_tid
      AND src.owner_type = 'spend_category'
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET
        mapping_type = EXCLUDED.mapping_type,
        confidence   = EXCLUDED.confidence,
        provenance   = EXCLUDED.provenance,
        is_primary   = EXCLUDED.is_primary,
        description  = EXCLUDED.description,
        metadata     = master.commodity_classification.metadata
                       || jsonb_build_object('_commodity_model', EXCLUDED.metadata -> '_commodity_model'),
        status       = EXCLUDED.status,
        updated_at   = now(),
        updated_by   = v_su;

    -- Stage G: tenant default spend policies from spend_category.default_intent_id.
    WITH desired AS (
        SELECT
            cc.tenant_id,
            cc.id AS commodity_category_id,
            sc.default_intent_id AS business_intent_id,
            v_effective_from AS effective_from
        FROM master.spend_category sc
        JOIN master.commodity_category cc
          ON cc.tenant_id = sc.tenant_id AND cc.code = sc.code
        JOIN master.business_intent bi
          ON bi.tenant_id = sc.tenant_id AND bi.id = sc.default_intent_id
        WHERE sc.tenant_id = v_tid
          AND sc.default_intent_id IS NOT NULL
    ),
    updated AS (
        UPDATE control.commodity_category_buy_policy p
           SET business_intent_id         = d.business_intent_id,
               mapping_mode               = 'ALLOW',
               is_default                 = true,
               is_selectable              = true,
               sort_order                 = 0,
               effective_from             = d.effective_from,
               effective_to               = NULL,
               metadata                   = p.metadata || jsonb_build_object('_commodity_model', jsonb_build_object(
                   'pack', v_pack, 'version', v_version, 'source_table', 'master.spend_category',
                   'seeded_at', now()::text
               )),
               status                     = 'active',
               updated_at                 = now(),
               updated_by                 = v_su
          FROM desired d
         WHERE p.tenant_id = d.tenant_id
           AND p.commodity_category_id = d.commodity_category_id
           AND p.scope_type = 'TENANT'
           AND p.is_default = true
           AND p.is_active = true
        RETURNING p.tenant_id, p.commodity_category_id
    )
    INSERT INTO control.commodity_category_buy_policy (
        tenant_id, commodity_category_id, business_intent_id,
        scope_type, scope_id, mapping_mode, is_default, is_selectable, sort_order,
        effective_from, metadata, status, created_by
    )
    SELECT
        d.tenant_id,
        d.commodity_category_id,
        d.business_intent_id,
        'TENANT',
        NULL,
        'ALLOW',
        true,
        true,
        0,
        d.effective_from,
        jsonb_build_object('_commodity_model', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'source_table', 'master.spend_category',
            'seeded_at', now()::text
        )),
        'active',
        v_su
    FROM desired d
    WHERE NOT EXISTS (
        SELECT 1 FROM updated u
        WHERE u.tenant_id = d.tenant_id AND u.commodity_category_id = d.commodity_category_id
    );

    -- Stage H: selectable tenant policy intents from conditional override rules.
    WITH desired AS (
        SELECT DISTINCT
            cc.tenant_id,
            cc.id AS commodity_category_id,
            cir.resolved_intent_id AS business_intent_id,
            GREATEST(0, LEAST(cir.priority, 32767))::smallint AS sort_order,
            COALESCE(cir.effective_from, v_effective_from) AS effective_from,
            cir.effective_to
        FROM control.commodity_classification_to_intent_rule cir
        JOIN master.commodity_category cc
          ON cc.tenant_id = cir.tenant_id AND cc.id = cir.classification_id
        LEFT JOIN master.spend_category sc
          ON sc.tenant_id = cc.tenant_id AND sc.code = cc.code
        WHERE cir.tenant_id = v_tid
          AND cir.classification_source = 'COMMODITY_CATEGORY'
          AND cir.resolved_intent_id IS NOT NULL
          AND cir.resolved_intent_id IS DISTINCT FROM sc.default_intent_id
          AND cir.status = 'active'
    ),
    updated AS (
        UPDATE control.commodity_category_buy_policy p
           SET mapping_mode   = 'ALLOW',
               is_selectable  = true,
               sort_order     = d.sort_order,
               effective_to   = d.effective_to,
               metadata       = p.metadata || jsonb_build_object('_commodity_model', jsonb_build_object(
                   'pack', v_pack, 'version', v_version, 'source_table', 'control.commodity_classification_to_intent_rule',
                   'seeded_at', now()::text
               )),
               status         = 'active',
               updated_at     = now(),
               updated_by     = v_su
          FROM desired d
         WHERE p.tenant_id = d.tenant_id
           AND p.commodity_category_id = d.commodity_category_id
           AND p.business_intent_id = d.business_intent_id
           AND p.scope_type = 'TENANT'
           AND p.scope_id IS NULL
           AND p.is_default = false
           AND p.effective_from = d.effective_from
        RETURNING p.tenant_id, p.commodity_category_id, p.business_intent_id, p.effective_from
    )
    INSERT INTO control.commodity_category_buy_policy (
        tenant_id, commodity_category_id, business_intent_id,
        scope_type, scope_id, mapping_mode, is_default, is_selectable, sort_order,
        effective_from, effective_to, metadata, status, created_by
    )
    SELECT
        d.tenant_id,
        d.commodity_category_id,
        d.business_intent_id,
        'TENANT',
        NULL,
        'ALLOW',
        false,
        true,
        d.sort_order,
        d.effective_from,
        d.effective_to,
        jsonb_build_object('_commodity_model', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'source_table', 'control.commodity_classification_to_intent_rule',
            'seeded_at', now()::text
        )),
        'active',
        v_su
    FROM desired d
    WHERE NOT EXISTS (
        SELECT 1 FROM updated u
        WHERE u.tenant_id = d.tenant_id
          AND u.commodity_category_id = d.commodity_category_id
          AND u.business_intent_id = d.business_intent_id
          AND u.effective_from = d.effective_from
    );

    -- Stage J: tenant inventory policies from commodity category inventory posture.
    WITH desired AS (
        SELECT
            cc.tenant_id,
            cc.id AS commodity_category_id,
            CASE
                WHEN cc.inventory_allowed = false THEN 'blocked'
                WHEN cc.is_stockable = true THEN 'stocked'
                ELSE 'non_stock'
            END AS stocking_status,
            cc.default_valuation_method AS valuation_method,
            cc.is_lot_tracking_required AS override_lot_tracking_required,
            cc.is_serial_tracking_required AS override_serial_tracking_required,
            v_effective_from AS effective_from
        FROM master.commodity_category cc
        WHERE cc.tenant_id = v_tid
          AND cc.is_active = true
          AND cc.inventory_allowed = true
    ),
    updated AS (
        UPDATE control.commodity_category_inventory_policy p
           SET mapping_mode                      = 'ALLOW',
               stocking_status                   = d.stocking_status,
               valuation_method                  = d.valuation_method,
               override_lot_tracking_required    = d.override_lot_tracking_required,
               override_serial_tracking_required = d.override_serial_tracking_required,
               metadata                          = p.metadata || jsonb_build_object('_commodity_model', jsonb_build_object(
                   'pack', v_pack, 'version', v_version, 'source_table', 'master.commodity_category',
                   'seeded_at', now()::text
               )),
               status                            = 'active',
               updated_at                        = now(),
               updated_by                        = v_su
          FROM desired d
         WHERE p.tenant_id = d.tenant_id
           AND p.commodity_category_id = d.commodity_category_id
           AND p.scope_type = 'TENANT'
           AND p.scope_id IS NULL
           AND p.effective_from = d.effective_from
        RETURNING p.tenant_id, p.commodity_category_id, p.effective_from
    )
    INSERT INTO control.commodity_category_inventory_policy (
        tenant_id, commodity_category_id, scope_type, scope_id,
        mapping_mode, stocking_status, valuation_method,
        override_lot_tracking_required, override_serial_tracking_required,
        effective_from, metadata, status, created_by
    )
    SELECT
        d.tenant_id,
        d.commodity_category_id,
        'TENANT',
        NULL,
        'ALLOW',
        d.stocking_status,
        d.valuation_method,
        d.override_lot_tracking_required,
        d.override_serial_tracking_required,
        d.effective_from,
        jsonb_build_object('_commodity_model', jsonb_build_object(
            'pack', v_pack, 'version', v_version, 'source_table', 'master.commodity_category',
            'seeded_at', now()::text
        )),
        'active',
        v_su
    FROM desired d
    WHERE NOT EXISTS (
        SELECT 1 FROM updated u
        WHERE u.tenant_id = d.tenant_id
          AND u.commodity_category_id = d.commodity_category_id
          AND u.effective_from = d.effective_from
    );

    IF EXISTS (
        SELECT 1
        FROM master.product p
        WHERE p.tenant_id = v_tid
          AND p.commodity_category_id IS NULL
    ) THEN
        RAISE WARNING '[028_commodity_model] some products could not be backfilled to commodity_category_id';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM master.item i
        WHERE i.tenant_id = v_tid
          AND i.commodity_category_id IS NULL
          AND i.product_id IS NOT NULL
    ) THEN
        RAISE WARNING '[028_commodity_model] some items could not be backfilled to commodity_category_id';
    END IF;

    RAISE NOTICE '[028_commodity_model] Loaded commodity categories %, spend policies %, inventory policies %, commodity classifications %',
        (SELECT count(*) FROM master.commodity_category WHERE tenant_id = v_tid),
        (SELECT count(*) FROM control.commodity_category_buy_policy WHERE tenant_id = v_tid),
        (SELECT count(*) FROM control.commodity_category_inventory_policy WHERE tenant_id = v_tid),
        (SELECT count(*) FROM master.commodity_classification WHERE tenant_id = v_tid AND owner_type = 'commodity_category');
END $seed$;
