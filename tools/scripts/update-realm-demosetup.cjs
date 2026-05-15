#!/usr/bin/env node
/**
 * update-realm-demosetup.cjs
 * IAM Contract R2 — align realm export to IAM-CONTRACT-001
 *
 * Changes:
 *  1. Orgs: keep 21 (17 athyper + 4 single-entity), lowercase aliases
 *  2. Org attributes: remove allowed_workbenches (duplicates client roles per §5.1)
 *  3. neon-web client roles: keep only ACCESS / WB_USER / WB_PARTNER / WB_ADMIN
 *  4. Groups: grp:workbench:* with ACCESS + WB_* roles (no {ENTITY}-ROLE groups)
 *  5. Users: 17 per-persona demo users + keep service accounts
 *  6. Org memberships: assign users per plan table
 */

const fs = require('fs');
const path = require('path');

const INPUT  = path.join(__dirname, '../../stack/config/iam/realm-demosetup.json');
const OUTPUT = INPUT; // overwrite in place

// ── 1. Load ────────────────────────────────────────────────────────────────
const realm = JSON.parse(fs.readFileSync(INPUT, 'utf8'));

// ── 2. Organizations — filter, lowercase aliases, clean attributes ─────────
const KEEP_ORG_PREFIXES = [
  'athyper--', 'athyper-hq1--', 'pepsi--', 'coke--', 'maaza--'
];

realm.organizations = realm.organizations
  .filter(org => KEEP_ORG_PREFIXES.some(p => org.alias.startsWith(p.toLowerCase())))
  .map(org => {
    // Lowercase alias: {tenant_code}--{entity_code} both lowercase (IAM §5.1)
    org.alias = org.alias.toLowerCase();
    // Rename tenant_group → tenant_code in attributes (legacy migration)
    if (org.attributes && org.attributes.tenant_group) {
      org.attributes.tenant_code = org.attributes.tenant_group;
      delete org.attributes.tenant_group;
    }
    // Remove allowed_workbenches — duplicates client roles (IAM §5.1)
    if (org.attributes) delete org.attributes.allowed_workbenches;
    // Rename industry → industry_vertical (IAM §5.1)
    if (org.attributes && org.attributes.industry) {
      org.attributes.industry_vertical = org.attributes.industry;
      delete org.attributes.industry;
    }
    // Remove org-level IdP links — KC 26.5.1 allows each IdP in at most one org;
    // having the same IdP alias in multiple orgs causes "already associated" import error.
    // IdPs are registered at realm level; org membership is handled via broker flow, not org claim.
    delete org.identityProviders;
    // Clear members — will be re-assigned below
    org.members = [];
    return org;
  });

console.log(`Orgs after filter: ${realm.organizations.length}`);

// Helper to find org by alias
const findOrg = (alias) => realm.organizations.find(o => o.alias === alias);

// Inject CirrusAtlantic org if absent after filter (alias auto-preserved via athyper-- prefix)
if (!findOrg('athyper--catl')) {
  realm.organizations.push({
    id:          'bb000030-0000-0000-0000-000000000001',
    name:        'CirrusAtlantic',
    alias:       'athyper--catl',
    enabled:     true,
    redirectUrl: '',
    attributes: {
      tenant_code:       ['cirrusatlantic'],
      industry_vertical: ['infocomm_services'],
      entity_code:       ['CATL'],
    },
    identityProviders: [],
    members: [],
  });
  console.log('Injected org: athyper--catl');
}

// ── 3. neon-web client roles — keep only 3 WORKBENCH roles ─────────────────
const KEEP_ROLES = [
  'ACCESS',
  'WB_USER',
  'WB_PARTNER',
  'WB_ADMIN',
];

if (realm.roles && realm.roles.client && realm.roles.client['neon-web']) {
  realm.roles.client['neon-web'] = realm.roles.client['neon-web']
    .filter(r => KEEP_ROLES.includes(r.name));
  console.log(`neon-web client roles kept: ${realm.roles.client['neon-web'].map(r => r.name).join(', ')}`);
}

// Existing role IDs (for group→role mapping)
const roleIds = {};
for (const r of (realm.roles?.client?.['neon-web'] || [])) {
  roleIds[r.name] = r.id;
}

// ── 4. KC Groups — add 3 workbench groups ──────────────────────────────────
const neonWebClientId = 'fd2341e8-7fdc-42c3-a269-2551e82397d2';

const WORKBENCH_GROUPS = [
  {
    id:   'cc000001-0000-0000-0000-000000000001',
    name: 'grp:workbench:user',
    clientRole: 'WB_USER',
  },
  {
    id:   'cc000002-0000-0000-0000-000000000001',
    name: 'grp:workbench:partner',
    clientRole: 'WB_PARTNER',
  },
  {
    id:   'cc000003-0000-0000-0000-000000000001',
    name: 'grp:workbench:admin',
    clientRole: 'WB_ADMIN',
  },
];

// Groups carry ACCESS (gate role) + the specific WB_* role (IAM §5.2)
realm.groups = WORKBENCH_GROUPS.map(g => ({
  id:        g.id,
  name:      g.name,
  path:      `/${g.name}`,
  subGroups: [],
  realmRoles: [],
  clientRoles: {
    'neon-web': ['ACCESS', g.clientRole],
  },
  attributes: {},
}));

console.log(`Groups created: ${realm.groups.map(g => g.name).join(', ')}`);

// Helper: group ID by workbench type
const groupId = (wb) => {
  const m = { user: WORKBENCH_GROUPS[0].id, partner: WORKBENCH_GROUPS[1].id, admin: WORKBENCH_GROUPS[2].id };
  return m[wb];
};

// ── 5. New demo users ───────────────────────────────────────────────────────
// ID pattern: aa001000-0000-0000-0000-000000000000..N (36 chars total)
const makeId = (n) => {
  const hex = n.toString(16).padStart(4, '0');
  return `aa001000-0000-0000-0000-00000000${hex}`;
};

const DEMO_USERS = [
  // username,       firstName,     lastName,   email,                      id,          wbs,              orgs
  ['athq.viewer',    'ATHQ',        'Viewer',   'athq.viewer@athyper.demo',    makeId(1),  ['user'],          ['athyper--athq']],
  ['athq.reporter',  'ATHQ',        'Reporter', 'athq.reporter@athyper.demo',  makeId(2),  ['user'],          ['athyper--athq']],
  ['athq.requester', 'ATHQ',        'Requester','athq.requester@athyper.demo', makeId(3),  ['user'],          ['athyper--athq']],
  ['athq.agent',     'ATHQ',        'Agent',    'athq.agent@athyper.demo',     makeId(4),  ['user'],          ['athyper--athq']],
  ['athq.manager',   'ATHQ',        'Manager',  'athq.manager@athyper.demo',   makeId(5),  ['user'],          ['athyper--athq']],
  ['athq.owner',     'ATHQ',        'Owner',    'athq.owner@athyper.demo',     makeId(6),  ['user'],          ['athyper--athq']],
  ['athq.admin',     'ATHQ',        'Admin',    'athq.admin@athyper.demo',     makeId(7),  ['admin'],         ['athyper--athq']],
  ['aqtu.manager',   'AQTU',        'Manager',  'aqtu.manager@athyper.demo',   makeId(8),  ['user'],          ['athyper--aqtu']],
  ['asac.manager',   'ASAC',        'Manager',  'asac.manager@athyper.demo',   makeId(9),  ['user'],          ['athyper--asac']],
  ['auic.manager',   'AUIC',        'Manager',  'auic.manager@athyper.demo',   makeId(10), ['user'],          ['athyper--auic']],
  ['asgf.manager',   'ASGF',        'Manager',  'asgf.manager@athyper.demo',   makeId(11), ['user'],          ['athyper--asgf']],
  ['athq.cfo',       'ATHQ',        'CFO',      'athq.cfo@athyper.demo',       makeId(12), ['user'],          ['athyper--athq','athyper--amre','athyper--aqtu','athyper--asac','athyper--aqts','athyper--auet','athyper--asah']],
  ['partner.viewer', 'Partner',     'Viewer',   'partner.viewer@athyper.demo', makeId(13), ['partner'],       ['athyper--aqtu']],
  ['partner.agent',  'Partner',     'Agent',    'partner.agent@athyper.demo',  makeId(14), ['partner'],       ['athyper--aqtu']],
  ['partner.manager','Partner',     'Manager',  'partner.manager@athyper.demo',makeId(15), ['partner'],       ['athyper--aqtu']],
  ['partner.owner',  'Partner',     'Owner',    'partner.owner@athyper.demo',  makeId(16), ['partner'],       ['athyper--aqtu']],
  ['karim.dual',     'Karim',       'Dual',     'karim.dual@athyper.demo',     makeId(17), ['user','partner'],['athyper--aqtu']],
  // CirrusAtlantic — stable UUIDs match DB principal seeds (aa003000-… series)
  ['catl.admin',   'CATL', 'Admin',       'admin@cirrusatlantic.com',   'aa003000-0000-0000-0000-000000000001', ['admin'], ['athyper--catl']],
  ['catl.owner',   'CATL', 'Owner',       'owner@cirrusatlantic.com',   'aa003000-0000-0000-0000-000000000002', ['user'],  ['athyper--catl']],
  ['catl.finance', 'CATL', 'Finance Lead','finance@cirrusatlantic.com', 'aa003000-0000-0000-0000-000000000003', ['user'],  ['athyper--catl']],
];

// Build new users array: service accounts + demo users
const svcAccounts = realm.users.filter(u =>
  u.username && u.username.startsWith('service-account-')
);

realm.users = [
  // Demo human users
  ...DEMO_USERS.map(([username, firstName, lastName, email, id, wbs, orgs]) => ({
    id,
    username,
    firstName,
    lastName,
    email,
    emailVerified: true,
    enabled: true,
    totp: false,
    createdTimestamp: 1743861600000,
    // Passwords are NOT seeded here — committed JSON must never contain plaintext credentials.
    // Credentials are set post-import by stack/scripts/db/seed-iam-credentials.sh (kcadm.sh set-password)
    // from IAM_DEMO_USER_PASSWORD. UPDATE_PASSWORD guards any accidentally-imported JSON from
    // leaving an unauthenticated account usable.
    credentials: [],
    disableableCredentialTypes: [],
    requiredActions: ['UPDATE_PASSWORD'],
    realmRoles: ['default-roles-athyper'],
    clientRoles: {},
    groups: wbs.map(wb => `/${WORKBENCH_GROUPS.find(g => g.name.endsWith(wb)).name}`),
    attributes: {},
    notBefore: 0,
  })),
  // Keep service accounts unchanged
  ...svcAccounts,
];

console.log(`Users after update: ${realm.users.length} (${DEMO_USERS.length} demo + ${svcAccounts.length} service)`);

// ── 6. Org memberships ──────────────────────────────────────────────────────
// Add each demo user as a member of their orgs
for (const [username,,,,,, orgs] of DEMO_USERS) {
  for (const alias of orgs) {
    const org = findOrg(alias);
    if (!org) {
      console.warn(`WARNING: org not found: ${alias} (for user ${username})`);
      continue;
    }
    if (!org.members) org.members = [];
    org.members.push({ username, membershipType: 'UNMANAGED' });
  }
}

// ── 7. Verify org count ─────────────────────────────────────────────────────
console.log('\n── Final org list ──────────────────────────────────────────────');
realm.organizations.forEach(o => {
  const tc = o.attributes?.tenant_code?.[0] || '?';
  const members = o.members?.map(m => m.username).join(', ') || '(none)';
  console.log(`  ${o.alias.padEnd(25)} ${tc.padEnd(15)} members: ${members}`);
});

console.log('\n── Final users ─────────────────────────────────────────────────');
realm.users.forEach(u => {
  const groups = Array.isArray(u.groups) ? u.groups.join(', ') : '(none)';
  console.log(`  ${(u.username || '(svc)').padEnd(20)} groups: ${groups}`);
});

// ── 8. Write ─────────────────────────────────────────────────────────────────
fs.writeFileSync(OUTPUT, JSON.stringify(realm, null, 2), 'utf8');
console.log(`\nWritten: ${OUTPUT}`);
