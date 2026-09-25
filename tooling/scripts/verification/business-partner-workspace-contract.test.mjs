import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const entity = 'metadata/products/mdg/entities/business_partner/';
const json = (path) => JSON.parse(read(path));
const detail = json(`${entity}presentation.detail.json`);

test('legal name has a distinct storage binding and identity/overview presentation', () => {
  const core = json(`${entity}core.json`);
  assert.equal(core.fields.find(f => f.key === 'name').binding.sourceObject, 'master.business_partner');
  assert.deepEqual(core.fields.find(f => f.key === 'legal_name').binding, {
    sourceObject: 'master.business_partner_organization_identity', column: 'legal_name',
  });
  for (const section of ['identity', 'overview']) {
    const metadata = json(`${entity}presentation.section.${section}.json`);
    assert.ok(metadata.fieldBindings.some(f => f.fieldKey === 'legal_name'));
    assert.equal(metadata.authorization.enforceBeforeDataQuery, true);
  }
  const ddl = read('server/db/ddl/planes/neon/master/33_partner_organization_identity.sql');
  assert.ok(ddl.includes('CREATE TABLE master.business_partner_organization_identity'));
  assert.ok(read('server/db/ddl/planes/neon/_manifest.txt').includes('planes/neon/master/33_partner_organization_identity.sql'));
});

test('qualifications have one dedicated tab, outside partner fact collections', () => {
  const tabs = detail.navigation.tabs;
  assert.equal(tabs.filter(t => t.sectionKey === 'qualifications-certificates').length, 1);
  assert.equal(tabs.find(t => t.key === 'qualifications').sectionKey, 'qualifications-certificates');
  const facts = tabs.find(t => t.provider === '360').sectionKeys;
  assert.ok(!facts.includes('qualifications-certificates'));
  for (const section of ['identity', 'industries', 'commodities', 'banking', 'certificates']) {
    assert.ok(facts.includes(section), `${section} remains partner data`);
  }
});

test('organization profile has one physical authority and the list reads its projection', () => {
  const core = json(`${entity}core.json`);
  const tables = read('server/db/ddl/planes/neon/master/03_tables.sql');
  const header = tables.split('CREATE TABLE master.business_partner (')[1]?.split('\n);')[0];
  assert.ok(header);
  const profile = read('server/db/ddl/planes/neon/master/33_partner_organization_identity.sql');
  for (const key of ['legal_form_value_id','registration_country_code','incorporation_date','business_type_value_id','founded_year','employee_count','employee_count_as_of','employee_count_scope']) {
    assert.equal(core.fields.find(f => f.key === key)?.binding.sourceObject, 'master.business_partner_organization_identity', key);
    assert.doesNotMatch(header, new RegExp(`\\b${key}\\s+`), key);
    assert.match(profile, new RegExp(`\\b${key}\\s+`), key);
  }
  assert.doesNotMatch(header, /\blegal_form\s+/);
  const manifest = read('server/db/ddl/planes/neon/_manifest.txt');
  assert.ok(!manifest.includes('18_business_partner_business_profile.sql'));
  assert.ok(manifest.indexOf('master/33_partner_organization_identity.sql') < manifest.indexOf('master/09_views.sql'));
  assert.ok(profile.includes('WITH (security_invoker=true)'));
  assert.ok(read('server/db/scripts/provisioning/provision-development-business-partner-runtime.ts').includes('object: "business_partner_identity_current"'));
});

test('navigation retains existing section identity, server reader and permission boundary', () => {
  const section = json(`${entity}presentation.section.qualifications-certificates.json`);
  const binding = detail.sections.find(s => s.sectionKey === section.sectionKey);
  assert.equal(binding.viewPermission, 'neon.relationship.business_partner_qualification.read');
  assert.equal(section.authorization.viewPermission, binding.viewPermission);
  assert.equal(section.authorization.enforceBeforeDataQuery, true);
  assert.equal(section.authorization.discoverableWhenDenied, false);
  assert.equal(section.dataBinding.scopeAuthority, 'server');
  assert.equal(section.dataBinding.handlerKey, 'neon.bp.section.qualifications-certificates.v1');
  assert.ok(section.dataBinding.existingRoutes.includes('/api/neon/business-partners/:id/360/qualifications'));
  assert.ok(read('server/apps/platform-host/src/composition/register-services.ts')
    .includes('"neon.bp.section.qualifications-certificates.v1": "qualifications-certificates"'));
  const core = json('metadata/products/mdg/entities/business_partner_qualification/core.json');
  assert.equal(core.storage.primaryObject, 'control.business_partner_qualification');
  assert.equal(core.storage.genericWriteEnabled, false);
  const ddl = read('server/db/ddl/planes/neon/control/03_tables.sql');
  const table = ddl.split('CREATE TABLE control.business_partner_qualification (')[1]?.split('\n);')[0];
  assert.ok(table, 'qualification authority exists');
  for (const field of core.fields.filter(f => f.binding?.sourceObject === core.storage.primaryObject)) {
    assert.match(table, new RegExp(`\\b${field.binding.column}\\s+`), field.binding.column);
  }
});

test('existing work items, setup and transaction entry points are not removed by tab separation', () => {
  for (const key of ['roles', 'requests', 'business-transactions', 'activity']) {
    assert.ok(detail.navigation.tabs.some(t => t.key === key), key);
  }
  assert.equal(new Set(detail.navigation.tabs.map(t => t.key)).size, detail.navigation.tabs.length);
});
