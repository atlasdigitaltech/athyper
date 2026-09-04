#!/usr/bin/env tsx
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import {
  sha256,
  stable as stableApproval,
  validateApprovalPacket,
  type ApprovalPacket,
} from "./governed-compatibility-approval.js";

type Surface = {
  code: string;
  kind: string;
  coordinates: string[];
  owner: string;
  replacement: string;
  disposition: string;
  migrationAction: string;
  consumerMigrationGate: string;
  rollbackGate: string;
  status: string;
};
type Observation = {
  surfaceCode: string;
  windowStart: string;
  windowEnd: string;
  productionUsageCount: number;
  consecutiveZeroUsageDays: number;
  consumerMigrationComplete: boolean;
  rollbackRehearsalPassed: boolean;
  dispositionComplete?: boolean;
  environment?: string;
  deploymentRelease?: string;
  evidenceHash?: string;
  evidence?: {
    kind?: string;
    usage?: Record<string, number>;
    sources?: {
      applicationMetrics?: string;
      databaseActivity?: string;
      productionDatabaseIdentity?: { sha256?: string };
      databaseStartCheckpoint?: { sha256?: string };
      consumerInventory?: { sha256?: string };
    };
    applicationMetrics?: { querySha256?: string; resultSha256?: string };
    database?: {
      activityQuerySha256?: string;
      activityResultSha256?: string;
      countsQuerySha256?: string;
      countsResultSha256?: string;
      startActivityResultSha256?: string;
      startCountsResultSha256?: string;
    };
  };
};
type Capture = {
  kind: string;
  environment: string;
  phase: string;
  catalogHash: string;
  privilegeHash: string;
  catalog: unknown[];
  privileges: unknown[];
};
type ConsumerInventory = {
  kind: string;
  results: Array<{
    surfaceCode: string;
    activeConsumerFileCount: number;
    files: string[];
  }>;
};
const args = new Map(
  process.argv.slice(2).map((value) => {
    const [key, ...rest] = value.split("=");
    return [key, rest.join("=") || "true"];
  }),
);
const root = resolve(import.meta.dirname, "../../../.."),
  configPath = resolve(
    root,
    "config/governance/governed-lifecycle-g6-retirement.v1.json",
  ),
  observationsPath = resolve(
    root,
    "config/governance/governed-lifecycle-g6-retirement-observations.v1.json",
  ),
  inside = (value: string) => {
    const path = resolve(root, value);
    if (path !== root && !path.startsWith(root + sep))
      throw new Error("evidence path escapes repository");
    return path;
  };
const config = JSON.parse(await readFile(configPath, "utf8")) as {
  observationPolicy: string;
  minimumConsecutiveZeroUsageDays: number;
  localDevelopmentPolicy?: {
    context: string;
    productionObservationCheckpointRequired: boolean;
    minimumConsecutiveZeroUsageDays: number;
    authorizesProductionRetirement: boolean;
  };
  requiredApprovals: string[];
  surfaces: Surface[];
};
if (config.observationPolicy !== "evidence_checkpoint_no_fixed_duration")
  throw new Error("unsupported G6 observation policy");
const executionContext = args.get("--execution-context") ?? "production",
  localDevelopment = executionContext === "local_development";
if (!new Set(["production", "local_development"]).has(executionContext))
  throw new Error(
    "--execution-context must be production or local_development",
  );
if (
  localDevelopment &&
  (!config.localDevelopmentPolicy ||
    config.localDevelopmentPolicy.context !== "local_development" ||
    config.localDevelopmentPolicy.productionObservationCheckpointRequired ||
    config.localDevelopmentPolicy.minimumConsecutiveZeroUsageDays !== 0 ||
    config.localDevelopmentPolicy.authorizesProductionRetirement)
)
  throw new Error(
    "local-development checkpoint waiver is not fail-closed for production",
  );
const ledger = JSON.parse(await readFile(observationsPath, "utf8")) as {
  observations: Observation[];
};
const load = async (name: string) => {
  const path = args.get(name);
  return path
    ? (JSON.parse(await readFile(resolve(root, path), "utf8")) as Capture)
    : null;
};
const cleanPre = await load("--clean-pre"),
  upgradePre = await load("--upgrade-pre"),
  cleanPost = await load("--clean-post"),
  upgradePost = await load("--upgrade-post");
const consumerInventoryPath = args.get("--consumer-inventory"),
  consumerInventory = consumerInventoryPath
    ? (JSON.parse(
        await readFile(resolve(root, consumerInventoryPath), "utf8"),
      ) as ConsumerInventory)
    : null;
const approvalDir = args.get("--approval-dir"),
  approvalPackets = new Map<
    string,
    { packet: ApprovalPacket | null; valid: boolean; errors: string[] }
  >();
for (const surface of config.surfaces) {
  let packet: ApprovalPacket | null = null;
  const errors: string[] = [];
  if (!approvalDir) errors.push("approval packet directory not supplied");
  else
    try {
      packet = JSON.parse(
        await readFile(inside(`${approvalDir}/${surface.code}.json`), "utf8"),
      ) as ApprovalPacket;
      errors.push(...validateApprovalPacket(packet, surface.code));
      const codes = new Set(packet.evidence.map((value) => value.code));
      for (const code of [
        "retirement_register",
        "consumer_inventory",
        "production_observation",
        "recovery_rehearsal",
        "retirement_candidate",
        "clean_pre_retirement",
        "supported_upgrade_pre_retirement",
      ])
        if (!codes.has(code)) errors.push(`approval evidence lacks ${code}`);
      for (const evidence of packet.evidence) {
        if (evidence.code === "production_observation") continue;
        const bytes = await readFile(inside(evidence.source));
        if (sha256(bytes) !== evidence.sha256)
          errors.push(`${evidence.code} source hash changed`);
      }
      const recoveryRef = packet.evidence.find(
          (value) => value.code === "recovery_rehearsal",
        ),
        recovery = recoveryRef
          ? JSON.parse(await readFile(inside(recoveryRef.source), "utf8"))
          : null;
      if (
        recovery?.surfaceCode !== surface.code ||
        recovery?.result !== "passed"
      )
        errors.push(
          "approval recovery evidence is not a passing surface report",
        );
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  approvalPackets.set(surface.code, {
    packet,
    valid: errors.length === 0,
    errors: [...new Set(errors)],
  });
}
const parity = (
  clean: Capture | null,
  upgrade: Capture | null,
  phase: string,
) =>
  Boolean(
    clean &&
    upgrade &&
    clean.kind === "athyper.g6-compatibility-parity-capture" &&
    upgrade.kind === clean.kind &&
    clean.environment === "clean" &&
    upgrade.environment === "supported_upgrade" &&
    clean.phase === phase &&
    upgrade.phase === phase &&
    clean.catalogHash === upgrade.catalogHash &&
    clean.privilegeHash === upgrade.privilegeHash &&
    JSON.stringify(clean.catalog) === JSON.stringify(upgrade.catalog) &&
    JSON.stringify(clean.privileges) === JSON.stringify(upgrade.privileges),
  );
const preParity = parity(cleanPre, upgradePre, "pre_retirement"),
  postParity = parity(cleanPost, upgradePost, "post_retirement");
const results = config.surfaces.map((surface) => {
  const matching = ledger.observations
    .filter((row) => row.surfaceCode === surface.code)
    .sort((a, b) => Date.parse(a.windowEnd) - Date.parse(b.windowEnd));
  const observation = matching.at(-1);
  const sourceUsage =
    consumerInventory?.kind === "athyper.g6-compatibility-consumer-inventory"
      ? consumerInventory.results.find(
          (row) => row.surfaceCode === surface.code,
        )
      : undefined;
  const hashes = [
    observation?.evidenceHash,
    observation?.evidence?.sources?.productionDatabaseIdentity?.sha256,
    observation?.evidence?.sources?.databaseStartCheckpoint?.sha256,
    observation?.evidence?.sources?.consumerInventory?.sha256,
    observation?.evidence?.applicationMetrics?.querySha256,
    observation?.evidence?.applicationMetrics?.resultSha256,
    observation?.evidence?.database?.activityQuerySha256,
    observation?.evidence?.database?.activityResultSha256,
    observation?.evidence?.database?.countsQuerySha256,
    observation?.evidence?.database?.countsResultSha256,
    observation?.evidence?.database?.startActivityResultSha256,
    observation?.evidence?.database?.startCountsResultSha256,
  ];
  const evidenceHashValid = Boolean(
      observation?.evidence &&
      observation.evidenceHash ===
        createHash("sha256").update(stable(observation.evidence)).digest("hex"),
    ),
    usageBound =
      observation?.evidence?.usage?.[surface.code] ===
      observation?.productionUsageCount,
    windowDays = observation
      ? Math.floor(
          (Date.parse(observation.windowEnd) -
            Date.parse(observation.windowStart)) /
            86400000,
        )
      : -1,
    zeroDaysBound = Boolean(
      observation &&
      Number.isInteger(observation.consecutiveZeroUsageDays) &&
      observation.consecutiveZeroUsageDays >= 0 &&
      observation.consecutiveZeroUsageDays <= windowDays &&
      (observation.productionUsageCount === 0 ||
        observation.consecutiveZeroUsageDays === 0),
    );
  const authenticProductionEvidence = Boolean(
    observation?.environment === "production" &&
    observation.deploymentRelease &&
    observation.evidence?.kind ===
      "athyper.g6-production-compatibility-observation-evidence" &&
    observation.evidence.sources?.applicationMetrics &&
    observation.evidence.sources.databaseActivity &&
    hashes.every(
      (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value),
    ) &&
    evidenceHashValid &&
    usageBound &&
    zeroDaysBound,
  );
  const approval = approvalPackets.get(surface.code),
    packetObservation = approval?.packet?.evidence.find(
      (value) => value.code === "production_observation",
    ),
    approvalBoundToObservation = Boolean(
      observation &&
      packetObservation?.subjectEvidenceHash === observation.evidenceHash &&
      packetObservation?.sha256 === sha256(stableApproval(observation)),
    );
  const sourceCutover = Boolean(
      sourceUsage && sourceUsage.activeConsumerFileCount === 0,
    ),
    evidenceFacts = {
      observationPresent: Boolean(observation),
      authenticProductionEvidence,
      zeroProductionUsage: Boolean(
        observation && observation.productionUsageCount === 0,
      ),
      minimumConsecutiveZeroUsage: Boolean(
        observation &&
          observation.consecutiveZeroUsageDays >=
            config.minimumConsecutiveZeroUsageDays,
      ),
    },
    gates = {
      observationPresent:
        localDevelopment || evidenceFacts.observationPresent,
      authenticProductionEvidence:
        localDevelopment || authenticProductionEvidence,
      zeroProductionUsage:
        localDevelopment || evidenceFacts.zeroProductionUsage,
      minimumConsecutiveZeroUsage:
        localDevelopment || evidenceFacts.minimumConsecutiveZeroUsage,
      activeConsumerReferencesZero: sourceCutover,
      consumerMigrationComplete: localDevelopment
        ? sourceCutover
        : Boolean(observation?.consumerMigrationComplete),
      rollbackRehearsalPassed: Boolean(observation?.rollbackRehearsalPassed),
      approvalsComplete: Boolean(
        approval?.valid && (localDevelopment || approvalBoundToObservation),
      ),
      dispositionComplete:
        surface.kind !== "documentation" ||
        (localDevelopment
          ? sourceCutover
          : Boolean(observation?.dispositionComplete)),
      cleanUpgradePreParity: preParity,
    };
  const preflightEligible = Object.values(gates).every(Boolean);
  return {
    surfaceCode: surface.code,
    owner: surface.owner,
    disposition: surface.disposition,
    status: preflightEligible
      ? "eligible_to_schedule_retirement"
      : "blocked_retained",
    activeConsumerFiles: sourceUsage?.files ?? [],
    approvalPacketHash: approval?.packet?.packetHash ?? null,
    approvalErrors: approval?.errors ?? ["approval packet absent"],
    evidenceFacts,
    waivedGates: localDevelopment
      ? Object.entries(evidenceFacts)
          .filter(([, satisfied]) => !satisfied)
          .map(([gate]) => gate)
      : [],
    gates,
    blockingReasons: Object.entries(gates)
      .filter(([, passed]) => !passed)
      .map(([gate]) => gate),
    migrationAction: surface.migrationAction,
  };
});
const allPreflightEligible = results.every(
    (row) => row.status === "eligible_to_schedule_retirement",
  ),
  retirementCertified = allPreflightEligible && postParity;
const report = {
  schemaVersion: 1,
  kind: "athyper.g6-compatibility-retirement-evaluation",
  evaluatedAt: new Date().toISOString(),
  executionContext,
  productionRetirementAuthorized:
    executionContext === "production" && allPreflightEligible,
  preParity,
  postParity,
  allPreflightEligible,
  retirementCertified,
  destructiveMigrationAuthorized: false,
  results,
  note: localDevelopment
    ? "Local development waives only the production observation checkpoint and never authorizes production retirement. Consumer cutover, rollback, signed approval, behavioral and parity controls remain enforced."
    : "This evaluator never executes DDL. A separately reviewed migration may be scheduled only when all preflight gates pass; retirement is certified only after clean/supported-upgrade post-parity also passes.",
};
const output = args.get("--output");
if (output) {
  if (args.get("--confirm") !== "RECORD-G6-RETIREMENT-EVALUATION")
    throw new Error(
      "writing requires --confirm=RECORD-G6-RETIREMENT-EVALUATION",
    );
  const target = resolve(root, output);
  if (!target.startsWith(resolve(root, "docs/architecture/reports/g6") + "/"))
    throw new Error("output must be under docs/architecture/reports/g6");
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(report, null, 2)}\n`);
}
for (const row of results)
  process.stdout.write(
    `${row.status.toUpperCase()} ${row.surfaceCode} ${row.blockingReasons.join(",") || "all-preflight-gates-pass"}\n`,
  );
if (args.has("--require-eligible") && !allPreflightEligible)
  process.exitCode = 2;
else
  process.stdout.write(
    `G6_RETIREMENT_GATE ${retirementCertified ? "CERTIFIED" : "BLOCKED"} eligible=${results.filter((row) => row.status === "eligible_to_schedule_retirement").length}/${results.length}\n`,
  );
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
