/** Explicit DEV-only capability revocation exercise. Recreates only API with Atlas
 * tools disabled, verifies withholding, then restores its exact prior Compose
 * configuration in finally. Never changes IAM grants or business records. */
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
assert.ok(process.argv.includes('--apply'), 'Use --apply for the explicit DEV API exercise');
const receiptPath = resolve(process.env.ATLAS_REPLAY_RECEIPT ?? '');
assert.ok(process.env.ATLAS_REPLAY_RECEIPT && relative(process.cwd(), realpathSync(receiptPath)).startsWith('../'));
const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
assert.match(receipt.threadId, /^[0-9a-f-]{36}$/);
const out = dirname(receiptPath) + '/revocation'; mkdirSync(out, { recursive: true, mode: 0o700 });
const save = (name, value) => writeFileSync(`${out}/${name}.json`, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
const current = JSON.parse(execFileSync('docker', ['inspect', 'athyper-dev-api-1'], { encoding: 'utf8' }))[0];
const files = current.Config.Labels['com.docker.compose.project.config_files'].split(',');
const previousEnvironment = Object.fromEntries(current.Config.Env.map(v => { const i = v.indexOf('='); return [v.slice(0, i), v.slice(i + 1)]; }));
assert.equal(previousEnvironment.ATLAS_AGENT_TOOLS_ENABLED, 'true');
save('previous', { image: current.Image, composeFiles: files });
save('disabled.compose', { services: { api: { image: current.Image, environment: { ...previousEnvironment, ATLAS_AGENT_TOOLS_ENABLED: 'false' } } } });
const env = { ...process.env, ATHYPER_RUNTIME_ROOT: resolve(process.env.HOME, '.athyper'), ATHYPER_INSTANCE: 'dev', ATHYPER_DOMAIN_SUFFIX: 'dev.athyper.test', ATHYPER_RUNTIME_UID: String(process.getuid()), ATHYPER_RUNTIME_GID: String(process.getgid()), ATHYPER_DDL_SHA256: previousEnvironment.ATHYPER_DDL_SHA256 ?? 'unchanged' };
function deploy(disabled) {
  const args = ['compose', '--project-name', 'athyper-dev', ...[...files, ...(disabled ? [`${out}/disabled.compose.json`] : [])].flatMap(f => ['--file', f])];
  execFileSync('docker', [...args, 'config', '--quiet'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  execFileSync('docker', [...args, 'up', '--detach', '--no-deps', '--force-recreate', '--wait', '--wait-timeout', '180', 'api'], { env, stdio: ['ignore', 'pipe', 'pipe'], timeout: 200000 });
}
const { chromium } = createRequire(process.cwd() + '/package.json')('@playwright/test');
const browser = await chromium.launch({ env: { ...process.env, LD_LIBRARY_PATH: '/tmp/athyper-playwright-libs/extracted/usr/lib/x86_64-linux-gnu' } });
const summary = { schema: 'atlas-replay-capability-revocation/1', capturedAt: new Date().toISOString(), status: 'running', restored: false, checks: {} };
let changed = false;
try {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, storageState: process.env.ATLAS_TEST_STORAGE_STATE });
  const session = await context.request.get('https://neon.dev.athyper.test/api/auth/session');
  assert.equal((await session.json()).state, 'authenticated');
  const page = await context.newPage(); await page.goto('https://neon.dev.athyper.test/atlas');
  async function api(path, body) {
    return page.evaluate(async ({ path, body }) => {
      const csrf = document.cookie.split(';').map(v => v.trim()).find(v => /^(?:__Host-)?athyper-csrf=/.test(v))?.split('=').slice(1).join('=');
      const r = await fetch('/api/relay/atlas' + path, { method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(120000), ...(body ? { headers: { 'content-type': 'application/json', 'x-csrf-token': csrf ?? '', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(body) } : {}) });
      return { status: r.status, text: await r.text() };
    }, { path, body });
  }
  const before = await api(`/threads/${receipt.threadId}/messages`); assert.equal(before.status, 200);
  const old = JSON.parse(before.text).items.find(m => m.role === 'assistant' && m.content.some(b => b.type === 'tool_result'));
  const name = old?.content.find(b => b.type === 'tool_result')?.result?.records?.[0]?.display_name;
  assert.ok(name);
  changed = true; deploy(true);
  const admission = JSON.parse((await api('/admission')).text); assert.equal(admission.readToolsAllowed, false);
  const history = await api(`/threads/${receipt.threadId}/messages`); assert.equal(history.status, 200);
  assert.ok(!JSON.parse(history.text).items.some(m => m.role === 'assistant'));
  assert.ok(!history.text.includes(name)); summary.checks.historyWithheld = true;
  const exported = await api(`/threads/${receipt.threadId}/export`); assert.equal(exported.status, 200);
  assert.ok(!JSON.parse(exported.text).messages.some(m => m.role === 'assistant')); summary.checks.exportWithheld = true;
  const retry = await api(`/threads/${receipt.threadId}/runs`, receipt.command);
  assert.ok(retry.status >= 400 && !retry.text.includes(name)); summary.checks.staleRetryRejected = true;
  const next = await api(`/threads/${receipt.threadId}/runs`, { ...receipt.command, clientRequestId: randomUUID(), catalogPolicyRevision: admission.policyRevision, userText: 'What was the partner name in your previous answer? Use only the evidence currently available in this conversation.' });
  save('withheld-context-run', next); assert.equal(next.status, 200);
  const events = next.text.split(/\r?\n\r?\n/).flatMap(f => { const d = f.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join(''); return d ? [JSON.parse(d).event] : []; });
  assert.equal(events.at(-1)?.type, 'run.completed');
  const answer = events.filter(e => e.type === 'message.delta').map(e => e.text).join('');
  assert.ok(answer.trim() && !answer.toLocaleLowerCase().includes(name.toLocaleLowerCase()));
  summary.checks.modelHistoryWithheld = true;
  summary.status = 'passed';
} catch (error) {
  summary.status = 'failed'; save('failure', { message: error instanceof Error ? error.message : 'Qualification failed' }); process.exitCode = 1;
} finally {
  try { if (changed) deploy(false); summary.restored = true; }
  catch { summary.restored = false; summary.status = 'failed'; process.exitCode = 1; }
  await browser.close(); save('summary', summary); console.log(JSON.stringify(summary));
}
