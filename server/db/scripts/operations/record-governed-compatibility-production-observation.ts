#!/usr/bin/env tsx
import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

type Access = "read" | "write";
type MetricRow = {
  surface: string;
  access: Access;
  operation: string;
  value: number;
};
interface Options {
  startedAt: string;
  endedAt?: string;
  deploymentRelease: string;
  metricsSourceReference: string;
  databaseActivitySourceReference: string;
  productionDatabaseIdentity: string;
  databaseUrl: string;
  prometheusUrl: string;
  consumerInventoryPath: string;
  databaseBaselinePath: string;
  outputPath: string;
  environment: string;
  confirmation?: string;
  now?: Date;
}
type DatabaseEvidence = Awaited<ReturnType<typeof observeDatabase>>;
type StartCheckpoint = {
  schemaVersion: 1;
  kind: "athyper.g6-production-compatibility-start-checkpoint";
  capturedAt: string;
  environment: "production";
  deploymentRelease: string;
  metricsSourceReference: string;
  databaseActivitySourceReference: string;
  consumerInventorySha256: string;
  database: DatabaseEvidence;
};

const expectedMetricSeries = [
  ["business_partner_request_family", "read"],
  ["business_partner_request_family", "write"],
  ["business_partner_invitation_legacy_binding", "read"],
  ["business_partner_invitation_legacy_binding", "write"],
  ["flattened_decision_scope", "read"],
  ["flattened_decision_scope", "write"],
  ["business_partner_aliases_cache", "read"],
  ["workforce_iam_projection", "read"],
  ["workforce_iam_projection", "write"],
  ["business_partner_person_group_compatibility", "read"],
] as const;

export async function recordGovernedCompatibilityProductionObservation(
  options: Options,
) {
  if (options.confirmation !== "RECORD-G6-PRODUCTION-COMPATIBILITY-OBSERVATION")
    throw new Error(
      "recording requires --confirm=RECORD-G6-PRODUCTION-COMPATIBILITY-OBSERVATION",
    );
  if (options.environment !== "production")
    throw new Error(
      "G6 compatibility observations may only be recorded from environment=production",
    );
  for (const [name, value] of Object.entries({
    deploymentRelease: options.deploymentRelease,
    metricsSourceReference: options.metricsSourceReference,
    databaseActivitySourceReference: options.databaseActivitySourceReference,
    productionDatabaseIdentity: options.productionDatabaseIdentity,
  }))
    if (!value || value.trim() !== value || value.length < 8)
      throw new Error(
        `${name} is required and must be an immutable production reference`,
      );
  const now = options.now ?? new Date(),
    start = instant(options.startedAt, "started-at"),
    end = options.endedAt ? instant(options.endedAt, "ended-at") : now;
  if (start >= end || end > now)
    throw new Error(
      "observation checkpoint must be a completed positive interval",
    );
  const windowSeconds = Math.floor((end.valueOf() - start.valueOf()) / 1000);
  if (windowSeconds < 300)
    throw new Error("observation checkpoint must cover at least five minutes");
  const root = resolve(import.meta.dirname, "../../../.."),
    destination = inside(root, options.outputPath),
    inventoryPath = inside(root, options.consumerInventoryPath);
  const config = JSON.parse(
    await readFile(
      resolve(
        root,
        "config/governance/governed-lifecycle-g6-retirement.v1.json",
      ),
      "utf8",
    ),
  ) as { observationPolicy: string; minimumConsecutiveZeroUsageDays: number };
  if (
    config.observationPolicy !== "evidence_checkpoint_no_fixed_duration" ||
    config.minimumConsecutiveZeroUsageDays !== 14
  )
    throw new Error(
      "G6 production observation policy must require exactly 14 consecutive zero-use days",
    );
  const inventoryBytes = await readFile(inventoryPath);
  const inventory = JSON.parse(inventoryBytes.toString("utf8")) as {
    kind?: string;
    capturedAt?: string;
    results?: Array<{ surfaceCode: string; activeConsumerFileCount: number }>;
  };
  if (
    inventory.kind !== "athyper.g6-compatibility-consumer-inventory" ||
    !inventory.capturedAt ||
    !Array.isArray(inventory.results)
  )
    throw new Error("active consumer inventory is invalid");
  const inventoryHash = sha(inventoryBytes),
    window = `${windowSeconds}s`,
    baselinePath = inside(root, options.databaseBaselinePath);
  const baselineBytes = await readFile(baselinePath),
    baseline = JSON.parse(baselineBytes.toString("utf8")) as StartCheckpoint;
  if (
    baseline.schemaVersion !== 1 ||
    baseline.kind !== "athyper.g6-production-compatibility-start-checkpoint" ||
    baseline.environment !== "production" ||
    baseline.capturedAt !== start.toISOString() ||
    baseline.deploymentRelease !== options.deploymentRelease ||
    baseline.metricsSourceReference !== options.metricsSourceReference ||
    baseline.databaseActivitySourceReference !==
      options.databaseActivitySourceReference ||
    baseline.consumerInventorySha256 !== inventoryHash
  )
    throw new Error(
      "production database start checkpoint does not match the observation window, release, sources, or consumer inventory",
    );
  const metricQuery = `sum by (surface,access,operation) (increase(athyper_governed_compatibility_access_total[${window}]))`;
  const metricResult = await prometheusVector(
    options.prometheusUrl,
    metricQuery,
    end,
  );
  const metrics = metricResult.rows
    .map((row) => ({
      surface: label(row, "surface"),
      access: access(label(row, "access")),
      operation: label(row, "operation"),
      value: sample(row),
    }))
    .sort(orderMetric);
  for (const [surface, kind] of expectedMetricSeries)
    if (!metrics.some((row) => row.surface === surface && row.access === kind))
      throw new Error(
        `Prometheus lacks deployed compatibility counter series for ${surface}/${kind}`,
      );
  const databaseCurrent = await observeDatabase(
      options.databaseUrl,
      start,
      options.productionDatabaseIdentity,
    ),
    database = databaseDelta(baseline.database, databaseCurrent);
  const applicationBySurface = totals(metrics),
    databaseBySurface = totals(database.activity);
  const combined = (surface: string, ...metricSurfaces: string[]) =>
    metricSurfaces.reduce(
      (sum, key) => sum + (applicationBySurface[key] ?? 0),
      0,
    ) + (databaseBySurface[surface] ?? 0);
  const usage: Record<string, number> = {
    business_partner_request_family:
      combined(
        "business_partner_request_family",
        "business_partner_request_family",
        "business_partner_invitation_legacy_binding",
      ) +
      (databaseBySurface.business_partner_invitation_legacy_binding ?? 0) +
      database.currentCounts.invitationLegacyBindingRows,
    business_partner_aliases_cache: combined(
      "business_partner_aliases_cache",
      "business_partner_aliases_cache",
    ),
    flattened_decision_scope: combined(
      "flattened_decision_scope",
      "flattened_decision_scope",
    ),
    workforce_iam_projection:
      combined("workforce_iam_projection", "workforce_iam_projection") +
      database.currentCounts.workforcePendingRows +
      database.currentCounts.workforceFailedRows,
    business_partner_person_group_compatibility:
      combined(
        "business_partner_person_group_compatibility",
        "business_partner_person_group_compatibility",
      ) +
      database.currentCounts.personGroupRows +
      database.currentCounts.personLegacyLinkRows,
    temporary_implementation_inventory:
      inventory.results.find(
        (row) => row.surfaceCode === "temporary_implementation_inventory",
      )?.activeConsumerFileCount ?? 0,
  };
  const evidence = {
    schemaVersion: 1,
    kind: "athyper.g6-production-compatibility-observation-evidence",
    capturedAt: now.toISOString(),
    environment: "production",
    deploymentRelease: options.deploymentRelease,
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
    windowSeconds,
    sources: {
      applicationMetrics: options.metricsSourceReference,
      databaseActivity: options.databaseActivitySourceReference,
      productionDatabaseIdentity: database.identity,
      databaseStartCheckpoint: {
        path: options.databaseBaselinePath,
        sha256: sha(baselineBytes),
      },
      consumerInventory: {
        path: options.consumerInventoryPath,
        sha256: inventoryHash,
        capturedAt: inventory.capturedAt,
      },
    },
    applicationMetrics: {
      querySha256: sha(metricQuery),
      resultSha256: sha(stable(metrics)),
      series: metrics,
    },
    database,
    usage,
  };
  const ledger = JSON.parse(await readFile(destination, "utf8")) as {
    schemaVersion: number;
    kind: string;
    observationPolicy: string;
    minimumConsecutiveZeroUsageDays: number;
    observations: Array<Record<string, unknown>>;
  };
  if (
    ledger.schemaVersion !== 1 ||
    ledger.kind !== "athyper.governed-lifecycle-g6-retirement-observations" ||
    ledger.observationPolicy !== config.observationPolicy ||
    ledger.minimumConsecutiveZeroUsageDays !== 14 ||
    !Array.isArray(ledger.observations)
  )
    throw new Error("G6 retirement observation ledger contract is invalid");
  const evidenceHash = sha(stable(evidence)),
    days = Math.floor(windowSeconds / 86400);
  for (const [surfaceCode, productionUsageCount] of Object.entries(usage)) {
    const consumer = inventory.results.find(
      (row) => row.surfaceCode === surfaceCode,
    );
    ledger.observations.push({
      surfaceCode,
      windowStart: start.toISOString(),
      windowEnd: end.toISOString(),
      productionUsageCount,
      consecutiveZeroUsageDays: productionUsageCount === 0 ? days : 0,
      consumerMigrationComplete: consumer?.activeConsumerFileCount === 0,
      rollbackRehearsalPassed: false,
      approvalPacketHash: null,
      environment: "production",
      deploymentRelease: options.deploymentRelease,
      evidenceHash,
      evidence,
      ...(surfaceCode === "temporary_implementation_inventory"
        ? { dispositionComplete: false }
        : {}),
    });
  }
  const temporary = `${destination}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(ledger, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temporary, destination);
  return {
    evidenceHash,
    usage,
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
    databaseIdentity: database.identity,
  };
}

export async function captureGovernedCompatibilityProductionStart(
  options: Omit<Options, "startedAt" | "endedAt" | "databaseBaselinePath">,
) {
  if (
    options.confirmation !== "CAPTURE-G6-PRODUCTION-COMPATIBILITY-START" ||
    options.environment !== "production"
  )
    throw new Error(
      "start capture requires production and --confirm=CAPTURE-G6-PRODUCTION-COMPATIBILITY-START",
    );
  for (const value of [
    options.deploymentRelease,
    options.metricsSourceReference,
    options.databaseActivitySourceReference,
    options.productionDatabaseIdentity,
  ])
    if (!value || value.trim() !== value || value.length < 8)
      throw new Error(
        "immutable production release, metric, database activity, and database identity references are required",
      );
  const capturedAt = options.now ?? new Date(),
    root = resolve(import.meta.dirname, "../../../.."),
    inventoryPath = inside(root, options.consumerInventoryPath),
    destination = inside(root, options.outputPath),
    inventoryBytes = await readFile(inventoryPath);
  const inventory = JSON.parse(inventoryBytes.toString("utf8")) as {
    kind?: string;
  };
  if (inventory.kind !== "athyper.g6-compatibility-consumer-inventory")
    throw new Error("active consumer inventory is invalid");
  const deploymentQuery =
    "sum by (surface,access,operation) (athyper_governed_compatibility_access_total)";
  const deployed = await prometheusVector(
      options.prometheusUrl,
      deploymentQuery,
      capturedAt,
    ),
    rows = deployed.rows.map((row) => ({
      surface: label(row, "surface"),
      access: access(label(row, "access")),
      operation: label(row, "operation"),
      value: sample(row),
    }));
  for (const [surface, kind] of expectedMetricSeries)
    if (!rows.some((row) => row.surface === surface && row.access === kind))
      throw new Error(
        `Prometheus lacks deployed compatibility counter series for ${surface}/${kind}`,
      );
  const database = await observeDatabase(
      options.databaseUrl,
      capturedAt,
      options.productionDatabaseIdentity,
    ),
    checkpoint: StartCheckpoint = {
      schemaVersion: 1,
      kind: "athyper.g6-production-compatibility-start-checkpoint",
      capturedAt: capturedAt.toISOString(),
      environment: "production",
      deploymentRelease: options.deploymentRelease,
      metricsSourceReference: options.metricsSourceReference,
      databaseActivitySourceReference: options.databaseActivitySourceReference,
      consumerInventorySha256: sha(inventoryBytes),
      database,
    };
  const temporary = `${destination}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(checkpoint, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temporary, destination);
  return checkpoint;
}

async function observeDatabase(
  databaseUrl: string,
  start: Date,
  expectedIdentity: string,
) {
  const client = new Client({
    connectionString: databaseUrl,
    application_name: "g6-production-compatibility-observer",
  });
  await client.connect();
  const activitySql = `/* g6-production-compatibility-observer */ WITH statements AS (SELECT queryid::text,calls::bigint,rows::bigint,query FROM pg_stat_statements WHERE query NOT LIKE '%g6-production-compatibility-observer%'), matched AS (
    SELECT s.queryid,s.calls,s.rows,v.surface,CASE WHEN s.query ~* '^\\s*(insert|update|delete|merge|call|do|alter|drop|create|truncate|grant|revoke)\\M' OR s.query ~* '^\\s*with\\M.*\\M(insert|update|delete|merge)\\M' THEN 'write' ELSE 'read' END access
    FROM statements s CROSS JOIN LATERAL (VALUES
      ('business_partner_request_family',s.query ~* 'document\\.business_partner_request(_[a-z_]+)?'),
      ('business_partner_invitation_legacy_binding',s.query ~* 'document\\.business_partner_invitation' AND s.query ~* '(business_partner_request_id|select\\s+\\*)'),
      ('business_partner_aliases_cache',s.query ~* 'master\\.business_partner' AND s.query ~* '(\\maliases\\M|select\\s+\\*)'),
      ('flattened_decision_scope',s.query ~* 'control\\.(business_partner_qualification|supplier_preference_designation|customer_account_designation|customer_credit_review)' AND s.query ~* '(\\m(operating_organization_id|company_code_id|commodity_capability_id|commodity_category_id)\\M|select\\s+\\*)'),
      ('workforce_iam_projection',s.query ~* 'document\\.workforce_iam_projection'),
      ('business_partner_person_group_compatibility',s.query ~* '(person_business_partner_legacy_link|partner_category.{0,160}(person|group))')
    ) v(surface,is_match) WHERE v.is_match)
    SELECT surface,access,sum(calls)::bigint value,array_agg(queryid ORDER BY queryid) query_ids FROM matched GROUP BY surface,access ORDER BY surface,access`;
  const countsSql = `/* g6-production-compatibility-observer */ SELECT
    (SELECT count(*)::int FROM document.business_partner_request) request_rows,
    (SELECT count(*)::int FROM document.business_partner_invitation WHERE business_partner_request_id IS NOT NULL) invitation_legacy_binding_rows,
    (SELECT count(*)::int FROM document.workforce_iam_projection WHERE observed_state='pending') workforce_pending_rows,
    (SELECT count(*)::int FROM document.workforce_iam_projection WHERE observed_state='failed') workforce_failed_rows,
    (SELECT count(*)::int FROM master.business_partner WHERE partner_category::text IN('person','group')) person_group_rows,
    (SELECT count(*)::int FROM master.person_business_partner_legacy_link) person_legacy_link_rows`;
  try {
    await client.query("BEGIN READ ONLY ISOLATION LEVEL REPEATABLE READ");
    const identityRow = (
      await client.query(
        `SELECT current_database() database_name,CASE WHEN to_regclass('document.business_partner_request') IS NOT NULL THEN 'neon' END database_plane,(SELECT oid::text FROM pg_database WHERE datname=current_database()) database_oid,(pg_control_system()).system_identifier::text system_identifier`,
      )
    ).rows[0];
    if (identityRow?.database_plane !== "neon")
      throw new Error(
        "production observation requires the NEON database plane",
      );
    const identityHash = sha(stable(identityRow));
    if (identityHash !== expectedIdentity)
      throw new Error(
        "connected production database identity does not match --production-database-identity",
      );
    const reset = (
      await client.query(`SELECT stats_reset FROM pg_stat_statements_info`)
    ).rows[0]?.stats_reset as Date | undefined;
    if (!reset || new Date(reset) > start)
      throw new Error(
        "pg_stat_statements does not cover the complete observation checkpoint",
      );
    const activityResult = await client.query(activitySql),
      counts = (await client.query(countsSql)).rows[0];
    await client.query("COMMIT");
    const activity: MetricRow[] = activityResult.rows.map((row) => ({
      surface: String(row.surface),
      access: access(String(row.access)),
      operation: "all",
      value: nonnegative(row.value),
    }));
    const currentCounts = {
      requestRows: nonnegative(counts.request_rows),
      invitationLegacyBindingRows: nonnegative(
        counts.invitation_legacy_binding_rows,
      ),
      workforcePendingRows: nonnegative(counts.workforce_pending_rows),
      workforceFailedRows: nonnegative(counts.workforce_failed_rows),
      personGroupRows: nonnegative(counts.person_group_rows),
      personLegacyLinkRows: nonnegative(counts.person_legacy_link_rows),
    };
    return {
      identity: {
        databaseName: String(identityRow.database_name),
        plane: "neon",
        sha256: identityHash,
      },
      pgStatStatementsResetAt: new Date(reset).toISOString(),
      activityQuerySha256: sha(activitySql),
      activityResultSha256: sha(stable(activityResult.rows)),
      countsQuerySha256: sha(countsSql),
      countsResultSha256: sha(stable(currentCounts)),
      activity,
      currentCounts,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}
function databaseDelta(start: DatabaseEvidence, end: DatabaseEvidence) {
  if (
    start.identity.sha256 !== end.identity.sha256 ||
    start.pgStatStatementsResetAt !== end.pgStatStatementsResetAt
  )
    throw new Error(
      "production database identity or pg_stat_statements reset changed during the observation checkpoint",
    );
  const baseline = new Map(
      start.activity.map((row) => [`${row.surface}:${row.access}`, row]),
    ),
    current = new Map(
      end.activity.map((row) => [`${row.surface}:${row.access}`, row]),
    ),
    keys = new Set([...baseline.keys(), ...current.keys()]),
    activity = [...keys]
      .sort()
      .map((key) => {
        const before = baseline.get(key),
          after = current.get(key),
          value = (after?.value ?? 0) - (before?.value ?? 0);
        if (value < 0)
          throw new Error(
            "pg_stat_statements counters decreased or entries were evicted during the observation checkpoint",
          );
        return {
          surface: (after ?? before)!.surface,
          access: (after ?? before)!.access,
          operation: "all",
          value,
        };
      })
      .filter((row) => row.value > 0);
  return {
    ...end,
    activity,
    startActivityResultSha256: start.activityResultSha256,
    startCountsResultSha256: start.countsResultSha256,
  };
}
type PromRow = { metric?: Record<string, string>; value?: [number, string] };
async function prometheusVector(base: string, query: string, end: Date) {
  const url = new URL("/api/v1/query", base);
  url.searchParams.set("query", query);
  url.searchParams.set("time", String(end.valueOf() / 1000));
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error(`Prometheus query failed: ${response.status}`);
  const body = (await response.json()) as {
    status?: string;
    data?: { resultType?: string; result?: PromRow[] };
  };
  if (
    body.status !== "success" ||
    body.data?.resultType !== "vector" ||
    !body.data.result?.length
  )
    throw new Error(
      "Prometheus returned no compatibility counter series; zero cannot be inferred from absence",
    );
  return { rows: body.data.result };
}
function label(row: PromRow, name: string) {
  const value = row.metric?.[name];
  if (!value) throw new Error(`Prometheus compatibility series lacks ${name}`);
  return value;
}
function sample(row: PromRow) {
  return nonnegative(row.value?.[1]);
}
function access(value: string): Access {
  if (value !== "read" && value !== "write")
    throw new Error(`invalid compatibility access label: ${value}`);
  return value;
}
function totals(rows: MetricRow[]) {
  const result: Record<string, number> = {};
  for (const row of rows)
    result[row.surface] = (result[row.surface] ?? 0) + row.value;
  return result;
}
function nonnegative(value: unknown) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0)
    throw new Error("observation values must be non-negative finite numbers");
  return Math.floor(result);
}
function instant(value: string, name: string) {
  if (!/(?:Z|[+-]\d\d:\d\d)$/.test(value))
    throw new Error(`--${name} must be offset-aware`);
  const result = new Date(value);
  if (Number.isNaN(result.valueOf())) throw new Error(`--${name} is invalid`);
  return result;
}
function inside(root: string, path: string) {
  const result = resolve(root, path);
  if (result !== root && !result.startsWith(`${root}${sep}`))
    throw new Error("evidence paths must remain inside the repository");
  return result;
}
function sha(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
function orderMetric(a: MetricRow, b: MetricRow) {
  return (
    a.surface.localeCompare(b.surface) ||
    a.access.localeCompare(b.access) ||
    a.operation.localeCompare(b.operation)
  );
}
function option(args: string[], name: string) {
  return args
    .find((value) => value.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2),
    databaseUrl =
      option(args, "--database-url") ??
      process.env["ATHYPER_NEON_DATABASE_ADMIN_URL"];
  if (!databaseUrl)
    throw new Error(
      "--database-url or ATHYPER_NEON_DATABASE_ADMIN_URL is required",
    );
  const common = {
    deploymentRelease: option(args, "--deployment-release") ?? "",
    metricsSourceReference: option(args, "--metrics-source-reference") ?? "",
    databaseActivitySourceReference:
      option(args, "--database-activity-source-reference") ?? "",
    productionDatabaseIdentity:
      option(args, "--production-database-identity") ?? "",
    databaseUrl,
    prometheusUrl: option(args, "--prometheus-url") ?? "",
    consumerInventoryPath:
      option(args, "--consumer-inventory") ??
      "docs/architecture/reports/g6/current-consumer-inventory.json",
    outputPath:
      option(args, "--output") ??
      (option(args, "--phase") === "start"
        ? "docs/architecture/reports/g6/production-observation-start.json"
        : "config/governance/governed-lifecycle-g6-retirement-observations.v1.json"),
    environment: option(args, "--environment") ?? "",
    confirmation: option(args, "--confirm"),
  };
  const result =
    option(args, "--phase") === "start"
      ? await captureGovernedCompatibilityProductionStart(common)
      : await recordGovernedCompatibilityProductionObservation({
          ...common,
          startedAt: option(args, "--started-at") ?? "",
          endedAt: option(args, "--ended-at"),
          databaseBaselinePath:
            option(args, "--database-start-checkpoint") ?? "",
        });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
