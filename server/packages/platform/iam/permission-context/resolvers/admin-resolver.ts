import type { PermissionResolver } from "../types.js";
import {
  createCanonicalResolver,
  type CanonicalResolverDeps,
} from "./base.js";

export type AdminResolverDeps = CanonicalResolverDeps;

export function createAdminResolver(
  deps: AdminResolverDeps,
): PermissionResolver {
  return createCanonicalResolver("admin", deps);
}
