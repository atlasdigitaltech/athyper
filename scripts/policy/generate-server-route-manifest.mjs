#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const OUTPUT_JSON = join(ROOT, "docs", "architecture", "server-route-manifest.json");
const OUTPUT_MD = join(ROOT, "docs", "architecture", "server-route-manifest.md");
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const IGNORED_DIRECTORIES = new Set(["node_modules", "dist", "coverage", ".turbo", ".git", "__tests__", "fixtures"]);
const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);
const SYSTEM_PREFIXES = ["/health", "/ready", "/live", "/metrics", "/docs", "/openapi"];

function posix(value) { return value.split(sep).join("/"); }
function sourceText(path) { return readFileSync(path, "utf8").replace(/^\uFEFF/, ""); }

function* walk(root) {
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root)) {
    if (IGNORED_DIRECTORIES.has(entry)) continue;
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) yield* walk(path);
    else if (SOURCE_EXTENSIONS.has(extname(path)) && !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path)) yield path;
  }
}

function lineAt(source, index) { return source.slice(0, index).split("\n").length; }

function readQuoted(source, start) {
  const quote = source[start];
  if (!["'", '"', "`"].includes(quote)) return null;
  let value = "";
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (character === "\\") {
      value += character + (source[index + 1] ?? "");
      index += 1;
    } else if (character === quote) {
      return { value, end: index + 1, template: quote === "`" };
    } else value += character;
  }
  return null;
}

function matching(source, start, open, close) {
  let depth = 0;
  let quote = null;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (["'", '"', "`"].includes(character)) { quote = character; continue; }
    if (character === open) depth += 1;
    else if (character === close && --depth === 0) return index;
  }
  return -1;
}

function stringConstants(source) {
  const values = new Map();
  for (const match of source.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*/g)) {
    const parsed = readQuoted(source, match.index + match[0].length);
    if (parsed && !parsed.value.includes("${")) values.set(match[1], parsed.value);
  }
  return values;
}

function arrayConstants(source) {
  const values = new Map();
  for (const match of source.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*\[/g)) {
    const start = match.index + match[0].length - 1;
    const end = matching(source, start, "[", "]");
    if (end > start) {
      const parsed = parseArray(source.slice(start, end + 1));
      if (parsed) values.set(match[1], parsed);
    }
  }
  return values;
}

function parseArray(source) {
  let index = 0;
  function whitespace() { while (/\s/.test(source[index] ?? "")) index += 1; }
  function value() {
    whitespace();
    if (source[index] === "[") return array();
    const quoted = readQuoted(source, index);
    if (!quoted || quoted.template) return null;
    index = quoted.end;
    return quoted.value;
  }
  function array() {
    if (source[index] !== "[") return null;
    index += 1;
    const result = [];
    while (index < source.length) {
      whitespace();
      if (source[index] === "]") { index += 1; return result; }
      const item = value();
      if (item === null) return null;
      result.push(item);
      whitespace();
      if (source[index] === ",") index += 1;
      else if (source[index] !== "]") return null;
    }
    return null;
  }
  return array();
}

function expandTemplate(value, environment, constants) {
  const expanded = value.replace(/\$\{\s*([A-Za-z_$][\w$]*)\s*\}/g, (_match, name) => environment[name] ?? constants.get(name) ?? `\${${name}}`);
  return expanded.includes("${") ? null : expanded;
}

function mountMap(source, constants) {
  const mounts = new Map();
  const pattern = /\b([A-Za-z_$][\w$]*)\s*\.\s*use\s*\(\s*/g;
  for (const match of source.matchAll(pattern)) {
    const parsed = readQuoted(source, match.index + match[0].length);
    if (!parsed) continue;
    const rest = source.slice(parsed.end).match(/^\s*,\s*([A-Za-z_$][\w$]*)/);
    if (!rest) continue;
    const prefix = expandTemplate(parsed.value, {}, constants);
    if (prefix) mounts.set(rest[1], { parent: match[1], prefix });
  }
  return mounts;
}

function receiverPrefix(receiver, mounts, seen = new Set()) {
  if (seen.has(receiver)) return "";
  seen.add(receiver);
  const mount = mounts.get(receiver);
  return mount ? `${receiverPrefix(mount.parent, mounts, seen)}/${mount.prefix}` : "";
}

export function normalizeRoutePath(path, { defaultMount = "" } = {}) {
  let normalized = path.trim().replace(/\\/g, "/").split("?")[0];
  if (!normalized.startsWith("/")) normalized = `/${normalized}`;
  normalized = normalized.replace(/\/+/, "/").replace(/\/+/g, "/");
  if (defaultMount && !normalized.startsWith(`${defaultMount}/`) && normalized !== defaultMount && !SYSTEM_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    normalized = `${defaultMount}/${normalized}`.replace(/\/+/g, "/");
  }
  normalized = normalized.replace(/:([A-Za-z_$][\w$]*)/g, ":param").replace(/\{([A-Za-z_$][\w$]*)\}/g, ":param");
  if (normalized.length > 1) normalized = normalized.replace(/\/$/, "");
  return normalized;
}

function directRoutes(source, environment, constants, mounts, offset = 0) {
  const routes = [];
  const pattern = /\b([A-Za-z_$][\w$]*)\s*\.\s*(get|post|put|patch|delete)\s*\(\s*/g;
  for (const match of source.matchAll(pattern)) {
    const parsed = readQuoted(source, match.index + match[0].length);
    if (!parsed) continue;
    const declaredPath = expandTemplate(parsed.value, environment, constants);
    if (!declaredPath || !declaredPath.startsWith("/")) continue;
    routes.push({ method: match[2], declaredPath: `${receiverPrefix(match[1], mounts)}/${declaredPath}`.replace(/\/+/g, "/"), kind: Object.keys(environment).length ? "loop" : "direct", index: offset + match.index });
  }
  return routes;
}

function callBodies(source, callName) {
  const bodies = [];
  const pattern = new RegExp(`\\b${callName}\\s*\\(`, "g");
  for (const match of source.matchAll(pattern)) {
    const start = source.indexOf("(", match.index);
    const end = matching(source, start, "(", ")");
    if (end > start) bodies.push({ source: source.slice(start + 1, end), index: match.index });
  }
  return bodies;
}

function contractRoutes(source, constants, environment = {}, offset = 0, localFactory = hasLocalContractFactory(source)) {
  const routes = [];
  for (const body of callBodies(source, "defineRouteContract")) {
    const method = body.source.match(/\bmethod\s*:\s*["'](get|post|put|patch|delete)["']/)?.[1];
    const pathStart = body.source.match(/\bpath\s*:\s*/);
    const parsed = pathStart ? readQuoted(body.source, pathStart.index + pathStart[0].length) : null;
    const declaredPath = parsed ? expandTemplate(parsed.value, environment, constants) : null;
    if (method && declaredPath?.startsWith("/")) routes.push({ method, declaredPath, kind: "contract", index: offset + body.index });
  }
  // Route modules may use a local typed factory around defineRouteContract.
  if (localFactory) {
    for (const body of callBodies(source, "contract")) {
      const methodValue = readQuoted(body.source, body.source.search(/\S/));
      if (!methodValue || !HTTP_METHODS.has(methodValue.value)) continue;
      const comma = body.source.indexOf(",", methodValue.end);
      const pathStart = comma < 0 ? -1 : comma + 1 + (body.source.slice(comma + 1).match(/^\s*/)?.[0].length ?? 0);
      const parsed = pathStart >= 0 ? readQuoted(body.source, pathStart) : null;
      const declaredPath = parsed ? expandTemplate(parsed.value, environment, constants) : null;
      if (declaredPath?.startsWith("/")) routes.push({ method: methodValue.value, declaredPath, kind: "contract", index: offset + body.index });
    }
  }
  return routes;
}

function loopRoutes(source, constants, mounts, arrays) {
  const routes = [];
  const localContractFactory = hasLocalContractFactory(source);
  const pattern = /for\s*\(\s*const\s+(\[[^\]]+\]|[A-Za-z_$][\w$]*)\s+of\s+/g;
  for (const match of source.matchAll(pattern)) {
    const expressionStart = match.index + match[0].length;
    const close = source.indexOf(")", expressionStart);
    if (close < 0) continue;
    const expression = source.slice(expressionStart, close).replace(/\s+as\s+const\s*$/, "").trim();
    const values = expression.startsWith("[") ? parseArray(expression) : arrays.get(expression);
    if (!Array.isArray(values)) continue;
    const statementStart = close + 1 + (source.slice(close + 1).match(/^\s*/)?.[0].length ?? 0);
    const braced = source[statementStart] === "{";
    const statementEnd = braced ? matching(source, statementStart, "{", "}") : source.indexOf(";", statementStart);
    if (statementEnd < 0) continue;
    const bodyStart = statementStart + (braced ? 1 : 0);
    const body = source.slice(bodyStart, statementEnd);
    const bindings = match[1].startsWith("[") ? match[1].slice(1, -1).split(",").map((item) => item.trim()) : [match[1]];
    for (const item of values) {
      const row = Array.isArray(item) ? item : [item];
      const environment = Object.fromEntries(bindings.map((name, index) => [name, row[index]]).filter(([, value]) => typeof value === "string"));
      routes.push(...directRoutes(body, environment, constants, mounts, bodyStart));
      routes.push(...contractRoutes(body, constants, environment, bodyStart, localContractFactory));
    }
  }
  return routes;
}

function hasLocalContractFactory(source) {
  return /function\s+contract\s*\([^)]*\)[^{]*\{[\s\S]{0,4000}?\bdefineRouteContract\s*\(/.test(source);
}

export function extractRoutesFromSource(source, options = {}) {
  const constants = stringConstants(source);
  const mounts = mountMap(source, constants);
  const candidates = [
    ...directRoutes(source, {}, constants, mounts),
    ...contractRoutes(source, constants),
    ...loopRoutes(source, constants, mounts, arrayConstants(source)),
  ];
  const seen = new Set();
  return candidates.flatMap((route) => {
    const path = normalizeRoutePath(route.declaredPath, { defaultMount: options.defaultMount ?? "" });
    const key = `${route.method} ${path} ${route.index}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ method: route.method.toUpperCase(), path, declaredPath: route.declaredPath, kind: route.kind, line: lineAt(source, route.index) }];
  });
}

function collectTree(root, tree) {
  const occurrences = [];
  const defaultMount = tree === "legacy" ? "/api" : "";
  for (const path of walk(root)) {
    const source = sourceText(path);
    for (const route of extractRoutesFromSource(source, { defaultMount })) occurrences.push({ ...route, source: posix(relative(ROOT, path)) });
  }
  return occurrences;
}

export function buildRouteManifest(root = ROOT) {
  const legacy = collectTree(join(root, "server-backup"), "legacy");
  const current = collectTree(join(root, "server"), "current");
  const grouped = new Map();
  for (const [tree, routes] of [["legacy", legacy], ["current", current]]) {
    for (const route of routes) {
      const identity = `${route.method} ${route.path}`;
      const item = grouped.get(identity) ?? { identity, method: route.method, path: route.path, legacy: [], current: [] };
      item[tree].push({ source: route.source, line: route.line, declaredPath: route.declaredPath, kind: route.kind });
      grouped.set(identity, item);
    }
  }
  const routes = [...grouped.values()].sort((left, right) => left.identity.localeCompare(right.identity));
  for (const route of routes) {
    route.legacy.sort((left, right) => `${left.source}:${left.line}`.localeCompare(`${right.source}:${right.line}`));
    route.current.sort((left, right) => `${left.source}:${left.line}`.localeCompare(`${right.source}:${right.line}`));
    route.status = route.legacy.length && route.current.length ? "matched" : route.legacy.length ? "legacy-only" : "current-only";
  }
  return {
    schemaVersion: 1,
    normalization: { legacyDefaultMount: "/api", parameterNames: ":param", excluded: ["tests", "fixtures", "dist", "node_modules"] },
    sources: { legacy: "server-backup", current: "server" },
    summary: {
      identities: routes.length,
      matched: routes.filter((route) => route.status === "matched").length,
      legacyOnly: routes.filter((route) => route.status === "legacy-only").length,
      currentOnly: routes.filter((route) => route.status === "current-only").length,
      legacyOccurrences: legacy.length,
      currentOccurrences: current.length,
    },
    routes,
  };
}

function markdown(manifest) {
  const lines = [
    "# Normalized Server Route Manifest",
    "",
    "Generated by `pnpm routes:server-manifest`. Do not edit manually.",
    "",
    "The comparison resolves literal router mounts, route contracts, and finite string/tuple loops. Legacy package routes receive the historical `/api` host mount. Parameter names are normalized to `:param`; a match is structural evidence, not proof of authorization or response-contract parity.",
    "",
    "| Measure | Count |",
    "| --- | ---: |",
    `| Matched identities | ${manifest.summary.matched} |`,
    `| Legacy-only identities | ${manifest.summary.legacyOnly} |`,
    `| Current-only identities | ${manifest.summary.currentOnly} |`,
    `| Legacy occurrences | ${manifest.summary.legacyOccurrences} |`,
    `| Current occurrences | ${manifest.summary.currentOccurrences} |`,
    "",
    "| Status | Method | Normalized path | Legacy sources | Current sources |",
    "| --- | --- | --- | ---: | ---: |",
    ...manifest.routes.map((route) => `| ${route.status} | ${route.method} | \`${route.path}\` | ${route.legacy.length} | ${route.current.length} |`),
    "",
  ];
  return lines.join("\n");
}

function renderJson(manifest) { return `${JSON.stringify(manifest, null, 2)}\n`; }

export function writeOrCheck({ write = false, root = ROOT } = {}) {
  if (!existsSync(join(root, "server-backup"))) throw new Error("server-backup is required to generate the route manifest");
  const manifest = buildRouteManifest(root);
  const outputs = [[OUTPUT_JSON, renderJson(manifest)], [OUTPUT_MD, markdown(manifest)]];
  if (write) {
    for (const [path, content] of outputs) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); }
    console.log(`Wrote normalized route manifest (${manifest.routes.length} identities).`);
    return manifest;
  }
  const stale = outputs.filter(([path, content]) => !existsSync(path) || sourceText(path) !== content).map(([path]) => posix(relative(ROOT, path)));
  if (stale.length) throw new Error(`Route manifest is stale. Run pnpm routes:server-manifest.\n${stale.join("\n")}`);
  console.log(`Normalized route manifest verified (${manifest.routes.length} identities).`);
  return manifest;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try { writeOrCheck({ write: process.argv.includes("--write") }); }
  catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
}
