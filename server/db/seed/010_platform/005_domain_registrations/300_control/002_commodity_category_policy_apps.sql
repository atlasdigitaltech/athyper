-- 300_control/002_commodity_category_policy_apps.sql
-- Purpose: expose commodity category policy tables through the generic entity app runtime.
-- Idempotent: upserts entity rows, version 1, fields, display config, lifecycle, and operations.

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_acc uuid;
    v_lc_active_inactive uuid;
BEGIN
    SELECT id INTO v_acc FROM shared.module WHERE code = 'ACC';
    SELECT id INTO v_lc_active_inactive
      FROM control.lifecycle
     WHERE code = 'lc_active_inactive'
       AND tenant_id IS NULL;

    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code,
        entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability,
        table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES
        (v_acc, 'commodity_category_buy_policy', 'CCBPOL', 'commodity_category_buy_policy',
         'CONTROL', 'system', 'ent', 'table',
         'full', 'operational', 'controlled',
         'control', 'commodity_category_buy_policy',
         'Commodity Buy Policy', 'Commodity Buy Policies', 'shopping-cart', 'rose',
         false, '{
             "parent_entity":"commodity_category",
             "parent_fk":"commodity_category_id",
             "generic_runtime_disabled":false,
             "records_api_disabled":false,
             "is_hidden":false,
             "is_readonly":false,
             "is_exportable":true
         }'::jsonb, 'ACTIVE', v_su),
        (v_acc, 'commodity_category_sell_policy', 'CCSELPOL', 'commodity_category_sell_policy',
         'CONTROL', 'system', 'ent', 'table',
         'full', 'operational', 'controlled',
         'control', 'commodity_category_sell_policy',
         'Commodity Sell Policy', 'Commodity Sell Policies', 'receipt', 'rose',
         false, '{
             "parent_entity":"commodity_category",
             "parent_fk":"commodity_category_id",
             "generic_runtime_disabled":false,
             "records_api_disabled":false,
             "is_hidden":false,
             "is_readonly":false,
             "is_exportable":true
         }'::jsonb, 'ACTIVE', v_su),
        (v_acc, 'commodity_category_inventory_policy', 'CCIPOL', 'commodity_category_inventory_policy',
         'CONTROL', 'system', 'ent', 'table',
         'full', 'operational', 'controlled',
         'control', 'commodity_category_inventory_policy',
         'Commodity Inventory Policy', 'Commodity Inventory Policies', 'warehouse', 'rose',
         false, '{
             "parent_entity":"commodity_category",
             "parent_fk":"commodity_category_id",
             "generic_runtime_disabled":false,
             "records_api_disabled":false,
             "is_hidden":false,
             "is_readonly":false,
             "is_exportable":true
         }'::jsonb, 'ACTIVE', v_su)
    ON CONFLICT (table_schema, table_name) DO UPDATE
       SET module_id        = EXCLUDED.module_id,
           name             = EXCLUDED.name,
           entity_short     = EXCLUDED.entity_short,
           entity_code      = EXCLUDED.entity_code,
           entity_class     = EXCLUDED.entity_class,
           ownership_model  = EXCLUDED.ownership_model,
           kind             = EXCLUDED.kind,
           backing_type     = EXCLUDED.backing_type,
           governance_level = EXCLUDED.governance_level,
           security_tier    = EXCLUDED.security_tier,
           mutability       = EXCLUDED.mutability,
           label_singular   = EXCLUDED.label_singular,
           label_plural     = EXCLUDED.label_plural,
           icon_key         = EXCLUDED.icon_key,
           color_token      = EXCLUDED.color_token,
           feature_flags    = COALESCE(control.entity.feature_flags, '{}'::jsonb) || EXCLUDED.feature_flags,
           status           = 'ACTIVE',
           updated_at       = now(),
           updated_by       = v_su;

    INSERT INTO control.entity_version (
        entity_id, tenant_id, version_no, status, label, change_type, effective_from, created_by)
    SELECT e.id, NULL, 1, 'EFFECTIVE', 'Initial version', 'structural', now(), v_su
    FROM control.entity e
    WHERE e.entity_code IN (
        'commodity_category_buy_policy',
        'commodity_category_sell_policy',
        'commodity_category_inventory_policy'
    )
      AND e.tenant_id IS NULL
    ON CONFLICT (entity_id, version_no) DO NOTHING;

    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
        validation, reference_config, sort_order, created_by)
    SELECT ev.id,
           f.name, f.column_name, f.label, f.data_type, f.ui_type,
           f.cardinality, 'standard', f.is_required, f.is_filterable, f.is_sortable, f.is_searchable,
           f.validation, f.reference_config, f.sort_order, v_su
    FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    CROSS JOIN (VALUES
        ('commodity_category_buy_policy','commodity_category_id','commodity_category_id','Commodity Category','uuid','reference','one',true,true,false,false,'{"ref_entity":"commodity_category"}'::jsonb,'{"target_entity":"commodity_category","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,110),
        ('commodity_category_buy_policy','business_intent_id','business_intent_id','Business Intent','uuid','reference','one',true,true,false,false,'{"ref_entity":"business_intent"}'::jsonb,'{"target_entity":"business_intent","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,120),
        ('commodity_category_buy_policy','company_code_id','company_code_id','Company Code','uuid','reference','zero_or_one',false,true,false,false,'{"ref_entity":"company_code"}'::jsonb,'{"target_entity":"company_code","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,130),
        ('commodity_category_buy_policy','scope_type','scope_type','Scope Type','string','text','one',true,true,true,true,NULL::jsonb,NULL::jsonb,140),
        ('commodity_category_buy_policy','scope_id','scope_id','Scope','uuid','reference','zero_or_one',false,true,false,false,NULL::jsonb,NULL::jsonb,150),
        ('commodity_category_buy_policy','mapping_mode','mapping_mode','Mode','string','text','one',true,true,true,true,NULL::jsonb,NULL::jsonb,160),
        ('commodity_category_buy_policy','is_default','is_default','Default','boolean','checkbox','one',true,true,true,false,NULL::jsonb,NULL::jsonb,170),
        ('commodity_category_buy_policy','is_selectable','is_selectable','Selectable','boolean','checkbox','one',true,true,true,false,NULL::jsonb,NULL::jsonb,180),
        ('commodity_category_buy_policy','default_gl_account_id','default_gl_account_id','Default GL Account','uuid','reference','zero_or_one',false,true,false,false,'{"ref_entity":"gl_account"}'::jsonb,'{"target_entity":"gl_account","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,190),
        ('commodity_category_buy_policy','default_tax_group_id','default_tax_group_id','Default Tax Group','uuid','reference','zero_or_one',false,true,false,false,'{"ref_entity":"tax_group"}'::jsonb,'{"target_entity":"tax_group","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,200),
        ('commodity_category_buy_policy','default_asset_class_id','default_asset_class_id','Default Asset Class','uuid','reference','zero_or_one',false,true,false,false,'{"ref_entity":"asset_class"}'::jsonb,'{"target_entity":"asset_class","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,210),
        ('commodity_category_buy_policy','default_asset_profile_code','default_asset_profile_code','Asset Profile','string','text','zero_or_one',false,true,true,true,NULL::jsonb,NULL::jsonb,220),
        ('commodity_category_buy_policy','default_budget_profile_id','default_budget_profile_id','Default Budget Profile','uuid','reference','zero_or_one',false,true,false,false,'{"ref_entity":"budget_profile"}'::jsonb,'{"target_entity":"budget_profile","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,230),
        ('commodity_category_buy_policy','is_asset_tag_required','is_asset_tag_required','Asset Tag Required','boolean','checkbox','zero_or_one',false,true,true,false,NULL::jsonb,NULL::jsonb,240),
        ('commodity_category_buy_policy','capex_screening_threshold','capex_screening_threshold','Capex Threshold','decimal','number','zero_or_one',false,true,true,false,'{"min":0}'::jsonb,NULL::jsonb,250),
        ('commodity_category_buy_policy','capex_screening_currency','capex_screening_currency','Capex Currency','string','currency','zero_or_one',false,true,true,true,NULL::jsonb,NULL::jsonb,260),
        ('commodity_category_buy_policy','override_visibility','override_visibility','Override Visibility','string','text','zero_or_one',false,true,true,true,NULL::jsonb,NULL::jsonb,270),
        ('commodity_category_buy_policy','override_is_classification_required','override_is_classification_required','Override Classification Required','boolean','checkbox','zero_or_one',false,true,true,false,NULL::jsonb,NULL::jsonb,280),
        ('commodity_category_buy_policy','override_is_hs_required','override_is_hs_required','Override HS Required','boolean','checkbox','zero_or_one',false,true,true,false,NULL::jsonb,NULL::jsonb,290),
        ('commodity_category_buy_policy','override_is_regulated','override_is_regulated','Override Regulated','boolean','checkbox','zero_or_one',false,true,true,false,NULL::jsonb,NULL::jsonb,300),
        ('commodity_category_buy_policy','effective_from','effective_from','Effective From','date','date','one',true,true,true,false,NULL::jsonb,NULL::jsonb,310),
        ('commodity_category_buy_policy','effective_to','effective_to','Effective To','date','date','zero_or_one',false,true,true,false,NULL::jsonb,NULL::jsonb,320),
        ('commodity_category_buy_policy','status','status','Status','lifecycle_state','select','one',true,true,true,false,NULL::jsonb,NULL::jsonb,330),

        ('commodity_category_sell_policy','commodity_category_id','commodity_category_id','Commodity Category','uuid','reference','one',true,true,false,false,'{"ref_entity":"commodity_category"}'::jsonb,'{"target_entity":"commodity_category","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,110),
        ('commodity_category_sell_policy','business_intent_id','business_intent_id','Business Intent','uuid','reference','one',true,true,false,false,'{"ref_entity":"business_intent"}'::jsonb,'{"target_entity":"business_intent","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,120),
        ('commodity_category_sell_policy','company_code_id','company_code_id','Company Code','uuid','reference','zero_or_one',false,true,false,false,'{"ref_entity":"company_code"}'::jsonb,'{"target_entity":"company_code","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,130),
        ('commodity_category_sell_policy','scope_type','scope_type','Scope Type','string','text','one',true,true,true,true,NULL::jsonb,NULL::jsonb,140),
        ('commodity_category_sell_policy','scope_id','scope_id','Scope','uuid','reference','zero_or_one',false,true,false,false,NULL::jsonb,NULL::jsonb,150),
        ('commodity_category_sell_policy','mapping_mode','mapping_mode','Mode','string','text','one',true,true,true,true,NULL::jsonb,NULL::jsonb,160),
        ('commodity_category_sell_policy','is_default','is_default','Default','boolean','checkbox','one',true,true,true,false,NULL::jsonb,NULL::jsonb,170),
        ('commodity_category_sell_policy','is_selectable','is_selectable','Selectable','boolean','checkbox','one',true,true,true,false,NULL::jsonb,NULL::jsonb,180),
        ('commodity_category_sell_policy','default_revenue_gl_account_id','default_revenue_gl_account_id','Revenue GL Account','uuid','reference','zero_or_one',false,true,false,false,'{"ref_entity":"gl_account"}'::jsonb,'{"target_entity":"gl_account","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,190),
        ('commodity_category_sell_policy','default_deferred_revenue_gl_account_id','default_deferred_revenue_gl_account_id','Deferred Revenue GL','uuid','reference','zero_or_one',false,true,false,false,'{"ref_entity":"gl_account"}'::jsonb,'{"target_entity":"gl_account","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,200),
        ('commodity_category_sell_policy','default_unbilled_ar_gl_account_id','default_unbilled_ar_gl_account_id','Unbilled AR GL','uuid','reference','zero_or_one',false,true,false,false,'{"ref_entity":"gl_account"}'::jsonb,'{"target_entity":"gl_account","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,210),
        ('commodity_category_sell_policy','default_tax_group_id','default_tax_group_id','Default Tax Group','uuid','reference','zero_or_one',false,true,false,false,'{"ref_entity":"tax_group"}'::jsonb,'{"target_entity":"tax_group","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,220),
        ('commodity_category_sell_policy','default_accounting_profile_id','default_accounting_profile_id','Accounting Profile','uuid','reference','zero_or_one',false,true,false,false,'{"ref_entity":"accounting_profile"}'::jsonb,'{"target_entity":"accounting_profile","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,230),
        ('commodity_category_sell_policy','paired_cogs_profile_id','paired_cogs_profile_id','COGS Profile','uuid','reference','zero_or_one',false,true,false,false,'{"ref_entity":"accounting_profile"}'::jsonb,'{"target_entity":"accounting_profile","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,240),
        ('commodity_category_sell_policy','revenue_recognition_method','revenue_recognition_method','Revenue Recognition','string','text','zero_or_one',false,true,true,true,NULL::jsonb,NULL::jsonb,250),
        ('commodity_category_sell_policy','variable_consideration','variable_consideration','Variable Consideration','string','text','zero_or_one',false,true,true,true,NULL::jsonb,NULL::jsonb,260),
        ('commodity_category_sell_policy','standalone_selling_price_method','standalone_selling_price_method','Standalone Selling Price','string','text','zero_or_one',false,true,true,true,NULL::jsonb,NULL::jsonb,270),
        ('commodity_category_sell_policy','effective_from','effective_from','Effective From','date','date','one',true,true,true,false,NULL::jsonb,NULL::jsonb,280),
        ('commodity_category_sell_policy','effective_to','effective_to','Effective To','date','date','zero_or_one',false,true,true,false,NULL::jsonb,NULL::jsonb,290),
        ('commodity_category_sell_policy','status','status','Status','lifecycle_state','select','one',true,true,true,false,NULL::jsonb,NULL::jsonb,300),

        ('commodity_category_inventory_policy','commodity_category_id','commodity_category_id','Commodity Category','uuid','reference','one',true,true,false,false,'{"ref_entity":"commodity_category"}'::jsonb,'{"target_entity":"commodity_category","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,110),
        ('commodity_category_inventory_policy','company_code_id','company_code_id','Company Code','uuid','reference','zero_or_one',false,true,false,false,'{"ref_entity":"company_code"}'::jsonb,'{"target_entity":"company_code","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,120),
        ('commodity_category_inventory_policy','scope_type','scope_type','Scope Type','string','text','one',true,true,true,true,NULL::jsonb,NULL::jsonb,130),
        ('commodity_category_inventory_policy','scope_id','scope_id','Scope','uuid','reference','zero_or_one',false,true,false,false,NULL::jsonb,NULL::jsonb,140),
        ('commodity_category_inventory_policy','mapping_mode','mapping_mode','Mode','string','text','one',true,true,true,true,NULL::jsonb,NULL::jsonb,150),
        ('commodity_category_inventory_policy','stocking_status','stocking_status','Stocking Status','string','text','one',true,true,true,true,NULL::jsonb,NULL::jsonb,160),
        ('commodity_category_inventory_policy','valuation_method','valuation_method','Valuation Method','string','text','zero_or_one',false,true,true,true,NULL::jsonb,NULL::jsonb,170),
        ('commodity_category_inventory_policy','default_inventory_gl_account_id','default_inventory_gl_account_id','Inventory GL','uuid','reference','zero_or_one',false,true,false,false,'{"ref_entity":"gl_account"}'::jsonb,'{"target_entity":"gl_account","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,180),
        ('commodity_category_inventory_policy','default_wip_gl_account_id','default_wip_gl_account_id','WIP GL','uuid','reference','zero_or_one',false,true,false,false,'{"ref_entity":"gl_account"}'::jsonb,'{"target_entity":"gl_account","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,190),
        ('commodity_category_inventory_policy','default_cogs_gl_account_id','default_cogs_gl_account_id','COGS GL','uuid','reference','zero_or_one',false,true,false,false,'{"ref_entity":"gl_account"}'::jsonb,'{"target_entity":"gl_account","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,200),
        ('commodity_category_inventory_policy','default_price_variance_gl_account_id','default_price_variance_gl_account_id','Price Variance GL','uuid','reference','zero_or_one',false,true,false,false,'{"ref_entity":"gl_account"}'::jsonb,'{"target_entity":"gl_account","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb,210),
        ('commodity_category_inventory_policy','default_reorder_point','default_reorder_point','Reorder Point','decimal','number','zero_or_one',false,true,true,false,'{"min":0}'::jsonb,NULL::jsonb,220),
        ('commodity_category_inventory_policy','default_reorder_qty','default_reorder_qty','Reorder Quantity','decimal','number','zero_or_one',false,true,true,false,'{"min":0}'::jsonb,NULL::jsonb,230),
        ('commodity_category_inventory_policy','default_safety_stock','default_safety_stock','Safety Stock','decimal','number','zero_or_one',false,true,true,false,'{"min":0}'::jsonb,NULL::jsonb,240),
        ('commodity_category_inventory_policy','override_lot_tracking_required','override_lot_tracking_required','Override Lot Tracking','boolean','checkbox','zero_or_one',false,true,true,false,NULL::jsonb,NULL::jsonb,250),
        ('commodity_category_inventory_policy','override_serial_tracking_required','override_serial_tracking_required','Override Serial Tracking','boolean','checkbox','zero_or_one',false,true,true,false,NULL::jsonb,NULL::jsonb,260),
        ('commodity_category_inventory_policy','effective_from','effective_from','Effective From','date','date','one',true,true,true,false,NULL::jsonb,NULL::jsonb,270),
        ('commodity_category_inventory_policy','effective_to','effective_to','Effective To','date','date','zero_or_one',false,true,true,false,NULL::jsonb,NULL::jsonb,280),
        ('commodity_category_inventory_policy','status','status','Status','lifecycle_state','select','one',true,true,true,false,NULL::jsonb,NULL::jsonb,290)
    ) AS f(entity_code, name, column_name, label, data_type, ui_type, cardinality,
           is_required, is_filterable, is_sortable, is_searchable, validation, reference_config, sort_order)
    WHERE e.entity_code = f.entity_code
      AND e.tenant_id IS NULL
      AND ev.version_no = 1
    ON CONFLICT DO NOTHING;

    UPDATE control.entity
       SET display_config = jsonb_build_object(
               'detail_renderer',    'master',
               'list_columns',       jsonb_build_array('commodity_category_id','business_intent_id','scope_type','mapping_mode','is_default','is_selectable','effective_from','effective_to','status'),
               'search_fields',      jsonb_build_array('scope_type','mapping_mode','default_asset_profile_code','capex_screening_currency'),
               'default_sort_field', 'sort_order',
               'default_sort_order', 'asc'
           ),
           natural_key_fields = ARRAY['commodity_category_id','business_intent_id','scope_type','scope_id','effective_from'],
           updated_at = now(),
           updated_by = v_su
     WHERE entity_code = 'commodity_category_buy_policy'
       AND tenant_id IS NULL;

    UPDATE control.entity
       SET display_config = jsonb_build_object(
               'detail_renderer',    'master',
               'list_columns',       jsonb_build_array('commodity_category_id','business_intent_id','scope_type','mapping_mode','is_default','is_selectable','effective_from','effective_to','status'),
               'search_fields',      jsonb_build_array('scope_type','mapping_mode','revenue_recognition_method','variable_consideration'),
               'default_sort_field', 'sort_order',
               'default_sort_order', 'asc'
           ),
           natural_key_fields = ARRAY['commodity_category_id','business_intent_id','scope_type','scope_id','effective_from'],
           updated_at = now(),
           updated_by = v_su
     WHERE entity_code = 'commodity_category_sell_policy'
       AND tenant_id IS NULL;

    UPDATE control.entity
       SET display_config = jsonb_build_object(
               'detail_renderer',    'master',
               'list_columns',       jsonb_build_array('commodity_category_id','scope_type','mapping_mode','stocking_status','valuation_method','effective_from','effective_to','status'),
               'search_fields',      jsonb_build_array('scope_type','mapping_mode','stocking_status','valuation_method'),
               'default_sort_field', 'sort_order',
               'default_sort_order', 'asc'
           ),
           natural_key_fields = ARRAY['commodity_category_id','scope_type','scope_id','effective_from'],
           updated_at = now(),
           updated_by = v_su
     WHERE entity_code = 'commodity_category_inventory_policy'
       AND tenant_id IS NULL;

    INSERT INTO control.entity_lifecycle
        (tenant_id, entity_name, lifecycle_id, priority, created_by)
    SELECT NULL::uuid, e.entity_code, v_lc_active_inactive, 100, v_su
      FROM control.entity e
     WHERE e.entity_code IN (
               'commodity_category_buy_policy',
               'commodity_category_sell_policy',
               'commodity_category_inventory_policy'
           )
       AND e.tenant_id IS NULL
       AND v_lc_active_inactive IS NOT NULL
    ON CONFLICT ON CONSTRAINT el_binding_uq DO NOTHING;

    INSERT INTO control.entity_operation
        (tenant_id, entity_name, permission_code, surface, placement,
         handler_type, handler_target, is_record_required, sort_order, created_by)
    VALUES
        (NULL,'commodity_category_buy_policy',     'create','LIST',  'PRIMARY','NAVIGATE','/app/commodity_category_buy_policy/new',false,10,v_su),
        (NULL,'commodity_category_buy_policy',     'edit',  'DETAIL','PRIMARY','NAVIGATE','/app/commodity_category_buy_policy/{id}?mode=edit',true,20,v_su),
        (NULL,'commodity_category_buy_policy',     'export','LIST',  'TOOLBAR','API','export',false,40,v_su),
        (NULL,'commodity_category_sell_policy',     'create','LIST',  'PRIMARY','NAVIGATE','/app/commodity_category_sell_policy/new',false,10,v_su),
        (NULL,'commodity_category_sell_policy',     'edit',  'DETAIL','PRIMARY','NAVIGATE','/app/commodity_category_sell_policy/{id}?mode=edit',true,20,v_su),
        (NULL,'commodity_category_sell_policy',     'export','LIST',  'TOOLBAR','API','export',false,40,v_su),
        (NULL,'commodity_category_inventory_policy', 'create','LIST',  'PRIMARY','NAVIGATE','/app/commodity_category_inventory_policy/new',false,10,v_su),
        (NULL,'commodity_category_inventory_policy', 'edit',  'DETAIL','PRIMARY','NAVIGATE','/app/commodity_category_inventory_policy/{id}?mode=edit',true,20,v_su),
        (NULL,'commodity_category_inventory_policy', 'export','LIST',  'TOOLBAR','API','export',false,40,v_su)
    ON CONFLICT ON CONSTRAINT eo_binding_uq DO UPDATE
       SET surface            = EXCLUDED.surface,
           placement          = EXCLUDED.placement,
           handler_type       = EXCLUDED.handler_type,
           handler_target     = EXCLUDED.handler_target,
           is_record_required = EXCLUDED.is_record_required,
           sort_order         = EXCLUDED.sort_order,
           is_enabled         = true,
           updated_at         = now(),
           updated_by         = v_su;

    UPDATE control.entity
       SET status = 'ARCHIVED',
           feature_flags = COALESCE(feature_flags, '{}'::jsonb)
               || jsonb_build_object(
                    'is_hidden', true,
                    'records_api_disabled', true,
                    'replacement_entity', CASE entity_code
                        WHEN 'company_code_supplier_posting_override' THEN 'supplier_posting_override'
                        ELSE 'commodity_category_buy_policy'
                    END
                  ),
           updated_at = now(),
           updated_by = v_su
     WHERE entity_code IN (
            'company_code_spend_policy',
            'company_code_intent_policy',
            'company_code_supplier_spend_policy',
            'company_code_supplier_intent_policy',
            'company_code_supplier_posting_override'
          )
       AND tenant_id IS NULL;

    RAISE NOTICE '005_domain_registrations/300_control/002_commodity_category_policy_apps: done';
END $$;
