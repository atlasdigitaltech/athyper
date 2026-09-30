import {test} from 'node:test';
import assert from 'node:assert/strict';
import {unresolvedRecoveryPermissions} from './publication-recovery-preflight.mjs';
const binding = {permissionId:'original',permissionCode:'neon.relationship.bp_target.read',scopeKind:'tenant'};
const permission = {id:'original',code:binding.permissionCode,kind:'entity_operation',scopeKinds:['tenant']};
test('exact published catalog coordinate resolves',()=>assert.deepEqual(unresolvedRecoveryPermissions([binding],[permission]),[]));
for (const [name,patch] of Object.entries({id:{id:'replacement'},code:{code:'other'},kind:{kind:'capability'},scope:{scopeKinds:[]}})) {
  test(`rejects ${name} drift`,()=>assert.equal(unresolvedRecoveryPermissions([binding],[{...permission,...patch}]).length,1));
}
test('missing permissions are deduplicated',()=>assert.equal(unresolvedRecoveryPermissions([binding,binding],[]).length,1));
test('invalid binding list fails closed',()=>assert.throws(()=>unresolvedRecoveryPermissions(undefined,[])));
