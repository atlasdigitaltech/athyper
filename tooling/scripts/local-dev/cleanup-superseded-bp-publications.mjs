// DEV-only, exact publication keys; never removes an activation head or live binding.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';

const keys = "('metadata.compiled_entity.business_partner','metadata.compiled_entity.business_partner.tenant.11111111-1111-4111-8111-111111111111')";
const targets = `SELECT id FROM runtime_meta.applied_release WHERE status='superseded' AND publication_key IN ${keys}`;
const bindings = `SELECT id FROM authz.entity_operation_binding WHERE applied_release_id IN (${targets})`;
// Delete order; recovery inserts in reverse order.
const tables = [
  ['authz.entity_operation_scope_binding', `entity_operation_binding_id IN (${bindings})`],
  ['authz.entity_operation_binding', `applied_release_id IN (${targets})`],
  ['runtime_meta.release_activation_event', `applied_release_id IN (${targets}) OR previous_applied_release_id IN (${targets})`],
  ['runtime_meta.applied_release_payload', `applied_release_id IN (${targets})`],
  ['runtime_meta.applied_release', `id IN (${targets})`],
];
// History deletion is intentionally unavailable to application roles. DEV
// maintenance suspends only these guards under transaction-held table locks;
// FK, invalidation, normalization and authorization validation stay enabled.
const historyGuards = [
  ['authz.entity_operation_scope_binding','entity_operation_scope_binding_20_guard'],
  ['authz.entity_operation_binding','entity_operation_binding_90_delete_guard'],
  ['runtime_meta.release_activation_event','runtime_release_activation_event_immutable'],
  ['runtime_meta.applied_release_payload','runtime_applied_release_payload_immutable'],
];
const query = (plane, sql, readOnly = true) => execFileSync('docker', ['exec','-i','athyper-dev-db-1','psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',`athyper_${plane}`],
  {input:`BEGIN ${readOnly?'READ ONLY':''}; SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='5s'; ${sql}\nCOMMIT;`,encoding:'utf8',maxBuffer:128*1024*1024});
const aggregate = (table, where='TRUE') => `(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]'::jsonb) FROM ${table} r WHERE ${where})`;
const snapshotSql = `SELECT jsonb_build_object(${tables.map(([t,w])=>`'${t}',${aggregate(t,w)}`).join(',')})`;
const invariantSql = `SELECT jsonb_build_object('heads',(SELECT jsonb_agg(to_jsonb(h) ORDER BY publication_key) FROM runtime_meta.release_activation_head h),'businessPartners',${aggregate('master.business_partner')},'contracts',${aggregate('runtime_meta.entity_contract')},'descriptors',${aggregate('runtime_meta.entity_descriptor')})`;
const guards = `DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM runtime_meta.release_activation_head WHERE applied_release_id IN (${targets})) THEN RAISE EXCEPTION 'Target is active'; END IF;
 IF EXISTS(SELECT 1 FROM runtime_meta.entity_descriptor WHERE applied_release_id IN (${targets})) THEN RAISE EXCEPTION 'Target has retained descriptor'; END IF;
 IF EXISTS(SELECT 1 FROM authz.entity_operation_binding WHERE applied_release_id IN (${targets}) AND status<>'retired') THEN RAISE EXCEPTION 'Target has non-retired binding'; END IF;
 END $$;`;
const [mode, path] = process.argv.slice(2);
if (mode === 'plan') {
  const inventory = {};
  for (const plane of ['neon','mesh','studio']) inventory[plane] = JSON.parse(query(plane, `SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM (SELECT a.id,a.publication_key,a.source_release_id,a.source_release_no,a.status,(SELECT count(*) FROM runtime_meta.release_activation_head h WHERE h.applied_release_id=a.id) active_heads FROM runtime_meta.applied_release a WHERE a.publication_key IN ${keys} ORDER BY a.publication_key,a.source_release_no) r;`));
  const archive = JSON.parse(query('neon', `${guards} ${snapshotSql};`));
  const beforeHash = query('neon', `SELECT md5((${invariantSql.replace(/^SELECT /,'')})::text);`).trim();
  const hashes = JSON.parse(query('neon', `SELECT jsonb_build_object(${tables.map(([t,w])=>`'${t}',md5(${aggregate(t,w)}::text)`).join(',')});`));
  const recoveryRoot = join(homedir(),'.local','state','athyper','dev-recovery');
  mkdirSync(recoveryRoot,{recursive:true,mode:0o700});
  const directory = mkdtempSync(join(recoveryRoot,'bp-publications-'));
  const backup = join(directory,'recovery.json.gz');
  const bytes = gzipSync(JSON.stringify({capturedAt:new Date().toISOString(),inventory,archive,hashes,beforeHash}));
  writeFileSync(backup,bytes,{mode:0o600});
  const restore = ['BEGIN;', ...[...tables].reverse().map(([table]) => `INSERT INTO ${table} SELECT * FROM jsonb_populate_recordset(NULL::${table},'${JSON.stringify(archive[table]).replaceAll("'","''")}'::jsonb);`), 'COMMIT;'].join('\n');
  writeFileSync(join(directory,'restore.sql.gz'),gzipSync(restore),{mode:0o600});
  console.log(JSON.stringify({backup,sha256:createHash('sha256').update(bytes).digest('hex'),inventory,counts:Object.fromEntries(tables.map(([t])=>[t,archive[t].length]))},null,2));
} else if (mode === 'apply' && path) {
  const saved=JSON.parse(gunzipSync(readFileSync(path)));
  const checks=tables.map(([t,w])=>`IF md5(${aggregate(t,w)}::text)<>'${saved.hashes[t]}' THEN RAISE EXCEPTION 'Backup mismatch: ${t}'; END IF;`).join('\n');
  const invariant = invariantSql.replace(/^SELECT /,'');
  const result=query('neon', `LOCK TABLE ${tables.map(([t])=>t).join(',')},runtime_meta.release_activation_head,runtime_meta.entity_descriptor,runtime_meta.entity_contract,master.business_partner IN SHARE ROW EXCLUSIVE MODE;
 ${guards}
 DO $$ BEGIN ${checks} IF md5((${invariant})::text)<>'${saved.beforeHash}' THEN RAISE EXCEPTION 'Retained data changed since backup'; END IF; END $$;
 DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_trigger WHERE (tgrelid::regclass::text,tgname::text) IN (${historyGuards.map(([t,g])=>`('${t}','${g}')`).join(',')}) AND tgenabled<>'O') THEN RAISE EXCEPTION 'Unexpected history guard state'; END IF; END $$;
 ${historyGuards.map(([t,g])=>`ALTER TABLE ${t} DISABLE TRIGGER ${g};`).join('\n')}
 ${tables.map(([t,w])=>`WITH deleted AS (DELETE FROM ${t} WHERE ${w} RETURNING id) SELECT jsonb_build_object('table','${t}','deleted',count(*)) FROM deleted;`).join('\n')}
 ${historyGuards.map(([t,g])=>`ALTER TABLE ${t} ENABLE TRIGGER ${g};`).join('\n')}
 DO $$ BEGIN IF md5((${invariant})::text)<>'${saved.beforeHash}' THEN RAISE EXCEPTION 'Retained data changed'; END IF; END $$;`, false);
  console.log(result);
} else if (mode === 'verify-recovery' && path) {
  const saved=JSON.parse(gunzipSync(readFileSync(path)));
  const insert=[...tables].reverse().map(([table])=>`INSERT INTO ${table} SELECT * FROM jsonb_populate_recordset(NULL::${table},'${JSON.stringify(saved.archive[table]).replaceAll("'","''")}'::jsonb);`).join('\n');
  const checks=tables.map(([t,w])=>`IF md5(${aggregate(t,w)}::text)<>'${saved.hashes[t]}' THEN RAISE EXCEPTION 'Recovery mismatch: ${t}'; END IF;`).join('\n');
  execFileSync('docker',['exec','-i','athyper-dev-db-1','psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','athyper_neon'],{input:`BEGIN; SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='5s'; ${insert} DO $$ BEGIN ${checks} END $$; ROLLBACK;`,encoding:'utf8',maxBuffer:128*1024*1024});
  console.log('Recovery rows restored and hash-verified inside a rolled-back transaction; cleanup remains committed.');
} else throw Error('Usage: cleanup-superseded-bp-publications.mjs plan | apply <recovery.json.gz> | verify-recovery <recovery.json.gz>');
