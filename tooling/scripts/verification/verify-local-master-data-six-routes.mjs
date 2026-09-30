#!/usr/bin/env node
// Local API acceptance. No application SQL writes, grant changes, or signing endpoint.
import assert from 'node:assert/strict';
import {createHash, createPrivateKey, createPublicKey, randomUUID, sign} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium} from '@playwright/test';

const publication=JSON.parse(readFileSync(new URL('../../../docs/runbooks/master-data-launch/local-master-authority-publication-20260907.json',import.meta.url),'utf8'));
const tenant='44444444-4444-4444-8444-444444444444';
assert.equal(publication.environment,'local');assert.equal(publication.tenant,tenant);
const neon='https://neon.dev.athyper.test',iam='https://iam.dev.athyper.test';
const secrets=resolve(homedir(),'.athyper/instances/dev/secrets');
const password=readFileSync(resolve(secrets,'iam-admin-password'),'utf8').trim();
const trust=JSON.parse(readFileSync(resolve(secrets,'local-contact-challenge-trust'),'utf8'));
const key=createPrivateKey(readFileSync(resolve(secrets,'local-contact-challenge-private-key'),'utf8'));
const trusted=trust.find(k=>k.provider==='athyper-local-challenge'&&k.publicKeyPem===createPublicKey(key).export({type:'spki',format:'pem'}).toString());
assert.ok(trusted);assert.deepEqual(trusted.tenantIds,[tenant]);assert.deepEqual(trusted.planeKeys,['neon']);
const runId=randomUUID(),marker='six-routes-'+runId;
const report={runId,environment:'local',startedAt:new Date().toISOString(),complete:false,
  authenticationMethod:'Keycloak admin-assisted development SSO; ordinary Neon session/CSRF relay',
  verificationFixture:'Local Ed25519 provider test fixture; bound to stored contacts created by this run. This is API signature acceptance, not email ownership testing.',
  identities:[],checks:[],fixtures:[]};
const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
function db(statement){
 const result=spawnSync('docker',['exec','-i','athyper-dev-db-1','psql','-U','postgres','-d','athyper_neon','-X','-At','-v','ON_ERROR_STOP=1'],{input:'BEGIN READ ONLY;'+statement+';COMMIT;',encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 return result.stdout.split('\n').filter(line=>line&&line!=='BEGIN'&&line!=='COMMIT').join('\n');
}
const ownerType=db("SELECT id FROM control.owner_type WHERE code='business_partner' AND status='active'");
assert.match(ownerType,/^[a-f0-9-]{36}$/);
const contexts=[];const browser=await chromium.launch({args:['--ignore-certificate-errors']});
function record(label,route,result,expected,code){
 assert.equal(result.status,expected,`${label} ${route}: status=${result.status}, code=${result.body?.code??'none'}`);
 if(code)assert.equal(result.body?.code,code,label);
 report.checks.push({label,route,status:result.status,...(result.body?.code?{code:result.body.code}:{}),...(result.body?.requestId?{requestId:result.body.requestId}:{})});
}
async function call(session,path,method='GET',body){
 return session.page.evaluate(async({path,method,body})=>{
  const cookie=document.cookie.match(/(?:^|;\s*)(?:__Host-athyper-csrf|athyper-csrf)=([^;]+)/);
  const response=await fetch('/api/relay/'+path,{method,headers:{'Content-Type':'application/json',...(cookie?{'X-CSRF-Token':decodeURIComponent(cookie[1])}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  const text=await response.text();return {status:response.status,body:text?JSON.parse(text):null};
 },{path,method,body});
}
async function login(username){
 const context=await browser.newContext({ignoreHTTPSErrors:true});contexts.push(context);
 let response=await context.request.post(iam+'/realms/master/protocol/openid-connect/token',{form:{client_id:'admin-cli',grant_type:'password',username:'athyper-admin',password}});assert.ok(response.ok(),'Development IAM login failed');const admin=(await response.json()).access_token;
 response=await context.request.get(iam+'/admin/realms/athyper/users',{headers:{authorization:'Bearer '+admin},params:{username,exact:'true'}});
 const users=await response.json();assert.equal(users.length,1);assert.equal(users[0].enabled,true);
 response=await context.request.post(iam+'/admin/realms/athyper/users/'+users[0].id+'/impersonation',{headers:{authorization:'Bearer '+admin}});assert.ok(response.ok(),'Development session failed');
 const page=await context.newPage();await page.goto(neon+'/api/auth/login?returnTo=/contact-verification.html');
 await page.waitForURL(url=>url.origin===neon&&!url.pathname.startsWith('/api/auth/'),{timeout:30000});
 const session={page,context,username};const identity=await call(session,'iam/me');assert.equal(identity.status,200);
 session.identity=identity.body;
 report.identities.push({username,tenantId:identity.body.tenantId,principalId:identity.body.principalId,masterDataPermissions:identity.body.permissions.filter(p=>p.startsWith('neon.relationship.business_partner.'))});
 console.log(JSON.stringify({username,stage:'authenticated',tenantId:identity.body.tenantId}));return session;
}
function providerFixture(contactId){
 // Refuse to sign outside this test run, this tenant, or the selected owners. Never take
 // target claims from the HTTP request or permit an arbitrary payload/signing endpoint.
 const row=JSON.parse(db(`SELECT to_jsonb(c) FROM master.contact_link c WHERE c.id=${quote(contactId)}::uuid AND c.tenant_id=${quote(tenant)}::uuid AND c.role_qualifier=${quote(marker)}`));
 assert.ok(publication.fixtures.some(f=>f.partner===row.owner_id));assert.equal(row.channel_type,'email');assert.equal(row.status,'active');assert.ok(row.value.endsWith(`.${runId}@verification.dev.athyper.test`));
 assert.equal(row.is_verified,false);assert.equal(row.effective_until,null);
 const issuedAt=new Date().toISOString(),expiresAt=new Date(Date.now()+300000).toISOString();
 assert.ok(Date.parse(issuedAt)>=Date.parse(trusted.notBefore)&&Date.parse(expiresAt)<=Date.parse(trusted.notAfter));
 const envelope={provider:trusted.provider,keyId:trusted.keyId,evidenceId:'acceptance:'+randomUUID(),issuedAt,expiresAt};
 // Independent encoding of the documented fixed-position JSON wire protocol tests
 // interoperability with the deployed verifier, rather than sharing its implementation.
 const bytes=Buffer.from(JSON.stringify(['athyper.master.contact.verification.v1','neon',tenant,row.id,row.channel_type,row.value,true,envelope.provider,envelope.keyId,envelope.evidenceId,issuedAt,expiresAt]));
 return {...envelope,payloadHash:createHash('sha256').update(bytes).digest('hex'),signature:sign(null,bytes,key).toString('base64url')};
}
function state(){
 return JSON.parse(db(`WITH contacts AS (SELECT * FROM master.contact_link WHERE tenant_id=${quote(tenant)}::uuid AND role_qualifier=${quote(marker)}), addresses AS (SELECT * FROM master.address_link WHERE tenant_id=${quote(tenant)}::uuid AND role_qualifier=${quote(marker)}), ids AS (SELECT id::text FROM contacts UNION SELECT id::text FROM addresses)
 SELECT jsonb_build_object('contacts',md5(coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY id)::text FROM contacts c),'[]')),'addresses',md5(coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY id)::text FROM addresses a),'[]')),
 'audit',(SELECT count(*) FROM audit.audit_log WHERE tenant_id=${quote(tenant)}::uuid AND event_code LIKE 'master.%' AND entity_id::text IN (SELECT id FROM ids)),
 'outbox',(SELECT count(*) FROM event.outbox WHERE tenant_id=${quote(tenant)}::uuid AND entity_id::text IN (SELECT id FROM ids)))`));
}
function routes(target){return [
 ['contact.create','POST',target.base+'/contacts',{channelType:'email',value:`denied.${runId}@verification.dev.athyper.test`,purpose:'notification',roleQualifier:marker}],
 ['address.create','POST',target.base+'/addresses',{address:{countryCode:'MY',city:'Denied '+runId},purpose:'correspondence',roleQualifier:marker}],
 ['profile.read','GET',target.base+'/profile',undefined],
 ['contact.verify','PATCH',`master/contacts/${target.contactId}/verification`,{verified:true,evidence:target.evidence}],
 ['contact.deactivate','POST',`master/contacts/${target.contactId}/deactivate`,{}],
 ['address.deactivate','POST',`master/addresses/${target.addressLinkId}/deactivate`,{}],
 ];}
async function deniedMatrix(session,target,status,label,selected=routes(target)){
 const before=state();
 for(const [route,method,path,body] of selected){
  const result=await call(session,path,method,body);record(label,route,result,status);
  assert.ok(!JSON.stringify(result.body).includes(runId),'Denied response leaked fixture contents');
  assert.ok(!result.body?.contacts&&!result.body?.addresses,'Denied profile leaked data');
 }
 assert.deepEqual(state(),before,label+': denial changed data or master-data effects');
 report.checks.push({label,route:'denial.effects',unchanged:true,piiNotReturned:true});
}
try {
 const actors=[];
 for(const fixture of publication.fixtures){
  const session=await login(fixture.username);assert.equal(session.identity.tenantId,tenant);
  const base=`master/owners/business_partner/${ownerType}/${fixture.partner}`;
  let response=await call(session,base+'/contacts','POST',{channelType:'email',value:`${fixture.username}.${runId}@verification.dev.athyper.test`,purpose:'notification',roleQualifier:marker});record(fixture.username,'contact.create',response,200);
  const contactId=response.body.id;
  response=await call(session,base+'/addresses','POST',{address:{countryCode:'MY',city:'Synthetic acceptance',line1:marker},purpose:'correspondence',roleQualifier:marker,effectiveFrom:new Date(Date.now()-86400000).toISOString()});record(fixture.username,'address.create',response,200);
  const addressLinkId=response.body.id,evidence=providerFixture(contactId);
  const actor={...session,base,contactId,addressLinkId,evidence};actors.push(actor);report.fixtures.push({username:fixture.username,ownerId:fixture.partner,organizationId:fixture.org,contactId,addressLinkId});
  response=await call(actor,base+'/profile');record(actor.username,'profile.read',response,200);
  assert.ok(response.body.contacts.some(c=>c.id===contactId&&!c.isVerified));assert.ok(response.body.addresses.some(a=>a.id===addressLinkId));
  const before=state();
  response=await call(actor,`master/contacts/${contactId}/verification`,'PATCH',{verified:true,evidence});record(actor.username,'contact.verify',response,200);assert.equal(response.body.isVerified,true);
  assert.equal(db(`SELECT is_verified FROM master.contact_link WHERE id=${quote(contactId)}::uuid`),'t');
  const after=state();assert.equal(after.audit,before.audit+1);assert.equal(after.outbox,before.outbox+1);
  response=await call(actor,`master/contacts/${contactId}/verification`,'PATCH',{verified:true,evidence});record(actor.username,'contact.verify.replay',response,409,'VERIFICATION_EVIDENCE_REPLAY');assert.deepEqual(state(),after);
 }
 const [admin,owner]=actors;
 await deniedMatrix(admin,owner,403,'catl.admin outside organization scope');
 // catl.owner intentionally retains the earlier verification grant for organization A.
 // Its other five capabilities are B-only; do not rewrite grants to force a denial.
 await deniedMatrix(owner,admin,403,'catl.owner outside sensitive organization scope',routes(admin).filter(([route])=>route!=='contact.verify'));
 const replay=await call(owner,`master/contacts/${admin.contactId}/verification`,'PATCH',{verified:true,evidence:admin.evidence});record('catl.owner retained organization A verification grant','contact.verify',replay,409,'VERIFICATION_EVIDENCE_REPLAY');
 const finance=await login('catl.finance');assert.equal(finance.identity.tenantId,tenant);
 assert.ok(!finance.identity.permissions.some(p=>p.endsWith('_contact_sensitive')||p.endsWith('_address_sensitive')||p.endsWith('.verify_contact')),'Expected ungranted finance test actor');
 await deniedMatrix(finance,admin,403,'catl.finance without sensitive permissions');
 for(const username of ['athyper.admin','athyper.owner']){
  const foreign=await login(username);assert.equal(foreign.identity.tenantId,'11111111-1111-4111-8111-111111111111');
  await deniedMatrix(foreign,admin,404,username+' foreign tenant');
 }
 const anonymous=await browser.newContext({ignoreHTTPSErrors:true});contexts.push(anonymous);const page=await anonymous.newPage();await page.goto(neon+'/contact-verification.html');
 await deniedMatrix({page},admin,401,'anonymous');
 // A same-organization target change must reach the verifier and fail target binding.
 const second=await call(admin,admin.base+'/contacts','POST',{channelType:'email',value:`second.${runId}@verification.dev.athyper.test`,purpose:'notification',roleQualifier:marker});record(admin.username,'contact.create.second-target',second,200);
 report.secondContactId=second.body.id;let before=state();
 let response=await call(admin,`master/contacts/${second.body.id}/verification`,'PATCH',{verified:true,evidence:admin.evidence});record(admin.username,'contact.verify.wrong-target',response,422,'VERIFICATION_EVIDENCE_INVALID');assert.deepEqual(state(),before);
 for(const actor of actors){
  const historicalAt=new Date().toISOString();
  response=await call(actor,`master/contacts/${actor.contactId}/deactivate`,'POST',{});record(actor.username,'contact.deactivate',response,204);
  const contactEnd=new Date(db(`SELECT effective_until::text FROM master.contact_link WHERE tenant_id=${quote(tenant)}::uuid AND id=${quote(actor.contactId)}::uuid`)).toISOString();
  const beforeRepeat=state();
  response=await call(actor,`master/contacts/${actor.contactId}/deactivate`,'POST',{effectiveUntil:contactEnd});record(actor.username,'contact.deactivate.replay',response,409,'MASTER_DATA_PERIOD_CLOSED');
  assert.deepEqual(state(),beforeRepeat,'Contact deactivation retry duplicated effects');
  response=await call(actor,`master/addresses/${actor.addressLinkId}/deactivate`,'POST',{});record(actor.username,'address.deactivate',response,204);
  response=await call(actor,actor.base+'/profile');record(actor.username,'profile.after-deactivate',response,200);
  assert.ok(!response.body.contacts.some(c=>c.id===actor.contactId));assert.ok(!response.body.addresses.some(a=>a.id===actor.addressLinkId));
  response=await call(actor,actor.base+'/profile?asOf='+encodeURIComponent(historicalAt));record(actor.username,'profile.historical-contact',response,200);assert.ok(response.body.contacts.some(c=>c.id===actor.contactId&&c.isVerified));
  response=await call(actor,actor.base+'/profile?asOf='+encodeURIComponent(new Date(Date.now()-86400000).toISOString()));record(actor.username,'profile.historical-address',response,200);assert.ok(response.body.addresses.some(a=>a.id===actor.addressLinkId));
  const ids=`(${quote(actor.contactId)},${quote(actor.addressLinkId)})`;
  const effects=JSON.parse(db(`SELECT jsonb_build_object('audit',(SELECT jsonb_agg(x ORDER BY event_code) FROM (SELECT event_code,count(*)::int AS count FROM audit.audit_log WHERE tenant_id=${quote(tenant)}::uuid AND event_code LIKE 'master.%' AND entity_id IN ${ids} GROUP BY event_code)x),'outbox',(SELECT jsonb_agg(x ORDER BY event_type) FROM (SELECT event_type,count(*)::int AS count FROM event.outbox WHERE tenant_id=${quote(tenant)}::uuid AND entity_id IN ${ids} GROUP BY event_type)x))`));
  assert.deepEqual(effects.audit.map(e=>e.event_code).sort(),['master.address.deactivated','master.address.linked','master.contact.created','master.contact.deactivated','master.contact.verification_changed'].sort());
  assert.deepEqual(effects.outbox.map(e=>e.event_type).sort(),effects.audit.map(e=>e.event_code).sort());assert.ok([...effects.audit,...effects.outbox].every(e=>e.count===1));
  report.fixtures.find(f=>f.contactId===actor.contactId).effects=effects;
 }
 response=await call(admin,`master/contacts/${second.body.id}/deactivate`,'POST',{});record(admin.username,'contact.deactivate.second-target',response,204);
 // Same-day and future cancellation must release the exact primary/duplicate slot.
 for (const actor of actors) for (const [label,days] of [['today',0],['future',3]]) {
  const input={address:{countryCode:'MY',city:'Synthetic cancellation',line1:marker+'-'+label},purpose:'correspondence',roleQualifier:marker+'-'+label,isPrimary:true,effectiveFrom:new Date(Date.now()+days*86400000).toISOString()};
  response=await call(actor,actor.base+'/addresses','POST',input);record(actor.username,'address.cancel.'+label+'.create',response,200);const id=response.body.id,addressId=response.body.addressId;
  response=await call(actor,`master/addresses/${id}/deactivate`,'POST',{});record(actor.username,'address.cancel.'+label,response,204);
  response=await call(actor,actor.base+'/profile?asOf='+encodeURIComponent(input.effectiveFrom));record(actor.username,'address.cancel.'+label+'.profile',response,200);assert.ok(!response.body.addresses.some(a=>a.id===id));
  response=await call(actor,`master/addresses/${id}/deactivate`,'POST',{});record(actor.username,'address.cancel.'+label+'.replay',response,409,'ADDRESS_LINK_ALREADY_CANCELLED');
  const persisted=JSON.parse(db(`SELECT jsonb_build_object('status',usage_status,'actorRecorded',usage_denied_by IS NOT NULL,'timeRecorded',usage_denied_at IS NOT NULL,'audit',(SELECT count(*) FROM audit.audit_log WHERE tenant_id=${quote(tenant)}::uuid AND entity_id=${quote(id)} AND event_code='master.address.deactivated'),'outbox',(SELECT count(*) FROM event.outbox WHERE tenant_id=${quote(tenant)}::uuid AND entity_id=${quote(id)} AND event_type='master.address.deactivated'),'disposition',(SELECT payload->>'disposition' FROM event.outbox WHERE tenant_id=${quote(tenant)}::uuid AND entity_id=${quote(id)} AND event_type='master.address.deactivated')) FROM master.address_link WHERE tenant_id=${quote(tenant)}::uuid AND id=${quote(id)}::uuid`));
  assert.deepEqual(persisted,{status:'cancelled',actorRecorded:true,timeRecorded:true,audit:1,outbox:1,disposition:'cancelled'});
  response=await call(actor,actor.base+'/addresses','POST',input);record(actor.username,'address.cancel.'+label+'.replacement',response,200);assert.equal(response.body.addressId,addressId);assert.notEqual(response.body.id,id);
  const replacement=response.body.id;response=await call(actor,`master/addresses/${replacement}/deactivate`,'POST',{});record(actor.username,'address.cancel.'+label+'.cleanup',response,204);
 }
 report.complete=true;
} finally {
 report.finishedAt=new Date().toISOString();await Promise.all(contexts.map(c=>c.close()));await browser.close();
 writeFileSync('/tmp/athyper-local-six-route-acceptance.json',JSON.stringify(report,null,2));
}
console.log(JSON.stringify({complete:report.complete,runId,checks:report.checks.length,report:'/tmp/athyper-local-six-route-acceptance.json'}));
