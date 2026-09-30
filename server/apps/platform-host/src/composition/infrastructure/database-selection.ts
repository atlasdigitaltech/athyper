import type { HostConfig } from "../../config/environment.js";
import type { RegistrationPlan } from "../../kernel/registration-plan.js";

/** Copy configuration; never mutate shared config or process.env. */
export function selectDatabaseConfiguration(
  config: HostConfig,
  plan?: RegistrationPlan,
): HostConfig {
  if (!plan) return config;
  const available = new Set(plan.databasePlanes);
  const served = new Set(plan.servedPlanes);
  return {
    ...config,
    database: {
      ...config.database,
      connectionString: available.has("neon")
        ? config.database.connectionString
        : undefined,
    },
    studioDatabase: {
      ...config.studioDatabase,
      connectionString: available.has("studio")
        ? config.studioDatabase.connectionString
        : undefined,
    },
    meshDatabase: {
      ...config.meshDatabase,
      connectionString: available.has("mesh")
        ? config.meshDatabase.connectionString
        : undefined,
    },
    jobs: {
      ...config.jobs,
      workerDatabaseUrls: {
        studio: served.has("studio")
          ? config.jobs.workerDatabaseUrls.studio
          : undefined,
        neon: served.has("neon")
          ? config.jobs.workerDatabaseUrls.neon
          : undefined,
        mesh: served.has("mesh")
          ? config.jobs.workerDatabaseUrls.mesh
          : undefined,
      },
      invalidationListenerDatabaseUrls: {
        studio: served.has("studio")
          ? config.jobs.invalidationListenerDatabaseUrls.studio
          : undefined,
        neon: served.has("neon")
          ? config.jobs.invalidationListenerDatabaseUrls.neon
          : undefined,
        mesh: served.has("mesh")
          ? config.jobs.invalidationListenerDatabaseUrls.mesh
          : undefined,
      },
    },
  };
}
