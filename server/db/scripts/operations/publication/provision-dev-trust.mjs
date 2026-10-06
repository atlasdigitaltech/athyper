#!/usr/bin/env node
// DEV-only additive provisioning. Never changes existing publication identities,
// production projects or running deployment configuration. Never prints credentials.
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync, createPublicKey, createPrivateKey, createHash, sign, verify } from 'node:crypto';

if (!process.argv.includes('--confirm=DEV-SEPARATE-PUBLICATION-TRUST')) throw Error('Explicit DEV provisioning confirmation required');
const root = join(homedir(), '.athyper/instances/dev/secrets');
const bootstrap = JSON.parse(readFileSync(join(root, 'publication-infisical-bootstrap.json'), 'utf8'));
const directory = join(root, 'publication-trust-v1');
mkdirSync(directory, { recursive: true, mode: 0o700 });
const path = join(directory, 'state.json');
const state = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { schema: 'athyper.dev-trust-provisioning/1' };
if (state.schema !== 'athyper.dev-trust-provisioning/1') throw Error('Unexpected provisioning state');
const refreshExpired = process.argv.includes('--refresh-expired-tokens');
if (refreshExpired && (!state.project?.id || !state.publicKeyFingerprint || ['publisher','verifier'].some(purpose =>
  !state[purpose]?.identity?.id || !state[purpose]?.membership || !state[purpose]?.privilege || !state[purpose]?.tokenAuth || !state[purpose]?.token)))
  throw Error('Refresh requires an already provisioned DEV trust identity/keyset; no new authority is created');
const refreshed = [];
const save = () => { writeFileSync(path, JSON.stringify(state), { mode: 0o600 }); chmodSync(path, 0o600); };
const admin = bootstrap.bootstrap?.identity?.credentials?.token;
if (!admin) throw Error('DEV secret-store administration credential unavailable');
async function request(path, body, token = admin) {
  return fetch(`http://127.0.0.1:53001${path}`, { method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
}
async function api(path, body, token) {
  const response = await request(path, body, token);
  if (!response.ok) { await response.body?.cancel(); throw Error(`DEV secret-store operation failed (${response.status}); inspect provisioning receipts before retry`); }
  return response.json();
}
const projectSlug = 'athyper-publication-dev';
if (!state.project) {
  state.project = (await api('/api/v1/projects', { projectName: projectSlug, slug: projectSlug, type: 'secret-manager', shouldCreateDefaultEnvs: true })).project;
  save();
}
if (!state.project?.id || state.project.slug !== projectSlug) throw Error('DEV project coordinate mismatch');
const liveProject = (await api(`/api/v1/projects/${state.project.id}`)).project;
if (liveProject?.id !== state.project.id || liveProject.slug !== projectSlug || liveProject.name !== projectSlug) throw Error('Live DEV project name mismatch');
const keyId = 'athyper-publication-dev-signing-v1';
if (state.keyId && state.keyId !== keyId) throw Error('DEV key ID migration required');
state.keyId = keyId; save();
const privateRef = 'PUBLICATION_DEV_SIGNING_PRIVATE_V1', publicRef = 'PUBLICATION_DEV_SIGNING_PUBLIC_V1';
const query = `?workspaceId=${encodeURIComponent(state.project.id)}&environment=dev&secretPath=%2F`;
async function readSecret(ref, token = admin) {
  const response = await request(`/api/v3/secrets/raw/${ref}${query}`, undefined, token);
  if (response.status === 404) { await response.body?.cancel(); return null; }
  if (!response.ok) { await response.body?.cancel(); throw Error(`DEV key read failed (${response.status})`); }
  return (await response.json()).secret;
}
let privateSecret = await readSecret(privateRef), publicSecret = await readSecret(publicRef);
if (!!privateSecret !== !!publicSecret) throw Error('PARTIAL_DEV_KEYSET: preserve existing key; reconcile before retry');
if (refreshExpired && (!privateSecret || !publicSecret)) throw Error('Refresh requires the existing DEV keyset; key creation is not permitted');
if (!privateSecret && !publicSecret) {
  const pair = generateKeyPairSync('ed25519');
  // Private material stays in memory until sent to the secret manager; no disk copy.
  for (const [ref, key, type] of [[privateRef, pair.privateKey, 'pkcs8'], [publicRef, pair.publicKey, 'spki']]) {
    await api(`/api/v3/secrets/raw/${ref}`, { workspaceId: state.project.id, environment: 'dev', secretPath: '/', type: 'shared', secretValue: key.export({ type, format: 'der' }).toString('base64') });
  }
  privateSecret = await readSecret(privateRef); publicSecret = await readSecret(publicRef);
}
const privateKey = createPrivateKey({ key: Buffer.from(privateSecret.secretValue, 'base64'), type: 'pkcs8', format: 'der' });
const publicKey = createPublicKey({ key: Buffer.from(publicSecret.secretValue, 'base64'), type: 'spki', format: 'der' });
if (privateKey.asymmetricKeyType !== 'ed25519' || publicKey.asymmetricKeyType !== 'ed25519'
  || !createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).equals(publicKey.export({ type: 'spki', format: 'der' }))) throw Error('DEV key pair mismatch');
const fingerprint = `sha256:${createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex')}`;
if (state.publicKeyFingerprint && state.publicKeyFingerprint !== fingerprint) throw Error('DEV key unexpectedly changed');
state.publicKeyFingerprint = fingerprint; save();

for (const [purpose, names] of [['publisher', [privateRef, publicRef]], ['verifier', [publicRef]]]) {
  const identity = state[purpose] ??= {};
  if (!identity.identity) {
    identity.identity = (await api('/api/v1/identities', { name: `athyper-publication-dev-${purpose}`, organizationId: bootstrap.bootstrap.organization.id, role: 'no-access' })).identity; save();
  }
  const liveIdentity = (await api(`/api/v1/identities/${identity.identity.id}`)).identity;
  if (liveIdentity?.identity?.id !== identity.identity.id || liveIdentity.identity.name !== `athyper-publication-dev-${purpose}`
    || liveIdentity.role !== 'no-access') throw Error('Live DEV identity coordinate/base-role mismatch');
  if (!identity.membership) {
    identity.membership = await api(`/api/v1/projects/${state.project.id}/memberships/identities/${identity.identity.id}`, { roles: [{ role: 'no-access', isTemporary: false }] }); save();
  }
  if (!identity.privilege) {
    identity.privilege = await api('/api/v2/identity-project-additional-privilege', {
      identityId: identity.identity.id, projectId: state.project.id, slug: `dev-publication-${purpose}-v1`,
      permissions: names.map(secretName => ({ action: 'read', subject: 'secrets', conditions: { environment: 'dev', secretPath: '/', secretName: { $glob: secretName } } })), type: { isTemporary: false },
    }); save();
  }
  if (!identity.tokenAuth) {
    identity.tokenAuth = await api(`/api/v1/auth/token-auth/identities/${identity.identity.id}`, { accessTokenTTL: 604800, accessTokenMaxTTL: 604800, accessTokenNumUsesLimit: 0 }); save();
  }
  let expired = false;
  if (refreshExpired) {
    const probe = await request(`/api/v3/secrets/raw/${publicRef}${query}`, undefined, identity.token);
    if (!probe.ok) {
      const body = await probe.json().catch(() => ({}));
      expired = [401,403].includes(probe.status) && /expired|expiration/i.test(String(body.message ?? body.error ?? ''));
      if (!expired) throw Error(`Token refresh refused: failure is not confirmed expiry (${probe.status})`);
    } else await probe.body?.cancel();
  }
  if (!identity.token || expired) {
    identity.token = (await api(`/api/v1/auth/token-auth/identities/${identity.identity.id}/tokens`, { name: `dev-publication-${purpose}-v1`, organizationSlug: bootstrap.bootstrap.organization.slug })).accessToken;
    if (!identity.token) throw Error('DEV token creation returned no credential');
    if (expired) refreshed.push(purpose);
    save();
  }
  const tokenPath = join(directory, `${purpose}-token`);
  writeFileSync(tokenPath, identity.token, { mode: 0o600 }); chmodSync(tokenPath, 0o600);
}

const pub = await readSecret(publicRef, state.verifier.token);
const priv = await readSecret(privateRef, state.publisher.token);
const probe = Buffer.from('DEV separated trust qualification; not a release or approval');
const signature = sign(null, probe, createPrivateKey({ key: Buffer.from(priv.secretValue, 'base64'), type: 'pkcs8', format: 'der' }));
if (!verify(null, probe, createPublicKey({ key: Buffer.from(pub.secretValue, 'base64'), type: 'spki', format: 'der' }), signature)) throw Error('DEV sign/verify qualification failed');
async function denied(path, token) {
  const response = await request(path, undefined, token); const status = response.status;
  await response.body?.cancel();
  if (![403, 404].includes(status)) throw Error(`DEV negative ACL probe failed (${status})`);
  return status;
}
const privateDenied = await denied(`/api/v3/secrets/raw/${privateRef}${query}`, state.verifier.token);
// Existing legacy public key is present in another DEV project; no production read.
const legacyQuery = `?workspaceId=${encodeURIComponent(bootstrap.project.id)}&environment=dev&secretPath=%2F`;
const legacyRef = 'PUBLICATION_DEV_ED25519_PUBLIC_20260905';
const legacyExists = await request(`/api/v3/secrets/raw/${legacyRef}${legacyQuery}`);
if (!legacyExists.ok) { await legacyExists.body?.cancel(); throw Error('Cross-project negative probe requires an existing target'); }
await legacyExists.body?.cancel();
const publisherCrossProject = await denied(`/api/v3/secrets/raw/${legacyRef}${legacyQuery}`, state.publisher.token);
const verifierCrossProject = await denied(`/api/v3/secrets/raw/${legacyRef}${legacyQuery}`, state.verifier.token);
const receipt = { schema: 'athyper.dev-trust-qualification/1', observedAt: new Date().toISOString(), environment: 'dev',
  projectId: state.project.id, projectSlug, publisherIdentityId: state.publisher.identity.id, verifierIdentityId: state.verifier.identity.id,
  publisherName: `athyper-publication-dev-publisher`, verifierName: `athyper-publication-dev-verifier`,
  keyId, publicKeyFingerprint: fingerprint, privateReference: privateRef, publicReference: publicRef,
  credentialsRefreshed: refreshed, ...(refreshExpired ? { authorityChanged: false } : {}), signVerify: true, verifierPrivateDeniedStatus: privateDenied, publisherCrossProjectDeniedStatus: publisherCrossProject,
  verifierCrossProjectDeniedStatus: verifierCrossProject, productionAccessTested: false, deploymentChanged: false, releaseApproved: false };
if (refreshExpired) writeFileSync(join(directory, `qualification-refresh-${Date.now()}.json`), JSON.stringify(receipt, null, 2), { mode: 0o600 });
writeFileSync(join(directory, 'qualification.json'), JSON.stringify(receipt, null, 2), { mode: 0o600 });
console.log(JSON.stringify(receipt));
