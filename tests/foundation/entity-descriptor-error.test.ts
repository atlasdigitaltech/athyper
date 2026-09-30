import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyAppError} from '@athyper/platform-shell-app-foundation/error-taxonomy';

test('missing descriptor is configuration missing, not a missing business record',()=>{
 const model=classifyAppError({error:{status:404,code:'ENTITY_DESCRIPTOR_NOT_FOUND',requestId:'req-descriptor'},applicationName:'Business Partners'});
 assert.equal(model.title,'Business Partners is not configured for this workspace');
 assert.equal(model.kind,'service-unavailable');
 assert.equal(model.requestId,'req-descriptor');
 assert.equal(model.canRetry,false);
 assert.equal(model.action,'none');
 assert.match(model.description,/publish and activate/);
});
test('ordinary missing records and permission failures retain their meanings',()=>{
 assert.equal(classifyAppError({error:{status:404}}).title,'Record not found');
 assert.equal(classifyAppError({error:{status:403,code:'ENTITY_DESCRIPTOR_NOT_FOUND'}}).kind,'permission-denied');
 assert.equal(classifyAppError({error:{status:401,code:'ENTITY_DESCRIPTOR_NOT_FOUND'}}).kind,'authentication');
 assert.equal(classifyAppError({error:{status:404,code:'ENTITY_DESCRIPTOR_NOT_FOUND'}}).title,'This entity is not configured for this workspace');
});
