#!/usr/bin/env tsx

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  evaluateWave8Certification,
  type Wave8EvidenceBundle,
  type Wave8RehearsalManifest,
} from "../rehearsal/wave8-certification.js";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../../../..");
const args = process.argv.slice(2);
const manifestPath = option("--manifest");
const evidencePath = option("--evidence");
if (Boolean(manifestPath) !== Boolean(evidencePath)) {
  throw new Error("--manifest and --evidence must be supplied together");
}
const failures: string[] = [];
const files = {
  contract:
    "config/governance/authorization-wave8-rehearsal-contract.v1.json",
  recovery:
    "config/governance/authorization-migration-recovery-contract.v1.json",
  certification:
    "server/db/scripts/rehearsal/wave8-certification.ts",
  stateCapture:
    "server/db/scripts/reports/capture-wave8-database-state.ts",
  disposition:
    "server/db/scripts/migrate/execute-fresh-database-disposition.ts",
  wave7:
    "server/db/scripts/verify/verify-authorization-v2-wave7.ts",
  wave6:
    "server/db/scripts/verify/verify-authorization-v2-wave6.ts",
  runbook:
    "docs/runbooks/authorization-v2-wave8-reset-cutover-observation.md",
} as const;
const source = Object.fromEntries(
  await Promise.all(Object.entries(files).map(async ([key, path]) =>
    [key, await readFile(resolve(repositoryRoot, path), "utf8")] as const
  )),
) as Record<keyof typeof files, string>;

requireTokens("Wave 8 contract", source.contract, [
  '"isolated_production_like"',
  '"fresh_target_connection_switch"',
  '"inPlaceResetAllowed": false',
  '"authorized": false',
]);
requireTokens("certification evaluator", source.certification, [
  "backup_restore_failed",
  "forward_replay_failed",
  "reverse_replay_failed",
  "identity_or_subject_set_mismatch",
  "seed_equivalence_failed",
  "constraint_certification_failed",
  "owner_acceptance_missing",
  "negative_boundary_or_dispatcher_test_failed",
  "rollback_rto_exceeded",
  "stable_observation_incomplete",
  "data_reconciliation_failed",
]);
requireTokens("read-only state capture", source.stateCapture, [
  "REPEATABLE READ READ ONLY",
  "source and target URLs must differ",
  "unexpectedUnvalidatedConstraints",
  "identityCanonicalSha256",
  "seedOwnedSha256",
  "authorization_cutover_plane_v2",
]);
requireTokens("fresh-target executor", source.disposition, [
  "source and target URLs must differ",
  "target is not fresh/empty",
  "SERIALIZABLE",
  "deletes: 0",
  "truncates: 0",
]);
requireTokens("runbook", source.runbook, [
  "No in-place reset",
  "Backup and restore",
  "Demonstrate complete-transaction forward replay",
  "one active external-effect dispatcher lease",
  "Stable observation",
  "Rollback rehearsal",
]);
const recovery = JSON.parse(source.recovery) as {
  status?: string;
  globalApproval?: { ticket?: string | null };
};
const recoveryApproved =
  recovery.status === "approved" && Boolean(recovery.globalApproval?.ticket);

let certification:
  | ReturnType<typeof evaluateWave8Certification>
  | undefined;
if (manifestPath && evidencePath) {
  const manifest = JSON.parse(
    await readFile(resolve(manifestPath), "utf8"),
  ) as Wave8RehearsalManifest;
  const evidence = JSON.parse(
    await readFile(resolve(evidencePath), "utf8"),
  ) as Wave8EvidenceBundle;
  certification = evaluateWave8Certification(manifest, evidence);
  if (!recoveryApproved) {
    certification = {
      ...certification,
      passed: false,
      blockers: [
        ...certification.blockers,
        "recovery_contract_not_approved",
      ].sort(),
    };
  }
  if (!certification.passed) {
    failures.push(...certification.blockers);
  }
}
if (failures.length > 0) {
  throw new Error(`Wave 8 verification failed:\n- ${failures.join("\n- ")}`);
}
process.stdout.write(`${JSON.stringify({
  contractVersion: "wave8.reset-cutover-observation.v1",
  staticGates: "passed",
  executionStrategy: "fresh_target_connection_switch",
  inPlaceResetExecuted: false,
  recoveryContractApproved: recoveryApproved,
  certification: certification ?? "operational_evidence_pending",
  liveMutationPerformed: false,
}, null, 2)}\n`);

function option(name: string): string | undefined {
  return args.find((arg) => arg.startsWith(`${name}=`))
    ?.slice(name.length + 1).trim();
}

function requireTokens(label: string, content: string, tokens: string[]): void {
  for (const token of tokens) {
    if (!content.includes(token)) failures.push(`${label} missing ${token}`);
  }
}
