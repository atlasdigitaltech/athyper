import type { DeploymentPlane, ProcessRole } from "../config/deployment-profile.js";
import type { RegistrationPlan } from "./registration-plan.js";
import type { HealthCheck } from "@athyper/server-foundation/observability";

const allPlanes = ["studio", "neon", "mesh"] as const;
const allRoles = ["api", "worker", "scheduler"] as const;
/** Explicit code ownership; neither published metadata nor database presence selects modules. */
const capabilities = {
  "entity.persistence": { planes: allPlanes, roles: allRoles },
  "entity.governance": { planes: allPlanes, roles: allRoles },
  "entity.authorization": { planes: allPlanes, roles: allRoles },
  "entity.experience": { planes: allPlanes, roles: allRoles },
  "entity.http": { planes: allPlanes, roles: ["api"] },
  "publication.authority": { planes: ["studio"], roles: allRoles },
  "publication.targets": { planes: allPlanes, roles: allRoles },
} as const satisfies Record<string, { planes: readonly DeploymentPlane[]; roles: readonly ProcessRole[] }>;
export type HostCapability = keyof typeof capabilities;

export function createCapabilityRegistration(plan: RegistrationPlan) {
  const planes = [...plan.servedPlanes];
  const registered = new Set<HostCapability>();
  const select = (id: HostCapability) => {
    if (!Object.hasOwn(capabilities, id)) throw Error("HOST_CAPABILITY_UNKNOWN");
    const definition = capabilities[id];
    if (!(definition.roles as readonly ProcessRole[]).includes(plan.profile.role))
      throw Error("HOST_CAPABILITY_ROLE_EXCLUDED");
    const selected = planes.filter(plane => (definition.planes as readonly DeploymentPlane[]).includes(plane));
    if (!selected.length) throw Error("HOST_CAPABILITY_PLANE_EXCLUDED");
    return Object.freeze(selected);
  };
  return {
    planes: Object.freeze(planes),
    register<Result>(id: HostCapability, factory: (planes: readonly DeploymentPlane[]) => Result): Result {
      if (registered.has(id)) throw Error("HOST_CAPABILITY_DUPLICATE");
      const selected = select(id);
      const result = factory(selected);
      registered.add(id);
      return result;
    },
    databases<Database>(id: HostCapability, databases: Readonly<Partial<Record<DeploymentPlane, Database>>>) {
      return Object.fromEntries(select(id).filter(plane => databases[plane] !== undefined).map(plane => [plane, databases[plane]])) as Partial<Record<DeploymentPlane, Database>>;
    },
    registerHealth(registry: { register(name: string, check: HealthCheck): void }, plane: DeploymentPlane, name: string, check: HealthCheck) {
      if (!planes.includes(plane)) throw Error("HOST_HEALTH_PLANE_EXCLUDED");
      registry.register(name, check);
    },
  };
}
