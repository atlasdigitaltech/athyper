#!/usr/bin/env node
/**
 * fix-org-memberships.cjs
 * Retries org membership assignment using the correct KC 26.x endpoint:
 *   POST /admin/realms/{realm}/organizations/{orgId}/members
 *   Body: plain userId string (not array)
 * The user ID is encoded as a JSON string, as required by Keycloak 26.x.
 */
const https = require('https');

const KC_BASE  = process.env.KEYCLOAK_BASE_URL || 'https://iam.athyper.local';
const KC_REALM = process.env.NEON_KEYCLOAK_REALM || 'neon';
const KC_ADMIN = process.env.KEYCLOAK_ADMIN || 'athyperadmin';
const KC_PASS  = process.env.KEYCLOAK_ADMIN_PASSWORD || 'athyperadmin';
const agent = new https.Agent({ rejectUnauthorized: false });

function request(method, url, body, token, contentType) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const bodyStr = body === null ? null
      : body instanceof URLSearchParams ? body.toString()
      : JSON.stringify(body);
    const ct = contentType || (
      body instanceof URLSearchParams ? 'application/x-www-form-urlencoded' :
      'application/json'
    );
    const opts = {
      hostname: u.hostname, port: 443,
      path: u.pathname + (u.search || ''), method, agent,
      headers: {
        'Content-Type': ct,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
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
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

const api = (m, p, b, t, ct) => request(m, `${KC_BASE}${p}`, b, t, ct);

const sleep = ms => new Promise(r => setTimeout(r, ms));

const USER_ORGS = {
  'athq.viewer':    ['athyper--ATHQ'],
  'athq.reporter':  ['athyper--ATHQ'],
  'athq.requester': ['athyper--ATHQ'],
  'athq.agent':     ['athyper--ATHQ'],
  'athq.manager':   ['athyper--ATHQ'],
  'athq.owner':     ['athyper--ATHQ'],
  'athq.admin':     ['athyper--ATHQ'],
  'aqtu.manager':   ['athyper--AQTU'],
  'asac.manager':   ['athyper--ASAC'],
  'auic.manager':   ['athyper--AUIC'],
  'asgf.manager':   ['athyper--ASGF'],
  'athq.cfo':       ['athyper--ATHQ','athyper--AMRE','athyper--AQTU','athyper--ASAC','athyper--AQTS','athyper--AUET','athyper--ASAH'],
  'partner.viewer': ['athyper--AQTU'],
  'partner.agent':  ['athyper--AQTU'],
  'partner.manager':['athyper--AQTU'],
  'partner.owner':  ['athyper--AQTU'],
  'karim.dual':     ['athyper--AQTU'],
};

async function addMember(orgId, userId, token) {
  const result = await api('POST', `/admin/realms/${KC_REALM}/organizations/${orgId}/members`,
    userId, token, 'application/json'
  );
  if ([200, 201, 204].includes(result.status)) return { ok: true, method: 'json-string-body', status: result.status };
  return { ok: false, status: result.status, err: result.data };
}

async function main() {
  // Token
  const tr = await request('POST', `${KC_BASE}/realms/master/protocol/openid-connect/token`,
    new URLSearchParams({ client_id:'admin-cli', grant_type:'password', username:KC_ADMIN, password:KC_PASS })
  );
  const token = tr.data?.access_token;
  if (!token) { console.error('No token'); process.exit(1); }
  console.log('✓ Token');

  // Get orgs
  const orgsR = await api('GET', `/admin/realms/${KC_REALM}/organizations?first=0&max=100`, null, token);
  const orgsByAlias = {};
  for (const o of (orgsR.data||[])) orgsByAlias[o.alias.toLowerCase()] = o;
  console.log(`Orgs loaded: ${Object.keys(orgsByAlias).length}`);

  // Get users
  const usersR = await api('GET', `/admin/realms/${KC_REALM}/users?first=0&max=300`, null, token);
  const usersByUsername = {};
  for (const u of (usersR.data||[])) usersByUsername[u.username] = u;
  console.log(`Users loaded: ${Object.keys(usersByUsername).length}`);

  // For each org, clear existing members first
  console.log('\nClearing existing org memberships...');
  for (const alias of [...new Set(Object.values(USER_ORGS).flat())]) {
    const org = orgsByAlias[alias.toLowerCase()];
    if (!org) continue;
    const membR = await api('GET', `/admin/realms/${KC_REALM}/organizations/${org.id}/members?first=0&max=200`, null, token);
    for (const m of (membR.data||[])) {
      await api('DELETE', `/admin/realms/${KC_REALM}/organizations/${org.id}/members/${m.id}`, null, token);
    }
  }
  console.log('  ✓ Cleared');

  // Add org memberships
  console.log('\nAdding org memberships...');
  let success = 0, failure = 0;

  for (const [username, orgAliases] of Object.entries(USER_ORGS)) {
    const user = usersByUsername[username];
    if (!user) { console.log(`  ✗ User not in KC: ${username}`); failure++; continue; }

    for (const alias of orgAliases) {
      const org = orgsByAlias[alias.toLowerCase()];
      if (!org) { console.log(`  ✗ Org not in KC: ${alias}`); failure++; continue; }

      const result = await addMember(org.id, user.id, token);
      if (result.ok) {
        success++;
      } else {
        console.log(`  ✗ ${username} → ${alias}: ${JSON.stringify(result)}`);
        failure++;
        // Tiny wait and retry once more
        await sleep(300);
        const retry = await addMember(org.id, user.id, token);
        if (retry.ok) { success++; failure--; }
        else console.log(`    Retry also failed: ${JSON.stringify(retry)}`);
      }
    }
  }

  console.log(`\nMemberships: ${success} OK, ${failure} failed`);
  if (failure > 0) throw new Error(`${failure} organization membership assignment(s) failed`);

  // Verify
  console.log('\n── Verification ──');
  const verifyOrgs = ['athyper--ATHQ', 'athyper--AQTU'];
  for (const alias of verifyOrgs) {
    const org = orgsByAlias[alias.toLowerCase()];
    if (!org) continue;
    const membR = await api('GET', `/admin/realms/${KC_REALM}/organizations/${org.id}/members?first=0&max=200`, null, token);
    const names = (membR.data||[]).map(m => m.username).join(', ');
    console.log(`${alias}: ${names || '(empty)'}`);
  }

  // Check neon broker login flow
  const flowsR = await api('GET', `/admin/realms/${KC_REALM}/authentication/flows`, null, token);
  const customFlows = (flowsR.data||[]).filter(f=>!f.builtIn).map(f=>f.alias);
  console.log('\nCustom flows:', customFlows.join(', ') || 'none');

  const idpsR = await api('GET', `/admin/realms/${KC_REALM}/identity-provider/instances`, null, token);
  console.log('IdPs:', (idpsR.data||[]).map(i=>`${i.alias}(${i.enabled?'on':'off'})`).join(', ') || 'none');
}

main().catch(e => { console.error('Fatal:', e.message, e.stack); process.exit(1); });
