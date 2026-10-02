import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formFieldErrors, formVersionConflict } from '../../../packages/platform/entity/runtime/form-detail/src/form-errors';
const fields = [{key:'name',label:'Name',kind:'string' as const,required:true,readOnly:false},{key:'tenant_id',label:'Tenant',kind:'uuid' as const,required:false,readOnly:true}];
const message = (key:string) => key;
test('field feedback excludes protected and unknown fields and server messages',()=>{
 const error={problem:{errors:{result:{kind:'FieldsNotWritable',fields:{name:[{code:'FIELD_REQUIRED',message:'private data'}],tenant_id:[{code:'FIELD_REQUIRED'}],secret:[{code:'FIELD_REQUIRED'}]}}}}};
 assert.deepEqual(formFieldErrors(error,fields,message),{name:'validation.required'});
});
test('domain validation admits only current writable fields',()=>{
 assert.deepEqual(formFieldErrors({problem:{errors:{result:{kind:'ValidationFailed',fields:['name','tenant_id','secret']}}}},fields,message),{name:'validation.value'});
});
test('only an optimistic version conflict offers reload',()=>{
 assert.equal(formVersionConflict({problem:{code:'RECORD_VERSION_CONFLICT'}}),true);
 assert.equal(formVersionConflict({problem:{code:'RECORD_IDEMPOTENCY_CONFLICT'}}),false);
});
