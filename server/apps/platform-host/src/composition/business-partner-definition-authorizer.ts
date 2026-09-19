import { createPermissionAuthorizer } from "@athyper/server-platform-iam";

export function createBusinessPartnerDefinitionAuthorizer(definitions: { get(tenantId: string, revisionId: string): Promise<{ createdBy: string } | null> }) {
return createPermissionAuthorizer({
          policyGate: {
            async evaluate({ context, permissionCode, resource }) {
              if (permissionCode === "studio.business_partner_definition.read" ||
                  permissionCode === "studio.business_partner_definition.author")
                return { allowed: true };
              if (permissionCode !== "studio.business_partner_definition.publish" ||
                  typeof resource?.["revisionId"] !== "string")
                return { allowed: false, reason: "definition_revision_required" };
              const revision = await definitions.get(context.tenantId, resource["revisionId"]);
              if (!revision) return { allowed: false, reason: "definition_revision_unavailable" };
              const separated = revision.createdBy !== context.principalId;
              return { allowed: separated, sodSatisfied: separated, reason: "maker_checker_separation_failed" };
            },
          },
        });
}
