-- Finance Setup Phase 2, Stage C: Tax aggregate metadata contract.
DO $$
DECLARE v_system uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  -- Remove stale authored Tax fields that no longer map to physical columns.
  DELETE FROM control.entity_field field
   USING control.entity_version version, control.entity entity
   WHERE field.entity_version_id=version.id AND version.entity_id=entity.id
     AND entity.tenant_id IS NULL
     AND entity.entity_code IN (
       'tax_jurisdiction','tax_type','rounding_rule','tax_rate_schedule','tax_group',
       'tax_group_version','tax_group_component','tax_resolution_rule','wht_threshold_config',
       'organization_tax_registration')
     AND field.origin<>'business' AND field.column_name<>''
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns column_def
        WHERE column_def.table_schema=entity.table_schema AND column_def.table_name=entity.table_name
          AND column_def.column_name=field.column_name
     );

  UPDATE control.entity entity SET
    feature_flags=coalesce(entity.feature_flags,'{}'::jsonb)||config.flags,
    display_config=coalesce(entity.display_config,'{}'::jsonb)||config.display,
    updated_at=now(),updated_by=v_system
  FROM (VALUES
    ('tax_jurisdiction','{"tax_aggregate_role":"reference","deletion_mode":"retire"}'::jsonb,'{"title_field":"name","subtitle_field":"code","list_columns":["code","name","country_code","jurisdiction_type","filing_frequency","status"]}'::jsonb),
    ('tax_type','{"tax_aggregate_role":"reference","deletion_mode":"retire"}'::jsonb,'{"title_field":"name","subtitle_field":"code","list_columns":["code","name","condition_type_id","status"]}'::jsonb),
    ('rounding_rule','{"tax_aggregate_role":"reference","deletion_mode":"retire"}'::jsonb,'{"title_field":"name","subtitle_field":"code","list_columns":["code","name","method","precision_digits","minimum_unit","status"]}'::jsonb),
    ('tax_group','{"aggregate_owned":true,"tax_aggregate_role":"root","deletion_mode":"prohibited"}'::jsonb,'{"title_field":"name","subtitle_field":"code","list_columns":["code","name","jurisdiction_id","status"]}'::jsonb),
    ('tax_group_version','{"aggregate_owned":true,"tax_aggregate_role":"version","deletion_mode":"prohibited"}'::jsonb,'{"title_field":"version_no","subtitle_field":"status","list_columns":["tax_group_id","version_no","effective_from","effective_to","rounding_rule_id","status"]}'::jsonb),
    ('tax_group_component','{"aggregate_owned":true,"tax_aggregate_role":"child","deletion_mode":"prohibited"}'::jsonb,'{"title_field":"calculation_seq","list_columns":["tax_group_id","tax_group_version_id","calculation_seq","tax_rate_schedule_id","rate_override","status"]}'::jsonb),
    ('tax_rate_schedule','{"aggregate_owned":true,"tax_aggregate_role":"rate","deletion_mode":"retire"}'::jsonb,'{"title_field":"component_code","list_columns":["jurisdiction_id","tax_type_id","tax_direction","component_code","rate_value","effective_from","effective_to","status"]}'::jsonb),
    ('tax_resolution_rule','{"aggregate_owned":true,"tax_aggregate_role":"resolution","deletion_mode":"retire"}'::jsonb,'{"title_field":"name","subtitle_field":"code","list_columns":["code","name","resolved_tax_group_id","priority","effective_from","effective_to","status"]}'::jsonb),
    ('wht_threshold_config','{"aggregate_owned":true,"tax_aggregate_role":"wht_threshold","deletion_mode":"prohibited"}'::jsonb,'{"title_field":"section_code","list_columns":["jurisdiction_id","tax_type_id","section_code","threshold_amount","threshold_currency","effective_from","effective_to","is_active"]}'::jsonb),
    ('organization_tax_registration','{"aggregate_owned":true,"tax_aggregate_role":"registration","deletion_mode":"retire"}'::jsonb,'{"title_field":"registration_number","subtitle_field":"registration_type","list_columns":["legal_entity_id","company_code_id","jurisdiction_id","registration_type","registration_number","effective_from","effective_to","status"]}'::jsonb)
  ) config(entity_code,flags,display)
  WHERE entity.tenant_id IS NULL AND entity.entity_code=config.entity_code;

  -- Canonical reference contracts used by generic records and the aggregate editor.
  UPDATE control.entity_field field SET
    validation=coalesce(field.validation,'{}'::jsonb)||refs.validation,
    updated_at=now(),updated_by=v_system
  FROM (VALUES
    ('tax_type','condition_type_id','{"ref_entity":"condition_type"}'::jsonb),
    ('tax_group','jurisdiction_id','{"ref_entity":"tax_jurisdiction"}'::jsonb),
    ('tax_group','rounding_rule_id','{"ref_entity":"rounding_rule"}'::jsonb),
    ('tax_group_version','tax_group_id','{"ref_entity":"tax_group"}'::jsonb),
    ('tax_group_version','rounding_rule_id','{"ref_entity":"rounding_rule"}'::jsonb),
    ('tax_group_version','supersedes_id','{"ref_entity":"tax_group_version"}'::jsonb),
    ('tax_group_component','tax_group_id','{"ref_entity":"tax_group"}'::jsonb),
    ('tax_group_component','tax_group_version_id','{"ref_entity":"tax_group_version"}'::jsonb),
    ('tax_group_component','tax_rate_schedule_id','{"ref_entity":"tax_rate_schedule"}'::jsonb),
    ('tax_rate_schedule','jurisdiction_id','{"ref_entity":"tax_jurisdiction"}'::jsonb),
    ('tax_rate_schedule','tax_type_id','{"ref_entity":"tax_type"}'::jsonb),
    ('tax_resolution_rule','resolved_tax_group_id','{"ref_entity":"tax_group"}'::jsonb),
    ('wht_threshold_config','jurisdiction_id','{"ref_entity":"tax_jurisdiction"}'::jsonb),
    ('wht_threshold_config','tax_type_id','{"ref_entity":"tax_type"}'::jsonb),
    ('organization_tax_registration','legal_entity_id','{"ref_entity":"legal_entity"}'::jsonb),
    ('organization_tax_registration','company_code_id','{"ref_entity":"company_code"}'::jsonb),
    ('organization_tax_registration','jurisdiction_id','{"ref_entity":"tax_jurisdiction"}'::jsonb),
    ('organization_tax_registration','certificate_attachment_id','{"ref_entity":"attachment"}'::jsonb)
  ) refs(entity_code,field_name,validation)
  JOIN control.entity entity ON entity.tenant_id IS NULL AND entity.entity_code=refs.entity_code
  JOIN control.entity_version version ON version.entity_id=entity.id AND version.status='EFFECTIVE'
  WHERE field.entity_version_id=version.id AND field.name=refs.field_name;

  INSERT INTO control.entity_relation(entity_version_id,name,relation_kind,target_entity,resolution_kind,fk_field,on_delete,record_filter,created_by)
  SELECT version.id,relation.name,'belongs_to',relation.target,'fk',relation.field,'restrict','{}'::jsonb,v_system
  FROM (VALUES
    ('tax_group_version','tax_group','tax_group','tax_group_id'),('tax_group_version','rounding_rule','rounding_rule','rounding_rule_id'),
    ('tax_group_component','tax_group_version','tax_group_version','tax_group_version_id'),('tax_group_component','rate_schedule','tax_rate_schedule','tax_rate_schedule_id'),
    ('tax_resolution_rule','tax_group','tax_group','resolved_tax_group_id'),('organization_tax_registration','legal_entity','legal_entity','legal_entity_id'),
    ('organization_tax_registration','company_code','company_code','company_code_id'),('organization_tax_registration','jurisdiction','tax_jurisdiction','jurisdiction_id')
  ) relation(entity_code,name,target,field)
  JOIN control.entity entity ON entity.tenant_id IS NULL AND entity.entity_code=relation.entity_code
  JOIN control.entity_version version ON version.entity_id=entity.id AND version.status='EFFECTIVE'
  ON CONFLICT(entity_version_id,name) DO UPDATE SET target_entity=EXCLUDED.target_entity,fk_field=EXCLUDED.fk_field,on_delete='restrict',updated_at=now(),updated_by=v_system;
END $$;

