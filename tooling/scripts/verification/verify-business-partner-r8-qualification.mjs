#!/usr/bin/env node

import { readFileSync, realpathSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  validateR8Artifact,
  containsSensitiveMaterial,
  sha256,
} from "./business-partner-r8-evidence.mjs";

const projectRoot = resolve(
  fileURLToPath(new URL("../../../", import.meta.url)),
);
const defaultManifestPath = resolve(
  projectRoot,
  "governance/config/governance/business-partner-r8-qualification.v1.json",
);
const requiredGates = Object.freeze([
  "target_evidence_lifecycle",
  "manual_accessibility",
  "clean_upgrade_parity",
  "production_canary_rollback",
  "named_owner_certification",
]);
const requiredOwnerRoles = Object.freeze([
  "product_owner",
  "engineering_owner",
  "operations_owner",
  "security_privacy_owner",
]);

export function verifyBusinessPartnerR8Qualification(options = {}) {
  const root = resolve(options.repositoryRoot ?? projectRoot);
  const manifestPath = resolve(options.manifestPath ?? defaultManifestPath);
  const manifest =
    options.manifest ?? JSON.parse(readFileSync(manifestPath, "utf8"));
  const failures = [];
  const receipts = new Map();
  if (manifest.$schema !== "athyper.business-partner-r8-qualification/1")
    failures.push("R8 qualification schema is invalid");
  const gates = new Map((manifest.gates ?? []).map((gate) => [gate.id, gate]));
  if (
    !Array.isArray(manifest.gates) ||
    manifest.gates.length !== requiredGates.length ||
    gates.size !== requiredGates.length ||
    requiredGates.some((id) => !gates.has(id))
  )
    failures.push(
      "R8 qualification must contain exactly the five required gates",
    );

  const evidenceRoot = resolve(root, String(manifest.evidenceDirectory ?? ""));
  if (evidenceRoot !== resolve(root, "governance/evidence/business-partner/r8"))
    failures.push("R8 evidence directory must remain inside the repository");
  const readBounded = (path) => {
    const actual = realpathSync(path);
    if (!inside(evidenceRoot, actual))
      throw new Error("Evidence path escapes the R8 directory");
    return readFileSync(actual);
  };
  let passed = 0;
  for (const id of requiredGates) {
    const gate = gates.get(id);
    if (!gate) continue;
    validateRequirements(id, gate.requirements, failures);
    if (!["pending", "passed"].includes(gate.status)) {
      failures.push(`${id} has invalid status`);
      continue;
    }
    if (gate.status === "pending") {
      if (gate.receipt !== null)
        failures.push(`${id} pending gate must not claim a receipt`);
      continue;
    }
    passed += 1;
    if (typeof gate.receipt !== "string" || !gate.receipt) {
      failures.push(`${id} passed gate requires a receipt path`);
      continue;
    }
    const receiptPath = resolve(root, gate.receipt);
    if (!inside(evidenceRoot, receiptPath)) {
      failures.push(
        `${id} receipt must be below ${manifest.evidenceDirectory}`,
      );
      continue;
    }
    let receipt;
    try {
      receipt = options.readReceipt
        ? options.readReceipt(gate.receipt)
        : JSON.parse(readBounded(receiptPath).toString("utf8"));
    } catch {
      failures.push(`${id} receipt does not exist or is invalid JSON`);
      continue;
    }
    validateReceipt(id, receipt, failures);
    if (!receipt || typeof receipt !== "object") continue;
    receipts.set(id, receipt);
    const artifactPath =
      typeof receipt.artifactPath === "string"
        ? resolve(root, receipt.artifactPath)
        : evidenceRoot;
    if (!inside(evidenceRoot, artifactPath) || artifactPath === receiptPath) {
      failures.push(
        `${id} must reference a separate retained artifact below the R8 directory`,
      );
      continue;
    }
    try {
      const bytes = options.readArtifact
        ? options.readArtifact(receipt.artifactPath)
        : readBounded(artifactPath);
      validateR8Artifact(id, receipt, Buffer.from(bytes), failures);
    } catch {
      failures.push(`${id} retained artifact is missing or unreadable`);
    }
  }

  if (
    receipts.size > 1 &&
    (new Set([...receipts.values()].map((r) => r.sourceRevision)).size !== 1 ||
      new Set([...receipts.values()].map((r) => r.targetRef)).size !== 1)
  )
    failures.push("R8 receipts must share the same source revision and target");
  const certification = receipts.get("named_owner_certification");
  if (certification)
    for (const id of requiredGates.slice(0, 4)) {
      const gate = gates.get(id);
      try {
        if (!gate?.receipt || !receipts.has(id))
          throw new Error("Missing prerequisite");
        const bytes = options.readReceiptBytes
          ? options.readReceiptBytes(gate.receipt)
          : readBounded(resolve(root, gate.receipt));
        if (sha256(bytes) !== certification.evidence?.reviewedReceipts?.[id])
          failures.push(
            `named_owner_certification ${id} reviewed receipt digest does not match`,
          );
        if (
          Date.parse(certification.startedAt) <
          Date.parse(receipts.get(id).completedAt)
        )
          failures.push(`named_owner_certification must follow ${id}`);
      } catch {
        failures.push(
          `named_owner_certification requires retained ${id} evidence`,
        );
      }
    }
  const allPassed = passed === requiredGates.length && failures.length === 0;
  if (manifest.productionQualified !== allPassed)
    failures.push(
      "productionQualified must equal the complete five-gate result",
    );
  if (
    (allPassed && manifest.productionQualification !== "qualified") ||
    (!allPassed && manifest.productionQualification !== "blocked")
  )
    failures.push("productionQualification does not match gate state");
  if (failures.length)
    throw new Error(
      `Business Partner R8 qualification failed:\n- ${failures.join("\n- ")}`,
    );
  return Object.freeze({
    gates: requiredGates.length,
    passed,
    productionQualified: allPassed,
  });
}

function validateRequirements(gate, requirements, failures) {
  const invalid =
    !requirements ||
    (gate === "target_evidence_lifecycle" &&
      (requirements.immutable !== true ||
        requirements.contentSha256 !== true ||
        requirements.minimumRetentionDays !== 90 ||
        requirements.sanitized !== true)) ||
    (gate === "manual_accessibility" &&
      (requirements.standard !== "WCAG 2.2 AA" ||
        requirements.zoomPercent !== 200 ||
        !sameSet(requirements.viewports, ["1440x900", "412x915"]) ||
        requirements.assistiveTechnologyRequired !== true)) ||
    (gate === "clean_upgrade_parity" &&
      (requirements.distinctDatabases !== true ||
        requirements.maximumDrift !== 0)) ||
    (gate === "production_canary_rollback" &&
      (!sameSet(requirements.planes, ["studio", "neon", "mesh"]) ||
        requirements.restoreExactPriorHeads !== true ||
        requirements.retainedCorrelations !== true)) ||
    (gate === "named_owner_certification" &&
      (!sameSet(requirements.roles, requiredOwnerRoles) ||
        requirements.separationOfDuties !== true));
  if (invalid)
    failures.push(`${gate} qualification requirements are incomplete`);
}

function validateReceipt(gate, receipt, failures) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
    failures.push(`${gate} receipt must be an object`);
    return;
  }
  if (receipt.schema !== "athyper.business-partner-r8-evidence-receipt/1")
    failures.push(`${gate} receipt schema is invalid`);
  if (receipt.gate !== gate || receipt.result !== "passed")
    failures.push(`${gate} receipt coordinates or result are invalid`);
  if (receipt.environment !== "production" || receipt.sanitized !== true)
    failures.push(`${gate} receipt must be sanitized production evidence`);
  if (!timestamp(receipt.startedAt) || !timestamp(receipt.completedAt))
    failures.push(`${gate} receipt timestamps are invalid`);
  else if (Date.parse(receipt.completedAt) < Date.parse(receipt.startedAt))
    failures.push(`${gate} receipt completes before it starts`);
  if (!/^[a-f0-9]{40}$/.test(String(receipt.sourceRevision ?? "")))
    failures.push(`${gate} source revision must be a full Git SHA`);
  if (!/^[a-f0-9]{64}$/.test(String(receipt.contentSha256 ?? "")))
    failures.push(`${gate} content SHA-256 is invalid`);
  if (containsSensitiveMaterial(receipt))
    failures.push(`${gate} receipt contains sensitive material`);

  const evidence = receipt.evidence ?? {};
  if (gate === "target_evidence_lifecycle") {
    if (
      evidence.immutable !== true ||
      !timestamp(evidence.retainedUntil) ||
      Date.parse(evidence.retainedUntil) <
        Date.parse(receipt.completedAt) + 90 * 86400000 ||
      !safeReference(evidence.locationRef)
    )
      failures.push(
        `${gate} requires immutable evidence retained for at least 90 days`,
      );
  } else if (gate === "manual_accessibility") {
    if (
      evidence.standard !== "WCAG 2.2 AA" ||
      evidence.zoomPercent !== 200 ||
      !sameSet(evidence.viewports, ["1440x900", "412x915"]) ||
      !Array.isArray(evidence.assistiveTechnologies) ||
      evidence.assistiveTechnologies.length === 0 ||
      !namedReviewer(evidence.reviewer)
    )
      failures.push(
        `${gate} requires named manual WCAG, zoom, viewport and assistive-technology evidence`,
      );
  } else if (gate === "clean_upgrade_parity") {
    if (
      evidence.driftCount !== 0 ||
      !safeReference(evidence.cleanDatabaseRef) ||
      !safeReference(evidence.upgradeDatabaseRef) ||
      evidence.cleanDatabaseRef === evidence.upgradeDatabaseRef
    )
      failures.push(
        `${gate} requires distinct sanitized database references and zero drift`,
      );
  } else if (gate === "production_canary_rollback") {
    if (
      !sameSet(evidence.planes, ["studio", "neon", "mesh"]) ||
      evidence.exactPriorHeadsRestored !== true ||
      !Array.isArray(evidence.correlationIds) ||
      evidence.correlationIds.length < 4
    )
      failures.push(
        `${gate} requires three-plane activation and exact rollback correlation proof`,
      );
  } else if (gate === "named_owner_certification") {
    const certifications = Array.isArray(evidence.certifications)
      ? evidence.certifications
      : [];
    if (
      !sameSet(
        certifications.map((item) => item?.role),
        requiredOwnerRoles,
      ) ||
      certifications.some(
        (item) => !namedReviewer(item) || !timestamp(item.signedAt),
      ) ||
      new Set(certifications.map((item) => item.name)).size !==
        certifications.length
    )
      failures.push(
        `${gate} requires four distinct named owner certifications`,
      );
  }
}

function inside(parent, child) {
  const value = relative(parent, child);
  return (
    value !== "" &&
    value !== ".." &&
    !value.startsWith(`..${sep}`) &&
    !value.startsWith(sep)
  );
}
function timestamp(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}
function safeReference(value) {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:/-]{2,255}$/.test(value) &&
    !value.includes("..")
  );
}
function namedReviewer(value) {
  return (
    value &&
    typeof value.name === "string" &&
    value.name.trim().length >= 2 &&
    typeof value.role === "string" &&
    value.role.trim().length >= 2
  );
}
function sameSet(left, right) {
  return (
    Array.isArray(left) &&
    left.length === right.length &&
    [...left].sort().join("|") === [...right].sort().join("|")
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = verifyBusinessPartnerR8Qualification();
  process.stdout.write(
    `Business Partner R8 qualification gates verified: ${result.passed}/${result.gates} passed; production qualification ${result.productionQualified ? "qualified" : "blocked"}.\n`,
  );
}
