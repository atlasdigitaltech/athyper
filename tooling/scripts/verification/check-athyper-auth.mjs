import { request } from '@playwright/test';
import { chmod, copyFile, rename, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

// Never print the storage state, cookie values, or response body.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
async function main() {
  const { values } = parseArgs({ options: {
    plane: { type: 'string' }, actor: { type: 'string' },
    'principal-id': { type: 'string' }, 'tenant-id': { type: 'string' },
    activate: { type: 'boolean', default: false },
  } });
  const { plane, actor } = values;
  if (!['neon', 'mesh', 'studio'].includes(plane) || !['catl.admin', 'catl.owner'].includes(actor)) {
    throw new Error('Usage: node tooling/scripts/verification/check-athyper-auth.mjs --plane neon|mesh|studio --actor catl.admin|catl.owner [--principal-id ID] [--tenant-id ID] [--activate]');
  }
  const statePath = resolve(repo, `tests/e2e/.auth/dev/${plane}/${actor}.json`);
  await chmod(statePath, 0o600);
  const client = await request.newContext({
    baseURL: `https://${plane}.dev.athyper.test`, storageState: statePath,
    ignoreHTTPSErrors: true, timeout: 20_000,
  });
  try {
    const response = await client.get('/api/auth/session');
    if (!response.ok()) throw new Error(`Session endpoint returned HTTP ${response.status()}`);
    const session = await response.json();
    if (session.state !== 'authenticated' || session.plane !== plane || !session.tenantId || !session.principalId) {
      throw new Error('Session is expired, incomplete, or for the wrong plane. Capture it again.');
    }
    if (values['principal-id'] && session.principalId !== values['principal-id']) throw new Error('Principal ID mismatch. Existing compatibility state retained.');
    if (values['tenant-id'] && session.tenantId !== values['tenant-id']) throw new Error('Tenant ID mismatch. Existing compatibility state retained.');
    console.log(JSON.stringify({ plane, actorLabel: actor, authenticated: true,
      principalId: session.principalId, tenantId: session.tenantId,
      actorVerified: Boolean(values['principal-id']), tenantVerified: Boolean(values['tenant-id']),
    }, null, 2));
    if (!values['principal-id']) console.log('Actor label is unverified; supply --principal-id from a trusted account record to verify it.');
    if (values.activate) {
      const destination = resolve(repo, `tests/e2e/.auth/${plane}.json`);
      const temporary = `${destination}.${process.pid}.tmp`;
      try {
        await copyFile(statePath, temporary);
        await chmod(temporary, 0o600);
        await rename(temporary, destination);
      } finally { await rm(temporary, { force: true }); }
      console.log(`Updated compatibility file tests/e2e/.auth/${plane}.json`);
      console.log(`export PLAYWRIGHT_${plane.toUpperCase()}_BASE_URL="https://${plane}.dev.athyper.test"`);
      console.log(`export PLAYWRIGHT_REUSE_AUTH_STATE=${plane}`);
    }
  } finally { await client.dispose(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
