import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('compiled BP permission seed counts match its declarations and scope coverage', () => {
  const sql=readFileSync(new URL('../../../server/db/ddl/planes/neon/authz/16_compiled_entity_runtime_permission.sql',import.meta.url),'utf8');
  const codes = part => [...part.matchAll(/'(neon\.[a-z_.]+)'/g)].map(m=>m[1]);
  const definitions=codes(sql.split('CROSS JOIN (VALUES')[1].split(') AS definition')[0]);
  const scopes=codes(sql.split('SELECT definition.code FROM (VALUES')[1].split(') AS definition')[0]);
  const asserted=codes(sql.split('DO $assertions$')[1].split(') AS definition')[0]);
  assert.equal(new Set(definitions).size,definitions.length);
  assert.deepEqual(new Set(asserted),new Set(definitions));
  assert.deepEqual(new Set([...scopes,'neon.workforce.read']),new Set(definitions));
  assert.equal(Number(sql.match(/status='published'\) <> (\d+)/)[1]),definitions.length);
  assert.equal(Number(sql.match(/seed-expected-row-count: exact:(\d+)/)[1]),definitions.length*2);
  assert.ok(!definitions.some(code=>code.includes('commodity_capability')));
  assert.match(sql, /SELECT id,'company_code','exact'/);
});
