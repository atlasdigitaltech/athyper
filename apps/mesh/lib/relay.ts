import { ACTIVITY_CENTER_RELAY_OPERATIONS, ATLAS_ANSWER_RELAY_OPERATIONS, createRelayHandler, ENTITY_LIST_DESCRIPTOR_OPERATION, ENTITY_LIST_QUERY_OPERATION, ENTITY_RECORD_RUNTIME_RELAY_OPERATIONS, EXPERIENCE_BOOTSTRAP_OPERATION, EXPERIENCE_SURFACE_RUNTIME_RELAY_OPERATIONS, IAM_ME_OPERATION, MESH_BP_PROFILE_PUBLICATION_RELAY_OPERATIONS, MESH_NETWORK_ACCOUNTS_OPERATION, PRINCIPAL_LOCALE_UPDATE_OPERATION, RECORD_BOOKMARK_RELAY_OPERATIONS, RECORD_TRANSFER_RELAY_OPERATIONS, type RelayHandler } from "@athyper/platform-gateway-bff-relay";
import { authRuntime } from "@/lib/auth";

let relay: RelayHandler | undefined;
export const platformRelay: RelayHandler = (request, context) => {
  relay ??= createRelayHandler({
    plane: "mesh",
    runtimeApiUrl: requiredEnvironment("RUNTIME_API_URL"),
    appOrigin: process.env.APP_ORIGIN ?? process.env.NEXT_PUBLIC_APP_ORIGIN ?? "http://localhost:3100",
    operations: [IAM_ME_OPERATION, EXPERIENCE_BOOTSTRAP_OPERATION, PRINCIPAL_LOCALE_UPDATE_OPERATION, ...EXPERIENCE_SURFACE_RUNTIME_RELAY_OPERATIONS, ...ATLAS_ANSWER_RELAY_OPERATIONS, MESH_NETWORK_ACCOUNTS_OPERATION, ...MESH_BP_PROFILE_PUBLICATION_RELAY_OPERATIONS, ENTITY_LIST_DESCRIPTOR_OPERATION, ENTITY_LIST_QUERY_OPERATION, ...ENTITY_RECORD_RUNTIME_RELAY_OPERATIONS, ...RECORD_BOOKMARK_RELAY_OPERATIONS, ...RECORD_TRANSFER_RELAY_OPERATIONS, ...ACTIVITY_CENTER_RELAY_OPERATIONS],
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
