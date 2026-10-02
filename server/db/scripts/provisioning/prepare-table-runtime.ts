#!/usr/bin/env tsx
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  parseTableEntityProduct,
  compileTableEntityProduct,
} from "@athyper/server-plane-studio-meta-entity-authoring";
import { compileNativeRuntimeProjection } from "@athyper/server-platform-metadata";
import type { AuthoringPlane } from "@athyper/server-contract-meta-entity-authoring";

/** Offline candidate only. Permission declarations validate projection shape;
 * they do not attest that the catalog, grants, storage or handlers are installed. */
export function prepareTableRuntime(directory: string, plane: AuthoringPlane) {
  const product = parseTableEntityProduct(
    JSON.parse(
      readFileSync(join(resolve(directory), "definition.json"), "utf8"),
    ),
  );
  const { graph, artifact } = compileTableEntityProduct(product, plane);
  const profile = graph.runtimeProfiles![0]!;
  const permissions = [
    ...new Set(
      (graph.operationPermissions ?? []).map(
        (binding) => binding.permissionCode,
      ),
    ),
  ].map((code) => ({ code, scopeKinds: ["tenant"] }));
  const descriptor = compileNativeRuntimeProjection({
    native: artifact.descriptor,
    registration: {
      entityCode: graph.entity.entityCode,
      plane,
      storage: {
        schema: profile.storageSchema!,
        object: profile.storageObject!,
        idField: "id",
        tenantField: profile.tenantFieldKey!,
        ...(profile.recordVersionFieldKey
          ? { versionField: profile.recordVersionFieldKey }
          : {}),
        ...(graph.fields.some((field) => field.fieldKey === "status")
          ? { statusField: "status" }
          : {}),
      },
      columns: graph.fields.map((field) => field.storagePath ?? field.fieldKey),
      detailRouteTemplate: `/app/entity/${graph.entity.entityCode}/:recordId`,
    },
    permissions,
  });
  return {
    status: "unsigned_candidate" as const,
    product,
    graph,
    artifact,
    descriptor,
    permissions,
    publication: "not_requested" as const,
    catalogAndStorageQualified: false as const,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const directory = process.argv
    .find((arg) => arg.startsWith("--product="))
    ?.slice(10);
  const plane = process.argv
    .find((arg) => arg.startsWith("--plane="))
    ?.slice(8);
  if (!directory || !["studio", "neon", "mesh"].includes(plane ?? ""))
    throw Error("Specify --product=<directory> --plane=studio|neon|mesh");
  const candidate = prepareTableRuntime(directory, plane as AuthoringPlane);
  console.log(
    JSON.stringify(
      {
        status: candidate.status,
        entityCode: candidate.graph.entity.entityCode,
        plane,
        contractHash: candidate.artifact.contractHash,
        descriptorHash: candidate.artifact.descriptorHash,
        fields: candidate.descriptor.fields.length,
        requiredPermissions: candidate.permissions,
        catalogAndStorageQualified: candidate.catalogAndStorageQualified,
        publication: candidate.publication,
      },
      null,
      2,
    ),
  );
}
