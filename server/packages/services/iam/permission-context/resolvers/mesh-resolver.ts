import type { PermissionResolver } from "../types.js";
import {
  createCanonicalResolver,
  type CanonicalResolverDeps,
} from "./base.js";

export type MeshResolverDeps = CanonicalResolverDeps;

export function createMeshResolver(
  deps: MeshResolverDeps,
): PermissionResolver {
  return createCanonicalResolver("mesh", deps);
}
