import type { LifecycleManager } from "@athyper/server-foundation/lifecycle";
import type { HostConfig } from "../config/environment.js";
import type { Container } from "../kernel/container.js";
import type { RegistrationPlan } from "../kernel/registration-plan.js";
import type { AdapterRegistrationDependencies } from "./infrastructure/adapter-contract.js";
export type { AdapterRegistrationDependencies } from "./infrastructure/adapter-contract.js";
import { registerTelemetry } from "./infrastructure/telemetry.js";
import { registerIdentityAdapter } from "./infrastructure/identity.js";
import { registerCache } from "./infrastructure/cache.js";
import { registerMessaging } from "./infrastructure/messaging.js";
import { registerStorage } from "./infrastructure/storage.js";
import { registerDocumentProcessing } from "./infrastructure/document-processing.js";
import {
  registerDatabases,
  registerWorkerDatabases,
} from "./infrastructure/databases.js";
import { registerSecrets } from "./infrastructure/secrets.js";
import { registerPublicationTrust } from "./infrastructure/publication-trust.js";

/** Combined compatibility composition. Isolated hosts select resource registrars directly. */
export function registerAdapters(
  container: Container,
  config: HostConfig,
  lifecycle: LifecycleManager,
  dependencyOverrides: Partial<AdapterRegistrationDependencies> = {},
  plan?: RegistrationPlan,
): void {
  const shutdownTelemetry = registerTelemetry(
    container,
    config,
    lifecycle,
    dependencyOverrides,
  );
  try {
    registerIdentityAdapter(container, config, lifecycle, dependencyOverrides);
    registerCache(container, config, lifecycle, dependencyOverrides);
    registerMessaging(container, config, lifecycle, dependencyOverrides);
    registerStorage(container, config, lifecycle, dependencyOverrides);
    registerDocumentProcessing(
      container,
      config,
      lifecycle,
      dependencyOverrides,
    );
    registerDatabases(container, config, lifecycle, dependencyOverrides, plan);
    registerSecrets(container, config, lifecycle, dependencyOverrides);
    registerPublicationTrust(container, config, lifecycle, dependencyOverrides);
    registerWorkerDatabases(
      container,
      config,
      lifecycle,
      dependencyOverrides,
      plan,
    );
  } finally {
    // LIFO: flush telemetry before infrastructure closes, including failed composition.
    lifecycle.onShutdown(shutdownTelemetry);
  }
}
