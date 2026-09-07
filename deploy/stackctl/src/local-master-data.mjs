import {existsSync, readFileSync, statSync, mkdirSync, writeFileSync, renameSync} from 'node:fs';
import {join, dirname} from 'node:path';
export const localMasterDataPath = root => join(root,'instances/dev/config/local-master-data.compose.json');
const imagePattern=/^(?:sha256:[a-f0-9]{64}|[a-z0-9./_-]+(?::[a-zA-Z0-9._-]+)?@sha256:[a-f0-9]{64})$/;
export function localMasterDataDocument({runtimeImage,neonImage,keyId,parameterRuntime=false}) {
 if(!imagePattern.test(runtimeImage)||!imagePattern.test(neonImage))throw Error('Local master-data images must use immutable digests');
 if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(keyId))throw Error('Invalid local signing key ID');
 return {'x-athyper-local-master-data':{version:1,keyId,parameterRuntime},services:{
  api:{image:runtimeImage,environment:{LOCAL_CONTACT_CHALLENGE_KEY_ID:keyId,...(parameterRuntime?{WAVE0_CONTROL_ADMIN_PARAMETERS_ENABLED:'true'}:{})}},
  worker:{image:runtimeImage},scheduler:{image:runtimeImage},
  'neon-web':{image:neonImage,environment:{LOCAL_MASTER_DATA_PILOT_ENABLED:'true'}},
 }};
}
export function writeLocalMasterData(root,settings){const path=localMasterDataPath(root);mkdirSync(dirname(path),{recursive:true,mode:0o700});const temp=path+'.tmp';writeFileSync(temp,JSON.stringify(localMasterDataDocument(settings),null,2)+'\n',{mode:0o600});renameSync(temp,path);return path;}
export function loadLocalMasterData(repoRoot,root,instance) {
 const path=localMasterDataPath(root);
 if(instance.metadata.id!=='dev'||!existsSync(path))return null;
 if(instance.spec.mode!=='development'||instance.spec.composeProject!=='athyper-dev'||instance.spec.domainSuffix!=='dev.athyper.test')throw Error('Local master-data profile requires the exact development instance');
 if((statSync(path).mode&0o077)!==0)throw Error('Local master-data profile must be owner-only');
 const document=JSON.parse(readFileSync(path,'utf8')),meta=document['x-athyper-local-master-data'];
 if(meta?.version!==1||typeof meta.parameterRuntime!=='boolean')throw Error('Invalid local master-data profile');
 const expected=localMasterDataDocument({runtimeImage:document.services?.api?.image,neonImage:document.services?.['neon-web']?.image,keyId:meta.keyId,parameterRuntime:meta.parameterRuntime});
 if(JSON.stringify(document)!==JSON.stringify(expected))throw Error('Local master-data profile contains unsupported or inconsistent configuration');
 if(!['internal','mock'].includes(instance.spec.providers.mail)||instance.spec.providers.push==='external')throw Error('Local master-data requires captured communication providers');
 const preserved=preservedLocalPath(root);
 if(existsSync(preserved)){if((statSync(preserved).mode&0o077)!==0)throw Error('Preserved local configuration must be owner-only');validatePreservedLocal(JSON.parse(readFileSync(preserved,'utf8')),root);}
 return {path,keyId:meta.keyId,runtimeImage:document.services.api.image,neonImage:document.services['neon-web'].image,
  compose:[...(existsSync(preserved)?[preserved]:[]),join(repoRoot,'deploy/compose/instance/compose.notification-capture.yaml'),join(repoRoot,'deploy/compose/instance/compose.local-contact-challenge.yaml'),path],
  secrets:['local-contact-challenge-private-key','local-contact-challenge-trust','local-contact-challenge-delivery-key']};
}

// Preserve existing local feature settings when migrating away from dated rollout files.
// These are public settings and file references, never secret contents or shell commands.
export const PRESERVED_LOCAL_ENV = new Set(('WAVE0_CONTROL_ADMIN_LOCAL_CATALOG_READS_ENABLED WAVE0_CONTROL_ADMIN_TENANT_OVERRIDES_ENABLED WAVE0_CONTROL_ADMIN_LOOKUP_ROUNDING_ENABLED WAVE0_CONTROL_ADMIN_CONNECTOR_LIFECYCLE_ENABLED WAVE0_CONTROL_ADMIN_CATALOG_AUTHORING_ENABLED APP_NAME ATHYPER_APP_DOMAIN ATHYPER_IAM_CLIENT_ID ATHYPER_APP_ID ATHYPER_IAM_SECRET_FILE BUSINESS_PARTNER_METRICS_TARGETS PUBLICATION_TARGET_PLANES RECORD_TRANSFER_PUBLIC_API_ENABLED PUBLICATION_API_ENABLED VAPID_SUBJECT_FILE VAPID_PUBLIC_KEY_FILE VAPID_PRIVATE_KEY_FILE PUBLICATION_DISPATCH_ENABLED BUSINESS_PARTNER_MESH_DELIVERY_ENABLED PUBLICATION_SIGNING_KEY_ID INFISICAL_WORKSPACE_ID PUBLICATION_REQUIRE_SIGNATURE INFISICAL_SECRET_PATH BUSINESS_PARTNER_MESH_RECONCILIATION_ENABLED INFISICAL_TOKEN_FILE INFISICAL_ENVIRONMENT PUBLICATION_APPLY_ENABLED PUBLICATION_PRIVATE_KEY_REFERENCE PUBLICATION_PUBLIC_KEY_REFERENCE PUBLICATION_APPLIER_PRINCIPAL_CODE NODE_EXTRA_CA_CERTS PUBLICATION_COMPILE_ENABLED INFISICAL_URL PUBLICATION_RUNTIME_VERSION PROCESS_METRICS_PORT').split(' '));
export const preservedLocalPath=root=>join(root,'instances/dev/config/local-runtime-preserved.compose.json');
export function validatePreservedLocal(document,root){
 if(Object.keys(document).some(k=>!['services','secrets'].includes(k)))throw Error('Unsupported preserved local configuration');
 for(const [service,value] of Object.entries(document.services??{})){
  if(!['api','worker','scheduler','neon-web'].includes(service)||Object.keys(value).some(k=>!['environment','secrets'].includes(k)))throw Error('Unsupported preserved service');
  for(const [key,envValue] of Object.entries(value.environment??{}))if(!PRESERVED_LOCAL_ENV.has(key)||typeof envValue!=='string'||envValue.length>2048)throw Error('Unsupported preserved environment setting');
  if((value.secrets??[]).some(s=>!['publication-infisical-token','publication-tls-certificate'].includes(s)))throw Error('Unsupported preserved secret mount');
 }
 for(const [name,value] of Object.entries(document.secrets??{})){
  const expected=name==='publication-infisical-token'?join(root,'instances/dev/secrets/publication-infisical-token'):name==='publication-tls-certificate'?join(root,'platform/secrets/tls.crt'):null;
  if(!expected||JSON.stringify(value)!==JSON.stringify({file:expected}))throw Error('Unsupported preserved secret reference');
 }
 return document;
}
