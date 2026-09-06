import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { extractStaticUrlRoutes } from '../../scripts/policy/extract-static-url-routes.mjs';

export const BASELINE_PATH = 'tooling/tools/scripts/openapi-undocumented-baseline.json';
function legacyCheckpoint(root) {
  const revision = '7cd0dd9a';
  const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const legacy = JSON.parse(git(['show', `${revision}:${BASELINE_PATH}`]));
  const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = legacy.routes.map((operation) => new RegExp('^' + operation.split(/\$\{[^}]+\}/).map(escape).join('[^/]+') + '$'));
  const excludedSources = new Set(legacy.sources.map((entry) => entry.source));
  const paths = git(['ls-tree', '-r', '--name-only', revision, 'server']).trim().split('\n');
  const exceptions = [];
  for (const source of paths) {
    if (!source.endsWith('.ts') || source.includes('/__tests__/') || /\.(test|spec)\.ts$/.test(source) || source.includes('/runtime/http/')) continue;
    const routes = extractStaticUrlRoutes(git(['show', `${revision}:${source}`])).routes;
    const operations = routes.filter((route) => route.kind === 'direct').map((route) => `${route.method} ${route.declaredPath}`).filter((operation) => excludedSources.has(source) || patterns.some((pattern) => pattern.test(operation)));
    if (operations.length) exceptions.push({ source, operations, expiresOn: '2026-10-06' });
  }
  return { schemaVersion: 2, exceptions };
}
export function validateExceptions(document, observed, { today = new Date().toISOString().slice(0, 10), previous, root = process.cwd() } = {}) {
  const failures = [];
  if (document.schemaVersion !== 2 || !Array.isArray(document.exceptions)) return ['OpenAPI baseline must use schemaVersion 2 with exact per-source operations'];
  const approved = new Set();
  const previousEntries = new Map((previous?.exceptions ?? []).flatMap((entry) => entry.operations.map((operation) => [`${entry.source} ${operation}`, entry])));
  for (const entry of document.exceptions) {
    for (const field of ['source', 'owner', 'trackingIssue', 'reason', 'expiresOn']) if (typeof entry[field] !== 'string' || !entry[field].trim()) failures.push(`Exception ${entry.source} requires ${field}`);
    const expiry = entry.expiresOn ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry) || !Number.isFinite(Date.parse(expiry)) || new Date(expiry).toISOString().slice(0, 10) !== expiry || expiry <= today) failures.push(`Expired or invalid OpenAPI exception: ${entry.source} (${expiry})`);
    if (!existsSync(join(root, entry.owner ?? '', 'package.json'))) failures.push(`Exception owner must identify a workspace package: ${entry.owner}`);
    if (!existsSync(join(root, (entry.trackingIssue ?? '').split('#')[0]))) failures.push(`Missing exception tracking record: ${entry.trackingIssue}`);
    if (!Array.isArray(entry.operations) || !entry.operations.length) { failures.push(`Empty exception: ${entry.source}`); continue; }
    for (const operation of entry.operations) {
      const key = `${entry.source} ${operation}`;
      if (approved.has(key)) failures.push(`Duplicate exception: ${key}`);
      approved.add(key);
      if (!observed.has(key)) failures.push(`Stale exception; remove migrated or deleted route: ${key}`);
      if (previous?.schemaVersion === 2) {
        const prior = previousEntries.get(key);
        if (!prior) failures.push(`OpenAPI exception growth is forbidden: ${key}`);
        else if (expiry > prior.expiresOn) failures.push(`OpenAPI exception expiry cannot be extended: ${key}`);
      }
    }
  }
  for (const key of observed) if (!approved.has(key)) failures.push(`Undocumented route: ${key}; register a request/response contract (do not expand the baseline)`);
  return failures;
}

export async function scanRoutes(root) {
  const observed = new Set(), operationIds = new Map(), failures = [];
  for (const scanRoot of ['server/packages', 'server/apps/platform-host/src']) {
    for (const file of await files(join(root, scanRoot))) {
      if (!file.endsWith('.ts') || /\.(test|spec)\.ts$/.test(file) || file.includes('/__tests__/')) continue;
      const source = await readFile(file, 'utf8'), path = relative(root, file).replaceAll('\\', '/');
      // Runtime owns Express infrastructure and discovery routes; its actual-route
      // audit is exercised by runtime tests rather than granting app-level exemptions.
      if (path.startsWith('server/packages/runtime/http/')) continue;
      const extracted = extractStaticUrlRoutes(source);
      for (const route of extracted.routes) if (route.kind === 'direct') observed.add(`${path} ${route.method} ${route.declaredPath}`);
      for (const unresolved of extracted.unresolved) {
        if (path === 'server/packages/planes/neon/src/finance-http.ts' && unresolved.expression.startsWith('defineRouteContract({method:point.method,path:point.path,')) {
          const descriptors = extractStaticUrlRoutes(await readFile(join(root, 'server/packages/planes/neon/src/register-finance.ts'), 'utf8')).routes;
          if (descriptors.length) continue;
        }
        failures.push(`Unresolved HTTP registration: ${path}:${unresolved.line} ${unresolved.expression}`);
      }
      const ids = [...source.matchAll(/operationId\s*:\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1]).filter((id) => !id.includes('${'));
      for (const match of source.matchAll(/registerContractRoute\s*\([^,]+,\s*contract\(\s*["'`](?:get|post|put|patch|delete)["'`]\s*,\s*["'`][^"'`]+["'`]\s*,\s*["'`]([^"'`]+)["'`]/g)) ids.push(match[1]);
      for (const id of ids) {
        if (operationIds.has(id)) failures.push(`Duplicate operationId ${id}: ${operationIds.get(id)}, ${path}`);
        operationIds.set(id, path);
      }
    }
  }
  if (!operationIds.size) failures.push('No OpenAPI operation contracts found');
  return { observed, failures, operationCount: operationIds.size };
}

export async function main(args = process.argv.slice(2), root = process.cwd()) {
  const document = JSON.parse(await readFile(join(root, BASELINE_PATH), 'utf8'));
  const baseIndex = args.indexOf('--base');
  const base = baseIndex >= 0 ? args[baseIndex + 1] : process.env.OPENAPI_BASE_REF;
  if (baseIndex >= 0 && !base) throw new Error('--base requires a commit');
  let previous;
  if (base) {
    const commit = execFileSync('git', ['rev-parse', '--verify', `${base}^{commit}`], { cwd: root, encoding: 'utf8' }).trim();
    previous = JSON.parse(execFileSync('git', ['show', `${commit}:${BASELINE_PATH}`], { cwd: root, encoding: 'utf8' }));
    if (previous.schemaVersion !== 2) {
      // One-time v1 -> v2 migration must remain pinned to the original debt snapshot.
      if (document.grandfatheredAtCommit !== '7cd0dd9a') throw new Error('Initial exception migration must retain the original debt checkpoint');
      previous = legacyCheckpoint(root);
    }
  }
  const result = await scanRoutes(root);
  const failures = [...result.failures, ...validateExceptions(document, result.observed, { previous, root })];
  if (failures.length) throw new Error(failures.join('\n'));
  console.log(`Verified ${result.operationCount} literal operation IDs; ${result.observed.size} exact, owned, time-limited raw-route exceptions. No new undocumented routes.`);
}
async function files(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'coverage', 'fixtures'].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await files(path));
    else output.push(path);
  }
  return output;
}
if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
