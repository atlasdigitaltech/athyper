import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseEntityRecord} from '../../packages/contracts/platform/entity-runtime/src/index.ts';
const reference={entityCode:'country',recordId:'10000000-0000-4000-8000-000000000001',value:'AE',label:'United Arab Emirates'};
test('reference coordinates are retained only for present, matching record fields',()=>{
 const record=parseEntityRecord({id:'1',values:{country_code:'AE'},references:{country_code:reference,hidden:reference}});
 assert.deepEqual(Object.keys(record.references!),['country_code']);
 assert.equal(record.references!.country_code!.recordId,reference.recordId);
 assert.throws(()=>parseEntityRecord({id:'1',values:{country_code:'MASKED'},references:{country_code:reference}}));
});
test('reference parsing rejects unsafe entity paths and external record URLs',()=>{
 for(const ref of [{...reference,entityCode:'../country'},{...reference,recordId:'https://other.test/a'},{...reference,label:''}])
  assert.throws(()=>parseEntityRecord({id:'1',values:{country_code:'AE'},references:{country_code:ref}}));
});
