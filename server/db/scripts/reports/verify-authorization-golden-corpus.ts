#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Plane = "neon" | "admin" | "mesh";
type LegacyEngine =
  | "legacy_single"
  | "legacy_batch"
  | "legacy_admin"
  | "legacy_mesh";

const REQUIRED_GATES = [
  "activeNeonPrincipalInventoryNonEmpty",
  "activeNeonUserInventoryNonEmpty",
  "everyActiveNeonPrincipalIncluded",
  "everyActiveNeonUserIncluded",
  "highRiskActionInventoryNonEmpty",
  "everyHighRiskActionIncluded",
  "exactNeonPrincipalActionCrossProduct",
  "everyActivePrincipalHasIdentityBinding",
  "everyActionMappedOrClassified",
  "allRequiredContextClassesCaptured",
  "allRequiredLegacyEnginesCaptured",
  "allLegacyEngineDisagreementsClassified",
  "meshIdentityInventoryCaptured",
  "activeMeshPrincipalInventoryNonEmpty",
  "activeMeshUserInventoryNonEmpty",
  "everyActiveMeshPrincipalHasIdentityBinding",
  "meshDecisionCorpusCaptured",
  "neonCaptureBoundaryComplete",
  "meshCaptureBoundaryComplete",
  "distinctPlaneSourceDatabaseIds",
  "identityAuthorityEvidenceCaptured",
  "identityAuthorityReconciled",
  "repositoryCatalogProvenanceRecorded",
  "repositoryStateClean",
] as const;

if (process.argv.includes("--help")) {
  process.stdout.write(
    "Usage: verify-authorization-golden-corpus.ts "
      + "--corpus=PATH [--catalog=PATH] [--strict]\n"
      + "Strict mode requires every fail-closed coverage gate, including Mesh "
      + "decisions, all contexts/legacy engines, durable plane boundaries, and "
      + "external identity reconciliation.\n",
  );
  process.exit(0);
}

const corpusArgument = valueArgument("--corpus=");
if (!corpusArgument) throw new Error("--corpus=<path> is required.");
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../../../..");
const corpusPath = resolve(corpusArgument);
const catalogArgument = valueArgument("--catalog=");
const catalogPath = catalogArgument
  ? resolve(catalogArgument)
  : resolve(
      repositoryRoot,
      "config/governance/authorization-high-risk-action-catalog.v1.json",
    );
const catalogRepositoryPath = repositoryRelativePath(
  repositoryRoot,
  catalogPath,
);
const strict = process.argv.includes("--strict");
const corpus = requireRecord(
  JSON.parse(await readFile(corpusPath, "utf8")) as unknown,
  "corpus",
);
const catalog = requireRecord(
  JSON.parse(await readFile(catalogPath, "utf8")) as unknown,
  "catalog",
);
const failures: string[] = [];

if (corpus.schemaVersion !== 1) failures.push("schemaVersion must be 1");
if (corpus.readOnly !== true) failures.push("readOnly must be true");

const capture = optionalRecord(corpus.capture);
const inventory = optionalRecord(corpus.identityInventory);
const coverage = optionalRecord(corpus.coverage);
const hashes = optionalRecord(corpus.hashes);
const principals = arrayValue(inventory?.neonActivePrincipals);
const meshPrincipals = arrayValue(inventory?.meshActivePrincipals);
const actions = arrayValue(corpus.actions);
const cases = arrayValue(corpus.cases);
const disagreements = arrayValue(corpus.engineDisagreements);
const requiredLegacyEngines = readRequiredLegacyEngines(catalog, failures);
const requiredContextClasses = readRequiredContextClasses(catalog, failures);

if (!capture) failures.push("Capture provenance is missing");
if (!inventory) failures.push("Identity inventory is missing");
if (!coverage) failures.push("Coverage is missing");
if (!hashes) failures.push("Hashes are missing");
if (!Array.isArray(corpus.actions)) failures.push("Actions are missing");
if (!Array.isArray(corpus.cases)) failures.push("Decision cases are missing");
if (!Array.isArray(corpus.engineDisagreements)) {
  failures.push("Engine disagreements are missing");
}

if (principals.length === 0) failures.push("No active Neon principals were captured");
if (actions.length === 0) failures.push("No high-risk actions were captured");
if (meshPrincipals.length === 0 && strict) {
  failures.push("No active Mesh principals were captured");
}

const expectedCases = principals.length * actions.length;
if (cases.length !== expectedCases) {
  failures.push(`Expected ${expectedCases} Neon scaffold cases, found ${cases.length}`);
}
const caseIds = cases.map((item) => stringProperty(item, "caseId"));
if (caseIds.some((caseId) => caseId === null)) {
  failures.push("Every case must have a caseId");
} else if (new Set(caseIds).size !== cases.length) {
  failures.push("caseId values are not unique");
}
for (const [index, caseValue] of cases.entries()) {
  const item = optionalRecord(caseValue);
  if (!item) {
    failures.push(`cases[${index}] must be an object`);
    continue;
  }
  if (!isUuid(item.tenantId)) {
    failures.push(`cases[${index}].tenantId is not a UUID`);
  }
  if (!isUuid(item.principalId)) {
    failures.push(`cases[${index}].principalId is not a UUID`);
  }
  if (!isUuid(item.permissionId)) {
    failures.push(`cases[${index}].permissionId is not a UUID`);
  }
  if (
    typeof item.contextClass !== "string" ||
    item.contextClass.trim().length === 0
  ) {
    failures.push(`cases[${index}].contextClass is missing`);
  }
  if (item.riskLevel !== "high" && item.riskLevel !== "critical") {
    failures.push(`cases[${index}].riskLevel must be high or critical`);
  }
  const casePlanes = arrayValue(item.planeEligibility);
  if (
    casePlanes.length === 0 ||
    new Set(casePlanes).size !== casePlanes.length ||
    casePlanes.some(
      (plane) => plane !== "neon" && plane !== "admin" && plane !== "mesh",
    )
  ) {
    failures.push(`cases[${index}].planeEligibility is invalid`);
  }
  const legacy = optionalRecord(item.legacy);
  if (
    !legacy ||
    typeof legacy.single !== "string" ||
    typeof legacy.batch !== "string" ||
    (legacy.admin !== null && typeof legacy.admin !== "string") ||
    legacy.mesh !== null
  ) {
    failures.push(
      `cases[${index}].legacy is not a valid schema-v1 scaffold decision`,
    );
  }
  const expectedCaseId = hashCanonical({
    tenantId: item.tenantId,
    principalId: item.principalId,
    permissionId: item.permissionId,
    contextClass: item.contextClass,
  });
  if (item.caseId !== expectedCaseId) {
    failures.push(`cases[${index}].caseId does not match its v1 case identity`);
  }
}

verifyHash(hashes, "casesSha256", cases, failures);
verifyHash(hashes, "actionsSha256", actions, failures);
verifyHash(hashes, "engineDisagreementsSha256", disagreements, failures);
verifyHash(
  hashes,
  "identitySha256",
  { neon: principals, mesh: meshPrincipals },
  failures,
);
const catalogSha256 = hashCanonical(catalog);
if (hashes?.catalogSha256 !== catalogSha256) {
  failures.push("catalogSha256 does not match the repository catalog");
}

const currentRevision = gitRevision(repositoryRoot);
const currentRepositoryStateClean = gitWorkingTreeClean(
  repositoryRoot,
  corpusPath,
);
const catalogProvenanceValid =
  currentRevision !== "unavailable" &&
  capture?.repositoryRevision === currentRevision &&
  capture?.catalogPath === catalogRepositoryPath;
if (!catalogProvenanceValid) {
  failures.push(
    "Capture repository revision/catalog path does not match the checked-out repository catalog",
  );
}

const neonBoundary = optionalRecord(capture?.neon);
const meshBoundary = optionalRecord(capture?.mesh);
const neonCaptureBoundaryComplete = isCompleteCaptureBoundary(
  neonBoundary,
  "neon",
);
const meshCaptureBoundaryComplete = isCompleteCaptureBoundary(
  meshBoundary,
  "mesh",
);
const distinctPlaneSourceDatabaseIds =
  neonCaptureBoundaryComplete &&
  meshCaptureBoundaryComplete &&
  neonBoundary?.source_database_id !== meshBoundary?.source_database_id;
if (!neonCaptureBoundaryComplete) {
  failures.push("Neon capture boundary lacks a durable source ID/watermark");
}
if (strict && !meshCaptureBoundaryComplete) {
  failures.push("Mesh capture boundary lacks a durable source ID/watermark");
}
if (strict && !distinctPlaneSourceDatabaseIds) {
  failures.push("Neon and Mesh source_database_id values must be distinct");
}
const supplementalDecisionResult = verifySupplementalDecisionEvidence(
  optionalRecord(corpus.supplementalDecisionEvidence),
  {
    repositoryRevision: currentRevision,
    governanceCatalogSha256: catalogSha256,
    neonBoundary,
    meshBoundary,
    meshPrincipalIds: meshPrincipals
      .map((principal) => stringProperty(principal, "id"))
      .filter((value): value is string => value !== null),
  },
  failures,
);
const supplementalDecisionEvidenceHash =
  supplementalDecisionResult.items.length > 0
    ? hashCanonical(supplementalDecisionResult.items)
    : null;
if (
  hashes?.supplementalDecisionEvidenceSha256 !==
  supplementalDecisionEvidenceHash
) {
  failures.push(
    "supplementalDecisionEvidenceSha256 does not match embedded supplemental evidence",
  );
}

const principalIds = new Set(
  principals
    .map((principal) => stringProperty(principal, "id"))
    .filter((value): value is string => value !== null),
);
const casePrincipalIds = new Set(
  cases
    .map((item) => stringProperty(item, "principalId"))
    .filter((value): value is string => value !== null),
);
const activeNeonUsers = principals.filter(
  (principal) => property(principal, "principalType") === "user",
);
const activeMeshUsers = meshPrincipals.filter((principal) =>
  isMeshUserPrincipalType(String(property(principal, "principalType") ?? "")),
);
const missingIdentityBindings = principals
  .filter((principal) => activeBindings(principal, "neon").length === 0)
  .map((principal) => String(property(principal, "id") ?? ""));
const missingMeshIdentityBindings = meshPrincipals
  .filter((principal) => activeBindings(principal, "mesh").length === 0)
  .map((principal) => String(property(principal, "id") ?? ""));
const actionPermissionIds = new Set(
  actions
    .map((action) => stringProperty(action, "id"))
    .filter((value): value is string => value !== null),
);
const casePermissionIds = new Set(
  cases
    .map((item) => stringProperty(item, "permissionId"))
    .filter((value): value is string => value !== null),
);
const unmappedActions = actions
  .filter((action) => arrayValue(property(action, "operations")).length === 0)
  .map((action) => String(property(action, "code") ?? ""));
const capturedContextClasses = uniqueSorted(
  [
    ...cases
      .map((item) => stringProperty(item, "contextClass"))
      .filter((value): value is string => value !== null),
    ...supplementalDecisionResult.cases
      .map((item) => stringProperty(item, "contextClass"))
      .filter((value): value is string => value !== null),
  ],
);
const missingContextClasses = requiredContextClasses.filter(
  (context) => !capturedContextClasses.includes(context),
);
const capturedLegacyEngines = uniqueSorted([
  ...deriveCapturedLegacyEngines(cases),
  ...supplementalDecisionResult.cases
    .map((item) => stringProperty(item, "engine"))
    .filter((value): value is LegacyEngine =>
      value === "legacy_single" ||
      value === "legacy_batch" ||
      value === "legacy_admin" ||
      value === "legacy_mesh"
    ),
]);
const missingLegacyEngines = requiredLegacyEngines.filter(
  (engine) => !capturedLegacyEngines.includes(engine),
);
const allDisagreements = [
  ...disagreements,
  ...supplementalDecisionResult.disagreements,
];
const allDisagreementsClassified = allDisagreements.every((item) => {
  const classification = stringProperty(item, "classification");
  return classification !== null && classification.trim().length > 0;
});
const meshDecisionCorpusCaptured =
  supplementalDecisionResult.meshDecisionCorpusCaptured;

const identityAuthorityEvidence = optionalRecord(
  corpus.identityAuthorityEvidence,
);
const identityReconciliation = verifyIdentityAuthorityEvidence(
  identityAuthorityEvidence,
  principals,
  meshPrincipals,
  failures,
);
const identityAuthorityEvidenceCaptured =
  identityAuthorityEvidence?.status === "captured";
const identityAuthorityEvidenceHash = identityAuthorityEvidenceCaptured
  ? hashCanonical(identityAuthorityEvidence)
  : null;
if (hashes?.identityAuthorityEvidenceSha256 !== identityAuthorityEvidenceHash) {
  failures.push(
    "identityAuthorityEvidenceSha256 does not match embedded identity evidence",
  );
}

const derivedGates: Record<(typeof REQUIRED_GATES)[number], boolean> = {
  activeNeonPrincipalInventoryNonEmpty: principals.length > 0,
  activeNeonUserInventoryNonEmpty: activeNeonUsers.length > 0,
  everyActiveNeonPrincipalIncluded:
    principals.length > 0 &&
    [...principalIds].every((principalId) => casePrincipalIds.has(principalId)),
  everyActiveNeonUserIncluded:
    activeNeonUsers.length > 0 &&
    activeNeonUsers.every((principal) => {
      const principalId = stringProperty(principal, "id");
      return principalId !== null && casePrincipalIds.has(principalId);
    }),
  highRiskActionInventoryNonEmpty: actions.length > 0,
  everyHighRiskActionIncluded:
    actions.length > 0 &&
    actionPermissionIds.size === casePermissionIds.size &&
    [...actionPermissionIds].every((permissionId) =>
      casePermissionIds.has(permissionId)
    ),
  exactNeonPrincipalActionCrossProduct:
    principals.length > 0 &&
    actions.length > 0 &&
    cases.length === expectedCases &&
    new Set(caseIds).size === cases.length,
  everyActivePrincipalHasIdentityBinding:
    principals.length > 0 && missingIdentityBindings.length === 0,
  everyActionMappedOrClassified:
    actions.length > 0 && unmappedActions.length === 0,
  allRequiredContextClassesCaptured:
    requiredContextClasses.length > 0 && missingContextClasses.length === 0,
  allRequiredLegacyEnginesCaptured:
    requiredLegacyEngines.length > 0 && missingLegacyEngines.length === 0,
  allLegacyEngineDisagreementsClassified: allDisagreementsClassified,
  meshIdentityInventoryCaptured: meshBoundary?.status === "captured",
  activeMeshPrincipalInventoryNonEmpty: meshPrincipals.length > 0,
  activeMeshUserInventoryNonEmpty: activeMeshUsers.length > 0,
  everyActiveMeshPrincipalHasIdentityBinding:
    meshPrincipals.length > 0 && missingMeshIdentityBindings.length === 0,
  meshDecisionCorpusCaptured,
  neonCaptureBoundaryComplete,
  meshCaptureBoundaryComplete,
  distinctPlaneSourceDatabaseIds,
  identityAuthorityEvidenceCaptured,
  identityAuthorityReconciled: identityReconciliation.passed,
  repositoryCatalogProvenanceRecorded: catalogProvenanceValid,
  repositoryStateClean:
    capture?.repositoryStateClean === true && currentRepositoryStateClean,
};

const storedGates = optionalRecord(coverage?.gates);
if (!storedGates) {
  failures.push("coverage.gates is missing");
} else {
  const storedNames = Object.keys(storedGates).sort();
  const requiredNames = [...REQUIRED_GATES].sort();
  if (!sameStringArray(storedNames, requiredNames)) {
    failures.push(
      `coverage.gates must contain exactly the required gates; expected=[${requiredNames.join(",")}], found=[${storedNames.join(",")}]`,
    );
  }
  for (const gate of REQUIRED_GATES) {
    if (storedGates[gate] !== derivedGates[gate]) {
      failures.push(
        `coverage.gates.${gate}=${String(storedGates[gate])} does not match derived=${derivedGates[gate]}`,
      );
    }
    if (strict && derivedGates[gate] !== true) {
      failures.push(`Required strict coverage gate failed: ${gate}`);
    }
  }
}

verifyCoverageNumber(
  coverage,
  "expectedNeonPrincipalActionCases",
  expectedCases,
  failures,
);
verifyCoverageNumber(
  coverage,
  "capturedNeonPrincipalActionCases",
  cases.length,
  failures,
);
verifyCoverageNumber(coverage, "activeNeonPrincipals", principals.length, failures);
verifyCoverageNumber(coverage, "activeNeonUsers", activeNeonUsers.length, failures);
verifyCoverageNumber(coverage, "activeMeshPrincipals", meshPrincipals.length, failures);
verifyCoverageNumber(coverage, "activeMeshUsers", activeMeshUsers.length, failures);
verifyCoverageNumber(coverage, "highRiskActions", actions.length, failures);
verifyCoverageNumber(
  coverage,
  "supplementalDecisionEvidence",
  supplementalDecisionResult.items.length,
  failures,
);
verifyCoverageNumber(
  coverage,
  "supplementalDecisionCases",
  supplementalDecisionResult.cases.length,
  failures,
);
verifyCoverageArray(
  coverage,
  "missingIdentityBindings",
  missingIdentityBindings,
  failures,
);
verifyCoverageArray(
  coverage,
  "missingMeshIdentityBindings",
  missingMeshIdentityBindings,
  failures,
);
verifyCoverageArray(coverage, "unmappedActions", unmappedActions, failures);
verifyCoverageArray(
  coverage,
  "requiredLegacyEngines",
  requiredLegacyEngines,
  failures,
);
verifyCoverageArray(
  coverage,
  "capturedLegacyEngines",
  capturedLegacyEngines,
  failures,
);
verifyCoverageArray(
  coverage,
  "missingLegacyEngines",
  missingLegacyEngines,
  failures,
);
verifyCoverageArray(
  coverage,
  "requiredContextClasses",
  requiredContextClasses,
  failures,
);
verifyCoverageArray(
  coverage,
  "capturedContextClasses",
  capturedContextClasses,
  failures,
);
verifyCoverageArray(
  coverage,
  "missingContextClasses",
  missingContextClasses,
  failures,
);

if (failures.length > 0) {
  process.stderr.write(`${failures.map((failure) => `FAIL ${failure}`).join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `PASS authorization golden corpus (${principals.length} Neon principals, `
      + `${meshPrincipals.length} Mesh principals, ${actions.length} actions, `
      + `${cases.length} cases)\n`,
  );
}

function verifySupplementalDecisionEvidence(
  wrapper: Record<string, unknown> | null,
  expected: {
    repositoryRevision: string;
    governanceCatalogSha256: string;
    neonBoundary: Record<string, unknown> | null;
    meshBoundary: Record<string, unknown> | null;
    meshPrincipalIds: string[];
  },
  failures: string[],
) {
  if (!wrapper) {
    failures.push("supplementalDecisionEvidence is missing");
    return {
      items: [] as Record<string, unknown>[],
      cases: [] as unknown[],
      disagreements: [] as unknown[],
      meshDecisionCorpusCaptured: false,
    };
  }
  const items = arrayValue(wrapper.items)
    .map(optionalRecord)
    .filter((item): item is Record<string, unknown> => item !== null);
  if (wrapper.status === "not_captured") {
    verifyExactKeys(
      wrapper,
      ["status", "reason", "items", "evidenceSetSha256"],
      "supplementalDecisionEvidence",
      failures,
    );
    if (
      items.length !== 0 ||
      wrapper.evidenceSetSha256 !== null
    ) {
      failures.push(
        "Uncaptured supplemental decision evidence must have no items or hash",
      );
    }
    return {
      items,
      cases: [] as unknown[],
      disagreements: [] as unknown[],
      meshDecisionCorpusCaptured: false,
    };
  }
  verifyExactKeys(
    wrapper,
    ["status", "items", "evidenceSetSha256"],
    "supplementalDecisionEvidence",
    failures,
  );
  if (wrapper.status !== "captured" || items.length === 0) {
    failures.push(
      "Captured supplementalDecisionEvidence must contain at least one item",
    );
  }
  if (wrapper.evidenceSetSha256 !== hashCanonical(items)) {
    failures.push("supplementalDecisionEvidence.evidenceSetSha256 is invalid");
  }
  const eligibleItems: Record<string, unknown>[] = [];
  const evidenceIds = new Set<string>();
  const globalCaseIds = new Set<string>();
  for (const [evidenceIndex, evidence] of items.entries()) {
    const label = `supplementalDecisionEvidence.items[${evidenceIndex}]`;
    const failureCount = failures.length;
    verifyExactKeys(
      evidence,
      [
        "schemaVersion",
        "evidenceId",
        "generatedAt",
        "repositoryRevision",
        "governanceCatalogSha256",
        "source",
        "principals",
        "actions",
        "cases",
        "engineDisagreements",
        "hashes",
      ],
      label,
      failures,
    );
    if (evidence.schemaVersion !== 1) {
      failures.push(`${label}.schemaVersion must be 1`);
    }
    const evidenceId = stringProperty(evidence, "evidenceId");
    if (!evidenceId || evidenceIds.has(evidenceId)) {
      failures.push(`${label}.evidenceId is missing or duplicated`);
    } else {
      evidenceIds.add(evidenceId);
    }
    if (!isDateTime(evidence.generatedAt)) {
      failures.push(`${label}.generatedAt is invalid`);
    }
    if (evidence.repositoryRevision !== expected.repositoryRevision) {
      failures.push(`${label}.repositoryRevision does not match`);
    }
    if (
      evidence.governanceCatalogSha256 !==
      expected.governanceCatalogSha256
    ) {
      failures.push(`${label}.governanceCatalogSha256 does not match`);
    }
    const source = optionalRecord(evidence.source);
    if (!source) {
      failures.push(`${label}.source is missing`);
      continue;
    }
    verifyExactKeys(
      source,
      [
        "plane",
        "sourceDatabaseId",
        "captureWatermark",
        "actionSelection",
        "principalSelection",
        "decisionCatalogSha256",
        "evaluatorId",
        "evaluatorRevision",
      ],
      `${label}.source`,
      failures,
    );
    const plane = source.plane;
    if (plane !== "neon" && plane !== "admin" && plane !== "mesh") {
      failures.push(`${label}.source.plane is invalid`);
      continue;
    }
    if (!isUuid(source.sourceDatabaseId)) {
      failures.push(`${label}.source.sourceDatabaseId is invalid`);
    }
    if (
      typeof source.captureWatermark !== "string" ||
      !/^\d+$/.test(source.captureWatermark)
    ) {
      failures.push(`${label}.source.captureWatermark is invalid`);
    }
    if (source.actionSelection !== "all_active_high_critical") {
      failures.push(`${label}.source.actionSelection is invalid`);
    }
    if (
      source.principalSelection !==
      "all_active_plus_certification_fixtures"
    ) {
      failures.push(`${label}.source.principalSelection is invalid`);
    }
    if (!isSha256(source.decisionCatalogSha256)) {
      failures.push(`${label}.source.decisionCatalogSha256 is invalid`);
    }
    if (
      typeof source.evaluatorId !== "string" ||
      source.evaluatorId.trim().length === 0 ||
      typeof source.evaluatorRevision !== "string" ||
      source.evaluatorRevision.trim().length === 0
    ) {
      failures.push(`${label}.source evaluator provenance is invalid`);
    }
    const boundary = plane === "mesh"
      ? expected.meshBoundary
      : expected.neonBoundary;
    const boundaryMatches =
      boundary !== null &&
      isCompleteCaptureBoundary(
        boundary,
        plane === "mesh" ? "mesh" : "neon",
      ) &&
      source.sourceDatabaseId === boundary.source_database_id &&
      source.captureWatermark === boundary.capture_watermark;
    if (!boundaryMatches) {
      failures.push(`${label} does not match the captured ${plane} boundary`);
    }
    const principals = arrayValue(evidence.principals);
    const actions = arrayValue(evidence.actions);
    const cases = arrayValue(evidence.cases);
    const disagreements = arrayValue(evidence.engineDisagreements);
    if (principals.length === 0 || actions.length === 0 || cases.length === 0) {
      failures.push(`${label} must contain principals, actions, and cases`);
    }
    const principalIds = new Set<string>();
    for (const [index, principalValue] of principals.entries()) {
      const principal = optionalRecord(principalValue);
      if (!principal) {
        failures.push(`${label}.principals[${index}] is invalid`);
        continue;
      }
      verifyExactKeys(
        principal,
        ["principalId", "principalClass"],
        `${label}.principals[${index}]`,
        failures,
      );
      if (!isUuid(principal.principalId)) {
        failures.push(`${label}.principals[${index}].principalId is invalid`);
      } else if (principalIds.has(principal.principalId)) {
        failures.push(`${label}.principals[${index}].principalId is duplicated`);
      } else {
        principalIds.add(principal.principalId);
      }
      if (
        principal.principalClass !== "active_inventory" &&
        principal.principalClass !== "certification_fixture"
      ) {
        failures.push(`${label}.principals[${index}].principalClass is invalid`);
      }
    }
    const actionsByOperation = new Map<string, Record<string, unknown>>();
    for (const [index, actionValue] of actions.entries()) {
      const action = optionalRecord(actionValue);
      if (!action) {
        failures.push(`${label}.actions[${index}] is invalid`);
        continue;
      }
      verifyExactKeys(
        action,
        ["operationId", "permissionId", "permissionCode", "riskLevel"],
        `${label}.actions[${index}]`,
        failures,
      );
      if (!isUuid(action.operationId) || actionsByOperation.has(action.operationId)) {
        failures.push(`${label}.actions[${index}].operationId is invalid or duplicated`);
      } else {
        actionsByOperation.set(action.operationId, action);
      }
      if (!isUuid(action.permissionId)) {
        failures.push(`${label}.actions[${index}].permissionId is invalid`);
      }
      if (
        action.riskLevel !== "high" &&
        action.riskLevel !== "critical"
      ) {
        failures.push(`${label}.actions[${index}].riskLevel is invalid`);
      }
    }
    if (source.decisionCatalogSha256 !== hashCanonical(actions)) {
      failures.push(
        `${label}.source.decisionCatalogSha256 does not match actions`,
      );
    }
    const localCaseIds = new Set<string>();
    for (const [index, caseValue] of cases.entries()) {
      const item = optionalRecord(caseValue);
      if (!item) {
        failures.push(`${label}.cases[${index}] is invalid`);
        continue;
      }
      verifyExactKeys(
        item,
        [
          "caseId",
          "plane",
          "authorityScopeId",
          "membershipId",
          "principalId",
          "operationId",
          "permissionId",
          "permissionCode",
          "contextClass",
          "resourceType",
          "resourceIdSha256",
          "resourceSentinel",
          "engine",
          "decision",
          "decisionEvidenceSha256",
        ],
        `${label}.cases[${index}]`,
        failures,
      );
      if (item.plane !== plane) {
        failures.push(`${label}.cases[${index}].plane is invalid`);
      }
      if (!isUuid(item.principalId) || !principalIds.has(item.principalId)) {
        failures.push(`${label}.cases[${index}].principalId is invalid`);
      }
      const action = isUuid(item.operationId)
        ? actionsByOperation.get(item.operationId)
        : undefined;
      if (
        !action ||
        item.permissionId !== action.permissionId ||
        item.permissionCode !== action.permissionCode
      ) {
        failures.push(`${label}.cases[${index}] operation/permission is invalid`);
      }
      if (!isUuid(item.authorityScopeId) || !isUuid(item.membershipId)) {
        failures.push(`${label}.cases[${index}] scope/membership is invalid`);
      }
      if (
        typeof item.contextClass !== "string" ||
        item.contextClass.trim().length === 0
      ) {
        failures.push(`${label}.cases[${index}].contextClass is invalid`);
      }
      if (
        (plane === "mesh" && item.engine !== "legacy_mesh") ||
        (plane === "admin" && item.engine !== "legacy_admin") ||
        (plane === "neon" &&
          item.engine !== "legacy_single" &&
          item.engine !== "legacy_batch")
      ) {
        failures.push(`${label}.cases[${index}].engine is invalid`);
      }
      if (
        typeof item.decision !== "string" ||
        item.decision.trim().length === 0 ||
        !isSha256(item.decisionEvidenceSha256)
      ) {
        failures.push(`${label}.cases[${index}] decision evidence is invalid`);
      }
      if (
        item.resourceIdSha256 !== null &&
        !isSha256(item.resourceIdSha256)
      ) {
        failures.push(`${label}.cases[${index}].resourceIdSha256 is invalid`);
      }
      if (
        item.resourceType !== null &&
        (typeof item.resourceType !== "string" ||
          item.resourceType.trim().length === 0)
      ) {
        failures.push(`${label}.cases[${index}].resourceType is invalid`);
      }
      if (
        item.resourceSentinel !== null &&
        (typeof item.resourceSentinel !== "string" ||
          item.resourceSentinel.trim().length === 0)
      ) {
        failures.push(`${label}.cases[${index}].resourceSentinel is invalid`);
      }
      if (
        item.contextClass !== "tenant_capability" &&
        item.resourceIdSha256 === null &&
        item.resourceSentinel === null
      ) {
        failures.push(`${label}.cases[${index}] lacks a resource fixture`);
      }
      const expectedCaseId = hashCanonical({
        plane: item.plane,
        authorityScopeId: item.authorityScopeId,
        membershipId: item.membershipId,
        principalId: item.principalId,
        operationId: item.operationId,
        permissionId: item.permissionId,
        permissionCode: item.permissionCode,
        contextClass: item.contextClass,
        resourceType: item.resourceType,
        resourceIdSha256: item.resourceIdSha256,
        resourceSentinel: item.resourceSentinel,
        engine: item.engine,
      });
      if (
        item.caseId !== expectedCaseId ||
        localCaseIds.has(expectedCaseId) ||
        globalCaseIds.has(expectedCaseId)
      ) {
        failures.push(`${label}.cases[${index}].caseId is invalid or duplicated`);
      } else {
        localCaseIds.add(expectedCaseId);
        globalCaseIds.add(expectedCaseId);
      }
    }
    for (const [index, disagreementValue] of disagreements.entries()) {
      const disagreement = optionalRecord(disagreementValue);
      if (!disagreement) {
        failures.push(`${label}.engineDisagreements[${index}] is invalid`);
        continue;
      }
      verifyExactKeys(
        disagreement,
        [
          "caseId",
          "comparison",
          "left",
          "right",
          "classification",
          "approval",
        ],
        `${label}.engineDisagreements[${index}]`,
        failures,
      );
      if (
        !isSha256(disagreement.caseId) ||
        !localCaseIds.has(disagreement.caseId)
      ) {
        failures.push(`${label}.engineDisagreements[${index}].caseId is invalid`);
      }
      if (
        disagreement.classification !== null &&
        (typeof disagreement.classification !== "string" ||
          disagreement.classification.trim().length === 0)
      ) {
        failures.push(
          `${label}.engineDisagreements[${index}].classification is invalid`,
        );
      }
    }
    const itemHashes = optionalRecord(evidence.hashes);
    if (!itemHashes) {
      failures.push(`${label}.hashes is missing`);
    } else {
      verifyExactKeys(
        itemHashes,
        [
          "principalsSha256",
          "actionsSha256",
          "casesSha256",
          "engineDisagreementsSha256",
        ],
        `${label}.hashes`,
        failures,
      );
      verifyHash(itemHashes, "principalsSha256", principals, failures);
      verifyHash(itemHashes, "actionsSha256", actions, failures);
      verifyHash(itemHashes, "casesSha256", cases, failures);
      verifyHash(
        itemHashes,
        "engineDisagreementsSha256",
        disagreements,
        failures,
      );
    }
    if (failures.length === failureCount && boundaryMatches) {
      eligibleItems.push(evidence);
    }
  }
  const eligibleCases = eligibleItems.flatMap((item) => arrayValue(item.cases));
  const eligibleDisagreements = eligibleItems.flatMap((item) =>
    arrayValue(item.engineDisagreements)
  );
  return {
    items,
    cases: eligibleCases,
    disagreements: eligibleDisagreements,
    meshDecisionCorpusCaptured: eligibleItems.some((item) =>
      isCompleteSupplementalMeshEvidence(item, expected.meshPrincipalIds)
    ),
  };
}

function isCompleteSupplementalMeshEvidence(
  evidence: Record<string, unknown>,
  meshPrincipalIds: string[],
) {
  const source = optionalRecord(evidence.source);
  if (source?.plane !== "mesh" || meshPrincipalIds.length === 0) return false;
  const activePrincipalIds = uniqueSorted(
    arrayValue(evidence.principals)
      .filter(
        (principal) =>
          property(principal, "principalClass") === "active_inventory",
      )
      .map((principal) => stringProperty(principal, "principalId"))
      .filter((value): value is string => value !== null),
  );
  const expectedPrincipalIds = uniqueSorted(meshPrincipalIds);
  if (!sameStringArray(activePrincipalIds, expectedPrincipalIds)) return false;
  const actions = arrayValue(evidence.actions);
  const cases = arrayValue(evidence.cases);
  return (
    actions.length > 0 &&
    activePrincipalIds.every((principalId) =>
      actions.every((action) => {
        const operationId = stringProperty(action, "operationId");
        return operationId !== null &&
          cases.some(
            (caseItem) =>
              property(caseItem, "principalId") === principalId &&
              property(caseItem, "operationId") === operationId &&
              property(caseItem, "engine") === "legacy_mesh",
          );
      })
    )
  );
}

function deriveCapturedLegacyEngines(values: unknown[]): LegacyEngine[] {
  const caseRecords = values
    .map(optionalRecord)
    .filter((item): item is Record<string, unknown> => item !== null);
  const engines: LegacyEngine[] = [];
  if (
    caseRecords.length > 0 &&
    caseRecords.every((item) =>
      typeof optionalRecord(item.legacy)?.single === "string"
    )
  ) {
    engines.push("legacy_single");
  }
  if (
    caseRecords.length > 0 &&
    caseRecords.every((item) =>
      typeof optionalRecord(item.legacy)?.batch === "string"
    )
  ) {
    engines.push("legacy_batch");
  }
  const adminCases = caseRecords.filter((item) =>
    arrayValue(item.planeEligibility).includes("admin")
  );
  if (
    adminCases.length > 0 &&
    adminCases.every((item) =>
      typeof optionalRecord(item.legacy)?.admin === "string"
    )
  ) {
    engines.push("legacy_admin");
  }
  return uniqueSorted(engines);
}

function verifyIdentityAuthorityEvidence(
  evidence: Record<string, unknown> | null,
  neonPrincipals: unknown[],
  meshPrincipals: unknown[],
  failures: string[],
) {
  if (!evidence || evidence.status !== "captured") {
    return { passed: false };
  }
  verifyExactKeys(
    evidence,
    [
      "status",
      "schemaVersion",
      "evidenceId",
      "generatedAt",
      "source",
      "subjects",
      "hashes",
      "reconciliation",
    ],
    "identityAuthorityEvidence",
    failures,
  );
  if (evidence.schemaVersion !== 1) {
    failures.push("identityAuthorityEvidence.schemaVersion must be 1");
  }
  if (
    typeof evidence.evidenceId !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,127}$/.test(evidence.evidenceId)
  ) {
    failures.push("identityAuthorityEvidence.evidenceId is invalid");
  }
  if (!isDateTime(evidence.generatedAt)) {
    failures.push("identityAuthorityEvidence.generatedAt is invalid");
  }
  const source = optionalRecord(evidence.source);
  if (!source) {
    failures.push("identityAuthorityEvidence.source is missing");
  } else {
    verifyExactKeys(
      source,
      [
        "authoritySystem",
        "sourceInstanceIdSha256",
        "snapshotId",
        "snapshotSha256",
        "subjectSelection",
      ],
      "identityAuthorityEvidence.source",
      failures,
    );
    if (
      typeof source.authoritySystem !== "string" ||
      !/^[a-z][a-z0-9_.-]{1,63}$/.test(source.authoritySystem)
    ) {
      failures.push("identityAuthorityEvidence.source.authoritySystem is invalid");
    }
    if (!isSha256(source.sourceInstanceIdSha256)) {
      failures.push(
        "identityAuthorityEvidence.source.sourceInstanceIdSha256 is invalid",
      );
    }
    if (
      typeof source.snapshotId !== "string" ||
      source.snapshotId.trim().length === 0
    ) {
      failures.push("identityAuthorityEvidence.source.snapshotId is invalid");
    }
    if (!isSha256(source.snapshotSha256)) {
      failures.push("identityAuthorityEvidence.source.snapshotSha256 is invalid");
    }
    if (source.subjectSelection !== "enabled_only") {
      failures.push(
        "identityAuthorityEvidence.source.subjectSelection must be enabled_only",
      );
    }
  }
  const subjects = arrayValue(evidence.subjects);
  if (subjects.length === 0) {
    failures.push("Identity authority evidence has no enabled subjects");
  }
  const normalizedSubjects = subjects.map((subjectValue, index) => {
    const subject = optionalRecord(subjectValue);
    if (!subject) {
      failures.push(`identityAuthorityEvidence.subjects[${index}] is invalid`);
      return null;
    }
    verifyExactKeys(
      subject,
      [
        "subjectKeySha256",
        "realmKey",
        "providerCode",
        "subjectSha256",
        "subjectType",
        "enabled",
        "expectedPlanes",
      ],
      `identityAuthorityEvidence.subjects[${index}]`,
      failures,
    );
    const realmKey = stringProperty(subject, "realmKey");
    const providerCode = stringProperty(subject, "providerCode");
    const subjectSha256 = stringProperty(subject, "subjectSha256");
    const subjectKeySha256 = stringProperty(subject, "subjectKeySha256");
    const rawExpectedPlanes = arrayValue(subject.expectedPlanes);
    if (
      rawExpectedPlanes.some(
        (plane) => plane !== "neon" && plane !== "admin" && plane !== "mesh",
      )
    ) {
      failures.push(
        `identityAuthorityEvidence.subjects[${index}].expectedPlanes contains an invalid plane`,
      );
    }
    const expectedPlanes = uniqueSorted(
      rawExpectedPlanes.filter((plane): plane is Plane =>
        plane === "neon" || plane === "admin" || plane === "mesh"
      ),
    );
    if (expectedPlanes.length !== rawExpectedPlanes.length) {
      failures.push(
        `identityAuthorityEvidence.subjects[${index}].expectedPlanes contains duplicates`,
      );
    }
    if (
      !realmKey ||
      !/^[a-z][a-z0-9_-]{1,62}$/.test(realmKey) ||
      !providerCode ||
      !/^[a-z][a-z0-9_-]{1,62}$/.test(providerCode) ||
      !isSha256(subjectSha256) ||
      subject.enabled !== true ||
      expectedPlanes.length === 0 ||
      !["user", "service_account", "integration_user"].includes(
        String(subject.subjectType),
      )
    ) {
      failures.push(
        `identityAuthorityEvidence.subjects[${index}] is incomplete or not enabled`,
      );
      return null;
    }
    const expectedKey = identitySubjectKey({
      realmKey,
      providerCode,
      subjectSha256,
    });
    if (subjectKeySha256 !== expectedKey) {
      failures.push(
        `identityAuthorityEvidence.subjects[${index}].subjectKeySha256 is invalid`,
      );
    }
    return {
      subjectKeySha256: expectedKey,
      realmKey,
      providerCode,
      subjectSha256,
      subjectType: subject.subjectType,
      enabled: true,
      expectedPlanes,
    };
  }).filter((subject): subject is NonNullable<typeof subject> => subject !== null)
    .sort((left, right) =>
      left.subjectKeySha256.localeCompare(right.subjectKeySha256)
    );
  if (
    new Set(normalizedSubjects.map((subject) => subject.subjectKeySha256)).size !==
    normalizedSubjects.length
  ) {
    failures.push("Identity authority evidence contains duplicate subject keys");
  }
  const evidenceHashes = optionalRecord(evidence.hashes);
  if (evidenceHashes) {
    verifyExactKeys(
      evidenceHashes,
      ["subjectsSha256"],
      "identityAuthorityEvidence.hashes",
      failures,
    );
  }
  if (
    evidenceHashes?.subjectsSha256 !== hashCanonical(normalizedSubjects)
  ) {
    failures.push("Identity authority subjectsSha256 is invalid");
  }
  const authorityByKey = new Map(
    normalizedSubjects.map((subject) => [subject.subjectKeySha256, subject]),
  );
  const neonBindings = localBindings(neonPrincipals, "neon");
  const meshBindings = localBindings(meshPrincipals, "mesh");
  const neonKeys = new Set(
    neonBindings.map((binding) => binding.subjectKeySha256),
  );
  const meshKeys = new Set(
    meshBindings.map((binding) => binding.subjectKeySha256),
  );
  const missingBindings = normalizedSubjects.flatMap((subject) =>
    subject.expectedPlanes.flatMap((plane) => {
      const matched = plane === "mesh"
        ? meshKeys.has(subject.subjectKeySha256)
        : neonKeys.has(subject.subjectKeySha256);
      return matched
        ? []
        : [{ subjectKeySha256: subject.subjectKeySha256, plane }];
    }),
  );
  const unexpectedLocalBindings = [...neonBindings, ...meshBindings]
    .filter((binding) => {
      const subject = authorityByKey.get(binding.subjectKeySha256);
      if (!subject) return true;
      return binding.physicalPlane === "mesh"
        ? !subject.expectedPlanes.includes("mesh")
        : !subject.expectedPlanes.some(
            (plane) => plane === "neon" || plane === "admin",
          );
    })
    .sort((left, right) =>
      `${left.physicalPlane}:${left.subjectKeySha256}:${left.principalId}`
        .localeCompare(
          `${right.physicalPlane}:${right.subjectKeySha256}:${right.principalId}`,
        )
    );
  const enabledAuthorityUsers = normalizedSubjects.filter(
    (subject) => subject.subjectType === "user",
  ).length;
  const expectedPlaneBindings = normalizedSubjects.reduce(
    (count, subject) => count + subject.expectedPlanes.length,
    0,
  );
  const reconciliationCore = {
    enabledAuthoritySubjects: normalizedSubjects.length,
    enabledAuthorityUsers,
    expectedPlaneBindings,
    matchedPlaneBindings: expectedPlaneBindings - missingBindings.length,
    activeNeonAdminLocalBindings: neonBindings.length,
    activeMeshLocalBindings: meshBindings.length,
    missingBindings,
    unexpectedLocalBindings,
    passed:
      normalizedSubjects.length > 0 &&
      enabledAuthorityUsers > 0 &&
      missingBindings.length === 0 &&
      unexpectedLocalBindings.length === 0,
  };
  const stored = optionalRecord(evidence.reconciliation);
  if (!stored) {
    failures.push("Identity authority reconciliation is missing");
  } else {
    verifyExactKeys(
      stored,
      [
        ...Object.keys(reconciliationCore),
        "gaps",
        "reconciliationSha256",
      ],
      "identityAuthorityEvidence.reconciliation",
      failures,
    );
    for (const [key, expected] of Object.entries(reconciliationCore)) {
      if (hashCanonical(stored[key]) !== hashCanonical(expected)) {
        failures.push(`Identity authority reconciliation.${key} is inconsistent`);
      }
    }
    if (stored.reconciliationSha256 !== hashCanonical(reconciliationCore)) {
      failures.push("Identity authority reconciliationSha256 is invalid");
    }
  }
  return { passed: reconciliationCore.passed };
}

function localBindings(principals: unknown[], plane: "neon" | "mesh") {
  return principals.flatMap((principal) => {
    const principalId = String(property(principal, "id") ?? "");
    return activeBindings(principal, plane).map((binding) => ({
      subjectKeySha256: identitySubjectKey({
        realmKey: String(property(binding, "realmKey") ?? ""),
        providerCode: String(property(binding, "providerCode") ?? ""),
        subjectSha256: String(property(binding, "subjectSha256") ?? ""),
      }),
      principalId,
      physicalPlane: plane === "mesh"
        ? "mesh" as const
        : "neon_admin" as const,
    }));
  });
}

function activeBindings(principal: unknown, plane: "neon" | "mesh") {
  return arrayValue(property(principal, "bindings"))
    .filter((binding) => {
      const record = optionalRecord(binding);
      if (!record || record.syncStatus !== "synced") return false;
      return plane === "mesh" || record.idpEnabled === true;
    });
}

function identitySubjectKey(binding: {
  realmKey: string;
  providerCode: string;
  subjectSha256: string;
}) {
  return hashCanonical({
    realmKey: binding.realmKey,
    providerCode: binding.providerCode,
    subjectSha256: binding.subjectSha256,
  });
}

function isCompleteCaptureBoundary(
  boundary: Record<string, unknown> | null,
  expectedPlane: "neon" | "mesh",
) {
  const expectedContractVersion = expectedPlane === "mesh"
    ? "wave0.mesh-authz-capture.v1"
    : "wave0.authz-capture.v1";
  return (
    boundary?.status === "captured" &&
    boundary.plane === expectedPlane &&
    boundary.has_capture_clock === true &&
    isUuid(boundary.source_database_id) &&
    boundary.capture_contract_version === expectedContractVersion &&
    isDateTime(boundary.capture_installed_at) &&
    typeof boundary.capture_watermark === "string" &&
    /^\d+$/.test(boundary.capture_watermark) &&
    typeof boundary.database_name === "string" &&
    boundary.database_name.trim().length > 0 &&
    typeof boundary.database_oid === "string" &&
    /^\d+$/.test(boundary.database_oid)
  );
}

function readRequiredLegacyEngines(
  catalog: Record<string, unknown>,
  failures: string[],
): LegacyEngine[] {
  const byPlane = optionalRecord(catalog.requiredLegacyEngines);
  if (!byPlane) {
    failures.push("Catalog requiredLegacyEngines is missing");
    return [];
  }
  const values = Object.values(byPlane).flatMap(arrayValue);
  const supported = new Set<LegacyEngine>([
    "legacy_single",
    "legacy_batch",
    "legacy_admin",
    "legacy_mesh",
  ]);
  const engines: LegacyEngine[] = [];
  for (const value of values) {
    if (typeof value !== "string" || !supported.has(value as LegacyEngine)) {
      failures.push(`Catalog contains unsupported legacy engine: ${String(value)}`);
      continue;
    }
    engines.push(value as LegacyEngine);
  }
  const result = uniqueSorted(engines);
  if (result.length === 0) failures.push("Catalog requires no legacy engines");
  return result;
}

function readRequiredContextClasses(
  catalog: Record<string, unknown>,
  failures: string[],
) {
  const contexts = uniqueSorted(
    arrayValue(catalog.requiredContextClasses)
      .filter((value): value is string =>
        typeof value === "string" && value.trim().length > 0
      ),
  );
  if (contexts.length === 0) failures.push("Catalog requires no context classes");
  return contexts;
}

function verifyHash(
  hashes: Record<string, unknown> | null,
  field: string,
  value: unknown,
  failures: string[],
) {
  if (hashes?.[field] !== hashCanonical(value)) {
    failures.push(`${field} does not match canonical evidence`);
  }
}

function verifyCoverageNumber(
  coverage: Record<string, unknown> | null,
  field: string,
  expected: number,
  failures: string[],
) {
  if (coverage?.[field] !== expected) {
    failures.push(`coverage.${field}=${String(coverage?.[field])}, expected=${expected}`);
  }
}

function verifyCoverageArray(
  coverage: Record<string, unknown> | null,
  field: string,
  expected: string[],
  failures: string[],
) {
  const actual = arrayValue(coverage?.[field]).map(String);
  if (!sameStringArray(actual, expected)) {
    failures.push(
      `coverage.${field}=[${actual.join(",")}], expected=[${expected.join(",")}]`,
    );
  }
}

function verifyExactKeys(
  value: Record<string, unknown>,
  expectedKeys: string[],
  label: string,
  failures: string[],
) {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (!sameStringArray(actual, expected)) {
    failures.push(
      `${label} keys mismatch; expected=[${expected.join(",")}], found=[${actual.join(",")}]`,
    );
  }
}

function valueArgument(prefix: string) {
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function repositoryRelativePath(root: string, path: string) {
  const relativePath = relative(root, path);
  if (
    relativePath.length === 0 ||
    relativePath === ".." ||
    relativePath.startsWith(`..\\`) ||
    relativePath.startsWith("../") ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`Catalog must be a repository-owned file: ${path}`);
  }
  return relativePath.replaceAll("\\", "/");
}

function gitRevision(root: string) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unavailable";
  }
}

function gitWorkingTreeClean(root: string, allowedEvidencePath: string) {
  try {
    execFileSync("git", ["diff-index", "--quiet", "HEAD", "--"], {
      cwd: root,
      stdio: "ignore",
    });
    const allowedRelativePath = relative(root, allowedEvidencePath)
      .replaceAll("\\", "/");
    const untracked = execFileSync(
      "git",
      ["ls-files", "--others", "--exclude-standard"],
      {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        maxBuffer: 16 * 1024 * 1024,
      },
    )
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((path) => path.replaceAll("\\", "/") !== allowedRelativePath);
    return untracked.length === 0;
  } catch {
    return false;
  }
}

function isMeshUserPrincipalType(principalType: string) {
  return ["participant_user", "platform_staff", "support_user"].includes(
    principalType,
  );
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
}

function isDateTime(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function sameStringArray(left: string[], right: readonly string[]) {
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function uniqueSorted<T extends string>(values: T[]): T[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new Error(`${label} must be an object.`);
  return record;
}

function optionalRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function property(value: unknown, key: string): unknown {
  return optionalRecord(value)?.[key];
}

function stringProperty(value: unknown, key: string): string | null {
  const field = property(value, key);
  return typeof field === "string" ? field : null;
}

function hashCanonical(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map(
      (key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`,
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}
