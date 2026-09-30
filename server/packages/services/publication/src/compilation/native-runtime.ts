import { compileNativeRuntimeProjection, type NativeProjectionRegistration } from "@athyper/server-platform-metadata";
import { capabilityArtifactMembers, type EntityCapabilityAuthoringMember } from "@athyper/server-contract-publication";
import type { CompiledRuntimePublication, CompiledRuntimeSource } from "./compiled-runtime.js";
import { compileOperationProjection, type OperationPermission } from "../shared/authorization/operation-projection.js";

/** Lower an immutable native snapshot using an independently qualified storage
 * registration and live permission catalog. Never derives executable handlers,
 * storage authority or approval from an entity name. */
export function lowerNativeRuntimePublication(source: CompiledRuntimeSource, input: {
  registration: NativeProjectionRegistration;
  permissions: readonly OperationPermission[];
}): Awaited<ReturnType<CompiledRuntimePublication["lower"]>> {
  if (input.registration.entityCode !== source.entityCode || input.registration.plane !== source.plane)
    throw Error("PUBLICATION_LOWERING_TARGET_MISMATCH");
  // Do not silently discard branches this single-storage lowering cannot map.
  for (const key of ["relations", "flows", "flowSteps", "materializationBindings", "materializationFieldMappings", "changeCaseBindings"])
    if (Array.isArray(source.contract[key]) && source.contract[key].length)
      throw Error(`PUBLICATION_LOWERING_BRANCH_UNSUPPORTED:${key}`);
  const descriptor = compileNativeRuntimeProjection({ native: source.native, ...input });
  if (!Reflect.get(descriptor, "authorizationRuntime")) throw Error("PUBLICATION_LOWERING_RUNTIME_BINDINGS_REQUIRED");
  const members = source.contract.capabilities;
  if (members !== undefined && !Array.isArray(members)) throw Error("PUBLICATION_LOWERING_CAPABILITIES_INVALID");
  const mapped = capabilityArtifactMembers(source.entityCode, (members ?? []) as readonly EntityCapabilityAuthoringMember[]);
  if (mapped.notificationPolicies && Object.keys(mapped.notificationPolicies).length)
    throw Error("PUBLICATION_LOWERING_NOTIFICATION_DEPENDENCIES_REQUIRED");
  const base = (artifactType: string) => ({ schema: "athyper.compiled-entity-artifact/2.0-draft", schemaVersion: 2,
    contractStatus: "published", artifactType, artifactKey: `${source.entityCode}/${artifactType}`, entityCode: source.entityCode, plane: source.plane, dependencies: [] });
  const storage = input.registration.storage;
  const object = `${storage.schema}.${storage.object}`;
  return {
    artifacts: [
      ...((members ?? []) as readonly EntityCapabilityAuthoringMember[]).filter(member => member.profile).map(member => ({
        ref: `${source.entityCode}/capability-profile.${member.capabilityKey}.${member.profile!.version}.json`,
        content: { ...base("capability_profile"),
          artifactKey: `${source.entityCode}/capability-profile.${member.capabilityKey}.${member.profile!.version}`,
          profile: member.profileDefinition },
      })),
      { ref: `${source.entityCode}/core.json`, content: { ...base("core"),
        storage: { primaryObject: object, sourceObjects: [object], idField: storage.idField,
          ...(storage.tenantField ? { tenantField: storage.tenantField } : {}) },
        fields: descriptor.fields.map(field => ({ key: field.key, dataType: field.type, binding: { sourceObject: object, column: field.storagePath } })),
        ...(members ? { capabilities: mapped.capabilities } : {}),
      } },
      { ref: `${source.entityCode}/operation.json`, content: { ...base("operation"), operations: descriptor.authorization.operations, ...mapped.operationBindings } },
    ],
    runtimeContracts: { [source.entityCode]: { ...descriptor, ...compileOperationProjection({
      native: source.native, descriptor, plane: source.plane, sourceEntityId: source.sourceEntityId, sourceReleaseHash: source.sourceReleaseHash, permissions: input.permissions,
    }) } },
    release: { content: { schema: "athyper.compiled-entity-release/2.0-draft", contractStatus: "published", releaseId: source.releaseId,
      releaseNo: source.releaseNo, targetPlanes: [source.plane], externalDependencies: [] } },
  };
}
