import { createKeycloakAuthAdapter } from "@athyper/server-adapter-auth-keycloak";
import type { LifecycleManager } from "@athyper/server-foundation/lifecycle";
import type { HostConfig } from "../../config/environment.js";
import type { Container } from "../../kernel/container.js";
import type { AdapterRegistrationDependencies } from "./adapter-contract.js";

export type IdentityRegistrationDependencies = Pick<
  AdapterRegistrationDependencies,
  "createKeycloakAuth"
>;

const DEFAULT_DEPENDENCIES: IdentityRegistrationDependencies = {
  createKeycloakAuth: createKeycloakAuthAdapter,
};

export function registerIdentityAdapter(
  container: Container,
  config: HostConfig,
  lifecycle: LifecycleManager,
  overrides: Partial<IdentityRegistrationDependencies> = {},
) {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  if (config.keycloak.issuerUrl && config.keycloak.audience) {
    const keycloakAuth = dependencies.createKeycloakAuth({
      defaultRealm: {
        issuerUrl: config.keycloak.issuerUrl,
        audience: config.keycloak.audience,
        ...(config.keycloak.jwksUrl
          ? { jwksUrl: config.keycloak.jwksUrl }
          : {}),
      },
      jwksCacheTtlMs: config.keycloak.jwksCacheTtlMs,
    });
    container.adapters.keycloakAuth = keycloakAuth;
    lifecycle.onReady(() => keycloakAuth.warmUp());
  }
}
