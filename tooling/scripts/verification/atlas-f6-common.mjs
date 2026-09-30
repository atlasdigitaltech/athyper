import { request } from '@playwright/test';
import { writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
export const directory=resolve('docs/examples/atlas-f6');
export const tenant='44444444-4444-4444-8444-444444444444';
export const parent='f7688c3d-8c92-5651-a469-da3f4f786375';
export const attachment='fc668e33-9d67-4015-83ba-8be70dfbb2c6';
export const actors={mesh:{'catl.admin':'dc4ef163-269a-5b83-90ef-5b71a56087c6','catl.owner':'3dd93048-ac4b-54a7-b820-32d0c457691b'},neon:{'catl.admin':'cca94907-7519-5871-8e3c-6b11aa545c93','catl.owner':'645b6a55-3355-526a-9643-3900425bde47'},studio:{'catl.admin':'81cd1978-2df5-5c9a-938a-2f8c291aea13','catl.owner':'5cd6cf93-3fe4-500c-8066-3ebf14a9eb5d'}};
export function save(name,value){mkdirSync(directory,{recursive:true});writeFileSync(resolve(directory,name),JSON.stringify(value,null,2)+'\n');}
export function sql(database,input){return execFileSync('docker',['exec','-i','athyper-dev-db-1','psql','-X','-qAt','-U','postgres','-d','athyper_'+database,'-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();}
export function images(){return JSON.parse(execFileSync('docker',['inspect','athyper-dev-api-1','athyper-dev-worker-1','athyper-dev-neon-web-1','athyper-dev-mesh-web-1','athyper-dev-studio-web-1','athyper-dev-atlas-atlas-inference-1'],{encoding:'utf8',stdio:'pipe'})).map(c=>({name:c.Name.slice(1),image:c.Config.Image,digest:c.Image,health:c.State.Health?.Status??c.State.Status}));}
export async function authenticated(plane,actor,expectedPrincipalId=actors[plane]?.[actor]){
 assert.ok(expectedPrincipalId,"Expected principal ID is required for qualification");
 const origin=`https://${plane}.dev.athyper.test`,state=`tests/e2e/.auth/dev/${plane}/${actor}.json`;
 const client=await request.newContext({baseURL:origin,ignoreHTTPSErrors:true,storageState:state,timeout:90_000});
 async function headers(){const csrf=(await client.storageState()).cookies.find(c=>c.domain===new URL(origin).hostname&&c.name==='__Host-athyper-csrf');return {origin,...(csrf?{'x-csrf-token':decodeURIComponent(csrf.value)}:{})};}
 const close=async()=>{await client.storageState({path:state});chmodSync(state,0o600);await client.dispose();};
 try{
  await client.post('/api/auth/refresh',{headers:await headers()});
  const session=await(await client.get('/api/auth/session')).json();
  assert.equal(session.state,'authenticated',`${plane}/${actor} session expired`);
  assert.equal(session.tenantId,tenant);assert.equal(session.principalId,expectedPrincipalId);
  return {client,session,origin,headers,close};
 }catch(error){await close();throw error;}
}

export function assistantText(page){return (page.items??[]).filter(m=>m.role==="assistant").flatMap(m=>(m.content??[]).filter(b=>b.type==="text").map(b=>b.text)).join("");}
