-- Reviewed canonical equivalence for 20260926_entity_execution_binding_storage.sql.
-- Run only through the forward runner, in the same transaction as its receipt.
-- Canonical file receipts establish provenance; the catalog digest rejects live drift.
-- The adjacent catalog JSON records the expected columns, constraints, indexes,
-- RLS policies, grants, triggers and functions for review. No data is changed.
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
LOCK TABLE metadata.entity_change_case_binding, metadata.entity_operation_context_requirement, metadata.entity_field_reference_binding, metadata.entity_materialization_binding, metadata.entity_materialization_field_mapping IN ACCESS EXCLUSIVE MODE;
DO $equivalence$
DECLARE actual text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.schema_provisions WHERE plane=substring(current_database() from 9) AND file_name='planes/studio/metadata/03_tables.sql' AND checksum='14572ab8bb80023127f4bd838c4ba70613c2d6f61a1b44395d9481c865a6060a') THEN RAISE EXCEPTION 'FOUNDATION_EQUIVALENCE_RECEIPT_DRIFT: planes/studio/metadata/03_tables.sql'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.schema_provisions WHERE plane=substring(current_database() from 9) AND file_name='planes/studio/metadata/05_constraints.sql' AND checksum='7bfb9e5bdcac39c7245d48ec79bc71d1de3092affbbcd1f6e39491bceebff361') THEN RAISE EXCEPTION 'FOUNDATION_EQUIVALENCE_RECEIPT_DRIFT: planes/studio/metadata/05_constraints.sql'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.schema_provisions WHERE plane=substring(current_database() from 9) AND file_name='planes/studio/metadata/10_rls.sql' AND checksum='c666150d2eebe13e0d53fb7f67203752e8dd397a12c124a43d3802df664f5555') THEN RAISE EXCEPTION 'FOUNDATION_EQUIVALENCE_RECEIPT_DRIFT: planes/studio/metadata/10_rls.sql'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.schema_provisions WHERE plane=substring(current_database() from 9) AND file_name='planes/studio/metadata/11_grants.sql' AND checksum='4012db3c948bb9617dd5cd58aa20126c6e33b0f1ad54a7729e33b328f0067b9c') THEN RAISE EXCEPTION 'FOUNDATION_EQUIVALENCE_RECEIPT_DRIFT: planes/studio/metadata/11_grants.sql'; END IF;
  SELECT encode(sha256(convert_to(value::text,'UTF8')),'hex') INTO actual FROM (
WITH relations AS (
 SELECT c.oid, n.nspname || '.' || c.relname AS name, c.relkind, c.relrowsecurity,
 c.relforcerowsecurity, c.relreplident, c.reloptions, pg_get_userbyid(c.relowner) AS owner,
 (SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(c.relacl) a) AS acl
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname || '.' || c.relname = ANY (ARRAY['metadata.entity_change_case_binding','metadata.entity_operation_context_requirement','metadata.entity_field_reference_binding','metadata.entity_materialization_binding','metadata.entity_materialization_field_mapping'])
), state AS (
 SELECT jsonb_build_object(
 'relations', (SELECT jsonb_agg(jsonb_build_object(
   'name', r.name, 'kind',r.relkind, 'rls',r.relrowsecurity, 'forced',r.relforcerowsecurity,
   'replicaIdentity',r.relreplident,'options',r.reloptions,'owner',r.owner,'acl',r.acl,
   'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
      'required',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,
      'collation',a.attcollation::regcollation::text,'acl',a.attacl::text,
      'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
      FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped),
   'constraints',(SELECT jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid),
      'validated',convalidated) ORDER BY conname) FROM pg_constraint WHERE conrelid=r.oid),
   'indexes',(SELECT jsonb_agg(jsonb_build_object('definition',pg_get_indexdef(indexrelid),
      'valid',indisvalid,'ready',indisready) ORDER BY pg_get_indexdef(indexrelid)) FROM pg_index WHERE indrelid=r.oid),
   'policies',(SELECT jsonb_agg(jsonb_build_object('name',polname,'command',polcmd,'permissive',polpermissive,
      'roles',(SELECT jsonb_agg(CASE WHEN role=0 THEN 'public' ELSE pg_get_userbyid(role) END ORDER BY role::regrole::text) FROM unnest(polroles) role),
      'using',pg_get_expr(polqual,polrelid),'check',pg_get_expr(polwithcheck,polrelid)) ORDER BY polname)
      FROM pg_policy WHERE polrelid=r.oid),
   'triggers',(SELECT jsonb_agg(jsonb_build_object('name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(oid)) ORDER BY tgname)
      FROM pg_trigger WHERE tgrelid=r.oid AND NOT tgisinternal)
 ) ORDER BY r.name) FROM relations r),
 'functions',(SELECT jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),
   'owner',pg_get_userbyid(p.proowner),'acl',(SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(p.proacl) a)) ORDER BY p.oid::regprocedure::text)
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname || '.' || p.proname = ANY (ARRAY[]::text[]))
 ) AS value
)
SELECT value FROM state
  ) catalog;
  IF actual IS DISTINCT FROM '3628b4b57170b9e6791b063c4ad38287bbfb9bde4efa855605c9b7136a1dbc14' THEN
    RAISE EXCEPTION 'FOUNDATION_EQUIVALENCE_SCHEMA_DRIFT: 20260926_entity_execution_binding_storage.sql';
  END IF;
END $equivalence$;
