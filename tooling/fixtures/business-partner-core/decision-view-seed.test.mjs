import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decisionViewSeedSql} from './decision-view-seed.mjs';
import {id} from './seed-identity.mjs';

test('defaults preserve CATL and rollback',()=>{
 const sql=decisionViewSeedSql();
 assert.equal(sql,decisionViewSeedSql(false,'cirrusatlantic'));
 assert.ok(sql.endsWith('ROLLBACK;'));
 assert.ok(sql.includes(id('cirrusatlantic','partner')));
});
test('Athyper fixture identities and actor remain tenant-local',()=>{
 const sql=decisionViewSeedSql(true,'athyper');
 assert.ok(sql.endsWith('COMMIT;'));
 assert.ok(sql.includes("tenant.code='athyper' AND principal.code='athyper.admin'"));
 assert.ok(sql.includes(id('athyper','partner')));
 assert.ok(sql.includes(id('athyper','person-partner')));
 assert.ok(!sql.includes(id('cirrusatlantic','partner')));
 assert.ok(sql.includes('Decision fixture collision or drift'));
 assert.ok(!sql.includes('"decision":"approved"'));
 assert.doesNotMatch(sql,/INSERT INTO authz\.|TRUNCATE|DELETE FROM/);
});
test('unsupported tenant cannot generate SQL',()=>{
 assert.throws(()=>decisionViewSeedSql(true,"athyper' OR true"),/Unsupported demo tenant/);
});
