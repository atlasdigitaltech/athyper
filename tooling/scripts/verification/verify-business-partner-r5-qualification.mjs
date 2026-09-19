#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
export const r5Gates = Object.freeze({
  onboarding: ["BP-CUS-001"],
  role_extensions: ["BP-CUS-002", "BP-CUS-003"],
  controls: [
    "BP-CUS-004",
    "BP-CUS-005",
    "BP-CUS-006",
    "BP-CUS-007",
    "BP-CUS-008",
  ],
  lifecycle_negative: [],
  downstream: [],
  product_approval: [],
});
const actions = ["activate", "suspend", "reactivate", "deactivate", "archive"];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const hash = (value) =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const timestamp = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T/.test(value) &&
  Number.isFinite(Date.parse(value));
const uuid = (value) =>
  typeof value === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
    value,
  );
const exact = (actual, expected) =>
  Array.isArray(actual) &&
  actual.length === expected.length &&
  new Set(actual).size === expected.length &&
  expected.every((value) => actual.includes(value));
function inside(parent, path) {
  const rel = relative(parent, path);
  return (
    rel !== "" && rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel)
  );
}

export function verifyBusinessPartnerR5Qualification({
  root = repositoryRoot,
  manifest,
} = {}) {
  root = realpathSync(root);
  manifest ??= JSON.parse(
    readFileSync(
      resolve(
        root,
        "governance/config/governance/business-partner-r5-qualification.v1.json",
      ),
      "utf8",
    ),
  );
  const failures = [],
    pending = [],
    receipts = new Map();
  const check = (condition, message) => {
    if (!condition) failures.push(message);
  };
  check(
    manifest.$schema === "athyper.business-partner-r5-qualification/1",
    "invalid R5 manifest schema",
  );
  check(
    exact(
      manifest.gates?.map((gate) => gate.id),
      Object.keys(r5Gates),
    ),
    "exactly six distinct R5 gates are required",
  );
  const evidenceRoot = resolve(
    root,
    "governance/evidence/business-partner/r5-target",
  );
  function readBounded(path) {
    if (typeof path !== "string" || !inside(evidenceRoot, resolve(root, path)))
      throw new Error("receipt/artifact must be below r5-target");
    const actual = realpathSync(resolve(root, path));
    if (!inside(evidenceRoot, actual))
      throw new Error("receipt/artifact symlink escapes r5-target");
    return readFileSync(actual);
  }
  for (const id of Object.keys(r5Gates)) {
    const gate = manifest.gates?.find((item) => item.id === id);
    if (!gate) continue;
    if (gate.status === "pending") {
      pending.push(id);
      check(
        gate.receipt === null,
        `${id}: pending gate cannot claim a receipt`,
      );
      continue;
    }
    check(gate.status === "passed", `${id}: invalid gate status`);
    if (gate.status !== "passed") continue;
    try {
      const receipt = JSON.parse(readBounded(gate.receipt));
      receipts.set(id, receipt);
      check(
        receipt.schema === "athyper.business-partner-r5-target-receipt/1" &&
          receipt.gate === id &&
          receipt.result === "passed",
        `${id}: invalid receipt coordinates`,
      );
      check(
        receipt.environment === "production" && receipt.sanitized === true,
        `${id}: sanitized production target evidence is required`,
      );
      check(
        timestamp(receipt.completedAt) &&
          Date.parse(receipt.completedAt) <= Date.now(),
        `${id}: invalid completion timestamp`,
      );
      check(
        /^[a-f0-9]{40}$/.test(receipt.sourceRevision ?? "") &&
          hash(receipt.buildDigest),
        `${id}: deployed source revision and build digest are required`,
      );
      check(
        typeof receipt.targetId === "string" &&
          /^[a-z0-9][a-z0-9._-]{2,99}$/.test(receipt.targetId),
        `${id}: bounded target identity is required`,
      );
      check(
        exact(receipt.scenarios, r5Gates[id]),
        `${id}: scenario coverage is incomplete`,
      );
      check(
        hash(receipt.artifactSha256) &&
          sha256(readBounded(receipt.artifact)) === receipt.artifactSha256,
        `${id}: retained artifact hash mismatch`,
      );
      const proof = receipt.proof ?? {};
      if (id === "onboarding") {
        check(
          uuid(proof.caseId) &&
            uuid(proof.materializationId) &&
            uuid(proof.sourceSnapshotId) &&
            uuid(proof.resultSnapshotId) &&
            proof.sourceSnapshotId !== proof.resultSnapshotId,
          `${id}: materialization/snapshot coordinates required`,
        );
        check(
          proof.mutationJourney === true &&
            proof.customerCount === 1 &&
            proof.customerStatus === "prospect" &&
            proof.lineageRetained === true,
          `${id}: readback alone cannot qualify onboarding`,
        );
      } else if (id === "role_extensions") {
        check(
          proof.identityReused === true &&
            proof.oppositeAuthorityUnchanged === true,
          `${id}: identity and opposite-role evidence required`,
        );
      } else if (id === "controls") {
        check(
          proof.creditRejected === true &&
            proof.staleCreditDenied === true &&
            proof.blockedActivationDenied === true &&
            proof.designationScopeVerified === true &&
            proof.independentReconciliation === true,
          `${id}: control evidence is incomplete`,
        );
        check(
          exact(
            proof.lifecycle?.map((event) => event.action),
            actions,
          ),
          `${id}: five lifecycle actions required`,
        );
        check(
          proof.lifecycle?.every(
            (event) =>
              uuid(event.eventId) &&
              Number.isSafeInteger(event.version) &&
              event.version > 1,
          ) &&
            new Set(proof.lifecycle?.map((event) => event.eventId)).size === 5,
          `${id}: distinct lifecycle events and versions required`,
        );
        check(
          proof.lifecycle?.every(
            (event, index, all) =>
              event.action === actions[index] &&
              (index === 0 || event.version === all[index - 1].version + 1),
          ),
          `${id}: ordered successive lifecycle versions required`,
        );
      } else if (id === "lifecycle_negative") {
        check(
          exact(proof.outcomes, [
            "exact_replay",
            "conflicting_key_denied",
            "stale_version_denied",
            "wrong_tenant_denied",
            "permission_denied",
            "invalid_transition_denied",
          ]),
          `${id}: lifecycle negative/replay coverage incomplete`,
        );
      } else if (id === "downstream") {
        check(
          Array.isArray(proof.deliveries) &&
            proof.deliveries.length === 5 &&
            proof.deliveries.every(
              (item) =>
                uuid(item.lifecycleEventId) &&
                uuid(item.projectionReceiptId) &&
                uuid(item.notificationReceiptId) &&
                item.projectionStatus === "consumed" &&
                item.notificationStatus === "delivered",
            ),
          `${id}: consumed projection and delivered notification receipts required for every action`,
        );
      } else if (id === "product_approval") {
        const approvedPacket = readFileSync(
          resolve(
            root,
            "governance/policy/reports/business-partner-customer-state-review.md",
          ),
        );
        check(
          proof.decisionId === "BP-Q002" &&
            proof.decision === "approved" &&
            proof.accountableRole === "NEON Master Data",
          `${id}: BP-Q002 accountable approval required`,
        );
        check(
          typeof proof.reviewerName === "string" &&
            proof.reviewerName.trim().includes(" ") &&
            uuid(proof.reviewerPrincipalId) &&
            timestamp(proof.approvedAt) &&
            Date.parse(proof.approvedAt) <= Date.parse(receipt.completedAt),
          `${id}: named reviewer identity and approval timestamp required`,
        );
        check(
          proof.packetSha256 === sha256(approvedPacket) &&
            hash(proof.approvalEvidenceSha256),
          `${id}: approval must bind the current review packet and retained decision evidence`,
        );
        check(
          proof.approvalEvidenceSha256 === receipt.artifactSha256,
          `${id}: approval evidence must match the retained artifact`,
        );
        check(
          proof.archiveRetentionSemanticsAccepted === true &&
            proof.reactivationBlockSemanticsAccepted === true,
          `${id}: unresolved state semantics cannot qualify`,
        );
      }
    } catch (error) {
      failures.push(`${id}: ${error.message}`);
    }
  }
  const controls = receipts.get("controls"),
    downstream = receipts.get("downstream");
  if (controls && downstream) {
    check(
      exact(
        downstream.proof?.deliveries?.map((item) => item.lifecycleEventId),
        controls.proof?.lifecycle?.map((item) => item.eventId) ?? [],
      ),
      "downstream: receipts must reconcile the exact lifecycle events",
    );
    for (const event of controls.proof?.lifecycle ?? []) {
      const delivery = downstream.proof?.deliveries?.find(
        (item) => item.lifecycleEventId === event.eventId,
      );
      check(
        delivery?.desiredState ===
          (["activate", "reactivate"].includes(event.action)
            ? "active"
            : "inactive"),
        "downstream: projected state must match lifecycle action",
      );
    }
  }
  const targets = [...receipts.values()].map(
    (r) => `${r.targetId}:${r.sourceRevision}:${r.buildDigest}`,
  );
  check(
    new Set(targets).size <= 1,
    "all receipts must bind the same target revision and build",
  );
  const qualified =
    pending.length === 0 && receipts.size === 6 && failures.length === 0;
  check(
    manifest.productionQualified === qualified &&
      manifest.productionQualification ===
        (qualified ? "qualified" : "blocked"),
    "manifest qualification must match complete verified evidence",
  );
  if (failures.length)
    throw new Error(`R5 qualification failed:\n- ${failures.join("\n- ")}`);
  return {
    schema: "athyper.business-partner-r5-qualification-result/1",
    gates: 6,
    passed: receipts.size,
    pending,
    productionQualified: qualified,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const result = verifyBusinessPartnerR5Qualification();
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    if (
      process.argv.includes("--require-qualified") &&
      !result.productionQualified
    )
      process.exitCode = 2;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
