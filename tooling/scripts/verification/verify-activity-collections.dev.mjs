/** Read all three effective descriptors; exercise only temporary personal views via APIs. */
import {request} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const results=[];
async function client(plane){const origin=`https://${plane}.dev.athyper.test`,context=await request.newContext({ignoreHTTPSErrors:true,storageState:`tests/e2e/.auth/dev/${plane}/catl.owner.json`});return {context,async call(path,body,expected=200){const cookie=(await context.storageState()).cookies.find(c=>c.domain===new URL(origin).hostname&&/^(?:__Host-)?athyper-csrf$/.test(c.name));const r=await context.fetch(origin+'/api/relay'+path,{method:body?'POST':'GET',headers:{origin,...(cookie?{'x-csrf-token':decodeURIComponent(cookie.value)}:{})},...(body?{data:body}:{})});let b;try{b=await r.json()}catch{b={code:'non-json'}}assert.equal(r.status(),expected,`${plane} ${path} ${JSON.stringify(b)}`);return b;}};}
for(const plane of ['neon','mesh','studio']){
 const c=await client(plane);try{
  for(const kind of ['notifications','inbox']){
   const base=`/collections/activity.${kind}`,descriptor=await c.call(base+'/descriptor');assert.equal(descriptor.plane,plane);
   const before=await c.call(base+'/views');let id;
   try{
    const created=await c.call(base+'/views',{action:'create',name:`Local collection verification ${Date.now()}`,visibility:'personal',state:{schemaVersion:1,collection:descriptor.configuration.defaultState}},201);id=created.createdId;assert.ok(id);
    const version=created.views.find(v=>v.id===id).version;const updated=await c.call(base+'/views',{action:'update',id,version,name:'Local collection verification updated'});
    await c.call(base+'/views',{action:'update',id,version,name:'Stale update'},409);
    await c.call(base+'/views',{action:'create',name:'Invalid fixture',visibility:'personal',state:{schemaVersion:99,collection:descriptor.configuration.defaultState}},400);
    await c.call(base+'/views',{action:'default',id,target:'personal'});
    const fresh=await client(plane);try{const reread=await fresh.call(base+'/views');assert.equal(reread.personalDefault,id);assert.equal(reread.views.find(v=>v.id===id).version,updated.views.find(v=>v.id===id).version);}finally{await fresh.context.dispose();}
    results.push({plane,kind,releaseNo:descriptor.releaseNo,defaultDensity:descriptor.configuration.defaultState.density,savedViewFreshSession:true,staleRevisionRejected:true,incompatibleVersionRejected:true});
   }finally{if(id){await c.call(base+'/views',before.personalDefault?{action:'default',id:before.personalDefault,target:'personal'}:{action:'clear_default'});await c.call(base+'/views',{action:'delete',id});}}
  }
 }finally{await c.context.dispose();}
}
writeFileSync('/tmp/athyper-activity-phase2-verification.json',JSON.stringify(results,null,2)+'\n');console.log(results);
