#!/usr/bin/env node
/**
 * rebuild-broker-flows.cjs
 * Deletes incorrectly-created broker login flows and rebuilds them
 * using KC 26.x top-down hierarchy (parent → sub-flow → sub-sub-flow).
 */
const https = require('https');
const KC_BASE = 'https://iam.mesh.athyper.local';
const KC_REALM = 'athyper';
const agent = new https.Agent({ rejectUnauthorized: false });

function request(method, url, body, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const bodyStr = body === null ? null
      : body instanceof URLSearchParams ? body.toString()
      : JSON.stringify(body);
    const ct = body instanceof URLSearchParams
      ? 'application/x-www-form-urlencoded' : 'application/json';
    const opts = {
      hostname: u.hostname, port: 443,
      path: u.pathname + (u.search||''), method, agent,
      headers: { 'Content-Type': ct, ...(token?{Authorization:`Bearer ${token}`}:{}) },
    };
    const req = https.request(opts, res => {
      const c = []; res.on('data', d => c.push(d));
      res.on('end', () => {
        const raw = Buffer.concat(c).toString();
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

// Get executions for a flow
const getExecs = async (flowAlias, token) => {
  const r = await api('GET', `/admin/realms/${KC_REALM}/authentication/flows/${encodeURIComponent(flowAlias)}/executions`, null, token);
  return r.data || [];
};

// Add leaf execution
const addExec = async (flowAlias, provider, token) =>
  api('POST', `/admin/realms/${KC_REALM}/authentication/flows/${encodeURIComponent(flowAlias)}/executions/execution`,
    { provider }, token);

// Add sub-flow execution (creates new sub-flow with given alias)
const addSubFlow = async (parentAlias, subFlowAlias, token) =>
  api('POST', `/admin/realms/${KC_REALM}/authentication/flows/${encodeURIComponent(parentAlias)}/executions/flow`,
    { alias: subFlowAlias, type: 'basic-flow', provider: 'registration-page-form', description: subFlowAlias },
    token);

// Update an execution's requirement
const updateExec = async (flowAlias, execId, requirement, priority, token) =>
  api('PUT', `/admin/realms/${KC_REALM}/authentication/flows/${encodeURIComponent(flowAlias)}/executions`,
    { id: execId, requirement, priority }, token);

async function main() {
  const tr = await request('POST',
    `${KC_BASE}/realms/master/protocol/openid-connect/token`,
    new URLSearchParams({ client_id:'admin-cli', grant_type:'password', username:'athyperadmin', password:'athyperadmin' })
  );
  const token = tr.data?.access_token;
  if (!token) { console.error('No token'); process.exit(1); }
  console.log('✓ Token');

  // ── Step 1: Delete all existing broker login flows ──────────────────────
  console.log('\nStep 1: Deleting old broker login flows...');
  const allFlows = await api('GET', `/admin/realms/${KC_REALM}/authentication/flows`, null, token);
  const brokerFlows = (allFlows.data||[]).filter(f => f.alias?.startsWith('neon broker login'));
  // Delete sub-flows last (orphans first)
  const topLevel = brokerFlows.filter(f => f.topLevel);
  const subFlows = brokerFlows.filter(f => !f.topLevel);
  for (const f of [...topLevel, ...subFlows]) {
    const del = await api('DELETE', `/admin/realms/${KC_REALM}/authentication/flows/${f.id}`, null, token);
    console.log(`  ${del.status===204||del.status===200?'✓':'✗'} Deleted: ${f.alias} (${del.status})`);
    await sleep(100);
  }

  // ── Step 2: Build flows top-down ─────────────────────────────────────────
  console.log('\nStep 2: Creating flows top-down...');

  // Create top-level "neon broker login"
  const cr = await api('POST', `/admin/realms/${KC_REALM}/authentication/flows`, {
    alias: 'neon broker login',
    description: 'Actions taken after first broker login with identity provider account',
    providerId: 'basic-flow',
    topLevel: true,
    builtIn: false,
  }, token);
  console.log(`  ${cr.status===201?'✓':'✗'} Created top-level flow (${cr.status})`);
  if (cr.status !== 201) { console.error('  Fatal: failed to create top-level flow'); process.exit(1); }
  await sleep(200);

  // ── 2a: Add executions to neon broker login ───────────────────────────────
  // 1. idp-review-profile (REQUIRED, priority 10)
  const r_review = await addExec('neon broker login', 'idp-review-profile', token);
  console.log(`  ${r_review.status===201?'✓':'✗'} Added: idp-review-profile (${r_review.status})`);
  await sleep(100);

  // 2. Sub-flow: User creation or linking (REQUIRED, priority 20)
  const r_ucl = await addSubFlow('neon broker login', 'neon broker login User creation or linking', token);
  console.log(`  ${r_ucl.status===201?'✓':'✗'} Added sub-flow: User creation or linking (${r_ucl.status})`);
  await sleep(100);

  // 3. Sub-flow: First Broker Login - Conditional Organization (CONDITIONAL, priority 60)
  const r_org = await addSubFlow('neon broker login', 'neon broker login First Broker Login - Conditional Organization', token);
  console.log(`  ${r_org.status===201?'✓':'✗'} Added sub-flow: Conditional Organization (${r_org.status})`);
  await sleep(200);

  // Update requirements
  const topExecs = await getExecs('neon broker login', token);
  console.log(`  Top-level executions: ${topExecs.length}`);
  for (const ex of topExecs) {
    const name = ex.displayName || ex.providerId || '';
    if (name.includes('Review') || name.includes('review')) {
      await updateExec('neon broker login', ex.id, 'REQUIRED', 10, token);
    } else if (name.includes('User creation')) {
      await updateExec('neon broker login', ex.id, 'REQUIRED', 20, token);
    } else if (name.includes('Organization')) {
      await updateExec('neon broker login', ex.id, 'CONDITIONAL', 60, token);
    }
  }

  // ── 2b: Add executions to User creation or linking ───────────────────────
  // 1. idp-create-user-if-unique (ALTERNATIVE, priority 10)
  const r_cuu = await addExec('neon broker login User creation or linking', 'idp-create-user-if-unique', token);
  console.log(`  ${r_cuu.status===201?'✓':'✗'} Added: idp-create-user-if-unique (${r_cuu.status})`);
  await sleep(100);

  // 2. Sub-flow: Handle Existing Account (ALTERNATIVE, priority 20)
  const r_hea = await addSubFlow('neon broker login User creation or linking', 'neon broker login Handle Existing Account', token);
  console.log(`  ${r_hea.status===201?'✓':'✗'} Added sub-flow: Handle Existing Account (${r_hea.status})`);
  await sleep(200);

  // Update requirements for User creation or linking
  const uclExecs = await getExecs('neon broker login User creation or linking', token);
  for (const ex of uclExecs) {
    const name = ex.displayName || ex.providerId || '';
    if (name.includes('unique')) await updateExec('neon broker login User creation or linking', ex.id, 'ALTERNATIVE', 10, token);
    else if (name.includes('Handle')) await updateExec('neon broker login User creation or linking', ex.id, 'ALTERNATIVE', 20, token);
  }

  // ── 2c: Add executions to Handle Existing Account ────────────────────────
  // 1. idp-confirm-link (DISABLED, priority 0)
  const r_icl = await addExec('neon broker login Handle Existing Account', 'idp-confirm-link', token);
  console.log(`  ${r_icl.status===201?'✓':'✗'} Added: idp-confirm-link (${r_icl.status})`);
  await sleep(100);

  // 2. Sub-flow: Account verification options (DISABLED, priority 0)
  const r_avo = await addSubFlow('neon broker login Handle Existing Account', 'neon broker login Account verification options', token);
  console.log(`  ${r_avo.status===201?'✓':'✗'} Added sub-flow: Account verification options (${r_avo.status})`);
  await sleep(100);

  // 3. idp-auto-link (REQUIRED, priority 0) — auto-link accounts
  const r_ial = await addExec('neon broker login Handle Existing Account', 'idp-auto-link', token);
  console.log(`  ${r_ial.status===201?'✓':'✗'} Added: idp-auto-link (${r_ial.status})`);
  await sleep(200);

  // Update requirements for Handle Existing Account
  const heaExecs = await getExecs('neon broker login Handle Existing Account', token);
  for (const ex of heaExecs) {
    const name = ex.displayName || ex.providerId || '';
    if (name.includes('auto') || name.includes('Auto')) await updateExec('neon broker login Handle Existing Account', ex.id, 'REQUIRED', 20, token);
    else await updateExec('neon broker login Handle Existing Account', ex.id, 'DISABLED', 0, token);
  }

  // ── 2d: Add executions to Account verification options ───────────────────
  const r_ev = await addExec('neon broker login Account verification options', 'idp-email-verification', token);
  console.log(`  ${r_ev.status===201?'✓':'✗'} Added: idp-email-verification (${r_ev.status})`);
  await sleep(100);

  const r_vea = await addSubFlow('neon broker login Account verification options', 'neon broker login Verify Existing Account by Re-authentication', token);
  console.log(`  ${r_vea.status===201?'✓':'✗'} Added sub-flow: Verify Existing Account (${r_vea.status})`);
  await sleep(200);

  // Update requirements for Account verification options
  const avoExecs = await getExecs('neon broker login Account verification options', token);
  for (const ex of avoExecs) {
    await updateExec('neon broker login Account verification options', ex.id, 'ALTERNATIVE', 10, token);
  }

  // ── 2e: Add executions to Verify Existing Account by Re-authentication ────
  const r_upf = await addExec('neon broker login Verify Existing Account by Re-authentication', 'idp-username-password-form', token);
  console.log(`  ${r_upf.status===201?'✓':'✗'} Added: idp-username-password-form (${r_upf.status})`);
  await sleep(100);

  const r_2fa = await addSubFlow('neon broker login Verify Existing Account by Re-authentication', 'neon broker login First broker login - Conditional 2FA', token);
  console.log(`  ${r_2fa.status===201?'✓':'✗'} Added sub-flow: Conditional 2FA (${r_2fa.status})`);
  await sleep(200);

  // Update requirements
  const veaExecs = await getExecs('neon broker login Verify Existing Account by Re-authentication', token);
  for (const ex of veaExecs) {
    const name = ex.displayName || ex.providerId || '';
    if (name.includes('password')) await updateExec('neon broker login Verify Existing Account by Re-authentication', ex.id, 'REQUIRED', 10, token);
    else await updateExec('neon broker login Verify Existing Account by Re-authentication', ex.id, 'CONDITIONAL', 20, token);
  }

  // ── 2f: Conditional 2FA sub-flow ─────────────────────────────────────────
  const r_cuc = await addExec('neon broker login First broker login - Conditional 2FA', 'conditional-user-configured', token);
  console.log(`  ${r_cuc.status===201?'✓':'✗'} Added: conditional-user-configured (${r_cuc.status})`);
  await sleep(100);
  const r_otp = await addExec('neon broker login First broker login - Conditional 2FA', 'auth-otp-form', token);
  console.log(`  ${r_otp.status===201?'✓':'✗'} Added: auth-otp-form (${r_otp.status})`);
  await sleep(100);
  const r_wa = await addExec('neon broker login First broker login - Conditional 2FA', 'webauthn-authenticator', token);
  console.log(`  ${r_wa.status===201?'✓':'✗'} Added: webauthn-authenticator (${r_wa.status})`);
  await sleep(200);

  // Update requirements for 2FA
  const tfaExecs = await getExecs('neon broker login First broker login - Conditional 2FA', token);
  for (const ex of tfaExecs) {
    const name = ex.displayName || ex.providerId || '';
    if (name.includes('conditional') || name.includes('Conditional')) await updateExec('neon broker login First broker login - Conditional 2FA', ex.id, 'REQUIRED', 10, token);
    else if (name.includes('OTP') || name.includes('otp')) await updateExec('neon broker login First broker login - Conditional 2FA', ex.id, 'ALTERNATIVE', 30, token);
    else await updateExec('neon broker login First broker login - Conditional 2FA', ex.id, 'DISABLED', 40, token);
  }

  // ── 2g: Conditional Organization sub-flow ────────────────────────────────
  const r_coc = await addExec('neon broker login First Broker Login - Conditional Organization', 'conditional-user-configured', token);
  console.log(`  ${r_coc.status===201?'✓':'✗'} Added: conditional-user-configured for org (${r_coc.status})`);
  await sleep(100);
  const r_aom = await addExec('neon broker login First Broker Login - Conditional Organization', 'idp-add-organization-member', token);
  console.log(`  ${r_aom.status===201?'✓':'✗'} Added: idp-add-organization-member (${r_aom.status})`);
  await sleep(200);

  // Update requirements for Conditional Organization
  const coExecs = await getExecs('neon broker login First Broker Login - Conditional Organization', token);
  for (const ex of coExecs) {
    await updateExec('neon broker login First Broker Login - Conditional Organization', ex.id, 'REQUIRED', 10, token);
  }

  // ── Final verification ────────────────────────────────────────────────────
  console.log('\n── Final state ──');
  const finalFlows = await api('GET', `/admin/realms/${KC_REALM}/authentication/flows`, null, token);
  const custom = (finalFlows.data||[]).filter(f=>!f.builtIn);
  console.log(`Custom flows: ${custom.length}`);
  custom.forEach(f => console.log(`  - ${f.topLevel?'[TOP]':'[sub]'} ${f.alias}`));

  const topExecsFinal = await getExecs('neon broker login', token);
  console.log(`\nneon broker login executions: ${topExecsFinal.length}`);
  topExecsFinal.forEach(e => console.log(`  ${e.requirement?.padEnd(12)} ${e.displayName||e.providerId}`));

  const finalIdps = await api('GET', `/admin/realms/${KC_REALM}/identity-provider/instances`, null, token);
  console.log('\nIdPs:');
  finalIdps.data?.forEach(i => console.log(`  ${i.alias} → flow: ${i.firstBrokerLoginFlowAlias}`));

  console.log('\n✓ Broker login flows rebuilt');
}

main().catch(e => { console.error(e.message); process.exit(1); });
