import { createPermissionAuthorizer } from "@athyper/server-platform-iam";
export function createBankDirectoryAuthorizer(service: {
  get(
    tenantId: string,
    revisionId: string,
  ): Promise<{ createdBy: string } | null>;
}) {
  return createPermissionAuthorizer({
    policyGate: {
      async evaluate({ context, permissionCode, resource }) {
        if (context.planeKey !== "studio")
          return { allowed: false, reason: "studio_authority_required" };
        if (
          permissionCode === "studio.bank_directory.read" ||
          permissionCode === "studio.bank_directory.author"
        )
          return { allowed: true };
        if (
          permissionCode !== "studio.bank_directory.publish" ||
          typeof resource?.["revisionId"] !== "string"
        )
          return { allowed: false, reason: "directory_revision_required" };
        if (context.assurance !== "elevated")
          return { allowed: false, reason: "mfa_required" };
        const revision = await service.get(
          context.tenantId,
          resource["revisionId"],
        );
        const separated =
          !!revision && revision.createdBy !== context.principalId;
        return {
          allowed: separated,
          sodSatisfied: separated,
          reason: "independent_directory_reviewer_required",
        };
      },
    },
  });
}
