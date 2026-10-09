import { registerLocalPublicationAdmission } from "./local-publication.js";
import { registerControlResourceReview } from "./resource-review-routes.js";
import type { createControlResourceReview } from "./resource-review.js";
import {
  registerProductLabelEnrollmentRoutes,
  registerProductReferenceEnrollmentRoutes,
  type ProductReferenceEnrollmentOptions,
  type createProductLabelEnrollment,
} from "@athyper/server-plane-studio-meta-entity-authoring";
import type { Application } from "express";
import { sql, type Kysely } from "kysely";
import type { AuditRecorder } from "@athyper/server-contract-audit";
import type { Authenticator } from "@athyper/server-contract-auth";
import type { PolicyBundleSigner } from "@athyper/server-contract-policy";
import {
  createIamAuthenticationMiddleware,
  readVerifiedRequestContext,
} from "@athyper/server-platform-iam";
import { createRevisionAuthorizer } from "../shared/entity-runtime/revision-authorizer.js";
import { type PlatformAuthority } from "../shared/identity/platform-authority.js";
import {
  createPublicationPolicyEnrollment,
  PUBLICATION_POLICY_PERMISSIONS,
} from "../shared/publication/policy-enrollment.js";
import { registerPublicationPolicyEnrollmentRoutes } from "../shared/publication/policy-enrollment-routes.js";
import { registerControlSession } from "./session.js";
import { registerControlProductReview } from "./product-review.js";

/** Closed route surface. Never call the combined host's registration chain here. */
export function registerControlPlane(
  application: Application,
  options: {
    database: Kysely<Record<string, never>>;
    audit: AuditRecorder<Kysely<Record<string, never>>>;
    authenticator: Authenticator;
    signer: PolicyBundleSigner;
    authority: PlatformAuthority;
    environment: string;
    instance: string;
    domainSuffix: string;
    /** Installed scoped command resources only; never fall back to the review DB. */
    productLabelEnrollment?: Parameters<typeof createProductLabelEnrollment>[0];
    productReferenceEnrollment?: ProductReferenceEnrollmentOptions;
    resourceReview?: ReturnType<typeof createControlResourceReview>;
    localPublication?: Pick<
      Parameters<typeof registerLocalPublicationAdmission>[1],
      "configuration" | "targetDatabases"
    >;
    nativeSource?: Parameters<
      typeof registerControlProductReview
    >[1]["nativeSource"];
  },
) {
  registerControlSession(application, options.authenticator, options.authority);
  if (options.resourceReview)
    registerControlResourceReview(application, {
      authenticator: options.authenticator,
      service: options.resourceReview,
    });
  registerControlProductReview(application, options);
  if (options.localPublication) {
    if (!options.nativeSource)
      throw Error("LOCAL_PUBLICATION_NATIVE_CONFIGURATION_REQUIRED");
    registerLocalPublicationAdmission(application, {
      ...options,
      ...options.localPublication,
      source: options.nativeSource,
    });
  }
  if (options.productLabelEnrollment) {
    registerProductLabelEnrollmentRoutes(application, {
      ...options.productLabelEnrollment,
      authenticate: createIamAuthenticationMiddleware(options.authenticator),
      readContext: readVerifiedRequestContext,
    });
  }
  if (options.productReferenceEnrollment) {
    registerProductReferenceEnrollmentRoutes(application, {
      ...options.productReferenceEnrollment,
      authenticate: createIamAuthenticationMiddleware(options.authenticator),
      readContext: readVerifiedRequestContext,
    });
  }
  const authorizer = createRevisionAuthorizer({
    permissions: {
      read: "studio.metadata.contract.view",
      author: PUBLICATION_POLICY_PERMISSIONS.propose,
      publish: PUBLICATION_POLICY_PERMISSIONS.activate,
    },
    get: (tenantId, revisionId, principalId) =>
      options.database.transaction().execute(async (tx) => {
        await sql`SELECT set_config('app.current_tenant_id',${tenantId},true),set_config('app.current_principal_id',${principalId},true),set_config('app.database_plane','studio',true)`.execute(
          tx,
        );
        const rows = (
          await sql<{
            created_by: string;
          }>`SELECT created_by FROM control.policy_definition
      WHERE tenant_id=${tenantId}::uuid AND id=${revisionId}::uuid AND entity_type='metadata.publication'`.execute(
            tx,
          )
        ).rows;
        return rows.length === 1 ? { createdBy: rows[0]!.created_by } : null;
      }),
  });
  registerPublicationPolicyEnrollmentRoutes(application, {
    authenticate: createIamAuthenticationMiddleware(options.authenticator),
    readContext: readVerifiedRequestContext,
    service: createPublicationPolicyEnrollment({ ...options, authorizer }),
  });
}
