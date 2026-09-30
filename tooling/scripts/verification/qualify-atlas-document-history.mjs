import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, chmodSync } from 'node:fs';
import assert from 'node:assert/strict';

// DEV synthetic fixture only. Commits a brief source disable, always restores in finally.
const tenant = '44444444-4444-4444-8444-444444444444';
const actor = 'cca94907-7519-5871-8e3c-6b11aa545c93';
const attachment = 'fc668e33-9d67-4015-83ba-8be70dfbb2c6';
const chat = JSON.parse(readFileSync('docs/examples/atlas-f5/cirrus-document-chat.qualification.json', 'utf8'));
assert.equal(chat.passed, true);
assert.match(chat.threadId, /^[0-9a-f-]{36}$/);
const origin = 'https://neon.dev.athyper.test';
const state = 'tests/e2e/.auth/dev/neon/catl.admin.json';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ignoreHTTPSErrors: true, storageState: state });
const report = { observedAt: new Date().toISOString(), threadId: chat.threadId, attachmentId: attachment, checks: [] };
const sql = (input) => execFileSync('docker', ['exec', '-i', 'athyper-dev-db-1', 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'athyper_neon', '-v', 'ON_ERROR_STOP=1'], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const where = `tenant_id='${tenant}' AND source_kind='attachment' AND source_id='${attachment}' AND entity_code='business_partner'`;
const transition = (from, to) => sql(`BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL ROLE athyperapp; SET LOCAL app.current_tenant_id='${tenant}'; SET LOCAL app.current_principal_id='${actor}'; SET LOCAL app.database_plane='neon'; UPDATE ai.atlas_knowledge_source SET status='${to}',updated_at=now(),updated_by='${actor}' WHERE ${where} AND status='${from}' RETURNING status; COMMIT;`);
const history = async () => {
  const r = await context.request.get(origin + '/api/relay/atlas/threads/' + chat.threadId + '/messages');
  assert.equal(r.status(), 200);
  return JSON.stringify(await r.json());
};
let disabled = false;
try {
  const csrf = (await context.cookies(origin)).find(c => c.name === '__Host-athyper-csrf');
  await context.request.post(origin + '/api/auth/refresh', { headers: { origin, 'x-csrf-token': decodeURIComponent(csrf.value) } });
  const session = await (await context.request.get(origin + '/api/auth/session')).json();
  assert.equal(session.state, 'authenticated');
  assert.equal(session.principalId, actor);
  assert.match(await history(), /Indigo Lantern/);
  assert.equal(sql(`SELECT status FROM ai.atlas_knowledge_source WHERE ${where}`), 'active');
  const result = transition('active', 'disabled');
  disabled = true;
  assert.equal(result, 'disabled');
  assert.doesNotMatch(await history(), /Indigo Lantern|Sources: cirrus-synthetic-bp-document/);
  report.checks.push('live saved answer withheld while canonical synthetic source disabled');
} finally {
  if (disabled) {
    assert.equal(transition('disabled', 'active'), 'active');
    assert.equal(sql(`SELECT status FROM ai.atlas_knowledge_source WHERE ${where}`), 'active');
    report.sourceRestored = true;
  }
  try {
    if (report.sourceRestored) {
      assert.match(await history(), /Indigo Lantern/);
      report.checks.push('same saved answer accessible after source restored');
      report.passed = report.checks.length === 2;
    }
  } finally {
    await context.storageState({ path: state });
    chmodSync(state, 0o600);
    await browser.close();
    writeFileSync('docs/examples/atlas-f5/cirrus-document-history.qualification.json', JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
  }
}
