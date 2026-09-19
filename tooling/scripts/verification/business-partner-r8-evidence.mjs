import { createHash } from "node:crypto";

export const R8_GATES = Object.freeze([
  "target_evidence_lifecycle",
  "manual_accessibility",
  "clean_upgrade_parity",
  "production_canary_rollback",
  "named_owner_certification",
]);
export const R8_PARITY_CATEGORIES = Object.freeze([
  "relationDispositions",
  "columns",
  "requestExtensionColumns",
  "constraintSemantics",
  "supportingIndexes",
  "rls",
  "policies",
  "triggers",
  "functions",
  "tableOwners",
  "tableGrants",
  "functionGrants",
  "comments",
  "s2Columns",
  "s2Constraints",
  "s2Indexes",
  "s2Rls",
  "s2Policies",
  "s2Triggers",
  "s2Functions",
  "s2Owners",
  "s2TableGrants",
  "s2Comments",
  "s3Columns",
  "s3Constraints",
  "s3Indexes",
  "s3Triggers",
  "s3Functions",
  "s3Views",
  "s3RlsAndPolicies",
  "s3Comments",
  "s3LifecycleTableGrants",
  "s3LifecycleColumnGrants",
  "s3LifecycleFunctionGrants",
  "s4Columns",
  "s4Constraints",
  "s4Indexes",
  "s4Triggers",
  "s4Functions",
  "s4RlsPolicies",
  "s5Columns",
  "s5ConstraintsIndexes",
  "s5Triggers",
  "s5Functions",
  "s5RlsPolicies",
  "s5Grants",
]);
export const R8_OWNERS = Object.freeze([
  "product_owner",
  "engineering_owner",
  "operations_owner",
  "security_privacy_owner",
]);
export const R8_ACCESSIBILITY_CHECKS = Object.freeze([
  "keyboard_navigation",
  "focus_visibility_and_order",
  "form_labels_and_errors",
  "simulation_status_announcement",
  "immutable_revision_review",
  "approval_confirmation",
  "proof_table_navigation",
  "zoom_reflow",
  "desktop_viewport",
  "mobile_viewport",
]);
export const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");
export const isSha256 = (value) =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export const isReference = (value) =>
  typeof value === "string" &&
  /^[A-Za-z0-9][A-Za-z0-9._:/-]{2,255}$/.test(value) &&
  !value.includes("..") &&
  !/^(?:https?|postgres(?:ql)?):/i.test(value);
const uuid = (value) =>
  typeof value === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
    value,
  );
const same = (a, b) => canonical(a) === canonical(b);
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export function containsSensitiveMaterial(value) {
  const text = JSON.stringify(value);
  return (
    /"(?:password|secret|token|authorization|privateKey|accessToken|refreshToken|clientSecret|databaseUrl|connectionString)"\s*:/i.test(
      text,
    ) ||
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text) ||
    /Bearer\s+[A-Za-z0-9._~-]+/i.test(text) ||
    /(?:postgres(?:ql)?:\/\/|https?:\/\/[^\s"]*[?@]|-----BEGIN .*PRIVATE KEY-----)/i.test(
      text,
    )
  );
}

// A digest is computed from the retained bytes, not trusted as a self-asserted
// field. The receipt must describe exactly the evidence the reviewer supplied.
export function validateR8Artifact(gate, receipt, bytes, failures) {
  if (
    !isSha256(receipt.contentSha256) ||
    sha256(bytes) !== receipt.contentSha256
  ) {
    failures.push(`${gate} retained artifact digest does not match`);
    return;
  }
  let artifact;
  try {
    artifact = JSON.parse(bytes.toString("utf8"));
  } catch {
    failures.push(`${gate} artifact must be JSON`);
    return;
  }
  if (artifact?.schema !== "athyper.business-partner-r8-evidence-artifact/1")
    failures.push(`${gate} artifact schema is invalid`);
  for (const key of [
    "gate",
    "result",
    "environment",
    "targetRef",
    "sourceRevision",
    "startedAt",
    "completedAt",
    "evidence",
  ])
    if (!same(artifact?.[key], receipt[key]))
      failures.push(`${gate} artifact ${key} differs from receipt`);
  if (containsSensitiveMaterial(artifact))
    failures.push(`${gate} artifact contains sensitive material`);
  const e = receipt.evidence ?? {};
  if (!isReference(receipt.targetRef))
    failures.push(`${gate} targetRef is required`);
  if (gate === "target_evidence_lifecycle") {
    if (
      !isReference(e.objectVersionRef) ||
      !isReference(e.retentionAttestationRef) ||
      e.retentionMode !== "COMPLIANCE" ||
      e.retentionVerified !== true
    )
      failures.push(
        `${gate} requires verified compliance retention, object version and provider attestation`,
      );
  } else if (gate === "manual_accessibility") {
    if (
      !isReference(e.reviewAttestationRef) ||
      !Array.isArray(e.checks) ||
      e.checks.length !== R8_ACCESSIBILITY_CHECKS.length ||
      R8_ACCESSIBILITY_CHECKS.some(
        (id) =>
          e.checks.filter(
            (check) =>
              check?.id === id &&
              check.result === "passed" &&
              isReference(check.evidenceRef),
          ).length !== 1,
      )
    )
      failures.push(
        `${gate} requires completed manual journey checks and review attestation`,
      );
    if (
      !Array.isArray(e.assistiveTechnologies) ||
      e.assistiveTechnologies.some(
        (item) => typeof item !== "string" || item.trim().length < 3,
      )
    )
      failures.push(`${gate} assistive technology names are invalid`);
  } else if (gate === "clean_upgrade_parity") {
    validateParity(e, receipt, failures);
  } else if (gate === "production_canary_rollback") {
    validateCanary(e, receipt, failures);
  } else if (gate === "named_owner_certification") {
    if (
      !e.reviewedReceipts ||
      R8_GATES.slice(0, 4).some((id) => !isSha256(e.reviewedReceipts[id]))
    )
      failures.push(`${gate} must pin the other four receipt digests`);
    const certs = Array.isArray(e.certifications) ? e.certifications : [];
    if (
      certs.some(
        (item) =>
          !isReference(item.approvalRef) ||
          Date.parse(item.signedAt) < Date.parse(receipt.startedAt) ||
          Date.parse(item.signedAt) > Date.parse(receipt.completedAt),
      )
    )
      failures.push(
        `${gate} requires approval references and signatures within the review period`,
      );
    if (
      new Set(certs.map((item) => String(item.name).trim().toLowerCase()))
        .size !== 4
    )
      failures.push(`${gate} certifiers must be four distinct people`);
  }
}
function validateParity(e, receipt, failures) {
  const report = e.catalogReport;
  if (
    report?.environment !== receipt.environment ||
    report?.sourceRevision !== receipt.sourceRevision ||
    report?.targetRef !== receipt.targetRef
  )
    failures.push(
      "clean_upgrade_parity report target and source revision must match the receipt",
    );
  const identities = report?.databases;
  const counts = report?.comparedObjectCounts;
  const differences = report?.differences;
  const categories =
    differences && typeof differences === "object"
      ? Object.keys(differences)
      : [];
  const required = [
    "relationDispositions",
    "columns",
    "rls",
    "functions",
    "s5Functions",
    "s5Grants",
  ];
  if (!same([...categories].sort(), [...R8_PARITY_CATEGORIES].sort()))
    failures.push(
      "clean_upgrade_parity must include the complete S0-S5 catalog category set",
    );
  if (
    !isReference(e.supportedUpgradeBaselineRef) ||
    report?.schemaVersion !== 1 ||
    !identities?.clean ||
    !identities?.upgrade ||
    !/^\d+$/.test(String(identities?.clean?.system_identifier)) ||
    !/^\d+$/.test(String(identities?.upgrade?.system_identifier)) ||
    !/^\d+$/.test(String(identities?.clean?.database_oid)) ||
    !/^\d+$/.test(String(identities?.upgrade?.database_oid)) ||
    (identities?.clean?.system_identifier ===
      identities?.upgrade?.system_identifier &&
      identities?.clean?.database_oid === identities?.upgrade?.database_oid) ||
    required.some(
      (key) =>
        !categories.includes(key) ||
        !(counts?.[key]?.clean > 0) ||
        counts[key].clean !== counts[key].upgrade,
    ) ||
    categories.some(
      (key) =>
        !Number.isSafeInteger(counts?.[key]?.clean) ||
        counts[key].clean < 0 ||
        counts[key].clean !== counts[key].upgrade ||
        ["missingInUpgrade", "extraInUpgrade", "changed"].some(
          (field) =>
            !Array.isArray(differences[key]?.[field]) ||
            differences[key][field].length !== 0,
        ),
    )
  )
    failures.push(
      "clean_upgrade_parity requires a nonempty zero-drift catalog report from distinct databases and the supported baseline",
    );
}
function validateCanary(e, receipt, failures) {
  const r = e.canaryReport;
  if (
    r?.sourceRevision !== receipt.sourceRevision ||
    r?.targetRef !== receipt.targetRef
  )
    failures.push(
      "production_canary_rollback report target and source revision must match the receipt",
    );
  if (
    r?.schema !== "athyper.publication-canary-evidence.v1" ||
    r.result !== "passed" ||
    r.environment !== "production" ||
    !uuid(r.releaseId) ||
    !isReference(r.publicationKey)
  ) {
    failures.push(
      "production_canary_rollback requires a successful production canary report",
    );
    return;
  }
  const correlations = [
    r.publish?.correlationId,
    ...["studio", "neon", "mesh"].map(
      (plane) => r.rollbackJobs?.[plane]?.correlationId,
    ),
  ];
  if (
    correlations.some((id) => !uuid(id)) ||
    new Set(correlations).size !== 4 ||
    !same([...correlations].sort(), [...(e.correlationIds ?? [])].sort())
  )
    failures.push("production_canary_rollback correlation proof is invalid");
  if (!Array.isArray(r.deployments) || r.deployments.length !== 3)
    failures.push(
      "production_canary_rollback requires three deployment acknowledgements",
    );
  for (const plane of ["studio", "neon", "mesh"]) {
    const before = r.before?.[plane],
      after = r.afterPublish?.[plane],
      restored = r.afterRollback?.[plane];
    const headValid = (head) =>
      head &&
      uuid(head.appliedReleaseId) &&
      uuid(head.sourceReleaseId) &&
      Number.isSafeInteger(head.sourceReleaseNo) &&
      head.sourceReleaseNo > 0 &&
      isSha256(head.artifactHash);
    const deployment = Array.isArray(r.deployments)
      ? r.deployments.filter((item) => item.target_plane === plane)
      : [];
    if (
      !headValid(before) ||
      !headValid(after) ||
      !headValid(restored) ||
      before.sourceReleaseId === r.releaseId ||
      after.sourceReleaseId !== r.releaseId ||
      !same(before, restored) ||
      deployment.length !== 1 ||
      deployment[0].status !== "activated" ||
      !uuid(deployment[0].acknowledgement_id) ||
      deployment[0].content_hash !== after.artifactHash
    )
      failures.push(
        `production_canary_rollback ${plane} must activate the canary and restore the exact prior head`,
      );
  }
}
