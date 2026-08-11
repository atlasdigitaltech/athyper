#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const LEGACY_ROOT = join(ROOT, "server-backup");
const CURRENT_ROOT = join(ROOT, "server");
const OUTPUT_JSON = join(ROOT, "docs", "architecture", "server-platform-host-legacy-inventory.json");
const OUTPUT_MD = join(ROOT, "docs", "architecture", "server-platform-host-parity-matrix.md");
const DISPOSITIONS = join(CURRENT_ROOT, "architecture", "legacy-dispositions.json");
const IGNORE = new Set(["node_modules", "dist", ".turbo", "coverage", ".git", ".local-evidence"]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const SCRIPT_EXTENSIONS = new Set([".ts", ".js", ".mjs", ".cjs", ".sql", ".ps1", ".bat", ".sh"]);

function posix(value) { return value.split(sep).join("/"); }
function text(path) { return readFileSync(path, "utf8"); }
function json(path) { return JSON.parse(text(path)); }
function normalizeKey(value) { return value.trim().toLowerCase().replace(/\\/g, "/").replace(/\s+/g, " "); }
function scriptKey(path) { return basename(path, extname(path)).toLowerCase().replace(/^(verify|smoke|check|run|apply|manage|create|generate)-/, ""); }

function* walk(root) {
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root)) {
    if (IGNORE.has(entry)) continue;
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) yield* walk(path);
    else yield path;
  }
}

function location(path) { return posix(relative(ROOT, path)); }
function add(map, category, key, path, detail = {}) {
  const normalized = normalizeKey(key);
  if (!normalized) return;
  const identity = `${category}:${normalized}`;
  const prior = map.get(identity) ?? { category, key: normalized, locations: [], details: [] };
  const loc = location(path);
  if (!prior.locations.includes(loc)) prior.locations.push(loc);
  if (Object.keys(detail).length) prior.details.push({ location: loc, ...detail });
  map.set(identity, prior);
}

function scanSource(root, map) {
  for (const path of walk(root)) {
    if (!SOURCE_EXTENSIONS.has(extname(path))) continue;
    const source = text(path);
    for (const match of source.matchAll(/\b(?:app|application|router|server)\s*\.\s*(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/g)) {
      add(map, "routes", `${match[1].toUpperCase()} ${match[2]}`, path);
    }
    for (const match of source.matchAll(/\b(?:process\.env(?:\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]|\.([A-Z][A-Z0-9_]*))|(?:readString|readBoolean|readPositiveInteger|readNumber|Get-EnvOr)\(\s*["']([A-Z][A-Z0-9_]*)["'])/g)) {
      add(map, "configuration", match[1] ?? match[2] ?? match[3], path);
    }
    for (const match of source.matchAll(/\b(?:const|let|var)\s+([A-Z][A-Z0-9_]*(?:JOB|QUEUE)[A-Z0-9_]*)\s*=\s*["'`]([^"'`]+)["'`]/g)) {
      add(map, "jobs", match[2], path, { symbol: match[1] });
    }
  }
}

function scanEnv(root, map) {
  for (const path of walk(root)) {
    if (!/(?:^|\.)env(?:\.|$)|\.env\.example$|staging\.env\.example$|production\.env\.example$/i.test(basename(path))) continue;
    for (const line of text(path).split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/);
      if (match) add(map, "configuration", match[1], path);
    }
  }
}

function scanManifests(root, map) {
  for (const path of walk(root)) {
    if (basename(path) !== "package.json") continue;
    let manifest;
    try { manifest = json(path); } catch { continue; }
    for (const [name, command] of Object.entries(manifest.scripts ?? {})) {
      if (/^(?:dev|start)(?::(?:api|worker|scheduler))?$/.test(name)) add(map, "processes", name, path, { package: manifest.name, command });
      if (/^(?:db:|rls:|field-security:|secdef:|archetypes:|.*:migrate|.*:seed)/.test(name)) add(map, "database-commands", name, path, { package: manifest.name, command });
    }
  }
}

function scanSchedules(root, map) {
  for (const path of walk(root)) {
    if (extname(path) !== ".sql") continue;
    const source = text(path);
    if (!/cron_schedule/i.test(source)) continue;
    for (const match of source.matchAll(/\(\s*(?:NULL|'[0-9a-f-]{36}')\s*,\s*'([^']+)'\s*,/gi)) add(map, "schedules", match[1], path);
  }
}

function scanOperationalScripts(root, map) {
  for (const path of walk(root)) {
    if (!SCRIPT_EXTENSIONS.has(extname(path))) continue;
    const rel = posix(relative(root, path));
    if (!/(^|\/)(scripts?|operations?|rehearsal|migrate|migration|install|verify|checks?)(\/|$)/i.test(rel)) continue;
    add(map, "operational-scripts", scriptKey(path), path, { sourcePath: rel });
  }
}

function scanCompose(root, map) {
  for (const path of walk(root)) {
    if (!/\.(?:yml|yaml)$/i.test(path)) continue;
    const lines = text(path).split(/\r?\n/);
    let inServices = false;
    for (const line of lines) {
      if (/^services:\s*$/.test(line)) { inServices = true; continue; }
      if (inServices && /^\S/.test(line) && !/^services:/.test(line)) { inServices = false; continue; }
      const match = inServices ? line.match(/^  ([A-Za-z0-9_.-]+):\s*(?:#.*)?$/) : null;
      if (match) add(map, "compose-services", match[1], path);
    }
  }
}

function collect(root, includeStack = false) {
  const map = new Map();
  scanSource(root, map);
  scanEnv(root, map);
  scanManifests(root, map);
  scanSchedules(root, map);
  scanOperationalScripts(root, map);
  scanCompose(root, map);
  if (includeStack) {
    const stack = join(ROOT, "stack");
    scanEnv(stack, map);
    scanOperationalScripts(stack, map);
    scanCompose(stack, map);
  }
  for (const item of map.values()) {
    item.locations.sort();
    item.details.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return map;
}

function classification(identity, legacy, current, config) {
  const override = config.overrides?.[identity];
  if (override) return override;
  if (legacy && current) return {
    disposition: "migrated",
    owner: config.defaults[legacy.category]?.owner ?? "platform-rebuild",
    parityEvidence: "Structural identity in rebuilt inventory; behavioral qualification is required by Gate E.",
  };
  if (!legacy && current) return { disposition: "new", owner: "rebuilt-server", parityEvidence: "Current-only surface." };
  const fallback = config.defaults[legacy.category];
  return { disposition: "deferred", ...fallback };
}

export function buildInventory() {
  if (!existsSync(LEGACY_ROOT)) throw new Error("server-backup is required to generate the legacy inventory");
  const legacy = collect(LEGACY_ROOT);
  const current = collect(CURRENT_ROOT, true);
  const dispositions = json(DISPOSITIONS);
  const identities = [...new Set([...legacy.keys(), ...current.keys()])].sort();
  const items = identities.map((identity) => {
    const oldItem = legacy.get(identity);
    const newItem = current.get(identity);
    return {
      identity,
      category: (oldItem ?? newItem).category,
      key: (oldItem ?? newItem).key,
      legacyLocations: oldItem?.locations ?? [],
      currentLocations: newItem?.locations ?? [],
      ...classification(identity, oldItem, newItem, dispositions),
    };
  });
  const summary = {};
  for (const item of items) {
    const key = `${item.category}:${item.disposition}`;
    summary[key] = (summary[key] ?? 0) + 1;
  }
  return {
    schemaVersion: 1,
    sources: { legacy: "server-backup", current: ["server", "stack"] },
    dispositionManifest: "server/architecture/legacy-dispositions.json",
    summary: Object.fromEntries(Object.entries(summary).sort()),
    items,
  };
}

function markdown(inventory) {
  const categories = [...new Set(inventory.items.map((item) => item.category))].sort();
  const lines = [
    "# Server Platform Host legacy parity matrix", "",
    "Generated by `scripts/policy/generate-server-rebuild-inventory.mjs`.", "",
    "## Classification summary", "",
    "| Category | Migrated | Deferred | Retired | Replaced | New |", "| --- | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const category of categories) {
    const count = (disposition) => inventory.items.filter((item) => item.category === category && item.disposition === disposition).length;
    lines.push(`| ${category} | ${count("migrated")} | ${count("deferred")} | ${count("retired")} | ${count("replaced")} | ${count("new")} |`);
  }
  lines.push("", "## Deferred legacy surfaces", "", "Deferred is an explicit classification, not retirement approval. Every row must close before the Gate F staging precondition.", "", "| Category | Key | Owner | Due gate | Legacy location |", "| --- | --- | --- | --- | --- |");
  const deferred = inventory.items.filter((item) => item.disposition === "deferred");
  for (const item of deferred) lines.push(`| ${item.category} | \`${item.key.replaceAll("|", "\\|")}\` | ${item.owner} | ${item.dueGate} | \`${item.legacyLocations[0]}\` |`);
  if (!deferred.length) lines.push("| - | - | - | - | - |");
  lines.push("", "## Gate interpretation", "", "- `migrated` means the same structural identity exists in the rebuilt inventory; Gate E must still provide behavioral evidence.", "- `deferred` has an owner, risk, follow-up, and due gate. It is not permission to remove the legacy source.", "- `retired` is valid only with an explicit approval in the disposition manifest.", "- Full per-item locations and classifications are in `server-platform-host-legacy-inventory.json`.", "");
  return lines.join("\n");
}

function validate(inventory) {
  const errors = [];
  for (const item of inventory.items) {
    if (!item.disposition) errors.push(`${item.identity} is unclassified`);
    if (item.disposition === "migrated" && !item.currentLocations.length) errors.push(`${item.identity} is migrated without a current location`);
    if (item.disposition === "deferred" && (!item.owner || !item.followUp || !item.risk || !item.dueGate)) errors.push(`${item.identity} has incomplete deferral evidence`);
    if (item.disposition === "retired" && (!item.approvedBy || !item.approvalEvidence)) errors.push(`${item.identity} is retired without approval`);
  }
  return errors;
}

function run() {
  const inventory = buildInventory();
  const errors = validate(inventory);
  if (errors.length) throw new Error(errors.join("\n"));
  const jsonOutput = `${JSON.stringify(inventory, null, 2)}\n`;
  const mdOutput = markdown(inventory);
  if (process.argv.includes("--write")) {
    writeFileSync(OUTPUT_JSON, jsonOutput);
    writeFileSync(OUTPUT_MD, mdOutput);
    console.log(`Wrote ${inventory.items.length} inventory items.`);
    return;
  }
  const stale = !existsSync(OUTPUT_JSON) || text(OUTPUT_JSON) !== jsonOutput || !existsSync(OUTPUT_MD) || text(OUTPUT_MD) !== mdOutput;
  if (stale) {
    console.error("Server rebuild inventory is stale. Run: pnpm inventory:server-rebuild");
    process.exitCode = 1;
    return;
  }
  console.log(`Server rebuild inventory verified (${inventory.items.length} items).`);
}

run();
