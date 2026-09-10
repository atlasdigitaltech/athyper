// Interactive DEV capture. Passwords and MFA remain in the issuer's browser UI.
const { createRequire } = require('node:module');
const { resolve, dirname } = require('node:path');
const { existsSync, mkdirSync, chmodSync, renameSync, rmSync } = require('node:fs');
const { parseArgs } = require('node:util');

async function main() {
  const { values } = parseArgs({ options: {
    plane: { type: 'string' }, actor: { type: 'string' }, output: { type: 'string' },
  } });
  const identities = {
    mesh: { 'catl.admin': 'dc4ef163-269a-5b83-90ef-5b71a56087c6', 'catl.owner': '3dd93048-ac4b-54a7-b820-32d0c457691b' },
    neon: { 'catl.admin': 'cca94907-7519-5871-8e3c-6b11aa545c93', 'catl.owner': '645b6a55-3355-526a-9643-3900425bde47' },
    studio: { 'catl.admin': '81cd1978-2df5-5c9a-938a-2f8c291aea13', 'catl.owner': '5cd6cf93-3fe4-500c-8066-3ebf14a9eb5d' },
  };
  const { plane, actor } = values;
  if (!identities[plane]?.[actor]) throw Error('Use --plane neon|mesh|studio --actor catl.admin|catl.owner [--output PATH]');
  const playwright = process.env.ATLAS_CAPTURE_PACKAGE_ROOT
    ? createRequire(resolve(process.env.ATLAS_CAPTURE_PACKAGE_ROOT, 'package.json'))('playwright')
    : require('@playwright/test');
  const output = resolve(values.output || resolve(__dirname, '../../../tests/e2e/.auth/dev', plane, `${actor}.json`));
  const pending = `${output}.${process.pid}.pending`;
  const origin = `https://${plane}.dev.athyper.test`;
  const browser = await playwright.chromium.launch({ headless: false });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true,
      ...(existsSync(output) ? { storageState: output } : {}),
    });
    const page = await context.newPage();
    console.log(`Sign in as ${actor}; select CirrusAtlantic. Then complete the MFA prompt. Do not close the browser until capture succeeds.`);
    await page.goto(`${origin}/api/auth/login?returnTo=%2Fhome`);
    async function waitSession(elevated) {
      const deadline = Date.now() + 10 * 60_000;
      while (Date.now() < deadline) {
        const response = await context.request.get(`${origin}/api/auth/session`);
        if (response.ok()) {
          const s = await response.json();
          if (s.state === 'authenticated') {
            if (s.principalId !== identities[plane][actor] || s.tenantId !== '44444444-4444-4444-8444-444444444444') {
              throw Error('Wrong actor or tenant. Existing saved state was not replaced.');
            }
            if (!elevated || s.assurance === 'elevated') return s;
          }
        }
        await new Promise(r => setTimeout(r, 1000));
      }
      throw Error('Timed out waiting for authenticated elevated assurance. Existing saved state was not replaced.');
    }
    const session = await waitSession(false);
    if (session.assurance !== 'elevated') {
      await page.goto(`${origin}/home`);
      await page.evaluate(() => {
        const raw = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('__Host-athyper-csrf='));
        if (!raw) throw Error('CSRF cookie unavailable');
        const form = document.createElement('form');
        form.method = 'POST'; form.action = '/api/auth/step-up/start?returnTo=%2Fhome';
        const input = document.createElement('input'); input.type = 'hidden'; input.name = 'csrfToken';
        input.value = decodeURIComponent(raw.slice(raw.indexOf('=') + 1));
        form.append(input); document.body.append(form); form.submit();
      });
    }
    await waitSession(true);
    mkdirSync(dirname(output), { recursive: true });
    await context.storageState({ path: pending }); chmodSync(pending, 0o600);
    renameSync(pending, output);
    console.log(`Verified ${plane}/${actor}: CirrusAtlantic, elevated. Saved session successfully.`);
  } finally {
    rmSync(pending, { force: true });
    await browser.close();
  }
}
main().catch(() => { console.error('Capture did not complete. Confirm the selected actor, tenant and interactive MFA; no session contents were printed.'); process.exitCode = 1; });
