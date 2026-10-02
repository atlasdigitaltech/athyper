import { expect, it } from 'vitest';
import { parseEntityRuntimeDescriptor } from './descriptor-parser.js';
it('retains published form presentation through runtime descriptor storage parsing',()=>{
 const mode={sections:[{key:'names',label:'Names',fields:['name']}],submitLabel:'Save profile',help:{name:'Your name.'}};
 const compiled={schema:'athyper.entity-runtime-descriptor/1.0',entityCode:'principal_profile',planeKey:'neon',releaseId:'release-1',releaseNo:1,contractHash:'a'.repeat(64),compiledHash:'b'.repeat(64),storage:{schema:'master',object:'principal_profile',idField:'id',tenantField:'tenant_id'},fields:[{key:'name',storagePath:'name',type:'string',required:false,writableOn:['create','patch']}],operations:{read:{code:'read',permissionCode:'profile.read'}},formPresentation:{schemaVersion:1,create:mode,edit:mode}};
 const envelope={entity_code:'principal_profile',release_id:'release-1',release_no:1,entity_contract_hash:'a'.repeat(64),plane_code:'neon',compiled_hash:'b'.repeat(64),compiled_json:compiled};
 expect(parseEntityRuntimeDescriptor(envelope).formPresentation).toEqual(compiled.formPresentation);
 expect(()=>parseEntityRuntimeDescriptor({...envelope,compiled_json:{...compiled,formPresentation:{...compiled.formPresentation,edit:{...mode,help:{secret:'Private'}}}}})).toThrow();
});
