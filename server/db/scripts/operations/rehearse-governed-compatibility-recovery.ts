#!/usr/bin/env tsx
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import postgres from "postgres";

type Tx = any;
type Comparison = {
  name: string;
  beforeCount: number;
  afterCount: number;
  beforeSha256: string;
  afterSha256: string;
  mismatchCount: number;
  passed: boolean;
};
type SurfaceResult = {
  surfaceCode: string;
  sourceBackupIdentity: string;
  sourceDatabaseIdentity: string;
  cloneDatabaseName: string;
  cloneSystemIdentifier: string;
  backupManifestSha256: string;
  migrationSha256: string;
  operator: string;
  startedAt: string;
  completedAt: string;
  transactionDisposition: string;
  comparisons: Comparison[];
  rto: { targetSeconds: number; actualSeconds: number; passed: boolean };
  rpo: { targetSeconds: number; actualSeconds: number; passed: boolean };
  result: "passed" | "failed";
  error?: string;
};
type Manifest = {
  schemaVersion: number;
  kind: string;
  sourceBackupIdentity: string;
  sourceDatabaseIdentity: string;
  sourceDatabaseName: string;
  sourceSystemIdentifier: string;
  backupCreatedAt: string;
  recoveryPointAt: string;
  restoreStartedAt: string;
  restoredAt: string;
  cloneDatabaseName: string;
  cloneSystemIdentifier: string;
  rtoTargetSeconds: number;
  rpoTargetSeconds: number;
};

const root = resolve(import.meta.dirname, "../../../..");
const parsed = new Map(
  process.argv.slice(2).map((value) => {
    const [key, ...rest] = value.split("=");
    return [key, rest.join("=") || "true"];
  }),
);
const databaseUrl = parsed.get("--database-url") ?? process.env.DATABASE_URL;
const manifestArg = parsed.get("--backup-manifest");
const operator = parsed.get("--operator");
const outputArg =
  parsed.get("--output-dir") ?? "docs/architecture/reports/g6/recovery";
if (!databaseUrl || !manifestArg || !operator)
  throw new Error(
    "--database-url, --backup-manifest and --operator are required",
  );
if (parsed.get("--confirm") !== "REHEARSE-G6-RECOVERY-ON-ISOLATED-CLONE")
  throw new Error(
    "rehearsal requires --confirm=REHEARSE-G6-RECOVERY-ON-ISOLATED-CLONE",
  );
if (operator.trim() !== operator || operator.length < 3)
  throw new Error("operator must be a stable non-empty identity");
const inside = (value: string) => {
  const path = resolve(root, value);
  if (path !== root && !path.startsWith(root + sep))
    throw new Error("path escapes repository");
  return path;
};
const manifestPath = inside(manifestArg),
  outputDir = inside(outputArg);
if (
  !outputDir.startsWith(
    resolve(root, "docs/architecture/reports/g6/recovery") + sep,
  ) &&
  outputDir !== resolve(root, "docs/architecture/reports/g6/recovery")
)
  throw new Error(
    "output-dir must be under docs/architecture/reports/g6/recovery",
  );
const sha = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const instant = (value: string, name: string) => {
  const date = new Date(value);
  if (!value || Number.isNaN(date.valueOf()))
    throw new Error(`${name} must be an ISO timestamp`);
  return date;
};
const seconds = (from: Date, to: Date) =>
  Math.max(0, Math.ceil((to.valueOf() - from.valueOf()) / 1000));
const finite = (value: number, name: string) => {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(`${name} must be a non-negative integer`);
  return value;
};
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const number = (value: unknown) => Number(value ?? 0);

class RollbackOnly extends Error {}
async function rollbackOnly<T>(
  sql: ReturnType<typeof postgres>,
  work: (tx: Tx) => Promise<T>,
): Promise<T> {
  let result: T | undefined;
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe("SET LOCAL statement_timeout = '15min'");
      result = await work(tx);
      throw new RollbackOnly("intentional rollback");
    });
  } catch (error) {
    if (!(error instanceof RollbackOnly)) throw error;
  }
  if (result === undefined)
    throw new Error("rollback-only rehearsal produced no result");
  return result;
}

async function relationDigest(
  tx: Tx,
  relation: string,
): Promise<{ count: number; hash: string }> {
  const rows = await tx.unsafe(
    `SELECT count(*)::text AS count,encode(digest(convert_to(COALESCE(string_agg(to_jsonb(value)::text,E'\\n' ORDER BY to_jsonb(value)::text),''),'UTF8'),'sha256'),'hex') AS hash FROM ${relation} value`,
  );
  return { count: number(rows[0].count), hash: rows[0].hash };
}
const comparison = (
  name: string,
  before: { count: number; hash: string },
  after: { count: number; hash: string },
  mismatchCount = before.hash === after.hash && before.count === after.count
    ? 0
    : 1,
): Comparison => ({
  name,
  beforeCount: before.count,
  afterCount: after.count,
  beforeSha256: before.hash,
  afterSha256: after.hash,
  mismatchCount,
  passed:
    before.count === after.count &&
    before.hash === after.hash &&
    mismatchCount === 0,
});
const applyCandidate = async (tx: Tx, surfaceCode: string) => {
  const source = migrationArtifacts.get(surfaceCode)?.source;
  if (!source) throw new Error(`retirement candidate lacks ${surfaceCode}`);
  await tx.unsafe(source);
};

async function requestFamily(tx: Tx): Promise<Comparison[]> {
  const tables = await tx<
    { name: string }[]
  >`SELECT c.relname name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='document' AND c.relkind='r' AND c.relname LIKE 'business_partner_request%' ORDER BY c.relname`;
  if (!tables.length)
    throw new Error("request-family authority tables are absent");
  await tx.unsafe("CREATE SCHEMA g6_recovery_request_family");
  const results: Comparison[] = [];
  for (const { name } of tables) {
    const source = `document.${quote(name)}`,
      copy = `g6_recovery_request_family.${quote(name)}`;
    const before = await relationDigest(tx, source);
    await tx.unsafe(`CREATE TABLE ${copy} AS TABLE ${source}`);
    const exported = await relationDigest(tx, copy);
    results.push(comparison(name, before, exported));
  }
  await applyCandidate(tx, "business_partner_request_family");
  for (let index = 0; index < tables.length; index++) {
    const restored = await relationDigest(
      tx,
      `g6_recovery_request_family.${quote(tables[index].name)}`,
    );
    if (
      restored.hash !== results[index].afterSha256 ||
      restored.count !== results[index].afterCount
    )
      throw new Error(`compatibility restore changed ${tables[index].name}`);
  }
  return results;
}

async function aliasesCache(tx: Tx): Promise<Comparison[]> {
  const current = await tx.unsafe(
    `SELECT count(*)::text count,encode(digest(convert_to(COALESCE(string_agg(jsonb_build_object('tenantId',bp.tenant_id,'businessPartnerId',bp.id,'aliases',bp.aliases)::text,E'\\n' ORDER BY bp.tenant_id,bp.id),''),'UTF8'),'sha256'),'hex') hash FROM master.business_partner bp`,
  );
  const rebuilt = await tx.unsafe(
    `WITH regenerated AS(SELECT bp.tenant_id,bp.id,COALESCE(array_agg(a.alias_name ORDER BY a.is_primary DESC,a.alias_name) FILTER(WHERE a.id IS NOT NULL),'{}'::text[]) aliases FROM master.business_partner bp LEFT JOIN master.business_partner_alias a ON a.tenant_id=bp.tenant_id AND a.business_partner_id=bp.id AND a.status='active' AND a.effective_from<=CURRENT_DATE AND(a.effective_until IS NULL OR a.effective_until>CURRENT_DATE) GROUP BY bp.tenant_id,bp.id) SELECT count(*)::text count,encode(digest(convert_to(COALESCE(string_agg(jsonb_build_object('tenantId',tenant_id,'businessPartnerId',id,'aliases',aliases)::text,E'\\n' ORDER BY tenant_id,id),''),'UTF8'),'sha256'),'hex') hash FROM regenerated`,
  );
  const mismatch = await tx.unsafe(
    `WITH regenerated AS(SELECT bp.tenant_id,bp.id,COALESCE(array_agg(a.alias_name ORDER BY a.is_primary DESC,a.alias_name) FILTER(WHERE a.id IS NOT NULL),'{}'::text[]) aliases FROM master.business_partner bp LEFT JOIN master.business_partner_alias a ON a.tenant_id=bp.tenant_id AND a.business_partner_id=bp.id AND a.status='active' AND a.effective_from<=CURRENT_DATE AND(a.effective_until IS NULL OR a.effective_until>CURRENT_DATE) GROUP BY bp.tenant_id,bp.id) SELECT count(*)::text count FROM regenerated r JOIN master.business_partner bp USING(tenant_id,id) WHERE r.aliases IS DISTINCT FROM bp.aliases`,
  );
  await applyCandidate(tx, "business_partner_aliases_cache");
  return [
    comparison(
      "effective aliases",
      { count: number(current[0].count), hash: current[0].hash },
      { count: number(rebuilt[0].count), hash: rebuilt[0].hash },
      number(mismatch[0].count),
    ),
  ];
}

async function flattenedScope(tx: Tx): Promise<Comparison[]> {
  const legacy = `SELECT 'qualification' kind,q.tenant_id,q.id,jsonb_build_object('operatingOrganizationId',q.operating_organization_id,'companyCodeId',q.company_code_id,'commodityCategoryId',cap.commodity_category_id) coordinates FROM control.business_partner_qualification q LEFT JOIN master.business_partner_commodity_capability cap ON cap.tenant_id=q.tenant_id AND cap.id=q.commodity_capability_id UNION ALL SELECT 'supplier_preference',p.tenant_id,p.id,jsonb_build_object('operatingOrganizationId',p.operating_organization_id,'companyCodeId',p.company_code_id,'commodityCategoryId',p.commodity_category_id) FROM control.supplier_preference_designation p UNION ALL SELECT 'customer_designation',d.tenant_id,d.id,jsonb_build_object('operatingOrganizationId',d.operating_organization_id,'companyCodeId',d.company_code_id,'commodityCategoryId',NULL) FROM control.customer_account_designation d UNION ALL SELECT 'credit_review',r.tenant_id,r.id,jsonb_build_object('operatingOrganizationId',r.operating_organization_id,'companyCodeId',r.company_code_id,'commodityCategoryId',NULL) FROM control.customer_credit_review r`;
  const normalized = `SELECT CASE WHEN qualification_id IS NOT NULL THEN 'qualification' WHEN supplier_preference_id IS NOT NULL THEN 'supplier_preference' WHEN customer_designation_id IS NOT NULL THEN 'customer_designation' ELSE 'credit_review' END kind,tenant_id,COALESCE(qualification_id,supplier_preference_id,customer_designation_id,credit_review_id) id,jsonb_build_object('operatingOrganizationId',max(operating_organization_id) FILTER(WHERE scope_group=1 AND scope_mode='include'),'companyCodeId',max(company_code_id) FILTER(WHERE scope_group=1 AND scope_mode='include'),'commodityCategoryId',max(commodity_category_id) FILTER(WHERE scope_group=1 AND scope_mode='include')) coordinates FROM control.business_partner_decision_scope GROUP BY tenant_id,qualification_id,supplier_preference_id,customer_designation_id,credit_review_id`;
  const summarize = async (query: string) => {
    const rows = await tx.unsafe(
      `WITH valueset AS(${query}) SELECT count(*)::text count,encode(digest(convert_to(COALESCE(string_agg(jsonb_build_object('kind',kind,'tenantId',tenant_id,'id',id,'coordinates',coordinates)::text,E'\\n' ORDER BY kind,tenant_id,id),''),'UTF8'),'sha256'),'hex') hash FROM valueset`,
    );
    return { count: number(rows[0].count), hash: rows[0].hash };
  };
  const before = await summarize(legacy),
    after = await summarize(normalized);
  const mismatches = await tx.unsafe(
    `WITH legacy AS(${legacy}),normalized AS(${normalized}) SELECT count(*)::text count FROM legacy l FULL JOIN normalized n USING(kind,tenant_id,id) WHERE l.coordinates IS DISTINCT FROM n.coordinates`,
  );
  await applyCandidate(tx, "flattened_decision_scope");
  return [
    comparison(
      "flattened coordinates reconstructed from normalized scope",
      before,
      after,
      number(mismatches[0].count),
    ),
  ];
}

async function workforceProjection(tx: Tx): Promise<Comparison[]> {
  const legacy = `SELECT p.tenant_id,e.id employment_id,CASE p.desired_state WHEN 'member' THEN 'active' ELSE p.desired_state END desired_status FROM document.workforce_iam_projection p JOIN LATERAL(SELECT value.id FROM master.employment value WHERE value.tenant_id=p.tenant_id AND value.employee_id=p.employee_id AND value.legal_entity_id=p.employer_organization_id ORDER BY value.is_primary DESC,value.hire_date DESC,value.id DESC LIMIT 1)e ON true`;
  const canonical = `SELECT DISTINCT ON(c.tenant_id,c.result_payload->>'employmentId') c.tenant_id,(c.result_payload->>'employmentId')::uuid employment_id,c.result_payload->>'desiredStatus' desired_status FROM event.command_execution c JOIN event.outbox o ON o.tenant_id=c.tenant_id AND o.id=(c.result_payload->>'outboxId')::uuid AND o.event_type='workforce.employee.identity_projection.requested' JOIN master.employment e ON e.tenant_id=c.tenant_id AND e.id=(c.result_payload->>'employmentId')::uuid WHERE c.command_code='workforce.employee.identity.request' AND c.status='succeeded' AND o.payload->>'desiredHash'=c.result_payload->>'desiredHash' ORDER BY c.tenant_id,c.result_payload->>'employmentId',(c.result_payload->>'desiredVersion')::bigint DESC`;
  const summarize = async (query: string) => {
    const rows = await tx.unsafe(
      `WITH valueset AS(${query}) SELECT count(*)::text count,encode(digest(convert_to(COALESCE(string_agg(jsonb_build_object('tenantId',tenant_id,'employmentId',employment_id,'desiredStatus',desired_status)::text,E'\\n' ORDER BY tenant_id,employment_id),''),'UTF8'),'sha256'),'hex') hash FROM valueset`,
    );
    return { count: number(rows[0].count), hash: rows[0].hash };
  };
  const before = await summarize(legacy),
    after = await summarize(canonical);
  const mismatches = await tx.unsafe(
    `WITH legacy AS(${legacy}),canonical AS(${canonical}) SELECT count(*)::text count FROM legacy l FULL JOIN canonical c USING(tenant_id,employment_id) WHERE l.desired_status IS DISTINCT FROM c.desired_status`,
  );
  const states = await tx.unsafe(
    `WITH canonical AS(${canonical}) SELECT desired_status,count(*)::text count FROM canonical GROUP BY desired_status`,
  );
  for (const status of ["active", "suspended", "deprovisioned"])
    if (
      !states.some(
        (row: any) => row.desired_status === status && number(row.count) > 0,
      )
    )
      throw new Error(`canonical workforce replay lacks ${status} evidence`);
  await applyCandidate(tx, "workforce_iam_projection");
  return [
    comparison(
      "employment and saga/outbox desired state",
      before,
      after,
      number(mismatches[0].count),
    ),
  ];
}

async function personGroup(tx: Tx): Promise<Comparison[]> {
  await tx.unsafe(
    "CREATE SCHEMA g6_recovery_person_group;CREATE TABLE g6_recovery_person_group.person_business_partner_legacy_link AS TABLE master.person_business_partner_legacy_link",
  );
  const exported = comparison(
    "historical coordinates",
    await relationDigest(tx, "master.person_business_partner_legacy_link"),
    await relationDigest(
      tx,
      "g6_recovery_person_group.person_business_partner_legacy_link",
    ),
  );
  const historical = await tx.unsafe(
    "SELECT count(*)::text count FROM master.business_partner WHERE partner_category IN ('person','group')",
  );
  if (number(historical[0].count) > 0)
    throw new Error(
      `organization-only preflight found ${historical[0].count} person/group Business Partner rows`,
    );
  const relations = [
    "master.person",
    "master.employee",
    "master.employment",
    "master.work_assignment",
  ];
  const before = await Promise.all(
    relations.map((value) => relationDigest(tx, value)),
  );
  await applyCandidate(tx, "business_partner_person_group_compatibility");
  const after = await Promise.all(
    relations.map((value) => relationDigest(tx, value)),
  );
  return [
    exported,
    ...relations.map((value, index) =>
      comparison(`${value} independent authority`, before[index], after[index]),
    ),
  ];
}

async function temporaryInventory(): Promise<Comparison[]> {
  const path = resolve(
      root,
      "docs/architecture/plans/governed-entity-lifecycle-implementation-inventory.md",
    ),
    content = await readFile(path, "utf8");
  if (!content.includes("**Status:** Disposition-complete temporary evidence."))
    throw new Error("inventory lacks its disposition-complete attestation");
  const lines = content.split(/\r?\n/u),
    rows = lines.filter(
      (line, index) =>
        line.startsWith("|") &&
        !/^\|(?:\s*:?-+:?\s*\|)+$/u.test(line) &&
        !/^\|(?:\s*-)/u.test(lines[index + 1] ?? ""),
    );
  const dispositions = rows.map((row) => ({
    rowSha256: sha(row),
    disposition: /provider gap|deferred|backlog/iu.test(row)
      ? "backlog"
      : /ADR|rejected/iu.test(row)
        ? "adr_rejection"
        : /retired/iu.test(row)
          ? "implementation_retired"
          : "implementation",
  }));
  const unresolved = dispositions.filter(
    (value) =>
      !new Set([
        "implementation",
        "implementation_retired",
        "adr_rejection",
        "backlog",
      ]).has(value.disposition),
  );
  const gitObject = execFileSync("git", ["hash-object", path], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  if (!/^[a-f0-9]{40,64}$/u.test(gitObject) || !/^[a-f0-9]{40}$/u.test(head))
    throw new Error("Git recovery identity is invalid");
  const dispositionHash = sha(JSON.stringify(dispositions)),
    before = { count: rows.length, hash: dispositionHash },
    after = {
      count: dispositions.length - unresolved.length,
      hash: unresolved.length
        ? sha(JSON.stringify(unresolved))
        : dispositionHash,
    };
  const totals = Object.fromEntries(
    [...new Set(dispositions.map((value) => value.disposition))].map((kind) => [
      kind,
      dispositions.filter((value) => value.disposition === kind).length,
    ]),
  );
  return [
    comparison(
      `inventory rows disposed=${JSON.stringify(totals)}; gitObject=${gitObject}; head=${head}`,
      before,
      after,
      unresolved.length,
    ),
  ];
}

const manifestBytes = await readFile(manifestPath),
  manifest = JSON.parse(manifestBytes.toString("utf8")) as Manifest,
  sequence = JSON.parse(
    await readFile(
      resolve(
        root,
        "config/governance/governed-lifecycle-g6-retirement-sequence.v1.json",
      ),
      "utf8",
    ),
  ) as {
    surfaces: Array<{ code: string; migration: string; migrationKind: string }>;
  },
  migrationArtifacts = new Map<
    string,
    { path: string; source: string; sha256: string }
  >();
for (const entry of sequence.surfaces) {
  const bytes = await readFile(resolve(root, entry.migration));
  migrationArtifacts.set(entry.code, {
    path: entry.migration,
    source: bytes.toString("utf8"),
    sha256: sha(bytes),
  });
}
if (
  manifest.schemaVersion !== 1 ||
  manifest.kind !== "athyper.g6-isolated-production-backup-clone"
)
  throw new Error("backup manifest contract is invalid");
for (const key of [
  "sourceBackupIdentity",
  "sourceDatabaseIdentity",
  "sourceDatabaseName",
  "sourceSystemIdentifier",
  "cloneDatabaseName",
  "cloneSystemIdentifier",
] as const)
  if (!manifest[key] || manifest[key].length < 8)
    throw new Error(`${key} is required`);
if (
  manifest.sourceDatabaseName === manifest.cloneDatabaseName ||
  manifest.sourceSystemIdentifier === manifest.cloneSystemIdentifier
)
  throw new Error("source and clone identities must differ");
if (!/g6.*recovery.*rehearsal/iu.test(manifest.cloneDatabaseName))
  throw new Error(
    "clone database name must visibly identify a G6 recovery rehearsal",
  );
const backupAt = instant(manifest.backupCreatedAt, "backupCreatedAt"),
  recoveryAt = instant(manifest.recoveryPointAt, "recoveryPointAt"),
  restoreStart = instant(manifest.restoreStartedAt, "restoreStartedAt"),
  restoredAt = instant(manifest.restoredAt, "restoredAt"),
  now = new Date();
if (
  recoveryAt > backupAt ||
  backupAt > restoreStart ||
  restoreStart > restoredAt ||
  restoredAt > now
)
  throw new Error("backup/restore timestamps are not ordered");
if (seconds(backupAt, now) > 7 * 86400)
  throw new Error("source backup is older than seven days");
const rto = {
  targetSeconds: finite(manifest.rtoTargetSeconds, "rtoTargetSeconds"),
  actualSeconds: seconds(restoreStart, restoredAt),
  passed: false,
};
rto.passed = rto.actualSeconds <= rto.targetSeconds;
const rpo = {
  targetSeconds: finite(manifest.rpoTargetSeconds, "rpoTargetSeconds"),
  actualSeconds: seconds(recoveryAt, backupAt),
  passed: false,
};
rpo.passed = rpo.actualSeconds <= rpo.targetSeconds;
const backupManifestSha256 = sha(manifestBytes),
  sql = postgres(databaseUrl, { max: 1, connect_timeout: 10, idle_timeout: 5 });
const executions: [string, (tx: Tx) => Promise<Comparison[]>][] = [
  ["business_partner_request_family", requestFamily],
  ["business_partner_aliases_cache", aliasesCache],
  ["flattened_decision_scope", flattenedScope],
  ["workforce_iam_projection", workforceProjection],
  ["business_partner_person_group_compatibility", personGroup],
];
const reports: SurfaceResult[] = [];
try {
  const identity = await sql<
    { database_name: string; plane: string; system_identifier: string }[]
  >`SELECT current_database() database_name,current_setting('app.database_plane',true) plane,(pg_control_system()).system_identifier::text system_identifier`;
  if (
    identity[0]?.database_name !== manifest.cloneDatabaseName ||
    identity[0]?.system_identifier !== manifest.cloneSystemIdentifier ||
    identity[0]?.plane !== "neon"
  )
    throw new Error(
      "connected database does not match the attested isolated NEON clone",
    );
  if (
    identity[0].database_name === manifest.sourceDatabaseName ||
    identity[0].system_identifier === manifest.sourceSystemIdentifier
  )
    throw new Error("refusing rehearsal against source production identity");
  const provenance = {
    sourceBackupIdentity: manifest.sourceBackupIdentity,
    sourceDatabaseIdentity: manifest.sourceDatabaseIdentity,
    cloneDatabaseName: manifest.cloneDatabaseName,
    cloneSystemIdentifier: manifest.cloneSystemIdentifier,
    backupManifestSha256,
    operator,
  };
  for (const [surfaceCode, run] of executions) {
    const startedAt = new Date().toISOString(),
      migrationSha256 = migrationArtifacts.get(surfaceCode)!.sha256;
    try {
      const comparisons = await rollbackOnly(sql, run);
      reports.push({
        surfaceCode,
        ...provenance,
        migrationSha256,
        startedAt,
        completedAt: new Date().toISOString(),
        transactionDisposition: "forced_rollback",
        comparisons,
        rto,
        rpo,
        result:
          rto.passed && rpo.passed && comparisons.every((value) => value.passed)
            ? "passed"
            : "failed",
      });
    } catch (error) {
      reports.push({
        surfaceCode,
        ...provenance,
        migrationSha256,
        startedAt,
        completedAt: new Date().toISOString(),
        transactionDisposition: "rolled_back_after_error",
        comparisons: [],
        rto,
        rpo,
        result: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const startedAt = new Date().toISOString(),
    migrationSha256 = migrationArtifacts.get(
      "temporary_implementation_inventory",
    )!.sha256;
  try {
    const comparisons = await temporaryInventory();
    reports.push({
      surfaceCode: "temporary_implementation_inventory",
      ...provenance,
      migrationSha256,
      startedAt,
      completedAt: new Date().toISOString(),
      transactionDisposition: "git_history_only_no_database_mutation",
      comparisons,
      rto,
      rpo,
      result:
        rto.passed && rpo.passed && comparisons.every((value) => value.passed)
          ? "passed"
          : "failed",
    });
  } catch (error) {
    reports.push({
      surfaceCode: "temporary_implementation_inventory",
      ...provenance,
      migrationSha256,
      startedAt,
      completedAt: new Date().toISOString(),
      transactionDisposition: "git_history_only_no_database_mutation",
      comparisons: [],
      rto,
      rpo,
      result: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
  }
} finally {
  await sql.end();
}
await mkdir(outputDir, { recursive: true });
const runId = new Date().toISOString().replaceAll(/[:.]/gu, "-");
for (const report of reports)
  await writeFile(
    resolve(outputDir, `${runId}-${report.surfaceCode}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
    { flag: "wx", mode: 0o600 },
  );
const index = {
  schemaVersion: 1,
  kind: "athyper.g6-compatibility-recovery-rehearsal",
  runId,
  sourceBackupIdentity: manifest.sourceBackupIdentity,
  backupManifestSha256,
  migrationHashes: Object.fromEntries(
    [...migrationArtifacts].map(([code, value]) => [code, value.sha256]),
  ),
  operator,
  createdAt: new Date().toISOString(),
  result: reports.every((value) => value.result === "passed")
    ? "passed"
    : "failed",
  reports: reports.map((value) => ({
    surfaceCode: value.surfaceCode,
    result: value.result,
    file: `${runId}-${value.surfaceCode}.json`,
  })),
};
await writeFile(
  resolve(outputDir, `${runId}-index.json`),
  `${JSON.stringify(index, null, 2)}\n`,
  { flag: "wx", mode: 0o600 },
);
process.stdout.write(
  `G6_RECOVERY_REHEARSAL result=${index.result} passed=${reports.filter((value) => value.result === "passed").length}/${reports.length} index=${resolve(outputDir, `${runId}-index.json`)}\n`,
);
if (index.result !== "passed") process.exitCode = 1;
