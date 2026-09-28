import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildCutoverSql,identities} from './cutover-dev-platform-authority.mjs';

test('default rehearsal rolls back; commit is explicit and preserves principal IDs',()=>{
 const sql=buildCutoverSql();assert.match(sql,/ROLLBACK;$/);assert.doesNotMatch(sql,/COMMIT;/);
 assert.match(buildCutoverSql(true),/COMMIT;$/);
 assert.doesNotMatch(sql,/DELETE FROM|DROP |INSERT INTO master.principal\(/);
 assert.match(sql,/auth_epoch=auth_epoch\+1/);
});
test('staged grants and identity pins are revalidated inside the locked transaction',()=>{
 const sql=buildCutoverSql(true);assert.equal((sql.match(/BEGIN;/g)||[]).length,1);
 assert.match(sql,/pg_advisory_xact_lock/);assert.match(sql,/Role permission drift/);assert.match(sql,/Group scope drift/);
 assert.match(sql,/current_database\(\)<>'athyper_studio'/);
 for(const id of Object.values(identities)){assert.ok(sql.includes(id.old));assert.ok(sql.includes(id.current));}
 assert.ok(sql.indexOf("status='revoked',is_primary=false")<sql.indexOf('SET is_primary=true'));
 assert.match(sql,/studio.platform_authority.cutover/);
});
