import type { DeploymentProfile } from "../config/deployment-profile.js";

/** Literal loaders: no metadata-supplied paths and no eager implementation barrel. */
const loaders = {
  "entity.metadata": () => import("../composition/shared/entity-runtime/metadata.js"),
  "entity.read": () => import("../composition/shared/entity-runtime/read-runtime.js"),
  "entity.read-http": () => import("../composition/shared/entity-runtime/routes.js"),
  "coordination.entity-release-review": () => import("../composition/coordination/entity-release-review/register.js"),
  "compatibility.services": () => import("../composition/register-services.js"),
} as const;

export type HostModuleId = keyof typeof loaders;
type LoadedModule<Key extends HostModuleId> = Awaited<ReturnType<(typeof loaders)[Key]>>;

export async function loadHostModule<Key extends HostModuleId>(
  profile: DeploymentProfile,
  key: Key,
): Promise<LoadedModule<Key>> {
  if (!Object.hasOwn(loaders, key)) throw new Error("HOST_MODULE_UNREGISTERED");
  if (key === "compatibility.services" && profile.name !== "combined")
    throw new Error("HOST_LEGACY_MODULE_EXCLUDED");
  if (key === "entity.read-http" && profile.role !== "api")
    throw new Error("HOST_HTTP_MODULE_ROLE_INVALID");
  if (key === "coordination.entity-release-review" &&
      (profile.role !== "worker" || !profile.coordination.includes("entity-release-review")))
    throw new Error("HOST_COORDINATION_MODULE_EXCLUDED");
  // The key selects a closed, statically typed set of module namespaces.
  return await loaders[key]() as LoadedModule<Key>;
}
