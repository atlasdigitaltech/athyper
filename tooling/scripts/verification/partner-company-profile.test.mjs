import { resolveSourcePath } from "../metadata/source-workspace.mjs";
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const root = new URL('../../../', import.meta.url);
const read = path => readFileSync(resolveSourcePath(new URL(path, root)), 'utf8');
const tables = read('server/db/ddl/planes/neon/master/03_tables.sql');
const constraints = read('server/db/ddl/planes/neon/master/05_constraints.sql');
const functions = read('server/db/ddl/planes/neon/master/07_functions.sql');
for (const role of ['supplier', 'customer']) {
  test(`${role} profile identity is partner-owned in DDL and metadata`, () => {
    const name = `company_code_${role}_profile`;
    const body = tables.slice(tables.indexOf(`CREATE TABLE master.${name} (`)).split('\n);')[0];
    assert.match(body, /business_partner_id\s+uuid\s+NOT NULL/);
    assert.match(body, /UNIQUE \(tenant_id, business_partner_id, company_code_id\)/);
    assert.doesNotMatch(body, new RegExp(`\\b${role}_id\\b`));
    const fk = constraints.slice(constraints.indexOf(`ALTER TABLE master.${name}\n`)).split(';')[0];
    assert.match(fk, /FOREIGN KEY \(tenant_id, business_partner_id\)\s+REFERENCES master.business_partner \(tenant_id, id\)/);
    const core = JSON.parse(read(`metadata/entities/${role}_company_profile/core.json`));
    assert.equal(core.fields.find(f => f.key === 'business_partner_id').binding.column, 'business_partner_id');
    assert.ok(!core.fields.some(f => f.key === `${role}_id`));
    const bp = JSON.parse(read('metadata/entities/business_partner/core.json'));
    const relation = bp.relations.find(r => r.targetEntityCode === `${role}_company_profile`);
    const segments = relation.binding.scopeContract.ownerMapping.segments;
    assert.equal(segments.length, 1);
    assert.equal(segments[0].fromColumn, 'business_partner_id');
    assert.equal(segments[0].toObject, 'master.business_partner');
  });
}
test('company materializer retains governance and writes the partner coordinate', () => {
  const body = functions.slice(functions.indexOf('CREATE OR REPLACE FUNCTION master.command_materialize_business_partner_company_case(')).split('END $$;')[0];
  assert.doesNotMatch(body, /master\.(supplier|customer)\b/);
  assert.match(body, /current_case.status<>'approved'/);
  assert.match(body, /current_case.row_version<>p_expected_case_version/);
  assert.match(body, /fn_validate_entity_case_payload/);
  assert.match(body, /bp.supplier_enabled/);
  assert.match(body, /bp.customer_enabled/);
  assert.equal((body.match(/ON CONFLICT\(tenant_id,business_partner_id,company_code_id\)/g) ?? []).length, 2);
  assert.doesNotMatch(body, /target_role_id\s*:=\s*bp_id/);
});
