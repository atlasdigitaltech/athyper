#!/usr/bin/env tsx
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { prepareActivityEnrollment } from "@athyper/server-contract-publication";
import { createCapabilityProfileFileResolver } from "@athyper/server-plane-studio-meta-entity-authoring";
import { prepareReferenceRuntime } from "./prepare-reference-runtime.js";
import type { AuthoringPlane } from "@athyper/server-contract-meta-entity-authoring";

/** Offline reference-product adapter. No database writes, grants, signatures or activation. */
export function prepareEntityActivity(
  directory: string,
  plane: AuthoringPlane,
) {
  const record = prepareReferenceRuntime(directory, plane);
  const source = JSON.parse(
    readFileSync(join(resolve(directory), "activity.json"), "utf8"),
  );
  const lookup = createCapabilityProfileFileResolver(
    fileURLToPath(
      new URL("../../../../metadata/profiles/activity/", import.meta.url),
    ),
  );
  // Shared reference products have read-only published operations. Do not infer
  // committed version history from snapshots or an updated_at timestamp.
  const enrollment = prepareActivityEnrollment(source, lookup, {
    versionHistoryAvailable: false,
    automaticCaptureAvailable: false,
    writableOperations: [],
  });
  return {
    status: "unpublished_activity_candidate" as const,
    plane,
    entityCode: record.product.definition.entityCode,
    recordContractHash: record.artifact.contractHash,
    ...enrollment,
    requiredParentPermission: "common.platform.reference.view",
    history: {
      committedVersionsAvailable: false,
      sourceRecordVersionAvailable: false,
      snapshotScope: "tenant" as const,
    },
    authoringMember: record.graph.capabilities?.find(member => member.capabilityKey === "activity"),
    activationReady: false,
    remainingGates: [
      "permission_catalog_qualification",
      "deployed_activity_provider_qualification",
      "signed_release_and_acceptance",
    ],
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const plane = process.argv
    .find((argument) => argument.startsWith("--plane="))
    ?.slice(8);
  const directory = process.argv
    .find((argument) => argument.startsWith("--product="))
    ?.slice(10);
  if (!directory || !["studio", "neon", "mesh"].includes(plane ?? ""))
    throw Error(
      "Specify --product=<metadata directory> --plane=studio|neon|mesh",
    );
  console.log(
    JSON.stringify(
      prepareEntityActivity(directory, plane as AuthoringPlane),
      null,
      2,
    ),
  );
}
