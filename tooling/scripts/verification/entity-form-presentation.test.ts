import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseEntityFormPresentation } from '../../../packages/contracts/platform/entity-runtime/src/form-presentation';
const mode = {sections:[{key:'names',label:'Names',fields:['name']}],submitLabel:'Save profile',help:{name:'Your display name.'}};
test('published layouts reject unknown fields, duplicate fields and help outside the declared layout',()=>{
 assert.throws(()=>parseEntityFormPresentation({schemaVersion:1,create:{...mode,help:{secret:'Private'}},edit:mode},['name']));
 assert.throws(()=>parseEntityFormPresentation({schemaVersion:1,create:mode,edit:mode},['other']));
 assert.throws(()=>parseEntityFormPresentation({schemaVersion:1,create:{...mode,sections:[...mode.sections,{key:'again',label:'Again',fields:['name']}]},edit:mode},['name']));
});
test('layouts retain mode-specific actions and ordered fields',()=>{
 const result=parseEntityFormPresentation({schemaVersion:1,create:{...mode,submitLabel:'Set up profile'},edit:mode},['name']);
 assert.equal(result.create.submitLabel,'Set up profile');assert.equal(result.edit.help.name,'Your display name.');
});
test('meaningful setup rejects empty text but admits false and zero overrides',async()=>{
 const { meaningfulFormInput }=await import('../../../packages/contracts/platform/entity-runtime/src/form-presentation');
 for(const value of [undefined,null,'','  ']) assert.equal(meaningfulFormInput({name:value},['name']),false);
 for(const value of [false,0,'Name']) assert.equal(meaningfulFormInput({name:value},['name']),true);
 assert.throws(()=>parseEntityFormPresentation({schemaVersion:1,meaningfulFields:['secret'],create:mode,edit:mode},['name','secret']));
});
