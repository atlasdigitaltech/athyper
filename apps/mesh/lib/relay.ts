import { readAppEnvironment } from "./environment";
import {
  COMMON_PLANE_RELAY_OPERATIONS,
  createLazyRelay,
  createRelayHandler,
  MESH_BP_BANK_DISCLOSURE_RELAY_OPERATIONS,
  MESH_BP_NETWORK_EXCHANGE_RELAY_OPERATIONS,
  MESH_NETWORK_ACCOUNTS_OPERATION,
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
    plane: "mesh",
    operations: [
      ...COMMON_PLANE_RELAY_OPERATIONS,
      MESH_NETWORK_ACCOUNTS_OPERATION,
      ...MESH_BP_NETWORK_EXCHANGE_RELAY_OPERATIONS,
      ...MESH_BP_BANK_DISCLOSURE_RELAY_OPERATIONS,
    ],
  });
}
