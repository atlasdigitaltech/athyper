import {randomUUID} from "node:crypto";
import { request } from '@playwright/test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {actors,authenticated,save,images,tenant,parent,attachment} from './atlas-f6-common.mjs';
const report={observedAt:new Date().toISOString(),tenantId:tenant,images:images(),personas:[],checks:[],blockers:[]};
const chat=JSON.parse(readFileSync('docs/examples/atlas-f5/cirrus-document-chat.qualification.json','utf8'));
for(const plane of Object.keys(actors))for(const actor of Object.keys(actors[plane])){
 let auth;
 try{
  auth=await authenticated(plane,actor);
  const admission=await auth.client.get('/api/relay/atlas/admission');const body=await admission.json();
  const persona={plane,actor,principalId:auth.session.principalId,authenticated:true,assurance:auth.session.assurance,admissionStatus:admission.status(),chatAllowed:body.chatAllowed,policyRevision:body.policyRevision};report.personas.push(persona);
  if(plane==='neon'){
   const headers=await auth.headers();
   const search=await auth.client.post('/api/relay/atlas/knowledge/search',{headers,data:{entityCode:'business_partner',recordId:parent,query:'Indigo Lantern'}});
   const result=await search.json();
   if(actor==='catl.admin' && auth.session.assurance!=='elevated'){
    assert.equal(search.status(),403);assert.equal(body.chatAllowed,false);
    const create=await auth.client.post('/api/relay/atlas/threads',{headers:{...headers,'idempotency-key':randomUUID()},data:{title:'F6 baseline assurance denial'}});assert.equal(create.status(),403);
    report.checks.push({name:'baseline_mfa_denied_for_chat_retrieval_and_conversation_creation',status:403});
    report.blockers.push({plane,actor,message:'Elevated MFA session required for positive pilot qualification'});
   }else if(actor==='catl.admin'){
    assert.equal(search.status(),200);assert.ok(result.citations.some(c=>c.citation.sourceId===attachment));
    const denied=await auth.client.post('/api/relay/atlas/knowledge/search',{headers,data:{entityCode:'business_partner',recordId:'00000000-0000-4000-8000-000000000001',query:'Indigo Lantern'}});
    assert.ok([400,403,404,409].includes(denied.status()));report.checks.push({name:'unavailable_parent_denied',status:denied.status()});
   }else{
    assert.equal(search.status(),403);assert.ok(!JSON.stringify(result).includes(attachment));
    const history=await auth.client.get('/api/relay/atlas/threads/'+chat.threadId+'/messages');assert.ok([403,404].includes(history.status()));assert.ok(!(await history.text()).includes('Indigo Lantern'));
    report.checks.push({name:'same_tenant_other_actor_history_denied',status:history.status()});
   }
   report.checks.push({name:search.ok()?'authorized_retrieval':'denied_atlas_admission',actor,status:search.status()});
  }
 }catch(error){report.blockers.push({plane,actor,message:error.message});}
 finally{if(auth)await auth.close();}
}
const anonymous=await request.newContext({baseURL:'https://neon.dev.athyper.test',ignoreHTTPSErrors:true});
try{const r=await anonymous.post('/api/relay/atlas/knowledge/search',{data:{entityCode:'business_partner',recordId:parent,query:'Indigo Lantern'}});assert.ok([401,403].includes(r.status()));report.checks.push({name:'anonymous_denied',status:r.status()});}finally{await anonymous.dispose();}
report.expectedPersonaCount=Object.values(actors).reduce((count,planeActors)=>count+Object.keys(planeActors).length,0);
report.authenticatedPersonasPassed=report.personas.length===report.expectedPersonaCount;report.passed=report.blockers.length===0&&report.authenticatedPersonasPassed;save('personas.json',report);console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
