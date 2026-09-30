#!/usr/bin/env node
import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { clientId, redirectUri } from './provision-dev-control-client.mjs';

// Browser PKCE, not password grant or administrator impersonation. Password and
// OTP stay inside Keycloak. The callback never returns bearer tokens to HTML.
const expected = {
  'platform.admin': 'df0159b0-2bdc-55e8-944b-efaa9ed9b8e5',
  'platform.owner': '41bf4855-6aa1-5e43-bc11-ee2cfa647693',
};
async function main() {
  const username = process.argv[2];
  if (process.argv.length !== 3 || !Object.hasOwn(expected, username)) throw Error('Specify platform.admin or platform.owner');
  const issuer = 'https://iam.dev.athyper.test/realms/platform-control';
  const verifier = randomBytes(48).toString('base64url'), state = randomBytes(32).toString('base64url');
  const login = new URL(issuer + '/protocol/openid-connect/auth');
  login.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid',
    state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256',
    prompt: 'login', max_age: '0', login_hint: username }).toString();
  const directory = join(homedir(), '.athyper/instances/dev/secrets/control-api/login');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  let used = false;
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Security-Policy', "default-src 'none'");
    response.setHeader('Referrer-Policy', 'no-referrer');
    const url = new URL(request.url, redirectUri);
    if (request.method !== 'GET' || request.headers.host !== '127.0.0.1:18765' || url.pathname !== '/callback'
      || url.searchParams.getAll('state').length !== 1 || url.searchParams.get('state') !== state || used) {
      response.writeHead(400); response.end('Invalid login callback'); return;
    }
    used = true;
    try {
      if (url.searchParams.has('error') || url.searchParams.getAll('code').length !== 1) throw Error('Login was not completed');
      const result = await fetch(issuer + '/protocol/openid-connect/token', { method: 'POST', signal: AbortSignal.timeout(10000),
        body: new URLSearchParams({ client_id: clientId, grant_type: 'authorization_code', code: url.searchParams.get('code'),
          redirect_uri: redirectUri, code_verifier: verifier }) });
      if (!result.ok) throw Error(`Code exchange failed: ${result.status}`);
      const token = await result.json();
      const verified = await fetch('https://api.dev.athyper.test/api/platform-control/session', { signal: AbortSignal.timeout(15000),
        headers: { authorization: `Bearer ${token.access_token}`, 'x-plane': 'studio' } });
      if (!verified.ok) throw Error(`Control API verification failed: ${verified.status}`);
      const session = await verified.json();
      if (session.principalId !== expected[username] || session.tenantId !== '11111111-1111-4111-8111-111111111111'
        || session.plane !== 'studio' || session.realm !== 'platform-control' || session.assurance !== 'elevated'
        || !session.authenticationMethods?.includes('otp')) throw Error('Expected control identity and OTP assurance were not verified');
      const receipt = { username, verifiedAt: new Date().toISOString(), ...session };
      // Private short-lived bearer retained only for immediate cutover checks.
      writeFileSync(join(directory, `${username}.json`), JSON.stringify({ ...receipt, accessToken: token.access_token }) + '\n', { mode: 0o600 });
      console.log(JSON.stringify(receipt));
      response.end('Control API identity and MFA verified. You may close this tab. No roles have been activated by this verification.');
    } catch (error) {
      console.error(error.message); process.exitCode = 1;
      response.writeHead(403); response.end('Verification failed. See the local terminal; do not copy tokens into chat.');
    } finally { clearTimeout(timer); server.close(); }
  });
  const timer = setTimeout(() => { console.error('Browser login timed out; no authority changed'); process.exitCode=1; server.close(); }, 10 * 60 * 1000);
  server.on('error', error => { clearTimeout(timer); console.error(error.code ?? 'Callback listener failed'); process.exitCode=1; });
  server.listen(18765, '127.0.0.1', () => console.log(`Open this URL in your browser and complete password + OTP as ${username}:\n${login}`));
}
main().catch(error => { console.error(error.message); process.exitCode=1; });
