-- Finance Setup Phase 2, Stage A metadata and lifecycle hardening.

DO $$
DECLARE
    v_system uuid := '00000000-0000-0000-0000-000000000000';
    v_fx_version uuid;
    v_bank_interface_version uuid;
    v_tax_group_version uuid;
BEGIN
    -- Ensure the new governed FX policy participates in the metadata graph.
    INSERT INTO control.entity_version (
        entity_id, tenant_id, version_no, status, label, change_type, effective_from, created_by
    )
    SELECT e.id, NULL, 1, 'EFFECTIVE', 'Initial version', 'structural', now(), v_system
      FROM control.entity e
     WHERE e.tenant_id IS NULL AND e.entity_code = 'fx_policy'
    ON CONFLICT (entity_id, version_no) DO NOTHING;

    SELECT ev.id INTO v_fx_version
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.tenant_id IS NULL AND e.entity_code = 'fx_policy'
       AND ev.status = 'EFFECTIVE'
     ORDER BY ev.version_no DESC LIMIT 1;

    IF v_fx_version IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, validation, sort_order, created_by, enum_config
        )
        SELECT v_fx_version, f.name, f.column_name, f.label, f.data_type, f.ui_type,
               'one', 'standard', f.is_required, f.is_filterable, f.is_sortable,
               false, f.validation, f.sort_order, v_system,
               CASE
                 WHEN f.name IN ('default_rate_type','revaluation_rate_type') THEN
                   '{"values":[{"value":"SPOT","label":"Spot"},{"value":"PERIOD_AVG","label":"Period Average"},{"value":"PERIOD_END","label":"Period End"},{"value":"BUDGET","label":"Budget"},{"value":"CONTRACTED","label":"Contracted"},{"value":"HISTORICAL","label":"Historical"}]}'::jsonb
                 WHEN f.name = 'missing_rate_behavior' THEN
                   '{"values":[{"value":"block","label":"Block"},{"value":"manual_with_approval","label":"Manual with Approval"},{"value":"fallback","label":"Fallback"}]}'::jsonb
                 ELSE NULL::jsonb
               END
          FROM (VALUES
            ('company_code_id','company_code_id','Company Code','uuid','reference',false,true,false,'{"ref_entity":"company_code"}'::jsonb,110),
            ('ledger_book_id','ledger_book_id','Ledger Book','uuid','reference',false,true,false,'{"ref_entity":"ledger_book"}'::jsonb,120),
            ('transaction_context','transaction_context','Transaction Context','string','text',true,true,true,NULL::jsonb,130),
            ('effective_from','effective_from','Effective From','date','date',true,true,true,NULL::jsonb,140),
            ('effective_to','effective_to','Effective To','date','date',false,true,true,NULL::jsonb,150),
            ('priority','priority','Priority','integer','number',true,true,true,NULL::jsonb,160),
            ('default_rate_type','default_rate_type','Default Rate Type','enum','select',true,true,true,NULL::jsonb,170),
            ('revaluation_rate_type','revaluation_rate_type','Revaluation Rate Type','enum','select',true,true,true,NULL::jsonb,180),
            ('pivot_currency_code','pivot_currency_code','Pivot Currency','string','text',false,true,true,NULL::jsonb,190),
            ('allow_inverse','allow_inverse','Allow Inverse','boolean','checkbox',true,true,true,NULL::jsonb,200),
            ('allow_triangulation','allow_triangulation','Allow Triangulation','boolean','checkbox',true,true,true,NULL::jsonb,210),
            ('preferred_sources','preferred_sources','Preferred Sources','json','json',true,false,false,NULL::jsonb,220),
            ('maximum_rate_age_days','maximum_rate_age_days','Maximum Rate Age','integer','number',false,true,true,NULL::jsonb,230),
            ('missing_rate_behavior','missing_rate_behavior','Missing Rate Behavior','enum','select',true,true,true,NULL::jsonb,240),
            ('allow_manual_override','manual_override_allowed','Manual Override Allowed','boolean','checkbox',true,true,true,NULL::jsonb,250),
            ('requires_manual_override_approval','manual_override_approval_required','Manual Approval Required','boolean','checkbox',true,true,true,NULL::jsonb,260),
            ('is_auto_reverse_revaluation','auto_reverse_revaluation','Auto-reverse Revaluation','boolean','checkbox',true,true,true,NULL::jsonb,270),
            ('version_no','version_no','Version','integer','number',true,true,true,NULL::jsonb,280),
            ('supersedes_id','supersedes_id','Supersedes Policy','uuid','reference',false,false,false,'{"ref_entity":"fx_policy"}'::jsonb,290),
            ('status','status','Status','string','text',true,true,true,NULL::jsonb,300)
          ) f(name,column_name,label,data_type,ui_type,is_required,is_filterable,is_sortable,validation,sort_order)
        ON CONFLICT DO NOTHING;
    END IF;

    SELECT ev.id INTO v_bank_interface_version
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.tenant_id IS NULL AND e.entity_code = 'bank_interface_profile'
       AND ev.status = 'EFFECTIVE'
     ORDER BY ev.version_no DESC LIMIT 1;

    IF v_bank_interface_version IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, is_read_only, editability, sort_order, created_by,
            enum_config
        )
        SELECT v_bank_interface_version, f.name, f.name, f.label, f.data_type, f.ui_type,
               'one', 'system', false, f.is_filterable, f.is_sortable,
               false, true, '{"reason":"governed_secret_provider_command_required"}'::jsonb,
               f.sort_order, v_system,
               CASE WHEN f.name = 'credential_status' THEN
                 '{"values":[{"value":"not_configured","label":"Not Configured"},{"value":"configured","label":"Configured"},{"value":"validation_failed","label":"Validation Failed"},{"value":"rotation_required","label":"Rotation Required"},{"value":"revoked","label":"Revoked"}]}'::jsonb
               ELSE NULL::jsonb END
          FROM (VALUES
            ('credential_provider','Credential Provider','string','hidden',false,false,260),
            ('credential_reference','Credential Reference','string','hidden',false,false,270),
            ('credential_version','Credential Version','string','text',false,false,280),
            ('credential_status','Credential Status','enum','select',true,true,290),
            ('credential_last_validated_at','Credential Last Validated','timestamptz','datetime',true,true,300),
            ('credential_rotated_at','Credential Rotated','timestamptz','datetime',true,true,310)
          ) f(name,label,data_type,ui_type,is_filterable,is_sortable,sort_order)
        ON CONFLICT DO NOTHING;
    END IF;

    SELECT ev.id INTO v_tax_group_version
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.tenant_id IS NULL AND e.entity_code = 'tax_group'
       AND ev.status = 'EFFECTIVE'
     ORDER BY ev.version_no DESC LIMIT 1;

    IF v_tax_group_version IS NOT NULL THEN
        INSERT INTO control.entity_field (
            entity_version_id, name, column_name, label, data_type, ui_type,
            cardinality, origin, is_required, is_filterable, is_sortable,
            is_searchable, validation, sort_order, created_by
        ) VALUES (
            v_tax_group_version, 'rounding_rule_id', 'rounding_rule_id', 'Rounding Rule',
            'uuid', 'reference', 'one', 'standard', false, true, false, false,
            '{"ref_entity":"rounding_rule"}'::jsonb, 175, v_system
        ) ON CONFLICT DO NOTHING;
    END IF;

    UPDATE control.entity e
       SET feature_flags = coalesce(e.feature_flags, '{}'::jsonb) || contract.flags,
           display_config = coalesce(e.display_config, '{}'::jsonb) || contract.display,
           updated_at = now(), updated_by = v_system
      FROM (VALUES
        ('fx_rate',
         '{"lifecycle_class":"versioned_reference_data","generic_update":false,"allow_generic_update":false,"allow_generic_delete":false,"replacement_command_required":true,"is_importable":true,"event_history":true}'::jsonb,
         '{"title_field":"from_currency","subtitle_field":"to_currency","list_columns":["from_currency","to_currency","rate","rate_type","effective_date","effective_time","source","status"]}'::jsonb),
        ('fx_policy',
         '{"aggregate_owned":true,"lifecycle_class":"effective_policy","generic_write":false,"allow_generic_create":false,"allow_generic_update":false,"allow_generic_delete":false,"replacement_command_required":true}'::jsonb,
         '{"title_field":"transaction_context","subtitle_field":"company_code_id","list_columns":["company_code_id","ledger_book_id","transaction_context","effective_from","effective_to","version_no","status"]}'::jsonb),
        ('bank_account_link',
         '{"aggregate_owned":true,"lifecycle_class":"temporal_link","deletion_mode":"prohibited","temporal_close_action":"end_date","allow_generic_delete":false,"allow_generic_retire":false}'::jsonb,
         '{"title_field":"bank_account_id","subtitle_field":"purpose","list_columns":["owner_type","owner_id","company_code_id","bank_account_id","purpose","effective_from","effective_until"]}'::jsonb),
        ('bank_interface_profile',
         '{"aggregate_owned":true,"credential_storage":"platform_secret_provider","generic_secret_edit":false}'::jsonb,
         '{"title_field":"name","subtitle_field":"code","list_columns":["code","name","interface_type","provider_code","credential_status","credential_last_validated_at","status"]}'::jsonb),
        ('tax_group',
         '{"aggregate_owned":true,"rounding_owner":true}'::jsonb,
         '{"title_field":"name","subtitle_field":"code","list_columns":["code","name","jurisdiction_id","rounding_rule_id","status"]}'::jsonb)
      ) contract(entity_code, flags, display)
     WHERE e.tenant_id IS NULL AND e.entity_code = contract.entity_code;

    -- bank_account_link has an effective-date lifecycle only. Remove every
    -- generic destructive action even if an earlier seed inferred one.
    DELETE FROM control.entity_operation eo
     WHERE eo.tenant_id IS NULL
       AND eo.entity_name = 'bank_account_link'
       AND lower(coalesce(eo.operation_code, eo.permission_code)) IN ('delete','retire','cancel','deactivate');

    -- FX policy is a read-only projection in the generic Entity runtime. All
    -- mutations flow through the governed append-only policy command.
    DELETE FROM control.entity_operation eo
     WHERE eo.tenant_id IS NULL
       AND eo.entity_name = 'fx_policy';

    UPDATE control.entity_field ef
       SET is_read_only = true,
           editability = coalesce(ef.editability, '{}'::jsonb)
             || '{"reason":"governed_fx_policy_command_required"}'::jsonb,
           updated_at = now(), updated_by = v_system
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.tenant_id IS NULL
       AND e.entity_code = 'fx_policy'
       AND ev.status = 'EFFECTIVE'
       AND ef.entity_version_id = ev.id;

    -- Rebuild the FX Rate operation set so every write enters a governed
    -- command route and no generic update/delete binding can survive.
    DELETE FROM control.entity_operation eo
     WHERE eo.tenant_id IS NULL
       AND eo.entity_name = 'fx_rate';

    INSERT INTO control.entity_operation (
      tenant_id,entity_name,entity_version_id,permission_code,surface,placement,handler_type,
      handler_target,is_record_required,sort_order,label_override,created_by
    )
    SELECT NULL,'fx_rate',ev.id,operation.permission_code,operation.surface,operation.placement,'NAVIGATE',
           operation.handler_target,operation.is_record_required,operation.sort_order,operation.label_override,v_system
      FROM control.entity e
      JOIN control.entity_version ev ON ev.entity_id=e.id AND ev.status='EFFECTIVE'
      CROSS JOIN (VALUES
        ('create','LIST','PRIMARY','/app/fx_rate/new',false,10,'Add Rate'),
        ('replace','DETAIL','PRIMARY','/app/fx_rate/{id}/replace',true,20,'Replace Rate'),
        ('import','LIST','TOOLBAR','/app/fx_rate/import',false,30,'Import Rates'),
        ('export','LIST','TOOLBAR','/app/fx_rate/export',false,40,'Export Rates')
      ) operation(permission_code,surface,placement,handler_target,is_record_required,sort_order,label_override)
     WHERE e.tenant_id IS NULL AND e.entity_code='fx_rate'
       AND ev.version_no=(SELECT max(current_ev.version_no) FROM control.entity_version current_ev WHERE current_ev.entity_id=e.id AND current_ev.status='EFFECTIVE')
    ON CONFLICT (tenant_id, entity_version_id, permission_code)
        WHERE entity_version_id IS NOT NULL DO UPDATE
       SET handler_type=excluded.handler_type,
           handler_target=excluded.handler_target,
           label_override=excluded.label_override,
           surface=excluded.surface,
           placement=excluded.placement,
           is_record_required=excluded.is_record_required,
           sort_order=excluded.sort_order,
           is_enabled=true,
           updated_at=now(),updated_by=v_system;

    -- Keep fx_rate runtime operations append-only and governed.
    UPDATE control.entity e
       SET mutability = 'append_only',
           write_capability = 'append_only',
           updated_at = now(),
           updated_by = v_system
      WHERE e.tenant_id IS NULL
        AND e.entity_code = 'fx_rate'
        AND (e.mutability IS DISTINCT FROM 'append_only'
          OR e.write_capability IS DISTINCT FROM 'append_only');

    UPDATE control.entity_version_contract evc
       SET mutability = 'append_only',
           write_capability = 'append_only',
           updated_at = now(),
           updated_by = v_system
      FROM control.entity e
      JOIN control.entity_version ev ON ev.entity_id=e.id
     WHERE evc.tenant_id IS NULL
       AND evc.entity_version_id = ev.id
       AND e.tenant_id IS NULL
       AND e.entity_code = 'fx_rate'
       AND (evc.mutability IS DISTINCT FROM 'append_only'
         OR evc.write_capability IS DISTINCT FROM 'append_only');

    UPDATE control.entity_field ef
       SET is_read_only = true,
           editability = coalesce(ef.editability, '{}'::jsonb)
             || '{"reason":"system_managed_fx_rate_lineage"}'::jsonb,
           updated_at = now(), updated_by = v_system
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.tenant_id IS NULL
       AND e.entity_code = 'fx_rate'
       AND ev.status = 'EFFECTIVE'
       AND ef.entity_version_id = ev.id
       AND ef.name IN (
         'inverse_rate','version_no','supersedes_id','status','is_active',
         'status_changed_at','status_changed_by','created_at','created_by','updated_at','updated_by'
       );

    UPDATE control.entity_field ef
       SET is_filterable = ef.name IN (
             'from_currency','to_currency','rate_type','effective_date','effective_time','source','status','version_no'
           ),
           is_sortable = ef.name IN (
             'from_currency','to_currency','rate','rate_type','effective_date','effective_time','source','status','version_no'
           ),
           reference_config = CASE
             WHEN ef.name='supersedes_id'
               THEN coalesce(ef.reference_config,'{}'::jsonb) || '{"ref_entity":"fx_rate"}'::jsonb
             ELSE ef.reference_config
           END,
           updated_at=now(),updated_by=v_system
      FROM control.entity_version ev
      JOIN control.entity e ON e.id=ev.entity_id
     WHERE e.tenant_id IS NULL
       AND e.entity_code='fx_rate'
       AND ev.status='EFFECTIVE'
       AND ef.entity_version_id=ev.id;

    -- Credential state is a projection of governed secret-provider commands;
    -- generic Entity forms may display it but never mutate it.
    UPDATE control.entity_field ef
       SET is_read_only = true,
           runtime_enabled = CASE
             WHEN ef.name IN ('credential_provider','credential_reference') THEN false
             ELSE ef.runtime_enabled
           END,
           visibility = CASE
             WHEN ef.name IN ('credential_provider','credential_reference')
               THEN coalesce(ef.visibility, '{}'::jsonb) || '{"hidden":true,"reason":"opaque_secret_reference"}'::jsonb
             ELSE ef.visibility
           END,
           editability = coalesce(ef.editability, '{}'::jsonb)
             || '{"reason":"governed_secret_provider_command_required"}'::jsonb,
           updated_at = now(), updated_by = v_system
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE e.tenant_id IS NULL
       AND e.entity_code = 'bank_interface_profile'
       AND ev.status = 'EFFECTIVE'
       AND ef.entity_version_id = ev.id
       AND ef.name IN (
         'config','credential_provider','credential_reference','credential_version',
         'credential_status','credential_last_validated_at','credential_rotated_at'
       );

    -- Align metadata delete behavior with the physical RESTRICT contracts.
    UPDATE control.entity_relation relation
       SET on_delete = 'restrict', updated_at = now(), updated_by = v_system
      FROM control.entity_version ev
      JOIN control.entity e ON e.id = ev.entity_id
     WHERE relation.entity_version_id = ev.id
       AND e.tenant_id IS NULL
       AND (
         (e.entity_code = 'bank_account_link' AND relation.name IN ('bank_account','company_code'))
         OR (e.entity_code = 'bank_account_house_config' AND relation.name = 'bank_account_link')
       );

    INSERT INTO control.entity_relation (
        entity_version_id, name, relation_kind, target_entity, resolution_kind,
        fk_field, on_delete, record_filter, created_by
    )
    SELECT ev.id, relation.name, 'belongs_to', relation.target_entity, 'fk',
           relation.fk_field, 'restrict', '{}'::jsonb, v_system
      FROM (VALUES
        ('fx_rate','supersedes','fx_rate','supersedes_id'),
        ('fx_policy','company_code','company_code','company_code_id'),
        ('fx_policy','ledger_book','ledger_book','ledger_book_id'),
        ('fx_policy','supersedes','fx_policy','supersedes_id'),
        ('tax_group','rounding_rule','rounding_rule','rounding_rule_id')
      ) relation(entity_code,name,target_entity,fk_field)
      JOIN control.entity e ON e.tenant_id IS NULL AND e.entity_code = relation.entity_code
      JOIN control.entity_version ev ON ev.entity_id = e.id AND ev.status = 'EFFECTIVE'
    ON CONFLICT (entity_version_id, name) DO UPDATE
       SET target_entity = EXCLUDED.target_entity,
           fk_field = EXCLUDED.fk_field,
           on_delete = EXCLUDED.on_delete,
           updated_at = now(), updated_by = v_system;
END $$;
