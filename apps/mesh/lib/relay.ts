import { readAppEnvironment } from "./environment";
import { BANK_DIRECTORY_REFERENCE_OPERATION } from "@athyper/platform-gateway-bff-relay";
import {
  ACTIVITY_CENTER_RELAY_OPERATIONS,
  ATLAS_ANSWER_RELAY_OPERATIONS,
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
  MESH_BP_BANK_DISCLOSURE_RELAY_OPERATIONS,
  MESH_BP_NETWORK_EXCHANGE_RELAY_OPERATIONS,
  MESH_BP_PROFILE_PUBLICATION_RELAY_OPERATIONS,
  MESH_NETWORK_ACCOUNTS_OPERATION,
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
    plane: "mesh",
    operations: [
      BANK_DIRECTORY_REFERENCE_OPERATION,
      IAM_ME_OPERATION,
      EXPERIENCE_BOOTSTRAP_OPERATION,
      PRINCIPAL_LOCALE_UPDATE_OPERATION,
      ...EXPERIENCE_SURFACE_RUNTIME_RELAY_OPERATIONS,
      ...ATLAS_ANSWER_RELAY_OPERATIONS,
      MESH_NETWORK_ACCOUNTS_OPERATION,
      ...MESH_BP_PROFILE_PUBLICATION_RELAY_OPERATIONS,
      ...MESH_BP_NETWORK_EXCHANGE_RELAY_OPERATIONS,
      ...MESH_BP_BANK_DISCLOSURE_RELAY_OPERATIONS,
      ...ENTITY_VIEWS_RELAY_OPERATIONS,
      ENTITY_APPLICATION_DESCRIPTOR_OPERATION,
      ...REFERENCE_HISTORY_RELAY_OPERATIONS,
      ENTITY_LIST_DESCRIPTOR_OPERATION,
      ENTITY_LIST_QUERY_OPERATION,
      ...ENTITY_RECORD_RUNTIME_RELAY_OPERATIONS,
      ...RECORD_BOOKMARK_RELAY_OPERATIONS,
      ...RECORD_TRANSFER_RELAY_OPERATIONS,
      ...ACTIVITY_CENTER_RELAY_OPERATIONS,
    ],
  });
}
