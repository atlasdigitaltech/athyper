import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Disposition = "move" | "merge" | "rewrite" | "retire" | "blocked";
type DataClass = "production_reference" | "test_fixture" | "validation_only";
type Plane = "common" | "athyper" | "neon" | "mesh" | "unresolved";

type RelationTarget = {
  sourceRelation: string;
  sourceSchema: string;
  sourceTable: string;
  targetRelation: string | null;
  targetSchema: string | null;
  targetTable: string | null;
  planes: Plane[];
  ddlLocations: string[];
  mapping: "exact" | "renamed" | "unresolved";
};

type LedgerEntry = {
  sourceFile: string;
  sourceSha256: string;
  logicalDataset: string;
  datasetVersion: string;
  dataClass: DataClass;
  disposition: Disposition;
  dispositionReasons: string[];
  targets: RelationTarget[];
  dependencies: {
    declared: string[];
    immediatePredecessor: string | null;
  };
  execution: {
    group: string;
    order: number;
    sortKey: string;
  };
  expectedRowCount: {
    status: "pending_capture" | "captured" | "not_applicable";
    value: number | null;
    method: string;
  };
  naturalKeys: {
    status: "inferred" | "pending_review" | "reviewed" | "not_applicable";
    candidates: string[];
  };
  migrationControl: {
    targetReceipt: string | null;
    targetReceiptStatus: "pending" | "complete";
    validationStatus: "pending" | "passed" | "failed";
    deletionEligible: boolean;
  };
};

type ReviewOverride = Partial<Pick<LedgerEntry,
  | "logicalDataset"
  | "datasetVersion"
  | "dataClass"
  | "disposition"
  | "dispositionReasons"
  | "targets"
  | "expectedRowCount"
  | "naturalKeys"
  | "migrationControl"
>>;

type ReviewFile = {
  contractVersion: "seed-migration.wave0-review.v1";
  entries: Record<string, ReviewOverride>;
};

const repoRoot = resolve(fileURLToPath(new URL("../../../../", import.meta.url)));
const dbRoot = resolve(repoRoot, "server/db");
const outputPath = resolve(dbRoot, "seed/migration/migration-ledger.v1.json");
const reviewPath = resolve(dbRoot, "seed/migration/migration-review.v1.json");
const checkOnly = process.argv.includes("--check");

const sourceRoots = [
  resolve(dbRoot, "seed/blueprints"),
  resolve(dbRoot, "seed/platform"),
  resolve(dbRoot, "ddl/common/shared/reference-data"),
];

function ledgerSourcePath(file: string): string {
  const movedRoot = resolve(dbRoot, "ddl/common/shared/reference-data");
  if (dirname(file) === movedRoot && file.endsWith(".sql")) {
    return resolve(dbRoot, "seed/platform/001_global_reference", basename(file));
  }
  return file;
}

const renamedRelations: Record<string, string | null> = {
  "shared.workspace": "master.workspace",
  "shared.module": "master.module",
  "shared.subscription_plan": "control.subscription_plan",
  "master.owner_type": "control.owner_type",
  "master.auth_plane_membership": "authz.plane_membership",
  "master.auth_scope_target": "authz.scope_target",
  "master.auth_role": "authz.role",
  "master.auth_role_permission": "authz.role_permission",
  "master.auth_group": "authz.principal_group",
  "master.auth_group_member": "authz.group_member",
  "master.auth_group_role": "authz.group_role",
  "control.acct_profile_config": "control.accounting_profile_policy",
  "control.acct_profile_event": "control.accounting_profile_event",
  "control.acct_profile_entry_template": "control.accounting_profile_entry",
  "control.acct_profile_book_rule": "control.accounting_profile_assignment",
  "control.acct_profile_commitment_config": "control.accounting_profile_assignment",
  "control.acct_profile_dimension_rule": "control.accounting_profile_assignment",
  "control.acct_profile_settlement_config": "control.accounting_profile_assignment",
  "control.intent_to_accounting_profile_rule": "control.accounting_profile_assignment",
  "control.payment_settlement_rule": "control.accounting_profile_assignment",
  "control.asset_class_book_policy_template": "control.asset_class_book_policy",
  "control.commodity_classification_config": "control.commodity_code_classification_policy",
  "control.commodity_classification_to_intent_rule": "control.commodity_code_classification_policy",
  "control.commodity_code_to_category_rule": "control.commodity_code_classification_policy",
  "master.commodity_classification": "control.commodity_code_classification_policy",
  "governance.cycle_type": "control.cycle_type",
  "governance.cycle_phase": "control.cycle_phase",
  "governance.cycle_task_category": "control.cycle_task_category",
  "governance.cycle_task_template": "control.cycle_task_template",
  "governance.cycle_task_dependency": "control.cycle_task_dependency",
  "governance.cycle_carryforward_rule": "control.cycle_carryforward_rule",
  "governance.cycle_cross_dependency": "control.cycle_cross_dependency",
  // These require a Control Table design decision and therefore stay unresolved.
  "control.blueprint_registry": null,
  "control.blueprint_tenant_application": null,
  "control.auth_permission_seed_staging": "authz.permission",
  "control.posting_role_alias": null,
  "master.change_reason_code": null,
  "master.party_governance_relation": null,
};

async function filesUnder(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (path.includes(`${resolve(dbRoot, "seed/platform/003_control")}`)) continue;
      files.push(...await filesUnder(path));
    } else if (entry.isFile() && entry.name.endsWith(".sql")) {
      files.push(path);
    }
  }
  return files;
}

function repoPath(path: string): string {
  return relative(repoRoot, path).replaceAll("\\", "/");
}

function sha256(source: Buffer | string): string {
  return createHash("sha256").update(source).digest("hex");
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function sqlRelations(source: string): string[] {
  const relations: string[] = [];
  const pattern = /\b(?:insert\s+into|update|delete\s+from|truncate(?:\s+table)?|merge\s+into|create\s+table(?:\s+if\s+not\s+exists)?|alter\s+table)\s+(?:only\s+)?([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/gi;
  for (const match of source.matchAll(pattern)) relations.push(match[1]!.toLowerCase());
  return unique(relations);
}

function readRelations(source: string): string[] {
  const relations: string[] = [];
  for (const match of source.matchAll(/\b(?:from|join)\s+(?:only\s+)?([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/gi)) {
    relations.push(match[1]!.toLowerCase());
  }
  return unique(relations);
}

function naturalKeys(source: string): string[] {
  const keys: string[] = [];
  for (const match of source.matchAll(/on\s+conflict\s*\(([^)]+)\)/gi)) {
    const columns = match[1]!
      .split(",")
      .map((column) => column.trim().replaceAll('"', ""))
      .filter((column) => /^[a-z_][a-z0-9_]*$/i.test(column));
    if (columns.length > 0) keys.push(columns.join("+"));
  }
  return unique(keys);
}

function declaredDependencies(source: string): string[] {
  const dependencies: string[] = [];
  const pathPattern = /(?:server\/db\/seed\/|seed\/)?((?:blueprints|platform)\/[a-zA-Z0-9_./-]+\.sql)/g;
  for (const match of source.replaceAll("\\", "/").matchAll(pathPattern)) {
    dependencies.push(`server/db/seed/${match[1]}`);
  }
  return unique(dependencies);
}

function dataClass(path: string): DataClass {
  if (/\/998_canonical_neon_authority\.sql$/i.test(path)) return "test_fixture";
  if (/\/990_validation\/|\/verify\.sql$/i.test(path)) return "validation_only";
  return "production_reference";
}

function datasetVersion(source: string): string {
  return source.match(/^\s*--\s*seed-pack-version:\s*([^\s]+)\s*$/mi)?.[1]
    ?? source.match(/["']version["']\s*[,=:]\s*["']([^"']+)["']/i)?.[1]
    ?? "legacy-v1";
}

function logicalDataset(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const marker = normalized.includes("/seed/blueprints/")
    ? "/seed/blueprints/"
    : "/seed/platform/";
  const tail = normalized.split(marker)[1]!.replace(/\.sql$/, "");
  return tail
    .split("/")
    .map((segment) => segment.replace(/^\d+[a-z]?_?/, ""))
    .filter(Boolean)
    .join(".");
}

function executionGroup(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  if (normalized.includes("/platform/000_bootstrap/")) return "platform.bootstrap";
  if (normalized.includes("/platform/000_lookups/")) return "platform.lookups";
  if (normalized.includes("/platform/001_global_reference/")) return "platform.global_reference";
  if (normalized.includes("/platform/003_master/")) return "platform.master_reference";
  if (normalized.includes("/platform/006_system_tenant/")) return "platform.system_tenant";
  if (normalized.includes("/blueprints/universal/")) return "blueprint.universal";
  if (normalized.includes("/blueprints/industry/")) return "blueprint.industry";
  return "blueprint.module";
}

const executionGroupRank: Record<string, number> = {
  "platform.bootstrap": 10,
  "platform.lookups": 20,
  "platform.global_reference": 30,
  "platform.master_reference": 40,
  "platform.system_tenant": 50,
  "blueprint.universal": 70,
  "blueprint.industry": 80,
  "blueprint.module": 90,
};

type DdlMap = Map<string, string[]>;

async function buildDdlMap(): Promise<DdlMap> {
  const ddlMap: DdlMap = new Map();
  const roots = [resolve(dbRoot, "ddl/common"), resolve(dbRoot, "ddl/planes")];
  for (const root of roots) {
    for (const file of await filesUnder(root)) {
      const source = await readFile(file, "utf8");
      const pattern = /create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(?:only\s+)?([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/gi;
      for (const match of source.matchAll(pattern)) {
        const relation = match[1]!.toLowerCase();
        const locations = ddlMap.get(relation) ?? [];
        locations.push(repoPath(file));
        ddlMap.set(relation, unique(locations));
      }
    }
  }
  return ddlMap;
}

function planesForLocations(locations: string[]): Plane[] {
  const planes: Plane[] = [];
  if (locations.some((path) => path.includes("/ddl/common/"))) planes.push("common");
  if (locations.some((path) => path.includes("/ddl/planes/athyper/"))) planes.push("athyper");
  if (locations.some((path) => path.includes("/ddl/planes/neon/"))) planes.push("neon");
  if (locations.some((path) => path.includes("/ddl/planes/mesh/"))) planes.push("mesh");
  return planes.length > 0 ? planes : ["unresolved"];
}

function sourcePlaneOverride(path: string): Plane[] | null {
  const normalized = path.replaceAll("\\", "/");
  if (normalized.includes("/seed/blueprints/")) return ["neon"];
  if (normalized.includes("/001_global_reference/")) return ["common"];
  if (normalized.includes("/003_master/002_party_risk_registry.sql")) return ["neon"];
  if (normalized.includes("/003_master/003_certification_type.sql")) return ["neon", "mesh"];
  if (normalized.includes("/003_master/004_condition_type.sql")) return ["neon"];
  if (normalized.includes("/006_system_tenant/")) return ["athyper"];
  if (normalized.includes("/000_lookups/LookupDomain/document/")) return ["neon"];
  if (normalized.includes("/000_lookups/LookupDomain/finance/")) return ["neon"];
  if (normalized.includes("/000_lookups/LookupDomain/master/")) return ["neon"];
  if (normalized.includes("/000_lookups/LookupDomain/control/")) return ["unresolved"];
  if (normalized.includes("/000_lookups/")) return ["common"];
  return null;
}

function targetsFor(path: string, relations: string[], ddlMap: DdlMap): RelationTarget[] {
  const override = sourcePlaneOverride(path);
  return relations.map((sourceRelation) => {
    const hasRename = Object.hasOwn(renamedRelations, sourceRelation);
    const targetRelation = hasRename ? renamedRelations[sourceRelation]! : sourceRelation;
    const locations = targetRelation ? ddlMap.get(targetRelation) ?? [] : [];
    const planes = override ?? planesForLocations(locations);
    const [sourceSchema, sourceTable] = sourceRelation.split(".") as [string, string];
    const [targetSchema, targetTable] = targetRelation?.split(".") as [string, string] | undefined ?? [null, null];
    return {
      sourceRelation,
      sourceSchema,
      sourceTable,
      targetRelation,
      targetSchema,
      targetTable,
      planes,
      ddlLocations: locations,
      mapping: targetRelation === null || locations.length === 0
        ? "unresolved"
        : hasRename ? "renamed" : "exact",
    };
  });
}

function dispositionFor(path: string, source: string, targets: RelationTarget[], klass: DataClass): {
  disposition: Disposition;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (klass === "validation_only") return { disposition: "move", reasons: ["validation-only SQL moves with its owning pack"] };

  const normalized = path.replaceAll("\\", "/");
  const containsPermanentDdl = /create\s+table|alter\s+table|create\s+policy|enable\s+row\s+level\s+security/i.test(source);
  const unresolved = targets.some((target) => target.mapping === "unresolved" || target.planes.includes("unresolved"));
  const renamed = targets.some((target) => target.mapping === "renamed");

  if (/\/000_lookups\/LookupDomain\/control\//.test(normalized)) {
    return {
      disposition: "blocked",
      reasons: ["lookup consumer-plane ownership must be classified before movement"],
    };
  }
  if (targets.some((target) => target.sourceRelation.startsWith("control.blueprint_"))) {
    return {
      disposition: "blocked",
      reasons: ["blueprint catalogue/application receipt awaits the Control Table contract"],
    };
  }
  if (unresolved) reasons.push("one or more legacy write targets have no proven new-DDL destination");
  if (containsPermanentDdl) reasons.push("permanent DDL must be removed from the seed and represented in DDL layers 02-11");
  if (renamed) reasons.push("legacy relations map to remodeled new-DDL relations");
  if (/\/000_bootstrap\//.test(normalized) || /\/003_master\/001_owner_type\.sql$/.test(normalized)
      || /\/003_master\/003_certification_type\.sql$/.test(normalized)) {
    reasons.push("dataset overlaps an existing layer-12 reference seed and must be reconciled");
    return { disposition: unresolved || containsPermanentDdl ? "blocked" : "merge", reasons };
  }
  if (unresolved) return { disposition: "blocked", reasons };
  if (containsPermanentDdl || renamed) return { disposition: "rewrite", reasons };
  return { disposition: "move", reasons: ["write targets exist in the new DDL with unchanged relation names"] };
}

function applyReview(entry: LedgerEntry, override: ReviewOverride | undefined): LedgerEntry {
  if (!override) return entry;
  return {
    ...entry,
    ...override,
    expectedRowCount: { ...entry.expectedRowCount, ...override.expectedRowCount },
    naturalKeys: { ...entry.naturalKeys, ...override.naturalKeys },
    migrationControl: { ...entry.migrationControl, ...override.migrationControl },
  };
}

function validateDeletionGate(entry: LedgerEntry): void {
  if (!entry.migrationControl.deletionEligible) return;
  const complete = entry.migrationControl.targetReceiptStatus === "complete"
    && entry.migrationControl.validationStatus === "passed"
    && entry.migrationControl.targetReceipt !== null
    && entry.expectedRowCount.status !== "pending_capture"
    && !["pending_review", "inferred"].includes(entry.naturalKeys.status);
  if (!complete) {
    throw new Error(`${entry.sourceFile}: deletionEligible requires a target receipt, captured count, reviewed key, and passed validation`);
  }
}

async function main(): Promise<void> {
  const ddlMap = await buildDdlMap();
  const review = JSON.parse(await readFile(reviewPath, "utf8")) as ReviewFile;
  if (review.contractVersion !== "seed-migration.wave0-review.v1") {
    throw new Error(`Unsupported review contract: ${review.contractVersion}`);
  }
  const files = (await Promise.all(sourceRoots.map(filesUnder))).flat().sort((a, b) => {
    const ledgerA = ledgerSourcePath(a);
    const ledgerB = ledgerSourcePath(b);
    const rank = executionGroupRank[executionGroup(ledgerA)] - executionGroupRank[executionGroup(ledgerB)];
    return rank || repoPath(ledgerA).localeCompare(repoPath(ledgerB));
  });
  const predecessorByDirectory = new Map<string, string>();
  const entries: LedgerEntry[] = [];
  const previousLedger = JSON.parse(
    await readFile(outputPath, "utf8").catch(() => '{"entries":[]}'),
  ) as { entries?: LedgerEntry[] };
  const previousEntries = new Map(
    (previousLedger.entries ?? []).map((entry) => [entry.sourceFile, entry]),
  );

  for (const [index, file] of files.entries()) {
    const ledgerFile = ledgerSourcePath(file);
    const sourceBuffer = await readFile(file);
    const source = sourceBuffer.toString("utf8");
    const sourceFile = repoPath(ledgerFile);
    const klass = dataClass(sourceFile);
    const writeOrDdlRelations = sqlRelations(source);
    const relations = klass === "validation_only" && writeOrDdlRelations.length === 0
      ? readRelations(source)
      : writeOrDdlRelations;
    const targets = targetsFor(ledgerFile, relations, ddlMap);
    const disposition = dispositionFor(ledgerFile, source, targets, klass);
    const keys = naturalKeys(source);
    const directory = dirname(sourceFile);
    const predecessor = predecessorByDirectory.get(directory) ?? null;
    predecessorByDirectory.set(directory, sourceFile);

    const permanentDdlOnly = !/\b(?:insert\s+into|update|delete\s+from|truncate(?:\s+table)?|merge\s+into)\b/i.test(source)
      && /create\s+table|alter\s+table|create\s+policy|enable\s+row\s+level\s+security/i.test(source);
    const entry: LedgerEntry = {
      sourceFile,
      sourceSha256: sha256(sourceBuffer),
      logicalDataset: logicalDataset(ledgerFile),
      datasetVersion: datasetVersion(source),
      dataClass: klass,
      disposition: disposition.disposition,
      dispositionReasons: disposition.reasons,
      targets,
      dependencies: {
        declared: declaredDependencies(source).filter((dependency) => dependency !== sourceFile),
        immediatePredecessor: predecessor,
      },
      execution: {
        group: executionGroup(ledgerFile),
        order: index + 1,
        sortKey: sourceFile,
      },
      expectedRowCount: klass === "validation_only" || permanentDdlOnly
        ? { status: "not_applicable", value: null, method: permanentDdlOnly
          ? "DDL-only legacy file does not own rows"
          : "validation-only SQL does not own rows" }
        : { status: "pending_capture", value: null, method: "capture natural-key count from the legacy seed baseline" },
      naturalKeys: klass === "validation_only" || permanentDdlOnly
        ? { status: "not_applicable", candidates: [] }
        : { status: keys.length > 0 ? "inferred" : "pending_review", candidates: keys },
      migrationControl: {
        targetReceipt: null,
        targetReceiptStatus: "pending",
        validationStatus: "pending",
        deletionEligible: false,
      },
    };
    const reviewedEntry = applyReview(entry, review.entries[sourceFile]);
    validateDeletionGate(reviewedEntry);
    entries.push(reviewedEntry);
  }

  const discoveredSources = new Set(entries.map((entry) => entry.sourceFile));
  const unknownReviews: string[] = [];
  for (const sourceFile of Object.keys(review.entries).filter((path) => !discoveredSources.has(path))) {
    const prior = previousEntries.get(sourceFile);
    const reviewedPrior = prior && applyReview(prior, review.entries[sourceFile]);
    if (!reviewedPrior?.migrationControl.deletionEligible) {
      unknownReviews.push(sourceFile);
      continue;
    }
    validateDeletionGate(reviewedPrior);
    entries.push(reviewedPrior);
  }
  if (unknownReviews.length > 0) {
    throw new Error(`Review file contains unknown sources: ${unknownReviews.join(", ")}`);
  }

  entries.sort((a, b) => a.execution.order - b.execution.order || a.sourceFile.localeCompare(b.sourceFile));

  const summary = {
    sourceFiles: entries.length,
    byDisposition: Object.fromEntries(
      (["move", "merge", "rewrite", "retire", "blocked"] as Disposition[])
        .map((value) => [value, entries.filter((entry) => entry.disposition === value).length]),
    ),
    byDataClass: Object.fromEntries(
      (["production_reference", "test_fixture", "validation_only"] as DataClass[])
        .map((value) => [value, entries.filter((entry) => entry.dataClass === value).length]),
    ),
    expectedRowCountPending: entries.filter((entry) => entry.expectedRowCount.status === "pending_capture").length,
    naturalKeyReviewPending: entries.filter((entry) => entry.naturalKeys.status === "pending_review").length,
    targetReceiptsPending: entries.filter((entry) => entry.migrationControl.targetReceiptStatus === "pending").length,
    deletionEligible: entries.filter((entry) => entry.migrationControl.deletionEligible).length,
  };
  const ledgerWithoutHash = {
    contractVersion: "seed-migration.wave0-ledger.v1",
    scope: {
      included: ["server/db/seed/blueprints/**/*.sql", "server/db/seed/platform/**/*.sql"],
      excluded: ["server/db/seed/platform/003_control/**"],
    },
    deletionPolicy: "A source file is never deletion-eligible until targetReceiptStatus and validationStatus are complete.",
    generatedBy: "server/db/scripts/seed/build-migration-ledger.ts",
    reviewedBy: "server/db/seed/migration/migration-review.v1.json",
    summary,
    entries,
  };
  const ledgerSha256 = sha256(JSON.stringify(ledgerWithoutHash));
  const rendered = `${JSON.stringify({ ...ledgerWithoutHash, ledgerSha256 }, null, 2)}\n`;

  if (checkOnly) {
    const current = await readFile(outputPath, "utf8").catch(() => "");
    if (current !== rendered) {
      throw new Error(`Wave 0 ledger is stale. Run: pnpm --dir server/db run db:seed:migration:wave0`);
    }
    console.log(`Wave 0 ledger is current: ${entries.length} source files, SHA-256 ${ledgerSha256}`);
    return;
  }

  await writeFile(outputPath, rendered, "utf8");
  console.log(`Wrote ${repoPath(outputPath)} with ${entries.length} entries.`);
  console.log(JSON.stringify(summary, null, 2));
}

await main();
