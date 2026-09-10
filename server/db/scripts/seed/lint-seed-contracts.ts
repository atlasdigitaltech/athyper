import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type SeedFinding = {
  ruleId: string;
  line: number;
  message: string;
};

type Contract = {
  contractVersion: string;
  requiredHeaders: string[];
  allowedPlanes: string[];
  allowedTenantScopes: string[];
  allowedDataClasses: string[];
  requiredAssertions: string[];
  provenanceRequiredFields: string[];
  runtimeOnlyRelations: string[];
  reconciliationOnlyRelations: string[];
  legacyRelations: string[];
};

type Baseline = {
  contractVersion: "athyper.seed-contract-baseline.v1";
  files: Record<string, { sourceSha256: string; ruleIds: string[] }>;
};

const repoRoot = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const dbRoot = resolve(repoRoot, "server/db");
const contractPath = resolve(dbRoot, "seed/contracts/base/seed-contract.v1.json");
const baselinePath = resolve(dbRoot, "seed/contracts/base/pre-contract-baseline.v1.json");
const legacyReportPath = resolve(dbRoot, "seed/migration/wave1-legacy-lint-report.v1.json");
const contract = JSON.parse(readFileSync(contractPath, "utf8")) as Contract;

function sha256(source: string): string {
  return createHash("sha256").update(source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n")).digest("hex");
}

function headers(source: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const line of source.split(/\r?\n/, 80)) {
    const match = line.match(/^\s*--\s*([a-z][a-z0-9-]+):\s*(.*?)\s*$/i);
    if (match) result.set(match[1]!.toLowerCase(), match[2]!);
  }
  return result;
}

function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function maskSqlLiteralsAndComments(source: string): string {
  return source.replace(/--[^\r\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'/g, (value) =>
    value.replace(/[^\r\n]/g, " "),
  );
}

function cteNames(source: string): Set<string> {
  const names = new Set<string>();
  for (const match of source.matchAll(/(?:\bwith\b|,)\s*([a-z_][a-z0-9_]*)(?:\s*\([^)]*\))?\s+as\s*(?:materialized\s*)?\(/gi)) {
    names.add(match[1]!.toLowerCase());
  }
  return names;
}

function insertSegments(source: string): Array<{ index: number; text: string }> {
  const matches = [...source.matchAll(/\binsert\s+into\b/gi)];
  return matches.map((match, index) => ({
    index: match.index!,
    text: source.slice(match.index!, matches[index + 1]?.index ?? source.length),
  }));
}

function writeRelations(source: string): Array<{ match: RegExpExecArray; relation: string }> {
  const pattern = /\b(insert\s+into|update(?!\s+set\b)|delete\s+from|merge\s+into|copy|truncate(?:\s+table)?)\s+(?:only\s+)?(?:"([a-z_][a-z0-9_]*)"|([a-z_][a-z0-9_]*))\s*\.\s*(?:"([a-z_][a-z0-9_]*)"|([a-z_][a-z0-9_]*))/gi;
  return [...source.matchAll(pattern)].map((match) => ({
    match,
    relation: `${match[2] ?? match[3]}.${match[4] ?? match[5]}`.toLowerCase(),
  }));
}

export function lintSeedSource(source: string, file = "seed.sql", activeContract: Contract = contract): SeedFinding[] {
  const findings: SeedFinding[] = [];
  const structuralSql = maskSqlLiteralsAndComments(source);
  const metadata = headers(source);
  const newlineOffsets: number[] = [];
  for (let index = source.indexOf("\n"); index >= 0; index = source.indexOf("\n", index + 1)) {
    newlineOffsets.push(index);
  }
  const lineAt = (index: number): number => {
    let low = 0;
    let high = newlineOffsets.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (newlineOffsets[middle]! < index) low = middle + 1;
      else high = middle;
    }
    return low + 1;
  };
  const add = (ruleId: string, match: RegExpMatchArray | RegExpExecArray | null, message: string) => {
    findings.push({
      ruleId,
      line: match?.index === undefined ? 1 : lineAt(match.index),
      message,
    });
  };

  const encodingCorruption = source.match(/\uFFFD|\?\?/u);
  if (encodingCorruption) {
    add(
      "content.encoding-corruption",
      encodingCorruption,
      "seed text contains a Unicode replacement character or suspicious '???' sequence",
    );
  }

  for (const key of activeContract.requiredHeaders) {
    if (!metadata.has(key)) add("metadata.missing", null, `missing required header '${key}'`);
  }
  if (metadata.get("seed-contract-version") !== "1") {
    add("metadata.contract-version", null, "seed-contract-version must equal 1");
  }
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(metadata.get("seed-pack-version") ?? "")) {
    add("metadata.pack-version", null, "seed-pack-version must be semantic versioning");
  }
  if (!activeContract.allowedPlanes.includes(metadata.get("seed-plane") ?? "")) {
    add("metadata.plane", null, `seed-plane must be one of ${activeContract.allowedPlanes.join(", ")}`);
  }
  if (!activeContract.allowedTenantScopes.includes(metadata.get("seed-tenant-scope") ?? "")) {
    add("metadata.tenant-scope", null, `seed-tenant-scope must be one of ${activeContract.allowedTenantScopes.join(", ")}`);
  }
  if (!activeContract.allowedDataClasses.includes(metadata.get("seed-data-class") ?? "")) {
    add("metadata.data-class", null, `seed-data-class must be one of ${activeContract.allowedDataClasses.join(", ")}`);
  }

  const provenanceText = metadata.get("seed-provenance");
  if (provenanceText) {
    try {
      const provenance = JSON.parse(provenanceText) as Record<string, unknown>;
      for (const key of activeContract.provenanceRequiredFields) {
        if (typeof provenance[key] !== "string" || String(provenance[key]).trim() === "") {
          add("metadata.provenance", null, `seed-provenance requires non-empty '${key}'`);
        }
      }
      if (typeof provenance.retrieved_at === "string" && !/^\d{4}-\d{2}-\d{2}$/.test(provenance.retrieved_at)) {
        add("metadata.provenance", null, "seed-provenance.retrieved_at must use YYYY-MM-DD");
      }
    } catch {
      add("metadata.provenance", null, "seed-provenance must be valid single-line JSON");
    }
  }

  const assertions = new Set((metadata.get("seed-assertions") ?? "").split(",").map((value) => value.trim()).filter(Boolean));
  for (const assertion of activeContract.requiredAssertions) {
    if (!assertions.has(assertion)) add("metadata.assertions", null, `seed-assertions must include '${assertion}'`);
    const marker = new RegExp(`--\\s*seed-assertion:\\s*${escaped(assertion)}\\b`, "i");
    if (!marker.test(source)) add("assertion.marker", null, `missing SQL marker for '${assertion}'`);
  }
  if (!/\braise\s+exception\b/i.test(source)) {
    add("assertion.failure", null, "seed assertions and scope guards must fail with RAISE EXCEPTION");
  }

  const expected = metadata.get("seed-expected-row-count") ?? "";
  if (!/^(?:exact|minimum):\d+$|^query:[a-z][a-z0-9_.-]+$/i.test(expected)) {
    add("metadata.expected-count", null, "seed-expected-row-count must be exact:N, minimum:N, or query:identifier");
  }
  const naturalKey = metadata.get("seed-natural-key") ?? "";
  if (!/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*\([a-z0-9_, ]+\)(?:;[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*\([a-z0-9_, ]+\))*$/i.test(naturalKey)) {
    add("identity.natural-key", null, "seed-natural-key must declare schema.table(columns), separated by semicolons when needed");
  }
  const crossFileIds = metadata.get("seed-cross-file-ids");
  if (!new Set(["true", "false"]).has(crossFileIds ?? "")) {
    add("identity.cross-file", null, "seed-cross-file-ids must be true or false");
  }
  const idStrategy = metadata.get("seed-id-strategy") ?? "";
  if (!/^(?:natural-key-only|database-generated|deterministic-uuid:[a-z][a-z0-9_.:-]+)$/i.test(idStrategy)) {
    add("identity.strategy", null, "seed-id-strategy is invalid");
  }
  if (crossFileIds === "true" && !idStrategy.startsWith("deterministic-uuid:")) {
    add("identity.deterministic", null, "cross-file IDs require deterministic-uuid:<immutable-namespace>");
  }

  if (!/current_setting\s*\(\s*'app\.database_plane'\s*,\s*true\s*\)/i.test(source)) {
    add("scope.plane-assertion", null, "seed must assert app.database_plane before data changes");
  }
  if (metadata.get("seed-tenant-scope") === "tenant") {
    if (!/current_setting\s*\(\s*'app\.seed_tenant_id'\s*,\s*true\s*\)/i.test(source)) {
      add("scope.tenant-assertion", null, "tenant seed must resolve app.seed_tenant_id");
    }
    if (!/\braise\s+exception\b/i.test(source)) {
      add("scope.tenant-assertion", null, "tenant seed must reject a missing or invalid tenant");
    }
  }
  const hardcodedTenant = source.match(/(?:app\.seed_tenant_id|\btenant_id)\s*(?:=|:=|,)\s*'([0-9a-f]{8}-[0-9a-f-]{27})'/i)
    ?? source.match(/set_config\s*\(\s*'app\.seed_tenant_id'\s*,\s*'[0-9a-f-]{36}'/i)
    ?? source.match(/insert\s+into\s+[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*\s*\([^)]*\btenant_id\b[^)]*\)\s*(?:overriding\s+\w+\s+value\s*)?values\s*\([^)]*'(?!00000000-0000-0000-0000-000000000000)[0-9a-f]{8}-[0-9a-f-]{27}'/i);
  if (hardcodedTenant) add("scope.hardcoded-tenant", hardcodedTenant, "hard-coded tenant identifiers are prohibited");

  const forbiddenDdl = structuralSql.match(/\b(?:create|alter|drop)\s+(?:or\s+replace\s+)?(?:table|policy|trigger|function|procedure|domain|type|schema|index|extension)\b/i)
    ?? structuralSql.match(/\balter\s+table\b[^;]*\b(?:enable|force|disable)\s+row\s+level\s+security\b/i)
    ?? structuralSql.match(/\bgrant\s+|\brevoke\s+/i);
  if (forbiddenDdl) add("structure.forbidden-ddl", forbiddenDdl, "seed packs cannot contain DDL, policies, triggers, grants, or table creation");

  const destructive = structuralSql.match(/\bdelete\s+from\b/i) ?? structuralSql.match(/\btruncate(?:\s+table)?\b/i);
  if (destructive) add("lifecycle.destructive-delete", destructive, "retire obsolete values through status/effectivity; DELETE/TRUNCATE is prohibited");

  const runtimeOnly = new Set(activeContract.runtimeOnlyRelations.map((relation) => relation.toLowerCase()));
  const reconciliationOnly = new Set(activeContract.reconciliationOnlyRelations.map((relation) => relation.toLowerCase()));
  for (const write of writeRelations(structuralSql)) {
    if (runtimeOnly.has(write.relation)) {
      add(
        "runtime-only.authorization-write",
        write.match,
        `${write.relation} is runtime-managed authorization state and cannot be written by a production seed`,
      );
    }
    if (reconciliationOnly.has(write.relation)) {
      add(
        "runtime-only.application-projection-write",
        write.match,
        `${write.relation} must be produced by the Studio-to-plane reconciliation path; static seed writes are prohibited`,
      );
    }
  }

  const ctes = cteNames(structuralSql);
  const relationPattern = /\b(?:insert\s+into|update(?!\s+set\b)|delete\s+from|merge\s+into|from|join)\s+(?:only\s+)?(?:lateral\s+)?((?!lateral\b)[a-z_][a-z0-9_.]*)\b/gi;
  for (const match of structuralSql.matchAll(relationPattern)) {
    const name = match[1]!.toLowerCase();
    if (!name.includes(".") && !ctes.has(name) && !["excluded", "values"].includes(name)) {
      add("relation.unqualified", match, `relation '${name}' must be schema-qualified or declared as a CTE`);
    }
  }

  for (const relation of activeContract.legacyRelations) {
    const match = structuralSql.match(new RegExp(`\\b${escaped(relation)}\\b`, "i"));
    if (match) add("relation.legacy-name", match, `legacy relation '${relation}' is prohibited by the new DDL contract`);
  }

  for (const segment of insertSegments(structuralSql)) {
    if (!/\bon\s+conflict\s*\([^)]+\)/i.test(segment.text)) {
      add("convergence.conflict-target", { 0: "", index: segment.index, input: source, groups: undefined, length: 1 } as RegExpExecArray,
        "every insert requires an explicit natural-key conflict target");
      continue;
    }
    // Membership rows have no mutable payload: the entire non-audit row is
    // its natural key. DO NOTHING preserves creation evidence on replay.
    // Keep this exception structural and restricted to the declared key-only table.
    const membership = segment.text.match(/^insert\s+into\s+control\.owner_type_purpose\s*\(([^)]+)\)/i);
    const membershipKeys = ["owner_type_id", "capability", "purpose_code"];
    const conflictKeys = segment.text.match(/on\s+conflict\s*\(([^)]+)\)/i)?.[1]?.split(",").map(key => key.trim().toLowerCase());
    const keyOnlyMembership = Boolean(membership && membership[1]!.split(",").every(column => [...membershipKeys,"created_at","created_by"].includes(column.trim().toLowerCase())) && conflictKeys?.length === 3 && membershipKeys.every(key => conflictKeys.includes(key)));
    if (!keyOnlyMembership && /\bon\s+conflict\b[\s\S]*?\bdo\s+nothing\b/i.test(segment.text)) {
      add("convergence.do-nothing", { 0: "", index: segment.index, input: source, groups: undefined, length: 1 } as RegExpExecArray,
        "production seed convergence must update seed-owned drift, not DO NOTHING");
    }
    if (/\bdo\s+update\s+set\b/i.test(segment.text)) {
      if (!/\bis\s+distinct\s+from\b/i.test(segment.text)) {
        add("convergence.no-op-update", { 0: "", index: segment.index, input: source, groups: undefined, length: 1 } as RegExpExecArray,
          "DO UPDATE requires a WHERE ... IS DISTINCT FROM guard");
      }
      const updateSet = segment.text.match(/\bdo\s+update\s+set\b([\s\S]*?)(?:\bwhere\b|;|$)/i)?.[1] ?? "";
      if (/\bcreated_(?:at|by)\s*=/i.test(updateSet)) {
        add("convergence.created-audit", { 0: "", index: segment.index, input: source, groups: undefined, length: 1 } as RegExpExecArray,
          "conflict updates must preserve created_at and created_by");
      }
    }
  }

  if (metadata.get("seed-data-class") === "production_reference") {
    if (metadata.get("seed-demo-data") !== "false") {
      add("fixture.production-demo-flag", null, "production_reference requires seed-demo-data: false");
    }
    const demo = source.match(/\b(?:demo_tenant|test_tenant|example_tenant|technostat|cirrusatlantic)\b|[a-z0-9._%+-]+@example\.(?:com|org|net)/i);
    if (demo) add("fixture.production-demo-data", demo, "production reference seed contains a demo/test/customer fixture marker");
  }

  return findings.sort((a, b) => a.line - b.line || a.ruleId.localeCompare(b.ruleId));
}

async function filesUnder(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else if (entry.isFile() && entry.name.endsWith(".sql")) files.push(path);
  }
  return files;
}

async function strictSeedFiles(): Promise<string[]> {
  const packFiles = await filesUnder(resolve(dbRoot, "seed/packs"));
  const ddlFiles = [
    ...await filesUnder(resolve(dbRoot, "ddl/common")),
    ...await filesUnder(resolve(dbRoot, "ddl/planes")),
  ].filter((path) => /^12.*seed\.sql$/i.test(basename(path)));
  return [...new Set([...packFiles, ...ddlFiles])].sort();
}

async function legacySeedFiles(): Promise<string[]> {
  return [
    ...await filesUnder(resolve(dbRoot, "seed/blueprints")),
    ...await filesUnder(resolve(dbRoot, "seed/platform")),
  ].filter((path) => !path.replaceAll("\\", "/").includes("/seed/platform/003_control/"));
}

function repoPath(path: string): string {
  return relative(repoRoot, path).replaceAll("\\", "/");
}

async function analyze(files: string[]) {
  return Promise.all(files.sort().map(async (path) => {
    const source = await readFile(path, "utf8");
    return { path: repoPath(path), sourceSha256: sha256(source), findings: lintSeedSource(source, repoPath(path)) };
  }));
}

function summary(results: Awaited<ReturnType<typeof analyze>>) {
  const all = results.flatMap((result) => result.findings);
  return {
    files: results.length,
    filesWithFindings: results.filter((result) => result.findings.length > 0).length,
    findings: all.length,
    byRule: Object.fromEntries(
      [...new Set(all.map((item) => item.ruleId))].sort()
        .map((ruleId) => [ruleId, all.filter((item) => item.ruleId === ruleId).length]),
    ),
  };
}

async function main(): Promise<void> {
  const writeBaseline = process.argv.includes("--write-baseline");
  const legacyReport = process.argv.includes("--legacy-report");
  const files = legacyReport ? await legacySeedFiles() : await strictSeedFiles();
  const results = await analyze(files);

  if (legacyReport) {
    const report = {
      contractVersion: "athyper.seed-contract-legacy-report.v1",
      contract: repoPath(contractPath),
      scope: "Wave 0 legacy seeds excluding platform/003_control",
      summary: summary(results),
      files: results.filter((result) => result.findings.length > 0),
    };
    await writeFile(legacyReportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`Legacy report written to ${repoPath(legacyReportPath)}`);
    console.log(JSON.stringify(report.summary, null, 2));
    return;
  }

  if (writeBaseline) {
    const baseline: Baseline = {
      contractVersion: "athyper.seed-contract-baseline.v1",
      files: Object.fromEntries(results
        .filter((result) => result.findings.length > 0)
        .map((result) => [result.path, {
          sourceSha256: result.sourceSha256,
          ruleIds: [...new Set(result.findings.map((item) => item.ruleId))].sort(),
        }])),
    };
    await writeFile(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
    console.log(`Pre-contract baseline written for ${Object.keys(baseline.files).length} files.`);
    return;
  }

  const baseline = JSON.parse(await readFile(baselinePath, "utf8")) as Baseline;
  const failures: typeof results = [];
  for (const result of results) {
    if (result.findings.length === 0) continue;
    const accepted = baseline.files[result.path];
    const ruleIds = [...new Set(result.findings.map((item) => item.ruleId))].sort();
    if (!accepted || accepted.sourceSha256 !== result.sourceSha256
        || ruleIds.some((ruleId) => !accepted.ruleIds.includes(ruleId))) {
      failures.push(result);
    }
  }
  const staleBaseline = Object.keys(baseline.files).filter((path) => !results.some((result) => result.path === path));
  if (failures.length > 0 || staleBaseline.length > 0) {
    for (const result of failures) {
      console.error(`\n${result.path} (${result.findings.length} finding(s))`);
      for (const item of result.findings) console.error(`  ${item.line} [${item.ruleId}] ${item.message}`);
    }
    for (const path of staleBaseline) console.error(`\n${path}: stale baseline entry; file no longer exists in strict scope`);
    throw new Error(`${failures.length} changed/new seed file(s) violate ${contract.contractVersion}; ${staleBaseline.length} stale baseline entr${staleBaseline.length === 1 ? "y" : "ies"}`);
  }
  console.log(`Seed contract lint passed: ${results.length} files checked, ${Object.keys(baseline.files).length} unchanged pre-contract files baseline-bound.`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) await main();
