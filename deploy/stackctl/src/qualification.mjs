import { existsSync } from "node:fs";
import { readYaml } from "./io.mjs";

export const requiredDeploymentGates = Object.freeze([
  "hostQualification",
  "stackV1Disposition",
  "bitLockerD",
  "secureBoot",
  "linuxUser",
  "dockerRelocation",
  "dockerKubernetes",
  "dockerWslIntegration",
  "defenderWslCompatibility",
  "sourceBootstrap",
]);

export function hostQualificationPath() {
  return process.env.ATHYPER_QUALIFICATION_FILE
    || "/mnt/d/ATHYPER/qualification/machine/phase-status.yaml";
}

export function qualificationRoot() {
  return process.env.ATHYPER_QUALIFICATION_ROOT || "/mnt/d/ATHYPER/qualification";
}

export function qualificationGateFailures() {
  const path = hostQualificationPath();
  if (!existsSync(path)) return { path, failures: ["qualification-evidence=absent"] };
  let document;
  try { document = readYaml(path); } catch (error) {
    return { path, failures: [`qualification-evidence=invalid (${error.message})`] };
  }
  if (!document || typeof document !== "object") {
    return { path, failures: ["qualification-evidence=invalid (expected a YAML mapping)"] };
  }
  const status = document.status ?? {};
  const failures = requiredDeploymentGates
    .filter((gate) => !String(status[gate] ?? "absent").startsWith("complete"))
    .map((gate) => `${gate}=${String(status[gate] ?? "absent")}`);
  return { path, failures };
}
