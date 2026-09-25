/** Normal signed-in DEV commands on the dedicated cutover fixture; flags restored. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {actor} from './partner-classification-session.mjs';
if(!process.argv.includes('--run'))throw Error('Explicit --run required');
const id='01a0d757-97b0-72bc-b37f-b77ffb685a52';
const admin=await actor('catl.admin'),owner=await actor('catl.owner');
const base=`entity-runtime/business_partner/records/${id}`;
const run=randomUUID();
const version=async()=>{const r=await admin.call(`${base}/bootstrap?surface=detail`);assert.equal(r.status,200);return Number(r.body.header.revision);};
const change=(user,capability,enabled,expectedVersion,key)=>user.call(`${base}/operations/capability_${capability}_manage`,{input:{enabled,reason:'Synthetic DEV capability verification; not transaction authorization'}},{expectedVersion,idempotencyKey:key});
const enabled=[];
try{
 let v=await version();
 const denied=await change(owner,'supplier',true,v,`denied-${run}`);
 assert.equal(denied.status,403,'Owner has no newly granted capability management');
 for(const capability of ['supplier','customer']){
  v=await version();const key=`enable-${capability}-${run}`;
  const result=await change(admin,capability,true,v,key);
  assert.equal(result.status,200,JSON.stringify(result));enabled.push(capability);
  assert.equal(result.body.enabled,true);
  const replay=await change(admin,capability,true,v,key);
  assert.equal(replay.status,200,JSON.stringify(replay));assert.equal(replay.body.replayed,true);
  assert.equal(replay.body.evidenceId,result.body.evidenceId);
  const stale=await change(admin,capability,false,v,`stale-${capability}-${run}`);
  assert.equal(stale.status,409,JSON.stringify(stale));
  console.log(`PASS ${capability}: granted command, identical-evidence replay, stale-version denial`);
 }
 console.log('PASS ungranted owner denied; both independent capabilities enabled on dedicated test partner');
}finally{
 try{
  for(const capability of enabled.reverse()){
   const result=await change(admin,capability,false,await version(),`restore-${capability}-${run}`);
   assert.equal(result.status,200,`RESTORE FAILED ${capability}: ${JSON.stringify(result)}`);
   console.log(`Restored ${capability}=false through the governed command`);
  }
 }finally{await admin.dispose();await owner.dispose();}
}
