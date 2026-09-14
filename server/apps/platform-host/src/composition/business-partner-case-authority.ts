import { readLocalGraphProjections } from "@athyper/server-foundation";
import { parseEntityAuthorizationProfile } from "@athyper/server-contract-metadata";
import type { Authorizer } from "@athyper/server-contract-auth";
import type { EntityAuthorizationProfileV1 } from "@athyper/server-contract-metadata";
import { createBusinessPartnerBackendMapping } from "./business-partner-backend-mapping.js";
/** Use the published operation namespace while preserving the independent case ID
 * and all domain facts. Target ownership is still resolved from the stored case. */
export function businessPartnerCaseAuthority(
  authority: Authorizer,
  profile: EntityAuthorizationProfileV1,
  tenantId?: string,
): Authorizer {
  const mapping = createBusinessPartnerBackendMapping(profile);
  return {
    ...authority,
    authorize(request) {
      const resource = request.resource ?? {};
      if (
        (tenantId && request.context.tenantId !== tenantId) ||
        request.context.planeKey !== profile.planeKey ||
        resource["entityCode"] !== "entity_case" ||
        !request.permissionCode.startsWith("neon.relationship.entity_case.")
      )
        return authority.authorize(request);
      const mapped = mapping.target(request);
      if (!mapped)
        return Promise.resolve({
          allowed: false,
          reason: "case_binding_unavailable",
        });
      return authority.authorize({
        ...request,
        resource: {
          ...resource,
          entityCode: "business_partner",
          operationKey: mapped.operationKey,
        },
      });
    },
  };
}

/** Personal DEV uses the same namespace adapter as published releases, pinned to
 * the signed artifact selected by IAM for this request. Never invents grants. */
export function localBusinessPartnerCaseAuthority(
  authority: Authorizer,
  read: typeof readLocalGraphProjections = readLocalGraphProjections,
): Authorizer {
  return {
    ...authority,
    authorize(request) {
      const pins = request.context.permissions?.localGraphPreview;
      if (
        request.context.planeKey !== "neon" ||
        !pins?.business_partner ||
        request.resource?.entityCode !== "entity_case" ||
        !request.permissionCode.startsWith("neon.relationship.entity_case.")
      )
        return authority.authorize(request);
      const projection = read(request.context.tenantId, "neon", pins).find(
        (p) => p.entityCode === "business_partner",
      );
      if (!projection || projection.artifactHash !== pins.business_partner)
        return Promise.resolve({
          allowed: false,
          reason: "case_binding_unavailable",
        });
      const descriptor = projection.projection.descriptor as
        Record<string, unknown> | undefined;
      const profile = parseEntityAuthorizationProfile(
        descriptor?.authorization,
      );
      return businessPartnerCaseAuthority(
        authority,
        profile,
        request.context.tenantId,
      ).authorize(request);
    },
  };
}
