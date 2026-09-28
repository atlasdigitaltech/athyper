import { createPermissionAuthorizer } from "@athyper/server-platform-iam";

export type RevisionPermissions = Readonly<Record<"read" | "author" | "publish", string>>;
export function createRevisionAuthorizer(options: {
  readonly permissions?: RevisionPermissions;
  readonly get: (tenantId: string, revisionId: string, principalId: string) => Promise<{ createdBy: string } | null>;
}) {
  const permissions = options.permissions ? Object.freeze({ ...options.permissions }) : undefined;
  if (permissions && (Object.values(permissions).some(code => !/^[a-z][a-z0-9_.-]+$/.test(code)) ||
      new Set(Object.values(permissions)).size !== 3)) throw Error("REVISION_PERMISSION_BINDING_INVALID");
  return createPermissionAuthorizer({
    policyGate: {
      async evaluate({ context, permissionCode, resource }) {
        if (!permissions) return { allowed: false, reason: "revision_permission_binding_unavailable" };
        if (permissionCode === permissions.read || permissionCode === permissions.author) return { allowed: true };
        if (permissionCode !== permissions.publish || typeof resource?.revisionId !== "string")
          return { allowed: false, reason: "definition_revision_required" };
        const revision = await options.get(context.tenantId, resource.revisionId, context.principalId);
        if (!revision) return { allowed: false, reason: "definition_revision_unavailable" };
        const separated = revision.createdBy !== context.principalId;
        return { allowed: separated, sodSatisfied: separated, reason: "maker_checker_separation_failed" };
      },
    },
  });
}
