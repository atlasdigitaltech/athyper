/** Read-only DEV verification. Uses the existing CATL admin session; never grants permissions. */
import assert from 'node:assert/strict';
import { chromium, request } from '@playwright/test';
import { id } from './seed-identity.mjs';

const baseURL = 'https://neon.dev.athyper.test';
const storageState = 'tests/e2e/.auth/dev/neon/catl.admin.json';
const options = { baseURL, storageState, ignoreHTTPSErrors: true };
const client = await request.newContext(options);
const browser = await chromium.launch();
const context = await browser.newContext(options);
const reports = [];
const path = (bp, suffix) => `/api/relay/entity-runtime/business_partner/records/${bp}/${suffix}`;
async function get(url, status = 200) {
  const response = await client.get(url);
  assert.equal(response.status(), status, `${url}: unexpected HTTP status`);
  return response.json();
}
function rows(data, section) {
  if (section === 'network') return Object.values(data.data?.collections ?? data.collections ?? {}).flat();
  return data.collections?.[section] ?? data.items ?? data.data?.items ?? [];
}
try {
  for (const kind of ['partner', 'person-partner']) {
    const bp = id('cirrusatlantic', kind);
    const bootstrap = await get(path(bp, 'bootstrap?surface=detail'));
    assert.ok(bootstrap.header.values.name);
    const pages = {};
    for (const section of ['industries', 'contacts', 'network']) {
      let cursor; let count = 0; let total = 0;
      const seen = new Set();
      do {
        assert.ok(++count <= 10, 'Pagination must terminate');
        const resource = await get(path(bp, `sections/${section}?surface=detail&limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`));
        for (const row of rows(resource.data, section)) {
          const key = row.id ?? JSON.stringify(row);
          assert.ok(!seen.has(key), `${section}: duplicate row across pages`);
          seen.add(key); total++;
        }
        cursor = resource.data.nextCursor;
      } while (cursor);
      assert.ok(count >= 2 && total >= 30, `${section}: expected seeded multi-page data`);
      pages[section] = { pages: count, rows: total };
    }
    for (const section of ['industries', 'certificates']) {
      const denied = await get(path(bp, `sections/${section}?surface=detail&companyCodeId=00000000-0000-4000-8000-000000000001`), 409);
      assert.equal(denied.code, 'ENTITY_RUNTIME_CONTEXT_REQUIRED');
    }
    const root = id('cirrusatlantic', `read-audit:${kind}:comment:0`);
    const comments = await get(path(bp, `sections/comments?surface=detail&threadRootId=${root}`));
    assert.equal(comments.capability.maxDepth, 5);
    assert.equal(comments.data.items.length, 5);
    for (const comment of comments.data.items)
      assert.equal(comment.canReply, comment.threadDepth < comments.capability.maxDepth);
    await get(`/api/relay/neon/business-partners/${bp}/360/network?limit=2`);

    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`/app/entity/business_partner/${bp}?section=industries`);
    await page.getByText('Declared industries', { exact: true }).waitFor();
    const continuation = page.waitForResponse(response => response.url().includes('/sections/industries?') && response.url().includes('cursor='));
    // Approaching the collection footer, without clicking, loads the next page.
    await page.locator('.a-collection-continuation').scrollIntoViewIfNeeded();
    assert.equal((await continuation).status(), 200);
    await page.getByRole('button', { name: 'Load more', exact: true }).waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Open Comments', exact: true }).click();
    await page.getByRole('button', { name: 'Show 5 replies', exact: true }).click();
    await page.getByText('Maximum reply depth reached', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Reply', exact: true }).count(), 5);
    assert.deepEqual(errors, [], 'No browser runtime errors');
    await page.close();
    const networkPage = await context.newPage();
    networkPage.setDefaultTimeout(20_000);
    await networkPage.goto(`/app/entity/business_partner/${bp}?section=network&tab=360`);
    await networkPage.getByRole('heading', { name: /^Commercial relationships$/i }).waitFor();
    const networkContinuation = networkPage.waitForResponse(response => response.url().includes('/sections/network?') && response.url().includes('cursor='));
    await networkPage.locator('.a-collection-continuation').scrollIntoViewIfNeeded();
    assert.equal((await networkContinuation).status(), 200);
    await networkPage.locator('.a-collection-continuation').waitFor({state:'detached'});
    await networkPage.close();
    reports.push({ kind, pages, replyDepthBoundary: 'API and browser passed', browserPagination: 'automatic on approach passed', network: 'API and browser pagination passed' });
  }
  // A known fixture from another tenant must not be disclosed to CATL admin.
  for (const bp of [id('athyper', 'partner'), '00000000-0000-4000-8000-000000000001']) {
    const denied = await get(path(bp, 'bootstrap?surface=detail'), 404);
    assert.equal(denied.code, 'ENTITY_RUNTIME_RECORD_UNAVAILABLE');
  }
  console.log(JSON.stringify({ actor: 'catl.admin', reports, crossTenantAndMissingRecord: 'denied', writes: 0 }, null, 2));
} finally {
  await context.close();
  await browser.close();
  await client.dispose();
}
