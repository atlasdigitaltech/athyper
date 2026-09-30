#!/usr/bin/env node
import {execFileSync} from 'node:child_process';
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {actors,buildStageSql,sourceRef} from './stage-dev-platform-authority.mjs';
import {assertDevContainer} from './setup-dev-test-admin.mjs';

const tenant='11111111-1111-4111-8111-111111111111';
export const identities = {
 'platform.admin': {old:'595e91ac-59fd-402c-ac65-fc392d98da9d',current:'72d03346-0958-4f3b-a59b-a5e17faee330'},
 'platform.owner': {old:'6e4efc64-ea29-49a4-965e-ac33614ad015',current:'52380ee6-88a8-4083-947e-d0628871d747'},
};
const command='studio.platform_authority.cutover';
const hash=createHash('sha256').update(JSON.stringify({actors,identities,sourceRef})).digest('hex');
function database(sql){return execFileSync('docker',['exec','-i','athyper-dev-db-1','sh','-c','exec psql -X -qAt -U "$POSTGRES_USER" -d athyper_studio -v ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();}
export function buildCutoverSql(commit=false){
 const subjects=Object.fromEntries(Object.entries(identities).map(([u,v])=>[u,v.current]));
 // Reuse all staging drift checks inside the same locked transaction.
 const stage=buildStageSql(subjects).replace(/SELECT json_build_object\('mode',[\s\S]*?ROLLBACK;\s*$/,'');
 return stage+`
DO $cutover$
DECLARE actor uuid; p uuid; item jsonb; n integer;
BEGIN
 SELECT id INTO STRICT actor FROM master.principal WHERE tenant_id='${tenant}' AND code='seed.three-plane-provisioner' AND status='active';
 FOR item IN SELECT value FROM jsonb_array_elements('${JSON.stringify(actors.map(a=>({...a,...identities[a.username]})))}'::jsonb) LOOP
  p:=(item->>'principalId')::uuid;
  UPDATE master.principal_identity_binding SET status='revoked',is_primary=false,status_changed_at=now(),status_changed_by=actor,updated_at=now(),updated_by=actor
   WHERE tenant_id='${tenant}' AND principal_id=p AND provider_code='keycloak' AND realm_key='athyper' AND subject_id=item->>'old' AND status='active';
  GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'Exact old binding required'; END IF;
  UPDATE master.principal_identity_binding SET is_primary=true,updated_at=now(),updated_by=actor,
   metadata=metadata||jsonb_build_object('migrationState','cutover_complete')
   WHERE tenant_id='${tenant}' AND principal_id=p AND realm_key='platform-control' AND subject_id=item->>'current' AND status='active';
  GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'Exact new binding required'; END IF;
  UPDATE authz.group_member gm SET status='active',status_changed_at=now(),status_changed_by=actor,updated_at=now(),updated_by=actor
   FROM authz.principal_group g WHERE gm.tenant_id='${tenant}' AND gm.principal_id=p AND gm.status='suspended'
   AND gm.source_ref='${sourceRef}' AND g.tenant_id=gm.tenant_id AND g.id=gm.group_id
   AND g.code='platform.control.'||split_part(item->>'username','.',2) AND g.source_ref='${sourceRef}';
  GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'Exact staged membership required'; END IF;
  UPDATE master.principal SET auth_epoch=auth_epoch+1,updated_at=now(),updated_by=actor WHERE tenant_id='${tenant}' AND id=p;
 END LOOP;
 INSERT INTO event.command_execution(tenant_id,command_code,idempotency_key,request_fingerprint,status,actor_principal_id,source_service,result_payload,started_at,completed_at,created_by)
 VALUES('${tenant}','${command}','dev-platform-control-v1','${hash}','succeeded',actor,'dev-maintenance',
 jsonb_build_object('principalIdsPreserved',true,'bindingsRetired',2,'membershipsActivated',2,'keycloakRetirement','pending','authorization','operator-directed DEV migration after verified human MFA'),now(),now(),actor);
END $cutover$;
SET CONSTRAINTS ALL IMMEDIATE;
${commit?'COMMIT':'ROLLBACK'};`;
}

async function main(){
 if(!['--check','--confirm=DEV-PLATFORM-AUTHORITY-CUTOVER'].includes(process.argv[2])||process.argv.length!==3)throw Error('Explicit DEV cutover confirmation required');
 const commit=process.argv[2].startsWith('--confirm');
 const inspect=name=>{const c=JSON.parse(execFileSync('docker',['inspect',name],{encoding:'utf8'}))[0];assertDevContainer(c);return c;};
 inspect('athyper-dev-db-1'); const container=inspect('athyper-dev-iam-1');
 const env=Object.fromEntries(container.Config.Env.map(v=>{const i=v.indexOf('=');return[v.slice(0,i),v.slice(i+1)];}));
 const mount=container.Mounts.find(m=>m.Destination==='/run/secrets/iam-admin-password');
 if(!mount?.Source.includes('/.athyper/instances/dev/secrets/'))throw Error('Wrong DEV credential mount');
 const ip=Object.values(container.NetworkSettings.Networks)[0]?.IPAddress;
 if(!/^\d+\.\d+\.\d+\.\d+$/.test(ip))throw Error('DEV network missing');
 const base=`http://${ip}:${env.KC_HTTP_PORT||8080}`;
 const login=await fetch(base+'/realms/master/protocol/openid-connect/token',{method:'POST',signal:AbortSignal.timeout(10000),body:new URLSearchParams({client_id:'admin-cli',grant_type:'password',username:env.KC_BOOTSTRAP_ADMIN_USERNAME,password:readFileSync(mount.Source,'utf8').trim()})});
 if(!login.ok)throw Error('DEV administration authentication failed');
 const {access_token}=await login.json();
 const kc=async(realm,path,method='GET',body)=>{const r=await fetch(`${base}/admin/realms/${realm}${path}`,{method,signal:AbortSignal.timeout(10000),headers:{authorization:`Bearer ${access_token}`,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok)throw Error(`Keycloak ${realm} ${method} failed: ${r.status}`);const t=await r.text();return t?JSON.parse(t):undefined;};
 // Historical proof only, NOT accepting expired tokens for API access or
 // manufacturing human publication approval. The operator authorized migration.
 const require=createRequire(new URL('../../../../packages/adapters/auth-keycloak/package.json',import.meta.url));
 const {jwtVerify,createLocalJWKSet}=await import(pathToFileURL(require.resolve('jose')).href);
 const jwksResponse=await fetch(base+'/realms/platform-control/protocol/openid-connect/certs',{signal:AbortSignal.timeout(10000)});
 if(!jwksResponse.ok)throw Error('Control signing keys unavailable');
 const jwks=createLocalJWKSet(await jwksResponse.json());
 for(const actor of actors){
  const file=`${homedir()}/.athyper/instances/dev/secrets/control-api/login/${actor.username}.json`;
  if((statSync(file).mode&0o077)!==0)throw Error('Private MFA receipt required');
  const receipt=JSON.parse(readFileSync(file,'utf8'));const verifiedAt=new Date(receipt.verifiedAt);
  if(!Number.isFinite(+verifiedAt)||Date.now()-verifiedAt>86400000||+verifiedAt>Date.now())throw Error('Recent verified login required');
  const {payload}=await jwtVerify(receipt.accessToken,jwks,{issuer:'https://iam.dev.athyper.test/realms/platform-control',audience:'athyper-platform-control-api',algorithms:['RS256'],requiredClaims:['sub','exp','iat','amr','azp','plane'],currentDate:verifiedAt});
  if(payload.sub!==identities[actor.username].current||payload.azp!=='athyper-platform-control-operator'||payload.plane!=='studio'
   ||!Array.isArray(payload.amr)||!payload.amr.includes('pwd')||!payload.amr.includes('otp')||receipt.principalId!==actor.principalId
   ||receipt.username!==actor.username||receipt.tenantId!==tenant||receipt.assurance!=='elevated')throw Error('Human MFA evidence mismatch');
  const current=await kc('platform-control',`/users/${payload.sub}`);
  if(current.username!==actor.username||!current.enabled||current.requiredActions?.length)throw Error('New identity is not ready');
  const old=await kc('athyper',`/users/${identities[actor.username].old}`);
  if(old.username!==actor.username)throw Error('Old identity drift');
 }
 const completed=database(`SELECT count(*) FROM event.command_execution WHERE tenant_id='${tenant}' AND command_code='${command}' AND idempotency_key='dev-platform-control-v1' AND request_fingerprint='${hash}' AND status='succeeded';`)==='1';
 if(!completed){database(buildCutoverSql(false));if(commit)database(buildCutoverSql(true));}
 if(!commit){console.log(JSON.stringify({mode:'check',historicalMfaVerified:2,databaseAlreadyCutOver:completed}));return;}
 // Resume only the exact committed state; a prior receipt alone is insufficient.
 for(const actor of actors){
  const id=identities[actor.username];
  const count=database(`SELECT count(*) FROM master.principal_identity_binding b JOIN master.principal p ON p.id=b.principal_id AND p.tenant_id=b.tenant_id
   WHERE b.tenant_id='${tenant}' AND p.id='${actor.principalId}' AND p.status='active' AND p.auth_epoch>=1
   AND ((b.realm_key='athyper' AND b.subject_id='${id.old}' AND b.status='revoked' AND NOT b.is_primary)
    OR (b.realm_key='platform-control' AND b.subject_id='${id.current}' AND b.status='active' AND b.is_primary));`);
  if(count!=='2')throw Error('Committed identity cutover drift; old-account mutation stopped');
 }
 for(const actor of actors){
  const path=`/users/${identities[actor.username].old}`;
  await kc('athyper',path,'PUT',{enabled:false});
  await kc('athyper',path+'/logout','POST');
  if((await kc('athyper',path)).enabled||(await kc('athyper',path+'/sessions')).length)throw Error('Old account retirement incomplete');
 }
 database(`BEGIN;
 INSERT INTO event.command_execution(tenant_id,command_code,idempotency_key,request_fingerprint,status,actor_principal_id,source_service,result_payload,started_at,completed_at,created_by)
 SELECT '${tenant}','studio.platform_authority.identity_retirement','dev-platform-control-v1','${hash}','succeeded',id,'dev-maintenance',
 jsonb_build_object('oldRealm','athyper','accountsDisabled',2,'remainingOnlineSessions',0,'newRealm','platform-control'),now(),now(),id
 FROM master.principal WHERE tenant_id='${tenant}' AND code='seed.three-plane-provisioner' AND status='active'
 AND NOT EXISTS(SELECT 1 FROM event.command_execution WHERE tenant_id='${tenant}' AND command_code='studio.platform_authority.identity_retirement' AND idempotency_key='dev-platform-control-v1');
 COMMIT;`);
 console.log(JSON.stringify({studioCutover:true,oldAccountsDisabled:2,oldOnlineSessions:0,principalIdsPreserved:true}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.stderr?.toString()||e.message);process.exitCode=1;});
