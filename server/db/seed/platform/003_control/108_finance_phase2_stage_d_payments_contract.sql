-- Finance Setup Phase 2, Stage D: Payments and Settlement metadata contract.
DO $$
DECLARE v_system uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  UPDATE control.entity entity SET
    feature_flags=coalesce(entity.feature_flags,'{}'::jsonb)||config.flags,
    display_config=coalesce(entity.display_config,'{}'::jsonb)||config.display,
    updated_at=now(),updated_by=v_system
  FROM (VALUES
    ('payment_method','{"payments_aggregate_role":"method","deletion_mode":"retire"}'::jsonb,'{"title_field":"name","subtitle_field":"code","list_columns":["code","name","direction","instrument_mode","requires_bank_interface","status"]}'::jsonb),
    ('payment_term','{"aggregate_owned":true,"payments_aggregate_role":"term_version","deletion_mode":"prohibited"}'::jsonb,'{"title_field":"name","subtitle_field":"code","list_columns":["code","name","version","applicable_to","due_rule_type","effective_from","status"]}'::jsonb),
    ('payment_term_clause','{"aggregate_owned":true,"payments_aggregate_role":"term_clause","deletion_mode":"prohibited"}'::jsonb,'{"title_field":"clause_code","subtitle_field":"clause_type","list_columns":["payment_term_id","sequence_no","clause_code","clause_type","calc_mode","is_active"]}'::jsonb),
    ('payment_term_discount_tier','{"aggregate_owned":true,"payments_aggregate_role":"discount_tier","deletion_mode":"prohibited"}'::jsonb,'{"title_field":"tier_no","list_columns":["payment_term_id","tier_no","qualify_within_days","discount_pct","discount_fixed","currency_code"]}'::jsonb),
    ('payment_method_company_policy','{"aggregate_owned":true,"payments_aggregate_role":"company_policy","deletion_mode":"retire"}'::jsonb,'{"title_field":"payment_method_id","subtitle_field":"direction","list_columns":["company_code_id","payment_method_id","direction","currency_code","bank_account_link_id","is_default","status"]}'::jsonb),
    ('bank_interface_profile','{"aggregate_owned":true,"payments_aggregate_role":"interface","deletion_mode":"retire","secret_fields_forbidden":true}'::jsonb,'{"title_field":"name","subtitle_field":"code","list_columns":["code","name","interface_type","payment_network","provider_code","status"]}'::jsonb),
    ('payment_method_interface_binding','{"aggregate_owned":true,"payments_aggregate_role":"routing","deletion_mode":"retire","resolution_order":"specificity_then_priority"}'::jsonb,'{"title_field":"payment_method_id","subtitle_field":"direction","list_columns":["company_code_id","payment_method_id","bank_account_link_id","currency_code","bank_interface_profile_id","priority","status"]}'::jsonb),
    ('payment_settlement_rule','{"aggregate_owned":true,"payments_aggregate_role":"settlement","deletion_mode":"retire"}'::jsonb,'{"title_field":"payment_method_id","subtitle_field":"book_code","list_columns":["company_code_id","payment_method_id","direction","book_code","clearing_posting_role_code","settlement_posting_role_code","status"]}'::jsonb),
    ('bank_account_house_config','{"aggregate_owned":true,"payments_aggregate_role":"house_bank","deletion_mode":"retire"}'::jsonb,'{"title_field":"account_nickname","subtitle_field":"usage_type","list_columns":["bank_account_link_id","gl_account_id","usage_type","is_disbursement_enabled","is_collection_enabled","status"]}'::jsonb)
  ) config(entity_code,flags,display)
  WHERE entity.tenant_id IS NULL AND entity.entity_code=config.entity_code;

  UPDATE control.entity_field field SET validation=coalesce(field.validation,'{}'::jsonb)||refs.validation,
    updated_at=now(),updated_by=v_system
  FROM (VALUES
    ('payment_term','holiday_calendar_id','{"ref_entity":"holiday_calendar"}'::jsonb),
    ('payment_term','supersedes_payment_term_id','{"ref_entity":"payment_term"}'::jsonb),
    ('payment_term_clause','payment_term_id','{"ref_entity":"payment_term"}'::jsonb),
    ('payment_term_discount_tier','payment_term_id','{"ref_entity":"payment_term"}'::jsonb),
    ('payment_method_company_policy','company_code_id','{"ref_entity":"company_code"}'::jsonb),
    ('payment_method_company_policy','payment_method_id','{"ref_entity":"payment_method"}'::jsonb),
    ('payment_method_company_policy','bank_account_link_id','{"ref_entity":"bank_account_link"}'::jsonb),
    ('payment_method_interface_binding','company_code_id','{"ref_entity":"company_code"}'::jsonb),
    ('payment_method_interface_binding','payment_method_id','{"ref_entity":"payment_method"}'::jsonb),
    ('payment_method_interface_binding','bank_account_link_id','{"ref_entity":"bank_account_link"}'::jsonb),
    ('payment_method_interface_binding','bank_interface_profile_id','{"ref_entity":"bank_interface_profile"}'::jsonb),
    ('payment_settlement_rule','company_code_id','{"ref_entity":"company_code"}'::jsonb),
    ('payment_settlement_rule','payment_method_id','{"ref_entity":"payment_method"}'::jsonb),
    ('bank_account_house_config','bank_account_link_id','{"ref_entity":"bank_account_link"}'::jsonb),
    ('bank_account_house_config','gl_account_id','{"ref_entity":"gl_account"}'::jsonb)
  ) refs(entity_code,field_name,validation)
  JOIN control.entity entity ON entity.tenant_id IS NULL AND entity.entity_code=refs.entity_code
  JOIN control.entity_version version ON version.entity_id=entity.id AND version.status='EFFECTIVE'
  WHERE field.entity_version_id=version.id AND field.name=refs.field_name;

  INSERT INTO control.entity_relation(entity_version_id,name,relation_kind,target_entity,resolution_kind,fk_field,on_delete,record_filter,created_by)
  SELECT version.id,relation.name,'belongs_to',relation.target,'fk',relation.field,'restrict','{}'::jsonb,v_system
  FROM (VALUES
    ('payment_term_clause','payment_term','payment_term','payment_term_id'),
    ('payment_term_discount_tier','payment_term','payment_term','payment_term_id'),
    ('payment_method_company_policy','payment_method','payment_method','payment_method_id'),
    ('payment_method_company_policy','house_bank','bank_account_link','bank_account_link_id'),
    ('payment_method_interface_binding','payment_method','payment_method','payment_method_id'),
    ('payment_method_interface_binding','interface_profile','bank_interface_profile','bank_interface_profile_id'),
    ('payment_settlement_rule','payment_method','payment_method','payment_method_id'),
    ('bank_account_house_config','bank_account_link','bank_account_link','bank_account_link_id')
  ) relation(entity_code,name,target,field)
  JOIN control.entity entity ON entity.tenant_id IS NULL AND entity.entity_code=relation.entity_code
  JOIN control.entity_version version ON version.entity_id=entity.id AND version.status='EFFECTIVE'
  ON CONFLICT(entity_version_id,name) DO UPDATE SET target_entity=EXCLUDED.target_entity,fk_field=EXCLUDED.fk_field,on_delete='restrict',updated_at=now(),updated_by=v_system;
END $$;
