import { describe, it, expect } from "vitest";
import { projectBusinessPartnerProvider } from "../../server/packages/services/master-data/src/business-partner-provider-projection.js";
import { createPermissionAuthorizer } from "../../server/packages/platform/iam/src/permission-authorizer.js";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";

for (const section of ["comments", "attachments"] as const)
  describe("native independent " + section + " authority", () => {
    const permission =
      section === "comments"
        ? "collaboration.comment.read"
        : "document.attachment.read";
    const context = {
      tenantId: "tenant",
      principalId: "reviewer",
      planeKey: "neon",
      permissions: {
        tenantId: "tenant",
        principalId: "reviewer",
        planeKey: "neon",
        allowed: [permission],
        denied: [],
        planLocked: [],
        planeExcluded: [],
        operationBindings: [],
        authorizationScopes: [],
        evidence: [
          {
            permissionCode: permission,
            effect: "allow",
            proof: "group_role",
            scopeTargetId: "scope",
            scopeKind: "resource",
            targetId: "allowed-child",
            propagationMode: "exact",
          },
        ],
      },
    } as unknown as VerifiedRequestContext;
    const data = {
      items: [
        {
          id: "allowed-child",
          body: "Visible test comment",
          fileName: "visible.txt",
        },
        {
          id: "denied-child",
          body: "Denied test comment",
          fileName: "denied.txt",
        },
      ],
    };
    const project = (ctx: VerifiedRequestContext) =>
      projectBusinessPartnerProvider({
        query: { context: ctx, businessPartnerId: "partner" },
        section,
        data,
        authorizer: {
          authorize: (r) =>
            r.resource?.resourceCode
              ? createPermissionAuthorizer().authorize(r)
              : Promise.resolve({ allowed: true }),
        },
      });
    it("admits an exactly granted child and filters an ungranted sibling", async () => {
      const r = await project(context);
      expect(r).toMatchObject({ items: [{ id: "allowed-child" }] });
      expect(JSON.stringify(r)).not.toContain("denied-child");
    });
    it("does not inherit child access from parent field visibility", async () => {
      const r = await project({
        ...context,
        permissions: { ...context.permissions, allowed: [] },
      });
      expect(r).toMatchObject({ items: [] });
    });
  });
