-- 035_version_fields/021_fields_products_enum_patches.sql
-- Backfills enum domains and checkbox UI types for product, item,
-- commodity_classification, and commodity_category fields.

DO $$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_ev_product uuid;
    v_ev_item uuid;
    v_ev_cc uuid;
    v_ev_ccat uuid;
    v_patched_product integer := 0;
    v_patched_item integer := 0;
    v_patched_cc integer := 0;
    v_patched_ccat integer := 0;
BEGIN
    SELECT ev.id INTO v_ev_product
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.name = 'product' AND e.tenant_id IS NULL LIMIT 1;

    SELECT ev.id INTO v_ev_item
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.name = 'item' AND e.tenant_id IS NULL LIMIT 1;

    SELECT ev.id INTO v_ev_cc
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.name = 'commodity_classification' AND e.tenant_id IS NULL LIMIT 1;

    SELECT ev.id INTO v_ev_ccat
    FROM control.entity e
    JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.version_no = 1
    WHERE e.name = 'commodity_category' AND e.tenant_id IS NULL LIMIT 1;

    IF v_ev_product IS NOT NULL THEN
        UPDATE control.entity_field ef
           SET enum_domain_code = patch.enum_domain_code,
               enum_config = NULL,
               updated_at = now(),
               updated_by = v_su
          FROM (VALUES
              ('product_type', 'master.product_type')
          ) AS patch(col, enum_domain_code)
         WHERE ef.entity_version_id = v_ev_product
           AND ef.column_name = patch.col
           AND ef.enum_domain_code IS DISTINCT FROM patch.enum_domain_code;

        GET DIAGNOSTICS v_patched_product = ROW_COUNT;
    END IF;

    IF v_ev_item IS NOT NULL THEN
        UPDATE control.entity_field ef
           SET enum_domain_code = patch.enum_domain_code,
               enum_config = NULL,
               updated_at = now(),
               updated_by = v_su
          FROM (VALUES
              ('valuation_method', 'master.valuation_method')
          ) AS patch(col, enum_domain_code)
         WHERE ef.entity_version_id = v_ev_item
           AND ef.column_name = patch.col
           AND ef.enum_domain_code IS DISTINCT FROM patch.enum_domain_code;

        GET DIAGNOSTICS v_patched_item = ROW_COUNT;
    END IF;

    IF v_ev_cc IS NOT NULL THEN
        UPDATE control.entity_field ef
           SET enum_domain_code = patch.enum_domain_code,
               enum_config = NULL,
               updated_at = now(),
               updated_by = v_su
          FROM (VALUES
              ('classification_type', 'master.cc_classification_type'),
              ('mapping_type',        'master.cc_mapping_type')
          ) AS patch(col, enum_domain_code)
         WHERE ef.entity_version_id = v_ev_cc
           AND ef.column_name = patch.col
           AND ef.enum_domain_code IS DISTINCT FROM patch.enum_domain_code;

        GET DIAGNOSTICS v_patched_cc = ROW_COUNT;
    END IF;

    IF v_ev_ccat IS NOT NULL THEN
        UPDATE control.entity_field ef
           SET data_type = patch.data_type,
               ui_type = patch.ui_type,
               enum_domain_code = patch.enum_domain_code,
               enum_config = NULL,
               updated_at = now(),
               updated_by = v_su
          FROM (VALUES
              ('buy_allowed',                'boolean', 'checkbox', NULL::text),
              ('sell_allowed',               'boolean', 'checkbox', NULL::text),
              ('inventory_allowed',          'boolean', 'checkbox', NULL::text),
              ('is_classification_required', 'boolean', 'checkbox', NULL::text),
              ('is_hs_required',             'boolean', 'checkbox', NULL::text),
              ('is_regulated',               'boolean', 'checkbox', NULL::text),
              ('default_valuation_method',   'enum',    'select',   'master.valuation_method')
          ) AS patch(col, data_type, ui_type, enum_domain_code)
         WHERE ef.entity_version_id = v_ev_ccat
           AND ef.column_name = patch.col;

        GET DIAGNOSTICS v_patched_ccat = ROW_COUNT;
    END IF;

    RAISE NOTICE 'Products enum patches complete (product=%, item=%, cc=%, ccat=%)',
        v_patched_product, v_patched_item, v_patched_cc, v_patched_ccat;
END $$;
