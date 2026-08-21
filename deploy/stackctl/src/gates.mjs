import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createPlan } from "./plan.mjs";
import { qualificationGateFailures, qualificationRoot } from "./qualification.mjs";
import { createValidator } from "./schema.mjs";

function evidencePath(envName, fallback) {
  return process.env[envName] || fallback;
}

function validateJsonEvidence(path, validate) {
  if (!existsSync(path)) return { path, document: null, problem: `Evidence is absent: ${path}` };
  try {
    const document = validate(JSON.parse(readFileSync(path, "utf8")), path);
    return { path, document, problem: null };
  } catch (error) {
    return { path, document: null, problem: `Evidence is invalid: ${error.message}` };
  }
}

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

export function inspectRemainingGates(repoRoot) {
  const validate = createValidator(repoRoot);
  const root = qualificationRoot();
  const coldPath = evidencePath(
    "ATHYPER_COLD_START_EVIDENCE",
    join(root, "machine", "latest-cold-start-verification.json"),
  );
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

  const cold = validateJsonEvidence(coldPath, validate);
  const disposition = validateJsonEvidence(dispositionPath, validate);
  const intake = validateJsonEvidence(intakePath, validate);
  const restore = restorePath
    ? validateJsonEvidence(restorePath, validate)
    : { path: join(restoreRoot, "TIMESTAMP", "restore-receipt.json"), document: null, problem: `Evidence is absent under: ${restoreRoot}` };

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

  const qualification = qualificationGateFailures();
  const devPlan = createPlan(repoRoot, "dev");
  const qaPlan = createPlan(repoRoot, "qa");
  const secretProblems = devPlan.blockers.filter((problem) => problem.startsWith("Required secret file"));
  const imageProblems = qaPlan.blockers.filter((problem) => /image set|image digest|image is mutable|source revision/iu.test(problem));
  const blockers = [
    ...qualification.failures.map((problem) => `Machine phase: ${problem}`),
    ...[cold.problem, disposition.problem].filter(Boolean),
    ...(!cleanSlate ? [intake.problem, restore.problem].filter(Boolean) : []),
    ...recoveryConsistency,
    ...secretProblems,
    ...imageProblems,
  ];

  return {
    apiVersion: "athyper.io/v1alpha1",
    kind: "RemainingGateReport",
    generatedAt: new Date().toISOString(),
    readOnly: true,
    executionAuthorized: false,
    status: blockers.length === 0 ? "ready-for-explicit-runtime-authorization" : "blocked",
    gates: {
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
        cleanSlate
          ? "waived-clean-slate"
          : (restore.document && recoveryConsistency.length === 0 ? "pass" : "blocked"),
        cleanSlate ? disposition.path : restore.path,
        cleanSlate ? [] : [...(restore.problem ? [restore.problem] : []), ...recoveryConsistency],
      ),
      devSecrets: gate(secretProblems.length === 0 ? "pass" : "blocked", devPlan.requiredSecrets, secretProblems),
      immutableImages: gate(imageProblems.length === 0 ? "pass" : "blocked", qaPlan.sources.imageSet, imageProblems),
    },
    blockers,
    externalAuthorizations: [
      ...(cleanSlate ? [] : ["Old-workstation export execution and encrypted transfer remain operator actions."]),
      "Secret generation requires explicit operator execution after disposition and host gates pass.",
      "Staging, committing, pushing, and image-workflow dispatch require explicit authorization.",
    ],
    actions: ["No action: this command only validates and reports remaining gates."],
  };
}
