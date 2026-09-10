// DEV Cirrus operator migration. No browser identity, grants or approvals are used.
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import { planAdoption, assertCurrent } from './atlas-baseline-adoption-model.mjs';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const rollbackIndex = args.indexOf('--rollback');
const rollbackId = rollbackIndex < 0 ? null : args[rollbackIndex + 1];
if (args.some((arg, i) => !['--apply', '--rollback'].includes(arg) && !(rollbackIndex >= 0 && i === rollbackIndex + 1)) || (rollbackIndex >= 0 && !/^[0-9a-f-]{36}$/.test(rollbackId ?? ''))) throw Error('Usage: adopt-atlas-neon-baseline.mjs [--apply] [--rollback <import-id>]');
const tenantId = '44444444-4444-4444-8444-444444444444';
const base = JSON.parse(readFileSync('docs/examples/atlas-f5/cirrus-bp-release-baseline.json', 'utf8'));
const expected = { ...base, tenantId, entityCode: 'business_partner' };
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const psqlArgs = plane => ['exec', '-i', 'athyper-dev-db-1', 'psql', '-X', '-qAt', '-U', 'postgres', '-d', `athyper_${plane}`, '-v', 'ON_ERROR_STOP=1'];
const runStudio = input => { try { return execFileSync('docker', psqlArgs('studio'), { input, encoding: 'utf8', timeout: 20000, maxBuffer: 4e6, stdio: ['pipe', 'pipe', 'pipe'] }); } catch { throw Error('Studio adoption transaction failed; rolled back. Inspect database diagnostics locally.'); } };
const schema = readFileSync('server/db/migrations/20260910_entity_baseline_import.sql', 'utf8').replace(/^BEGIN;\s*/, '').replace(/COMMIT;\s*$/, '');
const migrationName = '20260910_entity_baseline_import.sql';
const migrationHash = createHash('sha256').update(readFileSync('server/db/migrations/'+migrationName)).digest('hex');
const end = apply ? 'COMMIT;' : 'ROLLBACK;';
const preamble = `BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='15s';
 SELECT set_config('app.current_tenant_id',${quote(tenantId)},true);
 DO $$ BEGIN IF current_database()<>'athyper_studio' OR NOT EXISTS(SELECT 1 FROM master.tenant WHERE id=${quote(tenantId)}::uuid AND code='cirrusatlantic' AND status='active') THEN RAISE EXCEPTION 'Unexpected adoption target'; END IF; END $$;
 SELECT pg_advisory_xact_lock(hashtextextended(${quote(tenantId + ':' + base.publicationKey)},0));
 SELECT to_regclass('metadata.entity_baseline_import') IS NULL AS install_schema \\gset
 \\if :install_schema
 ${schema}
 INSERT INTO public.athyper_schema_migration_v1(migration_name,sha256,status,runner_id,completed_at)
 VALUES(${quote(migrationName)},${quote(migrationHash)},'applied','atlas-baseline-adoption',clock_timestamp());
 \\endif
 DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.athyper_schema_migration_v1 WHERE migration_name=${quote(migrationName)} AND sha256=${quote(migrationHash)} AND status='applied') THEN RAISE EXCEPTION 'Baseline schema migration evidence mismatch'; END IF; END $$;
`;

if (rollbackId) {
  const result = runStudio(`${preamble}
  SELECT pg_advisory_xact_lock(hashtextextended(${quote(rollbackId)},0));
  DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM metadata.entity_baseline_import WHERE id=${quote(rollbackId)}::uuid AND tenant_id=${quote(tenantId)}::uuid AND publication_key=${quote(base.publicationKey)}) THEN RAISE EXCEPTION 'Import unavailable'; END IF; END $$;
  INSERT INTO metadata.entity_baseline_import_revocation(baseline_id,tenant_id,reason)
  VALUES(${quote(rollbackId)}::uuid,${quote(tenantId)}::uuid,'Operator rollback of baseline adoption; source runtime unchanged') ON CONFLICT DO NOTHING;
  SELECT jsonb_build_object('baselineId',${quote(rollbackId)},'revoked',true,'runtimeChanged',false);
  ${end}`);
  const receipt = {schema:'atlas-baseline-adoption-receipt/1', observedAt:new Date().toISOString(), environment:'dev', applied:apply, action:'revoke_import', result:JSON.parse(result.split('\n').find(line=>line.startsWith('{')))};
  writeFileSync(`docs/examples/atlas-f5/cirrus-baseline-revocation.${apply?'applied':'dry-run'}.json`,JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify(receipt));
} else {
  // Keep all four source rows locked until Studio commits. Activation must update
  // the head, so it cannot race the cross-database capture/adoption boundary.
  const source = spawn('docker', psqlArgs('neon'), {stdio:['pipe','pipe','pipe']});
  const lines = createInterface({input:source.stdout});
  let pending;
  source.stdin.on('error', () => pending?.reject(Error('Source capture connection closed')));
  source.stderr.resume(); // Never print SQL payloads or raw database diagnostics.
  const sourceDone = new Promise(resolve => source.once('close', resolve));
  source.on('error', () => pending?.reject(Error('Source database unavailable')));
  source.on('close', () => pending?.reject(Error('Source capture ended before completion')));
  lines.on('line', line => { if (line.startsWith('ATLAS_CAPTURE:') && pending) { const p=pending; pending=undefined; const rows=JSON.parse(line.slice(14)); if(!Array.isArray(rows)||rows.length!==1)p.reject(Error('Expected exactly one active baseline'));else p.resolve(rows[0]); } });
  const query = `WITH locked AS (SELECT jsonb_build_object('contract',to_jsonb(c),'descriptor',to_jsonb(d),'head',to_jsonb(h),'applied',to_jsonb(a)) AS capture
    FROM runtime_meta.release_activation_head h JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id
    JOIN runtime_meta.entity_contract c ON c.publication_key=h.publication_key AND c.release_id=a.source_release_id
    JOIN runtime_meta.entity_descriptor d ON d.entity_contract_id=c.id AND d.applied_release_id=a.id
    WHERE h.publication_key=${quote(base.publicationKey)} AND c.tenant_id=${quote(tenantId)}::uuid
      AND d.tenant_id=c.tenant_id AND d.plane_code='neon' AND d.descriptor_kind='entity_runtime' AND d.status='active'
    FOR SHARE OF h,a,c,d) SELECT 'ATLAS_CAPTURE:' || COALESCE(jsonb_agg(capture),'[]'::jsonb)::text FROM locked;`;
  const capture = () => new Promise((resolve,reject) => {
    const timer=setTimeout(()=>{pending=undefined;reject(Error('Source capture missing or timed out'));},12000);
    pending={resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}};
    source.stdin.write(query+'\n');
  });
  try {
    source.stdin.write("BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='10s'; SET LOCAL idle_in_transaction_session_timeout='30s';\n");
    const imported = planAdoption(await capture(), expected);
    // Capture twice to exercise the exact freshness predicate used by consumers.
    assertCurrent(imported, await capture());
    const importId=randomUUID();
    const result=runStudio(`${preamble}
      INSERT INTO metadata.entity_baseline_import(id,tenant_id,publication_key,source_release_id,source_release_no,entity_code,source_entity_id,source_plane,content_hash,payload)
      VALUES(${quote(importId)}::uuid,${quote(tenantId)}::uuid,${quote(imported.publicationKey)},${quote(imported.sourceReleaseId)}::uuid,${imported.sourceReleaseNo},${quote(imported.entityCode)},${quote(imported.sourceEntityId)}::uuid,'neon',${quote(imported.contentHash)},${quote(JSON.stringify(imported))}::jsonb)
      ON CONFLICT(tenant_id,publication_key,source_release_id) DO NOTHING;
      DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM metadata.entity_baseline_import b WHERE tenant_id=${quote(tenantId)}::uuid AND publication_key=${quote(imported.publicationKey)} AND source_release_id=${quote(imported.sourceReleaseId)}::uuid AND payload=${quote(JSON.stringify(imported))}::jsonb AND NOT EXISTS(SELECT 1 FROM metadata.entity_baseline_import_revocation r WHERE r.baseline_id=b.id)) THEN RAISE EXCEPTION 'Import conflict or revoked baseline'; END IF; END $$;
      SET CONSTRAINTS ALL IMMEDIATE;
      SELECT jsonb_build_object('baselineId',id,'contentHash',content_hash,'sourceReleaseNo',source_release_no,'nativeReleasesCreated',0,'permissionsChanged',false,'runtimeChanged',false) FROM metadata.entity_baseline_import WHERE tenant_id=${quote(tenantId)}::uuid AND publication_key=${quote(imported.publicationKey)} AND source_release_id=${quote(imported.sourceReleaseId)}::uuid;
      ${end}`);
    const receipt={schema:'atlas-baseline-adoption-receipt/1',observedAt:new Date().toISOString(),environment:'dev',tenantId,applied:apply,action:'adopt_baseline',result:JSON.parse(result.split('\n').find(line=>line.startsWith('{'))),provenance:imported.provenance};
    writeFileSync(`docs/examples/atlas-f5/cirrus-baseline-adoption.${apply?'applied':'dry-run'}.json`,JSON.stringify(receipt,null,2)+'\n');
    writeFileSync('docs/examples/atlas-f5/cirrus-baseline-import.json',JSON.stringify(imported,null,2)+'\n');
    console.log(JSON.stringify(receipt));
  } finally {
    source.stdin.end('ROLLBACK;\n\\q\n');
    await sourceDone;
    lines.close();
  }
}
