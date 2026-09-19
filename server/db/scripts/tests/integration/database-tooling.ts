import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { catalogQueries, catalogMap, compare, type CatalogRow } from '../../lib/database-catalog.js';

const root = resolve(import.meta.dirname, '../../..');
const container = `athyper-db-review-tooling-${randomUUID().slice(0, 8)}`;
const fixture = mkdtempSync(resolve(tmpdir(), 'athyper-db-tooling-'));
const ddl = resolve(fixture, 'ddl');
function run(command: string, args: string[], input?: string): string {
  return execFileSync(command, args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}
function sql(query: string, database = 'athyper_neon'): string {
  return run('docker', ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', database, '-At', '-v', 'ON_ERROR_STOP=1'], query).trim();
}
function foundation(...args: string[]): string {
  return run('pnpm', ['--dir', root, 'exec', 'tsx', 'scripts/provisioning/foundation-runner.ts', '--plane=neon', `--container=${container}`, `--ddl-root=${ddl}`, ...args]);
}
function snapshot(): Record<string, Map<string, string>> {
  return Object.fromEntries(Object.entries(catalogQueries).map(([category, query]) => {
    const rows = JSON.parse(sql(`SELECT coalesce(json_agg(r),'[]'::json) FROM (${query.replaceAll('$1::text[]', "ARRAY['probe']::text[]")}) r;`)) as CatalogRow[];
    return [category, catalogMap(rows)];
  }));
}
function detects(category: string, change: string): void {
  const before = snapshot();
  sql(change);
  const after = snapshot();
  assert.ok(compare(before[category]!, after[category]!).changed.length > 0, `${category} must detect ${change}`);
}
try {
  run('docker', ['run', '-d', '--name', container, '--network', 'none', '--tmpfs', '/var/lib/postgresql/data', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:16.13-bookworm']);
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { run('docker', ['exec', container, 'pg_isready', '-U', 'postgres']); ready = true; break; }
    catch { await setTimeout(500); }
  }
  assert.ok(ready, 'disposable PostgreSQL must start');
  sql('CREATE DATABASE athyper_neon;', 'postgres');
  mkdirSync(resolve(ddl, 'planes/neon'), { recursive: true });
  mkdirSync(resolve(ddl, 'common/_database'), { recursive: true });
  const ledger = readFileSync(resolve(root, 'ddl/common/_database/02_schema_provisions.sql'), 'utf8');
  writeFileSync(resolve(ddl, 'common/_database/02_schema_provisions.sql'), ledger);
  writeFileSync(resolve(ddl, 'bootstrap.sql'), 'SELECT 1;');
  writeFileSync(resolve(ddl, 'skipped.sql'), 'CREATE TABLE public.should_exist(id integer);');
  writeFileSync(resolve(ddl, 'final.sql'), 'CREATE TABLE public.final_result AS SELECT * FROM public.allow_finish;');
  writeFileSync(resolve(ddl, 'planes/neon/_manifest.txt'), 'bootstrap.sql\ncommon/_database/02_schema_provisions.sql\nskipped.sql\nfinal.sql\n');
  sql(ledger);
  assert.throws(() => foundation('--resume-from=final.sql'), /receipt count mismatch/);
  assert.equal(sql("SELECT count(*) FROM public.schema_provisions;"), '0');
  assert.equal(sql("SELECT to_regclass('public.final_result') IS NULL;"), 't');
  assert.throws(() => foundation('--resume-from=final.sql', '--no-receipts'), /receipted prefix/);
  assert.throws(() => foundation('--resume-from=common/_database/02_schema_provisions.sql'), /receipted prefix/);
  assert.throws(() => foundation('--resume-from=bootstrap.sql'), /not fresh/);
  sql('DROP DATABASE athyper_neon; CREATE DATABASE athyper_neon;', 'postgres');
  assert.throws(() => foundation(), /DDL failed at final.sql/);
  assert.equal(sql('SELECT count(*) FROM public.schema_provisions;'), '3');
  assert.equal(sql("SELECT to_regclass('public.should_exist') IS NOT NULL;"), 't');
  const checksum = sql("SELECT checksum FROM public.schema_provisions WHERE file_name='skipped.sql';");
  sql("UPDATE public.schema_provisions SET checksum=repeat('0',64) WHERE file_name='skipped.sql'; CREATE TABLE public.allow_finish(id integer);");
  assert.throws(() => foundation('--resume-from=final.sql'), /receipt mismatch/);
  assert.equal(sql("SELECT to_regclass('public.final_result') IS NULL;"), 't');
  sql(`UPDATE public.schema_provisions SET checksum='${checksum}' WHERE file_name='skipped.sql';`);
  const result = JSON.parse(foundation('--resume-from=final.sql'));
  assert.equal(result.results[0].receiptCount, 4);
  assert.equal(sql("SELECT to_regclass('public.final_result') IS NOT NULL;"), 't');
  console.log('PASS: resume refuses missing/mismatched receipts and unreceipted bootstrap; fresh failure and valid resume preserve receipts');

  sql(`CREATE SCHEMA probe;
    CREATE ROLE probe_reader; CREATE ROLE probe_owner;
    CREATE TABLE probe.t(id integer, label text DEFAULT 'a  b');
    CREATE VIEW probe.v WITH(security_invoker=true,security_barrier=true) AS SELECT id FROM probe.t WHERE id=1;
    CREATE MATERIALIZED VIEW probe.mv AS SELECT id FROM probe.t WHERE id=1;
    CREATE FUNCTION probe.f() RETURNS text LANGUAGE sql AS $$ SELECT 'a  b'::text $$;`);
  const baseline = snapshot();
  assert.deepEqual(snapshot(), baseline, 'unchanged catalogs must match');
  detects('relation_security', 'ALTER VIEW probe.v RESET(security_invoker);');
  detects('relation_security', 'ALTER VIEW probe.v RESET(security_barrier);');
  detects('views', 'CREATE OR REPLACE VIEW probe.v AS SELECT id FROM probe.t;');
  detects('views', 'DROP MATERIALIZED VIEW probe.mv; CREATE MATERIALIZED VIEW probe.mv AS SELECT id FROM probe.t;');
  detects('relation_security', 'GRANT SELECT ON probe.t TO probe_reader;');
  detects('relation_security', 'GRANT SELECT ON probe.t TO PUBLIC;');
  detects('column_privileges', 'GRANT UPDATE(label) ON probe.t TO probe_reader;');
  detects('relation_security', 'ALTER VIEW probe.v OWNER TO probe_owner;');
  detects('function_security', 'REVOKE EXECUTE ON FUNCTION probe.f() FROM PUBLIC;');
  detects('function_security', 'ALTER FUNCTION probe.f() OWNER TO probe_owner;');
  detects('columns', "ALTER TABLE probe.t ALTER COLUMN label SET DEFAULT 'a b';");
  detects('functions', "CREATE OR REPLACE FUNCTION probe.f() RETURNS text LANGUAGE sql AS $$ SELECT 'a b'::text $$;");
  // ACL insertion order must not produce false drift.
  const grantsBefore = snapshot();
  sql('REVOKE SELECT ON probe.t FROM probe_reader; GRANT SELECT ON probe.t TO probe_reader;');
  assert.deepEqual(snapshot(), grantsBefore);
  console.log('PASS: view definitions/options, owners, ACLs and literal changes are detected; unchanged/reordered ACLs match');
} finally {
  try { run('docker', ['rm', '-f', container]); }
  finally { rmSync(fixture, { recursive: true, force: true }); }
}
