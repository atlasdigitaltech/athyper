#!/usr/bin/env tsx
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
const dbRoot = resolve(import.meta.dirname, "../../.."),
  root = resolve(dbRoot, "../.."),
  failures: string[] = [];
const containsToken = (source: string, token: string) =>
  source.replace(/\s+/gu, "").includes(token.replace(/\s+/gu, ""));
const register = JSON.parse(
  await readFile(
    resolve(root, "config/governance/governed-lifecycle-g6-retirement.v1.json"),
    "utf8",
  ),
) as {
  observationPolicy: string;
  minimumConsecutiveZeroUsageDays: number;
  localDevelopmentPolicy?: {
    productionObservationCheckpointRequired: boolean;
    minimumConsecutiveZeroUsageDays: number;
    authorizesProductionRetirement: boolean;
  };
  localDevelopmentDisposition?: {
    status: string;
    productionRetirementAuthorized: boolean;
    evidence: string;
  };
  requiredApprovals: string[];
  surfaces: Array<
    Record<string, unknown> & {
      code: string;
      coordinates: string[];
      status: string;
    }
  >;
};
const ledger = JSON.parse(
  await readFile(
    resolve(
      root,
      "config/governance/governed-lifecycle-g6-retirement-observations.v1.json",
    ),
    "utf8",
  ),
) as { observationPolicy: string; observations: unknown[] };
const currentConsumers = JSON.parse(
  await readFile(
    resolve(
      root,
      "docs/architecture/reports/g6/current-consumer-inventory.json",
    ),
    "utf8",
  ),
) as {
  kind: string;
  results: Array<{ surfaceCode: string; activeConsumerFileCount: number }>;
};
const currentGate = JSON.parse(
  await readFile(
    resolve(root, "docs/architecture/reports/g6/current-retirement-gate.json"),
    "utf8",
  ),
) as {
  allPreflightEligible: boolean;
  retirementCertified: boolean;
  destructiveMigrationAuthorized: boolean;
  results: Array<{ surfaceCode: string; status: string }>;
};
const localRetirement = register.localDevelopmentDisposition
  ? (JSON.parse(
      await readFile(
        resolve(root, register.localDevelopmentDisposition.evidence),
        "utf8",
      ),
    ) as {
      kind: string;
      executionContext: string;
      status: string;
      authorization: { productionRetirementAuthorized: boolean };
      surfaces: Array<{ code: string; result: string }>;
    })
  : null;
const localRetirementValid = Boolean(
  register.localDevelopmentDisposition?.status === "retired" &&
    !register.localDevelopmentDisposition.productionRetirementAuthorized &&
    localRetirement?.kind === "athyper.g6-local-development-retirement" &&
    localRetirement.executionContext === "local_development" &&
    localRetirement.status === "complete" &&
    !localRetirement.authorization.productionRetirementAuthorized &&
    localRetirement.surfaces.length === 6 &&
    localRetirement.surfaces.every((surface) => surface.result === "retired"),
);
const expected = new Set([
  "business_partner_request_family",
  "business_partner_aliases_cache",
  "flattened_decision_scope",
  "workforce_iam_projection",
  "business_partner_person_group_compatibility",
  "temporary_implementation_inventory",
]);
for (const surface of register.surfaces) {
  if (!expected.delete(surface.code))
    failures.push(`unexpected or duplicate G6 surface ${surface.code}`);
  for (const field of [
    "kind",
    "owner",
    "replacement",
    "usageMeasure",
    "compatibilityWindow",
    "removalGate",
    "disposition",
    "migrationAction",
    "consumerMigrationGate",
    "rollbackGate",
    "status",
  ] as const)
    if (
      typeof surface[field] !== "string" ||
      !(surface[field] as string).trim()
    )
      failures.push(`${surface.code} lacks ${field}`);
  if (!surface.coordinates.length)
    failures.push(`${surface.code} lacks coordinates`);
}
for (const code of expected) failures.push(`missing G6 surface ${code}`);
if (
  register.observationPolicy !== "evidence_checkpoint_no_fixed_duration" ||
  register.minimumConsecutiveZeroUsageDays < 14 ||
  register.requiredApprovals.length < 3
)
  failures.push(
    "G6 evidence/approval gates are weaker than the revised contract",
  );
if (
  !register.localDevelopmentPolicy ||
  register.localDevelopmentPolicy.productionObservationCheckpointRequired ||
  register.localDevelopmentPolicy.minimumConsecutiveZeroUsageDays !== 0 ||
  register.localDevelopmentPolicy.authorizesProductionRetirement
)
  failures.push(
    "G6 local-development checkpoint waiver can authorize production or still imposes elapsed time",
  );
if (ledger.observationPolicy !== register.observationPolicy)
  failures.push("G6 register and observation ledger policies differ");
if (
  ledger.observations.length === 0 &&
  register.surfaces.some(
    (surface) => surface.status !== "retained_not_removal_eligible",
  )
)
  failures.push(
    "an empty observation ledger cannot make a surface removal-eligible",
  );
if (
  currentConsumers.kind !== "athyper.g6-compatibility-consumer-inventory" ||
  currentConsumers.results.length !== register.surfaces.length
)
  failures.push("current G6 consumer inventory is incomplete");
for (const code of [
  "business_partner_aliases_cache",
  "flattened_decision_scope",
  "workforce_iam_projection",
  "business_partner_person_group_compatibility",
] as const) {
  const usage = currentConsumers.results.find(
    (row) => row.surfaceCode === code,
  );
  if (!usage || usage.activeConsumerFileCount !== 0)
    failures.push(`${code} runtime consumer cutover is incomplete`);
}
if (
  currentGate.allPreflightEligible ||
  currentGate.retirementCertified ||
  currentGate.destructiveMigrationAuthorized ||
  currentGate.results.length !== register.surfaces.length ||
  currentGate.results.some((row) => row.status !== "blocked_retained")
)
  failures.push(
    "current G6 gate must retain every surface while evidence is incomplete",
  );
const capture = await readFile(
    resolve(
      dbRoot,
      "scripts/operations/capture-governed-compatibility-parity.ts",
    ),
    "utf8",
  ),
  evaluate = await readFile(
    resolve(
      dbRoot,
      "scripts/operations/evaluate-governed-compatibility-retirement.ts",
    ),
    "utf8",
  ),
  consumerInventory = await readFile(
    resolve(
      dbRoot,
      "scripts/operations/inventory-governed-compatibility-consumers.ts",
    ),
    "utf8",
  ),
  approvalAssembler = await readFile(
    resolve(
      dbRoot,
      "scripts/operations/assemble-governed-compatibility-approval-packet.ts",
    ),
    "utf8",
  ),
  approvalContract = await readFile(
    resolve(dbRoot, "scripts/operations/governed-compatibility-approval.ts"),
    "utf8",
  ),
  approvalRegister = JSON.parse(
    await readFile(
      resolve(
        root,
        "config/governance/governed-lifecycle-g6-approval-packets.v1.json",
      ),
      "utf8",
    ),
  ) as {
    requiredRoles: string[];
    surfaces: string[];
    signatureAlgorithm: string;
  },
  retirementSequence = JSON.parse(
    await readFile(
      resolve(
        root,
        "config/governance/governed-lifecycle-g6-retirement-sequence.v1.json",
      ),
      "utf8",
    ),
  ) as {
    policy: string;
    state: { certifiedThroughOrder: number; nextSurface: string };
    surfaces: Array<{ order: number; code: string; migration: string }>;
  },
  retirementApply = await readFile(
    resolve(
      dbRoot,
      "scripts/operations/apply-governed-compatibility-retirement.ts",
    ),
    "utf8",
  ),
  retirementCertify = await readFile(
    resolve(
      dbRoot,
      "scripts/operations/certify-governed-compatibility-retirement.ts",
    ),
    "utf8",
  ),
  manifest = await readFile(
    resolve(dbRoot, "migrations/manifests/neon.txt"),
    "utf8",
  );
for (const token of [
  "READ ONLY, ISOLATION LEVEL REPEATABLE READ",
  "pre_retirement",
  "post_retirement",
  "catalogHash",
  "privilegeHash",
  "role_column_grants",
  "role_routine_grants",
  "pg_get_functiondef",
  "business_partner_category_d",
  "CAPTURE-G6-COMPATIBILITY-PARITY",
])
  if (!containsToken(capture, token))
    failures.push(`G6 parity capture lacks ${token}`);
for (const token of [
  "observationPolicy",
  "minimumConsecutiveZeroUsageDays",
  "activeConsumerReferencesZero",
  "consumerMigrationComplete",
  "rollbackRehearsalPassed",
  "approvalsComplete",
  "cleanUpgradePreParity",
  "destructiveMigrationAuthorized:false",
  "--require-eligible",
])
  if (!containsToken(evaluate, token))
    failures.push(`G6 evaluator lacks ${token}`);
for (const token of [
  "--execution-context",
  "local_development",
  "productionRetirementAuthorized",
  "authorizesProductionRetirement",
  "localDevelopment||authenticProductionEvidence",
])
  if (!containsToken(evaluate, token))
    failures.push(`G6 evaluator lacks local-development isolation ${token}`);
for (const token of [
  "validateApprovalPacket",
  "approvalBoundToObservation",
  "--approval-dir",
  "approvalPacketHash",
])
  if (!containsToken(evaluate, token))
    failures.push(`G6 evaluator lacks signed approval control ${token}`);
if (evaluate.includes("approvals.includes"))
  failures.push("G6 evaluator still accepts name-only approval arrays");
for (const token of [
  "PREPARE-G6-APPROVAL-PACKET",
  "CANONICALIZE-G6-ATTESTATION",
  "ASSEMBLE-G6-APPROVAL-PACKET",
  "recovery.migrationSha256!==migrationHash",
])
  if (!containsToken(approvalAssembler, token))
    failures.push(`G6 approval assembler lacks ${token}`);
for (const token of [
  "ed25519",
  "verify(null",
  "consumerCutover",
  "semanticCompatibility",
  "forwardFixPlan",
  "not independent",
  "evidenceHashes",
])
  if (!containsToken(approvalContract, token))
    failures.push(`G6 approval contract lacks ${token}`);
if (
  approvalRegister.signatureAlgorithm !== "ed25519" ||
  approvalRegister.surfaces.length !== register.surfaces.length ||
  approvalRegister.requiredRoles.sort().join(",") !==
    register.requiredApprovals.sort().join(",")
)
  failures.push("G6 approval register differs from retirement authority");
const retirementOrder = [
  "temporary_implementation_inventory",
  "business_partner_aliases_cache",
  "flattened_decision_scope",
  "business_partner_person_group_compatibility",
  "workforce_iam_projection",
  "business_partner_request_family",
];
if (
  retirementSequence.policy !== "one_surface_per_release_no_skips" ||
  retirementSequence.state.certifiedThroughOrder !== 0 ||
  retirementSequence.state.nextSurface !== retirementOrder[0] ||
  retirementSequence.surfaces.map((value) => value.code).join(",") !==
    retirementOrder.join(",") ||
  retirementSequence.surfaces.some((value, index) => value.order !== index + 1)
)
  failures.push("G6 incremental retirement order or initial state is invalid");
for (const surface of retirementSequence.surfaces) {
  try {
    await access(resolve(root, surface.migration));
  } catch {
    failures.push(`G6 staged migration is absent: ${surface.migration}`);
  }
  if (manifest.includes(surface.migration.split("/").at(-1)!))
    failures.push(
      `G6 staged migration is active before eligibility: ${surface.migration}`,
    );
}
for (const token of [
  "validateApprovalPacket",
  "certifiedThroughOrder+1",
  "pg_advisory_xact_lock",
  "lock_timeout='5s'",
  "statement_timeout='15min'",
  "APPLY-G6-RETIREMENT:",
  "rolled_back",
])
  if (!containsToken(retirementApply, token))
    failures.push(`G6 retirement apply control lacks ${token}`);
for (const token of [
  "production-application",
  "clean-application",
  "upgrade-application",
  "post_retirement",
  "JSON.stringify(cleanPost.catalog)",
  "JSON.stringify(cleanPost.privileges)",
  "forwardFixRequired:false",
])
  if (!containsToken(retirementCertify, token))
    failures.push(`G6 retirement certification lacks ${token}`);
for (const token of [
  "business_partner_request_family",
  "business_partner_aliases_cache",
  "flattened_decision_scope",
  "workforce_iam_projection",
  "business_partner_person_group_compatibility",
  "temporary_implementation_inventory",
  "activeConsumerFileCount",
  "nonRuntimeReferenceFiles",
  "runtime_candidate",
  "RECORD-G6-CONSUMER-INVENTORY",
])
  if (!containsToken(consumerInventory, token))
    failures.push(`G6 consumer inventory lacks ${token}`);
if (/202609\d+_neon_governed_lifecycle_g6_retirement\.sql/.test(manifest))
  failures.push(
    "G6 destructive migration is manifest-active before eligibility",
  );
for (const path of [
  "server/db/ddl/planes/neon/document/03_tables.sql",
  "server/db/ddl/planes/neon/master/03_tables.sql",
  "server/db/ddl/planes/neon/control/03_tables.sql",
])
  try {
    await access(resolve(root, path));
  } catch {
    failures.push(`retained G6 authority is missing: ${path}`);
  }
const inventoryPath = resolve(
  root,
  "docs/architecture/plans/governed-entity-lifecycle-implementation-inventory.md",
);
try {
  await access(inventoryPath);
  if (localRetirementValid)
    failures.push("locally retired temporary implementation inventory still exists");
} catch {
  if (!localRetirementValid)
    failures.push(
      "temporary implementation inventory is missing without valid local retirement evidence",
    );
}
if (failures.length) {
  for (const failure of failures) process.stderr.write(`FAIL ${failure}\n`);
  process.exitCode = 1;
} else
  process.stdout.write(
    `PASS ${register.surfaces.length} production G6 surfaces remain fail-closed; local development retired ${localRetirement?.surfaces.length ?? 0} surfaces\n`,
  );
