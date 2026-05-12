-- 990_reference_picker_config.sql
-- Purpose:
--   Normalize every metadata reference field into a consistent EntityPicker
--   contract. Older seeds may only have validation.ref_entity; newer seeds may
--   have reference_config but no picker hints. This pass makes both shapes
--   produce clear chooser rows: label + code + optional description + view link.

DO $$
DECLARE
  v_updated integer := 0;
BEGIN
  WITH ref_fields AS (
    SELECT
      ef.id,
      COALESCE(ef.reference_config, '{}'::jsonb) AS rc,
      ef.validation,
      COALESCE(
        NULLIF(ef.reference_config->>'target_entity', ''),
        NULLIF(ef.reference_config->>'ref_entity', ''),
        NULLIF(ef.validation->>'ref_entity', '')
      ) AS target_entity,
      NULLIF(
        COALESCE(ef.reference_config->>'display_field', ef.validation->>'display_field'),
        ''
      ) AS existing_display_field
    FROM control.entity_field ef
    WHERE ef.is_active = true
      AND (
        ef.reference_config IS NOT NULL
        OR COALESCE(ef.validation ? 'ref_entity', false)
        OR ef.data_type = 'reference'
        OR ef.ui_type = 'entity_chooser'
      )
  ),
  target_meta AS (
    SELECT
      rf.*,
      e.id AS target_entity_id,
      e.display_config,
      e.natural_key_fields,
      ev.id AS target_version_id
    FROM ref_fields rf
    LEFT JOIN control.entity e
      ON COALESCE(e.entity_code, e.name) = rf.target_entity
     AND e.tenant_id IS NULL
    LEFT JOIN control.entity_version ev
      ON ev.entity_id = e.id
     AND ev.status = 'EFFECTIVE'
    WHERE rf.target_entity IS NOT NULL
  ),
  resolved AS (
    SELECT
      tm.id,
      tm.rc,
      tm.target_entity,
      COALESCE(NULLIF(tm.rc->>'target_field', ''), 'id') AS target_field,
      COALESCE(
        explicit_label_f.field_name,
        CASE
          WHEN tm.existing_display_field IS NOT NULL
           AND tm.existing_display_field NOT IN ('id', 'code')
           AND tm.existing_display_field IS DISTINCT FROM code_f.field_name
          THEN tm.existing_display_field
          ELSE NULL
        END,
        title_f.field_name,
        name_f.field_name,
        tm.existing_display_field,
        code_f.field_name,
        'id'
      ) AS label_field,
      code_f.field_name AS code_field,
      desc_f.field_name AS description_field,
      COALESCE(
        nav_f.field_name,
        code_f.field_name,
        tm.natural_key_fields[1],
        tm.existing_display_field,
        'id'
      ) AS navigation_field,
      tm.target_entity_id IS NOT NULL AS has_target_entity
    FROM target_meta tm
    LEFT JOIN LATERAL (
      SELECT tf.name AS field_name
      FROM control.entity_field tf
      WHERE tf.entity_version_id = tm.target_version_id
        AND tf.is_active = true
        AND tf.name = COALESCE(
          NULLIF(tm.rc->'picker'->>'label_field', ''),
          NULLIF(tm.rc->>'label_field', '')
        )
      LIMIT 1
    ) explicit_label_f ON true
    LEFT JOIN LATERAL (
      SELECT tf.name AS field_name
      FROM control.entity_field tf
      WHERE tf.entity_version_id = tm.target_version_id
        AND tf.is_active = true
        AND tf.name = NULLIF(tm.display_config->>'title_field', '')
      LIMIT 1
    ) title_f ON true
    LEFT JOIN LATERAL (
      SELECT tf.name AS field_name
      FROM control.entity_field tf
      WHERE tf.entity_version_id = tm.target_version_id
        AND tf.is_active = true
        AND tf.name = ANY (ARRAY['name','display_name','title','legal_name']::text[])
      ORDER BY array_position(ARRAY['name','display_name','title','legal_name']::text[], tf.name)
      LIMIT 1
    ) name_f ON true
    LEFT JOIN LATERAL (
      SELECT tf.name AS field_name
      FROM control.entity_field tf
      WHERE tf.entity_version_id = tm.target_version_id
        AND tf.is_active = true
        AND tf.name = ANY (ARRAY[
          NULLIF(tm.rc->'picker'->>'code_field', ''),
          NULLIF(tm.rc->>'code_field', ''),
          NULLIF(tm.display_config->>'code_field', ''),
          NULLIF(tm.display_config->'document_header'->>'number_field', ''),
          tm.natural_key_fields[1],
          'code',
          'document_no',
          'document_number',
          'number',
          'je_number'
        ]::text[])
      ORDER BY array_position(ARRAY[
          NULLIF(tm.rc->'picker'->>'code_field', ''),
          NULLIF(tm.rc->>'code_field', ''),
          NULLIF(tm.display_config->>'code_field', ''),
          NULLIF(tm.display_config->'document_header'->>'number_field', ''),
          tm.natural_key_fields[1],
          'code',
          'document_no',
          'document_number',
          'number',
          'je_number'
        ]::text[], tf.name)
      LIMIT 1
    ) code_f ON true
    LEFT JOIN LATERAL (
      SELECT tf.name AS field_name
      FROM control.entity_field tf
      WHERE tf.entity_version_id = tm.target_version_id
        AND tf.is_active = true
        AND tf.name = ANY (ARRAY[
          NULLIF(tm.rc->'picker'->>'description_field', ''),
          NULLIF(tm.rc->>'description_field', ''),
          'description',
          'account_path',
          'path',
          'display_description',
          'short_description',
          'long_description',
          'summary'
        ]::text[])
      ORDER BY array_position(ARRAY[
          NULLIF(tm.rc->'picker'->>'description_field', ''),
          NULLIF(tm.rc->>'description_field', ''),
          'description',
          'account_path',
          'path',
          'display_description',
          'short_description',
          'long_description',
          'summary'
        ]::text[], tf.name)
      LIMIT 1
    ) desc_f ON true
    LEFT JOIN LATERAL (
      SELECT tf.name AS field_name
      FROM control.entity_field tf
      WHERE tf.entity_version_id = tm.target_version_id
        AND tf.is_active = true
        AND tf.name = ANY (ARRAY[
          NULLIF(tm.rc->'picker'->>'navigation_field', ''),
          NULLIF(tm.rc->'picker'->>'record_id_field', ''),
          NULLIF(tm.rc->>'navigation_field', ''),
          NULLIF(tm.rc->>'record_id_field', ''),
          NULLIF(tm.display_config->>'code_field', ''),
          NULLIF(tm.display_config->'document_header'->>'number_field', ''),
          tm.natural_key_fields[1],
          'code',
          'document_no',
          'document_number',
          'number',
          'je_number'
        ]::text[])
      ORDER BY array_position(ARRAY[
          NULLIF(tm.rc->'picker'->>'navigation_field', ''),
          NULLIF(tm.rc->'picker'->>'record_id_field', ''),
          NULLIF(tm.rc->>'navigation_field', ''),
          NULLIF(tm.rc->>'record_id_field', ''),
          NULLIF(tm.display_config->>'code_field', ''),
          NULLIF(tm.display_config->'document_header'->>'number_field', ''),
          tm.natural_key_fields[1],
          'code',
          'document_no',
          'document_number',
          'number',
          'je_number'
        ]::text[], tf.name)
      LIMIT 1
    ) nav_f ON true
  ),
  next_config AS (
    SELECT
      id,
      jsonb_strip_nulls(
        rc
        || jsonb_build_object(
          'target_entity', target_entity,
          'target_field', target_field,
          'display_field', label_field,
          'picker',
            jsonb_strip_nulls(jsonb_build_object(
              'label_field', label_field,
              'code_field', code_field,
              'description_field', description_field,
              'navigation_field', navigation_field,
              'show_code', code_field IS NOT NULL,
              'show_description', description_field IS NOT NULL,
              'show_view_action', has_target_entity
            ))
            || CASE
              WHEN target_entity = 'gl_account' THEN
                jsonb_build_object(
                  'variant', 'advanced',
                  'density', 'mini',
                  'width', 390,
                  'max_list_height', 220,
                  'option_action_label', 'Open GL account',
                  'result_label', 'gl account',
                  'show_recently_used', true,
                  'recent_limit', 5,
                  'controls', jsonb_build_array(
                    jsonb_build_object('id','all','label','All','value','all'),
                    jsonb_build_object('id','asset','label','Asset','value','asset','field','account_class','match_value','asset'),
                    jsonb_build_object('id','liability','label','Liability','value','liability','field','account_class','match_value','liability'),
                    jsonb_build_object('id','expense','label','Expense','value','expense','field','account_class','match_value','expense'),
                    jsonb_build_object('id','income','label','Income','value','income','field','account_class','match_value','income')
                  ),
                  'sections', jsonb_build_array(
                    jsonb_build_object('id','matches','label','All matches')
                  ),
                  'badges', jsonb_build_array(
                    jsonb_build_object(
                      'field','normal_balance',
                      'label_map', jsonb_build_object('debit','Dr','credit','Cr'),
                      'tone_map', jsonb_build_object('debit','success','credit','destructive')
                    )
                  )
                )
              WHEN target_entity = 'supplier' THEN
                jsonb_build_object(
                  'variant', 'advanced',
                  'density', 'mini',
                  'width', 440,
                  'max_list_height', 240,
                  'option_action_label', 'Open supplier',
                  'result_label', 'supplier',
                  'show_recently_used', true,
                  'recent_limit', 5,
                  'default_control', 'active',
                  'controls', jsonb_build_array(
                    jsonb_build_object('id','all',        'label','All',        'value','all'),
                    jsonb_build_object('id','active',     'label','Active',     'value','active',     'field','status','match_value','active'),
                    jsonb_build_object('id','on_hold',    'label','On Hold',    'value','on_hold',    'field','status','match_value','on_hold'),
                    jsonb_build_object('id','suspended',  'label','Suspended',  'value','suspended',  'field','status','match_value','suspended'),
                    jsonb_build_object('id','onboarding', 'label','Onboarding','value','onboarding', 'field','status','match_value','onboarding')
                  ),
                  'sections', jsonb_build_array(
                    jsonb_build_object('id','matches','label','All matches')
                  ),
                  'badges', jsonb_build_array(
                    jsonb_build_object(
                      'field','status',
                      'label_map', jsonb_build_object(
                        'active','Active','onboarding','Onboarding','on_hold','On Hold',
                        'suspended','Suspended','inactive','Inactive','archived','Archived'
                      ),
                      'tone_map', jsonb_build_object(
                        'active','success','onboarding','secondary','on_hold','warning',
                        'suspended','destructive','inactive','muted','archived','muted'
                      )
                    )
                  )
                )
              WHEN target_entity = 'customer' THEN
                jsonb_build_object(
                  'variant', 'advanced',
                  'density', 'mini',
                  'width', 440,
                  'max_list_height', 240,
                  'option_action_label', 'Open customer',
                  'result_label', 'customer',
                  'show_recently_used', true,
                  'recent_limit', 5,
                  'default_control', 'active',
                  'controls', jsonb_build_array(
                    jsonb_build_object('id','all',          'label','All',          'value','all'),
                    jsonb_build_object('id','active',       'label','Active',       'value','active',       'field','status','match_value','active'),
                    jsonb_build_object('id','on_hold',      'label','On Hold',      'value','on_hold',      'field','status','match_value','on_hold'),
                    jsonb_build_object('id','credit_hold',  'label','Credit Hold',  'value','credit_hold',  'field','status','match_value','credit_hold'),
                    jsonb_build_object('id','prospect',     'label','Prospect',     'value','prospect',     'field','status','match_value','prospect')
                  ),
                  'sections', jsonb_build_array(
                    jsonb_build_object('id','matches','label','All matches')
                  ),
                  'badges', jsonb_build_array(
                    jsonb_build_object(
                      'field','status',
                      'label_map', jsonb_build_object(
                        'active','Active','prospect','Prospect','on_hold','On Hold',
                        'credit_hold','Credit Hold','inactive','Inactive','archived','Archived'
                      ),
                      'tone_map', jsonb_build_object(
                        'active','success','prospect','secondary','on_hold','warning',
                        'credit_hold','destructive','inactive','muted','archived','muted'
                      )
                    )
                  )
                )
              WHEN target_entity = 'cost_center' THEN
                jsonb_build_object(
                  'variant', 'advanced',
                  'density', 'mini',
                  'width', 360,
                  'max_list_height', 220,
                  'option_action_label', 'Open cost centre',
                  'result_label', 'cost centre',
                  'show_recently_used', true,
                  'recent_limit', 5,
                  'default_control', 'active',
                  'controls', jsonb_build_array(
                    jsonb_build_object('id','all',      'label','All',      'value','all'),
                    jsonb_build_object('id','active',   'label','Active',   'value','active',   'field','status','match_value','active'),
                    jsonb_build_object('id','inactive', 'label','Inactive', 'value','inactive', 'field','status','match_value','inactive'),
                    jsonb_build_object('id','draft',    'label','Draft',    'value','draft',    'field','status','match_value','draft')
                  ),
                  'sections', jsonb_build_array(
                    jsonb_build_object('id','matches','label','All matches')
                  ),
                  'badges', jsonb_build_array(
                    jsonb_build_object(
                      'field','status',
                      'label_map', jsonb_build_object(
                        'active','Active','inactive','Inactive','draft','Draft'
                      ),
                      'tone_map', jsonb_build_object(
                        'active','success','inactive','muted','draft','secondary'
                      )
                    )
                  )
                )
              WHEN target_entity = 'project' THEN
                jsonb_build_object(
                  'variant', 'advanced',
                  'density', 'mini',
                  'width', 380,
                  'max_list_height', 240,
                  'option_action_label', 'Open project',
                  'result_label', 'project',
                  'show_recently_used', true,
                  'recent_limit', 5,
                  'default_control', 'active',
                  'controls', jsonb_build_array(
                    jsonb_build_object('id','all',         'label','All',         'value','all'),
                    jsonb_build_object('id','active',      'label','Active',      'value','active',      'field','status','match_value','active'),
                    jsonb_build_object('id','in_progress', 'label','In Progress', 'value','in_progress', 'field','status','match_value','in_progress'),
                    jsonb_build_object('id','on_hold',     'label','On Hold',     'value','on_hold',     'field','status','match_value','on_hold'),
                    jsonb_build_object('id','completed',   'label','Completed',   'value','completed',   'field','status','match_value','completed')
                  ),
                  'sections', jsonb_build_array(
                    jsonb_build_object('id','matches','label','All matches')
                  ),
                  'badges', jsonb_build_array(
                    jsonb_build_object(
                      'field','status',
                      'label_map', jsonb_build_object(
                        'active','Active','in_progress','In Progress','on_hold','On Hold',
                        'completed','Completed','draft','Draft','closed','Closed'
                      ),
                      'tone_map', jsonb_build_object(
                        'active','success','in_progress','secondary','on_hold','warning',
                        'completed','muted','draft','muted','closed','muted'
                      )
                    )
                  )
                )
              WHEN target_entity = 'spend_category' THEN
                jsonb_build_object(
                  'variant', 'advanced',
                  'density', 'mini',
                  'width', 400,
                  'max_list_height', 240,
                  'option_action_label', 'Open spend category',
                  'result_label', 'spend category',
                  'show_recently_used', true,
                  'recent_limit', 5,
                  'default_control', 'active',
                  'controls', jsonb_build_array(
                    jsonb_build_object('id','all',       'label','All',       'value','all'),
                    jsonb_build_object('id','active',    'label','Active',    'value','active',   'field','status','match_value','active'),
                    jsonb_build_object('id','inactive',  'label','Inactive',  'value','inactive', 'field','status','match_value','inactive')
                  ),
                  'sections', jsonb_build_array(
                    jsonb_build_object('id','matches','label','All matches')
                  ),
                  'badges', jsonb_build_array(
                    jsonb_build_object(
                      'field','status',
                      'label_map', jsonb_build_object('active','Active','inactive','Inactive'),
                      'tone_map',  jsonb_build_object('active','success','inactive','muted')
                    ),
                    jsonb_build_object(
                      'field','procurement_type',
                      'label_map', jsonb_build_object('goods','Goods','services','Services'),
                      'tone_map',  jsonb_build_object('goods','secondary','services','muted')
                    )
                  )
                )
              WHEN target_entity = 'business_intent' THEN
                jsonb_build_object(
                  'variant', 'advanced',
                  'density', 'mini',
                  'width', 420,
                  'max_list_height', 240,
                  'option_action_label', 'Open business intent',
                  'result_label', 'business intent',
                  'show_recently_used', true,
                  'recent_limit', 5,
                  'default_control', 'active',
                  'controls', jsonb_build_array(
                    jsonb_build_object('id','all',      'label','All',      'value','all'),
                    jsonb_build_object('id','active',   'label','Active',   'value','active',   'field','status','match_value','active'),
                    jsonb_build_object('id','inactive', 'label','Inactive', 'value','inactive', 'field','status','match_value','inactive')
                  ),
                  'sections', jsonb_build_array(
                    jsonb_build_object('id','matches','label','All matches')
                  ),
                  'badges', jsonb_build_array(
                    jsonb_build_object(
                      'field','status',
                      'label_map', jsonb_build_object('active','Active','inactive','Inactive'),
                      'tone_map',  jsonb_build_object('active','success','inactive','muted')
                    ),
                    jsonb_build_object(
                      'field','domain',
                      'label_map', jsonb_build_object(
                        'OPEX','OpEx','CAPEX','CapEx','COST_OF_SALES','COGS',
                        'ADMIN','Admin','REGULATORY','Reg.','TRANSFER','Transfer'
                      ),
                      'tone_map', jsonb_build_object(
                        'OPEX','secondary','CAPEX','warning','COST_OF_SALES','muted',
                        'ADMIN','muted','REGULATORY','destructive','TRANSFER','muted'
                      )
                    )
                  )
                )
              WHEN target_entity = 'item' THEN
                jsonb_build_object(
                  'variant', 'advanced',
                  'density', 'mini',
                  'width', 400,
                  'max_list_height', 240,
                  'option_action_label', 'Open item',
                  'result_label', 'item',
                  'show_recently_used', true,
                  'recent_limit', 5,
                  'default_control', 'active',
                  'controls', jsonb_build_array(
                    jsonb_build_object('id','all',      'label','All',      'value','all'),
                    jsonb_build_object('id','active',   'label','Active',   'value','active',   'field','status','match_value','active'),
                    jsonb_build_object('id','inactive', 'label','Inactive', 'value','inactive', 'field','status','match_value','inactive'),
                    jsonb_build_object('id','archived', 'label','Archived', 'value','archived', 'field','status','match_value','archived')
                  ),
                  'sections', jsonb_build_array(
                    jsonb_build_object('id','matches','label','All matches')
                  ),
                  'badges', jsonb_build_array(
                    jsonb_build_object(
                      'field','status',
                      'label_map', jsonb_build_object(
                        'active','Active','inactive','Inactive','archived','Archived'
                      ),
                      'tone_map', jsonb_build_object(
                        'active','success','inactive','muted','archived','muted'
                      )
                    )
                  )
                )
              ELSE '{}'::jsonb
            END
            || COALESCE(rc->'picker', '{}'::jsonb)
        )
      ) AS reference_config
    FROM resolved
  )
  UPDATE control.entity_field ef
     SET reference_config = nc.reference_config
    FROM next_config nc
   WHERE ef.id = nc.id
     AND ef.reference_config IS DISTINCT FROM nc.reference_config;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE '990 reference picker config normalized (% rows updated)', v_updated;
END $$;
