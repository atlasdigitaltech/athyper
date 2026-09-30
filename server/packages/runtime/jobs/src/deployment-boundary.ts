import type { PlaneKey } from "@athyper/server-foundation/context";
import type { JobExecutionCoordinate } from "@athyper/server-contract-jobs";

export interface JobDeploymentBoundary {
  readonly namespace: string;
  readonly planes: readonly PlaneKey[];
}

/** Shared by producers, consumers and schedulers; snapshot caller-owned configuration. */
export function createJobDeploymentBoundary(deployment?: JobDeploymentBoundary) {
  if (deployment && (!/^[a-z][a-z0-9-]{0,47}$/.test(deployment.namespace) || !deployment.planes.length || deployment.planes.some(p => !["studio", "neon", "mesh"].includes(p))))
    throw new Error("JOB_DEPLOYMENT_BOUNDARY_INVALID");
  const namespace = deployment?.namespace;
  const planes = deployment ? new Set(deployment.planes) : undefined;
  return {
    namespace,
    queue(name: string) { return namespace ? `${namespace}.${name}` : name; },
    assertExecution(execution: JobExecutionCoordinate | undefined) {
      if (planes && (!execution || !planes.has(execution.planeKey)))
        throw new Error("JOB_DEPLOYMENT_PLANE_EXCLUDED");
    },
  };
}
