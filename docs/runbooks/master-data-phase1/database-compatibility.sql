-- Run with psql -X -v ON_ERROR_STOP=1 -At -f this-file.sql against an explicitly
-- selected database, using its application role. No data rows or secrets are read.
-- The result is inventory evidence, NOT a migration or production certification.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';
WITH required(name) AS (VALUES
  ('master.address'),('master.address_link'),('master.contact_link'),
  ('control.owner_type'),('control.owner_type_purpose'),('event.outbox'),
  ('authz.permission'),('authz.permission_scope_kind'),('authz.scope_target'),
  ('authz.entity_operation_binding'),('authz.entity_operation_scope_binding'),
  ('authz.role'),('authz.role_permission'),('runtime_meta.entity_descriptor')
), objects AS (
  SELECT name,to_regclass(name) AS oid FROM required
), expected_columns(table_name,column_name,expected_type,expected_not_null) AS (VALUES
  ('master.address','tenant_id','uuid',true),
  ('master.address','country_code','character(2)',true),
  ('master.address','normalized_hash','character(64)',true),
  ('master.address_link','tenant_id','uuid',true),
  ('master.address_link','effective_from','date',true),
  ('master.address_link','effective_until','date',false),
  ('master.contact_link','tenant_id','uuid',true),
  ('master.contact_link','effective_from','timestamp with time zone',true),
  ('master.contact_link','effective_until','timestamp with time zone',false),
  ('master.contact_link','verification_evidence','jsonb',true),
  ('master.contact_link','verification_signature','text',false)
)
SELECT jsonb_pretty(jsonb_build_object(
  'schema','athyper.master-data.database-inventory.v1',
  'observedAt',clock_timestamp(),
  'database',current_database(),
  'role',current_user,
  'serverVersion',current_setting('server_version'),
  'timeZone',current_setting('TimeZone'),
  'readOnly',current_setting('transaction_read_only'),
  'productionQualified',false,
  'roleFlags',(SELECT jsonb_build_object('superuser',rolsuper,'bypassRls',rolbypassrls) FROM pg_roles WHERE rolname=current_user),
  'objects',(SELECT jsonb_agg(jsonb_build_object(
    'name',o.name,'exists',o.oid IS NOT NULL,'rlsEnabled',c.relrowsecurity,'rlsForced',c.relforcerowsecurity,
    'ownedByCurrentRole',c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user),
    'select',CASE WHEN o.oid IS NULL THEN false ELSE has_table_privilege(current_user,o.oid,'SELECT') END,
    'insert',CASE WHEN o.oid IS NULL THEN false ELSE has_table_privilege(current_user,o.oid,'INSERT') END,
    'update',CASE WHEN o.oid IS NULL THEN false ELSE has_table_privilege(current_user,o.oid,'UPDATE') END,
    'policies',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=o.oid),'[]'::jsonb),
    'constraints',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',x.conname,'validated',x.convalidated,'definition',pg_get_constraintdef(x.oid)) ORDER BY x.conname) FROM pg_constraint x WHERE x.conrelid=o.oid),'[]'::jsonb),
    'indexes',COALESCE((SELECT jsonb_agg(jsonb_build_object('definition',pg_get_indexdef(i.indexrelid),'valid',i.indisvalid) ORDER BY i.indexrelid) FROM pg_index i WHERE i.indrelid=o.oid),'[]'::jsonb),
    'triggers',COALESCE((SELECT jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid=o.oid AND NOT t.tgisinternal),'[]'::jsonb)
  ) ORDER BY o.name) FROM objects o LEFT JOIN pg_class c ON c.oid=o.oid),
  'columnChecks',(SELECT jsonb_agg(jsonb_build_object('table',e.table_name,'column',e.column_name,
    'expectedType',e.expected_type,'actualType',format_type(a.atttypid,a.atttypmod),
    'expectedNotNull',e.expected_not_null,'actualNotNull',a.attnotnull,
    'matches',COALESCE(format_type(a.atttypid,a.atttypmod)=e.expected_type AND a.attnotnull=e.expected_not_null,false)) ORDER BY e.table_name,e.column_name)
    FROM expected_columns e LEFT JOIN pg_attribute a ON a.attrelid=to_regclass(e.table_name) AND a.attname=e.column_name AND a.attnum>0 AND NOT a.attisdropped),
  'functions',(SELECT COALESCE(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'signature',pg_get_function_identity_arguments(p.oid),'execute',has_function_privilege(current_user,p.oid,'EXECUTE'),'definitionMd5',md5(pg_get_functiondef(p.oid))) ORDER BY n.nspname,p.proname,p.oid),'[]'::jsonb)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE (n.nspname='audit' AND p.proname='append_event')
       OR (n.nspname='shared' AND p.proname IN ('current_tenant_id','current_tenant_id_soft','current_principal_id','uuidv7'))
       OR (n.nspname='master' AND p.proname IN ('trg_validate_owner_reference','trg_normalize_contact_link','trg_require_contact_verification_evidence')))
));
ROLLBACK;
