import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clientDefinition, executionDefinitions, redirectUri } from '../../../server/db/scripts/operations/authorization/provision-dev-control-client.mjs';

test('operator client has a closed PKCE authorization-code surface', () => {
  const client = clientDefinition('dedicated-flow');
  assert.equal(client.publicClient, true);
  assert.equal(client.fullScopeAllowed, false);
  for (const key of ['implicitFlowEnabled','directAccessGrantsEnabled','serviceAccountsEnabled']) assert.equal(client[key], false);
  assert.deepEqual(client.redirectUris, [redirectUri]);
  assert.equal(redirectUri, 'http://127.0.0.1:18765/callback');
  assert.equal(client.attributes['pkce.code.challenge.method'], 'S256');
  assert.equal(client.authenticationFlowBindingOverrides.browser, 'dedicated-flow');
  assert.deepEqual(client.defaultClientScopes, []);
  assert.deepEqual(client.optionalClientScopes, []);
});
test('MFA evidence comes from completed authenticators, never a constant assurance claim', () => {
  const client = clientDefinition('flow');
  assert.deepEqual(executionDefinitions, [{ provider:'auth-username-password-form', reference:'pwd' }, { provider:'auth-otp-form', reference:'otp' }]);
  assert.equal(client.protocolMappers.filter(m => m.protocolMapper === 'oidc-amr-mapper').length, 1);
  for (const mapper of client.protocolMappers.filter(m => m.protocolMapper === 'oidc-hardcoded-claim-mapper'))
    assert.equal(mapper.config['claim.name'], 'plane');
  const audience = client.protocolMappers.find(m => m.protocolMapper === 'oidc-audience-mapper');
  assert.equal(audience.config['included.custom.audience'], 'athyper-platform-control-api');
});
test('DEV gateway uses a narrow human surface and does not route workload execution into it', () => {
  const source = readFileSync(new URL('../instance/config/traefik/dev.yaml', import.meta.url),'utf8');
  const section = source.split('    platform-control:')[1].split('    iam:')[0].split('\n').filter(line => !line.trim().startsWith('#')).join('\n');
  assert.ok(section.includes('Path(`/api/platform-control/session`)'));
  assert.ok(section.includes('/[^/]+/activate$'));
  assert.ok(!section.includes('PathPrefix'));
  assert.ok(!section.includes('/execute'));
});
