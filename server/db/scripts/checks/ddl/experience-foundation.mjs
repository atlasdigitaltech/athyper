// Deterministic upgrade generation from reviewed canonical blocks; no database access.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
export const databaseRoot = resolve(import.meta.dirname, '../../..');
export const migrationName = '20260910_experience_foundation.sql';
export const tables = ['ai.atlas_experience_release', 'runtime_meta.experience_surface_projection'];
export const stages = ['03_tables.sql', '05_constraints.sql', '06_indexes.sql', '10_rls.sql', '11_grants.sql'];

export function canonicalBlocks(table) {
  return stages.map(stage => {
    const source = readFileSync(resolve(databaseRoot, `ddl/common/${table.split('.')[0]}/${stage}`), 'utf8');
    const start = `-- BEGIN ATLAS EXPERIENCE FOUNDATION: ${table}\n`;
    const end = `-- END ATLAS EXPERIENCE FOUNDATION: ${table}`;
    if (source.split(start).length !== 2 || source.split(end).length !== 2) throw Error(`Missing or duplicate canonical block: ${table}/${stage}`);
    return source.split(start)[1].split(end)[0].trim();
  }).join('\n\n');
}

// The only accepted previous schema is the exact reviewed legacy catalog.
// Legacy expressions remain pinned; all other catalog drift still aborts atomically.
export const integrityChecks = [
  {
    "table": "ai.atlas_experience_release",
    "name": "atlas_experience_release_definition_chk",
    "legacy": "((jsonb_typeof(definition) = 'object'::text) AND ((definition ->> 'schema'::text) = 'atlas-experience-definition/1'::text) AND ((definition ->> 'scope'::text) = scope) AND (octet_length((definition)::text) <= 131072))"
  },
  {
    "table": "runtime_meta.experience_surface_projection",
    "name": "experience_surface_projection_definition_chk",
    "legacy": "((jsonb_typeof(definition) = 'object'::text) AND ((definition ->> 'schema'::text) = 'athyper-experience-surface/1'::text) AND ((definition ->> 'id'::text) = surface_key) AND (octet_length((definition)::text) <= 262144))"
  },
  {
    "table": "runtime_meta.experience_surface_projection",
    "name": "experience_surface_projection_local_plane_chk",
    "legacy": "(plane_code = current_setting('app.database_plane'::text, true))"
  }
];
function checkExpression(check) {
  const line = canonicalBlocks(check.table).split('\n').find(line => line.includes(`CONSTRAINT ${check.name} CHECK (`));
  return line.split('CHECK (')[1].replace(/\),$/, '');
}
function alterChecks(table, checks, legacy) {
  return checks.map(check => `ALTER TABLE ${table} DROP CONSTRAINT ${check.name}, ADD CONSTRAINT ${check.name} CHECK (${legacy ? check.legacy : checkExpression(check)});`).join('\n');
}
export function legacyBlocks(table) {
  let source=canonicalBlocks(table);
  for(const check of integrityChecks.filter(c=>c.table===table)) source=source.replace(`CHECK (${checkExpression(check)})`,`CHECK (${check.legacy})`);
  return source;
}

// Stable, content-free catalog comparison. Owners/OIDs/temp persistence are intentionally
// excluded; direct grants, grant options, policies, triggers and table definitions are not.
export const signatureFunction = `CREATE OR REPLACE FUNCTION pg_temp.atlas_experience_signature(target regclass)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog AS $signature$
SELECT jsonb_build_object(
 'kind',c.relkind,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
   FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(conname,contype,convalidated,pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid=c.oid),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(ic.relname,i.indisvalid,regexp_replace(pg_get_indexdef(i.indexrelid),' ON .* USING ',' ON <table> USING ')) ORDER BY ic.relname) FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid WHERE i.indrelid=c.oid),
 'policies',(SELECT jsonb_agg(jsonb_build_array(polname,polcmd,polpermissive,polroles::text,pg_get_expr(polqual,polrelid),pg_get_expr(polwithcheck,polrelid)) ORDER BY polname) FROM pg_policy WHERE polrelid=c.oid),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(tgname,tgenabled,pg_get_triggerdef(oid)) ORDER BY tgname) FROM pg_trigger WHERE tgrelid=c.oid AND NOT tgisinternal),
 'grants',(SELECT jsonb_agg(jsonb_build_array(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable) ORDER BY a.grantee,a.privilege_type)
   FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee<>c.relowner)
) FROM pg_class c WHERE c.oid=target
$signature$;`;

export function expectedTablesSql() {
  return tables.map((table, i) => canonicalBlocks(table).replaceAll(table, `pg_temp.atlas_experience_expected_${i}`).replace('CREATE TABLE ', 'CREATE TEMP TABLE ')).join('\n\n');
}

export function buildMigration() {
  const preflight = tables.map((table, i) => {
    const expected=`pg_temp.atlas_experience_expected_${i}`;
    const checks=integrityChecks.filter(check=>check.table===table);
    return `
 IF to_regclass('${table}') IS NOT NULL THEN
   LOCK TABLE ${table} IN ACCESS EXCLUSIVE MODE;
   IF pg_temp.atlas_experience_signature('${table}'::regclass) IS DISTINCT FROM pg_temp.atlas_experience_signature('${expected}'::regclass) THEN
     -- Compare the whole legacy signature, not just the named CHECKs.
     ${alterChecks(expected,checks,true)}
     IF pg_temp.atlas_experience_signature('${table}'::regclass) IS DISTINCT FROM pg_temp.atlas_experience_signature('${expected}'::regclass) THEN
       RAISE EXCEPTION 'EXPERIENCE_SCHEMA_DRIFT: ${table}; reconcile columns, constraints, indexes, RLS, policies, triggers and grants before retrying';
     END IF;
     ${alterChecks(table,checks,false)}
     ${alterChecks(expected,checks,false)}
   END IF;
 END IF;`;
  }).join('\n');
  const install = tables.map(table => `DO $install$
BEGIN
 IF to_regclass('${table}') IS NULL THEN
${canonicalBlocks(table)}
 END IF;
END $install$;`).join('\n\n');
  return `-- Generated from canonical ATLAS EXPERIENCE FOUNDATION blocks.
-- Check: pnpm --dir server/db run db:verify:experience-foundation
-- Rebuild only this pending migration: pnpm --dir server/db run db:generate:experience-foundation
-- Atomic reconciliation: compatible existing tables/data remain untouched; drift aborts.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SET LOCAL search_path=pg_catalog;
SELECT pg_advisory_xact_lock(hashtextextended('athyper:experience-foundation:20260910',0));

${expectedTablesSql()}

${signatureFunction}

DO $preflight$
BEGIN${preflight}
END $preflight$;

${install}

DROP TABLE pg_temp.atlas_experience_expected_0, pg_temp.atlas_experience_expected_1;
DROP FUNCTION pg_temp.atlas_experience_signature(regclass);
COMMIT;
`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args=process.argv.slice(2);
  if(args.length!==1||!['--check','--write'].includes(args[0]))throw Error('Expected --check or --write');
  const path=resolve(databaseRoot,'migrations',migrationName), expected=buildMigration();
  if(args[0]==='--write')writeFileSync(path,expected);
  else if(readFileSync(path,'utf8')!==expected)throw Error('Experience migration differs from canonical blocks');
  for(const plane of ['studio','neon','mesh']){
    const manifest=readFileSync(resolve(databaseRoot,`migrations/manifests/${plane}.txt`),'utf8').split(/\r?\n/);
    if(manifest.filter(line=>line.trim()===migrationName).length!==1)throw Error(`Migration must appear once in ${plane} manifest`);
    const foundation=readFileSync(resolve(databaseRoot,`ddl/planes/${plane}/_manifest.txt`),'utf8').split(/\r?\n/);
    for(const schema of ['ai','runtime_meta'])for(const stage of stages)if(foundation.filter(line=>line.trim()===`common/${schema}/${stage}`).length!==1)throw Error(`Canonical stage missing/duplicated: ${plane}/${schema}/${stage}`);
  }
  console.log('Experience foundation and three-plane migration manifests match.');
}
