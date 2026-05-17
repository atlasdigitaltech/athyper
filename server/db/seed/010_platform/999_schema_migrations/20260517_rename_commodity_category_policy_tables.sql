-- =============================================================================
-- Migration: commodity category policy table naming cleanup (2026-05-17)
--
-- Align policy table names with commodity_category capability flags:
--   control.commodity_category_spend_policy -> control.commodity_category_buy_policy
--   control.commodity_category_sales_policy -> control.commodity_category_sell_policy
--
-- control.commodity_category_inventory_policy is already aligned and unchanged.
-- =============================================================================

DO $rename_tables$ BEGIN
    IF to_regclass('control.commodity_category_buy_policy') IS NULL
       AND to_regclass('control.commodity_category_spend_policy') IS NOT NULL THEN
        ALTER TABLE control.commodity_category_spend_policy RENAME TO commodity_category_buy_policy;
        RAISE NOTICE 'Renamed control.commodity_category_spend_policy to control.commodity_category_buy_policy';
    END IF;

    IF to_regclass('control.commodity_category_sell_policy') IS NULL
       AND to_regclass('control.commodity_category_sales_policy') IS NOT NULL THEN
        ALTER TABLE control.commodity_category_sales_policy RENAME TO commodity_category_sell_policy;
        RAISE NOTICE 'Renamed control.commodity_category_sales_policy to control.commodity_category_sell_policy';
    END IF;
END $rename_tables$;

DO $rename_constraints$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT *
        FROM (VALUES
            ('control','commodity_category_buy_policy','ccspol_pkey','ccbpol_pkey'),
            ('control','commodity_category_buy_policy','ccspol_tenant_id_uq','ccbpol_tenant_id_uq'),
            ('control','commodity_category_buy_policy','ccspol_mapping_mode_chk','ccbpol_mapping_mode_chk'),
            ('control','commodity_category_buy_policy','ccspol_scope_type_chk','ccbpol_scope_type_chk'),
            ('control','commodity_category_buy_policy','ccspol_scope_tenant_chk','ccbpol_scope_tenant_chk'),
            ('control','commodity_category_buy_policy','ccspol_company_scope_chk','ccbpol_company_scope_chk'),
            ('control','commodity_category_buy_policy','ccspol_deny_flags_chk','ccbpol_deny_flags_chk'),
            ('control','commodity_category_buy_policy','ccspol_capex_nonneg_chk','ccbpol_capex_nonneg_chk'),
            ('control','commodity_category_buy_policy','ccspol_capex_curr_req_chk','ccbpol_capex_curr_req_chk'),
            ('control','commodity_category_buy_policy','ccspol_effective_chk','ccbpol_effective_chk'),
            ('control','commodity_category_buy_policy','ccspol_tenant_fk','ccbpol_tenant_fk'),
            ('control','commodity_category_buy_policy','ccspol_category_fk','ccbpol_category_fk'),
            ('control','commodity_category_buy_policy','ccspol_intent_fk','ccbpol_intent_fk'),
            ('control','commodity_category_buy_policy','ccspol_company_fk','ccbpol_company_fk'),
            ('control','commodity_category_buy_policy','ccspol_gl_fk','ccbpol_gl_fk'),
            ('control','commodity_category_buy_policy','ccspol_tax_group_fk','ccbpol_tax_group_fk'),
            ('control','commodity_category_buy_policy','ccspol_asset_class_fk','ccbpol_asset_class_fk'),
            ('control','commodity_category_buy_policy','ccspol_budget_profile_fk','ccbpol_budget_profile_fk'),
            ('control','commodity_category_buy_policy','ccspol_capex_currency_fk','ccbpol_capex_currency_fk'),
            ('control','commodity_category_buy_policy','ccspol_created_by_fk','ccbpol_created_by_fk'),
            ('control','commodity_category_sell_policy','ccslpol_pkey','ccselpol_pkey'),
            ('control','commodity_category_sell_policy','ccslpol_tenant_id_uq','ccselpol_tenant_id_uq'),
            ('control','commodity_category_sell_policy','ccslpol_mapping_mode_chk','ccselpol_mapping_mode_chk'),
            ('control','commodity_category_sell_policy','ccslpol_scope_type_chk','ccselpol_scope_type_chk'),
            ('control','commodity_category_sell_policy','ccslpol_scope_tenant_chk','ccselpol_scope_tenant_chk'),
            ('control','commodity_category_sell_policy','ccslpol_company_scope_chk','ccselpol_company_scope_chk'),
            ('control','commodity_category_sell_policy','ccslpol_deny_flags_chk','ccselpol_deny_flags_chk'),
            ('control','commodity_category_sell_policy','ccslpol_rev_method_chk','ccselpol_rev_method_chk'),
            ('control','commodity_category_sell_policy','ccslpol_effective_chk','ccselpol_effective_chk'),
            ('control','commodity_category_sell_policy','ccslpol_tenant_fk','ccselpol_tenant_fk'),
            ('control','commodity_category_sell_policy','ccslpol_category_fk','ccselpol_category_fk'),
            ('control','commodity_category_sell_policy','ccslpol_intent_fk','ccselpol_intent_fk'),
            ('control','commodity_category_sell_policy','ccslpol_company_fk','ccselpol_company_fk'),
            ('control','commodity_category_sell_policy','ccslpol_revenue_gl_fk','ccselpol_revenue_gl_fk'),
            ('control','commodity_category_sell_policy','ccslpol_defrev_gl_fk','ccselpol_defrev_gl_fk'),
            ('control','commodity_category_sell_policy','ccslpol_unbilled_gl_fk','ccselpol_unbilled_gl_fk'),
            ('control','commodity_category_sell_policy','ccslpol_tax_group_fk','ccselpol_tax_group_fk'),
            ('control','commodity_category_sell_policy','ccslpol_accounting_profile_fk','ccselpol_accounting_profile_fk'),
            ('control','commodity_category_sell_policy','ccslpol_cogs_profile_fk','ccselpol_cogs_profile_fk'),
            ('control','commodity_category_sell_policy','ccslpol_created_by_fk','ccselpol_created_by_fk')
        ) AS x(schema_name, table_name, old_name, new_name)
    LOOP
        IF EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = r.schema_name
              AND t.relname = r.table_name
              AND c.conname = r.old_name
        )
        AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = r.schema_name
              AND t.relname = r.table_name
              AND c.conname = r.new_name
        ) THEN
            EXECUTE format('ALTER TABLE %I.%I RENAME CONSTRAINT %I TO %I',
                           r.schema_name, r.table_name, r.old_name, r.new_name);
        END IF;
    END LOOP;
END $rename_constraints$;

DO $rename_indexes$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT *
        FROM (VALUES
            ('ccspol_scope_idx','ccbpol_scope_idx'),
            ('ccspol_default_tenant_uq','ccbpol_default_tenant_uq'),
            ('ccspol_default_scope_uq','ccbpol_default_scope_uq'),
            ('ccslpol_scope_idx','ccselpol_scope_idx'),
            ('ccslpol_default_tenant_uq','ccselpol_default_tenant_uq'),
            ('ccslpol_default_scope_uq','ccselpol_default_scope_uq')
        ) AS x(old_name, new_name)
    LOOP
        IF to_regclass('control.' || r.old_name) IS NOT NULL
           AND to_regclass('control.' || r.new_name) IS NULL THEN
            EXECUTE format('ALTER INDEX control.%I RENAME TO %I', r.old_name, r.new_name);
        END IF;
    END LOOP;
END $rename_indexes$;

DO $rename_triggers$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT *
        FROM (VALUES
            ('commodity_category_buy_policy','trg_ccspol_updated_at','trg_ccbpol_updated_at'),
            ('commodity_category_buy_policy','trg_ccspol_status_changed','trg_ccbpol_status_changed'),
            ('commodity_category_sell_policy','trg_ccslpol_updated_at','trg_ccselpol_updated_at'),
            ('commodity_category_sell_policy','trg_ccslpol_status_changed','trg_ccselpol_status_changed')
        ) AS x(table_name, old_name, new_name)
    LOOP
        IF EXISTS (
            SELECT 1
            FROM pg_trigger tr
            JOIN pg_class t ON t.oid = tr.tgrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = 'control'
              AND t.relname = r.table_name
              AND tr.tgname = r.old_name
              AND NOT tr.tgisinternal
        )
        AND NOT EXISTS (
            SELECT 1
            FROM pg_trigger tr
            JOIN pg_class t ON t.oid = tr.tgrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = 'control'
              AND t.relname = r.table_name
              AND tr.tgname = r.new_name
              AND NOT tr.tgisinternal
        ) THEN
            EXECUTE format('ALTER TRIGGER %I ON control.%I RENAME TO %I',
                           r.old_name, r.table_name, r.new_name);
        END IF;
    END LOOP;
END $rename_triggers$;

DO $refresh_functions$
DECLARE
    fn oid;
    ddl text;
BEGIN
    FOR fn IN
        SELECT to_regprocedure(sig)
        FROM (VALUES
            ('control.resolve_business_intent(uuid,text,uuid,text,text,uuid,text,numeric,text,boolean,boolean,uuid,uuid,text,text,text,text,text,date)'),
            ('control.resolve_spend_category_policy(uuid,uuid,uuid)'),
            ('master.fn_resolve_spend_category_defaults(uuid,uuid,uuid)')
        ) AS x(sig)
        WHERE to_regprocedure(sig) IS NOT NULL
    LOOP
        ddl := pg_get_functiondef(fn);
        ddl := replace(ddl, 'commodity_category_spend_policy', 'commodity_category_buy_policy');
        ddl := replace(ddl, 'commodity_category_sales_policy', 'commodity_category_sell_policy');
        ddl := replace(ddl, 'ccspol_', 'ccbpol_');
        ddl := replace(ddl, 'ccslpol_', 'ccselpol_');
        EXECUTE ddl;
    END LOOP;
END $refresh_functions$;

DO $metadata$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
    IF EXISTS (
        SELECT 1 FROM control.entity
        WHERE tenant_id IS NULL
          AND entity_code = 'commodity_category_spend_policy'
    )
    AND NOT EXISTS (
        SELECT 1 FROM control.entity
        WHERE tenant_id IS NULL
          AND entity_code = 'commodity_category_buy_policy'
    ) THEN
        UPDATE control.entity
           SET name = 'commodity_category_buy_policy',
               entity_code = 'commodity_category_buy_policy',
               entity_short = 'CCBPOL',
               table_name = 'commodity_category_buy_policy',
               label_singular = 'Commodity Buy Policy',
               label_plural = 'Commodity Buy Policies',
               feature_flags = COALESCE(feature_flags, '{}'::jsonb)
                               || jsonb_build_object('replacement_for', 'commodity_category_spend_policy'),
               updated_at = now(),
               updated_by = v_su
         WHERE tenant_id IS NULL
           AND entity_code = 'commodity_category_spend_policy';

        UPDATE control.entity_operation
           SET entity_name = 'commodity_category_buy_policy',
               updated_at = now(),
               updated_by = v_su
         WHERE tenant_id IS NULL
           AND entity_name = 'commodity_category_spend_policy';

        UPDATE control.entity_lifecycle
           SET entity_name = 'commodity_category_buy_policy',
               updated_at = now(),
               updated_by = v_su
         WHERE tenant_id IS NULL
           AND entity_name = 'commodity_category_spend_policy';
    ELSE
        UPDATE control.entity
           SET status = 'ARCHIVED',
               feature_flags = COALESCE(feature_flags, '{}'::jsonb)
                               || jsonb_build_object(
                                    'is_hidden', true,
                                    'records_api_disabled', true,
                                    'replacement_entity', 'commodity_category_buy_policy'
                                  ),
               updated_at = now(),
               updated_by = v_su
         WHERE tenant_id IS NULL
           AND entity_code = 'commodity_category_spend_policy';

        DELETE FROM control.entity_operation
         WHERE tenant_id IS NULL
           AND entity_name = 'commodity_category_spend_policy';

        DELETE FROM control.entity_lifecycle
         WHERE tenant_id IS NULL
           AND entity_name = 'commodity_category_spend_policy';
    END IF;

    IF EXISTS (
        SELECT 1 FROM control.entity
        WHERE tenant_id IS NULL
          AND entity_code = 'commodity_category_sales_policy'
    )
    AND NOT EXISTS (
        SELECT 1 FROM control.entity
        WHERE tenant_id IS NULL
          AND entity_code = 'commodity_category_sell_policy'
    ) THEN
        UPDATE control.entity
           SET name = 'commodity_category_sell_policy',
               entity_code = 'commodity_category_sell_policy',
               entity_short = 'CCSELPOL',
               table_name = 'commodity_category_sell_policy',
               label_singular = 'Commodity Sell Policy',
               label_plural = 'Commodity Sell Policies',
               feature_flags = COALESCE(feature_flags, '{}'::jsonb)
                               || jsonb_build_object('replacement_for', 'commodity_category_sales_policy'),
               updated_at = now(),
               updated_by = v_su
         WHERE tenant_id IS NULL
           AND entity_code = 'commodity_category_sales_policy';

        UPDATE control.entity_operation
           SET entity_name = 'commodity_category_sell_policy',
               updated_at = now(),
               updated_by = v_su
         WHERE tenant_id IS NULL
           AND entity_name = 'commodity_category_sales_policy';

        UPDATE control.entity_lifecycle
           SET entity_name = 'commodity_category_sell_policy',
               updated_at = now(),
               updated_by = v_su
         WHERE tenant_id IS NULL
           AND entity_name = 'commodity_category_sales_policy';
    ELSE
        UPDATE control.entity
           SET status = 'ARCHIVED',
               feature_flags = COALESCE(feature_flags, '{}'::jsonb)
                               || jsonb_build_object(
                                    'is_hidden', true,
                                    'records_api_disabled', true,
                                    'replacement_entity', 'commodity_category_sell_policy'
                                  ),
               updated_at = now(),
               updated_by = v_su
         WHERE tenant_id IS NULL
           AND entity_code = 'commodity_category_sales_policy';

        DELETE FROM control.entity_operation
         WHERE tenant_id IS NULL
           AND entity_name = 'commodity_category_sales_policy';

        DELETE FROM control.entity_lifecycle
         WHERE tenant_id IS NULL
           AND entity_name = 'commodity_category_sales_policy';
    END IF;
END $metadata$;
