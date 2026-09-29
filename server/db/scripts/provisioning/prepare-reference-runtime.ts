#!/usr/bin/env tsx
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { parseSharedReferenceProduct, compileSharedReferenceProduct, COMMON_REFERENCE_VIEW_PERMISSION, createCapabilityProfileFileResolver } from "@athyper/server-plane-studio-meta-entity-authoring";
import { capabilityAuthoringMode, capabilityArtifactMembers, prepareActivityCapabilityMember } from "@athyper/server-contract-publication";
import { compileNativeRuntimeProjection } from "@athyper/server-platform-metadata";
import type { AuthoringPlane } from "@athyper/server-contract-meta-entity-authoring";

export function loadReferenceProduct(directory: string) {
  const root = resolve(directory);
  const capabilityPath = join(root, "capabilities.json");
  const members = existsSync(capabilityPath) ? JSON.parse(readFileSync(capabilityPath, "utf8")) : [];
  const definition = JSON.parse(readFileSync(join(root, "definition.json"), "utf8"));
  if (!Array.isArray(members)) throw Error("CAPABILITY_SOURCE_INVALID");
  if (Array.isArray(members)) {
    const lookups = new Map<string, ReturnType<typeof createCapabilityProfileFileResolver>>();
    for (const member of members) {
      if (capabilityAuthoringMode(member, "capabilities") !== "profile") continue;
      if (Object.hasOwn(member, "profileDefinition")) throw Error("CAPABILITY_PROFILE_SNAPSHOT_SOURCE_FORBIDDEN");
      const directory = member.capabilityKey === "activity" ? "activity" : "collaboration";
      let lookup = lookups.get(directory);
      if (!lookup) {
        lookup = createCapabilityProfileFileResolver(fileURLToPath(new URL(`../../../../metadata/profiles/${directory}/`, import.meta.url)));
        lookups.set(directory, lookup);
      }
      member.profileDefinition = lookup(member.profile?.code, member.profile?.version);
    }
  }
  const activityPath = join(root, "activity.json");
  if (existsSync(activityPath)) {
    if (members.some(member => member.capabilityKey === "activity")) throw Error("CAPABILITY_POLICY_DUPLICATE_SOURCE");
    const lookup = createCapabilityProfileFileResolver(fileURLToPath(new URL("../../../../metadata/profiles/activity/", import.meta.url)));
    members.push(prepareActivityCapabilityMember(definition.definition?.entityCode, JSON.parse(readFileSync(activityPath, "utf8")), lookup,
      { versionHistoryAvailable: false, automaticCaptureAvailable: false, writableOperations: [] }));
  }
  return parseSharedReferenceProduct(definition,
    members);
}

/** Offline only. Never fabricates approval, signature or activation evidence. */
export function prepareReferenceRuntime(directory: string, plane: AuthoringPlane) {
  const product = loadReferenceProduct(directory);
  const { definition } = product;
  const { graph, artifact } = compileSharedReferenceProduct(product, plane);
  const requiredPermissions = [{ code: COMMON_REFERENCE_VIEW_PERMISSION, scopeKinds: ["tenant"] }];
  const descriptor = compileNativeRuntimeProjection({ native: artifact.descriptor, registration: {
    entityCode: definition.entityCode, plane,
    storage: { schema: "shared", object: definition.storageObject, idField: "id", statusField: "status" },
    columns: definition.fields.map(field => field.key),
    detailRouteTemplate: `/app/entity/${definition.entityCode}/:recordId`,
  }, permissions: requiredPermissions });
  return { status: "unsigned_candidate" as const, product, plane, graph, artifact, descriptor, requiredPermissions,
    requiredCapabilityPermissions: [...new Set(Object.values(capabilityArtifactMembers(definition.entityCode, graph.capabilities ?? []).operationBindings).flatMap(binding => binding.actions.map(action => action.permissionCode)))].sort(),
    capabilityPublication: "requires_signed_split_artifacts" as const };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const plane = process.argv.find(a => a.startsWith("--plane="))?.slice(8);
  const directory = process.argv.find(a => a.startsWith("--product="))?.slice(10);
  if (!directory || (plane !== "studio" && plane !== "neon" && plane !== "mesh")) throw Error("Specify --product=<metadata directory> --plane=studio|neon|mesh");
  const candidate = prepareReferenceRuntime(directory, plane);
  console.log(JSON.stringify(process.argv.includes("--json") ? candidate : {
    status: candidate.status, plane, entityCode: candidate.product.definition.entityCode,
    contractHash: candidate.artifact.contractHash, descriptorHash: candidate.artifact.descriptorHash,
    fields: candidate.descriptor.fields.length, requiredPermissions: candidate.requiredPermissions,
    requiredCapabilityPermissions: candidate.requiredCapabilityPermissions, capabilityPublication: candidate.capabilityPublication,
  }, null, 2));
}
