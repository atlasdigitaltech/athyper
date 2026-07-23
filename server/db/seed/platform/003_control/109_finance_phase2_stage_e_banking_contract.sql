-- Finance Setup Phase 2, Stage E: Banking and Treasury Entity contracts.
DO $$
DECLARE v_system uuid:='00000000-0000-0000-0000-000000000000';
BEGIN
 UPDATE control.entity entity SET feature_flags=coalesce(entity.feature_flags,'{}'::jsonb)||config.flags,
   display_config=coalesce(entity.display_config,'{}'::jsonb)||config.display,updated_at=now(),updated_by=v_system
 FROM(VALUES
  ('bank_party','{"banking_aggregate_role":"institution","deletion_mode":"retire"}'::jsonb,'{"title_field":"name","subtitle_field":"code","list_columns":["code","name","country_code","institution_type","bic","supports_swift","supports_local_clearing","status"]}'::jsonb),
  ('bank_account','{"banking_aggregate_role":"physical_account","deletion_mode":"retire","sensitive_identifier":"masked","reveal_action_required":true}'::jsonb,'{"title_field":"name","subtitle_field":"account_last4","list_columns":["name","bank_party_id","account_id_type","account_last4","currency_code","is_verified","status"]}'::jsonb),
  ('bank_account_link','{"aggregate_owned":true,"banking_aggregate_role":"company_link","deletion_mode":"prohibited","temporal_close_action":"end_date"}'::jsonb,'{"title_field":"bank_account_id","subtitle_field":"purpose","list_columns":["owner_type","owner_id","bank_account_id","purpose","is_primary","effective_from","effective_until"]}'::jsonb),
  ('bank_account_house_config','{"aggregate_owned":true,"banking_aggregate_role":"house_config","deletion_mode":"retire"}'::jsonb,'{"title_field":"account_nickname","subtitle_field":"usage_type","list_columns":["bank_account_link_id","gl_account_id","usage_type","is_default_disbursement","is_default_collection","reconciliation_mode","status"]}'::jsonb),
  ('bank_interface_profile','{"aggregate_owned":true,"banking_aggregate_role":"interface","credential_storage":"platform_secret_provider","generic_secret_edit":false}'::jsonb,'{"title_field":"name","subtitle_field":"code","list_columns":["code","name","interface_type","provider_code","credential_status","last_connection_test_status","last_connection_test_at","status"]}'::jsonb)
 )config(entity_code,flags,display) WHERE entity.tenant_id IS NULL AND entity.entity_code=config.entity_code;

 UPDATE control.entity_field field SET is_searchable=false,is_filterable=false,is_sortable=false,
   ui_hint=coalesce(field.ui_hint,'{}'::jsonb)||'{"masked":true,"reveal_action_required":true}'::jsonb,
   updated_at=now(),updated_by=v_system
 FROM control.entity_version version JOIN control.entity entity ON entity.id=version.entity_id
 WHERE field.entity_version_id=version.id AND entity.tenant_id IS NULL AND entity.entity_code='bank_account' AND field.name='account_id_value';

 UPDATE control.entity_field field SET is_read_only=true,
   editability=coalesce(field.editability,'{}'::jsonb)||'{"editable":false,"create_visible":false}'::jsonb,
   ui_hint=coalesce(field.ui_hint,'{}'::jsonb)||'{"read_only_projection":true}'::jsonb,updated_at=now(),updated_by=v_system
 FROM control.entity_version version JOIN control.entity entity ON entity.id=version.entity_id
 WHERE field.entity_version_id=version.id AND entity.tenant_id IS NULL AND entity.entity_code='bank_interface_profile'
   AND field.name IN('credential_status','credential_last_validated_at','last_connection_test_at','last_connection_test_status','last_connection_test_code','last_connection_test_latency_ms');

 UPDATE control.entity_field field SET validation=coalesce(field.validation,'{}'::jsonb)||refs.validation,updated_at=now(),updated_by=v_system
 FROM(VALUES
  ('bank_account','bank_party_id','{"ref_entity":"bank_party"}'::jsonb),('bank_account','correspondent_bank_party_id','{"ref_entity":"bank_party"}'::jsonb),
  ('bank_account_link','bank_account_id','{"ref_entity":"bank_account"}'::jsonb),('bank_account_house_config','bank_account_link_id','{"ref_entity":"bank_account_link"}'::jsonb),
  ('bank_account_house_config','gl_account_id','{"ref_entity":"gl_account"}'::jsonb)
 )refs(entity_code,field_name,validation)
 JOIN control.entity entity ON entity.tenant_id IS NULL AND entity.entity_code=refs.entity_code
 JOIN control.entity_version version ON version.entity_id=entity.id AND version.status='EFFECTIVE'
 WHERE field.entity_version_id=version.id AND field.name=refs.field_name;
END $$;
