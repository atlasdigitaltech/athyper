#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { assertDevContainer } from './setup-dev-test-admin.mjs';

export const clientId = 'athyper-platform-control-operator';
export const redirectUri = 'http://127.0.0.1:18765/callback';
export const flowAlias = 'platform-control-operator-mfa';
export const executionDefinitions = [
  { provider: 'auth-username-password-form', reference: 'pwd' },
  { provider: 'auth-otp-form', reference: 'otp' },
];
export function clientDefinition(flowId) {
  return { clientId, name: 'Platform control operator (DEV)', protocol: 'openid-connect', enabled: true,
    publicClient: true, standardFlowEnabled: true, implicitFlowEnabled: false,
    directAccessGrantsEnabled: false, serviceAccountsEnabled: false, fullScopeAllowed: false,
    redirectUris: [redirectUri], webOrigins: [], defaultClientScopes: [], optionalClientScopes: [],
    attributes: { 'pkce.code.challenge.method': 'S256', 'access.token.lifespan': '300', 'use.refresh.tokens': 'false' },
    authenticationFlowBindingOverrides: { browser: flowId },
    protocolMappers: [
      { name: 'verified-subject', protocol: 'openid-connect', protocolMapper: 'oidc-sub-mapper',
        config: { 'access.token.claim': 'true' } },
      { name: 'control-api-audience', protocol: 'openid-connect', protocolMapper: 'oidc-audience-mapper',
        config: { 'included.custom.audience': 'athyper-platform-control-api', 'access.token.claim': 'true', 'id.token.claim': 'false' } },
      { name: 'studio-plane', protocol: 'openid-connect', protocolMapper: 'oidc-hardcoded-claim-mapper',
        config: { 'claim.name': 'plane', 'claim.value': 'studio', 'jsonType.label': 'String', 'access.token.claim': 'true', 'id.token.claim': 'false' } },
      // No static MFA claim: Keycloak derives these from completed executions.
      { name: 'completed-authentication-methods', protocol: 'openid-connect', protocolMapper: 'oidc-amr-mapper',
        config: { 'access.token.claim': 'true', 'id.token.claim': 'true' } },
    ],
  };
}

export async function main(args = process.argv.slice(2)) {
  if (args.length !== 1 || !['--check', '--confirm=DEV-CONTROL-CLIENT'].includes(args[0])) throw Error('Explicit DEV client confirmation required');
  const mutate = args[0].startsWith('--confirm=');
  const container = JSON.parse(execFileSync('docker', ['inspect', 'athyper-dev-iam-1'], { encoding: 'utf8' }))[0];
  assertDevContainer(container);
  const env = Object.fromEntries(container.Config.Env.map(value => { const i=value.indexOf('='); return [value.slice(0,i),value.slice(i+1)]; }));
  const mount = container.Mounts.find(m => m.Destination === '/run/secrets/iam-admin-password');
  if (!mount?.Source.includes('/.athyper/instances/dev/secrets/')) throw Error('Wrong DEV credential mount');
  const ip = Object.values(container.NetworkSettings.Networks)[0]?.IPAddress;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) throw Error('DEV network unavailable');
  const base = `http://${ip}:${env.KC_HTTP_PORT || '8080'}`;
  const login = await fetch(`${base}/realms/master/protocol/openid-connect/token`, { method: 'POST', signal: AbortSignal.timeout(10000),
    body: new URLSearchParams({ client_id: 'admin-cli', grant_type: 'password', username: env.KC_BOOTSTRAP_ADMIN_USERNAME,
      password: readFileSync(mount.Source, 'utf8').trim() }) });
  if (!login.ok) throw Error(`DEV administration authentication failed: ${login.status}`);
  const { access_token } = await login.json();
  const request = async (path, method='GET', body) => {
    const response = await fetch(`${base}/admin/realms/platform-control${path}`, { method, signal: AbortSignal.timeout(10000),
      headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!response.ok) throw Error(`DEV control configuration ${method} ${path} failed: ${response.status}`);
    const text = await response.text(); return text ? JSON.parse(text) : undefined;
  };
  const realmBefore = await request('');
  let flow = (await request('/authentication/flows')).find(f => f.alias === flowAlias);
  if (!flow && mutate) {
    await request('/authentication/flows', 'POST', { alias: flowAlias, description: 'DEV operator: fresh password and OTP, no SSO shortcut', providerId: 'basic-flow', topLevel: true, builtIn: false });
    flow = (await request('/authentication/flows')).find(f => f.alias === flowAlias);
  }
  if (!flow || flow.builtIn || !flow.topLevel || flow.providerId !== 'basic-flow') throw Error('Dedicated control MFA flow missing or unsafe');
  let executions = await request(`/authentication/flows/${flowAlias}/executions`);
  if (executions.some(e => !executionDefinitions.some(d => d.provider === e.providerId))) throw Error('Unexpected control flow execution');
  for (const definition of executionDefinitions) {
    let execution = executions.find(e => e.providerId === definition.provider);
    if (!execution && mutate) {
      await request(`/authentication/flows/${flowAlias}/executions/execution`, 'POST', { provider: definition.provider });
      executions = await request(`/authentication/flows/${flowAlias}/executions`);
      execution = executions.find(e => e.providerId === definition.provider);
    }
    if (!execution) throw Error('MFA execution missing');
    if (execution.requirement !== 'REQUIRED' && mutate) await request(`/authentication/flows/${flowAlias}/executions`, 'PUT', { ...execution, requirement: 'REQUIRED' });
    const expected = { 'default.reference.value': definition.reference, 'default.reference.maxAge': '300' };
    const config = execution.authenticationConfig ? await request(`/authentication/config/${execution.authenticationConfig}`) : undefined;
    if (!config && mutate) await request(`/authentication/executions/${execution.id}/config`, 'POST', { alias: `${flowAlias}-${definition.reference}`, config: expected });
    else if (!config || Object.keys(config.config).length !== Object.keys(expected).length
      || Object.entries(expected).some(([key, value]) => ![value, '**********'].includes(config.config[key]))) throw Error('MFA execution reference drift');
    // Keycloak 26.7 redacts even these non-secret config values on GET. A
    // metadata read cannot prove AMR values: actual signed login remains a gate.
    if (config && mutate) await request(`/authentication/config/${execution.authenticationConfig}`, 'PUT', { id: config.id, alias: config.alias, config: expected });
  }
  executions = await request(`/authentication/flows/${flowAlias}/executions`);
  if (executions.length !== 2 || executions.some((e, i) => e.providerId !== executionDefinitions[i].provider || e.requirement !== 'REQUIRED')) throw Error('MFA flow order/requirement drift');
  const clients = await request(`/clients?clientId=${clientId}`);
  if (clients.length > 1) throw Error('Ambiguous operator client');
  const expected = clientDefinition(flow.id);
  if (!clients.length && mutate) await request('/clients', 'POST', expected);
  const client = (await request(`/clients?clientId=${clientId}`))[0];
  if (!client) throw Error('Operator client missing');
  for (const key of ['enabled','publicClient','standardFlowEnabled','implicitFlowEnabled','directAccessGrantsEnabled','serviceAccountsEnabled','fullScopeAllowed'])
    if (client[key] !== expected[key]) throw Error(`Operator client drift: ${key}`);
  if (JSON.stringify(client.redirectUris) !== JSON.stringify(expected.redirectUris) || client.authenticationFlowBindingOverrides?.browser !== flow.id
    || client.attributes?.['pkce.code.challenge.method'] !== 'S256') throw Error('Operator redirect/flow/PKCE drift');
  let mappers = await request(`/clients/${client.id}/protocol-mappers/models`);
  if (mutate) for (const mapper of expected.protocolMappers) {
    if (!mappers.some(m => m.name === mapper.name)) await request(`/clients/${client.id}/protocol-mappers/models`, 'POST', mapper);
  }
  mappers = await request(`/clients/${client.id}/protocol-mappers/models`);
  if (mappers.length !== expected.protocolMappers.length || expected.protocolMappers.some(e => !mappers.some(m => m.name === e.name && m.protocolMapper === e.protocolMapper && Object.entries(e.config).every(([k,v]) => m.config[k] === v)))) throw Error('Operator claim mapper drift');
  // Remove auto-attached realm default scopes only on initial creation. No realm changes.
  for (const kind of ['default', 'optional']) {
    let scopes = await request(`/clients/${client.id}/${kind}-client-scopes`);
    if (!clients.length && mutate) for (const scope of scopes) await request(`/clients/${client.id}/${kind}-client-scopes/${scope.id}`, 'DELETE');
    scopes = await request(`/clients/${client.id}/${kind}-client-scopes`);
    if (scopes.length) throw Error('Unexpected operator token scopes');
  }
  if ((await request('')).browserFlow !== realmBefore.browserFlow) throw Error('Realm browser flow changed');
  console.log(JSON.stringify({ realm: 'platform-control', clientId, redirectUri, flow: flowAlias, requiredMethods: ['pwd','otp'], executionValuesMayBeRedacted: true, humanLoginVerified: false, humanGrantsChanged: false }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message); process.exitCode=1; });
