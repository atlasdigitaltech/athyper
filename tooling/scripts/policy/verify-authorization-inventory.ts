import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AUTHORIZATION_INVENTORY_PATH,
  AUTHORIZATION_SUMMARY_PATH,
  buildAuthorizationInventory,
  renderAuthorizationInventoryMarkdown,
  serializeAuthorizationInventory,
  type AuthorizationInventory,
} from "./authorization-inventory.js";

const KNOWN_ANOMALY_GATES = new Set([
  "knownSourceAnomalies",
  "zeroMeshNeonBoundaryFindings",
]);

export interface AuthorizationInventoryVerification {
  inventory: AuthorizationInventory;
  artifactDriftFailures: string[];
  structuralGateFailures: string[];
  knownAnomalyFailures: string[];
  structuralPassed: boolean;
  strictPassed: boolean;
  failures: string[];
}

function compareGeneratedFile(
  root: string,
  path: string,
  expected: string,
  failures: string[],
): void {
  const absolutePath = resolve(root, path);
  if (!existsSync(absolutePath)) {
    failures.push(`${path}: generated inventory artifact is missing`);
    return;
  }
  const actual = readFileSync(absolutePath, "utf8").replaceAll("\r\n", "\n");
  if (actual !== expected) {
    failures.push(
      `${path}: generated inventory is stale; run `
      + "`pnpm exec tsx tooling/scripts/policy/authorization-inventory.ts`",
    );
  }
}

function gateIdentity(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  const item = value as Record<string, unknown>;
  for (const key of ["qualifiedName", "symbol", "code", "identity", "objectId", "path"]) {
    if (typeof item[key] === "string") return item[key];
  }
  return JSON.stringify(value);
}

function gateFailures(
  inventory: AuthorizationInventory,
  predicate: (gate: string) => boolean,
): string[] {
  const failures: string[] = [];
  for (const [gate, findings] of Object.entries(inventory.gates)) {
    if (!predicate(gate)) continue;
    if (findings.length === 0) continue;
    const identities = [...new Set(findings.map(gateIdentity))].sort((left, right) =>
      left.localeCompare(right, "en"));
    const shown = identities.slice(0, 20);
    const remainder = identities.length - shown.length;
    failures.push(
      `${gate}: ${findings.length} finding(s), ${identities.length} unique: `
      + shown.join(", ")
      + (remainder > 0 ? `, … and ${remainder} more` : ""),
    );
  }
  return failures;
}

export function verifyAuthorizationInventory(
  root = resolve(fileURLToPath(new URL("../../..", import.meta.url))),
): AuthorizationInventoryVerification {
  const inventory = buildAuthorizationInventory(root);
  const artifactDriftFailures: string[] = [];
  compareGeneratedFile(
    root,
    AUTHORIZATION_INVENTORY_PATH,
    serializeAuthorizationInventory(inventory),
    artifactDriftFailures,
  );
  compareGeneratedFile(
    root,
    AUTHORIZATION_SUMMARY_PATH,
    renderAuthorizationInventoryMarkdown(inventory),
    artifactDriftFailures,
  );
  const knownAnomalyFailures = gateFailures(
    inventory,
    (gate) => KNOWN_ANOMALY_GATES.has(gate),
  );
  const structuralGateFailures = gateFailures(
    inventory,
    (gate) => !KNOWN_ANOMALY_GATES.has(gate),
  );
  const failures = [
    ...artifactDriftFailures,
    ...structuralGateFailures,
    ...knownAnomalyFailures,
  ];
  const structuralPassed =
    artifactDriftFailures.length === 0 && structuralGateFailures.length === 0;
  return {
    inventory,
    artifactDriftFailures,
    structuralGateFailures,
    knownAnomalyFailures,
    structuralPassed,
    strictPassed: structuralPassed && knownAnomalyFailures.length === 0,
    failures,
  };
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath === resolve(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const supportedArgs = new Set([
    "--check",
    "--help",
    "--json",
    "--structural-only",
  ]);
  const unknownArgs = args.filter((arg) => !supportedArgs.has(arg));
  if (unknownArgs.length > 0) {
    process.stderr.write(
      `Unknown argument(s): ${unknownArgs.join(", ")}. Use --help for usage.\n`,
    );
    process.exit(2);
  }
  const json = args.includes("--json");
  const structuralOnly = args.includes("--structural-only");
  if (args.includes("--help")) {
    process.stdout.write(
      "Usage: verify-authorization-inventory.ts [--check] [--json] [--structural-only]\n"
      + "  --check            explicitly select deterministic in-memory recomputation\n"
      + "                     (also the default behavior)\n"
      + "  --json             emit the recomputed machine-readable verification result\n"
      + "  --structural-only  exit on artifact drift or structural gates, while reporting\n"
      + "                     owned known anomalies separately\n",
    );
    process.exit(0);
  }
  const result = verifyAuthorizationInventory();
  const shouldFail = structuralOnly ? !result.structuralPassed : !result.strictPassed;
  if (json) {
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 1,
      mode: structuralOnly ? "structural_only" : "strict",
      registrySha256: result.inventory.contract.registrySha256,
      summary: result.inventory.summary,
      gateCounts: Object.fromEntries(
        Object.entries(result.inventory.gates).map(([gate, findings]) => [
          gate,
          findings.length,
        ]),
      ),
      artifactDriftFailures: result.artifactDriftFailures,
      structuralGateFailures: result.structuralGateFailures,
      knownAnomalyFailures: result.knownAnomalyFailures,
      structuralPassed: result.structuralPassed,
      strictPassed: result.strictPassed,
    }, null, 2)}\n`);
  } else if (shouldFail) {
    process.stderr.write("authorization-inventory verification failed:\n");
    const failures = structuralOnly
      ? [...result.artifactDriftFailures, ...result.structuralGateFailures]
      : result.failures;
    for (const failure of failures) process.stderr.write(`- ${failure}\n`);
  } else {
    process.stdout.write(
      "authorization-inventory verification passed: "
      + `${result.inventory.summary.registeredObjects} registered objects, `
      + `${result.inventory.summary.authorizationFiles} authorization-bearing files, `
      + (structuralOnly
        ? `${result.knownAnomalyFailures.length} owned known anomaly gate(s) reported separately.\n`
        : "no open gates.\n"),
    );
  }
  if (shouldFail) process.exitCode = 1;
}
