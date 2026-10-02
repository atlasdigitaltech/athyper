import { readAppEnvironment } from "./environment";
import {
  ATLAS_EXPERIENCE_ADMIN_RELAY_OPERATIONS,
  STUDIO_ATLAS_LEARNING_RELAY_OPERATIONS,
  COMMON_PLANE_RELAY_OPERATIONS,
  createLazyRelay,
  createRelayHandler,
  LOCALE_POLICY_READ_OPERATION,
  LOCALE_POLICY_UPDATE_OPERATION,
  ROUTE_SLUG_REDIRECT_REGISTER_OPERATION,
  STUDIO_AUTHORIZATION_MANAGEMENT_RELAY_OPERATIONS,
  STUDIO_BP_CASE_CONTRACT_RELAY_OPERATIONS,
  STUDIO_BP_DEFINITION_RELAY_OPERATIONS,
  STUDIO_BP_LOCAL_PREVIEW_OPERATION,
  STUDIO_EXPERIENCE_SURFACE_RELAY_OPERATIONS,
  STUDIO_META_ENTITY_AUTHORING_RELAY_OPERATIONS,
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
    plane: "studio",
    operations: [
      ...COMMON_PLANE_RELAY_OPERATIONS,
      STUDIO_BP_LOCAL_PREVIEW_OPERATION,
      ...STUDIO_META_ENTITY_AUTHORING_RELAY_OPERATIONS,
      ...STUDIO_AUTHORIZATION_MANAGEMENT_RELAY_OPERATIONS,
      ...STUDIO_EXPERIENCE_SURFACE_RELAY_OPERATIONS,
      ROUTE_SLUG_REDIRECT_REGISTER_OPERATION,
      ...ATLAS_EXPERIENCE_ADMIN_RELAY_OPERATIONS,
      ...STUDIO_ATLAS_LEARNING_RELAY_OPERATIONS,
      LOCALE_POLICY_READ_OPERATION,
      LOCALE_POLICY_UPDATE_OPERATION,
      ...STUDIO_BP_DEFINITION_RELAY_OPERATIONS,
      ...STUDIO_BP_CASE_CONTRACT_RELAY_OPERATIONS,
    ],
  });
}
