#!/usr/bin/env tsx

import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

interface Options {
  startedAt: string;
  databaseUrl: string;
  prometheusUrl: string;
  outputPath: string;
  confirmation?: string;
  now?: Date;
}
interface Gate {
  observationRecorded: boolean;
  governedTrafficObserved: boolean;
  legacyDatabaseWritesZero: boolean;
  legacyMutationTrafficZero: boolean;
  consumerMigrationComplete: boolean;
  supportedUpgradeHttpCertified: boolean;
  removalEligible: boolean;
}

export async function recordGovernedInternalBusinessPartnerUsage(
  options: Options,
) {
  if (options.confirmation !== "RECORD-G1-INTERNAL-BP-USAGE-OBSERVATION")
    throw new Error(
      "recording requires --confirm=RECORD-G1-INTERNAL-BP-USAGE-OBSERVATION",
    );
  const now = options.now ?? new Date(),
    started = parseStart(options.startedAt, now),
    windowSeconds = Math.floor((now.valueOf() - started.valueOf()) / 1000),
    windowDays = windowSeconds / 86400;
  const repositoryRoot = resolve(import.meta.dirname, "../../../..");
  const registry = JSON.parse(
    await readFile(
      resolve(
        repositoryRoot,
        "server/db/ddl/planes/neon/governed-lifecycle-compatibility.v1.json",
      ),
      "utf8",
    ),
  ) as {
    observationPolicy: string;
    surfaces: Array<{
      surface: string;
      consumers: string[];
      usageMeasureSql: string;
    }>;
  };
  if (registry.observationPolicy !== "evidence_checkpoint_no_fixed_duration")
    throw new Error("unsupported usage observation policy");
  const surface = registry.surfaces.find(
    (item) => item.surface === "document.business_partner_request family",
  );
  if (!surface)
    throw new Error("Business Partner request compatibility surface is absent");
  const readiness = JSON.parse(
    await readFile(
      resolve(
        repositoryRoot,
        "server/db/ddl/governed-lifecycle-g5-readiness.v1.json",
      ),
      "utf8",
    ),
  ) as { scenarios: Array<{ scenario: string; status: string }> };
  const scenario = readiness.scenarios.find(
    (item) => item.scenario === "internal_only_business_partner",
  );
  if (!scenario)
    throw new Error("Internal Business Partner readiness row is absent");
  const consumerEvidence = await Promise.all(
    surface.consumers.map(async (consumer) => {
      const source = await readFile(resolve(repositoryRoot, consumer), "utf8");
      return {
        consumer,
        legacyAuthorityReferenced: source.includes(
          "document.business_partner_request",
        ),
      };
    }),
  );
  const database = await databaseObservation(
    options.databaseUrl,
    options.startedAt,
    surface.usageMeasureSql,
  );
  const window = `${windowSeconds}s`,
    prometheus = options.prometheusUrl;
  const [
    governedCalls,
    governedFailures,
    legacyMutationCalls,
    legacyMutationFailures,
  ] = await Promise.all([
    metric(
      prometheus,
      `sum(increase(athyper_business_partner_request_http_total{operation=~"governed_internal\\..*"}[${window}])) or vector(0)`,
    ),
    metric(
      prometheus,
      `sum(increase(athyper_business_partner_request_http_total{operation=~"governed_internal\\..*",outcome!="success"}[${window}])) or vector(0)`,
    ),
    metric(
      prometheus,
      `sum(increase(athyper_business_partner_request_http_total{operation=~"create|submit|decide|apply"}[${window}])) or vector(0)`,
    ),
    metric(
      prometheus,
      `sum(increase(athyper_business_partner_request_http_total{operation=~"create|submit|decide|apply",outcome!="success"}[${window}])) or vector(0)`,
    ),
  ]);
  const gate: Gate = {
    observationRecorded: true,
    governedTrafficObserved: governedCalls > 0,
    legacyDatabaseWritesZero: database.rowsTouchedSinceStart === 0,
    legacyMutationTrafficZero: legacyMutationCalls === 0,
    consumerMigrationComplete: consumerEvidence.every(
      (item) => !item.legacyAuthorityReferenced,
    ),
    supportedUpgradeHttpCertified: /supported_upgrade_http_proven/.test(
      scenario.status,
    ),
    removalEligible: false,
  };
  gate.removalEligible = Object.entries(gate)
    .filter(([key]) => key !== "removalEligible")
    .every(([, value]) => value === true);
  const evidence = {
    capturedAt: now.toISOString(),
    observationStartedAt: started.toISOString(),
    windowSeconds,
    windowDays: Number(windowDays.toFixed(6)),
    surface: surface.surface,
    prometheus: {
      governedInternalCalls: integer(governedCalls),
      governedInternalFailures: integer(governedFailures),
      legacyMutationCalls: integer(legacyMutationCalls),
      legacyMutationFailures: integer(legacyMutationFailures),
    },
    database,
    consumerEvidence,
    readinessStatus: scenario.status,
    gate,
  };
  const destination = resolve(repositoryRoot, options.outputPath);
  if (
    destination !== repositoryRoot &&
    !destination.startsWith(`${repositoryRoot}${sep}`)
  )
    throw new Error("output must remain inside the repository");
  const ledger = JSON.parse(await readFile(destination, "utf8")) as {
    schemaVersion: number;
    observationPolicy: string;
    observations: unknown[];
  };
  if (
    ledger.schemaVersion !== 1 ||
    ledger.observationPolicy !== registry.observationPolicy ||
    !Array.isArray(ledger.observations)
  )
    throw new Error("usage observation ledger contract is invalid");
  ledger.observations.push(evidence);
  const temporary = `${destination}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(ledger, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temporary, destination);
  return evidence;
}

async function databaseObservation(
  databaseUrl: string,
  startedAt: string,
  registrySql: string,
) {
  const client = new Client({
    connectionString: databaseUrl,
    application_name: "g1-internal-bp-usage-observer",
  });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const registered = (await client.query(registrySql)).rows[0] ?? {};
    const exact = (
      await client.query(
        `SELECT count(*)::int retained_rows,count(*) FILTER(WHERE created_at >= $1::timestamptz OR updated_at >= $1::timestamptz)::int rows_touched_since_start,count(*) FILTER(WHERE status IN('draft','validating','validation_failed','pending_approval','returned','approved','applying','failed'))::int open_rows FROM document.business_partner_request`,
        [startedAt],
      )
    ).rows[0];
    await client.query("COMMIT");
    return {
      retainedRows: Number(exact.retained_rows),
      rowsTouchedSinceStart: Number(exact.rows_touched_since_start),
      openRows: Number(exact.open_rows),
      registryMeasure: registered,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}
async function metric(base: string, query: string) {
  const url = new URL("/api/v1/query", base);
  url.searchParams.set("query", query);
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new Error(`Prometheus query failed: ${response.status}`);
  const body = (await response.json()) as {
    status?: string;
    data?: { result?: Array<{ value?: [number, string] }> };
  };
  const value = Number(body.data?.result?.[0]?.value?.[1]);
  if (body.status !== "success" || !Number.isFinite(value) || value < 0)
    throw new Error("Prometheus returned no non-negative finite sample");
  return value;
}
function parseStart(value: string, now: Date) {
  if (!/(?:Z|[+-]\d\d:\d\d)$/.test(value))
    throw new Error("--started-at must be offset-aware");
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed >= now)
    throw new Error("--started-at must be a valid past timestamp");
  return parsed;
}
function integer(value: number) {
  if (!Number.isFinite(value) || value < 0)
    throw new Error("usage measure must be non-negative");
  return Math.floor(value);
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
  const evidence = await recordGovernedInternalBusinessPartnerUsage({
    startedAt: option(args, "--started-at") ?? "",
    databaseUrl,
    prometheusUrl: option(args, "--prometheus-url") ?? "http://127.0.0.1:53900",
    outputPath:
      option(args, "--output") ??
      "config/governance/governed-internal-business-partner-usage-observations.v1.json",
    confirmation: option(args, "--confirm"),
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}
