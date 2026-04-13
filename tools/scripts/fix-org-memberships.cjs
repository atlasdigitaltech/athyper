#!/usr/bin/env node
/**
 * fix-org-memberships.cjs
 * Retries org membership assignment using the correct KC 26.x endpoint:
 *   POST /admin/realms/{realm}/organizations/{orgId}/members
 *   Body: plain userId string (not array)
 * Also tries the path-based approach as fallback.
 */
const https = require('https');

const KC_BASE  = 'https://iam.mesh.athyper.local';
const KC_REALM = 'athyper';
const KC_ADMIN = 'athyperadmin';
const KC_PASS  = 'athyperadmin';
const agent = new https.Agent({ rejectUnauthorized: false });

function request(method, url, body, token, contentType) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const bodyStr = body === null ? null
      : body instanceof URLSearchParams ? body.toString()
      : typeof body === 'string' ? body
      : JSON.stringify(body);
    const ct = contentType || (
      body instanceof URLSearchParams ? 'application/x-www-form-urlencoded' :
      typeof body === 'string' ? 'text/plain' : 'application/json'
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
  // Try 1: POST with userId as plain string
  const r1 = await api('POST', `/admin/realms/${KC_REALM}/organizations/${orgId}/members`,
    userId, token, 'application/json'
  );
  if (r1.status === 201 || r1.status === 204 || r1.status === 200) return { ok: true, method: 'string-body', status: r1.status };

  // Try 2: PUT to /members/{userId}
  const r2 = await api('PUT', `/admin/realms/${KC_REALM}/organizations/${orgId}/members/${userId}`,
    null, token
  );
  if (r2.status === 201 || r2.status === 204 || r2.status === 200) return { ok: true, method: 'path', status: r2.status };

  // Try 3: POST with [userId] array
  const r3 = await api('POST', `/admin/realms/${KC_REALM}/organizations/${orgId}/members`,
    [userId], token
  );
  if (r3.status === 201 || r3.status === 204 || r3.status === 200) return { ok: true, method: 'array', status: r3.status };

  return { ok: false, r1: r1.status, r2: r2.status, r3: r3.status, err: r1.data };
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
  for (const o of (orgsR.data||[])) orgsByAlias[o.alias] = o;
  console.log(`Orgs loaded: ${Object.keys(orgsByAlias).length}`);

  // Get users
  const usersR = await api('GET', `/admin/realms/${KC_REALM}/users?first=0&max=300`, null, token);
  const usersByUsername = {};
  for (const u of (usersR.data||[])) usersByUsername[u.username] = u;
  console.log(`Users loaded: ${Object.keys(usersByUsername).length}`);

  // For each org, clear existing members first
  console.log('\nClearing existing org memberships...');
  for (const alias of [...new Set(Object.values(USER_ORGS).flat())]) {
    const org = orgsByAlias[alias];
    if (!org) continue;
    const membR = await api('GET', `/admin/realms/${KC_REALM}/organizations/${org.id}/members?first=0&max=200`, null, token);
    for (const m of (membR.data||[])) {
      const del = await api('DELETE', `/admin/realms/${KC_REALM}/organizations/${org.id}/members/${m.id}`, null, token);
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
      const org = orgsByAlias[alias];
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

  // Verify
  console.log('\n── Verification ──');
  const verifyOrgs = ['athyper--ATHQ', 'athyper--AQTU'];
  for (const alias of verifyOrgs) {
    const org = orgsByAlias[alias];
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
