#!/usr/bin/env node
import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const publication=JSON.parse(readFileSync('/tmp/athyper-local-master-authority-publication.json','utf8'));
const root=resolve(homedir(),'.athyper/instances/dev/secrets');
const adminPassword=readFileSync(resolve(root,'iam-admin-password'),'utf8').trim();
const iam='https://iam.dev.athyper.test',neon='https://neon.dev.athyper.test',mail='https://mail.dev.athyper.test';
const prior=process.env.LOCAL_MASTER_DATA_RESUME==='true'?JSON.parse(readFileSync('/tmp/athyper-local-master-authority-acceptance.json','utf8')):undefined;
const runId=prior?.runId??randomUUID(), report={runId,environment:'local',authenticationMethod:'Keycloak admin-assisted development SSO; ordinary Neon session and CSRF relay',results:[],complete:false};
const db=sql=>{const r=spawnSync('docker',['exec','-i','athyper-dev-db-1','psql','-U','postgres','-d','athyper_neon','-X','-At','-v','ON_ERROR_STOP=1'],{input:'BEGIN READ ONLY;'+sql+';COMMIT;',encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.split('\n').filter(s=>s&&s!=='BEGIN'&&s!=='COMMIT');};
const type=db("SELECT id FROM control.owner_type WHERE code='business_partner' AND status='active'")[0];assert.ok(type);
const browser=await chromium.launch({args:['--ignore-certificate-errors']});
const sessions=[];
const call=(page,path,method='GET',body)=>page.evaluate(async ({path,method,body})=>{const match=document.cookie.match(/(?:^|;\s*)(?:__Host-athyper-csrf|athyper-csrf)=([^;]+)/);const response=await fetch('/api/relay/master/'+path,{method,headers:{'Content-Type':'application/json',...(match?{'X-CSRF-Token':decodeURIComponent(match[1])}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});const text=await response.text();return {status:response.status,body:text?JSON.parse(text):null};},{path,method,body});
function expectStatus(result,status,label){assert.equal(result.status,status,label+': '+JSON.stringify(result));}
async function login(username){
 const context=await browser.newContext({ignoreHTTPSErrors:true});sessions.push(context);
 let response=await context.request.post(iam+'/realms/master/protocol/openid-connect/token',{form:{client_id:'admin-cli',grant_type:'password',username:'athyper-admin',password:adminPassword}});assert.ok(response.ok());const admin=(await response.json()).access_token;
 response=await context.request.get(iam+'/admin/realms/athyper/users',{headers:{authorization:'Bearer '+admin},params:{username,exact:'true'}});const users=await response.json();assert.equal(users.length,1);
 response=await context.request.post(iam+'/admin/realms/athyper/users/'+users[0].id+'/impersonation',{headers:{authorization:'Bearer '+admin}});assert.ok(response.ok());
 const page=await context.newPage();page.setDefaultTimeout(20000);await page.goto(neon+'/api/auth/login?returnTo=/contact-verification.html');await page.waitForURL(url=>url.origin===neon&&!url.pathname.startsWith('/api/auth/'),{timeout:30000});
 return {page,context,username};
}
async function confirmChallenge(session,contactId){
 const previous=prior?.results.find(r=>r.username===session.username&&r.contactId===contactId&&r.verification);
 if(previous)return previous.verification;
 const pending=prior?db(`SELECT id FROM master.local_contact_challenge WHERE contact_id='${contactId}' AND consumed_at IS NULL AND expires_at>now() ORDER BY created_at DESC LIMIT 1`)[0]:undefined;
 const r=pending?{status:202,body:{challengeId:pending}}:await call(session.page,`contacts/${contactId}/verification-challenges`,'POST',{});expectStatus(r,202,'request verification');const challengeId=r.body.challengeId;let link;
 for(let attempt=0;attempt<90&&!link;attempt++){
  const search=await session.context.request.get(mail+'/api/v1/search',{params:{query:'subject:"Verify your Athyper contact email"'}});
  for(const message of ((await search.json()).messages||[]).slice(0,25)){
   const detail=await session.context.request.get(mail+'/api/v1/message/'+message.ID);const value=await detail.json();
   const match=String(value.Text||'').match(/https:\/\/neon\.dev\.athyper\.test\/contact-verification\.html#[A-Za-z0-9._-]+/);
   if(match?.[0].includes(challengeId)){link=match[0];break;}
  }
  if(!link)await session.page.waitForTimeout(1000);
 }
 assert.ok(link,'Queued Mailpit proof not delivered');await session.page.goto('about:blank');await session.page.goto(link);
 assert.equal(db(`SELECT consumed_at IS NULL FROM master.local_contact_challenge WHERE id='${challengeId}'`)[0],'t');
 await session.page.getByRole('button',{name:'Confirm email address'}).click();await session.page.waitForFunction(()=>document.getElementById('result').textContent.length>0);
 assert.equal(await session.page.locator('#result').textContent(),'Your contact email is verified.');
 await session.page.getByRole('button',{name:'Confirm email address'}).click();await session.page.waitForFunction(()=>document.getElementById('result').textContent.includes('CHALLENGE_ALREADY_CONSUMED'));
 return {challengeId,delivery:'durable_mailpit',getConsumed:false,replay:'rejected'};
}
try {
 const actors=[];
 if(process.env.LOCAL_MASTER_DATA_FINALIZE==='true') {
  assert.ok(prior,'Finalization requires the saved acceptance run');
  report.results.push(...prior.results);
  for(const result of report.results.filter(r=>r.username.startsWith('catl.'))) {
   assert.equal(result.crossOrganizationDenied,5);assert.equal(result.crossContactEvidence,422);
   const session=await login(result.username);
   actors.push({...session,base:`owners/business_partner/${type}/${result.partner}`,contactId:result.contactId,addressLinkId:result.addressLinkId,result});
  }
 } else {
 for(const f of publication.fixtures){
  const session=await login(f.username),base=`owners/business_partner/${type}/${f.partner}`;
  console.log(JSON.stringify({username:f.username,stage:'authenticated'}));
  const existingContact=prior?db(`SELECT id FROM master.contact_link WHERE tenant_id='${publication.tenant}' AND owner_id='${f.partner}' AND value='${f.username}.${runId}@verification.dev.athyper.test'`)[0]:undefined;
  const contact=existingContact?{status:200,body:{id:existingContact}}:await call(session.page,base+'/contacts','POST',{channelType:'email',value:`${f.username}.${runId}@verification.dev.athyper.test`,purpose:'notification',roleQualifier:'local-authority-acceptance'});expectStatus(contact,200,'create contact');
  const existingAddress=prior?db(`SELECT l.id FROM master.address_link l JOIN master.address a ON a.id=l.address_id AND a.tenant_id=l.tenant_id WHERE l.tenant_id='${publication.tenant}' AND l.owner_id='${f.partner}' AND a.line1='Synthetic ${runId}'`)[0]:undefined;
  const address=existingAddress?{status:200,body:{id:existingAddress}}:await call(session.page,base+'/addresses','POST',{address:{countryCode:'MY',city:'Local synthetic city',line1:'Synthetic '+runId},effectiveFrom:new Date(Date.now()-86400000).toISOString(),purpose:'correspondence',roleQualifier:'local-authority-acceptance'});expectStatus(address,200,'create address');
  const profile=await call(session.page,base+'/profile');expectStatus(profile,200,'profile');assert.ok(profile.body.contacts.some(c=>c.id===contact.body.id));assert.ok(profile.body.addresses.some(a=>a.id===address.body.id));
  const proof=await confirmChallenge(session,contact.body.id);
  const evidence=JSON.parse(db(`SELECT verification_evidence FROM master.contact_link WHERE id='${contact.body.id}'`)[0]);
  const replay=await call(session.page,`contacts/${contact.body.id}/verification`,'PATCH',{verified:true,evidence});expectStatus(replay,409,'PATCH evidence replay');assert.equal(replay.body.code,'VERIFICATION_EVIDENCE_REPLAY');
  const result={username:f.username,org:f.org,partner:f.partner,contactId:contact.body.id,addressLinkId:address.body.id,createContact:200,createAddress:200,resumedExistingFixture:Boolean(existingContact),profile:200,verification:proof,patchReplay:409};
  report.results.push(result);actors.push({...session,base,contactId:contact.body.id,addressLinkId:address.body.id,evidence,result});
  console.log(JSON.stringify({username:f.username,stage:'positive_complete'}));
 }
 for(const [index,actor] of actors.entries()){
  const foreign=actors[1-index];
  const checks=[['GET',foreign.base+'/profile',undefined],['POST',foreign.base+'/contacts',{channelType:'email',value:`denied.${runId}@dev.athyper.test`}],['POST',foreign.base+'/addresses',{address:{countryCode:'MY',city:'Denied'}}],['POST',`contacts/${foreign.contactId}/deactivate`,{}],['POST',`addresses/${foreign.addressLinkId}/deactivate`,{}]];
  for(const [method,path,body] of checks)expectStatus(await call(actor.page,path,method,body),403,'same-tenant other organization');
  actor.result.crossOrganizationDenied=checks.length;
  // Authenticated proof cannot verify a different contact, even in the authorized organization.
  const second=await call(actor.page,actor.base+'/contacts','POST',{channelType:'email',value:`second.${actor.username}.${runId}@verification.dev.athyper.test`,purpose:'notification'});expectStatus(second,200,'second target');
  const mismatch=await call(actor.page,`contacts/${second.body.id}/verification`,'PATCH',{verified:true,evidence:actor.evidence});expectStatus(mismatch,422,'cross-contact signed evidence');
  assert.equal(mismatch.body.code,'VERIFICATION_EVIDENCE_INVALID');actor.result.crossContactEvidence=422;actor.result.secondContactId=second.body.id;
 }
 for(const username of ['athyper.admin','athyper.owner']){
  const session=await login(username),target=actors[0];
  const checks=[['GET',target.base+'/profile',undefined],['POST',target.base+'/contacts',{channelType:'email',value:`denied.${runId}@dev.athyper.test`}],['POST',target.base+'/addresses',{address:{countryCode:'MY',city:'Denied'}}],['POST',`contacts/${target.contactId}/deactivate`,{}],['POST',`addresses/${target.addressLinkId}/deactivate`,{}],['PATCH',`contacts/${target.contactId}/verification`,{verified:true,evidence:target.evidence}]];
  for(const [method,path,body] of checks)expectStatus(await call(session.page,path,method,body),404,'cross-tenant target');
  expectStatus(await call(session.page,`contacts/${target.contactId}/verification-challenges`,'POST',{}),403,'cross-tenant challenge');
  report.results.push({username,crossTenantDenied:checks.length,challengeDenied:403});
 }
 }
 for(const actor of actors){
  if(db(`SELECT effective_until IS NULL FROM master.contact_link WHERE id='${actor.contactId}'`)[0]==='t') expectStatus(await call(actor.page,`contacts/${actor.contactId}/deactivate`,'POST',{}),204,'deactivate contact');
  if(db(`SELECT effective_until IS NULL FROM master.contact_link WHERE id='${actor.result.secondContactId}'`)[0]==='t') expectStatus(await call(actor.page,`contacts/${actor.result.secondContactId}/deactivate`,'POST',{}),204,'deactivate second contact');
  if(db(`SELECT effective_until IS NULL FROM master.address_link WHERE id='${actor.addressLinkId}'`)[0]==='t') expectStatus(await call(actor.page,`addresses/${actor.addressLinkId}/deactivate`,'POST',{}),204,'deactivate address');
  const profile=await call(actor.page,actor.base+'/profile');expectStatus(profile,200,'profile after deactivate');assert.ok(!profile.body.contacts.some(c=>c.id===actor.contactId));assert.ok(!profile.body.addresses.some(a=>a.id===actor.addressLinkId));
  actor.result.deactivateContact=204;actor.result.deactivateAddress=204;
  actor.result.audit=JSON.parse(db(`SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT event_code,count(*)::int AS count FROM audit.audit_log WHERE event_code LIKE 'master.%' AND entity_id IN ('${actor.contactId}','${actor.addressLinkId}') GROUP BY event_code ORDER BY event_code)x`)[0]);
  actor.result.outbox=JSON.parse(db(`SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT event_type,count(*)::int AS count FROM event.outbox WHERE entity_id IN ('${actor.contactId}','${actor.addressLinkId}') GROUP BY event_type ORDER BY event_type)x`)[0]);
  assert.equal(actor.result.audit.length,5);assert.ok(actor.result.audit.every(x=>x.count===1));assert.equal(actor.result.outbox.length,5);assert.ok(actor.result.outbox.every(x=>x.count===1));
 }
 report.complete=true;
} finally {await Promise.all(sessions.map(s=>s.close()));await browser.close();writeFileSync('/tmp/athyper-local-master-authority-acceptance.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
