// Resolver registry: plane key → PermissionResolver implementation.
//
// The application wires this once at startup (typically next to the IAM service
// bootstrap) and the middleware calls registry.get(planeKey) per request. Each
// resolver retains its own DB client, so the registry is just a dispatch map.

import type { PermissionResolver, PlaneKey } from "../types.js";

import { createAdminResolver, type AdminResolverDeps } from "./admin-resolver.js";
import { createMeshResolver, type MeshResolverDeps } from "./mesh-resolver.js";
import { createNeonResolver, type NeonResolverDeps } from "./neon-resolver.js";

export interface PermissionResolverRegistry {
  get(planeKey: PlaneKey): PermissionResolver;
}

export interface CreateResolverRegistryDeps {
  neon: NeonResolverDeps;
  admin: AdminResolverDeps;
  mesh: MeshResolverDeps;
}

export function createPermissionResolverRegistry(
  deps: CreateResolverRegistryDeps,
): PermissionResolverRegistry {
  const resolvers: Record<PlaneKey, PermissionResolver> = {
    neon: createNeonResolver(deps.neon),
    admin: createAdminResolver(deps.admin),
    mesh: createMeshResolver(deps.mesh),
  };

  return {
    get(planeKey: PlaneKey): PermissionResolver {
      const resolver = resolvers[planeKey];
      if (!resolver) {
        throw new Error(`PermissionResolverRegistry: unknown plane "${planeKey}"`);
      }
      return resolver;
    },
  };
}
