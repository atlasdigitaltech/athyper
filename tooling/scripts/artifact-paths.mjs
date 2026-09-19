import { homedir } from "node:os";
import { resolve } from "node:path";

const defaultRunId =
  new Date().toISOString().replaceAll(":", "-") + `-${process.pid}`;

function segment(value, label) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return value;
}

export function runtimeRoot() {
  return resolve(
    process.env.ATHYPER_RUNTIME_ROOT || resolve(homedir(), ".athyper"),
  );
}

// DEV browser scripts must pass "dev" explicitly; CI can override the output root.
export function artifactDirectory(
  feature,
  instance = process.env.ATHYPER_INSTANCE || "dev",
) {
  const root =
    process.env.ATHYPER_ARTIFACT_ROOT ||
    resolve(
      runtimeRoot(),
      "instances",
      segment(instance, "instance"),
      "artifacts",
    );
  return resolve(
    root,
    segment(feature, "feature"),
    segment(process.env.ATHYPER_ARTIFACT_RUN_ID || defaultRunId, "run ID"),
  );
}

// Retained, immutable input from the repository-root migration. Override explicitly
// when preparing a candidate from a newer readback.
export function collectionReadbackPath() {
  return resolve(
    process.env.ATHYPER_COLLECTION_READBACK ||
      resolve(
        runtimeRoot(),
        "instances/dev/artifacts/collection-presentations/imported/region-readback.json",
      ),
  );
}
