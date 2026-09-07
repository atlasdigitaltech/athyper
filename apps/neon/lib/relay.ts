import { ACTIVITY_CENTER_RELAY_OPERATIONS, ATLAS_ANSWER_RELAY_OPERATIONS, BUSINESS_PARTNER_RELAY_OPERATIONS, createRelayHandler, ENTITY_LIST_DESCRIPTOR_OPERATION, ENTITY_LIST_QUERY_OPERATION, ENTITY_RECORD_RUNTIME_RELAY_OPERATIONS, EXPERIENCE_BOOTSTRAP_OPERATION, EXPERIENCE_SURFACE_RUNTIME_RELAY_OPERATIONS, IAM_ME_OPERATION, NEON_BP_BANK_VERIFICATION_RELAY_OPERATIONS, NEON_BP_APPLICANT_RELAY_OPERATIONS, NEON_BP_INVITATION_CREATE_OPERATION, NEON_BP_MESH_ACCOUNT_LINK_RELAY_OPERATIONS, NEON_BP_PROFILE_MATCH_RELAY_OPERATIONS, NEON_BP_PROFILE_PROJECTION_RELAY_OPERATIONS, NEON_OPERATING_ORGANIZATIONS_OPERATION, NEON_WORK_CONTEXTS_OPERATION, NEON_WORKFORCE_REQUEST_RELAY_OPERATIONS, PRINCIPAL_LOCALE_UPDATE_OPERATION, RECORD_BOOKMARK_RELAY_OPERATIONS, RECORD_TRANSFER_RELAY_OPERATIONS, type RelayHandler } from "@athyper/platform-gateway-bff-relay";
import { authRuntime } from "@/lib/auth";

let relay: RelayHandler | undefined;
export const platformRelay: RelayHandler = (request, context) => {
  relay ??= createRelayHandler({
    plane: "neon",
    runtimeApiUrl: requiredEnvironment("RUNTIME_API_URL"),
    appOrigin: process.env.APP_ORIGIN ?? process.env.NEXT_PUBLIC_APP_ORIGIN ?? "http://localhost:3000",
    operations: [
      IAM_ME_OPERATION, EXPERIENCE_BOOTSTRAP_OPERATION, PRINCIPAL_LOCALE_UPDATE_OPERATION, ...EXPERIENCE_SURFACE_RUNTIME_RELAY_OPERATIONS, ...ATLAS_ANSWER_RELAY_OPERATIONS, NEON_WORK_CONTEXTS_OPERATION, NEON_OPERATING_ORGANIZATIONS_OPERATION, ENTITY_LIST_DESCRIPTOR_OPERATION, ENTITY_LIST_QUERY_OPERATION, ...ENTITY_RECORD_RUNTIME_RELAY_OPERATIONS, ...BUSINESS_PARTNER_RELAY_OPERATIONS, ...NEON_BP_BANK_VERIFICATION_RELAY_OPERATIONS, ...NEON_BP_APPLICANT_RELAY_OPERATIONS, NEON_BP_INVITATION_CREATE_OPERATION, ...NEON_BP_PROFILE_PROJECTION_RELAY_OPERATIONS, ...NEON_BP_PROFILE_MATCH_RELAY_OPERATIONS, ...NEON_BP_MESH_ACCOUNT_LINK_RELAY_OPERATIONS, ...NEON_WORKFORCE_REQUEST_RELAY_OPERATIONS, ...RECORD_BOOKMARK_RELAY_OPERATIONS, ...RECORD_TRANSFER_RELAY_OPERATIONS, ...ACTIVITY_CENTER_RELAY_OPERATIONS,
      ...(process.env.LOCAL_CONTACT_CHALLENGE_ENABLED === "true" ? [
        { id: "local.contact.challenge.request", method: "POST" as const, path: "/api/master/contacts/:contactId/verification-challenges" as const, requestClass: "json" as const, requiresTenant: true, maxBodyBytes: 1024 },
        { id: "local.contact.challenge.complete", method: "POST" as const, path: "/api/master/verification-challenges/:challengeId/complete" as const, requestClass: "json" as const, requiresTenant: true, maxBodyBytes: 1024 },
      ] : []),
      ...(process.env.LOCAL_MASTER_DATA_PILOT_ENABLED === "true" ? [
        { id: "local.master.contact.create", method: "POST" as const, path: "/api/master/owners/:entityCode/:ownerTypeId/:ownerId/contacts" as const, requestClass: "json" as const, requiresTenant: true, maxBodyBytes: 8192 },
        { id: "local.master.address.create", method: "POST" as const, path: "/api/master/owners/:entityCode/:ownerTypeId/:ownerId/addresses" as const, requestClass: "json" as const, requiresTenant: true, maxBodyBytes: 8192 },
        { id: "local.master.contact.deactivate", method: "POST" as const, path: "/api/master/contacts/:contactId/deactivate" as const, requestClass: "json" as const, requiresTenant: true, maxBodyBytes: 1024 },
        { id: "local.master.address.deactivate", method: "POST" as const, path: "/api/master/addresses/:addressLinkId/deactivate" as const, requestClass: "json" as const, requiresTenant: true, maxBodyBytes: 1024 },
        { id: "local.master.contact.verification", method: "PATCH" as const, path: "/api/master/contacts/:contactId/verification" as const, requestClass: "json" as const, requiresTenant: true, maxBodyBytes: 8192 },
        { id: "local.master.profile", method: "GET" as const, path: "/api/master/owners/:entityCode/:ownerTypeId/:ownerId/profile" as const, requestClass: "json" as const, requiresTenant: true },
      ] : []),
    ],
    session: {
      resolve: (input) => authRuntime.resolveRelaySession(input),
      refresh: (input) => authRuntime.refreshRelaySession(input),
      invalidate: (input) => authRuntime.invalidateRelaySession(input),
    },
  });
  return relay(request, context);
};

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required; the browser relay fails closed without a server runtime URL`);
  return value;
}
