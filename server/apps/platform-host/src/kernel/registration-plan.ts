import type { DeploymentPlane, DeploymentProfile } from "../config/deployment-profile.js";

export interface RegistrationPlan {
  readonly profile: DeploymentProfile;
  /** Planes exposed by this process, never expanded by coordination. */
  readonly servedPlanes: readonly DeploymentPlane[];
  /** Additional connections do not grant permission to serve their APIs. */
  readonly databasePlanes: readonly DeploymentPlane[];
}

export function createRegistrationPlan(profile: DeploymentProfile): RegistrationPlan {
  const databases = new Set(profile.planes);
  if (profile.coordination.includes("entity-release-review")) {
    if (profile.role !== "worker") throw new Error("RELEASE_REVIEW_WORKER_REQUIRED");
    databases.add("studio");
    databases.add("neon");
  }
  return Object.freeze({
    profile,
    servedPlanes: Object.freeze([...profile.planes]),
    databasePlanes: Object.freeze([...databases]),
  });
}
