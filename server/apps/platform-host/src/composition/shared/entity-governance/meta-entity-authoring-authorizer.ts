import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import { createPermissionAuthorizer } from "@athyper/server-platform-iam";
export interface AuthoringReviewEvidence {
  tenantId: string;
  changeSetId?: string;
  status: string;
  createdBy: string;
  submittedBy: string | null;
  approvedBy: string | null;
}
// Internal workflow verbs are not IAM catalog codes. Resolve only this closed
// mapping; never synthesize grants or accept caller-selected permission names.
const permissions: Readonly<Record<string, string>> = Object.freeze({
  "metadata.entity.author": "studio.metadata.contract.edit",
  "metadata.entity.validate": "studio.metadata.contract.edit",
  "metadata.entity.test": "studio.metadata.contract.edit",
  "metadata.entity.submit": "studio.metadata.contract.submit",
  "metadata.entity.review": "studio.metadata.contract.review",
  "metadata.entity.publish": "studio.metadata.contract.publish",
  "metadata.entity.activate": "studio.metadata.contract.publish",
  "metadata.entity.rollback": "studio.metadata.contract.rollback",
});
export function createMetaEntityAuthoringAuthorizer(
  fallback: Authorizer,
  load: (
    context: VerifiedRequestContext,
    id: string,
    kind: "change_set" | "release",
  ) => Promise<AuthoringReviewEvidence | null>,
): Authorizer {
  return {
    async authorize(input) {
      const canonical = permissions[input.permissionCode];
      if (!canonical) return fallback.authorize(input);
      const permissionCode = input.permissionCode;
      return createPermissionAuthorizer({
        policyGate: {
          async evaluate({ context, resource }) {
            if (context.planeKey !== "studio")
              return { allowed: false, reason: "authoring_policy_unavailable" };
            // Editing/validation/submission do not approve a release. The service owns
            // revision/state checks. Canonical grant, scope, deny, MFA and SoD checks
            // still run in IAM; do not claim SoD satisfaction for these operations.
            if (
              [
                "metadata.entity.author",
                "metadata.entity.validate",
                "metadata.entity.test",
                "metadata.entity.submit",
              ].includes(permissionCode)
            )
              return { allowed: true };
            const kind =
                permissionCode === "metadata.entity.activate" ||
                typeof resource?.["releaseId"] === "string"
                  ? "release"
                  : "change_set",
              id = resource?.[kind === "release" ? "releaseId" : "changeSetId"];
            if (typeof id !== "string" || !/^[-0-9a-f]{36}$/.test(id))
              return {
                allowed: false,
                reason: "authoring_coordinate_required",
              };
            const row = await load(context, id, kind);
            if (
              !row ||
              row.tenantId !== context.tenantId ||
              (kind === "release" &&
                resource?.["changeSetId"] !== undefined &&
                resource["changeSetId"] !== row.changeSetId)
            )
              return {
                allowed: false,
                reason: "authoring_evidence_unavailable",
              };
            const separated =
              permissionCode === "metadata.entity.review"
                ? row.status === "in_review" &&
                  context.principalId !== row.createdBy &&
                  context.principalId !== row.submittedBy
                : row.status ===
                    (kind === "change_set" ? "approved" : "published") &&
                  row.approvedBy !== null &&
                  row.submittedBy !== null &&
                  row.approvedBy !== row.createdBy &&
                  row.approvedBy !== row.submittedBy;
            return {
              allowed: separated,
              sodSatisfied: separated,
              reason: "authoring_reviewer_separation_required",
            };
          },
        },
      }).authorize({ ...input, permissionCode: canonical });
    },
  };
}

/** Reading declarations has no maker/checker state transition. Only wire to GET inspection routes. */
export function createMetaEntityInspectionAuthorizer(
  fallback: Authorizer,
): Authorizer {
  const reviewer = createPermissionAuthorizer({
    policyGate: {
      async evaluate({ context, permissionCode }) {
        if (
          context.planeKey !== "studio" ||
          ![
            "studio.metadata.contract.edit",
            "studio.metadata.contract.review",
          ].includes(permissionCode)
        )
          return { allowed: false, reason: "authoring_policy_unavailable" };
        // No approval action is performed; all grant, scope, MFA and deny checks remain in the permission authorizer.
        return {
          allowed: true,
          sodSatisfied: permissionCode === "studio.metadata.contract.review",
        };
      },
    },
  });
  return {
    authorize: (input) =>
      ["metadata.entity.author", "metadata.entity.review"].includes(
        input.permissionCode,
      )
        ? reviewer.authorize({
            ...input,
            permissionCode: permissions[input.permissionCode]!,
          })
        : fallback.authorize(input),
  };
}

/** Learning review precedes a change set. Resolve its own immutable proposer
 * evidence, then use the ordinary authoring authority for release transitions. */
export function createAtlasLearningReviewAuthorizer(
  authoring: Authorizer,
  load: (context: VerifiedRequestContext, id: string) => Promise<{ tenantId: string; submittedBy: string; state: string } | null>,
): Authorizer {
  return {
    async authorize(input) {
      const operation = input.resource?.["learningOperation"];
      if (input.permissionCode !== "metadata.entity.review" || !["list", "stage", "reject"].includes(String(operation)))
        return authoring.authorize(input);
      return createPermissionAuthorizer({ policyGate: { async evaluate({ context, resource }) {
        if (context.planeKey !== "studio") return { allowed: false, reason: "authoring_policy_unavailable" };
        // This server-selected branch only lists inbox evidence; it approves nothing.
        if (operation === "list") return { allowed: true, sodSatisfied: true };
        const id = resource?.["learningInboxId"];
        if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return { allowed: false, reason: "learning_coordinate_required" };
        const row = await load(context, id);
        const separated = Boolean(row && row.tenantId === context.tenantId && row.submittedBy !== context.principalId &&
          (row.state === "pending" || (operation === "stage" && row.state === "drafted")));
        return { allowed: separated, sodSatisfied: separated, reason: "learning_reviewer_separation_required" };
      } } }).authorize({ ...input, permissionCode: "studio.metadata.contract.review" });
    },
  };
}
