/** Authenticated, read-only BP replay qualification. Creates isolated Atlas conversations
 * but never modifies business records, grants, credentials, or tool commands.
 * Raw transcript/session receipts must stay outside the repository. */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, realpathSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { validateReadStream } from './bp-ai-authenticated-evidence.mjs';
const env = process.env, root = process.cwd();
const out = resolve(env.ATLAS_REPLAY_RECEIPTS ?? `${homedir()}/.athyper/instances/dev/receipts/bp-ai-03-replay-${new Date().toISOString().replace(/[:.]/g, '-')}`);
mkdirSync(out, { recursive: true, mode: 0o700 });
const location = relative(realpathSync(root), realpathSync(out));
assert.ok(location.startsWith('../'), 'Receipts must be outside the repository');
const save = (name, value) => writeFileSync(`${out}/${name}.json`, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
const summary = { schema: 'atlas-message-replay-qualification/1', capturedAt: new Date().toISOString(), checks: {}, status: 'running' };
const origin = env.PLAYWRIGHT_NEON_BASE_URL ?? 'https://neon.dev.athyper.test';
assert.equal(new URL(origin).origin, origin);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const state = env.ATLAS_TEST_STORAGE_STATE;
assert.ok(state && existsSync(state), 'A current authorized storage state is required');
const { chromium } = createRequire(root + '/package.json')('@playwright/test');
const browser = await chromium.launch({ env: { ...env, ...(existsSync('/tmp/athyper-playwright-libs/extracted/usr/lib/x86_64-linux-gnu') ? { LD_LIBRARY_PATH: '/tmp/athyper-playwright-libs/extracted/usr/lib/x86_64-linux-gnu' } : {}) } });
function events(text) {
  return text.split(/\r?\n\r?\n/).flatMap(frame => { const data = frame.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n'); return data ? [JSON.parse(data)] : []; });
}
const prose = stream => events(stream).flatMap(e => e.event.type === 'message.delta' ? [e.event.text] : []).join('');
try {
  const context = await browser.newContext({ ignoreHTTPSErrors: origin === 'https://neon.dev.athyper.test', storageState: state });
  const session = await context.request.get(origin + '/api/auth/session');
  assert.equal((await session.json()).state, 'authenticated', 'Current authentication required');
  const page = await context.newPage();
  await page.goto(origin + '/atlas');
  async function api(path, body) {
    const result = await page.evaluate(async ({ path, body }) => {
      const csrf = document.cookie.split(';').map(v => v.trim()).find(v => /^(?:__Host-)?athyper-csrf=/.test(v))?.split('=').slice(1).join('=');
      const start = performance.now();
      const response = await fetch('/api/relay/atlas' + path, { method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(120000), ...(body ? { headers: { 'content-type': 'application/json', 'x-csrf-token': csrf ?? '', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify(body) } : {}) });
      return { status: response.status, text: await response.text(), durationMs: Math.round(performance.now() - start) };
    }, { path, body });
    assert.ok(result.status >= 200 && result.status < 300, `Atlas HTTP ${result.status}`);
    return result;
  }
  let receipt;
  if (env.ATLAS_REPLAY_RESUME) {
    receipt = JSON.parse(readFileSync(env.ATLAS_REPLAY_RESUME, 'utf8'));
  } else {
    const recordId = env.ATLAS_TEST_RECORD_ID, organizationId = env.ATLAS_TEST_ORGANIZATION_ID;
    assert.ok(uuid(recordId) && uuid(organizationId), 'Authorized fixture coordinates required');
    const admission = JSON.parse((await api('/admission')).text);
    assert.equal(admission.readToolsAllowed, true);
    const thread = JSON.parse((await api('/threads', { title: 'BP-AI-03 durable replay qualification' })).text);
    const command = { clientRequestId: randomUUID(), publicModelId: 'atlas-re-1.0-local', dataClass: 'internal', userText: `Use bp_read_summary to read Business Partner ${recordId} in operating organization ${organizationId}. Summarize the returned partner name without inferring readiness.`, catalogPolicyRevision: admission.policyRevision };
    const first = await api(`/threads/${thread.threadId}/runs`, command);
    const evidence = validateReadStream(first.text, recordId, 'content_hash');
    receipt = { threadId: thread.threadId, command, first, evidence };
    save('receipt', receipt);
    summary.checks.liveRead = true; summary.evidence = evidence; summary.firstRunMs = first.durationMs;
  }
  assert.ok(uuid(receipt.threadId));
  await page.reload();
  const history = JSON.parse((await api(`/threads/${receipt.threadId}/messages`)).text);
  const outputMessageId = events(receipt.first.text).find(e => e.event.type === 'run.completed')?.event.messageId;
  const assistant = history.items.find(m => m.role === 'assistant' && m.messageId === outputMessageId);
  assert.ok(assistant, 'Authorized assistant missing from durable history');
  assert.equal(assistant.content.filter(b => b.type === 'text').map(b => b.text).join(''), prose(receipt.first.text));
  assert.ok(!JSON.stringify(history).includes('atlas_message_lineage'), 'Internal lineage must not reach clients');
  summary.checks.persistedHistory = true;
  const exported = JSON.parse((await api(`/threads/${receipt.threadId}/export`)).text);
  assert.ok(exported.messages.some(m => m.messageId === assistant.messageId));
  summary.checks.export = true;
  const replay = await api(`/threads/${receipt.threadId}/runs`, receipt.command);
  assert.equal(prose(replay.text), prose(receipt.first.text));
  assert.equal(events(replay.text)[0].runId, events(receipt.first.text)[0].runId);
  assert.equal(events(replay.text).at(-1).event.type, 'run.completed');
  assert.ok(!events(replay.text).some(e => e.event.type.startsWith('tool.')));
  summary.checks.idempotentReplay = true; summary.replayMs = replay.durationMs;
  save('replay', replay);
  if (!env.ATLAS_REPLAY_RESUME) {
    const name = assistant.content.find(b => b.type === 'tool_result')?.result?.records?.[0]?.display_name;
    assert.ok(name, 'Read result must contain an authorized name');
    const followup = await api(`/threads/${receipt.threadId}/runs`, { ...receipt.command, clientRequestId: randomUUID(), userText: 'What is the partner name from your previous answer? Answer using the evidence already supplied in this conversation.' });
    save('followup', followup);
    assert.equal(events(followup.text).at(-1).event.type, 'run.completed');
    assert.ok(prose(followup.text).toLocaleLowerCase().includes(name.toLocaleLowerCase()), 'Follow-up must use the authorized name');
    summary.checks.modelHistory = true;
  } else summary.checks.resumeFromSeparateProcess = true;
  save("state", await context.storageState());
  summary.status = 'passed';
} catch (error) {
  summary.status = 'failed';
  // Detailed errors and transcripts stay in private receipts.
  save('failure', { message: error instanceof Error ? error.message : 'Unknown failure' });
  process.exitCode = 1;
} finally {
  await browser.close(); save('summary', summary);
  console.log(JSON.stringify({ status: summary.status, checks: summary.checks, receiptDirectory: out }));
}
