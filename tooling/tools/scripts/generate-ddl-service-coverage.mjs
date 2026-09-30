import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";

export const SCHEMA_VERSION = "1.0.0";
export const PLANES = Object.freeze(["studio", "neon", "mesh"]);
export const PHYSICAL_AUTHORITIES = Object.freeze(["common_plane_local", ...PLANES]);
export const CLASSIFICATIONS = Object.freeze(["runtime_mutable", "append_only", "projection", "evidence", "catalog_seed_managed", "read_only"]);
export const ROLLOUT_STATUSES = Object.freeze(["code_complete", "database_qualified", "shadow", "controlled_mutation", "ga"]);
export const REVIEW_STATUSES = Object.freeze(["provisional", "reviewed"]);
export const MUTATION_COMPOSITIONS = Object.freeze(["not_applicable", "direct", "composed"]);
export const EVIDENCE_FIELDS = Object.freeze([
  "repository",
  "entryPoints",
  "auditEvent",
  "outboxEvent",
  "replayEvidence",
  "immutabilityEvidence",
  "reversalEvidence",
  "concurrencyEvidence",
  "rebuildEvidence",
  "reconciliationEvidence",
  "unitTests",
  "postgresTests",
]);

export const repositoryRoot = resolve(import.meta.dirname, "../../..");
export const ddlRoot = resolve(repositoryRoot, "server/db/ddl");
export const ownershipPath = resolve(repositoryRoot, "tooling/config/ddl-service-ownership.yaml");
export const schemaPath = resolve(repositoryRoot, "tooling/config/ddl-service-coverage.schema.json");
export const outputPath = resolve(repositoryRoot, "docs/architecture/generated/ddl-service-coverage.json");
export const manifestPaths = Object.freeze(PLANES.map((plane) => resolve(ddlRoot, `planes/${plane}/_manifest.txt`)));

export async function loadOwnership(path = ownershipPath) {
  const text = await readFile(path, "utf8");
  let ownership;
  try {
    // JSON is a YAML 1.2 subset. Keeping this policy file JSON-compatible avoids
    // adding a runtime dependency to repository policy scripts.
    ownership = JSON.parse(text);
  } catch (error) {
    throw new Error(`${portable(relative(repositoryRoot, path))} must be JSON-compatible YAML 1.2: ${error.message}`);
  }
  validateOwnership(ownership);
  return ownership;
}

export async function buildCoverageArtifact(options = {}) {
  const root = options.root ?? repositoryRoot;
  const ddlDirectory = options.ddlRoot ?? resolve(root, "server/db/ddl");
  const ownership = options.ownership ?? await loadOwnership(options.ownershipPath ?? resolve(root, "tooling/config/ddl-service-ownership.yaml"));
  const manifests = options.manifests ?? await loadPlaneManifests(ddlDirectory);
  const ddlFiles = (await walk(ddlDirectory)).filter((path) => path.endsWith(".sql")).sort();
  const rows = [];
  const physicalDefinitions = new Map();
  const ownershipFacts = [];

  for (const absolutePath of ddlFiles) {
    const ddlPath = portable(relative(root, absolutePath));
    const manifestPath = portable(relative(ddlDirectory, absolutePath));
    const installedPlanes = PLANES.filter((plane) => manifests.get(plane)?.has(manifestPath));
    const scope = sourceScope(ddlPath);
    const physicalAuthority = authorityForScope(scope);
    const sql = await readFile(absolutePath, "utf8");
    const declarations = parseCreateTableDeclarations(sql);

    if (declarations.length > 0 && installedPlanes.length === 0) {
      throw new Error(`${ddlPath} declares ${declarations.length} table(s) but is absent from every plane manifest`);
    }

    for (const tableKey of declarations) {
      for (const plane of installedPlanes) {
        const physicalKey = `${plane}:${tableKey}`;
        const previous = physicalDefinitions.get(physicalKey);
        if (previous) throw new Error(`Duplicate physical definition ${physicalKey}: ${previous} and ${ddlPath}`);
        physicalDefinitions.set(physicalKey, ddlPath);
        const sourceKey = `${plane}:${tableKey}:${ddlPath}`;
        const facts = { sourceKey, tableKey, ddlPath, scope, plane, installedPlanes, physicalAuthority };
        const semantics = applyOwnership(ownership, facts);
        ownershipFacts.push(facts);
        rows.push(normalizeRow({ sourceKey, plane, tableKey, ddlPath, installedPlanes, physicalAuthority, ...semantics }));
      }
    }
  }

  rows.sort(compareRows);
  assertUnique(rows.map((row) => row.sourceKey), "sourceKey");
  validateOwnershipCoverage(ownership, ownershipFacts);

  const artifact = {
    $schema: "../../../tooling/config/ddl-service-coverage.schema.json",
    schemaVersion: SCHEMA_VERSION,
    generatedFrom: {
      ddlRoot: "server/db/ddl",
      ownership: "tooling/config/ddl-service-ownership.yaml",
      planeManifests: PLANES.map((plane) => `server/db/ddl/planes/${plane}/_manifest.txt`),
    },
    summary: summarize(rows),
    rows,
  };
  validateCoverageArtifact(artifact);
  return artifact;
}

export function parseCreateTableDeclarations(sql) {
  const withoutComments = maskSqlCommentsAndLiterals(String(sql));
  const declaration = /\bCREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:"(?:[^"]|"")*"|[a-z_][a-z0-9_$]*))\s*\.\s*((?:"(?:[^"]|"")*"|[a-z_][a-z0-9_$]*))/gi;
  return [...withoutComments.matchAll(declaration)].map((match) => `${canonicalIdentifier(match[1])}.${canonicalIdentifier(match[2])}`);
}

function maskSqlCommentsAndLiterals(sql) {
  let result = "";
  for (let index = 0; index < sql.length;) {
    if (sql.startsWith("--", index)) {
      const end = sql.indexOf("\n", index + 2);
      result += " ".repeat((end < 0 ? sql.length : end) - index);
      index = end < 0 ? sql.length : end;
    } else if (sql.startsWith("/*", index)) {
      const close = sql.indexOf("*/", index + 2);
      const end = close < 0 ? sql.length : close + 2;
      result += sql.slice(index, end).replace(/[^\r\n]/g, " ");
      index = end;
    } else if (sql[index] === "'") {
      const start = index++;
      while (index < sql.length) {
        if (sql[index] === "'" && sql[index + 1] === "'") index += 2;
        else if (sql[index++] === "'") break;
      }
      result += sql.slice(start, index).replace(/[^\r\n]/g, " ");
    } else if (sql[index] === "$") {
      const tag = sql.slice(index).match(/^\$[A-Za-z_0-9]*\$/)?.[0];
      if (!tag) { result += sql[index++]; continue; }
      const close = sql.indexOf(tag, index + tag.length);
      const end = close < 0 ? sql.length : close + tag.length;
      result += sql.slice(index, end).replace(/[^\r\n]/g, " ");
      index = end;
    } else result += sql[index++];
  }
  return result;
}

export function applyOwnership(ownership, facts) {
  let result = clone(ownership.defaults);
  for (const rule of ownership.rules) {
    if (ruleMatches(rule.match, facts)) result = merge(result, rule.set);
  }
  const scopedKey = `${facts.scope}:${facts.tableKey}`;
  for (const key of [facts.tableKey, scopedKey, facts.sourceKey]) {
    if (ownership.overrides[key]) result = merge(result, ownership.overrides[key]);
  }
  return result;
}

export function validateCoverageArtifact(artifact) {
  const errors = [];
  if (!isObject(artifact)) throw new Error("Coverage artifact must be an object");
  if (artifact.$schema !== "../../../tooling/config/ddl-service-coverage.schema.json") errors.push("$schema must reference the versioned repository schema");
  if (artifact.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion must be ${SCHEMA_VERSION}`);
  if (!Array.isArray(artifact.rows)) errors.push("rows must be an array");
  else {
    const seen = new Set();
    artifact.rows.forEach((row, index) => {
      const at = `rows[${index}]`;
      if (!isObject(row)) { errors.push(`${at} must be an object`); return; }
      requiredString(row, "sourceKey", at, errors);
      enumValue(row, "plane", PLANES, at, errors);
      requiredString(row, "tableKey", at, errors, /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/);
      requiredString(row, "ddlPath", at, errors, /^server\/db\/ddl\/.+\.sql$/);
      enumValue(row, "physicalAuthority", PHYSICAL_AUTHORITIES, at, errors);
      enumValue(row, "classification", CLASSIFICATIONS, at, errors);
      enumValue(row, "rolloutStatus", ROLLOUT_STATUSES, at, errors);
      enumValue(row, "reviewStatus", REVIEW_STATUSES, at, errors);
      requiredString(row, "serviceOwner", at, errors, /^(none|@athyper\/[a-z0-9][a-z0-9-]*)$/);
      stringArray(row, "installedPlanes", at, errors, { allowed: PLANES, nonEmpty: true });
      for (const field of EVIDENCE_FIELDS) stringArray(row, field, at, errors);
      enumValue(row, "mutationComposition", MUTATION_COMPOSITIONS, at, errors);
      if (!(row.featureGate === null || typeof row.featureGate === "string")) errors.push(`${at}.featureGate must be a string or null`);
      validateCommands(row.commands, `${at}.commands`, errors);
      if (seen.has(row.sourceKey)) errors.push(`duplicate sourceKey ${row.sourceKey}`);
      seen.add(row.sourceKey);
    });
  }
  if (errors.length) throw new Error(`DDL service coverage validation failed:\n- ${errors.join("\n- ")}`);
  return artifact;
}

export function renderArtifact(artifact) {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

export async function writeCoverageArtifact(options = {}) {
  const artifact = await buildCoverageArtifact(options);
  const target = options.outputPath ?? outputPath;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, renderArtifact(artifact), "utf8");
  return { artifact, target };
}

async function loadPlaneManifests(root) {
  const manifests = new Map();
  for (const plane of PLANES) {
    const path = resolve(root, `planes/${plane}/_manifest.txt`);
    const text = await readFile(path, "utf8");
    const entries = new Set(text.split(/\r?\n/).map((line) => line.replace(/#.*/, "").trim()).filter(Boolean).map(portable));
    manifests.set(plane, entries);
  }
  return manifests;
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await walk(path));
    else paths.push(path);
  }
  return paths;
}

function validateOwnership(ownership) {
  const errors = [];
  if (!isObject(ownership)) throw new Error("Ownership policy must be an object");
  if (ownership.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion must be ${SCHEMA_VERSION}`);
  if (!isObject(ownership.defaults)) errors.push("defaults must be an object");
  if (!Array.isArray(ownership.rules)) errors.push("rules must be an array");
  if (!isObject(ownership.overrides)) errors.push("overrides must be an object");
  for (const [index, rule] of (ownership.rules ?? []).entries()) {
    if (!isObject(rule) || !isObject(rule.match) || !isObject(rule.set)) errors.push(`rules[${index}] must contain match and set objects`);
    else {
      for (const key of Object.keys(rule.match)) if (!["scope", "schema", "table", "tablePattern", "ddlPathPattern", "physicalAuthority"].includes(key)) errors.push(`rules[${index}].match.${key} is unsupported`);
      for (const patternKey of ["tablePattern", "ddlPathPattern"]) if (rule.match[patternKey]) try { new RegExp(rule.match[patternKey]); } catch { errors.push(`rules[${index}].match.${patternKey} is not a valid regular expression`); }
    }
  }
  if (errors.length) throw new Error(`DDL service ownership validation failed:\n- ${errors.join("\n- ")}`);
}

function validateOwnershipCoverage(ownership, facts) {
  const errors = [];
  const seenRules = new Map();
  for (const [index, rule] of ownership.rules.entries()) {
    const identity = JSON.stringify(rule.match, Object.keys(rule.match).sort());
    if (seenRules.has(identity)) errors.push(`duplicate ownership rules ${seenRules.get(identity)} and ${index}`);
    else seenRules.set(identity, index);
    if (!facts.some((item) => ruleMatches(rule.match, item))) errors.push(`stale ownership rule ${index}`);
  }
  const validOverrides = new Set(facts.flatMap((item) => [item.tableKey, `${item.scope}:${item.tableKey}`, item.sourceKey]));
  for (const key of Object.keys(ownership.overrides)) {
    if (!validOverrides.has(key)) errors.push(`stale ownership entry ${key}`);
  }
  if (errors.length) throw new Error(`DDL service ownership coverage failed:\n- ${errors.join("\n- ")}`);
}

function ruleMatches(match, facts) {
  const [schema, table] = facts.tableKey.split(".");
  if (match.scope && match.scope !== facts.scope) return false;
  if (match.schema && match.schema !== schema) return false;
  if (match.table && match.table !== table) return false;
  if (match.physicalAuthority && match.physicalAuthority !== facts.physicalAuthority) return false;
  if (match.tablePattern && !new RegExp(match.tablePattern).test(table)) return false;
  if (match.ddlPathPattern && !new RegExp(match.ddlPathPattern).test(facts.ddlPath)) return false;
  return true;
}

function normalizeRow(row) {
  const result = { ...row };
  result.installedPlanes = orderedUnique(result.installedPlanes, PLANES);
  for (const field of EVIDENCE_FIELDS) result[field] = sortedUnique(result[field] ?? []);
  result.commands = clone(result.commands);
  result.commands.codes = sortedUnique(result.commands.codes ?? []);
  return result;
}

function summarize(rows) {
  const classifiedAndOwned = rows.filter((row) => row.reviewStatus === "reviewed").length;
  return {
    tableDeclarations: rows.length,
    classifiedAndOwned,
    coveragePercent: rows.length === 0 ? 100 : Number(((classifiedAndOwned / rows.length) * 100).toFixed(2)),
    byPlane: countValues(rows.map((row) => row.plane)),
    byAuthority: countValues(rows.map((row) => row.physicalAuthority)),
    byClassification: countValues(rows.map((row) => row.classification)),
    byOwner: countValues(rows.map((row) => row.serviceOwner)),
    byRolloutStatus: countValues(rows.map((row) => row.rolloutStatus)),
    reviewRequired: rows.filter((row) => row.reviewStatus !== "reviewed").length,
  };
}

function sourceScope(path) {
  const match = path.match(/^server\/db\/ddl\/(?:common\/|planes\/(studio|neon|mesh)\/)/);
  if (!match) throw new Error(`Cannot determine DDL scope for ${path}`);
  return match[1] ?? "common";
}

function authorityForScope(scope) { return scope === "common" ? "common_plane_local" : scope; }
function canonicalIdentifier(value) { return value.startsWith('"') ? value.slice(1, -1).replace(/""/g, '"').toLowerCase() : value.toLowerCase(); }
function compareRows(a, b) { return PLANES.indexOf(a.plane) - PLANES.indexOf(b.plane) || textCompare(a.tableKey, b.tableKey) || textCompare(a.ddlPath, b.ddlPath); }
function merge(base, extension) { return { ...clone(base), ...clone(extension) }; }
function clone(value) { return structuredClone(value); }
function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function portable(path) { return path.split(sep).join("/"); }
function sortedUnique(values) { return [...new Set(values)].sort(); }
function orderedUnique(values, order) { const set = new Set(values); return order.filter((value) => set.has(value)); }
function assertUnique(values, label) { if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label} detected`); }
function countValues(values) { const result = {}; for (const value of values) result[value] = (result[value] ?? 0) + 1; return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b))); }
function textCompare(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

function requiredString(row, field, at, errors, pattern) {
  const value = row[field];
  if (typeof value !== "string" || value.length === 0) errors.push(`${at}.${field} must be a non-empty string`);
  else if (pattern && !pattern.test(value)) errors.push(`${at}.${field} has an invalid value: ${value}`);
}

function enumValue(row, field, allowed, at, errors) {
  if (!allowed.includes(row[field])) errors.push(`${at}.${field} must be one of ${allowed.join(", ")}`);
}

function stringArray(row, field, at, errors, options = {}) {
  const value = row[field];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) { errors.push(`${at}.${field} must be an array of non-empty strings`); return; }
  if (options.nonEmpty && value.length === 0) errors.push(`${at}.${field} must not be empty`);
  if (new Set(value).size !== value.length) errors.push(`${at}.${field} must not contain duplicates`);
  if (options.allowed && value.some((item) => !options.allowed.includes(item))) errors.push(`${at}.${field} contains an unsupported value`);
}

function validateCommands(commands, at, errors) {
  if (!isObject(commands) || !["supported", "not_exposed"].includes(commands.decision) || !Array.isArray(commands.codes)) { errors.push(`${at} is invalid`); return; }
  if (commands.decision === "supported" && commands.codes.length === 0) errors.push(`${at}.codes must contain at least one command when supported`);
  if (commands.decision === "not_exposed" && (commands.codes.length !== 0 || typeof commands.reason !== "string" || commands.reason.length === 0)) errors.push(`${at} requires an empty codes array and a reason when not_exposed`);
}

async function main() {
  const check = process.argv.includes("--check");
  const artifact = await buildCoverageArtifact();
  const rendered = renderArtifact(artifact);
  if (check) {
    const existing = await readFile(outputPath, "utf8").catch(() => "");
    if (existing !== rendered) {
      console.error(`DDL service coverage is stale. Run: node tooling/tools/scripts/generate-ddl-service-coverage.mjs`);
      process.exitCode = 1;
      return;
    }
    console.log(`DDL service coverage is current (${artifact.rows.length} physical tables).`);
    return;
  }
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, rendered, "utf8");
  console.log(`Wrote ${artifact.rows.length} physical tables to ${portable(relative(repositoryRoot, outputPath))}.`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) main().catch((error) => { console.error(error.stack ?? error.message); process.exitCode = 1; });
