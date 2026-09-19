import test from 'node:test';
import assert from 'node:assert/strict';
import {inventorySql,summarizeInventory} from './inspect-master-data-environment.mjs';
test('inventory uses read-only application role and rejects injected or privileged roles',()=>{
 assert.match(inventorySql(),/BEGIN READ ONLY; SET LOCAL ROLE athyper_runtime;/);
 assert.throws(()=>inventorySql('postgres'));
 assert.throws(()=>inventorySql('athyper_runtime; RESET ROLE'));
});
test('catalog presence cannot certify functional acceptance',()=>{
 const result=summarizeInventory({role:'athyper_runtime',readOnly:'on',roleFlags:{},objects:[{name:'master.contact_link',exists:true,rlsEnabled:true,rlsForced:true}],columnChecks:[]});
 assert.equal(result.qualified,false);assert.equal(result.functionalAcceptance,'not_run');
 assert.deepEqual(result.missingObjects,[]);
 assert.deepEqual(summarizeInventory({objects:[{name:'event.outbox',exists:false}]}).missingObjects,['event.outbox']);
});
