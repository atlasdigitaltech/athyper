import { assertCommonReferenceDescriptor, type EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { readCompiledRuntimeContract, type PinnedCompiledEntityReader } from "@athyper/server-platform-metadata";
import type { EntityCapabilityRequest } from "@athyper/server-platform-experience";

type Release = NonNullable<Awaited<ReturnType<PinnedCompiledEntityReader["resolve"]>>>;

/** Tenant-local collaboration on an admitted global read-only parent. The parent
 * and capability must use the same signed release. No entity-name/table fallback
 * and no browser-supplied scope. Tenant-owned aggregates retain their registered
 * persisted-scope providers instead of falling through to this admission. */
export function createPublishedParentAdmission(options: {
  reader: PinnedCompiledEntityReader;
  read(input: Pick<EntityCapabilityRequest, "context" | "entityCode" | "recordId">, descriptor: EntityRuntimeDescriptor): Promise<boolean>;
}) {
  return async (input: Pick<EntityCapabilityRequest, "context" | "entityCode" | "recordId">, admitted?: Release) => {
    const { context, entityCode } = input;
    if (!context.tenantId || !context.principalId || !input.recordId) return false;
    const release = admitted ?? await options.reader.resolve({ tenantId: context.tenantId, principalId: context.principalId,
      planeKey: context.planeKey, entityCode });
    if (!release || release.coordinate.tenantId !== context.tenantId || release.coordinate.principalId !== context.principalId
      || release.coordinate.planeKey !== context.planeKey || release.coordinate.entityCode !== entityCode) return false;
    const descriptor = await readCompiledRuntimeContract(options.reader, release);
    if (descriptor.entityCode !== entityCode || !descriptor.operations.read || !descriptor.operations.list) return false;
    try { assertCommonReferenceDescriptor(descriptor, context.planeKey); } catch { return false; }
    if (!await options.read(input, descriptor)) return false;
    // The physical parent is global; collaboration ownership is the authenticated
    // tenant, not a tenant value copied from the global row or request payload.
    return Object.freeze({ scopeResources: Object.freeze([Object.freeze({ tenantId: context.tenantId })]) });
  };
}
