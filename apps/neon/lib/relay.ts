import { readAppEnvironment } from "./environment";
import { BANK_DIRECTORY_REFERENCE_OPERATION } from "@athyper/platform-gateway-bff-relay";
import {
  ACTIVITY_CENTER_RELAY_OPERATIONS,
  ATLAS_ANSWER_RELAY_OPERATIONS,
  BUSINESS_PARTNER_RELAY_OPERATIONS,
  createRelayHandler,
  ENTITY_VIEWS_RELAY_OPERATIONS,
  ENTITY_APPLICATION_DESCRIPTOR_OPERATION,
  REFERENCE_HISTORY_RELAY_OPERATIONS,
  ENTITY_LIST_DESCRIPTOR_OPERATION,
  ENTITY_LIST_QUERY_OPERATION,
  ENTITY_RECORD_RUNTIME_RELAY_OPERATIONS,
  EXPERIENCE_BOOTSTRAP_OPERATION,
  EXPERIENCE_SURFACE_RUNTIME_RELAY_OPERATIONS,
  IAM_ME_OPERATION,
  NEON_BP_BANK_VERIFICATION_RELAY_OPERATIONS,
  NEON_BP_APPLICANT_RELAY_OPERATIONS,
  NEON_BP_INVITATION_CREATE_OPERATION,
  NEON_BP_MESH_ACCOUNT_LINK_RELAY_OPERATIONS,
  NEON_BP_PROFILE_MATCH_RELAY_OPERATIONS,
  NEON_BP_PROFILE_PROJECTION_RELAY_OPERATIONS,
  NEON_OPERATING_ORGANIZATIONS_OPERATION,
  NEON_WORK_CONTEXTS_OPERATION,
  NEON_WORKFORCE_REQUEST_RELAY_OPERATIONS,
  PRINCIPAL_LOCALE_UPDATE_OPERATION,
  RECORD_BOOKMARK_RELAY_OPERATIONS,
  RECORD_TRANSFER_RELAY_OPERATIONS,
  type RelayHandler,
} from "@athyper/platform-gateway-bff-relay";
import { authRuntime } from "./auth";

let relay: RelayHandler | undefined;
export const platformRelay: RelayHandler = (request, context) => {
  relay ??= createAppRelay(
    {
      runtimeApiUrl: readAppEnvironment().runtimeApiUrl,
      appOrigin: readAppEnvironment().appOrigin,

      session: {
        resolve: (input) => authRuntime.resolveRelaySession(input),
        refresh: (input) => authRuntime.refreshRelaySession(input),
        invalidate: (input) => authRuntime.invalidateRelaySession(input),
      },
    },
    process.env,
  );
  return relay(request, context);
};

export function createAppRelay(
  options: Omit<
    Parameters<typeof createRelayHandler>[0],
    "plane" | "operations"
  >,
  environment: Readonly<Record<string, string | undefined>> = {},
): RelayHandler {
  return createRelayHandler({
    ...options,
    plane: "neon",
    operations: [
      BANK_DIRECTORY_REFERENCE_OPERATION,
      IAM_ME_OPERATION,
      EXPERIENCE_BOOTSTRAP_OPERATION,
      PRINCIPAL_LOCALE_UPDATE_OPERATION,
      ...EXPERIENCE_SURFACE_RUNTIME_RELAY_OPERATIONS,
      ...ATLAS_ANSWER_RELAY_OPERATIONS,
      NEON_WORK_CONTEXTS_OPERATION,
      NEON_OPERATING_ORGANIZATIONS_OPERATION,
      ...ENTITY_VIEWS_RELAY_OPERATIONS,
      ENTITY_APPLICATION_DESCRIPTOR_OPERATION,
      ...REFERENCE_HISTORY_RELAY_OPERATIONS,
      ENTITY_LIST_DESCRIPTOR_OPERATION,
      ENTITY_LIST_QUERY_OPERATION,
      ...ENTITY_RECORD_RUNTIME_RELAY_OPERATIONS,
      ...BUSINESS_PARTNER_RELAY_OPERATIONS,
      ...NEON_BP_BANK_VERIFICATION_RELAY_OPERATIONS,
      ...NEON_BP_APPLICANT_RELAY_OPERATIONS,
      NEON_BP_INVITATION_CREATE_OPERATION,
      ...NEON_BP_PROFILE_PROJECTION_RELAY_OPERATIONS,
      ...NEON_BP_PROFILE_MATCH_RELAY_OPERATIONS,
      ...NEON_BP_MESH_ACCOUNT_LINK_RELAY_OPERATIONS,
      ...NEON_WORKFORCE_REQUEST_RELAY_OPERATIONS,
      ...RECORD_BOOKMARK_RELAY_OPERATIONS,
      ...RECORD_TRANSFER_RELAY_OPERATIONS,
      ...ACTIVITY_CENTER_RELAY_OPERATIONS,
      ...(environment.LOCAL_CONTACT_CHALLENGE_ENABLED === "true"
        ? [
            {
              id: "local.contact.challenge.request",
              method: "POST" as const,
              path: "/api/master/contacts/:contactId/verification-challenges" as const,
              requestClass: "json" as const,
              requiresTenant: true,
              maxBodyBytes: 1024,
            },
            {
              id: "local.contact.challenge.complete",
              method: "POST" as const,
              path: "/api/master/verification-challenges/:challengeId/complete" as const,
              requestClass: "json" as const,
              requiresTenant: true,
              maxBodyBytes: 1024,
            },
          ]
        : []),
      ...(environment.LOCAL_MASTER_DATA_PILOT_ENABLED === "true"
        ? [
            {
              id: "local.master.contact.create",
              method: "POST" as const,
              path: "/api/master/owners/:entityCode/:ownerTypeId/:ownerId/contacts" as const,
              requestClass: "json" as const,
              requiresTenant: true,
              maxBodyBytes: 8192,
            },
            {
              id: "local.master.address.create",
              method: "POST" as const,
              path: "/api/master/owners/:entityCode/:ownerTypeId/:ownerId/addresses" as const,
              requestClass: "json" as const,
              requiresTenant: true,
              maxBodyBytes: 8192,
            },
            {
              id: "local.master.contact.deactivate",
              method: "POST" as const,
              path: "/api/master/contacts/:contactId/deactivate" as const,
              requestClass: "json" as const,
              requiresTenant: true,
              maxBodyBytes: 1024,
            },
            {
              id: "local.master.address.deactivate",
              method: "POST" as const,
              path: "/api/master/addresses/:addressLinkId/deactivate" as const,
              requestClass: "json" as const,
              requiresTenant: true,
              maxBodyBytes: 1024,
            },
            {
              id: "local.master.contact.verification",
              method: "PATCH" as const,
              path: "/api/master/contacts/:contactId/verification" as const,
              requestClass: "json" as const,
              requiresTenant: true,
              maxBodyBytes: 8192,
            },
            {
              id: "local.master.profile",
              method: "GET" as const,
              path: "/api/master/owners/:entityCode/:ownerTypeId/:ownerId/profile" as const,
              requestClass: "json" as const,
              requiresTenant: true,
            },
          ]
        : []),
    ],
  });
}
