#!/usr/bin/env node
// One-time, resumable DEV metadata migration. No key/credential copying or rotation.
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

if (!process.argv.includes('--confirm=DEV-UNUSED-TRUST-NAMES')) throw Error('Explicit DEV migration confirmation required');
const directory = join(homedir(), '.athyper/instances/dev/secrets/publication-trust-v1');
const statePath = join(directory, 'state.json');
const state = JSON.parse(readFileSync(statePath, 'utf8'));
const bootstrap = JSON.parse(readFileSync(join(directory, '../publication-infisical-bootstrap.json'), 'utf8'));
const oldSlug = 'athyper-dev-publication-separated-v1';
const slug = 'athyper-publication-dev';
const oldKeyId = 'athyper-dev-separated-publication-v1';
const keyId = 'athyper-publication-dev-signing-v1';
if (state.schema !== 'athyper.dev-trust-provisioning/1' || ![oldSlug, slug].includes(state.project?.slug)
  || !state.publicKeyFingerprint || !state.publisher?.identity?.id || !state.verifier?.identity?.id) throw Error('Unexpected DEV provisioning state');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
if (![state.project.id, state.publisher.identity.id, state.verifier.identity.id].every(id => uuid.test(id))) throw Error('Invalid DEV coordinates');
const admin = bootstrap.bootstrap?.identity?.credentials?.token;
if (!admin) throw Error('DEV administration credential unavailable');
const saveJson = (path, value) => { writeFileSync(path, JSON.stringify(value, null, 2), { mode: 0o600 }); chmodSync(path, 0o600); };
const save = () => saveJson(statePath, state);
async function api(path, body) {
  const response = await fetch(`http://127.0.0.1:53001${path}`, {
    method: body === undefined ? 'GET' : 'PATCH',
    headers: { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) { await response.body?.cancel(); throw Error(`DEV name migration failed (${response.status}); preserve state and reconcile`); }
  return response.json();
}
function docker(args, input) {
  try { return execFileSync('docker', args, { encoding: 'utf8', input, maxBuffer: 16 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }); }
  catch { throw Error('DEV read-only inventory failed; no migration permitted'); }
}
// Search all persisted publication/runtime payloads, not just the signing_key_id column.
const patterns = [oldKeyId, keyId, oldSlug, state.project.id, state.publisher.identity.id, state.verifier.identity.id];
const inventory = [];
for (const database of ['athyper_studio', 'athyper_neon', 'athyper_mesh']) {
  const sql = `BEGIN READ ONLY;
SELECT format('SELECT count(*) FROM %I.%I t WHERE to_jsonb(t)::text LIKE ANY (ARRAY[${patterns.map(p => `''%%${p}%%''`).join(',')}]);', table_schema, table_name)
FROM information_schema.tables WHERE table_schema IN ('publication','runtime_meta') AND table_type='BASE TABLE'
\\gexec
COMMIT;`;
  const output = docker(['exec', '-i', 'athyper-dev-db-1', 'sh', '-c', `psql -X -qAt -U "$POSTGRES_USER" -d ${database} -v ON_ERROR_STOP=1`], sql);
  const counts = output.trim().split('\n');
  if (counts.length === 0 || counts.some(c => c !== '0')) throw Error('Persisted DEV reference found or inventory incomplete; key ID migration forbidden');
  inventory.push({ database, tablesScanned: counts.length, matches: 0 });
}
const names = docker(['ps', '-a', '--format', '{{.Names}}']).trim().split('\n').filter(n => n.startsWith('athyper-dev-'));
if (!names.length) throw Error('DEV container inventory unavailable');
const containers = JSON.parse(docker(['inspect', ...names]));
for (const container of containers) {
  const configuration = JSON.stringify({ env: container.Config.Env, command: container.Config.Cmd, entrypoint: container.Config.Entrypoint, mounts: container.Mounts });
  if ([...patterns, 'publication-trust-v1'].some(value => configuration.includes(value))) throw Error('DEV container references the provisioned trust; planned cutover required');
}
const currentProject = (await api(`/api/v1/projects/${state.project.id}`)).project;
if (currentProject?.id !== state.project.id || ![oldSlug, slug].includes(currentProject.slug)) throw Error('Live project mismatch');
const identities = {};
for (const purpose of ['publisher', 'verifier']) {
  const membership = (await api(`/api/v1/identities/${state[purpose].identity.id}`)).identity;
  const identity = membership?.identity;
  if (identity?.id !== state[purpose].identity.id || membership.role !== 'no-access'
    || ![`athyper-dev-separated-publication-${purpose}-v1`, `athyper-publication-dev-${purpose}`].includes(identity.name)) throw Error('Live identity mismatch');
  identities[purpose] = identity;
}
// Preserve the original observation; never rewrite it to suggest the new names existed earlier.
const priorReceipt = join(directory, 'qualification-before-name-migration.json');
if (!existsSync(priorReceipt)) saveJson(priorReceipt, JSON.parse(readFileSync(join(directory, 'qualification.json'), 'utf8')));
state.nameMigration ??= { schema: 'athyper.dev-trust-name-migration/1', startedAt: new Date().toISOString(), oldKeyId, keyId, oldSlug, slug, inventory, devContainersScanned: names.length };
save();
if (currentProject.slug !== slug || currentProject.name !== slug) {
  const project = (await api(`/api/v1/projects/${state.project.id}`, { name: slug, slug })).project;
  if (project?.id !== state.project.id || project.slug !== slug) throw Error('Unexpected project update response');
  state.project = { ...state.project, ...project }; save();
} else { state.project = { ...state.project, ...currentProject }; save(); }
for (const purpose of ['publisher', 'verifier']) {
  const name = `athyper-publication-dev-${purpose}`;
  const identity = identities[purpose].name === name ? identities[purpose]
    : (await api(`/api/v1/identities/${state[purpose].identity.id}`, { name })).identity;
  if (identity?.id !== state[purpose].identity.id || identity.name !== name) throw Error('Unexpected identity update response');
  state[purpose].identity = { ...state[purpose].identity, ...identity }; save();
}
state.keyId = keyId;
state.nameMigration.completedAt = new Date().toISOString();
save();
const receipt = { ...state.nameMigration, projectId: state.project.id, publisherIdentityId: state.publisher.identity.id,
  verifierIdentityId: state.verifier.identity.id, publicKeyFingerprint: state.publicKeyFingerprint,
  method: 'in_place_name_updates', keyMaterialCopied: false, credentialsRotated: false, deploymentChanged: false,
  qualification: 'pending_separate_sign_verify_and_acl_probes' };
saveJson(join(directory, 'name-migration.json'), receipt);
console.log(JSON.stringify(receipt));
