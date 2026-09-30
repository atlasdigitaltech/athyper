import { compileEntityIntakeSurfaces } from "@athyper/contract-platform-entity-runtime";
import {
  entityScopeResolvers,
  parseEntityAuthorizationRuntime,
  parseEntityAuthorizationProfile,
} from "@athyper/server-contract-metadata";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";

export function compileEntityAuthorization(graph: MetaEntityGraph) {
  const surfaces = (graph.surfaces ?? []).filter(
    (surface) =>
      surface.status !== "deprecated" &&
      surface.layoutConfig?.["authorization"] !== undefined,
  );
  if (surfaces.length > 1)
    throw new TypeError(
      "Only one authorization profile may be published per entity",
    );
  if (!surfaces.length) return undefined;
  const profile = parseEntityAuthorizationProfile(
    surfaces[0]!.layoutConfig!["authorization"],
  );
  const operations = Object.fromEntries(
    graph.operations
      .filter((item) => item.status !== "deprecated")
      .map((item) => {
        const bindings = (graph.operationPermissions ?? []).filter(
          (binding) =>
            binding.entityOperationId === item.id &&
            binding.targetPlane === profile.planeKey &&
            binding.status !== "deprecated",
        );
        if (bindings.length !== 1)
          throw new TypeError(
            "Authorization requires one exact-plane operation permission binding",
          );
        const policy = profile.operations.find(
          (operation) => operation.key === item.operationKey,
        );
        if (!policy) throw new TypeError("Missing authorization operation");
        const required = entityScopeResolvers[policy.scope].map(
          (key) =>
            ({
              operatingOrganizationId: "operating_organization",
              companyCodeId: "company_code",
              workspaceId: "workspace",
              networkRelationshipId: "network_relationship",
            })[key],
        );
        const scopeBindings = (graph.operationScopeBindings ?? []).filter(
          (binding) =>
            binding.entityOperationId === item.id &&
            binding.targetPlane === profile.planeKey &&
            binding.status !== "deprecated",
        );
        if (
          required.some(
            (kind) =>
              !scopeBindings.some((binding) => binding.scopeKind === kind),
          ) ||
          scopeBindings.some(
            (binding) =>
              binding.scopeKind !== "tenant" &&
              !required.includes(binding.scopeKind),
          )
        )
          throw new TypeError("Authorization scope bindings mismatch");
        return [
          item.operationKey,
          { permissionCode: bindings[0]!.permissionCode },
        ];
      }),
  );
  // Only validated presentation-only inputs are outside record field-policy coverage.
  // Stored/projected/computed fields and unbound runtime fields still require coverage.
  const intakeInputs = new Set(compileEntityIntakeSurfaces(graph as unknown as Record<string, unknown>).flatMap(s => s.sections.flatMap(section => section.fields.map(f => f.key))));
  return parseEntityAuthorizationProfile(profile, {
    entityCode: graph.entity.entityCode,
    fields: graph.fields
      .filter((item) => item.status !== "deprecated" && !(item.valueOrigin === "runtime" && intakeInputs.has(item.fieldKey)))
      .map((item) => item.fieldKey),
    operations,
  });
}

/** Optional for existing releases; when authored, full exact operation coverage is mandatory. */
export function compileEntityAuthorizationRuntime(graph: MetaEntityGraph) {
  const surfaces = (graph.surfaces ?? []).filter(surface => surface.status !== "deprecated" && surface.layoutConfig?.["authorizationRuntime"] !== undefined);
  if (!surfaces.length) return undefined;
  if (surfaces.length !== 1) throw new TypeError("Only one authorization runtime binding set is allowed");
  const profile = compileEntityAuthorization(graph);
  if (!profile) throw new TypeError("Authorization runtime requires profile");
  return parseEntityAuthorizationRuntime(surfaces[0]!.layoutConfig!["authorizationRuntime"], profile);
}
