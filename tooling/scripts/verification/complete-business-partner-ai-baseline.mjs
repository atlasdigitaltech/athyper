/** Automates normal login, browser-relay timing and regression qualification.
 * Requires a current user session or credentials; never resets credentials/grants.
 * Raw evidence stays outside the repository. No business mutation tools are called.
 */
import { createRequire } from 'node:module';
import { mkdirSync, existsSync, readFileSync, writeFileSync, chmodSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { validateReadStream, timings } from './bp-ai-authenticated-evidence.mjs';

const env = process.env;
const root = process.cwd();
const out = resolve(env.ATLAS_TOOL_RECEIPT_DIR ?? join(homedir(), '.athyper/instances/dev/receipts/bp-ai-00', new Date().toISOString().replace(/[:.]/g, '-')));
mkdirSync(out, { recursive: true, mode: 0o700 });
const within = relative(realpathSync(root), realpathSync(out));
if (within === '' || (!within.startsWith('..') && !within.startsWith('/'))) throw new Error('Receipt directory must be outside the repository');
chmodSync(out, 0o700);
const save = (name, value) => { const path = join(out, name); writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); chmodSync(path, 0o600); };
const summary = { schema: 'bp-ai-authenticated-baseline/1', capturedAt: new Date().toISOString(), status: 'running', stage: 'configuration', samples: [] };
let browser;
const require = createRequire(root + '/package.json');
const { chromium } = require('@playwright/test');
try {
  const origin = env.PLAYWRIGHT_NEON_BASE_URL ?? 'https://neon.dev.athyper.test';
  const issuer = env.ATLAS_TEST_IAM_ORIGIN ?? 'https://iam.dev.athyper.test';
  if (new URL(origin).origin !== origin || new URL(issuer).origin !== issuer || !origin.startsWith('https://') || !issuer.startsWith('https://')) throw Error('INVALID_ORIGIN');
  const libs = '/tmp/athyper-playwright-libs/extracted/usr/lib/x86_64-linux-gnu';
  browser = await chromium.launch({ env: { ...env, ...(existsSync(libs) ? { LD_LIBRARY_PATH: [libs, env.LD_LIBRARY_PATH].filter(Boolean).join(':') } : {}) } });
  const statePath = resolve(env.ATLAS_TEST_STORAGE_STATE ?? 'tests/e2e/.auth/neon.json');
  const context = await browser.newContext({ ignoreHTTPSErrors: origin === 'https://neon.dev.athyper.test', ...(existsSync(statePath) ? { storageState: statePath } : {}) });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const session = async () => { const r = await context.request.get(origin + '/api/auth/session'); return r.ok() ? (await r.json()).state : 'anonymous'; };
  summary.stage = 'authentication';
  let state = await session();
  if (state !== 'authenticated' && state !== 'context_required') {
    if (!env.PLAYWRIGHT_NEON_USER || !env.PLAYWRIGHT_NEON_PASSWORD_FILE) throw Error('CURRENT_SESSION_OR_CREDENTIAL_REQUIRED');
    const password = readFileSync(env.PLAYWRIGHT_NEON_PASSWORD_FILE, 'utf8').trim();
    if (!password) throw Error('EMPTY_CREDENTIAL_FILE');
    await page.goto(origin + '/api/auth/login?returnTo=%2Fhome');
    if (new URL(page.url()).origin !== issuer) throw Error('UNEXPECTED_LOGIN_ORIGIN');
    await page.locator('#username').fill(env.PLAYWRIGHT_NEON_USER);
    if (!await page.locator('#password').isVisible()) await page.locator('button[type=submit],input[type=submit]').first().click();
    if (new URL(page.url()).origin !== issuer) throw Error('UNEXPECTED_LOGIN_ORIGIN');
    await page.locator('#password').fill(password);
    await page.locator('button[type=submit],input[type=submit]').first().click();
    await page.waitForURL(url => url.origin === origin && !url.pathname.startsWith('/api/auth/'), { timeout: 20_000 }).catch(() => {});
    if (new URL(page.url()).origin !== origin) {
      const text = await page.locator('body').innerText();
      throw Error(/invalid username or password/i.test(text) ? 'CREDENTIAL_REJECTED' : 'MFA_OR_INTERACTIVE_LOGIN_REQUIRED');
    }
    state = await session();
  }
  if (state === 'context_required') {
    await page.goto(origin + '/select-context?returnTo=%2Fhome');
    let items = page.getByRole('list', { name: 'Available authorized contexts' }).getByRole('listitem');
    if (env.PLAYWRIGHT_NEON_TENANT_NAME) items = items.filter({ has: page.getByText(env.PLAYWRIGHT_NEON_TENANT_NAME, { exact: true }) });
    if (await items.count() !== 1) throw Error('EXPLICIT_TENANT_SELECTION_REQUIRED');
    await items.click();
    await page.waitForURL(url => url.origin === origin && url.pathname === '/home');
  }
  if (await session() !== 'authenticated') throw Error('AUTHENTICATED_SESSION_REQUIRED');
  await context.storageState({ path: join(out, 'neon-state.json') });
  chmodSync(join(out, 'neon-state.json'), 0o600);
  summary.stage = 'fixture';
  const recordId = env.ATLAS_TEST_RECORD_ID, organizationId = env.ATLAS_TEST_ORGANIZATION_ID;
  if (![recordId, organizationId].every(v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v))) throw Error('AUTHORIZED_FIXTURE_COORDINATES_REQUIRED');
  const measuredRuns = Number(env.ATLAS_TEST_MEASURED_RUNS ?? 20);
  if (!Number.isInteger(measuredRuns) || measuredRuns < 20 || measuredRuns > 30) throw Error('MEASURED_RUNS_MUST_BE_20_TO_30');
  const revisionKind = env.ATLAS_TEST_REVISION_KIND ?? 'content_hash';
  if (!['content_hash', 'record_version'].includes(revisionKind)) throw Error('INVALID_REVISION_KIND');
  // The requests execute inside a real authenticated page through the normal BFF.
  await page.goto(origin + '/mdg/business-partner/manage');
  await page.goto(origin + '/atlas?from=%2Fmdg%2Fbusiness-partner%2Fmanage');
  async function api(path, body) {
    return page.evaluate(async ({ path, body }) => {
      const csrf = document.cookie.split(';').map(s => s.trim()).find(s => /^(?:__Host-)?athyper-csrf=/.test(s))?.split('=').slice(1).join('=');
      const start = performance.now();
      const r = await fetch('/api/relay/atlas' + path, { method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(120_000), ...(body ? { headers: { 'content-type': 'application/json', 'x-csrf-token': csrf ?? '', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(body) } : {}) });
      const reader = r.body.getReader(), decoder = new TextDecoder(); let text = '', frameBuffer = '', firstTextMs = null;
      while (true) { const { value, done } = await reader.read(); if (done) break; const part = decoder.decode(value, { stream: true }); text += part; frameBuffer += part; let end;
        while ((end = frameBuffer.search(/\r?\n\r?\n/)) >= 0) { const frame = frameBuffer.slice(0, end); const separatorLength = frameBuffer.slice(end).startsWith('\r\n') ? 4 : 2; frameBuffer = frameBuffer.slice(end + separatorLength); const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n'); try { const e = JSON.parse(data).event; if (firstTextMs === null && e.type === 'message.delta' && typeof e.text === 'string' && e.text.trim()) firstTextMs = Math.round(performance.now() - start); } catch {} }
      }
      return { status: r.status, text, firstTextMs, totalMs: Math.round(performance.now() - start) };
    }, { path, body });
  }
  summary.stage = 'admission';
  const admission = await api('/admission');
  if (admission.status !== 200) throw Error('ADMISSION_UNAVAILABLE');
  const policy = JSON.parse(admission.text);
  if (!policy.readToolsAllowed) throw Error('READ_TOOLS_NOT_ADMITTED');
  summary.stage = 'benchmark';
  for (let i = 0; i <= measuredRuns; i++) {
    const created = await api('/threads', { title: `BP-AI-00 read benchmark ${i}` });
    if (created.status !== 201) throw Error('THREAD_CREATION_FAILED');
    const threadId = JSON.parse(created.text).threadId;
    const run = await api(`/threads/${threadId}/runs`, { clientRequestId: crypto.randomUUID(), publicModelId: 'atlas-re-1.0-local', dataClass: 'internal', userText: `Use bp_read_summary to read Business Partner ${recordId} in operating organization ${organizationId}. Summarize the returned record without inferring supplier readiness.`, catalogPolicyRevision: policy.policyRevision });
    save(`run-${i}.json`, { threadId, run });
    if (run.status !== 200 || run.firstTextMs === null) throw Error('READ_RUN_FAILED');
    let evidence; try { evidence = validateReadStream(run.text, recordId, revisionKind); } catch { throw Error('READ_EVIDENCE_INVALID'); }
    const sample = { firstTextMs: run.firstTextMs, totalMs: run.totalMs, ...evidence };
    if (i === 0) summary.warmup = sample; else summary.samples.push(sample);
    save('summary.json', summary);
    console.log(`Read ${i}/${measuredRuns}: validated${i === 0 ? ' (warm-up)' : ''}`);
  }
  summary.timing = timings(summary.samples);
  summary.measurementScope = 'Authenticated browser fetch through BFF, including Atlas tools; excludes UI composer/render timing and authorization-persona qualification.';
  summary.stage = 'regression';
  try { const log = execFileSync('pnpm', ['qualify:business-partner-r9'], { cwd: root, encoding: 'utf8', timeout: 180_000, stdio: ['ignore', 'pipe', 'pipe'] }); writeFileSync(join(out, 'regression.log'), log, { mode: 0o600 }); } catch { throw Error('REGRESSION_GATE_FAILED'); }
  summary.status = 'passed'; summary.stage = 'complete';
} catch (error) {
  summary.status = 'blocked';
  summary.reason = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'CHECK_FAILED_REVIEW_LOCAL_CONFIGURATION';
  process.exitCode = 1;
} finally {
  await browser?.close();
  save('summary.json', summary);
  console.log(JSON.stringify({ status: summary.status, stage: summary.stage, reason: summary.reason, receiptDirectory: out }));
}
