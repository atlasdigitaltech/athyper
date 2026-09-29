import type { RegistrationPlan } from "../kernel/registration-plan.js";

const DATABASE_SETTINGS = {
  studio: [
    "STUDIO_DATABASE_URL",
    "STUDIO_DATABASE_POOL_MAX",
    "ATHYPER_PLATFORM_DATABASE_URL",
    "STUDIO_WORKER_DATABASE_URL",
    "ATHYPER_PLATFORM_WORKER_DATABASE_URL",
  ],
  neon: [
    "DATABASE_URL",
    "DATABASE_POOL_MAX",
    "NEON_WORKER_DATABASE_URL",
    "DATABASE_ADMIN_URL",
  ],
  mesh: [
    "MESH_DATABASE_URL",
    "MESH_DATABASE_POOL_MAX",
    "MESH_WORKER_DATABASE_URL",
  ],
} as const;

/** Remove only settings owned by excluded resources. Security and shared settings
 * are not suppressed. More capability-specific selectors can be added explicitly. */
export function selectDeploymentEnvironment(
  source: Readonly<NodeJS.ProcessEnv>,
  plan: RegistrationPlan,
): NodeJS.ProcessEnv {
  const selected = { ...source };
  for (const plane of ["studio", "neon", "mesh"] as const) {
    if (!plan.databasePlanes.includes(plane))
      for (const setting of DATABASE_SETTINGS[plane]) delete selected[setting];
    if (!plan.servedPlanes.includes(plane)) {
      delete selected[
        `${plane.toUpperCase()}_INVALIDATION_LISTENER_DATABASE_URL`
      ];
      delete selected[`${plane.toUpperCase()}_WORKER_DATABASE_URL`];
      if (plane === "studio")
        delete selected.ATHYPER_PLATFORM_WORKER_DATABASE_URL;
      if (plane === "neon") delete selected.DATABASE_ADMIN_URL;
    }
  }
  return selected;
}
