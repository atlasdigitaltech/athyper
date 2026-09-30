#!/usr/bin/env node
/**
 * deploy-users-groups-idps.cjs
 * Fixes what the partial import couldn't do:
 *  1. Delete old demo users (kumar, raja, demo_* users)
 *  2. Create 17 new per-persona users with correct passwords
 *  3. Assign users to KC groups (grp:workbench:*)
 *  4. Create 3 KC groups if missing
 *  5. Ensure neon-web has ACCESS/WB_USER/WB_PARTNER/WB_ADMIN roles
 *  6. Add GitHub + Microsoft IdPs (after verifying broker flow exists)
 *  7. Reassign org memberships for new users
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const KC_BASE  = process.env.KEYCLOAK_BASE_URL || 'https://iam.athyper.local';
const KC_REALM = process.env.NEON_KEYCLOAK_REALM || 'neon';
const KC_ADMIN = 'athyperadmin';
const KC_PASS  = 'athyperadmin';
const REALM_FILE = path.join(__dirname, '../../../deploy/config/iam/realm-neon.json');

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const agent = new https.Agent({ rejectUnauthorized: false });

function request(method, url, body, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname, port: 443,
      path: u.pathname + (u.search || ''), method, agent,
      headers: {
        'Content-Type': body instanceof URLSearchParams
          ? 'application/x-www-form-urlencoded' : 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };
    const req = https.request(opts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        const data = raw ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : null;
        resolve({ status: res.statusCode, data });
      });
    });
    req.on('error', reject);
    if (body) req.write(body instanceof URLSearchParams ? body.toString() : JSON.stringify(body));
    req.end();
  });
}

const api = (m, p, b, t) => request(m, `${KC_BASE}${p}`, b, t);

// ── New demo users ────────────────────────────────────────────────────────────
const makeId = n => `aa001000-0000-0000-0000-${n.toString(16).padStart(12, '0')}`;

const DEMO_USERS = [
  { username:'athq.viewer',   firstName:'ATHQ',    lastName:'Viewer',   email:'athq.viewer@athyper.demo',    id:makeId(1),  groups:['grp:workbench:user'] },
  { username:'athq.reporter', firstName:'ATHQ',    lastName:'Reporter', email:'athq.reporter@athyper.demo',  id:makeId(2),  groups:['grp:workbench:user'] },
  { username:'athq.requester',firstName:'ATHQ',    lastName:'Requester',email:'athq.requester@athyper.demo', id:makeId(3),  groups:['grp:workbench:user'] },
  { username:'athq.agent',    firstName:'ATHQ',    lastName:'Agent',    email:'athq.agent@athyper.demo',     id:makeId(4),  groups:['grp:workbench:user'] },
  { username:'athq.manager',  firstName:'ATHQ',    lastName:'Manager',  email:'athq.manager@athyper.demo',   id:makeId(5),  groups:['grp:workbench:user'] },
  { username:'athq.owner',    firstName:'ATHQ',    lastName:'Owner',    email:'athq.owner@athyper.demo',     id:makeId(6),  groups:['grp:workbench:user'] },
  { username:'athq.admin',    firstName:'ATHQ',    lastName:'Admin',    email:'athq.admin@athyper.demo',     id:makeId(7),  groups:['grp:workbench:admin'] },
  { username:'aqtu.manager',  firstName:'AQTU',    lastName:'Manager',  email:'aqtu.manager@athyper.demo',   id:makeId(8),  groups:['grp:workbench:user'] },
  { username:'asac.manager',  firstName:'ASAC',    lastName:'Manager',  email:'asac.manager@athyper.demo',   id:makeId(9),  groups:['grp:workbench:user'] },
  { username:'auic.manager',  firstName:'AUIC',    lastName:'Manager',  email:'auic.manager@athyper.demo',   id:makeId(10), groups:['grp:workbench:user'] },
  { username:'asgf.manager',  firstName:'ASGF',    lastName:'Manager',  email:'asgf.manager@athyper.demo',   id:makeId(11), groups:['grp:workbench:user'] },
  { username:'athq.cfo',      firstName:'ATHQ',    lastName:'CFO',      email:'athq.cfo@athyper.demo',       id:makeId(12), groups:['grp:workbench:user'] },
  { username:'partner.viewer',firstName:'Partner', lastName:'Viewer',   email:'partner.viewer@athyper.demo', id:makeId(13), groups:['grp:workbench:partner'] },
  { username:'partner.agent', firstName:'Partner', lastName:'Agent',    email:'partner.agent@athyper.demo',  id:makeId(14), groups:['grp:workbench:partner'] },
  { username:'partner.manager',firstName:'Partner',lastName:'Manager',  email:'partner.manager@athyper.demo',id:makeId(15), groups:['grp:workbench:partner'] },
  { username:'partner.owner', firstName:'Partner', lastName:'Owner',    email:'partner.owner@athyper.demo',  id:makeId(16), groups:['grp:workbench:partner'] },
  { username:'karim.dual',    firstName:'Karim',   lastName:'Dual',     email:'karim.dual@athyper.demo',     id:makeId(17), groups:['grp:workbench:user','grp:workbench:partner'] },
];

// Org memberships per user
const USER_ORGS = {
  'athq.viewer':    ['athyper--athq'],
  'athq.reporter':  ['athyper--athq'],
  'athq.requester': ['athyper--athq'],
  'athq.agent':     ['athyper--athq'],
  'athq.manager':   ['athyper--athq'],
  'athq.owner':     ['athyper--athq'],
  'athq.admin':     ['athyper--athq'],
  'aqtu.manager':   ['athyper--aqtu'],
  'asac.manager':   ['athyper--asac'],
  'auic.manager':   ['athyper--AUIC'],
  'asgf.manager':   ['athyper--ASGF'],
  'athq.cfo':       ['athyper--athq','athyper--amre','athyper--aqtu','athyper--asac','athyper--aqts','athyper--auet','athyper--asah'],
  'partner.viewer': ['athyper--aqtu'],
  'partner.agent':  ['athyper--aqtu'],
  'partner.manager':['athyper--aqtu'],
  'partner.owner':  ['athyper--aqtu'],
  'karim.dual':     ['athyper--aqtu'],
};

async function main() {
  // 1. Token
  const tokenResp = await request('POST',
    `${KC_BASE}/realms/master/protocol/openid-connect/token`,
    new URLSearchParams({ client_id:'admin-cli', grant_type:'password', username:KC_ADMIN, password:KC_PASS })
  );
  const token = tokenResp.data?.access_token;
  if (!token) { console.error('No token:', tokenResp.data); process.exit(1); }
  console.log('✓ Token obtained');

  // ── 1. Ensure 3 WORKBENCH roles exist on neon-web ────────────────────────
  console.log('\n── neon-web WORKBENCH roles ──');
  const clientsResp = await api('GET', `/admin/realms/${KC_REALM}/clients?clientId=neon-web`, null, token);
  const neonWebId = clientsResp.data?.[0]?.id;
  if (!neonWebId) { console.error('neon-web client not found'); process.exit(1); }

  const existingRoles = await api('GET', `/admin/realms/${KC_REALM}/clients/${neonWebId}/roles`, null, token);
  const existingRoleNames = new Set((existingRoles.data||[]).map(r=>r.name));
  const roleMap = {};
  for (const r of (existingRoles.data||[])) roleMap[r.name] = r.id;

  const requiredRoles = [
    { name:'ACCESS',     description:'Can authenticate into Neon at all', id:'dd000001-0000-0000-0000-000000000001' },
    { name:'WB_USER',    description:'Loads user workbench shell',         id:'af6abc0f-076e-459d-868a-18d938681122' },
    { name:'WB_PARTNER', description:'Loads partner workbench shell',      id:'914fae1f-d75d-4f1e-ab16-3e0ce1717c10' },
    { name:'WB_ADMIN',   description:'Loads admin workbench shell',        id:'67d10733-a9d9-404f-a303-5d0a0ba5fea4' },
  ];
  for (const role of requiredRoles) {
    if (!existingRoleNames.has(role.name)) {
      const cr = await api('POST', `/admin/realms/${KC_REALM}/clients/${neonWebId}/roles`,
        { name: role.name, description: role.description, clientRole: true }, token
      );
      console.log(`  ${cr.status===201?'✓':'✗'} Created role: ${role.name}`);
      // Get the new role ID
      const newRole = await api('GET', `/admin/realms/${KC_REALM}/clients/${neonWebId}/roles/${encodeURIComponent(role.name)}`, null, token);
      roleMap[role.name] = newRole.data?.id;
    } else {
      console.log(`  ✓ Exists: ${role.name}`);
      roleMap[role.name] = (existingRoles.data||[]).find(r=>r.name===role.name)?.id;
    }
  }

  // ── 2. Ensure 3 groups exist ─────────────────────────────────────────────
  console.log('\n── KC Groups ──');
  const groupsResp = await api('GET', `/admin/realms/${KC_REALM}/groups`, null, token);
  const existingGroups = {};
  for (const g of (groupsResp.data||[])) existingGroups[g.name] = g;

  const GROUPS = [
    { id:'cc000001-0000-0000-0000-000000000001', name:'grp:workbench:user',    role:'WB_USER' },
    { id:'cc000002-0000-0000-0000-000000000001', name:'grp:workbench:partner', role:'WB_PARTNER' },
    { id:'cc000003-0000-0000-0000-000000000001', name:'grp:workbench:admin',   role:'WB_ADMIN' },
  ];

  const groupIdMap = {};
  for (const grp of GROUPS) {
    let groupId;
    if (existingGroups[grp.name]) {
      groupId = existingGroups[grp.name].id;
      console.log(`  ✓ Exists: ${grp.name} (${groupId})`);
    } else {
      const cr = await api('POST', `/admin/realms/${KC_REALM}/groups`, { name: grp.name }, token);
      if (cr.status === 201) {
        // Get group by name to get ID
        const freshGroups = await api('GET', `/admin/realms/${KC_REALM}/groups`, null, token);
        const created = freshGroups.data?.find(g => g.name === grp.name);
        groupId = created?.id;
        console.log(`  ✓ Created: ${grp.name} (${groupId})`);
      } else {
        console.log(`  ✗ Failed to create: ${grp.name} (${cr.status})`);
        continue;
      }
    }
    groupIdMap[grp.name] = groupId;

    // Assign ACCESS + WB_* role to group (IAM §5.2: every group grants ACCESS gate + shell role)
    const rolesToAssign = ['ACCESS', grp.role].map(n => ({ id: roleMap[n], name: n, clientRole: true, containerId: neonWebId })).filter(r => r.id);
    if (rolesToAssign.length) {
      const roleAssign = await api('POST',
        `/admin/realms/${KC_REALM}/groups/${groupId}/role-mappings/clients/${neonWebId}`,
        rolesToAssign,
        token
      );
      const ok = roleAssign.status === 204 || roleAssign.status === 200;
      console.log(`    ${ok?'✓':'✗'} Roles [ACCESS, ${grp.role}] → ${grp.name} (${roleAssign.status})`);
    }
  }

  // ── 3. Get existing users — identify old ones to delete ──────────────────
  console.log('\n── Users: delete old, create new ──');
  const allUsersResp = await api('GET', `/admin/realms/${KC_REALM}/users?first=0&max=300`, null, token);
  const allUsers = allUsersResp.data || [];
  const newUsernames = new Set(DEMO_USERS.map(u => u.username));
  const svcPrefixes = ['service-account-'];

  // Delete users NOT in new set and NOT service accounts
  for (const u of allUsers) {
    if (!newUsernames.has(u.username) && !svcPrefixes.some(p => u.username?.startsWith(p))) {
      const del = await api('DELETE', `/admin/realms/${KC_REALM}/users/${u.id}`, null, token);
      console.log(`  ${del.status===204?'✓':'✗'} Deleted: ${u.username} (${del.status})`);
    }
  }

  // Refresh user list
  const usersAfterDelete = await api('GET', `/admin/realms/${KC_REALM}/users?first=0&max=300`, null, token);
  const existingUsernames = new Set((usersAfterDelete.data||[]).map(u => u.username));
  const userIdByUsername = {};
  for (const u of (usersAfterDelete.data||[])) userIdByUsername[u.username] = u.id;

  // Create new users
  for (const u of DEMO_USERS) {
    if (existingUsernames.has(u.username)) {
      console.log(`  ✓ Exists: ${u.username}`);
      continue;
    }
    const userPayload = {
      id: u.id,
      username: u.username,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      emailVerified: true,
      enabled: true,
      credentials: [{
        type: 'password',
        value: 'Demo@1234',
        temporary: false,
      }],
      realmRoles: ['default-roles-athyper'],
      attributes: {},
    };
    const cr = await api('POST', `/admin/realms/${KC_REALM}/users`, userPayload, token);
    if (cr.status === 201) {
      console.log(`  ✓ Created: ${u.username}`);
      // Get actual ID from Location header or by querying
      const created = await api('GET', `/admin/realms/${KC_REALM}/users?username=${encodeURIComponent(u.username)}&exact=true`, null, token);
      userIdByUsername[u.username] = created.data?.[0]?.id;
    } else {
      console.log(`  ✗ Failed to create: ${u.username} (${cr.status}) — ${JSON.stringify(cr.data)?.slice(0,150)}`);
    }
  }

  // ── 4. Assign users to groups ────────────────────────────────────────────
  console.log('\n── User → Group assignments ──');
  for (const u of DEMO_USERS) {
    const userId = userIdByUsername[u.username];
    if (!userId) { console.log(`  ✗ User ID not found: ${u.username}`); continue; }
    for (const grpName of u.groups) {
      const groupId = groupIdMap[grpName];
      if (!groupId) { console.log(`  ✗ Group not found: ${grpName}`); continue; }
      const add = await api('PUT', `/admin/realms/${KC_REALM}/users/${userId}/groups/${groupId}`, {}, token);
      const ok = add.status === 204 || add.status === 200;
      if (!ok) console.log(`  ✗ ${u.username} → ${grpName} (${add.status})`);
    }
    console.log(`  ✓ ${u.username} → ${u.groups.join(', ')}`);
  }

  // ── 5. Assign org memberships for new users ───────────────────────────────
  console.log('\n── Org memberships for new users ──');
  const orgsResp = await api('GET', `/admin/realms/${KC_REALM}/organizations?first=0&max=100`, null, token);
  const orgsByAlias = {};
  for (const o of (orgsResp.data||[])) orgsByAlias[o.alias.toLowerCase()] = o;

  // Refresh user IDs
  const freshUsers = await api('GET', `/admin/realms/${KC_REALM}/users?first=0&max=300`, null, token);
  const freshUserMap = {};
  for (const u of (freshUsers.data||[])) freshUserMap[u.username] = u.id;

  for (const [username, orgAliases] of Object.entries(USER_ORGS)) {
    const userId = freshUserMap[username];
    if (!userId) { console.log(`  ✗ User not found: ${username}`); continue; }
    for (const alias of orgAliases) {
      const org = orgsByAlias[alias.toLowerCase()];
      if (!org) { console.log(`  ✗ Org not found: ${alias}`); continue; }
      const add = await api('POST',
        `/admin/realms/${KC_REALM}/organizations/${org.id}/members`,
        userId, token
      );
      const ok = add.status === 201 || add.status === 204 || add.status === 200;
      if (!ok) throw new Error(`${username} → ${alias} failed (${add.status}: ${JSON.stringify(add.data)?.slice(0,100)})`);
    }
    console.log(`  ✓ ${username} → ${orgAliases.join(', ')}`);
  }

  // ── 6. GitHub + Microsoft IdPs ────────────────────────────────────────────
  console.log('\n── IdPs ──');
  // First verify broker login flow exists
  const flowsResp = await api('GET', `/admin/realms/${KC_REALM}/authentication/flows`, null, token);
  const flowAliases = new Set((flowsResp.data||[]).map(f=>f.alias));
  const brokerFlowExists = flowAliases.has('neon broker login');
  console.log(`  neon broker login flow: ${brokerFlowExists ? 'exists' : 'MISSING'}`);

  const firstBrokerFlow = brokerFlowExists ? 'neon broker login' : 'first broker login';

  const existingIdps = await api('GET', `/admin/realms/${KC_REALM}/identity-provider/instances`, null, token);
  const idpAliases = new Set((existingIdps.data||[]).map(i=>i.alias));

  const idpDefs = [
    {
      alias: 'github', displayName: 'GitHub', providerId: 'github',
      enabled: true, trustEmail: false, storeToken: false,
      addReadTokenRoleOnCreate: false, authenticateByDefault: false, linkOnly: false,
      firstBrokerLoginFlowAlias: firstBrokerFlow,
      config: { syncMode:'IMPORT', clientId:requiredEnv('GITHUB_OAUTH_CLIENT_ID'), clientSecret:requiredEnv('GITHUB_OAUTH_CLIENT_SECRET'), useJwksUrl:'true' },
    },
    {
      alias: 'microsoft', displayName: 'Microsoft', providerId: 'microsoft',
      enabled: true, trustEmail: true, storeToken: false,
      addReadTokenRoleOnCreate: false, authenticateByDefault: false, linkOnly: false,
      firstBrokerLoginFlowAlias: firstBrokerFlow,
      config: { syncMode:'FORCE', defaultScopes:'openid profile email', clientId:requiredEnv('MICROSOFT_CLIENT_ID'), clientSecret:requiredEnv('MICROSOFT_CLIENT_SECRET') },
    },
  ];

  for (const idp of idpDefs) {
    if (idpAliases.has(idp.alias)) {
      const upd = await api('PUT', `/admin/realms/${KC_REALM}/identity-provider/instances/${idp.alias}`, idp, token);
      console.log(`  ${upd.status===204?'✓':'✗'} Updated: ${idp.alias} (${upd.status})`);
    } else {
      const cr = await api('POST', `/admin/realms/${KC_REALM}/identity-provider/instances`, idp, token);
      console.log(`  ${cr.status===201?'✓':'✗'} Created: ${idp.alias} (${cr.status})`);
      if (cr.status !== 201) console.log(`    Error: ${JSON.stringify(cr.data)?.slice(0,200)}`);
    }
  }

  // ── Final summary ─────────────────────────────────────────────────────────
  console.log('\n── Final state ──');
  const fOrgs = await api('GET', `/admin/realms/${KC_REALM}/organizations?first=0&max=100`, null, token);
  console.log(`Organizations: ${fOrgs.data?.length}`);
  const fUsers = await api('GET', `/admin/realms/${KC_REALM}/users?first=0&max=300`, null, token);
  const humanUsers = (fUsers.data||[]).filter(u => !u.username?.startsWith('service-account-'));
  console.log(`Human users: ${humanUsers.length} — ${humanUsers.map(u=>u.username).join(', ')}`);
  const fGroups = await api('GET', `/admin/realms/${KC_REALM}/groups`, null, token);
  console.log(`Groups: ${fGroups.data?.length} — ${fGroups.data?.map(g=>g.name).join(', ')}`);
  const fIdps = await api('GET', `/admin/realms/${KC_REALM}/identity-provider/instances`, null, token);
  console.log(`IdPs: ${fIdps.data?.map(i=>i.alias+`(${i.enabled?'on':'off'})`).join(', ') || 'none'}`);
  const fRealm = await api('GET', `/admin/realms/${KC_REALM}`, null, token);
  console.log(`Theme: login=${fRealm.data?.loginTheme} email=${fRealm.data?.emailTheme}`);
  console.log(`SMTP: ${fRealm.data?.smtpServer?.host}:${fRealm.data?.smtpServer?.port} from=${fRealm.data?.smtpServer?.from}`);

  console.log('\n✓ Done');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
