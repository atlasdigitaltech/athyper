#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { extractStaticUrlRoutes } from "./extract-static-url-routes.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const BASELINE = "governance/config/governance/server-legacy-route-baseline.json";
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const IGNORED_DIRECTORIES = new Set(["node_modules", "dist", "coverage", ".turbo", ".git", "__tests__", "fixtures"]);
const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);
const SYSTEM_PREFIXES = ["/health", "/ready", "/live", "/metrics", "/docs", "/openapi"];

function posix(value) { return value.split(sep).join("/"); }
function sourceText(path) { return readFileSync(path, "utf8").replace(/^\uFEFF/, ""); }

function* walk(root) {
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root).sort()) {
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
    const start = match.index + match[0].length;
    const parsed = readQuoted(source, start);
    const end = source[start] === "[" ? matching(source, start, "[", "]") : -1;
    const paths = parsed ? [parsed.value] : end > start ? parseArray(source.slice(start, end + 1)) : [];
    for (const value of paths ?? []) {
      if (typeof value !== "string") continue;
      const declaredPath = expandTemplate(value, environment, constants);
      if (!declaredPath || !declaredPath.startsWith("/")) continue;
      routes.push({ method: match[2], declaredPath: `${receiverPrefix(match[1], mounts)}/${declaredPath}`.replace(/\/+/g, "/"), kind: Object.keys(environment).length ? "loop" : "direct", index: offset + match.index });
    }
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

function collectTree(root, tree, workspaceRoot) {
  const occurrences = [];
  const defaultMount = tree === "legacy" ? "/api" : "";
  for (const path of walk(root)) {
    const source = sourceText(path);
    const routes = extractRoutesFromSource(source, { defaultMount });
    // Descriptor factories (for example Neon finance) bind routes in another file.
    // Supplement current source only; historical baseline extraction remains stable.
    if (tree === "current" && /\bkind\s*:\s*["']route["']/.test(source)) {
      for (const route of extractStaticUrlRoutes(source).routes) {
        const normalized = normalizeRoutePath(route.declaredPath);
        if (!routes.some(existing => existing.method === route.method && existing.path === normalized)) routes.push({...route, path: normalized});
      }
    }
    for (const route of routes) occurrences.push({ ...route, source: posix(relative(workspaceRoot, path)) });
  }
  return occurrences;
}

function validateBaseline(baseline) {
  const provenance = baseline?.provenance;
  if (baseline?.schemaVersion !== 1 || !["historical-manifest", "source-tree"].includes(provenance?.kind)
    || typeof provenance.path !== "string" || !provenance.path
    || !/^[a-f0-9]{64}$/.test(provenance.sha256 ?? "")
    || (provenance.kind === "historical-manifest" && !/^[a-f0-9]{40}$/.test(provenance.commit ?? ""))
    || !Array.isArray(baseline.routes) || baseline.routes.length === 0) {
    throw new Error("Invalid legacy route baseline: nonempty routes and verifiable provenance are required");
  }
  const seen = new Set();
  for (const route of baseline.routes) {
    if (!route || typeof route.method !== "string" || !HTTP_METHODS.has(route.method.toLowerCase()) || route.method !== route.method.toUpperCase()
      || typeof route.path !== "string" || !route.path.startsWith("/") || normalizeRoutePath(route.path) !== route.path
      || typeof route.declaredPath !== "string" || !route.declaredPath.startsWith("/")
      || typeof route.source !== "string" || !route.source.startsWith("server-backup/")
      || route.source.includes("\\") || route.source.split("/").includes("..")
      || !Number.isSafeInteger(route.line) || route.line < 1 || !["direct", "contract", "loop"].includes(route.kind)) {
      throw new Error("Invalid legacy route baseline occurrence");
    }
    const key = JSON.stringify([route.method, route.path, route.source, route.line, route.declaredPath, route.kind]);
    if (seen.has(key)) throw new Error("Duplicate legacy route baseline occurrence");
    seen.add(key);
  }
  return baseline;
}

/** The backup tree is read only by this explicit refresh operation, never by routine checks. */
export function refreshLegacyBaseline({ root = ROOT } = {}) {
  const legacyRoot = join(root, "server-backup");
  if (!existsSync(legacyRoot)) throw new Error("Restore the authentic server-backup snapshot before refreshing the legacy baseline");
  const hash = createHash("sha256");
  for (const path of [...walk(legacyRoot)].sort()) {
    // Hash a deterministic sequence of source paths and their exact bytes, with length framing.
    const name = Buffer.from(posix(relative(root, path)));
    const content = readFileSync(path);
    hash.update(`${name.length}:`).update(name).update(`${content.length}:`).update(content);
  }
  const baseline = validateBaseline({ schemaVersion: 1,
    provenance: { kind: "source-tree", path: "server-backup", sha256: hash.digest("hex") },
    routes: collectTree(legacyRoot, "legacy", root),
  });
  const destination = join(root, BASELINE);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, renderJson(baseline));
  console.log(`Refreshed legacy baseline (${baseline.routes.length} occurrences). Review and commit the baseline and regenerated manifest.`);
  return baseline;
}

export function buildRouteManifest(root = ROOT, { currentOnly = false } = {}) {
  const baselinePath = join(root, BASELINE);
  const baseline = !currentOnly && existsSync(baselinePath) ? validateBaseline(JSON.parse(sourceText(baselinePath))) : null;
  const legacy = baseline?.routes ?? [];
  if (!existsSync(join(root, "server"))) throw new Error("Current server source directory is required to generate the route manifest");
  const current = collectTree(join(root, "server"), "current", root);
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
    route.status = !baseline ? "current-uncompared" : route.legacy.length && route.current.length ? "matched" : route.legacy.length ? "legacy-only" : "current-only";
  }
  return {
    schemaVersion: 2,
    normalization: { legacyDefaultMount: "/api", parameterNames: ":param", excluded: ["tests", "fixtures", "dist", "node_modules"] },
    sources: { legacy: baseline ? BASELINE : null, current: "server" },
    legacyParity: baseline ? { status: "available", provenance: baseline.provenance }
      : { status: "unavailable", reason: currentOnly ? "Explicit current-routes-only mode" : "Legacy route baseline is missing" },
    summary: {
      identities: routes.length,
      matched: baseline ? routes.filter((route) => route.status === "matched").length : null,
      legacyOnly: baseline ? routes.filter((route) => route.status === "legacy-only").length : null,
      currentOnly: baseline ? routes.filter((route) => route.status === "current-only").length : null,
      legacyOccurrences: baseline ? legacy.length : null,
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
    `Legacy parity: **${manifest.legacyParity.status}**. ${manifest.legacyParity.reason ?? `Baseline: \`${manifest.sources.legacy}\` (${manifest.legacyParity.provenance.kind}).`}`,
    "",
    "The comparison resolves literal router mounts, route contracts, and finite string/tuple loops. Legacy package routes receive the historical `/api` host mount. Parameter names are normalized to `:param`; a match is structural evidence, not proof of authorization or response-contract parity.",
    "",
    "| Measure | Count |",
    "| --- | ---: |",
    `| Matched identities | ${manifest.summary.matched ?? "Unavailable"} |`,
    `| Legacy-only identities | ${manifest.summary.legacyOnly ?? "Unavailable"} |`,
    `| Current-only identities | ${manifest.summary.currentOnly ?? "Unavailable"} |`,
    `| Legacy occurrences | ${manifest.summary.legacyOccurrences ?? "Unavailable"} |`,
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

export function writeOrCheck({ write = false, root = ROOT, currentOnly = false } = {}) {
  const manifest = buildRouteManifest(root, { currentOnly });
  if (!currentOnly && manifest.legacyParity.status !== "available") throw new Error("Legacy route baseline is missing. Restore the committed baseline, or use --current-only to explicitly report legacy parity as unavailable.");
  const outputs = [[join(root, "docs/architecture/server-route-manifest.json"), renderJson(manifest)], [join(root, "docs/architecture/server-route-manifest.md"), markdown(manifest)]];
  if (write) {
    for (const [path, content] of outputs) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); }
    console.log(`Wrote normalized route manifest (${manifest.routes.length} identities; legacy parity ${manifest.legacyParity.status}).`);
    return manifest;
  }
  const stale = outputs.filter(([path, content]) => !existsSync(path) || sourceText(path) !== content).map(([path]) => posix(relative(root, path)));
  if (stale.length) throw new Error(`Route manifest is stale. Run pnpm routes:server-manifest.\n${stale.join("\n")}`);
  console.log(`Normalized route manifest verified (${manifest.routes.length} identities; legacy parity ${manifest.legacyParity.status}).`);
  return manifest;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const args = process.argv.slice(2);
    if (args.some((arg) => !["--write", "--current-only", "--refresh-legacy-baseline"].includes(arg))
      || (args.includes("--refresh-legacy-baseline") && args.length !== 1)) throw new Error("Use --write, --current-only, or --refresh-legacy-baseline (alone)");
    if (args.includes("--refresh-legacy-baseline")) refreshLegacyBaseline();
    else writeOrCheck({ write: args.includes("--write"), currentOnly: args.includes("--current-only") });
  }
  catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
}
