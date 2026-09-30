import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildAuthorizationInventory,
  type ArtifactClass,
  type ReferenceAccess,
} from "./authorization-inventory.js";

const BASELINE_PATH =
  "governance/config/governance/authorization-legacy-freeze-baseline.v1.json";
const REGISTRY_PATH =
  "governance/config/governance/authorization-source-registry.v1.json";

const PROTECTED_PATH_PREFIXES = [
  "apps/",
  "packages/",
  "server/packages/",
  "server/src/",
  "server/db/seed/",
  "deploy/config/iam/",
  "tooling/tools/",
] as const;

const PROTECTED_ARTIFACT_CLASSES = new Set<ArtifactClass>([
  "contract",
  "route",
  "runtime",
  "seed",
  "ui",
]);

const PROTECTED_ACCESS = new Set<ReferenceAccess>([
  "delete",
  "insert",
  "read",
  "reference",
  "truncate",
  "update",
]);

type Registry = {
  captureSourceObjectIds: Record<string, string[]>;
};

type FreezeEntry = {
  objectId: string;
  qualifiedName: string;
  path: string;
  artifactClass: ArtifactClass;
  access: ReferenceAccess;
  occurrenceCount: number;
};

type FreezeBaseline = {
  schemaVersion: 1;
  contractId: "authorization-wave1-legacy-feature-freeze";
  policy: "no_new_feature_reads_or_writes";
  status: "active";
  sourceRegistrySha256: string;
  captureSourceObjectIdsSha256: string;
  captureSourceCounts: Record<string, number>;
  protectedPathPrefixes: string[];
  protectedArtifactClasses: ArtifactClass[];
  protectedAccess: ReferenceAccess[];
  entries: FreezeEntry[];
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function key(entry: Omit<FreezeEntry, "occurrenceCount">): string {
  return [
    entry.objectId,
    entry.qualifiedName,
    entry.path,
    entry.artifactClass,
    entry.access,
  ].join("\u0000");
}

function isProtectedPath(path: string): boolean {
  return PROTECTED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function collectEntries(
  root: string,
  captureSourceIds: Set<string>,
): FreezeEntry[] {
  const inventory = buildAuthorizationInventory(root);
  return inventory.references
    .filter((reference) => captureSourceIds.has(reference.objectId))
    .filter((reference) => isProtectedPath(reference.path))
    .filter((reference) =>
      PROTECTED_ARTIFACT_CLASSES.has(reference.artifactClass))
    .filter((reference) => PROTECTED_ACCESS.has(reference.access))
    .map((reference) => ({
      objectId: reference.objectId,
      qualifiedName: reference.qualifiedName,
      path: reference.path,
      artifactClass: reference.artifactClass,
      access: reference.access,
      occurrenceCount: reference.lines.length,
    }))
    .sort((left, right) => key(left).localeCompare(key(right), "en"));
}

function loadRegistry(root: string): {
  raw: string;
  registry: Registry;
  captureSourceIds: Set<string>;
  captureSourceCounts: Record<string, number>;
  captureSourceObjectIdsSha256: string;
} {
  const raw = readFileSync(resolve(root, REGISTRY_PATH), "utf8");
  const registry = JSON.parse(raw) as Registry;
  const sourceSets = Object.fromEntries(
    Object.entries(registry.captureSourceObjectIds)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([plane, ids]) => [
        plane,
        [...ids].sort((left, right) => left.localeCompare(right, "en")),
      ]),
  );
  return {
    raw,
    registry,
    captureSourceIds: new Set(Object.values(sourceSets).flat()),
    captureSourceCounts: Object.fromEntries(
      Object.entries(sourceSets).map(([plane, ids]) => [plane, ids.length]),
    ),
    captureSourceObjectIdsSha256: sha256(JSON.stringify(sourceSets)),
  };
}

function capture(root: string): FreezeBaseline {
  const registry = loadRegistry(root);
  const baseline: FreezeBaseline = {
    schemaVersion: 1,
    contractId: "authorization-wave1-legacy-feature-freeze",
    policy: "no_new_feature_reads_or_writes",
    status: "active",
    sourceRegistrySha256: sha256(registry.raw.replaceAll("\r\n", "\n")),
    captureSourceObjectIdsSha256: registry.captureSourceObjectIdsSha256,
    captureSourceCounts: registry.captureSourceCounts,
    protectedPathPrefixes: [...PROTECTED_PATH_PREFIXES],
    protectedArtifactClasses: [...PROTECTED_ARTIFACT_CLASSES].sort(),
    protectedAccess: [...PROTECTED_ACCESS].sort(),
    entries: collectEntries(root, registry.captureSourceIds),
  };
  writeFileSync(resolve(root, BASELINE_PATH), stableJson(baseline), "utf8");
  return baseline;
}

function verify(root: string): string[] {
  const registry = loadRegistry(root);
  const baseline = JSON.parse(
    readFileSync(resolve(root, BASELINE_PATH), "utf8"),
  ) as FreezeBaseline;
  const failures: string[] = [];

  if (baseline.schemaVersion !== 1
      || baseline.contractId !== "authorization-wave1-legacy-feature-freeze"
      || baseline.policy !== "no_new_feature_reads_or_writes"
      || baseline.status !== "active") {
    failures.push("legacy freeze baseline contract header is invalid");
  }
  if (baseline.captureSourceObjectIdsSha256
      !== registry.captureSourceObjectIdsSha256) {
    failures.push(
      "capture-source object set changed after the legacy freeze baseline",
    );
  }

  const expected = new Map(
    baseline.entries.map((entry) => [key(entry), entry]),
  );
  for (const current of collectEntries(root, registry.captureSourceIds)) {
    const frozen = expected.get(key(current));
    if (!frozen) {
      failures.push(
        `new legacy authority reference: ${current.access} `
        + `${current.qualifiedName} in ${current.path}`,
      );
      continue;
    }
    if (current.occurrenceCount > frozen.occurrenceCount) {
      failures.push(
        `legacy authority reference count increased: ${current.access} `
        + `${current.qualifiedName} in ${current.path} `
        + `(${frozen.occurrenceCount} -> ${current.occurrenceCount})`,
      );
    }
  }
  return failures;
}

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const args = process.argv.slice(2);
if (args.length !== 1 || !["--capture", "--check"].includes(args[0] ?? "")) {
  process.stderr.write(
    "Usage: tsx tooling/scripts/policy/authorization-legacy-freeze.ts "
    + "(--capture|--check)\n",
  );
  process.exit(2);
}

if (args[0] === "--capture") {
  const baseline = capture(root);
  process.stdout.write(
    `authorization legacy freeze: captured ${baseline.entries.length} `
    + `protected reference keys (${Object.entries(baseline.captureSourceCounts)
      .map(([plane, count]) => `${plane}=${count}`)
      .join(", ")}).\n`,
  );
} else {
  const failures = verify(root);
  if (failures.length > 0) {
    process.stderr.write("authorization legacy freeze verification failed:\n");
    for (const failure of failures) process.stderr.write(`- ${failure}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(
      "authorization legacy freeze verification passed: no new protected "
      + "legacy feature read/write references.\n",
    );
  }
}
