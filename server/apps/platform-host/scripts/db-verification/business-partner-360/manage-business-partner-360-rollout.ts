#!/usr/bin/env tsx

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";
import { requiredOption } from "@athyper/server-db/tooling/lib/cli";
import { assertLoopbackDatabaseTarget } from "@athyper/server-db/tooling/lib/database-target";
import {
  evaluateBusinessPartner360Approvals,
  evaluateBusinessPartner360Release,
  evaluateBusinessPartner360Retirement,
  type BusinessPartner360ApprovalEvidence,
  type BusinessPartner360ReleaseEvidence,
  type BusinessPartner360RetirementEvidence,
} from "@athyper/server-service-master-data";
import { evaluateBusinessPartner360P0ApprovalFile } from "@athyper/server-db/tooling/business-partner-360/evaluate-business-partner-360-p0-approvals";
import { evaluateBusinessPartner360P1QualificationFiles } from "@athyper/server-db/tooling/business-partner-360/evaluate-business-partner-360-p1-qualification";

const FLAG = "neon.business_partner.view_360",
  PREFIX = "bp360:",
  ACTIONS = [
    "status",
    "enable-internal",
    "promote-canary",
    "promote-broad",
    "rollback",
    "retirement-check",
  ] as const;
type Action = (typeof ACTIONS)[number];

export async function manageBusinessPartner360Rollout(options: {
  action: Action;
  databaseUrl: string;
  environment: string;
  actorId?: string;
  confirmation?: string;
  cohortsPath: string;
  approvalsPath: string;
  p0Path: string;
  p1Path: string;
  observationsPath: string;
  operationalEvidencePath: string;
  retirementPath: string;
  output?: string;
}) {
  assertDatabase(options.databaseUrl);
  const mutating = !["status", "retirement-check"].includes(options.action);
  if (mutating) {
    const expected = `APPLY-BP360-${options.action.toUpperCase()}-${options.environment.toUpperCase()}`;
    if (options.confirmation !== expected)
      throw new Error(`mutation requires --confirm=${expected}`);
    if (!uuid(options.actorId))
      throw new Error("mutations require --actor-id=<principal uuid>");
  }
  const root = resolve(import.meta.dirname, "../../../../../.."),
    cohorts = await json(root, options.cohortsPath),
    approvalDocument = await json(root, options.approvalsPath),
    observationDocument = await json(root, options.observationsPath),
    operational = await json(root, options.operationalEvidencePath),
    retirementDocument = await json(root, options.retirementPath),
    approved = (approvalDocument.approvals as unknown[]).filter(
      (item: any) => item?.status === "approved",
    ) as BusinessPartner360ApprovalEvidence[],
    approvalReasons = evaluateBusinessPartner360Approvals(approved),
    p0 = await evaluateBusinessPartner360P0ApprovalFile(
      resolve(root, options.p0Path),
      root,
    ),
    p1 = await evaluateBusinessPartner360P1QualificationFiles(
      resolve(root, options.p1Path),
      resolve(root, options.approvalsPath),
      root,
    ),
    entryReasons = [
      ...approvalReasons,
      ...(operational.technicalPassed === true
        ? []
        : ["OPERATIONAL_EVIDENCE_FAILED"]),
      ...(p0.p0Closed ? [] : ["P0_NOT_CLOSED"]),
      ...(p1.releaseReady ? [] : ["P1_NOT_RELEASE_READY"]),
    ],
    observations = (observationDocument.observations ??
      []) as BusinessPartner360ReleaseEvidence[],
    decisions = observations.map((evidence) => ({
      stage: evidence.stage,
      capturedAt: (evidence as any).capturedAt ?? null,
      ...evaluateBusinessPartner360Release(evidence),
    })),
    latest = (stage: string) =>
      [...decisions].reverse().find((item) => item.stage === stage),
    internalEligible = entryReasons.length === 0;
  validateCohorts(cohorts);
  validateObservationOrder(observations);
  const client = new Client({
    connectionString: options.databaseUrl,
    application_name: "bp360-rollout-controller",
  });
  await client.connect();
  try {
    const before = await state(client);
    if (options.action === "enable-internal") {
      if (!internalEligible)
        throw new Error(`internal enable blocked: ${entryReasons.join(",")}`);
      await mutate(
        client,
        options.actorId!,
        0,
        cohorts.internal,
        cohorts,
        "internal",
      );
    }
    if (options.action === "promote-canary") {
      if (!internalEligible)
        throw new Error(`canary promotion blocked: ${entryReasons.join(",")}`);
      const decision = latest("internal");
      if (
        decision?.decision !== "promote" ||
        !("nextStage" in decision) ||
        decision.nextStage !== "canary"
      )
        throw new Error(
          `canary promotion blocked: ${decision?.reasons?.join(",") ?? "INTERNAL_OBSERVATION_MISSING"}`,
        );
      await mutate(
        client,
        options.actorId!,
        0,
        [...cohorts.internal, ...cohorts.canary],
        cohorts,
        "canary",
      );
    }
    if (options.action === "promote-broad") {
      if (!internalEligible)
        throw new Error(`broad promotion blocked: ${entryReasons.join(",")}`);
      const decision = latest("canary");
      if (
        decision?.decision !== "promote" ||
        !("nextStage" in decision) ||
        decision.nextStage !== "broad"
      )
        throw new Error(
          `broad promotion blocked: ${decision?.reasons?.join(",") ?? "CANARY_OBSERVATION_MISSING"}`,
        );
      await mutate(
        client,
        options.actorId!,
        100,
        [...cohorts.internal, ...cohorts.canary],
        cohorts,
        "broad",
      );
    }
    if (options.action === "rollback") await rollback(client, options.actorId!);
    const after = await state(client),
      retirement = evaluateBusinessPartner360Retirement(
        retirementDocument.evidence as BusinessPartner360RetirementEvidence,
      ),
      inventory = await json(root, retirementDocument.consumerInventoryRef),
      knownConsumers = (inventory.surfaces as any[]).filter(
        (item) => item.kind === "consumer" && item.status !== "migrated",
      ).length;
    if (retirementDocument.evidence.knownConsumers !== knownConsumers)
      throw new Error(
        "retirement evidence knownConsumers does not match the governed inventory",
      );
    const result = {
      schemaVersion: 1,
      kind: "athyper.business-partner-360.rollout-control-evidence",
      capturedAt: new Date().toISOString(),
      action: options.action,
      environment: options.environment,
      mutated: mutating,
      before,
      after,
      entry: {
        internalEligible,
        entryReasons,
        approvalReasons,
        operationalTechnicalPassed: operational.technicalPassed === true,
        p0: {
          closed: p0.p0Closed,
          pendingEvidence: p0.pendingEvidence,
          pendingApprovals: p0.pendingApprovals,
          invalid: p0.invalid,
          missingEvidenceRefs: p0.missingEvidenceRefs,
        },
        p1: {
          releaseReady: p1.releaseReady,
          pendingEvidence: p1.pendingEvidence,
          pendingApprovals: p1.pendingApprovals,
          invalid: p1.invalid,
          missingEvidenceRefs: p1.missingEvidenceRefs,
        },
      },
      observations: decisions,
      retirement: {
        ...retirement,
        knownConsumers,
        legacyCalls: retirementDocument.evidence.legacyCalls,
        observationDays: retirementDocument.evidence.observationDays,
        telemetryRetentionDays:
          retirementDocument.evidence.telemetryRetentionDays,
      },
      deletionAvailable: false,
    };
    if (options.output) {
      const destination = resolve(root, options.output);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, `${JSON.stringify(result, null, 2)}\n`);
    }
    return result;
  } finally {
    await client.end();
  }
}

async function state(client: Client) {
  const flag = (
    await client.query(
      `SELECT id::text,code,default_enabled "defaultEnabled",rollout_pct "rolloutPct",status FROM control.feature_flag_catalog WHERE code=$1`,
      [FLAG],
    )
  ).rows[0];
  if (!flag) throw new Error("BP360 feature flag is absent");
  const overrides = (
    await client.query(
      `SELECT tenant.code "tenantCode",override.is_enabled "enabled",override.reason,override.status,override.effective_from "effectiveFrom",override.effective_until "effectiveUntil" FROM control.feature_flag_override override JOIN master.tenant tenant ON tenant.id=override.tenant_id WHERE override.feature_flag_id=$1::uuid AND override.status='active' ORDER BY tenant.code`,
      [flag.id],
    )
  ).rows;
  return { flag, overrides };
}
async function mutate(
  client: Client,
  actorId: string,
  rolloutPct: number,
  enabledCodes: string[],
  cohorts: any,
  stage: string,
) {
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      FLAG,
    ]);
    const flag = (
      await client.query(
        `SELECT id::text FROM control.feature_flag_catalog WHERE code=$1 AND status='active' FOR UPDATE`,
        [FLAG],
      )
    ).rows[0];
    if (!flag) throw new Error("active BP360 feature flag is absent");
    const permitted = new Set([...cohorts.internal, ...cohorts.canary]);
    for (const code of enabledCodes) {
      if (!permitted.has(code))
        throw new Error(`tenant is outside named cohorts: ${code}`);
      const tenant = (
        await client.query(
          `SELECT id::text FROM master.tenant WHERE code=$1 AND status='active'`,
          [code],
        )
      ).rows[0];
      if (!tenant || code === "system")
        throw new Error(`eligible tenant not found: ${code}`);
      const existing = (
        await client.query(
          `SELECT id::text,reason FROM control.feature_flag_override WHERE tenant_id=$1::uuid AND feature_flag_id=$2::uuid AND status='active' FOR UPDATE`,
          [tenant.id, flag.id],
        )
      ).rows[0];
      if (existing && !String(existing.reason).startsWith(PREFIX))
        throw new Error(`tenant has an unmanaged BP360 override: ${code}`);
      if (existing)
        await client.query(
          `UPDATE control.feature_flag_override SET is_enabled=true,reason=$3,updated_at=clock_timestamp(),updated_by=$4::uuid WHERE id=$1::uuid AND tenant_id=$2::uuid`,
          [existing.id, tenant.id, `${PREFIX}${stage}:${code}`, actorId],
        );
      else
        await client.query(
          `INSERT INTO control.feature_flag_override(id,tenant_id,feature_flag_id,is_enabled,reason,created_by)VALUES(md5($1)::uuid,$2::uuid,$3::uuid,true,$4,$5::uuid)`,
          [
            `${FLAG}:${tenant.id}`,
            tenant.id,
            flag.id,
            `${PREFIX}${stage}:${code}`,
            actorId,
          ],
        );
    }
    await client.query(
      `UPDATE control.feature_flag_catalog SET rollout_pct=$2,updated_at=clock_timestamp(),updated_by=$3::uuid WHERE id=$1::uuid`,
      [flag.id, rolloutPct, actorId],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
async function rollback(client: Client, actorId: string) {
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      FLAG,
    ]);
    const flag = (
      await client.query(
        `UPDATE control.feature_flag_catalog SET rollout_pct=0,updated_at=clock_timestamp(),updated_by=$2::uuid WHERE code=$1 RETURNING id::text`,
        [FLAG, actorId],
      )
    ).rows[0];
    if (!flag) throw new Error("BP360 feature flag is absent");
    await client.query(
      `UPDATE control.feature_flag_override SET is_enabled=false,reason=reason||':rollback',updated_at=clock_timestamp(),updated_by=$2::uuid WHERE feature_flag_id=$1::uuid AND status='active' AND reason LIKE 'bp360:%'`,
      [flag.id, actorId],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
function validateCohorts(value: any) {
  if (
    value.schemaVersion !== 1 ||
    value.featureCode !== FLAG ||
    !Array.isArray(value.internal) ||
    !Array.isArray(value.canary) ||
    value.internal.length < 1 ||
    value.canary.length < 1
  )
    throw new Error("cohort definition is invalid");
  const all = [...value.internal, ...value.canary];
  if (
    new Set(all).size !== all.length ||
    all.includes("system") ||
    all.some((code: any) => !/^[a-z][a-z0-9_-]{2,62}$/.test(code))
  )
    throw new Error("cohorts must be distinct named non-system tenants");
}
function validateObservationOrder(values: BusinessPartner360ReleaseEvidence[]) {
  const order = { internal: 0, canary: 1, broad: 2 };
  let previous = -1;
  for (const value of values) {
    const next = order[value.stage];
    if (next < previous)
      throw new Error("rollout observations are not stage ordered");
    previous = next;
  }
}
async function json(root: string, path: string) {
  return JSON.parse(await readFile(resolve(root, path), "utf8"));
}
function uuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
function assertDatabase(value: string) {
  assertLoopbackDatabaseTarget(value, "athyper_neon");
}
function option(args: string[], name: string) {
  return args
    .find((value) => value.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
function action(value: string | undefined): Action {
  if (!ACTIONS.includes(value as Action))
    throw new Error(`--action must be ${ACTIONS.join("|")}`);
  return value as Action;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2),
    databaseUrl =
      option(args, "--database-url") ??
      process.env["ATHYPER_NEON_DATABASE_ADMIN_URL"];
  if (!databaseUrl) throw new Error("--database-url is required");
  process.stdout.write(
    `${JSON.stringify(await manageBusinessPartner360Rollout({ action: action(option(args, "--action")), databaseUrl, environment: option(args, "--environment") ?? "local", actorId: option(args, "--actor-id"), confirmation: option(args, "--confirm"), cohortsPath: requiredOption(args, "--cohorts"), approvalsPath: requiredOption(args, "--approvals"), p0Path: requiredOption(args, "--p0"), p1Path: requiredOption(args, "--p1"), observationsPath: requiredOption(args, "--observations"), operationalEvidencePath: requiredOption(args, "--operational-evidence"), retirementPath: requiredOption(args, "--retirement"), output: option(args, "--output") }), null, 2)}\n`,
  );
}
