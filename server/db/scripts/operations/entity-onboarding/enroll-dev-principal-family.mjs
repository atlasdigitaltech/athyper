/** Uses existing independent control-plane sessions; never creates an approval itself. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
const mode=process.argv[2];assert.ok(['propose','activate','execute'].includes(mode));
const names=process.argv.slice(3);assert.ok(names.length&&names.every(n=>['ui-profile','principal'].includes(n)));
const output=join(homedir(),'.athyper/instances/dev/evidence/principal-stage2-20261001');
const read=name=>JSON.parse(readFileSync(join(output,name+'.json'),'utf8'));
for(const name of names){
 const pin=mode==='propose'?undefined:read(name+(mode==='activate'?'-policy-proposed':'-policy-active'));
 const headers={'x-plane':'studio','content-type':'application/json'};
 if(mode==='execute'){
  const workload=JSON.parse(readFileSync(join(homedir(),'.athyper/instances/dev/secrets/dev-publication-athyper/client.json'),'utf8'));
  headers['x-publication-author']=workload.author;headers['x-publication-publisher']=workload.publisher;
 }else{
  const actor=mode==='propose'?'admin':'owner';
  const session=JSON.parse(readFileSync(join(homedir(),`.athyper/instances/dev/secrets/control-api/login/platform.${actor}.json`),'utf8'));
  const claims=JSON.parse(Buffer.from(session.accessToken.split('.')[1],'base64url'));
  assert.ok(claims.exp*1000>Date.now(),'Refresh the existing control-plane operator session');
  headers.authorization=`Bearer ${session.accessToken}`;
 }
 const r=await fetch('https://api.dev.athyper.test/api/studio/publication-policies'+(pin?`/${pin.id}/${mode}`:''),{method:'POST',headers,body:JSON.stringify(mode==='propose'?read(name+'-policy-candidate'):mode==='activate'?{expectedHash:pin.hash}:{version:pin.version,expectedHash:pin.hash})});
 const body=await r.json();writeFileSync(join(output,name+(mode==='propose'?'-policy-proposed':mode==='activate'?'-policy-active':'-execution')+'.json'),JSON.stringify({...body,httpStatus:r.status},null,2)+'\n');
 assert.equal(r.status,200,JSON.stringify(body));console.log(JSON.stringify({name,mode,...body}));
}
