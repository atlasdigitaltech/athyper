import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { evidencePath, inspectColdStartEvidence, validateJsonEvidence } from "./evidence.mjs";
import { qualificationGateFailures, qualificationRoot } from "./qualification.mjs";
import { createValidator } from "./schema.mjs";

function latestRestoreReceipt(root) {
  if (!existsSync(root)) return null;
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^[0-9]{8}T[0-9]{6}Z$/u.test(entry.name))
    .map((entry) => join(root, entry.name, "restore-receipt.json"))
    .filter(existsSync)
    .sort()
    .at(-1) ?? null;
}

function gate(status, evidence, problems = []) {
  return { status, evidence, problems };
}

export function inspectInfrastructureGates(repoRoot, probes = {}) {
  const validate = createValidator(repoRoot);
  const root = qualificationRoot();
  const dispositionPath = evidencePath(
    "ATHYPER_STACK_V1_DISPOSITION",
    join(root, "stack-v1", "disposition.json"),
  );
  const intakePath = evidencePath(
    "ATHYPER_STACK_V1_EXPORT_INTAKE",
    join(root, "stack-v1", "export-intake.json"),
  );
  const restoreRoot = evidencePath(
    "ATHYPER_STACK_V1_RESTORE_ROOT",
    join(root, "stack-v1", "restore"),
  );
  const restorePath = latestRestoreReceipt(restoreRoot);

  const qualification = probes.qualification ?? qualificationGateFailures();
  const cold = probes.cold ?? inspectColdStartEvidence(repoRoot);
  const disposition = probes.disposition ?? validateJsonEvidence(dispositionPath, validate);
  const intake = probes.intake ?? validateJsonEvidence(intakePath, validate);
  const restore = probes.restore ?? (restorePath
    ? validateJsonEvidence(restorePath, validate)
    : { path: join(restoreRoot, "TIMESTAMP", "restore-receipt.json"), document: null, problem: `Evidence is absent under: ${restoreRoot}` });
  const cleanSlate = disposition.document?.decision === "clean-slate";
  const recoveryConsistency = [];
  if (!cleanSlate && intake.document && restore.document) {
    if (intake.document.exportDirectory !== restore.document.exportDirectory) {
      recoveryConsistency.push("Restore receipt targets a different export directory.");
    }
    if (intake.document.databaseCount !== restore.document.databaseCount) {
      recoveryConsistency.push("Restore receipt database count differs from export intake.");
    }
    if (intake.document.sha256ManifestDigest !== restore.document.exportManifestSha256) {
      recoveryConsistency.push("Restore receipt manifest digest differs from export intake.");
    }
  }

  const gates = {
    machinePhaseStatus: gate(
      qualification.failures.length === 0 ? "pass" : "blocked",
      qualification.path,
      qualification.failures,
    ),
    coldStart: gate(cold.document ? "pass" : "blocked", cold.path, cold.problem ? [cold.problem] : []),
    stackV1Disposition: gate(disposition.document ? "pass" : "blocked", disposition.path, disposition.problem ? [disposition.problem] : []),
    stackV1ExportIntake: cleanSlate
      ? gate("waived-clean-slate", disposition.path, [])
      : gate(intake.document ? "pass" : "blocked", intake.path, intake.problem ? [intake.problem] : []),
    stackV1Restore: gate(
      cleanSlate ? "waived-clean-slate" : (restore.document && recoveryConsistency.length === 0 ? "pass" : "blocked"),
      cleanSlate ? disposition.path : restore.path,
      cleanSlate ? [] : [...(restore.problem ? [restore.problem] : []), ...recoveryConsistency],
    ),
  };
  return {
    gates,
    blockers: Object.values(gates).flatMap((item) => item.status === "blocked" ? item.problems : []),
    cleanSlate,
    qualification,
    cold,
    disposition,
    intake,
    restore,
  };
}
