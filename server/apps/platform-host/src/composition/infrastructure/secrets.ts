import type { LifecycleManager } from "@athyper/server-foundation/lifecycle";
import {
  createInfisicalSecretStore,
  withProtectedValueStore,
} from "@athyper/server-adapter-secretstore-infisical";
import type { HostConfig } from "../../config/environment.js";
import type { Container } from "../../kernel/container.js";
import type { AdapterRegistrationDependencies } from "./adapter-contract.js";

export type SecretsRegistrationDependencies = Pick<
  AdapterRegistrationDependencies,
  "createSecretStore"
>;

const DEFAULT_DEPENDENCIES: SecretsRegistrationDependencies = {
  createSecretStore: createInfisicalSecretStore,
};

export function registerSecrets(
  container: Container,
  config: HostConfig,
  lifecycle: LifecycleManager,
  overrides: Partial<SecretsRegistrationDependencies> = {},
) {
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  // Protected business values need the configured store independently of publication.
  if (
    config.protectedValuesStore &&
    (!config.infisical?.endpoint ||
      !config.infisical.token ||
      !config.infisical.workspaceId)
  ) {
    throw new Error(
      "Protected-value routing requires the existing read authority",
    );
  }
  if (
    config.infisical?.endpoint &&
    config.infisical.token &&
    config.infisical.workspaceId
  ) {
    const secretStore = (
      dependencies.createSecretStore ?? createInfisicalSecretStore
    )({
      endpoint: config.infisical.endpoint,
      token: config.infisical.token,
      workspaceId: config.infisical.workspaceId,
      environment: config.infisical.environment,
      secretPath: config.infisical.secretPath,
    });
    const effectiveStore = config.protectedValuesStore
      ? withProtectedValueStore(
          secretStore,
          (dependencies.createSecretStore ?? createInfisicalSecretStore)({
            ...config.protectedValuesStore,
            createOnly: true,
          }),
        )
      : secretStore;
    container.adapters.secretStore = effectiveStore;
    lifecycle.onShutdown(() => effectiveStore.close?.());
  }
}
