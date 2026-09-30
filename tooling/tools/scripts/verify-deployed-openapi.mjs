import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
function assertDocument(document, label) {
  if (!document || typeof document.openapi !== 'string' || !document.paths || typeof document.paths !== 'object' || !Object.keys(document.paths).length) throw new Error(`${label} is not a nonempty OpenAPI document`);
}
export function compareOpenApi(expected, deployed) {
  assertDocument(expected, 'Expected artifact'); assertDocument(deployed, 'Deployed response');
  if (JSON.stringify(canonical(expected)) === JSON.stringify(canonical(deployed))) return [];
  const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];
  const operations = (doc) => new Map(Object.entries(doc.paths).flatMap(([path, item]) => methods.filter((method) => item[method]).map((method) => [`${method.toUpperCase()} ${path}`, canonical(item[method])])));
  const wanted = operations(expected), actual = operations(deployed), changes = [];
  for (const [key, operation] of wanted) {
    if (!actual.has(key)) changes.push(`Missing deployed operation: ${key}`);
    else if (JSON.stringify(operation) !== JSON.stringify(actual.get(key))) changes.push(`Changed deployed contract: ${key}`);
  }
  for (const key of actual.keys()) if (!wanted.has(key)) changes.push(`Unexpected deployed operation: ${key}`);
  return changes.length ? changes : ['OpenAPI metadata, shared schemas, parameters or security configuration differs from the release artifact'];
}
export async function main(args = process.argv.slice(2)) {
  const option = (key) => { const index = args.indexOf(key); return index < 0 ? undefined : args[index + 1]; };
  const expectedPath = option('--expected'), url = option('--url');
  if (!expectedPath || !url) throw new Error('Usage: pnpm openapi:verify-deployed --expected /release/openapi.json --url https://api.example/openapi.json');
  const target = new URL(url);
  if (!['https:', 'http:'].includes(target.protocol) || target.username || target.password) throw new Error('Expected an HTTP(S) OpenAPI URL without embedded credentials');
  const expected = JSON.parse(await readFile(resolve(expectedPath), 'utf8'));
  const response = await fetch(target, { signal: AbortSignal.timeout(30000), redirect: 'error' });
  if (!response.ok) throw new Error(`OpenAPI verification failed: HTTP ${response.status}`);
  const failures = compareOpenApi(expected, await response.json());
  if (failures.length) throw new Error(failures.join('\n'));
  console.log('Deployed OpenAPI matches the expected release artifact, including schemas and permissions.');
}
if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
