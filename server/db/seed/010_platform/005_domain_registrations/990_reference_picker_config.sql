-- 990_reference_picker_config.sql
-- Purpose:
--   Normalize every metadata reference target into a consistent EntityPicker
--   profile on control.entity.display_config.reference_picker, then compact
--   field-level reference_config down to target_entity plus real overrides.
--   Older seeds may still provide validation.ref_entity; this pass consumes it
--   for compatibility and reports it as legacy metadata.

DO $$
DECLARE
  v_profiles_updated integer := 0;
  v_fields_updated integer := 0;
  v_legacy_ref_entity integer := 0;
  v_repeated_picker_blobs integer := 0;
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
      e.identity_config,
      ARRAY(
        SELECT jsonb_array_elements_text(
          CASE
            WHEN jsonb_typeof(COALESCE(e.identity_config, '{}'::jsonb)->'natural_key_fields') = 'array'
            THEN COALESCE(e.identity_config, '{}'::jsonb)->'natural_key_fields'
            ELSE '[]'::jsonb
          END
        )
      ) AS natural_key_fields,
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
      tm.target_entity_id,
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
      parent_f.field_name AS tree_parent_field,
      level_f.field_name AS tree_level_field,
      sort_f.field_name AS tree_sort_field,
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
    LEFT JOIN LATERAL (
      SELECT tf.name AS field_name
      FROM control.entity_field tf
      WHERE tf.entity_version_id = tm.target_version_id
        AND tf.is_active = true
        AND tf.name = ANY (ARRAY[
          NULLIF(tm.rc->'picker'->'tree'->>'parent_field', ''),
          NULLIF(tm.rc->'picker'->'tree'->>'parentField', ''),
          NULLIF(tm.rc->'picker'->'hierarchy'->>'parent_field', ''),
          NULLIF(tm.rc->'picker'->'hierarchy'->>'parentField', ''),
          'parent_id',
          'parent_entity_id',
          'parent_company_code_id',
          'parent_project_id',
          'parent_item_id',
          'parent_asset_id',
          'parent_site_id'
        ]::text[])
      ORDER BY array_position(ARRAY[
          NULLIF(tm.rc->'picker'->'tree'->>'parent_field', ''),
          NULLIF(tm.rc->'picker'->'tree'->>'parentField', ''),
          NULLIF(tm.rc->'picker'->'hierarchy'->>'parent_field', ''),
          NULLIF(tm.rc->'picker'->'hierarchy'->>'parentField', ''),
          'parent_id',
          'parent_entity_id',
          'parent_company_code_id',
          'parent_project_id',
          'parent_item_id',
          'parent_asset_id',
          'parent_site_id'
        ]::text[], tf.name)
      LIMIT 1
    ) parent_f ON true
    LEFT JOIN LATERAL (
      SELECT tf.name AS field_name
      FROM control.entity_field tf
      WHERE tf.entity_version_id = tm.target_version_id
        AND tf.is_active = true
        AND tf.name = ANY (ARRAY[
          NULLIF(tm.rc->'picker'->'tree'->>'level_field', ''),
          NULLIF(tm.rc->'picker'->'tree'->>'levelField', ''),
          'level_no',
          'level',
          'depth'
        ]::text[])
      ORDER BY array_position(ARRAY[
          NULLIF(tm.rc->'picker'->'tree'->>'level_field', ''),
          NULLIF(tm.rc->'picker'->'tree'->>'levelField', ''),
          'level_no',
          'level',
          'depth'
        ]::text[], tf.name)
      LIMIT 1
    ) level_f ON true
    LEFT JOIN LATERAL (
      SELECT tf.name AS field_name
      FROM control.entity_field tf
      WHERE tf.entity_version_id = tm.target_version_id
        AND tf.is_active = true
        AND tf.name = ANY (ARRAY[
          NULLIF(tm.rc->'picker'->'tree'->>'sort_field', ''),
          NULLIF(tm.rc->'picker'->'tree'->>'sortField', ''),
          'sort_order',
          code_f.field_name,
          title_f.field_name,
          name_f.field_name
        ]::text[])
      ORDER BY array_position(ARRAY[
          NULLIF(tm.rc->'picker'->'tree'->>'sort_field', ''),
          NULLIF(tm.rc->'picker'->'tree'->>'sortField', ''),
          'sort_order',
          code_f.field_name,
          title_f.field_name,
          name_f.field_name
        ]::text[], tf.name)
      LIMIT 1
    ) sort_f ON true
  ),
  full_config AS (
    SELECT
      id,
      target_entity,
      target_field,
      rc,
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
                  'width', 420,
                  'max_list_height', 320,
                  'page_size', 20,
                  'default_search_mode', 'server',
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
              WHEN target_entity = 'company_code' THEN
                jsonb_build_object(
                  'label_template', '{name} - {code}',
                  'show_code', false
                )
              WHEN target_entity = 'supplier' THEN
                jsonb_build_object(
                  'variant', 'advanced',
                  'density', 'mini',
                  'width', 420,
                  'max_list_height', 320,
                  'page_size', 20,
                  'default_search_mode', 'server',
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
                  'width', 420,
                  'max_list_height', 320,
                  'page_size', 20,
                  'default_search_mode', 'server',
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
                  'width', 420,
                  'max_list_height', 320,
                  'page_size', 20,
                  'default_search_mode', 'server',
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
                  'width', 420,
                  'max_list_height', 320,
                  'page_size', 20,
                  'default_search_mode', 'server',
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
              WHEN target_entity = 'commodity_category' THEN
                jsonb_build_object(
                  'variant', 'advanced',
                  'density', 'mini',
                  'width', 420,
                  'max_list_height', 320,
                  'page_size', 20,
                  'default_search_mode', 'server',
                  'option_action_label', 'Open category',
                  'result_label', 'category',
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
                      'field','buy_allowed',
                      'label_map', jsonb_build_object('true','Buy','false','No buy'),
                      'tone_map',  jsonb_build_object('true','secondary','false','muted')
                    )
                  )
                )
              WHEN target_entity = 'business_intent' THEN
                jsonb_build_object(
                  'variant', 'advanced',
                  'density', 'mini',
                  'width', 420,
                  'max_list_height', 320,
                  'page_size', 20,
                  'default_search_mode', 'server',
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
                  'width', 420,
                  'max_list_height', 320,
                  'page_size', 20,
                  'default_search_mode', 'server',
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
            || (COALESCE(rc->'picker', '{}'::jsonb) - 'tree')
            || CASE
              WHEN tree_parent_field IS NOT NULL OR COALESCE(rc->'picker', '{}'::jsonb) ? 'tree' THEN
                jsonb_build_object(
                  'tree',
                  jsonb_strip_nulls(
                    CASE
                      WHEN tree_parent_field IS NOT NULL THEN
                        jsonb_build_object(
                          'enabled', true,
                          'default_enabled', false,
                          'value_field', 'id',
                          'parent_field', tree_parent_field,
                          'level_field', tree_level_field,
                          'sort_field', tree_sort_field,
                          'min_records', 500
                        )
                      ELSE '{}'::jsonb
                    END
                    || COALESCE(rc->'picker'->'tree', '{}'::jsonb)
                  )
                )
              ELSE '{}'::jsonb
            END
        )
      ) AS reference_config
    FROM resolved
  ),
  picker_profiles AS (
    SELECT DISTINCT ON (fc.target_entity)
      fc.target_entity,
      r.target_entity_id,
      COALESCE(fc.reference_config->'picker', '{}'::jsonb) AS reference_picker
    FROM full_config fc
    JOIN resolved r
      ON r.id = fc.id
    WHERE r.target_entity_id IS NOT NULL
    ORDER BY fc.target_entity, CASE WHEN fc.rc ? 'picker' THEN 1 ELSE 0 END, fc.id
  ),
  profile_updates AS (
    UPDATE control.entity e
       SET display_config = jsonb_set(
         COALESCE(e.display_config, '{}'::jsonb),
         '{reference_picker}',
         pp.reference_picker,
         true
       )
      FROM picker_profiles pp
     WHERE e.id = pp.target_entity_id
       AND COALESCE(e.display_config, '{}'::jsonb)->'reference_picker' IS DISTINCT FROM pp.reference_picker
     RETURNING e.id
  ),
  next_config AS (
    SELECT
      fc.id,
      jsonb_strip_nulls(
        jsonb_build_object('target_entity', fc.target_entity)
        || CASE
          WHEN fc.target_field IS NOT NULL AND fc.target_field <> 'id' THEN
            jsonb_build_object('target_field', fc.target_field)
          ELSE '{}'::jsonb
        END
        || CASE
          WHEN NULLIF(fc.reference_config->>'display_field', '') IS NOT NULL
           AND NULLIF(fc.reference_config->>'display_field', '') IS DISTINCT FROM NULLIF(pp.reference_picker->>'label_field', '')
          THEN jsonb_build_object('display_field', fc.reference_config->>'display_field')
          ELSE '{}'::jsonb
        END
        || (
          ((((((((((((COALESCE(fc.rc, '{}'::jsonb)
            - 'ref_entity') - 'target_entity') - 'target_field') - 'display_field')
            - 'label_field') - 'code_field') - 'description_field') - 'navigation_field')
            - 'record_id_field') - 'show_code') - 'show_description') - 'show_view_action') - 'picker'
        )
        || CASE
          WHEN picker_override.picker <> '{}'::jsonb THEN jsonb_build_object('picker', picker_override.picker)
          ELSE '{}'::jsonb
        END
      ) AS reference_config
    FROM full_config fc
    LEFT JOIN picker_profiles pp
      ON pp.target_entity = fc.target_entity
    CROSS JOIN LATERAL (
      SELECT COALESCE(jsonb_object_agg(pe.key, pe.value), '{}'::jsonb) AS picker
      FROM jsonb_each(COALESCE(fc.reference_config->'picker', '{}'::jsonb)) AS pe(key, value)
      WHERE NOT (COALESCE(pp.reference_picker, '{}'::jsonb) ? pe.key)
         OR COALESCE(pp.reference_picker, '{}'::jsonb)->pe.key IS DISTINCT FROM pe.value
    ) picker_override
  ),
  field_updates AS (
    UPDATE control.entity_field ef
       SET reference_config = nc.reference_config
      FROM next_config nc
     WHERE ef.id = nc.id
       AND ef.reference_config IS DISTINCT FROM nc.reference_config
     RETURNING ef.id
  )
  SELECT
    (SELECT COUNT(*) FROM profile_updates),
    (SELECT COUNT(*) FROM field_updates)
    INTO v_profiles_updated, v_fields_updated;

  SELECT COUNT(*)
    INTO v_legacy_ref_entity
    FROM control.entity_field ef
   WHERE ef.is_active = true
     AND COALESCE(ef.validation ? 'ref_entity', false);

  SELECT COUNT(*)
    INTO v_repeated_picker_blobs
    FROM control.entity_field ef
    JOIN control.entity e
      ON COALESCE(e.entity_code, e.name) = ef.reference_config->>'target_entity'
     AND e.tenant_id IS NULL
   WHERE ef.is_active = true
     AND ef.reference_config ? 'picker'
     AND COALESCE(e.display_config, '{}'::jsonb) ? 'reference_picker'
     AND ef.reference_config->'picker' = COALESCE(e.display_config, '{}'::jsonb)->'reference_picker';

  RAISE NOTICE '990 reference picker config normalized (% target profiles updated, % field configs compacted)', v_profiles_updated, v_fields_updated;

  IF v_legacy_ref_entity > 0 THEN
    RAISE WARNING '990 reference metadata audit: % active fields still use legacy validation.ref_entity; migrate these to reference_config.target_entity and keep validation validation-only', v_legacy_ref_entity;
  END IF;

  IF v_repeated_picker_blobs > 0 THEN
    RAISE WARNING '990 reference metadata audit: % active fields still repeat the target reference_picker blob; keep only field-specific overrides', v_repeated_picker_blobs;
  END IF;
END $$;
