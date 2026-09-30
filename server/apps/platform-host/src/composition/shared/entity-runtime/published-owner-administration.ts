import type { MetadataReader } from "@athyper/server-contract-metadata";
import { readEvidence } from "@athyper/server-foundation/context";
import { createPermissionAuthorizer } from "@athyper/server-platform-iam";
import { ownerRecordProfileSupported } from "@athyper/server-service-records";

/** High-risk owner administration is restricted to the current published owner
 * contract and its installed transactional record operations. Ordinary operation
 * admission, locked parent scope and RLS remain independent mandatory checks. */
export function createPublishedOwnerAdministrationAuthorizer(
  metadata: MetadataReader,
) {
  return createPermissionAuthorizer({
    policyGate: {
      async evaluate({ context, permissionCode, resource, requirement }) {
        const entityCode = resource?.ownerEntityCode;
        const operation = resource?.ownerOperationKey;
        const denied = {
          allowed: false,
          reason: "entity_owner_policy_unavailable",
        };
        if (
          !context.tenantId ||
          !context.principalId ||
          resource?.tenantId !== context.tenantId ||
          typeof entityCode !== "string" ||
          typeof operation !== "string" ||
          !["list", "read", "create", "patch"].includes(operation) ||
          requirement?.requiresSod
        )
          return denied;
        const descriptor = await readEvidence(
          metadata,
          context,
          entityCode,
          () => metadata.getEntityDescriptor(context, entityCode),
        );
        if (
          !descriptor ||
          !ownerRecordProfileSupported(descriptor) ||
          descriptor.entityCode !== entityCode ||
          descriptor.planeKey !== context.planeKey ||
          descriptor.compiledHash !== resource?.authorizationDescriptorHash ||
          descriptor.ownerAccess?.administerPermission !== permissionCode ||
          !descriptor.authorization?.operations.some(
            (item) => item.key === operation,
          )
        )
          return denied;
        return { allowed: true };
      },
    },
  });
}
