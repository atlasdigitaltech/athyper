-- Reviewed canonical equivalence for 20261001_atlas_learning_attempts.sql.
-- Run only through the forward runner, in the same transaction as its receipt.
-- Canonical file receipts establish provenance; the catalog digest rejects live drift.
-- The adjacent catalog JSON records the expected columns, constraints, indexes,
-- RLS policies, grants, triggers and functions for review. No data is changed.
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
LOCK TABLE ai.atlas_learning_attempt, ai.atlas_learning_attempt_result IN ACCESS EXCLUSIVE MODE;
DO $equivalence$
DECLARE actual text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.schema_provisions WHERE plane=substring(current_database() from 9) AND file_name='planes/studio/ai/03_tables.sql' AND checksum='c1ae993f3a817475c5a634d2096957481eec7f5af0726114026d8cf1aed7cc02') THEN RAISE EXCEPTION 'FOUNDATION_EQUIVALENCE_RECEIPT_DRIFT: planes/studio/ai/03_tables.sql'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.schema_provisions WHERE plane=substring(current_database() from 9) AND file_name='planes/studio/ai/05_constraints.sql' AND checksum='9ac7a0aac92f3c26486a88256eddc61e028eac38c39cf866fc8504a17196c005') THEN RAISE EXCEPTION 'FOUNDATION_EQUIVALENCE_RECEIPT_DRIFT: planes/studio/ai/05_constraints.sql'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.schema_provisions WHERE plane=substring(current_database() from 9) AND file_name='planes/studio/ai/06_indexes.sql' AND checksum='69346080f6f279dd33f13757924caabb7a2cb0d2a9239a9d60e04d016b564ca6') THEN RAISE EXCEPTION 'FOUNDATION_EQUIVALENCE_RECEIPT_DRIFT: planes/studio/ai/06_indexes.sql'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.schema_provisions WHERE plane=substring(current_database() from 9) AND file_name='planes/studio/publication/07_functions.sql' AND checksum='5285e4616dc5bb5850b0dc90b7bccc044dd80ef977748519e13e0c985d7d2df6') THEN RAISE EXCEPTION 'FOUNDATION_EQUIVALENCE_RECEIPT_DRIFT: planes/studio/publication/07_functions.sql'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.schema_provisions WHERE plane=substring(current_database() from 9) AND file_name='planes/studio/ai/08_triggers.sql' AND checksum='cc785a5a7344876cbefac057befc55ef7b3698353f693d7b733dd10a9749845a') THEN RAISE EXCEPTION 'FOUNDATION_EQUIVALENCE_RECEIPT_DRIFT: planes/studio/ai/08_triggers.sql'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.schema_provisions WHERE plane=substring(current_database() from 9) AND file_name='planes/studio/ai/10_rls.sql' AND checksum='7f9661129550e5626b1e517fdd51937935e8c51a3fe7c9d3502c073f76649d3b') THEN RAISE EXCEPTION 'FOUNDATION_EQUIVALENCE_RECEIPT_DRIFT: planes/studio/ai/10_rls.sql'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.schema_provisions WHERE plane=substring(current_database() from 9) AND file_name='planes/studio/ai/11_grants.sql' AND checksum='fe3f6878308195236ad567cb029e3061251da10b528b7fd5e1a233ecd532f9ee') THEN RAISE EXCEPTION 'FOUNDATION_EQUIVALENCE_RECEIPT_DRIFT: planes/studio/ai/11_grants.sql'; END IF;
  SELECT encode(sha256(convert_to(value::text,'UTF8')),'hex') INTO actual FROM (
WITH relations AS (
 SELECT c.oid, n.nspname || '.' || c.relname AS name, c.relkind, c.relrowsecurity,
 c.relforcerowsecurity, c.relreplident, c.reloptions, pg_get_userbyid(c.relowner) AS owner,
 (SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(c.relacl) a) AS acl
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname || '.' || c.relname = ANY (ARRAY['ai.atlas_learning_attempt','ai.atlas_learning_attempt_result'])
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
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname || '.' || p.proname = ANY (ARRAY['publication.trg_guard_ledger_mutation']::text[]))
 ) AS value
)
SELECT value FROM state
  ) catalog;
  IF actual IS DISTINCT FROM 'fffdcd6a51a3943ba0a470d35e15666645ffe1839848522f9a3cea42f5c54fd8' THEN
    RAISE EXCEPTION 'FOUNDATION_EQUIVALENCE_SCHEMA_DRIFT: 20261001_atlas_learning_attempts.sql';
  END IF;
END $equivalence$;
