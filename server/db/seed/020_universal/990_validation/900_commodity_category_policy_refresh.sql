-- ============================================================================
-- FINAL TENANT REFRESH - COMMODITY CATEGORY POLICY MODEL
-- ============================================================================
-- File:     020_universal/990_validation/900_commodity_category_policy_refresh.sql
-- Schema:   master/control
-- Purpose:  Final tenant-scoped reconciliation after universal, industry,
--           module, tenant catalog, product, and item seeds have run.
--           - Refreshes spend_category-driven commodity categories in
--             master.commodity_category.
--           - Migrates commodity_classification_to_intent_rule from SPEND_CATEGORY to
--             COMMODITY_CATEGORY and removes the legacy rows.
--           - Refreshes tenant-level commodity category spend, sales, and
--             inventory policies with domain-level business intent defaults.
-- Idempotent: Yes
-- ============================================================================

DO $seed$
DECLARE
    v_tid uuid;
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_pack text := '900_commodity_category_policy_refresh';
    v_version text := '1.0.0';
    v_effective_from date := DATE '2026-05-16';
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[900_commodity_refresh] app.seed_tenant_id not set';
    END IF;

    -- ---------------------------------------------------------------------
    -- 1. Commodity category taxonomy from spend_category roots/children.
    -- ---------------------------------------------------------------------
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
                'pack', v_pack, 'version', v_version,
                'source_table', 'master.spend_category',
                'source_id', sc.id, 'seeded_at', now()::text
            )),
        sc.status,
        v_su
    FROM master.spend_category sc
    WHERE sc.tenant_id = v_tid
      AND sc.parent_id IS NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        parent_id = NULL,
        root_category_id = master.commodity_category.id,
        level_no = EXCLUDED.level_no,
        sort_order = EXCLUDED.sort_order,
        metadata = master.commodity_category.metadata
            || jsonb_build_object('_commodity_model', EXCLUDED.metadata -> '_commodity_model'),
        status = EXCLUDED.status,
        updated_at = now(),
        updated_by = v_su;

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
                'pack', v_pack, 'version', v_version,
                'source_table', 'master.spend_category',
                'source_id', sc.id, 'seeded_at', now()::text
            )),
        sc.status,
        v_su
    FROM master.spend_category sc
    JOIN master.spend_category parent_sc
      ON parent_sc.tenant_id = sc.tenant_id
     AND parent_sc.id = sc.parent_id
    JOIN master.spend_category root_sc
      ON root_sc.tenant_id = sc.tenant_id
     AND root_sc.id = sc.root_category_id
    JOIN master.commodity_category parent_cc
      ON parent_cc.tenant_id = sc.tenant_id
     AND parent_cc.code = parent_sc.code
    JOIN master.commodity_category root_cc
      ON root_cc.tenant_id = sc.tenant_id
     AND root_cc.code = root_sc.code
    WHERE sc.tenant_id = v_tid
      AND sc.parent_id IS NOT NULL
    ON CONFLICT (tenant_id, code) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        parent_id = EXCLUDED.parent_id,
        root_category_id = EXCLUDED.root_category_id,
        level_no = EXCLUDED.level_no,
        sort_order = EXCLUDED.sort_order,
        metadata = master.commodity_category.metadata
            || jsonb_build_object('_commodity_model', EXCLUDED.metadata -> '_commodity_model'),
        status = EXCLUDED.status,
        updated_at = now(),
        updated_by = v_su;

    -- ---------------------------------------------------------------------
    -- 3. Capability flags and base posture.
    -- ---------------------------------------------------------------------
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
               'pack', v_pack, 'version', v_version,
               'source_table', 'master.spend_category',
               'source_id', sc.id, 'seeded_at', now()::text
           )),
           updated_at = now(),
           updated_by = v_su
      FROM master.spend_category sc
     WHERE sc.tenant_id = v_tid
       AND cc.tenant_id = sc.tenant_id
       AND cc.code = sc.code;

    -- ---------------------------------------------------------------------
    -- 4. Product/item commodity backfill and sales posture from real catalog.
    -- ---------------------------------------------------------------------
    WITH resolved_product AS (
        SELECT
            p.id,
            p.tenant_id,
            p.commodity_category_id AS commodity_category_id
        FROM master.product p
        WHERE p.tenant_id = v_tid
    )
    UPDATE master.product p
       SET commodity_category_id = rp.commodity_category_id,
           updated_at = now(),
           updated_by = v_su
      FROM resolved_product rp
     WHERE p.tenant_id = rp.tenant_id
       AND p.id = rp.id
       AND rp.commodity_category_id IS NOT NULL
       AND p.commodity_category_id IS DISTINCT FROM rp.commodity_category_id;

    WITH resolved_item AS (
        SELECT
            i.id,
            i.tenant_id,
            COALESCE(i.commodity_category_id, p.commodity_category_id) AS commodity_category_id
        FROM master.item i
        LEFT JOIN master.product p
          ON p.tenant_id = i.tenant_id
         AND p.id = i.product_id
        WHERE i.tenant_id = v_tid
    )
    UPDATE master.item i
       SET commodity_category_id = ri.commodity_category_id,
           updated_at = now(),
           updated_by = v_su
      FROM resolved_item ri
     WHERE i.tenant_id = ri.tenant_id
       AND i.id = ri.id
       AND ri.commodity_category_id IS NOT NULL
       AND i.commodity_category_id IS DISTINCT FROM ri.commodity_category_id;

    WITH product_categories AS (
        SELECT DISTINCT p.tenant_id, p.commodity_category_id
        FROM master.product p
        WHERE p.tenant_id = v_tid
          AND p.commodity_category_id IS NOT NULL
          AND p.is_active = true
    )
    UPDATE master.commodity_category cc
       SET sell_allowed = true,
           sales_revenue_recognition_method = COALESCE(cc.sales_revenue_recognition_method, 'POINT_IN_TIME'),
           metadata = cc.metadata || jsonb_build_object('_commodity_sales', jsonb_build_object(
               'pack', v_pack, 'version', v_version,
               'source_table', 'master.product',
               'seeded_at', now()::text
           )),
           updated_at = now(),
           updated_by = v_su
      FROM product_categories pc
     WHERE cc.tenant_id = pc.tenant_id
       AND cc.id = pc.commodity_category_id;

    -- ---------------------------------------------------------------------
    -- 5. Commodity classification ownership: spend/item -> commodity_category.
    -- ---------------------------------------------------------------------
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
                'pack', v_pack, 'version', v_version,
                'source_owner_type', src.owner_type,
                'source_owner_id', src.owner_id,
                'seeded_at', now()::text
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
      ON cc.tenant_id = src.tenant_id
     AND cc.code = source_category.code
    WHERE src.tenant_id = v_tid
      AND src.owner_type = 'spend_category'
    ON CONFLICT (tenant_id, owner_type, owner_id, classification_type, domain_code, code_id)
    DO UPDATE SET
        mapping_type = EXCLUDED.mapping_type,
        confidence = EXCLUDED.confidence,
        provenance = EXCLUDED.provenance,
        is_primary = EXCLUDED.is_primary,
        description = EXCLUDED.description,
        metadata = master.commodity_classification.metadata
            || jsonb_build_object('_commodity_model', EXCLUDED.metadata -> '_commodity_model'),
        status = EXCLUDED.status,
        updated_at = now(),
        updated_by = v_su;

    -- ---------------------------------------------------------------------
    -- 6. commodity_classification_to_intent_rule migration. Legacy SPEND_CATEGORY rows
    --    are converted to COMMODITY_CATEGORY and then removed.
    -- ---------------------------------------------------------------------
    DELETE FROM control.commodity_classification_to_intent_rule target
     WHERE target.tenant_id = v_tid
       AND target.classification_source = 'COMMODITY_CATEGORY'
       AND target.metadata->'_commodity_model'->>'migrated_from_source' = 'SPEND_CATEGORY'
       AND EXISTS (
            SELECT 1
            FROM control.commodity_classification_to_intent_rule legacy
            JOIN master.spend_category legacy_sc
              ON legacy_sc.tenant_id = legacy.tenant_id
             AND legacy_sc.id = legacy.classification_id
            JOIN master.commodity_category legacy_cc
              ON legacy_cc.tenant_id = legacy_sc.tenant_id
             AND legacy_cc.code = legacy_sc.code
            WHERE legacy.tenant_id = target.tenant_id
              AND legacy.classification_source = 'SPEND_CATEGORY'
              AND legacy_cc.id = target.classification_id
              AND legacy.condition_type = target.condition_type
              AND legacy.resolved_intent_id = target.resolved_intent_id
       );

    INSERT INTO control.commodity_classification_to_intent_rule (
        tenant_id, classification_source, classification_id, direction,
        condition_type, condition_config, applies_to_flows,
        resolved_intent_id, resolved_domain, explanation_template,
        confidence, priority, effective_from, effective_to,
        metadata, status, created_by
    )
    SELECT
        cir.tenant_id,
        'COMMODITY_CATEGORY',
        cc.id,
        cir.direction,
        cir.condition_type,
        cir.condition_config,
        cir.applies_to_flows,
        cir.resolved_intent_id,
        cir.resolved_domain,
        cir.explanation_template,
        cir.confidence,
        cir.priority,
        cir.effective_from,
        cir.effective_to,
        COALESCE(cir.metadata, '{}'::jsonb)
            || jsonb_build_object('_commodity_model', jsonb_build_object(
                'pack', v_pack, 'version', v_version,
                'migrated_from_source', 'SPEND_CATEGORY',
                'source_rule_id', cir.id,
                'source_classification_id', cir.classification_id,
                'seeded_at', now()::text
            )),
        cir.status,
        COALESCE(cir.created_by, v_su)
    FROM control.commodity_classification_to_intent_rule cir
    JOIN master.spend_category sc
      ON sc.tenant_id = cir.tenant_id
     AND sc.id = cir.classification_id
    JOIN master.commodity_category cc
      ON cc.tenant_id = sc.tenant_id
     AND cc.code = sc.code
    WHERE cir.tenant_id = v_tid
      AND cir.classification_source = 'SPEND_CATEGORY';

    DELETE FROM control.commodity_classification_to_intent_rule
     WHERE tenant_id = v_tid
       AND classification_source = 'SPEND_CATEGORY';

    -- ---------------------------------------------------------------------
    -- 7. Tenant-level buy policy rows from category defaults and active
    --    conditional override rules.
    -- ---------------------------------------------------------------------
    CREATE TEMP TABLE tmp_cc_spend_desired (
        tenant_id uuid NOT NULL,
        commodity_category_id uuid NOT NULL,
        business_intent_id uuid NOT NULL,
        is_default boolean NOT NULL,
        is_selectable boolean NOT NULL,
        sort_order smallint NOT NULL,
        effective_from date NOT NULL,
        effective_to date,
        source_table text NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO tmp_cc_spend_desired (
        tenant_id, commodity_category_id, business_intent_id,
        is_default, is_selectable, sort_order,
        effective_from, effective_to, source_table
    )
    SELECT
        cc.tenant_id,
        cc.id,
        sc.default_intent_id,
        true,
        true,
        0,
        v_effective_from,
        NULL,
        'master.spend_category'
    FROM master.commodity_category cc
    JOIN master.spend_category sc
      ON sc.tenant_id = cc.tenant_id
     AND sc.code = cc.code
    JOIN master.business_intent bi
      ON bi.tenant_id = sc.tenant_id
     AND bi.id = sc.default_intent_id
    WHERE cc.tenant_id = v_tid
      AND cc.buy_allowed = true
      AND sc.default_intent_id IS NOT NULL
      AND cc.is_active = true;

    INSERT INTO tmp_cc_spend_desired (
        tenant_id, commodity_category_id, business_intent_id,
        is_default, is_selectable, sort_order,
        effective_from, effective_to, source_table
    )
    SELECT DISTINCT ON (cc.tenant_id, cc.id, cir.resolved_intent_id, cir.effective_from)
        cc.tenant_id,
        cc.id,
        cir.resolved_intent_id,
        false,
        true,
        GREATEST(0, LEAST(cir.priority, 32767))::smallint,
        COALESCE(cir.effective_from, v_effective_from),
        cir.effective_to,
        'control.commodity_classification_to_intent_rule'
    FROM control.commodity_classification_to_intent_rule cir
    JOIN master.commodity_category cc
      ON cc.tenant_id = cir.tenant_id
     AND cc.id = cir.classification_id
    JOIN master.business_intent bi
      ON bi.tenant_id = cir.tenant_id
     AND bi.id = cir.resolved_intent_id
    LEFT JOIN tmp_cc_spend_desired defaults
      ON defaults.tenant_id = cc.tenant_id
     AND defaults.commodity_category_id = cc.id
     AND defaults.business_intent_id = cir.resolved_intent_id
     AND defaults.is_default = true
    WHERE cir.tenant_id = v_tid
      AND cir.classification_source = 'COMMODITY_CATEGORY'
      AND cir.resolved_intent_id IS NOT NULL
      AND cir.status = 'active'
      AND cc.buy_allowed = true
      AND defaults.business_intent_id IS NULL
    ORDER BY cc.tenant_id, cc.id, cir.resolved_intent_id, cir.effective_from, cir.priority;

    -- Domain-level safety net: every buy-enabled commodity category must have
    -- one tenant default even when legacy spend_category defaults/rules are absent.
    INSERT INTO tmp_cc_spend_desired (
        tenant_id, commodity_category_id, business_intent_id,
        is_default, is_selectable, sort_order,
        effective_from, effective_to, source_table
    )
    SELECT
        cc.tenant_id,
        cc.id,
        bi.id,
        true,
        true,
        0,
        v_effective_from,
        NULL,
        'master.commodity_category:fallback'
    FROM master.commodity_category cc
    CROSS JOIN LATERAL (
        SELECT CASE
            WHEN cc.code LIKE 'SC-CAPEQUIP%' THEN ARRAY['BI-CAPEX','BI-OPEX']::text[]
            WHEN cc.inventory_allowed
              OR cc.code ~ '^(SC-RAW|SC-COMP|SC-PKG|SC-CONSUM|SC-MRO|SC-PRODSVC|SC-CONTRACT|SC-FREIGHT|SC-WHSE|SC-QC|SC-TRADE|SC-CONST)'
                THEN ARRAY['BI-COGS','BI-OPEX']::text[]
            ELSE ARRAY['BI-OPEX']::text[]
        END AS codes
    ) pref
    JOIN LATERAL (
        SELECT bi.*
        FROM master.business_intent bi
        WHERE bi.tenant_id = cc.tenant_id
          AND bi.code = ANY(pref.codes)
          AND bi.is_active = true
        ORDER BY array_position(pref.codes, bi.code)
        LIMIT 1
    ) bi ON true
    WHERE cc.tenant_id = v_tid
      AND cc.buy_allowed = true
      AND cc.is_active = true
      AND NOT EXISTS (
          SELECT 1
          FROM tmp_cc_spend_desired d
          WHERE d.tenant_id = cc.tenant_id
            AND d.commodity_category_id = cc.id
            AND d.is_default = true
      );

    UPDATE control.commodity_category_buy_policy p
       SET business_intent_id = d.business_intent_id,
           mapping_mode = 'ALLOW',
           is_selectable = d.is_selectable,
           sort_order = d.sort_order,
           effective_from = d.effective_from,
           effective_to = d.effective_to,
           metadata = p.metadata || jsonb_build_object('_commodity_model', jsonb_build_object(
               'pack', v_pack, 'version', v_version,
               'source_table', d.source_table,
               'seeded_at', now()::text
           )),
           status = 'active',
           updated_at = now(),
           updated_by = v_su
      FROM tmp_cc_spend_desired d
     WHERE d.is_default = true
       AND p.tenant_id = d.tenant_id
       AND p.commodity_category_id = d.commodity_category_id
       AND p.scope_type = 'TENANT'
       AND p.scope_id IS NULL
       AND p.is_default = true;

    UPDATE control.commodity_category_buy_policy p
       SET mapping_mode = 'ALLOW',
           is_selectable = d.is_selectable,
           sort_order = d.sort_order,
           effective_to = d.effective_to,
           metadata = p.metadata || jsonb_build_object('_commodity_model', jsonb_build_object(
               'pack', v_pack, 'version', v_version,
               'source_table', d.source_table,
               'seeded_at', now()::text
           )),
           status = 'active',
           updated_at = now(),
           updated_by = v_su
      FROM tmp_cc_spend_desired d
     WHERE d.is_default = false
       AND p.tenant_id = d.tenant_id
       AND p.commodity_category_id = d.commodity_category_id
       AND p.business_intent_id = d.business_intent_id
       AND p.scope_type = 'TENANT'
       AND p.scope_id IS NULL
       AND p.is_default = false
       AND p.effective_from = d.effective_from;

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
        d.is_default,
        d.is_selectable,
        d.sort_order,
        d.effective_from,
        d.effective_to,
        jsonb_build_object('_commodity_model', jsonb_build_object(
            'pack', v_pack, 'version', v_version,
            'source_table', d.source_table,
            'seeded_at', now()::text
        )),
        'active',
        v_su
    FROM tmp_cc_spend_desired d
    WHERE NOT EXISTS (
        SELECT 1
        FROM control.commodity_category_buy_policy p
        WHERE p.tenant_id = d.tenant_id
          AND p.commodity_category_id = d.commodity_category_id
          AND p.scope_type = 'TENANT'
          AND p.scope_id IS NULL
          AND (
              (d.is_default = true AND p.is_default = true)
              OR (
                  d.is_default = false
                  AND p.is_default = false
                  AND p.business_intent_id = d.business_intent_id
                  AND p.effective_from = d.effective_from
              )
          )
    );

    -- ---------------------------------------------------------------------
    -- 8. Tenant-level sell policy rows. Business intent stays domain-level.
    -- ---------------------------------------------------------------------
    CREATE TEMP TABLE tmp_cc_sales_desired (
        tenant_id uuid NOT NULL,
        commodity_category_id uuid NOT NULL,
        business_intent_id uuid NOT NULL,
        is_default boolean NOT NULL,
        is_selectable boolean NOT NULL,
        sort_order smallint NOT NULL,
        default_revenue_gl_account_id uuid,
        default_deferred_revenue_gl_account_id uuid,
        default_unbilled_ar_gl_account_id uuid,
        revenue_recognition_method text,
        variable_consideration text,
        standalone_selling_price_method text,
        effective_from date NOT NULL,
        source_table text NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO tmp_cc_sales_desired (
        tenant_id, commodity_category_id, business_intent_id,
        is_default, is_selectable, sort_order,
        default_revenue_gl_account_id,
        default_deferred_revenue_gl_account_id,
        default_unbilled_ar_gl_account_id,
        revenue_recognition_method,
        variable_consideration,
        standalone_selling_price_method,
        effective_from,
        source_table
    )
    SELECT
        cc.tenant_id,
        cc.id,
        bi.id,
        true,
        true,
        0,
        (
            SELECT a.id
            FROM master.gl_account a
            WHERE a.tenant_id = cc.tenant_id
              AND a.code = CASE WHEN cc.inventory_allowed OR cc.is_stockable
                                THEN 'IFRS-R-SALES-GOODS'
                                ELSE 'IFRS-R-SALES-SVC' END
              AND a.node_type = 'posting'
              AND a.is_active = true
            ORDER BY a.created_at
            LIMIT 1
        ),
        (
            SELECT a.id
            FROM master.gl_account a
            WHERE a.tenant_id = cc.tenant_id
              AND a.code = 'IFRS-L-DEFREV-SVC'
              AND a.node_type = 'posting'
              AND a.is_active = true
            ORDER BY a.created_at
            LIMIT 1
        ),
        (
            SELECT a.id
            FROM master.gl_account a
            WHERE a.tenant_id = cc.tenant_id
              AND a.code = 'IFRS-A-AR-UNBILLED'
              AND a.node_type = 'posting'
              AND a.is_active = true
            ORDER BY a.created_at
            LIMIT 1
        ),
        cc.sales_revenue_recognition_method,
        cc.sales_variable_consideration,
        cc.sales_standalone_selling_price_method,
        v_effective_from,
        'master.commodity_category'
    FROM master.commodity_category cc
    JOIN master.business_intent bi
      ON bi.tenant_id = cc.tenant_id
     AND bi.code = 'BI-REV'
    WHERE cc.tenant_id = v_tid
      AND cc.sell_allowed = true
      AND cc.is_active = true;

    INSERT INTO tmp_cc_sales_desired (
        tenant_id, commodity_category_id, business_intent_id,
        is_default, is_selectable, sort_order,
        default_revenue_gl_account_id,
        default_deferred_revenue_gl_account_id,
        default_unbilled_ar_gl_account_id,
        revenue_recognition_method,
        variable_consideration,
        standalone_selling_price_method,
        effective_from,
        source_table
    )
    SELECT
        d.tenant_id,
        d.commodity_category_id,
        bi.id,
        false,
        true,
        10,
        d.default_revenue_gl_account_id,
        d.default_deferred_revenue_gl_account_id,
        d.default_unbilled_ar_gl_account_id,
        d.revenue_recognition_method,
        d.variable_consideration,
        d.standalone_selling_price_method,
        d.effective_from,
        d.source_table
    FROM tmp_cc_sales_desired d
    JOIN master.business_intent bi
      ON bi.tenant_id = d.tenant_id
     AND bi.code = 'BI-DEFREV'
    WHERE d.is_default = true;

    UPDATE control.commodity_category_sell_policy p
       SET business_intent_id = d.business_intent_id,
           mapping_mode = 'ALLOW',
           is_selectable = d.is_selectable,
           sort_order = d.sort_order,
           default_revenue_gl_account_id = d.default_revenue_gl_account_id,
           default_deferred_revenue_gl_account_id = d.default_deferred_revenue_gl_account_id,
           default_unbilled_ar_gl_account_id = d.default_unbilled_ar_gl_account_id,
           revenue_recognition_method = d.revenue_recognition_method,
           variable_consideration = d.variable_consideration,
           standalone_selling_price_method = d.standalone_selling_price_method,
           effective_from = d.effective_from,
           effective_to = NULL,
           metadata = p.metadata || jsonb_build_object('_commodity_model', jsonb_build_object(
               'pack', v_pack, 'version', v_version,
               'source_table', d.source_table,
               'seeded_at', now()::text
           )),
           status = 'active',
           updated_at = now(),
           updated_by = v_su
      FROM tmp_cc_sales_desired d
     WHERE d.is_default = true
       AND p.tenant_id = d.tenant_id
       AND p.commodity_category_id = d.commodity_category_id
       AND p.scope_type = 'TENANT'
       AND p.scope_id IS NULL
       AND p.is_default = true;

    UPDATE control.commodity_category_sell_policy p
       SET mapping_mode = 'ALLOW',
           is_selectable = d.is_selectable,
           sort_order = d.sort_order,
           default_revenue_gl_account_id = d.default_revenue_gl_account_id,
           default_deferred_revenue_gl_account_id = d.default_deferred_revenue_gl_account_id,
           default_unbilled_ar_gl_account_id = d.default_unbilled_ar_gl_account_id,
           revenue_recognition_method = d.revenue_recognition_method,
           variable_consideration = d.variable_consideration,
           standalone_selling_price_method = d.standalone_selling_price_method,
           metadata = p.metadata || jsonb_build_object('_commodity_model', jsonb_build_object(
               'pack', v_pack, 'version', v_version,
               'source_table', d.source_table,
               'seeded_at', now()::text
           )),
           status = 'active',
           updated_at = now(),
           updated_by = v_su
      FROM tmp_cc_sales_desired d
     WHERE d.is_default = false
       AND p.tenant_id = d.tenant_id
       AND p.commodity_category_id = d.commodity_category_id
       AND p.business_intent_id = d.business_intent_id
       AND p.scope_type = 'TENANT'
       AND p.scope_id IS NULL
       AND p.is_default = false
       AND p.effective_from = d.effective_from;

    INSERT INTO control.commodity_category_sell_policy (
        tenant_id, commodity_category_id, business_intent_id,
        scope_type, scope_id, mapping_mode, is_default, is_selectable, sort_order,
        default_revenue_gl_account_id,
        default_deferred_revenue_gl_account_id,
        default_unbilled_ar_gl_account_id,
        revenue_recognition_method,
        variable_consideration,
        standalone_selling_price_method,
        effective_from, metadata, status, created_by
    )
    SELECT
        d.tenant_id,
        d.commodity_category_id,
        d.business_intent_id,
        'TENANT',
        NULL,
        'ALLOW',
        d.is_default,
        d.is_selectable,
        d.sort_order,
        d.default_revenue_gl_account_id,
        d.default_deferred_revenue_gl_account_id,
        d.default_unbilled_ar_gl_account_id,
        d.revenue_recognition_method,
        d.variable_consideration,
        d.standalone_selling_price_method,
        d.effective_from,
        jsonb_build_object('_commodity_model', jsonb_build_object(
            'pack', v_pack, 'version', v_version,
            'source_table', d.source_table,
            'seeded_at', now()::text
        )),
        'active',
        v_su
    FROM tmp_cc_sales_desired d
    WHERE NOT EXISTS (
        SELECT 1
        FROM control.commodity_category_sell_policy p
        WHERE p.tenant_id = d.tenant_id
          AND p.commodity_category_id = d.commodity_category_id
          AND p.scope_type = 'TENANT'
          AND p.scope_id IS NULL
          AND (
              (d.is_default = true AND p.is_default = true)
              OR (
                  d.is_default = false
                  AND p.is_default = false
                  AND p.business_intent_id = d.business_intent_id
                  AND p.effective_from = d.effective_from
              )
          )
    );

    -- ---------------------------------------------------------------------
    -- 9. Tenant-level inventory policy rows.
    -- ---------------------------------------------------------------------
    CREATE TEMP TABLE tmp_cc_inventory_desired (
        tenant_id uuid NOT NULL,
        commodity_category_id uuid NOT NULL,
        stocking_status text NOT NULL,
        valuation_method text,
        default_inventory_gl_account_id uuid,
        default_wip_gl_account_id uuid,
        default_cogs_gl_account_id uuid,
        default_price_variance_gl_account_id uuid,
        override_lot_tracking_required boolean,
        override_serial_tracking_required boolean,
        effective_from date NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO tmp_cc_inventory_desired (
        tenant_id, commodity_category_id, stocking_status, valuation_method,
        default_inventory_gl_account_id, default_wip_gl_account_id,
        default_cogs_gl_account_id, default_price_variance_gl_account_id,
        override_lot_tracking_required, override_serial_tracking_required,
        effective_from
    )
    SELECT
        cc.tenant_id,
        cc.id,
        CASE
            WHEN cc.is_stockable THEN 'stocked'
            ELSE 'non_stock'
        END,
        cc.default_valuation_method,
        (
            SELECT a.id
            FROM master.gl_account a
            WHERE a.tenant_id = cc.tenant_id
              AND a.code = CASE
                  WHEN cc.is_consumable THEN 'IFRS-A-INV-CONSUM'
                  WHEN cc.is_stockable THEN 'IFRS-A-INV-TRADE'
                  ELSE 'IFRS-A-INV-RAW'
              END
              AND a.node_type = 'posting'
              AND a.is_active = true
            ORDER BY a.created_at
            LIMIT 1
        ),
        (
            SELECT a.id
            FROM master.gl_account a
            WHERE a.tenant_id = cc.tenant_id
              AND a.code = 'IFRS-A-INV-WIP'
              AND a.node_type = 'posting'
              AND a.is_active = true
            ORDER BY a.created_at
            LIMIT 1
        ),
        (
            SELECT a.id
            FROM master.gl_account a
            WHERE a.tenant_id = cc.tenant_id
              AND a.code = 'IFRS-E-COGS-MAT'
              AND a.node_type = 'posting'
              AND a.is_active = true
            ORDER BY a.created_at
            LIMIT 1
        ),
        (
            SELECT a.id
            FROM master.gl_account a
            WHERE a.tenant_id = cc.tenant_id
              AND a.code = 'IFRS-E-COGS-VARIANCE'
              AND a.node_type = 'posting'
              AND a.is_active = true
            ORDER BY a.created_at
            LIMIT 1
        ),
        cc.is_lot_tracking_required,
        cc.is_serial_tracking_required,
        v_effective_from
    FROM master.commodity_category cc
    WHERE cc.tenant_id = v_tid
      AND cc.inventory_allowed = true
      AND cc.is_active = true;

    UPDATE control.commodity_category_inventory_policy p
       SET mapping_mode = 'ALLOW',
           stocking_status = d.stocking_status,
           valuation_method = d.valuation_method,
           default_inventory_gl_account_id = d.default_inventory_gl_account_id,
           default_wip_gl_account_id = d.default_wip_gl_account_id,
           default_cogs_gl_account_id = d.default_cogs_gl_account_id,
           default_price_variance_gl_account_id = d.default_price_variance_gl_account_id,
           override_lot_tracking_required = d.override_lot_tracking_required,
           override_serial_tracking_required = d.override_serial_tracking_required,
           metadata = p.metadata || jsonb_build_object('_commodity_model', jsonb_build_object(
               'pack', v_pack, 'version', v_version,
               'source_table', 'master.commodity_category',
               'seeded_at', now()::text
           )),
           status = 'active',
           updated_at = now(),
           updated_by = v_su
      FROM tmp_cc_inventory_desired d
     WHERE p.tenant_id = d.tenant_id
       AND p.commodity_category_id = d.commodity_category_id
       AND p.scope_type = 'TENANT'
       AND p.scope_id IS NULL
       AND p.effective_from = d.effective_from;

    INSERT INTO control.commodity_category_inventory_policy (
        tenant_id, commodity_category_id, scope_type, scope_id,
        mapping_mode, stocking_status, valuation_method,
        default_inventory_gl_account_id, default_wip_gl_account_id,
        default_cogs_gl_account_id, default_price_variance_gl_account_id,
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
        d.default_inventory_gl_account_id,
        d.default_wip_gl_account_id,
        d.default_cogs_gl_account_id,
        d.default_price_variance_gl_account_id,
        d.override_lot_tracking_required,
        d.override_serial_tracking_required,
        d.effective_from,
        jsonb_build_object('_commodity_model', jsonb_build_object(
            'pack', v_pack, 'version', v_version,
            'source_table', 'master.commodity_category',
            'seeded_at', now()::text
        )),
        'active',
        v_su
    FROM tmp_cc_inventory_desired d
    WHERE NOT EXISTS (
        SELECT 1
        FROM control.commodity_category_inventory_policy p
        WHERE p.tenant_id = d.tenant_id
          AND p.commodity_category_id = d.commodity_category_id
          AND p.scope_type = 'TENANT'
          AND p.scope_id IS NULL
          AND p.effective_from = d.effective_from
    );

    -- ---------------------------------------------------------------------
    -- 10. Assertions: final tenant data should not leak legacy rule source.
    -- ---------------------------------------------------------------------
    IF EXISTS (
        SELECT 1
        FROM master.spend_category sc
        WHERE sc.tenant_id = v_tid
          AND NOT EXISTS (
              SELECT 1
              FROM master.commodity_category cc
              WHERE cc.tenant_id = sc.tenant_id
                AND cc.code = sc.code
          )
    ) THEN
        RAISE EXCEPTION '[900_commodity_refresh] spend_category rows missing commodity_category counterparts';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM control.commodity_classification_to_intent_rule r
        WHERE r.tenant_id = v_tid
          AND r.classification_source = 'SPEND_CATEGORY'
    ) THEN
        RAISE EXCEPTION '[900_commodity_refresh] legacy SPEND_CATEGORY intent rules remain after migration';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM master.commodity_category cc
        WHERE cc.tenant_id = v_tid
          AND cc.buy_allowed = true
          AND cc.is_active = true
          AND NOT EXISTS (
              SELECT 1
              FROM control.commodity_category_buy_policy p
              WHERE p.tenant_id = cc.tenant_id
                AND p.commodity_category_id = cc.id
                AND p.scope_type = 'TENANT'
                AND p.is_default = true
                AND p.mapping_mode = 'ALLOW'
                AND p.is_active = true
          )
    ) THEN
        RAISE EXCEPTION '[900_commodity_refresh] buy-enabled commodity categories missing default buy policy';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM control.commodity_category_buy_policy p
        JOIN master.business_intent bi
          ON bi.tenant_id = p.tenant_id
         AND bi.id = p.business_intent_id
        WHERE p.tenant_id = v_tid
          AND p.is_active = true
          AND bi.code NOT IN ('BI-OPEX','BI-CAPEX','BI-COGS','BI-ADMIN','BI-REG','BI-TRANSFER','BI-REV','BI-DEFREV')
    ) THEN
        RAISE EXCEPTION '[900_commodity_refresh] buy policies reference non-domain business intents: %',
            (SELECT string_agg(DISTINCT bi.code, ', ' ORDER BY bi.code)
             FROM control.commodity_category_buy_policy p
             JOIN master.business_intent bi
               ON bi.tenant_id = p.tenant_id
              AND bi.id = p.business_intent_id
             WHERE p.tenant_id = v_tid
               AND p.is_active = true
               AND bi.code NOT IN ('BI-OPEX','BI-CAPEX','BI-COGS','BI-ADMIN','BI-REG','BI-TRANSFER','BI-REV','BI-DEFREV'));
    END IF;

    IF EXISTS (
        SELECT 1
        FROM master.commodity_category cc
        WHERE cc.tenant_id = v_tid
          AND cc.inventory_allowed = true
          AND cc.is_active = true
          AND NOT EXISTS (
              SELECT 1
              FROM control.commodity_category_inventory_policy p
              WHERE p.tenant_id = cc.tenant_id
                AND p.commodity_category_id = cc.id
                AND p.scope_type = 'TENANT'
                AND p.mapping_mode = 'ALLOW'
                AND p.is_active = true
          )
    ) THEN
        RAISE EXCEPTION '[900_commodity_refresh] inventory-enabled commodity categories missing inventory policy';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM master.commodity_category cc
        WHERE cc.tenant_id = v_tid
          AND cc.sell_allowed = true
          AND cc.is_active = true
          AND NOT EXISTS (
              SELECT 1
              FROM control.commodity_category_sell_policy p
              WHERE p.tenant_id = cc.tenant_id
                AND p.commodity_category_id = cc.id
                AND p.scope_type = 'TENANT'
                AND p.is_default = true
                AND p.mapping_mode = 'ALLOW'
                AND p.is_active = true
          )
    ) THEN
        RAISE EXCEPTION '[900_commodity_refresh] sell-enabled commodity categories missing default sell policy';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM control.commodity_category_sell_policy p
        JOIN master.business_intent bi
          ON bi.tenant_id = p.tenant_id
         AND bi.id = p.business_intent_id
        WHERE p.tenant_id = v_tid
          AND p.is_active = true
          AND bi.code NOT IN ('BI-OPEX','BI-CAPEX','BI-COGS','BI-ADMIN','BI-REG','BI-TRANSFER','BI-REV','BI-DEFREV')
    ) THEN
        RAISE EXCEPTION '[900_commodity_refresh] sell policies reference non-domain business intents: %',
            (SELECT string_agg(DISTINCT bi.code, ', ' ORDER BY bi.code)
             FROM control.commodity_category_sell_policy p
             JOIN master.business_intent bi
               ON bi.tenant_id = p.tenant_id
              AND bi.id = p.business_intent_id
             WHERE p.tenant_id = v_tid
               AND p.is_active = true
               AND bi.code NOT IN ('BI-OPEX','BI-CAPEX','BI-COGS','BI-ADMIN','BI-REG','BI-TRANSFER','BI-REV','BI-DEFREV'));
    END IF;

    RAISE NOTICE '[900_commodity_refresh] tenant %, categories %, rules %, spend policies %, sales policies %, inventory policies %',
        v_tid,
        (SELECT count(*) FROM master.commodity_category WHERE tenant_id = v_tid),
        (SELECT count(*) FROM control.commodity_classification_to_intent_rule WHERE tenant_id = v_tid AND classification_source = 'COMMODITY_CATEGORY'),
        (SELECT count(*) FROM control.commodity_category_buy_policy WHERE tenant_id = v_tid AND scope_type = 'TENANT'),
        (SELECT count(*) FROM control.commodity_category_sell_policy WHERE tenant_id = v_tid AND scope_type = 'TENANT'),
        (SELECT count(*) FROM control.commodity_category_inventory_policy WHERE tenant_id = v_tid AND scope_type = 'TENANT');
END $seed$;
