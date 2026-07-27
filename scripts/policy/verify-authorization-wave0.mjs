#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const strict = process.argv.includes("--strict");
const evidenceDirectory = resolve(
  repositoryRoot,
  argumentValue("--evidence-dir=") ?? "artifacts/authorization-wave0",
);
const outputArgument = argumentValue("--output=");

const checks = [];
const inventory = await optionalJson(
  resolve(repositoryRoot, "config/governance/authorization-inventory.v1.json"),
);
const disposition = await requiredJson(
  resolve(
    repositoryRoot,
    "config/governance/authorization-data-disposition-inventory.v1.json",
  ),
  "data-disposition inventory",
);
const recovery = await requiredJson(
  resolve(
    repositoryRoot,
    "config/governance/authorization-migration-recovery-contract.v1.json",
  ),
  "migration recovery contract",
);
const rollout = await requiredJson(
  resolve(repositoryRoot, "config/governance/authorization-rollout-contract.json"),
  "authorization rollout contract",
);
const highRisk = await requiredJson(
  resolve(
    repositoryRoot,
    "config/governance/authorization-high-risk-action-catalog.v1.json",
  ),
  "high-risk action catalog",
);

check(
  "architecture_decisions_frozen",
  "static",
  await adrDecisionStatus(),
  "The ADR must lock ownership, precedence, Admin semantics, and the zero-Mesh-data boundary.",
);

if (!inventory) {
  check(
    "no_unknown_authorization_source_or_static_writer",
    "static",
    "pending",
    "Generate config/governance/authorization-inventory.v1.json.",
  );
} else {
  const inventoryUnknowns = collectInventoryUnknowns(inventory);
  check(
    "no_unknown_authorization_source_or_static_writer",
    "static",
    inventoryUnknowns.length === 0 ? "pass" : "fail",
    inventoryUnknowns.length === 0
      ? "Static inventory reports no unknown/unowned/unclassified source or writer."
      : `Inventory blockers: ${inventoryUnknowns.join(", ")}`,
  );
}

check(
  "authorization_rollout_default_safe",
  "static",
  rollout?.defaultMode === "legacy" &&
    rollout?.percentageRolloutAllowed === false &&
    rollout?.decisionComposition === "select_one_never_union" &&
    rollout?.policySources?.mesh?.authority === "mesh"
      ? "pass"
      : "fail",
  "Rollout must default to legacy, prohibit percentage rollout/union, and keep Mesh policy Mesh-local.",
);

check(
  "every_declared_table_and_object_has_one_disposition",
  "static",
  disposition?.gates?.everyDiscoveredTableHasOneDisposition === true &&
    disposition?.gates?.everyExternalObjectHasOneDisposition === true
      ? "pass"
      : "fail",
  "The deterministic DDL/object inventory must contain no unclassified object.",
);

check(
  "every_table_and_object_disposition_approved",
  "approval",
  disposition?.gates?.allDispositionsApproved === true ? "pass" : "pending",
  disposition?.gates?.allDispositionsApproved === true
    ? "Disposition policy contains named approval evidence."
    : "Data, retention, security, and operations approval is still required.",
);

check(
  "atomic_plane_cohort_flags_available",
  "static",
  rollout?.supportedModes?.join(",") === "legacy,shadow,enforce" &&
    rollout?.initialSnapshots?.neon?.defaultMode === "legacy" &&
    rollout?.initialSnapshots?.admin?.defaultMode === "legacy" &&
    rollout?.initialSnapshots?.mesh?.defaultMode === "legacy"
      ? "pass"
      : "fail",
  "Exact plane/cohort legacy, shadow, and enforce controls must exist and ship legacy.",
);

check(
  "high_risk_action_selection_is_live_and_complete",
  "static",
  highRisk?.selection?.includeEverySelectedPermission === true &&
    highRisk?.selection?.riskLevels?.includes("high") &&
    highRisk?.selection?.riskLevels?.includes("critical")
      ? "pass"
      : "fail",
  "The action corpus must select every active high/critical permission from the live catalog.",
);

const recoveryApproved = recoveryApprovalComplete(recovery);
check(
  "rollback_owner_and_observation_window_approved",
  "approval",
  recoveryApproved ? "pass" : "pending",
  recoveryApproved
    ? "All recovery contracts contain owners, objectives, triggers, and approved observation windows."
    : "Recovery contract still has unassigned owners, objectives, triggers, or observation windows.",
);

const golden = await optionalJson(resolve(evidenceDirectory, "golden-decision-corpus.json"));
if (!golden) {
  check(
    "all_active_users_in_identity_inventory",
    "live_evidence",
    "pending",
    `Capture ${resolve(evidenceDirectory, "golden-decision-corpus.json")}.`,
  );
  check(
    "golden_corpus_complete",
    "live_evidence",
    "pending",
    "Run the golden corpus exporter against Neon and Mesh at recorded snapshot boundaries.",
  );
} else {
  check(
    "all_active_users_in_identity_inventory",
    "live_evidence",
    golden?.coverage?.gates?.everyActiveNeonPrincipalIncluded === true &&
      golden?.coverage?.gates?.everyActivePrincipalHasIdentityBinding === true
      ? "pass"
      : "fail",
    "Every active principal must be present and have an exact preserved identity binding.",
  );
  check(
    "golden_corpus_complete",
    "live_evidence",
    allBooleanGatesPass(golden?.coverage?.gates) ? "pass" : "fail",
    "All principal/action/engine/context coverage gates and mismatch classifications must pass.",
  );
}

const legacyWrites = await firstOptionalJson([
  resolve(evidenceDirectory, "authorization-legacy-writes.json"),
  resolve(evidenceDirectory, "legacy-write-report.json"),
]);
if (!legacyWrites) {
  check(
    "no_unknown_live_authorization_writer",
    "live_evidence",
    "pending",
    "Run the legacy-write telemetry report after change capture is installed.",
  );
} else {
  const unknownWriterCount = numericValue(
    legacyWrites?.summary?.unknownWriters ??
      legacyWrites?.summary?.unknownWriterCount ??
      legacyWrites?.gates?.unknownWriterCount,
  );
  check(
    "no_unknown_live_authorization_writer",
    "live_evidence",
    unknownWriterCount === 0 ? "pass" : "fail",
    `Unknown live writer count: ${unknownWriterCount ?? "unreported"}.`,
  );
}

const dataQuality = await firstOptionalJson([
  resolve(evidenceDirectory, "authorization-data-quality.json"),
  resolve(evidenceDirectory, "data-quality-report.json"),
]);
if (!dataQuality) {
  check(
    "all_cross_tenant_anomalies_classified",
    "live_evidence",
    "pending",
    "Run the authorization data-quality report and approve each deterministic finding fingerprint.",
  );
} else {
  const unclassified = numericValue(
    dataQuality?.summary?.unclassified ??
      dataQuality?.summary?.unclassifiedFindings ??
      dataQuality?.gates?.unclassifiedCount,
  );
  check(
    "all_cross_tenant_anomalies_classified",
    "live_evidence",
    unclassified === 0 ? "pass" : "fail",
    `Unclassified data-quality findings: ${unclassified ?? "unreported"}.`,
  );
}

const liveDisposition = await firstOptionalJson([
  resolve(evidenceDirectory, "data-disposition-coverage.json"),
  resolve(evidenceDirectory, "authorization-data-disposition-live.json"),
]);
if (!liveDisposition) {
  check(
    "live_database_and_object_disposition_coverage",
    "live_evidence",
    "pending",
    "Overlay the checked-in inventory with pg_class, runtime partitions, and deployed object stores.",
  );
} else {
  const unknown = numericValue(
    liveDisposition?.summary?.unmatched ??
      liveDisposition?.summary?.unclassified ??
      liveDisposition?.gates?.unmatchedCount,
  );
  const multiple = numericValue(
    liveDisposition?.summary?.multiplyMatched ??
      liveDisposition?.gates?.multiplyMatchedCount,
  );
  check(
    "live_database_and_object_disposition_coverage",
    "live_evidence",
    unknown === 0 && multiple === 0 ? "pass" : "fail",
    `Live unmatched=${unknown ?? "unreported"}, multiply matched=${multiple ?? "unreported"}.`,
  );
}

const summary = {
  pass: checks.filter((item) => item.status === "pass").length,
  pending: checks.filter((item) => item.status === "pending").length,
  fail: checks.filter((item) => item.status === "fail").length,
};
const report = {
  schemaVersion: 1,
  strict,
  evidenceDirectory,
  summary,
  productionReady: summary.pending === 0 && summary.fail === 0,
  checks,
};

const rendered = `${JSON.stringify(report, null, 2)}\n`;
if (outputArgument) {
  await writeFile(resolve(repositoryRoot, outputArgument), rendered, "utf8");
}
process.stdout.write(rendered);
if (summary.fail > 0 || (strict && summary.pending > 0)) process.exitCode = 1;

function check(id, category, status, detail) {
  checks.push({ id, category, status, detail });
}

async function adrDecisionStatus() {
  const path = resolve(
    repositoryRoot,
    "docs/architecture/authorization-v2-ownership-evaluation-and-plane-boundary-adr.md",
  );
  const text = await readFile(path, "utf8").catch(() => "");
  const required = [
    "Decision 1: physical ownership",
    "Decision 2: zero Mesh-specific-data Neon boundary",
    "Decision 4: evaluator precedence",
    "Decision 5: Admin entitlement semantics",
  ];
  return required.every((value) => text.includes(value)) ? "pass" : "fail";
}

function collectInventoryUnknowns(value) {
  const candidates = [
    value?.summary?.gates,
    value?.gates,
  ].filter(Boolean);
  const blockers = [];
  const pattern = /(unknown|unowned|unclassified|stale)/i;
  for (const candidate of candidates) {
    for (const [name, result] of Object.entries(candidate)) {
      if (!pattern.test(name)) continue;
      if (Array.isArray(result) && result.length > 0) blockers.push(`${name}=${result.length}`);
      else if (typeof result === "number" && result > 0) blockers.push(`${name}=${result}`);
      else if (result === false && /zero|empty|none/i.test(name)) blockers.push(`${name}=false`);
    }
  }
  return blockers;
}

function recoveryApprovalComplete(value) {
  if (value?.status !== "approved") return false;
  const global = value?.globalApproval;
  if (
    !global?.changeOwner ||
    !global?.rollbackOwner ||
    !global?.securityApprover ||
    !global?.dataOwnerApprover ||
    !global?.operationsApprover ||
    !global?.approvedAt
  ) return false;
  return Array.isArray(value.contracts) && value.contracts.every((contract) =>
    contract?.approval?.status === "approved" &&
    contract?.approval?.approvedBy?.length > 0 &&
    contract?.approval?.approvedAt &&
    contract?.rpo?.target &&
    contract?.rto?.target &&
    contract?.rollback?.owner &&
    contract?.rollback?.trigger &&
    contract?.observationWindow?.duration &&
    contract?.observationWindow?.approvalStatus === "approved"
  );
}

function allBooleanGatesPass(value) {
  const gates = Object.values(value ?? {});
  return gates.length > 0 && gates.every((gate) => gate === true);
}

function numericValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

async function requiredJson(path, label) {
  const value = await optionalJson(path);
  if (!value) {
    check(`missing_${label.replaceAll(/\W+/g, "_")}`, "static", "fail", `Missing ${path}.`);
  }
  return value;
}

async function optionalJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

async function firstOptionalJson(paths) {
  for (const path of paths) {
    const value = await optionalJson(path);
    if (value) return value;
  }
  return null;
}

function argumentValue(prefix) {
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}
