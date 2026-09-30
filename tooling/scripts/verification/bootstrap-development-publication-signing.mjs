#!/usr/bin/env node
// Uses the native Infisical bootstrap/project/identity/secret APIs on dev loopback.
// Never outputs credentials. Each successful creation is checkpointed privately.
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, generateKeyPairSync, createHash, sign, verify, createPrivateKey, createPublicKey } from 'node:crypto';

if (!process.argv.includes('--confirm=LOCAL-DEV-PUBLICATION-SIGNING')) throw new Error('Local development confirmation required');
const secretRoot = join(homedir(), '.athyper/instances/dev/secrets');
const statePath = join(secretRoot, 'publication-infisical-bootstrap.json');
mkdirSync(secretRoot, {recursive:true, mode:0o700});
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
function save() { writeFileSync(statePath, JSON.stringify(state), {mode:0o600}); chmodSync(statePath,0o600); }
async function api(path, body, token=state.bootstrap?.identity.credentials.token) {
  const response = await fetch(`http://127.0.0.1:53001${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {'Content-Type':'application/json', ...(token ? {Authorization:`Bearer ${token}`} : {})},
    ...(body === undefined ? {} : {body:JSON.stringify(body)}), signal:AbortSignal.timeout(30000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`Infisical ${path} failed (${response.status}); reconcile native state before retrying`);
  return result;
}
if (!state.password) { state.password=randomBytes(32).toString('base64url'); save(); }
if (!state.bootstrap) {
  state.bootstrap=await api('/api/v1/admin/bootstrap',{email:'publication-admin@dev.example.test',password:state.password,organization:'ATHYPER Development Publication'},null); save();
}
if (!state.project) {
  state.project=(await api('/api/v1/projects',{projectName:'Development publication signing',slug:'athyper-dev-publication',type:'secret-manager',shouldCreateDefaultEnvs:true})).project; save();
}
const privateReference='PUBLICATION_DEV_ED25519_PRIVATE_20260905', publicReference='PUBLICATION_DEV_ED25519_PUBLIC_20260905';
if (!state.keyPair && (!state.privateStored || !state.publicStored)) {
  const pair=generateKeyPairSync('ed25519');
  state.keyPair={private:pair.privateKey.export({type:'pkcs8',format:'der'}).toString('base64'),public:pair.publicKey.export({type:'spki',format:'der'}).toString('base64')}; save();
}
for (const [kind,reference] of [['private',privateReference],['public',publicReference]]) {
  if (state[`${kind}Stored`]) continue;
  await api(`/api/v3/secrets/raw/${reference}`,{workspaceId:state.project.id,environment:'dev',secretPath:'/',type:'shared',secretValue:state.keyPair[kind]});
  state[`${kind}Stored`]=true; save();
}
delete state.keyPair; save();
if (!state.workerIdentity) {
  state.workerIdentity=(await api('/api/v1/identities',{name:'athyper-dev-publication-worker',organizationId:state.bootstrap.organization.id,role:'no-access'})).identity; save();
}
const identityId=state.workerIdentity.id;
if (!state.projectMembership) {
  state.projectMembership=await api(`/api/v1/projects/${state.project.id}/memberships/identities/${identityId}`,{roles:[{role:'viewer',isTemporary:false}]}); save();
}
if (!state.tokenAuth) {
  state.tokenAuth=await api(`/api/v1/auth/token-auth/identities/${identityId}`,{accessTokenTTL:2592000,accessTokenMaxTTL:2592000,accessTokenNumUsesLimit:0}); save();
}
if (!state.workerToken) {
  const token=await api(`/api/v1/auth/token-auth/identities/${identityId}/tokens`,{name:'dev-publication-worker',organizationSlug:state.bootstrap.organization.slug});
  state.workerToken=token.accessToken; if (!state.workerToken) throw new Error('Token response missing accessToken'); save();
}
const tokenFile=join(secretRoot,'publication-infisical-token');
writeFileSync(tokenFile,state.workerToken,{mode:0o600}); chmodSync(tokenFile,0o600);
const refs={PUBLICATION_APPLIER_PRINCIPAL_CODE:'seed.three-plane-provisioner',PUBLICATION_TARGET_PLANES:'neon,mesh',PUBLICATION_RUNTIME_VERSION:'1.0.0',PUBLICATION_SIGNING_KEY_ID:'athyper-dev-publication-ed25519-20260905',PUBLICATION_PRIVATE_KEY_REFERENCE:privateReference,PUBLICATION_PUBLIC_KEY_REFERENCE:publicReference,INFISICAL_URL:'https://secrets.dev.athyper.test:8443',INFISICAL_WORKSPACE_ID:state.project.id,INFISICAL_ENVIRONMENT:'dev',INFISICAL_SECRET_PATH:'/',PUBLICATION_INFISICAL_TOKEN_FILE:tokenFile};
writeFileSync(join(secretRoot,'publication-environment.json'),JSON.stringify(refs,null,2)+'\n',{mode:0o600});
const keyQuery=`?workspaceId=${state.project.id}&environment=dev&secretPath=%2F`;
const privateSecret=(await api(`/api/v3/secrets/raw/${privateReference}${keyQuery}`,undefined,state.workerToken)).secret;
const publicSecret=(await api(`/api/v3/secrets/raw/${publicReference}${keyQuery}`,undefined,state.workerToken)).secret;
const privateKey=createPrivateKey({key:Buffer.from(privateSecret.secretValue,'base64'),type:'pkcs8',format:'der'});
const publicKey=createPublicKey({key:Buffer.from(publicSecret.secretValue,'base64'),type:'spki',format:'der'});
const probe=Buffer.from('athyper development publication signing health probe; not a release approval');
const signature=sign(null,probe,privateKey);
if (!verify(null,probe,publicKey,signature)) throw new Error('Native key read/sign/verify failed');
console.log(JSON.stringify({schema:'athyper.publication-signing-provisioning/1',environment:'dev',sanitized:true,projectId:state.project.id,identityId,keyId:refs.PUBLICATION_SIGNING_KEY_ID,privateReference,publicReference,publicKeySha256:createHash('sha256').update(publicKey.export({type:'spki',format:'der'})).digest('hex'),keyReadSignVerify:true,tokenTTLSeconds:2592000,nativeRelease:false}));
