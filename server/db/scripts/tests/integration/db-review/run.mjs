// Real PostgreSQL regression/upgrade checks. Restricted to disposable Docker targets.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
const root = resolve(import.meta.dirname, '../../../..');
const supplied = process.argv.find(x => x.startsWith('--container='))?.split('=')[1];
const container = supplied ?? `athyper-db-fix-${randomUUID().slice(0, 8)}`;
if (!/^athyper-db-(?:fix|review)-[a-z0-9-]+$/.test(container)) throw new Error('Only an isolated athyper-db-fix-* or athyper-db-review-* container is allowed');
async function run(command, args, input = '') {
  return new Promise((ok, fail) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', chunk => out += chunk);
    child.stderr.on('data', chunk => err += chunk);
    child.on('error', fail);
    child.on('close', code => code === 0 ? ok(out.trim()) : fail(new Error(`${command} exited ${code}: ${err}\n${out}`)));
    child.stdin.end(input);
  });
}
const docker = (...args) => run('docker', args);
const sql = (plane, input) => run('docker', ['exec', '-i', container, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', `athyper_${plane}`, '-v', 'ON_ERROR_STOP=1', '-f', '-'], input);
const file = path => readFile(resolve(root, path), 'utf8');
const pass = label => process.stdout.write(`PASS ${label}\n`);
const context = `SET app.database_plane='mesh';
SET app.current_tenant_id='10000000-0000-4000-8000-000000000001';
SET app.current_principal_id='20000000-0000-4000-8000-000000000001';
SET app.current_network_account_id='30000000-0000-4000-8000-000000000001';`;
function definition(source, name) {
  const match = source.match(new RegExp(`CREATE OR REPLACE FUNCTION ${name.replaceAll('.', '\\.')}\\([\\s\\S]*?END\\s*\\$\\$;`));
  assert.ok(match, name);
  return match[0];
}
try {
  if (!supplied) {
    await docker('run', '-d', '--name', container, '--network', 'none', '--tmpfs', '/var/lib/postgresql/data', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:16.13-bookworm');
    for (let attempts = 0; ; attempts++) {
      try { await docker('exec', container, 'pg_isready', '-U', 'postgres'); break; }
      catch (e) { if (attempts >= 30) throw e; await new Promise(r => setTimeout(r, 500)); }
    }
  }
  const [inspection] = JSON.parse(await docker('inspect', container));
  assert.equal(inspection.HostConfig.NetworkMode, 'none');
  assert.ok(Object.hasOwn(inspection.HostConfig.Tmpfs, '/var/lib/postgresql/data'));
  if (!supplied) {
    // Role-optional migrations must work before application roles exist.
    await docker('exec',container,'createdb','-U','postgres','athyper_grants');
    await sql('grants', `CREATE SCHEMA master; CREATE SCHEMA shared;
      CREATE TABLE master.saved_view_default(id integer);
      CREATE MATERIALIZED VIEW master.mv_company_postable_account AS SELECT '10000000-0000-4000-8000-000000000001'::uuid tenant_id;
      CREATE FUNCTION shared.current_tenant_id_soft() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid';
      GRANT SELECT ON master.mv_company_postable_account TO PUBLIC;`);
    for (let attempt=0;attempt<2;attempt++) for (const migration of ['20260910_saved_view_runtime_grants.sql','20260910_account_cache_isolation.sql','20260910_saved_view_legacy_grant_cleanup.sql']) {
      await sql('grants',await file(`migrations/${migration}`));
    }
    assert.equal(await sql('grants', "SELECT count(*) FROM pg_class c, LATERAL aclexplode(c.relacl) a WHERE c.oid='master.mv_company_postable_account'::regclass AND a.grantee=0"),'0');
    await sql('grants', 'CREATE ROLE athyperapp NOLOGIN; CREATE ROLE athyper_runtime NOLOGIN; GRANT SELECT,INSERT,UPDATE ON master.saved_view_default TO athyper_runtime; GRANT SELECT ON master.mv_company_postable_account TO athyperapp;');
    for (let attempt=0;attempt<2;attempt++) for (const migration of ['20260910_saved_view_runtime_grants.sql','20260910_account_cache_isolation.sql','20260910_saved_view_legacy_grant_cleanup.sql']) {
      await sql('grants',await file(`migrations/${migration}`));
    }
    assert.equal(await sql('grants', "SELECT has_table_privilege('athyperapp','master.saved_view_default','SELECT,INSERT,UPDATE') AND has_table_privilege('athyperapp','master.v_company_postable_account','SELECT') AND NOT has_table_privilege('athyperapp','master.mv_company_postable_account','SELECT') AND NOT has_table_privilege('athyper_runtime','master.saved_view_default','SELECT,INSERT,UPDATE')"),'t');
    await docker('exec',container,'dropdb','-U','postgres','athyper_grants');
    await docker('exec',container,'psql','-X','-U','postgres','-d','postgres','-c','DROP ROLE athyperapp; DROP ROLE athyper_runtime;');
    pass('optional-role upgrades, unconditional PUBLIC revoke, and legacy grant cleanup');
  }
  if (!supplied) for (const plane of ['studio', 'neon', 'mesh']) {
    await run('pnpm', ['--dir', root, 'exec', 'tsx', 'scripts/provisioning/foundation-runner.ts', `--plane=${plane}`, `--container=${container}`]);
    pass(`${plane} fresh foundation`);
  }
  // A drifted installation gets actionable IDs and no partial constraint change.
  await docker('exec',container,'createdb','-U','postgres','athyper_preflight');
  await sql('preflight', `CREATE SCHEMA ai; CREATE TABLE ai.ai_agent_call(id uuid PRIMARY KEY,outcome text NOT NULL,usage_source text NOT NULL);
    INSERT INTO ai.ai_agent_call VALUES('a0000000-0000-4000-8000-000000000001','completed','unavailable');`);
  const usagePreflight = await file('migrations/20260910_ai_call_usage_preflight.sql');
  await assert.rejects(sql('preflight',usagePreflight), error => {
    assert.match(error.message,/AI_CALL_USAGE_INCOMPATIBLE: found 1 incompatible/);
    assert.match(error.message,/a0000000-0000-4000-8000-000000000001/);
    return true;
  });
  assert.equal(await sql('preflight',"SELECT usage_source FROM ai.ai_agent_call"),'unavailable');
  assert.equal(await sql('preflight',"SELECT count(*) FROM pg_constraint WHERE conname='ai_agent_call_aac_completed_usage_chk'"),'0');
  await sql('preflight',"DELETE FROM ai.ai_agent_call;");
  await sql('preflight', "INSERT INTO ai.ai_agent_call SELECT md5(i::text)::uuid,'completed','unavailable' FROM generate_series(1,25) i;");
  await assert.rejects(sql('preflight',usagePreflight), error => {
    assert.match(error.message,/found 20 incompatible completed call\(s\) in a sample capped at 20/);
    const detail = error.message.split('Sample call IDs (not a total count): ')[1].split('\n')[0];
    assert.equal(detail.split(', ').length,20);
    return true;
  });
  await sql('preflight', "DELETE FROM ai.ai_agent_call;");
  for (let attempt=0;attempt<2;attempt++) await sql('preflight',usagePreflight);
  assert.equal(await sql('preflight',"SELECT convalidated FROM pg_constraint WHERE conname='ai_agent_call_aac_completed_usage_chk'"),'t');
  // Simulate absent names before the real manifest-driven deployment.
  for (const plane of ['studio','neon','mesh']) await sql(plane,'ALTER TABLE ai.ai_agent_call DROP CONSTRAINT ai_agent_call_aac_completed_usage_chk;');
  await sql('mesh','ALTER TABLE mesh.network_relationship_capability DROP CONSTRAINT network_relationship_capability_approval_chk;');
  pass('AI compatibility diagnostics, rollback, and repeatable missing-constraint repair');
  // Exercise both fresh definitions and actual upgrades from the vulnerable views.
  for (let upgrade = 0; upgrade < 2; upgrade++) {
    if (upgrade) {
      for (const plane of ['studio', 'neon', 'mesh']) {
        await sql(plane, `ALTER VIEW document.active_attachment RESET (security_invoker,security_barrier);
          ALTER VIEW document.active_comment RESET (security_invoker,security_barrier);
          DROP TABLE master.saved_view_default;`);
        for (const migration of ['20260908_entity_saved_views.sql','20260908_entity_standard_view_defaults.sql','20260910_saved_view_runtime_grants.sql','20260910_tenant_view_isolation.sql']) {
          await sql(plane, await file(`migrations/${migration}`));
        }
      }
      await sql('neon', 'DROP VIEW master.v_company_postable_account; GRANT SELECT ON master.mv_company_postable_account TO athyperapp;');
      await sql('neon', await file('migrations/20260910_account_cache_isolation.sql'));
    }
    for (const plane of ['studio','neon','mesh']) {
      await sql(plane, await file('scripts/tests/integration/db-review/tenant-isolation.sql'));
    }
    await sql('neon', await file('scripts/tests/integration/db-review/account-isolation.sql'));
    pass(`${upgrade ? 'upgraded' : 'fresh'} tenant view isolation and application saved defaults`);
  }
  // The deployment entrypoint must execute every newly registered migration.
  // These four historical migrations are already represented by fresh DDL.
  await docker('cp', resolve(root, 'migrations'), `${container}:/tmp/review-migrations`);
  await docker('cp', resolve(root, 'runtime/run-forward-migrations.sh'), `${container}:/tmp/review-forward.sh`);
  await docker('exec', container, 'sh', '-c', 'printf test > /tmp/review-password');
  for (const plane of ['studio','neon','mesh']) {
    const manifest = (await file(`migrations/manifests/${plane}.txt`)).split(/\r?\n/).filter(x => x && !x.startsWith('#'));
    await sql(plane, `CREATE TABLE public.athyper_schema_migration_v1 (
      migration_name text PRIMARY KEY, sha256 text NOT NULL, status text NOT NULL,
      runner_id text NOT NULL, started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      completed_at timestamptz, failure_message text);`);
    for (const name of manifest.filter(x => /^2026090[679]_/.test(x))) {
      const checksum = (await docker('exec',container,'sha256sum',`/tmp/review-migrations/${name}`)).split(' ')[0];
      await sql(plane, `INSERT INTO public.athyper_schema_migration_v1(migration_name,sha256,status,runner_id) VALUES('${name}','${checksum}','applied','foundation-baseline');`);
    }
  }
  for (let attempt=0; attempt<2; attempt++) await docker('exec',
    '-e','ATHYPER_MIGRATION_ROOT=/tmp/review-migrations',
    '-e','ATHYPER_POSTGRES_PASSWORD_FILE=/tmp/review-password',
    '-e','PGHOST=/var/run/postgresql',container,'sh','/tmp/review-forward.sh');
  for (const plane of ['studio','neon','mesh']) {
    const manifest = (await file(`migrations/manifests/${plane}.txt`)).split(/\r?\n/).filter(x => x && !x.startsWith('#'));
    assert.equal(await sql(plane, "SELECT count(*) FROM public.athyper_schema_migration_v1 WHERE status='applied'"),String(manifest.length));
    await sql(plane, await file('scripts/tests/integration/db-review/tenant-isolation.sql'));
  }
  await sql('neon',await file('scripts/tests/integration/db-review/account-isolation.sql'));
  pass('forward deployment manifests applied and safely skipped on second run');
  for (const [plane, path] of [['mesh', 'mesh.sql'], ['mesh', 'bank.sql'], ['studio', 'studio.sql']]) {
    await sql(plane, await file(`scripts/tests/integration/db-review/${path}`));
    pass(path);
  }
  // Compare installed definitions before and after upgrades, including repeat application.
  const fingerprint = `SELECT md5(string_agg(pg_get_functiondef(p.oid), E'\\n' ORDER BY p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('mesh','trustiam') AND p.prokind='f';`;
  const before = new Map();
  for (const plane of ['studio', 'mesh']) before.set(plane, await sql(plane, fingerprint));
  for (let attempt=0; attempt<2; attempt++) {
    for (const plane of ['studio', 'neon', 'mesh']) await sql(plane, await file('migrations/20260910_ai_call_usage_constraint.sql'));
    await sql('studio', await file('migrations/20260910_identity_replay_context_hardening.sql'));
    await sql('mesh', await file('migrations/20260910_mesh_command_hardening.sql'));
    await sql('mesh', await file('migrations/20260910_mesh_discovery_current_status.sql'));
  }
  for (const plane of ['studio', 'mesh']) assert.equal(await sql(plane, fingerprint), before.get(plane), `${plane} migration function parity`);
  pass('upgrade/fresh function parity and repeated migration application');
  // Also exercise the pre-G4 baseline found in development. Renaming retains
  // fixture FKs, while making the feature absent to migration discovery.
  await sql('mesh', `DROP FUNCTION mesh.command_retrieve_bank_protected_token(uuid,integer,text,text,uuid);
    ALTER TABLE mesh.bank_disclosure_purpose RENAME TO review_saved_bank_disclosure_purpose;
    ALTER TABLE mesh.bank_account_retrieval_evidence RENAME TO review_saved_bank_retrieval_evidence;`);
  await sql('mesh', await file('migrations/20260910_mesh_command_hardening.sql'));
  await sql('mesh', await file('migrations/20260910_mesh_discovery_current_status.sql'));
  assert.equal(await sql('mesh', "SELECT to_regprocedure('mesh.command_retrieve_bank_protected_token(uuid,integer,text,text,uuid)') IS NULL;"), 't');
  await sql('mesh', `ALTER TABLE mesh.review_saved_bank_disclosure_purpose RENAME TO bank_disclosure_purpose;
    ALTER TABLE mesh.review_saved_bank_retrieval_evidence RENAME TO bank_account_retrieval_evidence;` +
    definition(await file('ddl/planes/mesh/mesh/11_grants.sql'), 'mesh.command_retrieve_bank_protected_token') +
    `REVOKE ALL ON FUNCTION mesh.command_retrieve_bank_protected_token(uuid,integer,text,text,uuid) FROM PUBLIC;
     GRANT EXECUTE ON FUNCTION mesh.command_retrieve_bank_protected_token(uuid,integer,text,text,uuid) TO athyper_protected_value_retriever;`);
  pass('pre-G4 upgrade repairs discovery without installing protected retrieval');
  // Recreate the pre-receipt discovery command to verify genuine legacy retries.
  const old = await file('migrations/20260906_mesh_exchange_readiness.sql');
  await sql('mesh', definition(old, 'mesh.command_discover_network_relationship') + '\nDROP TABLE mesh.network_discovery_receipt;');
  const legacyCall = `SELECT * FROM mesh.command_discover_network_relationship('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002',NULL,NULL,'Legacy discovery','review-legacy-discovery','20000000-0000-4000-8000-000000000001')`;
  const original = (await sql('mesh', `${context}\nSET TIME ZONE 'Etc/GMT+12';\n${legacyCall};`)).split('|');
  assert.equal(original.at(-1), 'f');
  await sql('mesh', await file('migrations/20260910_mesh_command_hardening.sql'));
  await sql('mesh', await file('migrations/20260910_mesh_discovery_current_status.sql'));
  const replay = (await sql('mesh', `${context}\nSET TIME ZONE 'Etc/GMT-14';\n${legacyCall};`)).split('|');
  assert.deepEqual(replay.slice(0,3), original.slice(0,3));
  assert.equal(replay.at(-1), 't');
  pass('legacy NULL-date discovery survives upgrade and date change');
  // A concurrent relationship update must block a new token retrieval until it
  // commits; once it commits suspension, the waiting retriever must fail closed.
  await sql('mesh', `BEGIN; SET LOCAL session_replication_role=replica; UPDATE mesh.network_relationship SET status='terminated' WHERE buyer_tenant_id='10000000-0000-4000-8000-000000000001'; UPDATE mesh.network_relationship SET status='active' WHERE id=(SELECT network_relationship_id FROM mesh.bank_account_disclosure WHERE id='40000000-0000-4000-8000-000000000003'); COMMIT;`);
  const lockKey = 9102026;
  const locker = sql('mesh', `BEGIN; SET LOCAL session_replication_role=replica; UPDATE mesh.network_relationship SET status='suspended' WHERE id=(SELECT network_relationship_id FROM mesh.bank_account_disclosure WHERE id='40000000-0000-4000-8000-000000000003'); SELECT pg_advisory_xact_lock(${lockKey}); SELECT pg_sleep(2); COMMIT;`);
  // Observe the actual lock, rather than assuming the locker won a timing race.
  for (let i=0;;i++) {
    const locked = await sql('mesh', `SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=${lockKey} AND granted);`);
    if (locked === 't') break;
    if (i>40) throw new Error('concurrent revocation did not acquire its lock');
    await new Promise(r => setTimeout(r,25));
  }
  await assert.rejects(sql('mesh', `${context}\nSET SESSION AUTHORIZATION db_review_retriever; SELECT * FROM mesh.command_retrieve_bank_protected_token('40000000-0000-4000-8000-000000000003',1,'Concurrent retrieval','review-concurrent-retrieval','20000000-0000-4000-8000-000000000001');`), /Relationship is unavailable/);
  await locker;
  pass('concurrent committed suspension rejects waiting retrieval');
  for (const plane of ['studio', 'neon', 'mesh']) {
    const failures = await sql(plane, `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND NOT c.relispartition AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname IN ('tenant_id','authority_tenant_id','actor_tenant_id') AND NOT a.attisdropped) AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity OR NOT EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid));`);
    assert.equal(failures, '0', `${plane} RLS catalog`);
  }
  pass('three-plane RLS catalog including discovery receipts');
  assert.equal(await sql('mesh', `SELECT EXISTS(
    SELECT 1 FROM pg_proc f JOIN pg_roles owner ON owner.oid=f.proowner
    WHERE f.oid='mesh.command_discover_network_relationship(uuid,uuid,uuid,uuid,date,date,text,text,uuid)'::regprocedure
      AND (owner.rolsuper OR owner.rolbypassrls OR EXISTS(
        SELECT 1 FROM pg_policy p WHERE p.polrelid='mesh.network_discovery_receipt'::regclass
          AND p.polcmd='*' AND (f.proowner=ANY(p.polroles) OR 0=ANY(p.polroles))
      )))`),'t');
  pass('discovery function owner is covered by the private receipt RLS policy');

} finally {
  if (!supplied) await docker('rm', '-f', container);
}
