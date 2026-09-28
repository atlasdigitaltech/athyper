export type ProcessRole = "api" | "worker" | "scheduler";
export type DeploymentPlane = "studio" | "neon" | "mesh";

export interface DeploymentProfile {
  readonly name: "combined" | DeploymentPlane;
  readonly role: ProcessRole;
  readonly planes: readonly DeploymentPlane[];
  readonly coordination: readonly "entity-release-review"[];
}

/** Parse before loading composition or constructing any adapter. */
export function readDeploymentProfile(
  environment: Readonly<Record<string, string | undefined>>,
  expectedRole: ProcessRole,
): DeploymentProfile {
  const role = environment.MODE ?? "api";
  if (role !== expectedRole) throw new Error("DEPLOYMENT_ROLE_MISMATCH");
  const name = environment.HOST_DEPLOYMENT_PROFILE ?? "combined";
  if (name !== "combined" && name !== "studio" && name !== "neon" && name !== "mesh")
    throw new Error("DEPLOYMENT_PROFILE_INVALID");
  const review = Boolean(environment.ENTITY_RELEASE_REVIEW_CONFIG_PATH?.trim());
  return Object.freeze({
    name,
    role: expectedRole,
    planes: Object.freeze(name === "combined" ? ["studio", "neon", "mesh"] as const : [name] as const),
    // Existing review configuration applies only to worker processes.
    coordination: Object.freeze(review && expectedRole === "worker" ? ["entity-release-review"] as const : []),
  });
}

/** Fail explicitly until each isolated registration plan has been extracted. */
export function assertDeploymentProfileImplemented(profile: DeploymentProfile): void {
  if (profile.name !== "combined")
    throw new Error("DEPLOYMENT_PROFILE_NOT_YET_IMPLEMENTED");
}
