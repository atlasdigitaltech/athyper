import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyReference,parseMatches,catalogSql} from './partner-capability-dependencies.mjs';
test('distinguishes identity dependencies from retained capacity vocabulary',()=>{
 assert.equal(classifyReference('server/packages/a.ts','supplierId'),'identity-reference-review');
 assert.equal(classifyReference('server/db/a.sql','master.customer'),'identity-reference-review');
 assert.equal(classifyReference('metadata/a.json','"supplier"'),'capacity-or-entity-key-review');
 assert.equal(classifyReference('server/packages/__tests__/a.ts','supplierId'),'test-or-fixture');
 assert.equal(classifyReference('apps/docs-internal/a.md','supplierId'),'historical-or-documentation');
});
test('inventory retains exact location and tokens without copying source data',()=>{
 const output=JSON.stringify({type:'match',data:{path:{text:'server/packages/a.ts'},line_number:4,lines:{text:'supplierId = "private-value"'},submatches:[{match:{text:'supplierId'}}]}});
 assert.deepEqual(parseMatches(output),[{path:'server/packages/a.ts',line:4,kind:'identity-reference-review',tokens:['supplierId']}]);
 assert.ok(!JSON.stringify(parseMatches(output)).includes('private-value'));
 assert.deepEqual(parseMatches('{"type":"summary"}\n'),[]);
});
test('catalog inspection is read-only and includes actual inbound keys and indexes',()=>{
 assert.match(catalogSql,/BEGIN READ ONLY/);assert.match(catalogSql,/pg_constraint/);assert.match(catalogSql,/pg_indexes/);assert.match(catalogSql,/ROLLBACK/);
 assert.doesNotMatch(catalogSql,/\b(?:DELETE|UPDATE|INSERT|DROP|ALTER)\b/);
});
