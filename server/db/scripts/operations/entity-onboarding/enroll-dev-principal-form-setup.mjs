/** Exact saved candidates only, through the existing independent publication workflow. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
const mode=process.argv[2];assert.ok(['propose','activate','execute'].includes(mode));
const directory=join(homedir(),'.athyper/instances/dev/evidence/principal-form-setup-20261001');
const entities=process.argv.slice(3);
assert.ok(entities.length && entities.every(name=>['principal','principal_profile','principal_notification_preference','principal_ui_profile'].includes(name)));
const read=name=>JSON.parse(readFileSync(join(directory,name+'.json'),'utf8'));
for(const entity of entities){
 const candidate=read(entity+'-policy-candidate');
 const pin=mode==='propose'?undefined:read(entity+(mode==='activate'?'-policy-proposed':'-policy-active'));
 const headers={'x-plane':'studio','content-type':'application/json'};
 if(mode==='execute'){
  const workload=JSON.parse(readFileSync(join(homedir(),'.athyper/instances/dev/secrets/dev-publication-athyper/client.json'),'utf8'));
  headers['x-publication-author']=workload.author;headers['x-publication-publisher']=workload.publisher;
 }else{
  const actor=mode==='propose'?'admin':'owner';
  const session=JSON.parse(readFileSync(join(homedir(),`.athyper/instances/dev/secrets/control-api/login/platform.${actor}.json`),'utf8'));
  const claims=JSON.parse(Buffer.from(session.accessToken.split('.')[1],'base64url'));
  assert.ok(claims.exp*1000>Date.now(),'Refresh the existing publication operator session');headers.authorization=`Bearer ${session.accessToken}`;
 }
 const response=await fetch('https://api.dev.athyper.test/api/studio/publication-policies'+(pin?`/${pin.id}/${mode}`:''),{method:'POST',headers,body:JSON.stringify(mode==='propose'?candidate:mode==='activate'?{expectedHash:pin.hash}:{version:pin.version,expectedHash:pin.hash})});
 const body=await response.json();const suffix=mode==='propose'?'-policy-proposed':mode==='activate'?'-policy-active':'-execution';
 writeFileSync(join(directory,entity+suffix+'.json'),JSON.stringify({...body,httpStatus:response.status},null,2)+'\n',{mode:0o600});
 assert.equal(response.status,200,JSON.stringify(body));console.log(JSON.stringify({entity,mode,id:body.id,status:body.status,httpStatus:response.status}));
}
