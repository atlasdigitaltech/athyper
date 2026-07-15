// Barrel — three-plane permission stack (Phase 2).
// Mounted from server/packages/services/iam/index.ts.

export type { PlaneKey } from "./plane-key.js";
export { isPlaneKey, PLANE_KEYS } from "./plane-key.js";

export type {
  EffectiveGrantStatus,
  EffectivePermissionContext,
  EffectivePermissionEntry,
  PermissionResolver,
  ResolverInput,
} from "./types.js";

export {
  computePersonaFingerprint,
  computeProfileHash,
  computeSchemaHash,
  loadPlaneEligiblePermissions,
  loadPermissionAliasMap,
} from "./resolvers/base.js";

export {
  createNeonResolver,
  type NeonResolverDeps,
} from "./resolvers/neon-resolver.js";

export {
  createAdminResolver,
  type AdminResolverDeps,
} from "./resolvers/admin-resolver.js";

export {
  createMeshResolver,
  type MeshResolverDeps,
} from "./resolvers/mesh-resolver.js";

export {
  createPermissionResolverRegistry,
  type CreateResolverRegistryDeps,
  type PermissionResolverRegistry,
} from "./resolvers/registry.js";

export { buildEffectivePermissionContext } from "./context-builder.js";

export {
  createPermissionContextMiddleware,
  ensureEffectivePermissionContext,
  EffectivePermissionContextMismatchError,
  readEffectivePermissionContext,
  type PermissionContextMiddlewareDeps,
} from "./middleware.js";

export {
  composeVerifiedRequestContext,
  readVerifiedRequestContext,
  requireVerifiedContext,
  requireVerifiedRequestContext,
  storeVerifiedRequestContext,
  VerifiedRequestContextRequiredError,
  type ComposeVerifiedRequestContextInput,
  type ComposeVerifiedRequestContextResult,
  type VerifiedIdentityInput,
  type VerifiedRequestContext,
} from "./verified-request-context.js";
