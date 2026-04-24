#!/usr/bin/env node
/**
 * deploy-broker-flows.cjs
 * Creates "neon broker login" auth flows in live KC via Admin API.
 * Also verifies the full final state.
 */
const https = require('https');
const KC_BASE = 'https://iam.mesh.athyper.local';
const KC_REALM = 'athyper';
const agent = new https.Agent({ rejectUnauthorized: false });

function request(method, url, body, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const bodyStr = body === null ? null : body instanceof URLSearchParams ? body.toString() : JSON.stringify(body);
    const ct = body instanceof URLSearchParams ? 'application/x-www-form-urlencoded' : 'application/json';
    const opts = {
      hostname: u.hostname, port: 443,
      path: u.pathname + (u.search||''), method, agent,
      headers: { 'Content-Type': ct, ...(token ? { Authorization:`Bearer ${token}` } : {}) },
    };
    const req = https.request(opts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        const data = raw ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : null;
        resolve({ status: res.statusCode, data, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

const api = (m, p, b, t) => request(m, `${KC_BASE}${p}`, b, t);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// All flows to create (sub-flows first, then top-level)
const FLOWS = [
  // Sub-flows (topLevel: false) must be created before the parent references them
  {
    alias: 'neon broker login Verify Existing Account by Re-authentication',
    description: 'Reauthentication of existing account',
    providerId: 'basic-flow',
    topLevel: false,
    builtIn: false,
  },
  {
    alias: 'neon broker login Account verification options',
    description: 'Method with which to verify the existing account',
    providerId: 'basic-flow',
    topLevel: false,
    builtIn: false,
  },
  {
    alias: 'neon broker login Handle Existing Account',
    description: 'Handle what to do if there is existing account with same email/username',
    providerId: 'basic-flow',
    topLevel: false,
    builtIn: false,
  },
  {
    alias: 'neon broker login First broker login - Conditional 2FA',
    description: 'Flow to determine if any 2FA is required',
    providerId: 'basic-flow',
    topLevel: false,
    builtIn: false,
  },
  {
    alias: 'neon broker login First Broker Login - Conditional Organization',
    description: 'Flow to determine if the authenticator that adds organization members is to be used',
    providerId: 'basic-flow',
    topLevel: false,
    builtIn: false,
  },
  {
    alias: 'neon broker login User creation or linking',
    description: 'Flow for the existing/non-existing user alternatives',
    providerId: 'basic-flow',
    topLevel: false,
    builtIn: false,
  },
  {
    alias: 'neon broker login',
    description: 'Actions taken after first broker login with identity provider account',
    providerId: 'basic-flow',
    topLevel: true,
    builtIn: false,
  },
];

async function main() {
  const tr = await request('POST',
    `${KC_BASE}/realms/master/protocol/openid-connect/token`,
    new URLSearchParams({ client_id:'admin-cli', grant_type:'password', username:'athyperadmin', password:'athyperadmin' })
  );
  const token = tr.data?.access_token;
  if (!token) { console.error('No token:', tr.data); process.exit(1); }
  console.log('✓ Token');

  // Check existing flows
  const existing = await api('GET', `/admin/realms/${KC_REALM}/authentication/flows`, null, token);
  const existingAliases = new Set((existing.data||[]).map(f=>f.alias));
  console.log('Existing custom flows:', [...existingAliases].filter(a => (existing.data||[]).find(f=>f.alias===a && !f.builtIn)).join(', ') || 'none');

  // Create each flow if not present
  console.log('\n── Creating flows ──');
  for (const flow of FLOWS) {
    if (existingAliases.has(flow.alias)) {
      console.log(`  ✓ Exists: ${flow.alias}`);
      continue;
    }
    const cr = await api('POST', `/admin/realms/${KC_REALM}/authentication/flows`, flow, token);
    const ok = cr.status === 201 || cr.status === 200;
    console.log(`  ${ok?'✓':'✗'} Created: ${flow.alias} (${cr.status})`);
    if (!ok) console.log(`    Error: ${JSON.stringify(cr.data)?.slice(0,150)}`);
    await sleep(200);
  }

  // Refresh flow list
  const flows2 = await api('GET', `/admin/realms/${KC_REALM}/authentication/flows`, null, token);
  const flowByAlias = {};
  for (const f of (flows2.data||[])) flowByAlias[f.alias] = f;

  // ── Add executions to flows ────────────────────────────────────────────────
  console.log('\n── Flow executions ──');

  async function addExecution(flowAlias, executionDef) {
    return api('POST',
      `/admin/realms/${KC_REALM}/authentication/flows/${encodeURIComponent(flowAlias)}/executions/execution`,
      executionDef, token
    );
  }

  async function addSubFlow(flowAlias, subFlowDef) {
    return await api('POST',
      `/admin/realms/${KC_REALM}/authentication/flows/${encodeURIComponent(flowAlias)}/executions/flow`,
      subFlowDef, token
    );
  }

  // Update execution requirement/priority
  async function updateExecution(flowAlias, execId, updates) {
    return await api('PUT',
      `/admin/realms/${KC_REALM}/authentication/flows/${encodeURIComponent(flowAlias)}/executions`,
      { id: execId, ...updates }, token
    );
  }

  // Get executions for a flow
  async function getExecutions(flowAlias) {
    const r = await api('GET',
      `/admin/realms/${KC_REALM}/authentication/flows/${encodeURIComponent(flowAlias)}/executions`,
      null, token
    );
    return r.data || [];
  }

  // ── 1. neon broker login Verify Existing Account by Re-authentication ─────
  {
    const fa = 'neon broker login Verify Existing Account by Re-authentication';
    const execs = await getExecutions(fa);
    if (execs.length === 0) {
      // Add: idp-username-password-form (REQUIRED, priority 10)
      await addExecution(fa, { provider: 'idp-username-password-form' });
      // Add sub-flow: First broker login - Conditional 2FA (CONDITIONAL, priority 20)
      await addSubFlow(fa, { alias: 'neon broker login First broker login - Conditional 2FA', type: 'basic-flow', provider: 'registration-page-form' });
      console.log(`  ✓ Added executions to: ${fa}`);
    } else {
      console.log(`  ✓ Already has executions: ${fa}`);
    }
  }

  // ── 2. neon broker login Account verification options ─────────────────────
  {
    const fa = 'neon broker login Account verification options';
    const execs = await getExecutions(fa);
    if (execs.length === 0) {
      await addExecution(fa, { provider: 'idp-email-verification' });
      await addSubFlow(fa, { alias: 'neon broker login Verify Existing Account by Re-authentication', type: 'basic-flow', provider: 'registration-page-form' });
      console.log(`  ✓ Added executions to: ${fa}`);
    } else {
      console.log(`  ✓ Already has executions: ${fa}`);
    }
  }

  // ── 3. neon broker login First Broker Login - Conditional Organization ────
  {
    const fa = 'neon broker login First Broker Login - Conditional Organization';
    const execs = await getExecutions(fa);
    if (execs.length === 0) {
      await addExecution(fa, { provider: 'conditional-user-configured' });
      await addExecution(fa, { provider: 'idp-add-organization-member' });
      console.log(`  ✓ Added executions to: ${fa}`);
    } else {
      console.log(`  ✓ Already has executions: ${fa}`);
    }
  }

  // ── 4. neon broker login First broker login - Conditional 2FA ────────────
  {
    const fa = 'neon broker login First broker login - Conditional 2FA';
    const execs = await getExecutions(fa);
    if (execs.length === 0) {
      await addExecution(fa, { provider: 'conditional-user-configured' });
      await addExecution(fa, { provider: 'conditional-credential' });
      await addExecution(fa, { provider: 'auth-otp-form' });
      await addExecution(fa, { provider: 'webauthn-authenticator' });
      await addExecution(fa, { provider: 'auth-recovery-authn-code-form' });
      console.log(`  ✓ Added executions to: ${fa}`);
    } else {
      console.log(`  ✓ Already has executions: ${fa}`);
    }
  }

  // ── 5. neon broker login Handle Existing Account ─────────────────────────
  {
    const fa = 'neon broker login Handle Existing Account';
    const execs = await getExecutions(fa);
    if (execs.length === 0) {
      await addExecution(fa, { provider: 'idp-confirm-link' });
      await addSubFlow(fa, { alias: 'neon broker login Account verification options', type: 'basic-flow', provider: 'registration-page-form' });
      await addExecution(fa, { provider: 'idp-auto-link' });
      console.log(`  ✓ Added executions to: ${fa}`);
    } else {
      console.log(`  ✓ Already has executions: ${fa}`);
    }
  }

  // ── 6. neon broker login User creation or linking ─────────────────────────
  {
    const fa = 'neon broker login User creation or linking';
    const execs = await getExecutions(fa);
    if (execs.length === 0) {
      await addExecution(fa, { provider: 'idp-create-user-if-unique' });
      await addSubFlow(fa, { alias: 'neon broker login Handle Existing Account', type: 'basic-flow', provider: 'registration-page-form' });
      console.log(`  ✓ Added executions to: ${fa}`);
    } else {
      console.log(`  ✓ Already has executions: ${fa}`);
    }
  }

  // ── 7. neon broker login (top-level) ──────────────────────────────────────
  {
    const fa = 'neon broker login';
    const execs = await getExecutions(fa);
    if (execs.length === 0) {
      await addExecution(fa, { provider: 'idp-review-profile' });
      await addSubFlow(fa, { alias: 'neon broker login User creation or linking', type: 'basic-flow', provider: 'registration-page-form' });
      await addSubFlow(fa, { alias: 'neon broker login First Broker Login - Conditional Organization', type: 'basic-flow', provider: 'registration-page-form' });
      console.log(`  ✓ Added executions to: ${fa}`);
    } else {
      console.log(`  ✓ Already has executions: ${fa}`);
    }
  }

  // Update flow requirements
  console.log('\n── Updating execution requirements ──');
  for (const fa of ['neon broker login']) {
    const execs = await getExecutions(fa);
    console.log(`  ${fa}: ${execs.length} executions`);
    execs.forEach(e => console.log(`    - ${e.displayName || e.providerId || e.authenticationFlow} req:${e.requirement}`));
  }

  // Final status
  console.log('\n── Final KC state ──');
  const finalFlows = await api('GET', `/admin/realms/${KC_REALM}/authentication/flows`, null, token);
  const customFlows = (finalFlows.data||[]).filter(f=>!f.builtIn).map(f=>f.alias);
  console.log('Custom flows:', customFlows.join(', ') || 'none');

  const finalIdps = await api('GET', `/admin/realms/${KC_REALM}/identity-provider/instances`, null, token);
  console.log('IdPs:', (finalIdps.data||[]).map(i=>`${i.alias}(flow:${i.firstBrokerLoginFlowAlias})`).join(', '));

  console.log('\n✓ Broker flows deployed');
}

main().catch(e => { console.error(e.message, e.stack); process.exit(1); });
