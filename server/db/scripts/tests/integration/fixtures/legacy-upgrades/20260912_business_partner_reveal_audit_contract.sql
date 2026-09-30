-- Catalog-only contract for the existing, separately authorized reveal commands.
-- No raw values are captured. Command purpose is mandatory and recorded in context.
DO $guard$
BEGIN
 IF current_database()<>'athyper_neon' OR current_setting('app.database_plane',true) IS DISTINCT FROM 'neon' THEN
  RAISE EXCEPTION 'BP reveal audit reference requires NEON';
 END IF;
 IF EXISTS(SELECT 1 FROM master.audit_event_contract WHERE code='business_partner_reveal') THEN
  RAISE EXCEPTION 'Existing BP reveal contract must be reviewed; never overwrite it';
 END IF;
END $guard$;
INSERT INTO master.audit_event_contract(code,event_code_pattern,priority,allowed_operations,default_severity,allowed_actor_types,allowed_scope,reason_required,capture_mode,max_payload_bytes,schema_version,metadata,status)
VALUES('business_partner_reveal','^business_partner\.(bank_account|tax_registration)\.revealed$',10,ARRAY['execute']::audit.operation_d[],'info',ARRAY['user']::audit.actor_type_d[],'tenant',false,'metadata',4096,1,'{"owner":"master-data","sensitive":true,"purpose":"separately_authorized_reveal","commandPurposeRequired":true,"rawValuesExcluded":true}'::jsonb,'active');
