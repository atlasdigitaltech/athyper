#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildRouteManifest, normalizeRoutePath } from './generate-server-route-manifest.mjs';
import { extractStaticUrlRoutes } from './extract-static-url-routes.mjs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const DOC = join(ROOT, 'docs/architecture/business-partner/development-url-catalogue.md');
const SNAPSHOT = join(ROOT, 'docs/architecture/business-partner/development-openapi-inventory.json');
const API = 'https://api.dev.athyper.test';
const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']);
const sort = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const identity = (route) => `${route.method} ${normalizeRoutePath(route.path)}`;
const cell = (value) => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
const link = (path) => `[source](../../../${path})`;
const url = (origin, path) => path.includes('{') ? `\`${path}\`` : `[${path}](${origin}${path})`;
const baseUrl = (origin) => `Base URL: [${origin}](${origin}). Paths below are relative to this origin.`;

export function openApiInventory(document) {
  if (!document.openapi || !document.paths || !Object.keys(document.paths).length) throw new Error('Expected a nonempty OpenAPI document');
  return Object.entries(document.paths).flatMap(([path, item]) => Object.entries(item)
    .filter(([method]) => METHODS.has(method))
    .map(([method, operation]) => {
      if (operation.$ref) throw new Error(`Unresolved operation reference: ${method} ${path}`);
      return { method: method.toUpperCase(), path, operationId: operation.operationId ?? '', tags: operation.tags ?? [], summary: operation.summary ?? '' };
    })).sort((a, b) => sort(`${a.path} ${a.method}`, `${b.path} ${b.method}`));
}

function* files(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => sort(a.name, b.name))) {
    if (entry.name.startsWith('_') || entry.name.startsWith('.') || ['node_modules', 'dist', 'coverage', 'fixtures'].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else yield path;
  }
}

export function appPath(file) {
  return '/' + file.split('/').slice(0, -1).filter((part) => !part.startsWith('(') && !part.startsWith('@'))
    .map((part) => part.replace(/^\[\[\.\.\.(.+)\]\]$/, '{$1...?}').replace(/^\[\.\.\.(.+)\]$/, '{$1...}').replace(/^\[(.+)\]$/, '{$1}')).join('/');
}

async function appRoutes(app) {
  const routes = new Map();
  const add = (path, kind, source, methods = 'GET', name = '') => {
    const previous = routes.get(path);
    if (previous) { previous.name ||= name; return; }
    routes.set(path, { path, kind, source, methods, name });
  };
  const directory = join(ROOT, `apps/${app}/app`);
  for (const file of files(directory)) {
    if (!/(?:page|route)\.[jt]sx?$/.test(file)) continue;
    const handler = /\/route\.[jt]sx?$/.test(file);
    const methods = handler ? [...readFileSync(file, 'utf8').matchAll(/export\s+(?:(?:async\s+)?function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)].map((m) => m[1]).sort(sort).join(', ') : 'GET';
    if (!methods) throw new Error(`No HTTP exports recognized in ${file}`);
    add(appPath(relative(directory, file)), handler ? 'Browser endpoint' : 'Page', relative(ROOT, file), methods);
  }
  const source = `apps/${app}/lib/catalog-routes.ts`;
  const catalog = (await import(pathToFileURL(join(ROOT, source)).href))[`${app}CatalogRoutes`];
  for (const workspace of catalog) {
    const base = `/${workspace.routeSlug}`;
    add(base, 'Workspace', source, 'GET', workspace.name);
    for (const module of workspace.modules) {
      const path = `${base}/${module.routeSlug}`;
      add(path, 'Module', source, 'GET', module.name);
      if (app !== 'neon') continue;
      if (module.defaultEntityCode) add(`${path}/new`, 'Default entity create', source);
      for (const entity of module.entities) {
        for (const [suffix, kind] of [['', 'Entity list'], ['/new', 'Entity create'], ['/{entityId}', 'Entity detail']]) {
          add(`${path}/${entity.routeSlug}${suffix}`, kind, source, 'GET', entity.name);
        }
      }
    }
  }
  return [...routes.values()].sort((a, b) => sort(a.path, b.path));
}

export function auditCatalogue(lines) {
  const origins = new Map();
  const shared = new Map();
  let origin;
  for (const line of lines) {
    if (line.startsWith('Base URL:')) origin = line.match(/https:\/\/[^\]]+/)[0];
    const match = line.match(/^- \*\*([A-Z, ]+)\*\* (?:`([^`]+)`|\[([^\]]+)\])/);
    if (!match) continue;
    const path = match[2] ?? match[3];
    // Keep single, required catch-all and optional catch-all patterns distinct.
    const shape = path.replace(/\{[^}]+\}/g, (parameter) => parameter.endsWith('...?}') ? '{segments...?}' : parameter.endsWith('...}') ? '{path...}' : '{parameter}');
    if (!origins.has(origin)) origins.set(origin, { entries: 0, identities: new Map(), paths: new Map() });
    const inventory = origins.get(origin);
    for (const method of match[1].split(', ')) {
      inventory.entries++;
      const key = `${method} ${shape}`;
      if (!inventory.identities.has(key)) inventory.identities.set(key, []);
      inventory.identities.get(key).push(path);
      if (!inventory.paths.has(shape)) inventory.paths.set(shape, new Set());
      inventory.paths.get(shape).add(method);
      if (origin !== API) {
        if (!shared.has(key)) shared.set(key, new Set());
        shared.get(key).add(origin);
      }
    }
  }
  const result = [
    '## Duplicate URL audit', '',
    'This audit checks every listed App and Runtime entry, including discovery endpoints. Identity is origin + HTTP method + path shape: parameter names are ignored, while single segments, required catch-all and optional catch-all patterns remain distinct. Combined method lists are expanded. Counts describe catalogue entries after the existing source scanners merge declarations; they do not prove the absence of duplicate runtime registrations or overlapping wildcard routes.', '',
    '| Origin | Method/path entries | Unique identities | Duplicate identity groups | Paths with multiple methods |',
    '| --- | ---: | ---: | ---: | ---: |',
  ];
  const duplicates = [];
  for (const [host, inventory] of origins) {
    const repeated = [...inventory.identities].filter(([, paths]) => paths.length > 1);
    result.push(`| ${host} | ${inventory.entries} | ${inventory.identities.size} | ${repeated.length} | ${[...inventory.paths.values()].filter((methods) => methods.size > 1).length} |`);
    for (const [key, paths] of repeated) duplicates.push(`| ${host} | \`${key}\` | ${paths.map((path) => `\`${path}\``).join('<br>')} |`);
  }
  result.push('', 'Duplicate identities listed below represent repeated URL shapes, even when their parameter names differ. A generated entity detail template and a concrete Next.js page can describe the same endpoint; this alone does not establish conflicting handlers.', '');
  if (duplicates.length) result.push('| Origin | Method and normalized path | Listed paths |', '| --- | --- | --- |', ...duplicates, '');
  else result.push('No duplicate identities found.', '');
  result.push(`${[...shared.values()].filter((hosts) => hosts.size > 1).length} method/path shapes are shared across application origins. Different origins identify different URLs. Multiple HTTP methods on the same path are separate operations, not duplicate identities.`, '');
  return result;
}

export async function renderCatalogue(snapshot) {
  const sourceRoutes = buildRouteManifest(ROOT).routes.filter((route) => route.current.length);
  const byIdentity = new Map(sourceRoutes.map((route) => [identity(route), route]));
  for (const file of files(join(ROOT, 'server'))) {
    if (!file.endsWith('.ts') || /\.(test|spec)\.ts$/.test(file)) continue;
    const sourcePath = relative(ROOT, file);
    const extracted = extractStaticUrlRoutes(readFileSync(file, 'utf8'));
    for (const route of extracted.routes) {
      const key = identity({ ...route, path: route.declaredPath });
      let entry = byIdentity.get(key);
      if (!entry) {
        entry = { method: route.method, path: normalizeRoutePath(route.declaredPath), current: [] };
        sourceRoutes.push(entry);
        byIdentity.set(key, entry);
      }
      if (!entry.current.some((r) => r.source === sourcePath && r.declaredPath === route.declaredPath)) entry.current.push({ ...route, source: sourcePath });
    }
    for (const unresolved of extracted.unresolved) {
      if (sourcePath === 'server/packages/runtime/http/src/http-runtime.ts' && unresolved.expression.startsWith('app.use(')) continue;
      if (sourcePath === 'server/packages/runtime/http/src/route-contract.ts' && unresolved.expression.startsWith('application[contract.method](contract.path,')) continue;
      // Runtime discovery URLs are configurable and listed explicitly above the inventories.
      if (sourcePath === 'server/packages/runtime/http/src/http-runtime.ts' && /^app.get\((artifactPath,|openApi.docsPath \?\? "\/docs")/.test(unresolved.expression)) continue;
      // This cross-file adapter consumes the descriptors extracted from register-finance.ts.
      if (sourcePath === 'server/packages/planes/neon/src/finance-http.ts' && unresolved.expression.replace(/\s+/g, '').startsWith('defineRouteContract({method:point.method,path:point.path,')) {
        const descriptors = extractStaticUrlRoutes(readFileSync(join(ROOT, 'server/packages/planes/neon/src/register-finance.ts'), 'utf8')).routes;
        if (!descriptors.length) throw new Error('Finance route descriptors could not be extracted');
        continue;
      }
      if (!sourceRoutes.some((r) => r.current.some((o) => o.source === sourcePath && o.line === unresolved.line))) throw new Error(`Unresolved route at ${sourcePath}:${unresolved.line}: ${unresolved.expression}`);
    }
  }
  const live = new Set(snapshot.operations.map(identity));
  const source = new Map(sourceRoutes.map((route) => [identity(route), route]));
  const missing = sourceRoutes.filter((route) => !live.has(identity(route)));
  const apps = Object.fromEntries(await Promise.all(['studio', 'neon', 'mesh'].map(async (app) => [app, await appRoutes(app)])));
  const lines = [
    '# Development URL catalogue — all applications and Runtime APIs', '',
    'Generated by `pnpm urls:generate`. Do not edit this file manually; update the generator or route sources.', '',
    `Swagger inventory captured: **${snapshot.capturedAt}** from [the development OpenAPI document](${snapshot.source}).`, '',
    'This catalogue covers all operations in that Swagger snapshot, additional backend route declarations in the current checkout, and all Studio, NEON and MESH pages, browser endpoints, workspace/module URLs and supported entity routes. The sections distinguish deployed documentation from source declarations; source presence does not prove that a capability is enabled in the running host.', '',
    '| Inventory | Count |', '| --- | ---: |',
    `| Swagger operations | ${snapshot.operations.length} |`,
    `| Swagger paths | ${new Set(snapshot.operations.map((r) => r.path)).size} |`,
    `| Backend method/path identities extracted from source | ${sourceRoutes.length} |`,
    `| Source identities absent from Swagger | ${missing.length} |`,
    ...Object.entries(apps).map(([app, routes]) => `| ${app} URL entries (including patterns) | ${routes.length} |`), '',
    '## Jump to', '',
    '- [Studio](#studio-application-urls) · [NEON](#neon-application-urls) · [MESH](#mesh-application-urls)',
    '- [Runtime discovery](#runtime-discovery) · [Deployed Swagger APIs](#runtime-apis-in-deployed-swagger)',
    '- [Additional source APIs](#additional-backend-apis-declared-in-source) · [Refresh instructions](#how-to-use-and-refresh)', '',
    '- [Duplicate URL audit](#duplicate-url-audit)', '',
    'Each entry shows its method and path, followed by its details and source. Fixed paths link to the full development URL; parameterized paths are templates to combine with the section’s base URL. All entries stay expanded for browser Find.', '',
    '## How to use and refresh', '',
    '- [Runtime Swagger UI](https://api.dev.athyper.test/docs) reads `/openapi.json`. Browser APIs on the application origins are separate and do not appear in Runtime Swagger.',
    '- Replace `{parameter}` with a real value. `{path...}` requires one or more segments; `{segments...?}` permits zero or more. Parameter names in Swagger are preserved exactly. Additional source paths retain their declared parameter names.',
    '- Application entries show explicitly exported methods. Framework-provided HEAD/OPTIONS handling is implicit. Workspace/module entries can resolve to descriptor-driven surfaces; visibility and availability depend on authentication, tenant context, entitlements and published descriptors.',
    '- Browser callbacks, back-channel logout and relay endpoints are protocol endpoints, not ordinary pages. Use `/sign-in`, `/logout` and `/select-context` for manual UX review.',
    '- `/api/auth/mfa/verify` is a compatibility endpoint: authenticated, CSRF-valid requests return `403 auth.step_up_required`. Start interactive MFA through `/api/auth/step-up/start` and finish through the OIDC callback. Trusted-device cookies do not elevate Runtime access.',
    '- The Business Partner master list is `/mdg/business-partner/partners`; `/mdg/business-partner` is the module landing page. Request detail supports the `#workflow` fragment. IDs in application patterns follow the actual Next.js folder names.',
    '- Health endpoints report current state. This inventory does not assert successful authentication, healthy dependencies or successful execution of every endpoint.', '',
    '```sh',
    '# Refresh the checked-in Swagger inventory and regenerate every section:',
    'pnpm urls:sync',
    '# With a private development CA, set NODE_EXTRA_CA_CERTS=/path/to/ca.pem.',
    '# Alternatively download OpenAPI with your trusted client, then:',
    'pnpm urls:sync --openapi-file /path/to/openapi.json',
    '# Regenerate using the existing snapshot after source route changes:',
    'pnpm urls:generate',
    '# Offline CI drift check against source and the checked-in snapshot:',
    'pnpm urls:check',
    '# Compare the snapshot with the currently deployed Swagger without writing:',
    'pnpm urls:check --live',
    '```', '',
    'The offline check cannot detect an independently changed deployment. Run the live check after deployments. The source scanners resolve literal routes, route contracts, local helper factories, finite string/tuple/object loops and path arrays. Unresolved recognized route declarations fail generation instead of being silently omitted. New registration conventions require extending the scanners. Raw Express routes are not automatically included by the Runtime OpenAPI generator; see [the tracked OpenAPI migration debt](../../../tooling/tools/scripts/openapi-undocumented-baseline.json).', '',
    '## Runtime discovery', '',
    baseUrl(API), '',
    ...['/docs', '/openapi.json'].map((path) => `- **GET** ${url(API, path)}`), '',
  ];
  for (const [app, routes] of Object.entries(apps)) {
    lines.push(`## ${app === 'studio' ? 'Studio' : app.toUpperCase()} application URLs`, '', baseUrl(`https://${app}.dev.athyper.test`), '');
    for (const route of routes) lines.push(`- **${route.methods}** ${url(`https://${app}.dev.athyper.test`, route.path)}  `,
      `  ${cell(route.kind + (route.name ? ` — ${route.name}` : ''))} · ${link(route.source)}`, '');
    lines.push('');
  }
  lines.push('## Runtime APIs in deployed Swagger', '', 'Every operation below comes directly from the captured OpenAPI document. Group names, operation IDs, summaries, methods and parameter names match Swagger. Use Swagger for request bodies, responses and permissions.', '', baseUrl(API), '');
  const tags = [...new Set(snapshot.operations.map((route) => route.tags[0] ?? 'Untagged'))].sort(sort);
  for (const tag of tags) {
    lines.push(`### ${tag}`, '');
    for (const route of snapshot.operations.filter((r) => (r.tags[0] ?? 'Untagged') === tag)) {
      const match = source.get(identity(route));
      lines.push(`- **${route.method}** ${url(API, route.path)}  `,
        `  ${cell(route.operationId)}${route.summary ? ` — ${cell(route.summary)}` : ''}  `,
        `  Source match: ${match ? match.current.map((r) => link(r.source)).join(', ') : 'Not found by source scanner'}`, '');
    }
    lines.push('');
  }
  lines.push('## Additional backend APIs declared in source', '',
    '**These operations are absent from the captured deployed Swagger.** They may be raw Express routes without OpenAPI contracts, newer source contracts, or conditionally composed capabilities. They are included here so the catalogue does not silently omit them; this section does not claim they are deployed or Swagger-documented.', '',
    baseUrl(API), '');
  let previousGroup;
  for (const route of missing.sort((a, b) => sort(`${a.path} ${a.method}`, `${b.path} ${b.method}`))) {
    const group = '/' + route.path.split('/').filter(Boolean).slice(0, route.path.startsWith('/api/') ? 2 : 1).join('/');
    if (group !== previousGroup) {
      lines.push(`### Source routes: ${group}`, '');
      previousGroup = group;
    }
    for (const occurrence of route.current) {
      const path = occurrence.declaredPath.replace(/:([A-Za-z_$][\w$]*)/g, '{$1}');
      lines.push(`- **${route.method}** ${url(API, path)}  `,
        `  ${occurrence.kind === 'contract' ? 'Route contract' : 'Raw route'} · ${link(occurrence.source)}`, '');
    }
  }
  lines.push('', 'See [Business Partner field extensibility and 360 aggregation](field-extensibility-and-360-aggregation.md) for the aggregation and security model.', '');
  lines.splice(lines.indexOf('## How to use and refresh'), 0, ...auditCatalogue(lines));
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const sync = args.includes('--sync');
  const fileIndex = args.indexOf('--openapi-file');
  if (fileIndex >= 0 && !args[fileIndex + 1]) throw new Error('--openapi-file requires a path');
  let snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
  if (sync || args.includes('--live') || fileIndex >= 0) {
    const document = fileIndex >= 0 ? JSON.parse(readFileSync(resolve(args[fileIndex + 1]), 'utf8')) : await fetch(`${API}/openapi.json`, { signal: AbortSignal.timeout(30000) }).then((response) => {
      if (!response.ok) throw new Error(`OpenAPI fetch failed: HTTP ${response.status}`);
      return response.json();
    });
    const operations = openApiInventory(document);
    if (sync) snapshot = { source: `${API}/openapi.json`, capturedAt: new Date().toISOString(), info: document.info, operations };
    else if (JSON.stringify(operations) !== JSON.stringify(snapshot.operations)) throw new Error('Deployed Swagger inventory changed. Run pnpm urls:sync.');
  }
  const content = await renderCatalogue(snapshot);
  if (write || sync) {
    if (sync) writeFileSync(SNAPSHOT, JSON.stringify(snapshot, null, 2) + '\n');
    writeFileSync(DOC, content);
    console.log(`Wrote development URL catalogue (${snapshot.operations.length} Swagger operations).`);
  } else {
    if (readFileSync(DOC, 'utf8') !== content) throw new Error('Development URL catalogue is stale. Run pnpm urls:generate.');
    console.log(`Development URL catalogue verified (${snapshot.operations.length} Swagger operations, source routes and all three apps).`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
