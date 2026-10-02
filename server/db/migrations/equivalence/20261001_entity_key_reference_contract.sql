-- Reviewed canonical equivalence for 20261001_entity_key_reference_contract.sql.
-- Run only through the forward runner, in the same transaction as its receipt.
-- Canonical file receipts establish provenance; the catalog digest rejects live drift.
-- The adjacent catalog JSON records the expected columns, constraints, indexes,
-- RLS policies, grants, triggers and functions for review. No data is changed.
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
LOCK TABLE metadata.entity_field IN ACCESS EXCLUSIVE MODE;
DO $equivalence$
DECLARE actual text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.schema_provisions WHERE plane=substring(current_database() from 9) AND file_name='planes/studio/metadata/07_functions.sql' AND checksum='b04416286a59e74ab8b08c6c1151fb7c4c46b21c0afd480c5bace1c88a725492') THEN RAISE EXCEPTION 'FOUNDATION_EQUIVALENCE_RECEIPT_DRIFT: planes/studio/metadata/07_functions.sql'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.schema_provisions WHERE plane=substring(current_database() from 9) AND file_name='planes/studio/metadata/08_triggers.sql' AND checksum='7438de679d8cdc71f97254f762e23b6bbdede80effef83ccd04ce93df6b22762') THEN RAISE EXCEPTION 'FOUNDATION_EQUIVALENCE_RECEIPT_DRIFT: planes/studio/metadata/08_triggers.sql'; END IF;
  SELECT encode(sha256(convert_to(value::text,'UTF8')),'hex') INTO actual FROM (
WITH relations AS (
 SELECT c.oid, n.nspname || '.' || c.relname AS name, c.relkind, c.relrowsecurity,
 c.relforcerowsecurity, c.relreplident, c.reloptions, pg_get_userbyid(c.relowner) AS owner,
 (SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(c.relacl) a) AS acl
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname || '.' || c.relname = ANY (ARRAY['metadata.entity_field'])
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
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname || '.' || p.proname = ANY (ARRAY['metadata.fn_entity_key_reference_valid','metadata.trg_validate_entity_field_contract']::text[]))
 ) AS value
)
SELECT value FROM state
  ) catalog;
  IF actual IS DISTINCT FROM '1b591087911a59c6ce21d64ba4507096ab5d6b221c7463ccf1e527df8a1a85ab' THEN
    RAISE EXCEPTION 'FOUNDATION_EQUIVALENCE_SCHEMA_DRIFT: 20261001_entity_key_reference_contract.sql';
  END IF;
END $equivalence$;
