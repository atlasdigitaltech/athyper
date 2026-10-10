import { readAppEnvironment } from "./environment";
import {
  BUSINESS_PARTNER_RELAY_OPERATIONS,
  COMMON_PLANE_RELAY_OPERATIONS,
  createLazyRelay,
  createRelayHandler,
  NEON_BP_BANK_VERIFICATION_RELAY_OPERATIONS,
  NEON_BP_CLASSIFICATION_RELAY_OPERATIONS,
  NEON_BP_APPLICANT_RELAY_OPERATIONS,
  NEON_BP_INVITATION_CREATE_OPERATION,
  NEON_OPERATING_ORGANIZATIONS_OPERATION,
  NEON_BUSINESS_CONTEXT_OPTIONS_OPERATION,
  NEON_WORK_CONTEXTS_OPERATION,
  NEON_WORKFORCE_READ_RELAY_OPERATIONS,
  NEON_WORKFORCE_PROFILE_RELAY_OPERATIONS,
  NEON_WORKFORCE_REQUEST_RELAY_OPERATIONS,
  NEON_WORKFORCE_SAVED_VIEW_RELAY_OPERATIONS,
  NEON_HR_STAGE2_RELAY_OPERATIONS,
  relaySessionFromAuth,
  type RelayHandler,
} from "@athyper/platform-gateway-bff-relay";
import { authRuntime } from "./auth";

export const platformRelay: RelayHandler = createLazyRelay(() =>
  createAppRelay(
    {
      runtimeApiUrl: readAppEnvironment().runtimeApiUrl,
      appOrigin: readAppEnvironment().appOrigin,
      session: relaySessionFromAuth(authRuntime),
    },
    process.env,
  ),
);

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
      ...COMMON_PLANE_RELAY_OPERATIONS,
      NEON_WORK_CONTEXTS_OPERATION,
      NEON_BUSINESS_CONTEXT_OPTIONS_OPERATION,
      NEON_OPERATING_ORGANIZATIONS_OPERATION,
      ...BUSINESS_PARTNER_RELAY_OPERATIONS,
      ...NEON_BP_BANK_VERIFICATION_RELAY_OPERATIONS,
      ...NEON_BP_CLASSIFICATION_RELAY_OPERATIONS,
      ...NEON_BP_APPLICANT_RELAY_OPERATIONS,
      NEON_BP_INVITATION_CREATE_OPERATION,
      ...NEON_WORKFORCE_READ_RELAY_OPERATIONS,
      ...NEON_WORKFORCE_PROFILE_RELAY_OPERATIONS,
      ...NEON_WORKFORCE_REQUEST_RELAY_OPERATIONS,
      ...NEON_WORKFORCE_SAVED_VIEW_RELAY_OPERATIONS,
      ...NEON_HR_STAGE2_RELAY_OPERATIONS,
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
