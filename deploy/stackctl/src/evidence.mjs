import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { qualificationRoot } from "./qualification.mjs";
import { createValidator } from "./schema.mjs";

export function evidencePath(envName, fallback) {
  return process.env[envName] || fallback;
}

export function validateJsonEvidence(path, validate) {
  if (!existsSync(path)) return { path, document: null, problem: `Evidence is absent: ${path}` };
  try {
    const document = validate(JSON.parse(readFileSync(path, "utf8")), path);
    return { path, document, problem: null };
  } catch (error) {
    return { path, document: null, problem: `Evidence is invalid: ${error.message}` };
  }
}

export function inspectColdStartEvidence(repoRoot) {
  const path = evidencePath(
    "ATHYPER_COLD_START_EVIDENCE",
    join(qualificationRoot(), "machine", "latest-cold-start-verification.json"),
  );
  return validateJsonEvidence(path, createValidator(repoRoot));
}
