#!/usr/bin/env node
// Read-only deployment smoke checks for the local control-admin rollout.
import assert from 'node:assert/strict';
import https from 'node:https';
import {spawnSync} from 'node:child_process';
import {writeFileSync,mkdirSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';

const origin='https://api.dev.athyper.test';
function get(path){
 return new Promise((resolve,reject)=>{
  https.get(origin+path,{rejectUnauthorized:false,timeout:15000},response=>{
   let body='';response.setEncoding('utf8');
   response.on('data',chunk=>{body+=chunk;});
   response.on('end',()=>resolve({status:response.statusCode,body:JSON.parse(body)}));
  }).on('error',reject).on('timeout',function(){this.destroy(new Error('Local API timeout'));});
 });
}
function docker(args){
 const r=spawnSync('docker',args,{encoding:'utf8'});
 assert.equal(r.status,0,'Local Docker verification failed');return r.stdout.trim();
}
const readiness=await get('/readyz');assert.equal(readiness.status,200);
const openapi=await get('/openapi.json');assert.equal(openapi.status,200);
const inventory=Object.entries(openapi.body.paths)
 .filter(([path])=>path.startsWith('/api/control-admin/'))
 .flatMap(([path,operations])=>Object.keys(operations).filter(method=>['get','post','put','patch','delete'].includes(method)).map(method=>({method:method.toUpperCase(),path})));
const expected={parameters:4,features:4,entitlements:4,lookups:4,rounding:4,'bank-validation':3,connectors:6};
for(const [group,count] of Object.entries(expected))
 assert.equal(inventory.filter(row=>row.path.split('/')[3]===group).length,count,group);
assert.equal(inventory.length,29,'Unexpected control-admin exposure; review prerequisites before extending this profile');
const authentication=[];
for(const path of ['parameters','features','entitlements/plans','entitlements/modules','lookups','rounding','bank-validation/rules']){
 const r=await get('/api/control-admin/'+path);
 assert.equal(r.status,401,path+' must require authentication');authentication.push({path,status:r.status});
}
const services={};
for(const service of ['api','worker','scheduler','neon-web']){
 const c=JSON.parse(docker(['inspect','--format','{{json .}}','athyper-dev-'+service+'-1']));
 assert.equal(c.State.Health?.Status,'healthy',service);
 services[service]={image:c.Image,health:c.State.Health.Status};
}
const polling={};
for(const plane of ['studio','neon','mesh']){
 const count=Number(docker(['exec','athyper-dev-db-1','psql','-U','postgres','-d','athyper_'+plane,'-X','-At','-c',"SELECT count(*) FROM ops.job_execution WHERE job_type='control.connector-health.poll' AND status='succeeded' AND created_at>now()-interval '5 minutes';"]));
 assert.ok(count>0,'No recent connector-health polling success on '+plane);polling[plane]=count;
}
const receipt={checkedAt:new Date().toISOString(),environment:'local development',origin,inventory,authentication,services,polling,readiness:readiness.body,limitations:['Authenticated mutation/browser acceptance is not covered','No remote connector was probed']};
const root=join(homedir(),'.athyper/instances/dev/receipts');mkdirSync(root,{recursive:true,mode:0o700});
const path=join(root,'local-control-admin.json');writeFileSync(path,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({status:'passed',operations:inventory.length,authenticationChecks:authentication.length,polling,receipt:path}));
