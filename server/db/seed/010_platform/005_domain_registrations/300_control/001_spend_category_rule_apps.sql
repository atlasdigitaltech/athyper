-- 300_control/001_spend_category_rule_apps.sql
-- Purpose: expose spend-category rule tables through the generic entity app runtime.
-- Idempotent: upserts entity rows, version 1, fields, display config, and operations.

DO $$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_acc uuid;
    v_rel uuid;
BEGIN
    SELECT id INTO v_acc FROM shared.module WHERE code = 'ACC';
    SELECT id INTO v_rel FROM shared.module WHERE code = 'REL';

    INSERT INTO control.entity (
        module_id, name, entity_short, entity_code,
        entity_class, ownership_model, kind, backing_type,
        governance_level, security_tier, mutability,
        table_schema, table_name,
        label_singular, label_plural, icon_key, color_token,
        numbering_active, feature_flags, status, created_by)
    VALUES
        (v_acc, 'classification_to_intent_rule', 'CIR', 'classification_to_intent_rule',
         'CONTROL', 'system', 'ent', 'table',
         'full', 'operational', 'controlled',
         'control', 'classification_to_intent_rule',
         'Classification Rule', 'Classification Rules', 'route', 'rose',
         false, '{"parent_entity":"spend_category","parent_fk":"classification_id"}'::jsonb, 'ACTIVE', v_su),
        (v_rel, 'commodity_to_spend_category_rule', 'CCRR', 'commodity_to_spend_category_rule',
         'CONTROL', 'system', 'ent', 'table',
         'full', 'operational', 'controlled',
         'control', 'commodity_to_spend_category_rule',
         'Commodity Routing Rule', 'Commodity Routing Rules', 'route', 'rose',
         false, '{"parent_entity":"spend_category","parent_fk":"spend_category_id"}'::jsonb, 'ACTIVE', v_su)
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
    WHERE e.entity_code IN ('classification_to_intent_rule', 'commodity_to_spend_category_rule')
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
        ('classification_source', 'classification_source', 'Classification Source', 'string',     'text',      'one',         true,  true,  true,  true,  NULL::jsonb, NULL::jsonb,  10),
        ('classification_id',     'classification_id',     'Spend Category',         'uuid',       'reference', 'one',         true,  true,  false, false, '{"ref_entity":"spend_category"}'::jsonb, '{"target_entity":"spend_category","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb, 20),
        ('condition_type',        'condition_type',        'Condition Type',         'string',     'text',      'one',         true,  true,  true,  true,  NULL::jsonb, NULL::jsonb,  30),
        ('condition_config',      'condition_config',      'Condition Config',       'jsonb',      'json',      'one',         true,  false, false, false, NULL::jsonb, NULL::jsonb,  40),
        ('applies_to_flows',      'applies_to_flows',      'Applies To Flows',       'text_array', 'json',      'many',        false, true,  false, false, NULL::jsonb, NULL::jsonb,  50),
        ('resolved_intent_id',    'resolved_intent_id',    'Resolved Intent',        'uuid',       'reference', 'one',         true,  true,  false, false, '{"ref_entity":"business_intent"}'::jsonb, '{"target_entity":"business_intent","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb, 60),
        ('resolved_domain',       'resolved_domain',       'Resolved Domain',        'string',     'text',      'zero_or_one',false, true,  true,  true,  NULL::jsonb, NULL::jsonb,  70),
        ('direction',             'direction',             'Direction',              'string',     'text',      'zero_or_one',false, true,  true,  false, NULL::jsonb, NULL::jsonb,  80),
        ('explanation_template',  'explanation_template',  'Explanation',           'text',       'textarea',  'one',         true,  false, false, true,  NULL::jsonb, NULL::jsonb,  90),
        ('confidence',            'confidence',            'Confidence',            'decimal',    'number',    'one',         true,  true,  true,  false, '{"min":0,"max":1}'::jsonb, NULL::jsonb, 100),
        ('priority',              'priority',              'Priority',              'integer',    'number',    'one',         true,  true,  true,  false, '{"min":0}'::jsonb, NULL::jsonb, 110),
        ('effective_from',        'effective_from',        'Effective From',         'date',       'date',      'one',         true,  true,  true,  false, NULL::jsonb, NULL::jsonb, 120),
        ('effective_to',          'effective_to',          'Effective To',           'date',       'date',      'zero_or_one',false, true,  true,  false, NULL::jsonb, NULL::jsonb, 130),
        ('status',                'status',                'Status',                 'lifecycle_state','select','one',        true,  true,  true,  false, NULL::jsonb, NULL::jsonb, 140)
    ) AS f(name, column_name, label, data_type, ui_type, cardinality, is_required,
           is_filterable, is_sortable, is_searchable, validation, reference_config, sort_order)
    WHERE e.entity_code = 'classification_to_intent_rule'
      AND e.tenant_id IS NULL
      AND ev.version_no = 1
    ON CONFLICT DO NOTHING;

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
        ('commodity_domain_code', 'commodity_domain_code', 'Commodity Domain', 'string',  'text',      'one',         true,  true,  true,  true,  NULL::jsonb, NULL::jsonb, 10),
        ('match_mode',            'match_mode',            'Match Mode',       'string',  'text',      'one',         true,  true,  true,  true,  NULL::jsonb, NULL::jsonb, 20),
        ('code_from',             'code_from',             'Code From',        'string',  'text',      'one',         true,  true,  true,  true,  NULL::jsonb, NULL::jsonb, 30),
        ('code_to',               'code_to',               'Code To',          'string',  'text',      'zero_or_one',false, true,  true,  true,  NULL::jsonb, NULL::jsonb, 40),
        ('code_level',            'code_level',            'Code Level',       'integer', 'number',    'zero_or_one',false, true,  true,  false, '{"min":0}'::jsonb, NULL::jsonb, 50),
        ('spend_category_id',     'spend_category_id',     'Spend Category',   'uuid',    'reference', 'one',         true,  true,  false, false, '{"ref_entity":"spend_category"}'::jsonb, '{"target_entity":"spend_category","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb, 60),
        ('priority',              'priority',              'Priority',         'integer', 'number',    'one',         true,  true,  true,  false, '{"min":0}'::jsonb, NULL::jsonb, 70),
        ('confidence',            'confidence',            'Confidence',       'decimal', 'number',    'one',         true,  true,  true,  false, '{"min":0,"max":100}'::jsonb, NULL::jsonb, 80),
        ('status',                'status',                'Status',           'lifecycle_state','select','one',      true,  true,  true,  false, NULL::jsonb, NULL::jsonb, 90)
    ) AS f(name, column_name, label, data_type, ui_type, cardinality, is_required,
           is_filterable, is_sortable, is_searchable, validation, reference_config, sort_order)
    WHERE e.entity_code = 'commodity_to_spend_category_rule'
      AND e.tenant_id IS NULL
      AND ev.version_no = 1
    ON CONFLICT DO NOTHING;

    UPDATE control.entity
       SET display_config = jsonb_build_object(
               'detail_renderer',    'master',
               'list_columns',       jsonb_build_array('classification_id','condition_type','resolved_intent_id','priority','effective_from','effective_to','status'),
               'search_fields',      jsonb_build_array('classification_source','condition_type','resolved_domain','explanation_template'),
               'default_sort_field', 'priority',
               'default_sort_order', 'asc'
           ),
           natural_key_fields = ARRAY['classification_source','classification_id','condition_type','resolved_intent_id','priority']
     WHERE entity_code = 'classification_to_intent_rule'
       AND tenant_id IS NULL;

    UPDATE control.entity
       SET display_config = jsonb_build_object(
               'detail_renderer',    'master',
               'list_columns',       jsonb_build_array('commodity_domain_code','match_mode','code_from','code_to','spend_category_id','priority','status'),
               'search_fields',      jsonb_build_array('commodity_domain_code','match_mode','code_from','code_to'),
               'default_sort_field', 'priority',
               'default_sort_order', 'desc'
           ),
           natural_key_fields = ARRAY['commodity_domain_code','code_from','priority']
     WHERE entity_code = 'commodity_to_spend_category_rule'
       AND tenant_id IS NULL;

    INSERT INTO control.entity_field (
        entity_version_id, name, column_name, label, data_type, ui_type,
        cardinality, origin, is_required, is_filterable, is_sortable, is_searchable,
        is_read_only, is_computed, compute_mode, compute_expr,
        validation, reference_config, sort_order, created_by)
    SELECT ev.id,
           f.name, f.column_name, f.label, f.data_type, f.ui_type,
           f.cardinality, f.origin, f.is_required, f.is_filterable, f.is_sortable, f.is_searchable,
           f.is_read_only, f.is_computed, f.compute_mode, f.compute_expr,
           f.validation, f.reference_config, f.sort_order, v_su
    FROM control.entity_version ev
    JOIN control.entity e ON e.id = ev.entity_id
    CROSS JOIN (VALUES
        ('code_id',      'code_id',      'Code Record', 'uuid',    'reference', 'one',         'standard', true,  false, false, false, true,  false, NULL::text, NULL::jsonb, NULL::jsonb, NULL::jsonb, 170),
        ('confidence',   'confidence',   'Confidence',  'decimal', 'number',    'zero_or_one', 'standard', false, true,  true,  false, false, false, NULL::text, NULL::jsonb, '{"min":0,"max":100}'::jsonb, NULL::jsonb, 180),
        ('provenance',   'provenance',   'Provenance',  'string',  'text',      'one',         'standard', true,  true,  true,  true,  false, false, NULL::text, NULL::jsonb, NULL::jsonb, NULL::jsonb, 190),
        ('description',  'description',  'Description', 'text',    'textarea',  'zero_or_one', 'standard', false, false, false, true,  false, false, NULL::text, NULL::jsonb, NULL::jsonb, NULL::jsonb, 200),
        ('status',       'status',       'Status',      'lifecycle_state','select','one',      'standard', true,  true,  true,  false, false, false, NULL::text, NULL::jsonb, NULL::jsonb, NULL::jsonb, 210),
        ('system_code',  'system_code',  'Code',        'string',  'text',      'zero_or_one', 'system',   false, false, false, false, true,  true,  'api', '{"source":"records.enrichment","from":"code_id"}'::jsonb, NULL::jsonb, NULL::jsonb, 220),
        ('system_name',  'system_name',  'Code Name',   'string',  'text',      'zero_or_one', 'system',   false, false, false, false, true,  true,  'api', '{"source":"records.enrichment","from":"code_id"}'::jsonb, NULL::jsonb, NULL::jsonb, 230),
        ('system_label', 'system_label', 'Code Label',  'string',  'text',      'zero_or_one', 'system',   false, false, false, false, true,  true,  'api', '{"source":"records.enrichment","from":"code_id"}'::jsonb, NULL::jsonb, NULL::jsonb, 240)
    ) AS f(name, column_name, label, data_type, ui_type, cardinality, origin, is_required,
           is_filterable, is_sortable, is_searchable, is_read_only, is_computed,
           compute_mode, compute_expr, validation, reference_config, sort_order)
    WHERE e.entity_code = 'commodity_classification'
      AND e.tenant_id IS NULL
      AND ev.version_no = 1
    ON CONFLICT DO NOTHING;

    UPDATE control.entity
       SET display_config = COALESCE(display_config, '{}'::jsonb) || jsonb_build_object(
               'detail_renderer',    'master',
               'list_columns',       jsonb_build_array('system_code','system_name','domain_code','mapping_type','confidence','is_primary','status'),
               'search_fields',      jsonb_build_array('domain_code','mapping_type','provenance','description'),
               'default_sort_field', 'created_at',
               'default_sort_dir',   'desc',
               'default_sort_order', 'desc'
           ),
           natural_key_fields = ARRAY['owner_type','owner_id','classification_type','domain_code','code_id']
     WHERE entity_code = 'commodity_classification'
       AND tenant_id IS NULL;

    UPDATE control.entity_field ef
       SET label            = COALESCE(ref_fix.label, ef.label),
           data_type        = 'uuid',
           ui_type          = 'reference',
           validation       = COALESCE(ef.validation, ref_fix.validation),
           reference_config = ref_fix.reference_config,
           updated_at       = now(),
           updated_by       = v_su
      FROM (VALUES
        ('company_code_spend_policy'::text,          'company_code_id'::text,       NULL::text, '{"ref_entity":"company_code"}'::jsonb,        '{"target_entity":"company_code","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb),
        ('company_code_spend_policy',                'spend_category_id',           NULL,       '{"ref_entity":"spend_category"}'::jsonb,      '{"target_entity":"spend_category","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb),
        ('company_code_spend_policy',                'default_gl_account_id',       NULL,       '{"ref_entity":"gl_account"}'::jsonb,          '{"target_entity":"gl_account","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb),
        ('company_code_spend_policy',                'default_tax_group_id',        NULL,       '{"ref_entity":"tax_group"}'::jsonb,           '{"target_entity":"tax_group","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb),
        ('company_code_spend_policy',                'default_intent_id',           NULL,       '{"ref_entity":"business_intent"}'::jsonb,     '{"target_entity":"business_intent","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb),
        ('company_code_spend_policy',                'asset_class_id',              NULL,       '{"ref_entity":"asset_class"}'::jsonb,         '{"target_entity":"asset_class","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb),
        ('supplier_spend_category',                  'supplier_id',                 NULL,       '{"ref_entity":"supplier"}'::jsonb,            '{"target_entity":"supplier","target_field":"id","display_field":"supplier_code","picker":{"code_field":"supplier_code","show_code":false}}'::jsonb),
        ('supplier_spend_category',                  'spend_category_id',           NULL,       '{"ref_entity":"spend_category"}'::jsonb,      '{"target_entity":"spend_category","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb),
        ('company_code_supplier_spend_policy',       'supplier_profile_id',         NULL,       '{"ref_entity":"company_code_supplier_profile"}'::jsonb, '{"target_entity":"company_code_supplier_profile","target_field":"id","display_field":"company_code_id"}'::jsonb),
        ('company_code_supplier_spend_policy',       'spend_category_id',           NULL,       '{"ref_entity":"spend_category"}'::jsonb,      '{"target_entity":"spend_category","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb),
        ('classification_to_intent_rule',            'classification_id',           NULL,       '{"ref_entity":"spend_category"}'::jsonb,      '{"target_entity":"spend_category","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb),
        ('classification_to_intent_rule',            'resolved_intent_id',          NULL,       '{"ref_entity":"business_intent"}'::jsonb,     '{"target_entity":"business_intent","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb),
        ('commodity_to_spend_category_rule',         'spend_category_id',           NULL,       '{"ref_entity":"spend_category"}'::jsonb,      '{"target_entity":"spend_category","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb),
        ('commodity_classification',                 'owner_id',                    'Spend Category', '{"ref_entity":"spend_category"}'::jsonb, '{"target_entity":"spend_category","target_field":"id","display_field":"name","picker":{"code_field":"code","show_code":true}}'::jsonb)
      ) AS ref_fix(entity_code, field_name, label, validation, reference_config),
      control.entity_version ev2,
      control.entity e2
     WHERE ef.name = ref_fix.field_name
       AND ev2.id = ef.entity_version_id
       AND e2.id = ev2.entity_id
       AND e2.entity_code = ref_fix.entity_code
       AND e2.tenant_id IS NULL
       AND ev2.version_no = 1
       AND (
            ef.label IS DISTINCT FROM COALESCE(ref_fix.label, ef.label)
         OR ef.data_type IS DISTINCT FROM 'uuid'
         OR ef.ui_type IS DISTINCT FROM 'reference'
         OR ef.reference_config IS DISTINCT FROM ref_fix.reference_config
         OR (ef.validation IS NULL AND ref_fix.validation IS NOT NULL)
       );

    INSERT INTO control.entity_operation
        (tenant_id, entity_name, permission_code, surface, placement,
         handler_type, handler_target, is_record_required, sort_order, created_by)
    VALUES
        (NULL,'classification_to_intent_rule',    'create','LIST',  'PRIMARY', 'MODAL','create',false,10,v_su),
        (NULL,'classification_to_intent_rule',    'update','DETAIL','PRIMARY', 'MODAL','edit',  true, 20,v_su),
        (NULL,'classification_to_intent_rule',    'delete','DETAIL','OVERFLOW','MODAL','delete',true, 30,v_su),
        (NULL,'classification_to_intent_rule',    'export','LIST',  'TOOLBAR', 'API',  'export',false,40,v_su),
        (NULL,'commodity_to_spend_category_rule', 'create','LIST',  'PRIMARY', 'MODAL','create',false,10,v_su),
        (NULL,'commodity_to_spend_category_rule', 'update','DETAIL','PRIMARY', 'MODAL','edit',  true, 20,v_su),
        (NULL,'commodity_to_spend_category_rule', 'delete','DETAIL','OVERFLOW','MODAL','delete',true, 30,v_su),
        (NULL,'commodity_to_spend_category_rule', 'export','LIST',  'TOOLBAR', 'API',  'export',false,40,v_su)
    ON CONFLICT ON CONSTRAINT eo_binding_uq DO NOTHING;

    RAISE NOTICE '005_domain_registrations/300_control/001_spend_category_rule_apps: done';
END $$;
