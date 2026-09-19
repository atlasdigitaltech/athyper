#!/usr/bin/env node
/**
 * deploy-realm-demosetup.cjs
 * Deploys Phase 0 KC realm changes to live KC instance via Admin API.
 *
 * Steps:
 *  1.  Get admin token
 *  2.  Partial import: users (OVERWRITE), groups (ADD), neon-web client roles
 *  3.  Delete stale demo_* organizations
 *  4.  Upsert all 21 orgs (alias, name, attributes) — no allowed_workbenches
 *  5.  Clear + re-assign org memberships from realm JSON
 *  6.  Delete stale neon-web client roles (keep only ACCESS / WB_USER / WB_PARTNER / WB_ADMIN)
 *  7.  Add neon broker login auth flows + authenticator configs
 *  8.  Add GitHub + Microsoft IdPs
 *  9.  Verify SMTP (update if needed)
 * 10.  Final summary
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ── Config ──────────────────────────────────────────────────────────────────
const KC_BASE   = process.env.KEYCLOAK_BASE_URL || 'https://iam.athyper.local';
const KC_REALM  = process.env.NEON_KEYCLOAK_REALM || 'neon';
const KC_ADMIN  = 'athyperadmin';
const KC_PASS   = 'athyperadmin';
const REALM_FILE = path.join(__dirname, '../../../deploy/config/iam/realm-neon.json');

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optionalEnv(name, fallback = '') {
  return process.env[name] ?? fallback;
}

// Ignore self-signed TLS
const agent = new https.Agent({ rejectUnauthorized: false });

// ── HTTP helpers ────────────────────────────────────────────────────────────
function request(method, url, body, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + (u.search || ''),
      method,
      agent,
      headers: {
        'Content-Type': body instanceof URLSearchParams
          ? 'application/x-www-form-urlencoded'
          : 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
    };
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        const data = raw ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : null;
        resolve({ status: res.statusCode, data, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(body instanceof URLSearchParams ? body.toString() : JSON.stringify(body));
    }
    req.end();
  });
}

const api = (method, path_, body, token) =>
  request(method, `${KC_BASE}${path_}`, body, token);

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const realm = JSON.parse(fs.readFileSync(REALM_FILE, 'utf8'));

  // ── 1. Get admin token ────────────────────────────────────────────────────
  console.log('Step 1: Getting admin token...');
  const tokenResp = await request('POST',
    `${KC_BASE}/realms/master/protocol/openid-connect/token`,
    new URLSearchParams({
      client_id: 'admin-cli', grant_type: 'password',
      username: KC_ADMIN, password: KC_PASS,
    })
  );
  if (!tokenResp.data?.access_token) {
    console.error('Failed to get token:', JSON.stringify(tokenResp.data));
    process.exit(1);
  }
  const token = tokenResp.data.access_token;
  console.log('  ✓ Token obtained');

  // ── 2. Partial import: groups + users + roles ─────────────────────────────
  console.log('\nStep 2: Partial import (groups, users, client roles)...');

  // Build partial import payload
  const partialImport = {
    ifResourceExists: 'OVERWRITE',
    groups: realm.groups,
    users: realm.users.filter(u => !u.username?.startsWith('service-account-')),
    roles: {
      client: {
        'neon-web': realm.roles?.client?.['neon-web'] || [],
      }
    },
  };

  const importResp = await api('POST',
    `/admin/realms/${KC_REALM}/partialImport`,
    partialImport, token
  );
  if (importResp.status !== 200) {
    console.error('  Partial import failed:', importResp.status, JSON.stringify(importResp.data)?.slice(0, 300));
  } else {
    const summary = importResp.data;
    console.log(`  ✓ Added: ${summary.added}, Skipped: ${summary.skipped}, Overwritten: ${summary.overwritten}`);
  }

  // ── 2.5. Force emailVerified = true on all demo users ─────────────────────
  console.log('\nStep 2.5: Verifying email for all demo users...');
  const demoUsernames = realm.users
    .filter(u => !u.username?.startsWith('service-account-'))
    .map(u => u.username);

  const allUsersResp = await api('GET', `/admin/realms/${KC_REALM}/users?first=0&max=200`, null, token);
  const allUsers = allUsersResp.data || [];

  let verifiedCount = 0, alreadyVerified = 0;
  for (const u of allUsers) {
    if (!demoUsernames.includes(u.username)) continue;
    if (u.emailVerified) { alreadyVerified++; continue; }
    const upd = await api('PUT', `/admin/realms/${KC_REALM}/users/${u.id}`,
      { ...u, emailVerified: true }, token
    );
    const ok = upd.status === 204 || upd.status === 200;
    if (ok) verifiedCount++;
    else console.log(`  ✗ Could not verify ${u.username}: ${upd.status}`);
  }
  console.log(`  ✓ Verified: ${verifiedCount}, already verified: ${alreadyVerified}`);

  // ── 3. Delete stale demo_* orgs ───────────────────────────────────────────
  console.log('\nStep 3: Cleaning up stale organizations...');
  const orgsResp = await api('GET', `/admin/realms/${KC_REALM}/organizations?first=0&max=100`, null, token);
  const liveOrgs = orgsResp.data || [];
  console.log(`  Found ${liveOrgs.length} live orgs`);

  const keepPrefixes = ['athyper--', 'athyper-hq1--', 'pepsi--', 'coke--', 'maaza--'];
  const toDelete = liveOrgs.filter(o => !keepPrefixes.some(p => o.alias?.startsWith(p)));
  console.log(`  Orgs to delete: ${toDelete.map(o => o.alias).join(', ') || 'none'}`);

  for (const org of toDelete) {
    const del = await api('DELETE', `/admin/realms/${KC_REALM}/organizations/${org.id}`, null, token);
    const ok = del.status === 204 || del.status === 200;
    console.log(`  ${ok ? '✓' : '✗'} Deleted: ${org.alias} (${del.status})`);
  }

  // ── 4. Update org attributes + create missing orgs ────────────────────────
  console.log('\nStep 4: Upserting orgs (alias lowercase, no allowed_workbenches, industry_vertical)...');

  // Refresh live org list after deletions
  const orgsResp2 = await api('GET', `/admin/realms/${KC_REALM}/organizations?first=0&max=100`, null, token);
  const liveOrgsMap = {};
  for (const o of (orgsResp2.data || [])) liveOrgsMap[o.alias] = o;

  for (const orgDef of realm.organizations) {
    // Ensure alias is lowercase (IAM §5.1)
    const alias = orgDef.alias.toLowerCase();

    // Build clean attribute set — remove legacy keys, enforce contract
    const cleanAttrs = { ...orgDef.attributes };
    delete cleanAttrs.tenant_group;        // legacy — replaced by tenant_code
    delete cleanAttrs.allowed_workbenches; // removed per IAM §5.1 (duplicates client roles)
    // industry → industry_vertical
    if (cleanAttrs.industry) {
      cleanAttrs.industry_vertical = cleanAttrs.industry;
      delete cleanAttrs.industry;
    }

    const liveOrg = liveOrgsMap[alias];
    if (liveOrg) {
      const updatePayload = { ...liveOrg, name: orgDef.name, attributes: cleanAttrs };
      const upd = await api('PUT', `/admin/realms/${KC_REALM}/organizations/${liveOrg.id}`, updatePayload, token);
      const ok = upd.status === 204 || upd.status === 200;
      console.log(`  ${ok ? '✓' : '✗'} Updated: ${alias} (${upd.status})`);
    } else {
      const createPayload = { alias, name: orgDef.name, enabled: true, attributes: cleanAttrs, domains: orgDef.domains || [] };
      const cr = await api('POST', `/admin/realms/${KC_REALM}/organizations`, createPayload, token);
      const ok = cr.status === 201 || cr.status === 200;
      console.log(`  ${ok ? '✓' : '✗'} Created: ${alias} (${cr.status})`);
    }
  }

  // ── 5. Assign org memberships ─────────────────────────────────────────────
  console.log('\nStep 5: Assigning org memberships...');

  // Refresh org list to get IDs
  const orgsResp3 = await api('GET', `/admin/realms/${KC_REALM}/organizations?first=0&max=100`, null, token);
  const orgsByAlias = {};
  for (const o of (orgsResp3.data || [])) orgsByAlias[o.alias] = o;

  // Get all users
  const usersResp = await api('GET', `/admin/realms/${KC_REALM}/users?first=0&max=200`, null, token);
  const usersByUsername = {};
  for (const u of (usersResp.data || [])) usersByUsername[u.username] = u;

  for (const orgDef of realm.organizations) {
    const liveOrg = orgsByAlias[orgDef.alias];
    if (!liveOrg) { console.log(`  ✗ Org not found: ${orgDef.alias}`); continue; }

    // Get current members and remove them first for clean slate
    const membResp = await api('GET',
      `/admin/realms/${KC_REALM}/organizations/${liveOrg.id}/members?first=0&max=200`,
      null, token
    );
    for (const m of (membResp.data || [])) {
      await api('DELETE',
        `/admin/realms/${KC_REALM}/organizations/${liveOrg.id}/members/${m.id}`,
        null, token
      );
    }

    // Add new members
    const members = orgDef.members || [];
    for (const m of members) {
      const user = usersByUsername[m.username];
      if (!user) { console.log(`  ✗ User not found: ${m.username}`); continue; }
      const addResp = await api('POST',
        `/admin/realms/${KC_REALM}/organizations/${liveOrg.id}/members`,
        user.id, token
      );
      const ok = addResp.status === 201 || addResp.status === 200 || addResp.status === 204;
      if (!ok) console.log(`  ✗ Add member ${m.username} to ${orgDef.alias}: ${addResp.status}`);
    }
    if (members.length > 0) {
      console.log(`  ✓ ${orgDef.alias}: ${members.map(m=>m.username).join(', ')}`);
    }
  }

  // ── 6. Clean up stale neon-web client roles ───────────────────────────────
  console.log('\nStep 6: Cleaning up neon-web client roles...');
  // Find neon-web client
  const clientsResp = await api('GET', `/admin/realms/${KC_REALM}/clients?clientId=neon-web`, null, token);
  const neonWebClient = clientsResp.data?.[0];
  if (!neonWebClient) { console.log('  ✗ neon-web client not found'); }
  else {
    const rolesResp = await api('GET', `/admin/realms/${KC_REALM}/clients/${neonWebClient.id}/roles`, null, token);
    const keepRoles = new Set(['ACCESS', 'WB_USER', 'WB_PARTNER', 'WB_ADMIN']);
    for (const role of (rolesResp.data || [])) {
      if (!keepRoles.has(role.name)) {
        const del = await api('DELETE',
          `/admin/realms/${KC_REALM}/clients/${neonWebClient.id}/roles/${encodeURIComponent(role.name)}`,
          null, token
        );
        const ok = del.status === 204 || del.status === 200;
        console.log(`  ${ok ? '✓' : '✗'} Removed role: ${role.name} (${del.status})`);
      } else {
        console.log(`  ✓ Kept role: ${role.name}`);
      }
    }
  }

  // ── 7. Add neon broker login auth flows ───────────────────────────────────
  console.log('\nStep 7: Checking neon broker login auth flows...');
  const flowsResp = await api('GET', `/admin/realms/${KC_REALM}/authentication/flows`, null, token);
  const existingFlows = new Set((flowsResp.data || []).map(f => f.alias));
  if (existingFlows.has('neon broker login')) {
    console.log('  ✓ neon broker login flow already exists — skipping');
  } else {
    // Import broker login flows via partial import
    const brokerFlows = [
      {
        "alias": "neon broker login",
        "description": "Actions taken after first broker login with identity provider account",
        "providerId": "basic-flow",
        "topLevel": true,
        "builtIn": false,
        "authenticationExecutions": [
          {"authenticatorConfig":"neon broker login review profile config","authenticator":"idp-review-profile","authenticatorFlow":false,"requirement":"REQUIRED","priority":10},
          {"authenticatorFlow":true,"requirement":"REQUIRED","priority":20,"flowAlias":"neon broker login User creation or linking"},
          {"authenticatorFlow":true,"requirement":"CONDITIONAL","priority":60,"flowAlias":"neon broker login First Broker Login - Conditional Organization"}
        ]
      },
      {"alias":"neon broker login Account verification options","description":"Method with which to verify the existing account","providerId":"basic-flow","topLevel":false,"builtIn":false,"authenticationExecutions":[{"authenticator":"idp-email-verification","authenticatorFlow":false,"requirement":"ALTERNATIVE","priority":10},{"authenticatorFlow":true,"requirement":"ALTERNATIVE","priority":20,"flowAlias":"neon broker login Verify Existing Account by Re-authentication"}]},
      {"alias":"neon broker login First Broker Login - Conditional Organization","description":"Flow to determine if the authenticator that adds organization members is to be used","providerId":"basic-flow","topLevel":false,"builtIn":false,"authenticationExecutions":[{"authenticator":"conditional-user-configured","authenticatorFlow":false,"requirement":"REQUIRED","priority":10},{"authenticator":"idp-add-organization-member","authenticatorFlow":false,"requirement":"REQUIRED","priority":20}]},
      {"alias":"neon broker login First broker login - Conditional 2FA","description":"Flow to determine if any 2FA is required","providerId":"basic-flow","topLevel":false,"builtIn":false,"authenticationExecutions":[{"authenticator":"conditional-user-configured","authenticatorFlow":false,"requirement":"REQUIRED","priority":10},{"authenticatorConfig":"neon broker login first-broker-login-conditional-credential","authenticator":"conditional-credential","authenticatorFlow":false,"requirement":"REQUIRED","priority":20},{"authenticator":"auth-otp-form","authenticatorFlow":false,"requirement":"ALTERNATIVE","priority":30},{"authenticator":"webauthn-authenticator","authenticatorFlow":false,"requirement":"DISABLED","priority":40},{"authenticator":"auth-recovery-authn-code-form","authenticatorFlow":false,"requirement":"DISABLED","priority":50}]},
      {"alias":"neon broker login Handle Existing Account","description":"Handle what to do if there is existing account with same email/username","providerId":"basic-flow","topLevel":false,"builtIn":false,"authenticationExecutions":[{"authenticator":"idp-confirm-link","authenticatorFlow":false,"requirement":"REQUIRED","priority":0},{"authenticatorFlow":true,"requirement":"REQUIRED","priority":0,"flowAlias":"neon broker login Account verification options"},{"authenticator":"idp-auto-link","authenticatorFlow":false,"requirement":"DISABLED","priority":0}]},
      {"alias":"neon broker login User creation or linking","description":"Flow for the existing/non-existing user alternatives","providerId":"basic-flow","topLevel":false,"builtIn":false,"authenticationExecutions":[{"authenticatorConfig":"neon broker login create unique user config","authenticator":"idp-create-user-if-unique","authenticatorFlow":false,"requirement":"ALTERNATIVE","priority":10},{"authenticatorFlow":true,"requirement":"ALTERNATIVE","priority":20,"flowAlias":"neon broker login Handle Existing Account"}]},
      {"alias":"neon broker login Verify Existing Account by Re-authentication","description":"Reauthentication of existing account","providerId":"basic-flow","topLevel":false,"builtIn":false,"authenticationExecutions":[{"authenticator":"idp-username-password-form","authenticatorFlow":false,"requirement":"REQUIRED","priority":10},{"authenticatorFlow":true,"requirement":"CONDITIONAL","priority":20,"flowAlias":"neon broker login First broker login - Conditional 2FA"}]}
    ];

    const authConfigs = [
      {"alias":"neon broker login create unique user config","config":{"require.password.update.after.registration":"false"}},
      {"alias":"neon broker login first-broker-login-conditional-credential","config":{"credentials":"webauthn-passwordless"}},
      {"alias":"neon broker login review profile config","config":{"update.profile.on.first.login":"missing"}}
    ];

    const flowImportResp = await api('POST', `/admin/realms/${KC_REALM}/partialImport`,
      { ifResourceExists: 'SKIP', authenticationFlows: brokerFlows, authenticatorConfig: authConfigs },
      token
    );
    const ok = flowImportResp.status === 200;
    console.log(`  ${ok ? '✓' : '✗'} Broker login flows imported (${flowImportResp.status})`);
    if (!ok) console.log('  Response:', JSON.stringify(flowImportResp.data)?.slice(0, 300));
  }

  // ── 8. Add/update GitHub + Microsoft IdPs ─────────────────────────────────
  console.log('\nStep 8: Configuring GitHub + Microsoft IdPs...');
  const idpList = await api('GET', `/admin/realms/${KC_REALM}/identity-provider/instances`, null, token);
  const existingIdps = new Set((idpList.data || []).map(i => i.alias));

  const idpConfigs = [
    {
      alias: 'github',
      displayName: 'GitHub',
      providerId: 'github',
      enabled: true,
      trustEmail: false,
      storeToken: false,
      addReadTokenRoleOnCreate: false,
      authenticateByDefault: false,
      linkOnly: false,
      firstBrokerLoginFlowAlias: 'neon broker login',
      config: {
        syncMode: 'IMPORT',
        clientId: requiredEnv('GITHUB_OAUTH_CLIENT_ID'),
        clientSecret: requiredEnv('GITHUB_OAUTH_CLIENT_SECRET'),
        useJwksUrl: 'true',
      },
    },
    {
      alias: 'microsoft',
      displayName: 'Microsoft',
      providerId: 'microsoft',
      enabled: true,
      trustEmail: true,
      storeToken: false,
      addReadTokenRoleOnCreate: false,
      authenticateByDefault: false,
      linkOnly: false,
      firstBrokerLoginFlowAlias: 'neon broker login',
      config: {
        syncMode: 'FORCE',
        defaultScopes: 'openid profile email',
        clientId: requiredEnv('MICROSOFT_CLIENT_ID'),
        clientSecret: requiredEnv('MICROSOFT_CLIENT_SECRET'),
      },
    },
  ];

  for (const idp of idpConfigs) {
    if (existingIdps.has(idp.alias)) {
      const upd = await api('PUT',
        `/admin/realms/${KC_REALM}/identity-provider/instances/${idp.alias}`,
        idp, token
      );
      const ok = upd.status === 204 || upd.status === 200;
      console.log(`  ${ok ? '✓' : '✗'} Updated IdP: ${idp.alias} (${upd.status})`);
    } else {
      const cr = await api('POST',
        `/admin/realms/${KC_REALM}/identity-provider/instances`,
        idp, token
      );
      const ok = cr.status === 201 || cr.status === 200;
      console.log(`  ${ok ? '✓' : '✗'} Created IdP: ${idp.alias} (${cr.status})`);
    }
  }

  // ── 9. Verify SMTP ────────────────────────────────────────────────────────
  console.log('\nStep 9: Verifying SMTP config...');
  const realmResp = await api('GET', `/admin/realms/${KC_REALM}`, null, token);
  const currentSmtp = realmResp.data?.smtpServer || {};
  const targetSmtp = {
    host: optionalEnv('KC_SMTP_HOST', 'mailhog'),
    port: optionalEnv('KC_SMTP_PORT', '1025'),
    from: optionalEnv('KC_SMTP_FROM', 'noreply@athyper.local'),
    fromDisplayName: optionalEnv('KC_SMTP_FROM_DISPLAY_NAME', 'Athyper'),
    replyTo: optionalEnv('KC_SMTP_FROM', 'noreply@athyper.local'),
    replyToDisplayName: optionalEnv('KC_SMTP_FROM_DISPLAY_NAME', 'Athyper'),
    envelopeFrom: optionalEnv('KC_SMTP_FROM', 'noreply@athyper.local'),
    ssl: optionalEnv('KC_SMTP_SSL', 'false'),
    starttls: optionalEnv('KC_SMTP_STARTTLS', 'false'),
    auth: optionalEnv('KC_SMTP_AUTH', 'false'),
    user: optionalEnv('KC_SMTP_USERNAME'),
    password: optionalEnv('KC_SMTP_PASSWORD'),
  };
  const smtpNeedsUpdate = JSON.stringify(currentSmtp) !== JSON.stringify(targetSmtp);
  if (smtpNeedsUpdate) {
    const smtpUpd = await api('PUT', `/admin/realms/${KC_REALM}`,
      { ...realmResp.data, smtpServer: targetSmtp }, token
    );
    const ok = smtpUpd.status === 204 || smtpUpd.status === 200;
    console.log(`  ${ok ? '✓' : '✗'} SMTP updated (${smtpUpd.status})`);
  } else {
    console.log('  ✓ SMTP already correct');
  }

  // ── 10. Final summary ──────────────────────────────────────────────────────
  console.log('\n── Final verification ──────────────────────────────────────────');
  const finalOrgs = await api('GET', `/admin/realms/${KC_REALM}/organizations?first=0&max=100`, null, token);
  console.log(`Orgs: ${finalOrgs.data?.length}`);
  const finalUsers = await api('GET', `/admin/realms/${KC_REALM}/users?first=0&max=200`, null, token);
  console.log(`Users: ${finalUsers.data?.length}`);
  const finalGroups = await api('GET', `/admin/realms/${KC_REALM}/groups`, null, token);
  console.log(`Groups: ${finalGroups.data?.length} — ${finalGroups.data?.map(g=>g.name).join(', ')}`);
  const finalIdps = await api('GET', `/admin/realms/${KC_REALM}/identity-provider/instances`, null, token);
  console.log(`IdPs: ${finalIdps.data?.map(i=>i.alias).join(', ')}`);
  const finalRealm = await api('GET', `/admin/realms/${KC_REALM}`, null, token);
  console.log(`loginTheme: ${finalRealm.data?.loginTheme} | emailTheme: ${finalRealm.data?.emailTheme}`);
  console.log(`SMTP host: ${finalRealm.data?.smtpServer?.host}:${finalRealm.data?.smtpServer?.port}`);

  console.log('\n✓ Deployment complete');
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
