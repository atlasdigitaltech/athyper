export { registerIamRoutes, type IamRoutesDeps } from "./routes/index.js";
export { createIamOutboxWorker, type IamOutboxWorkerDeps, type OutboxWorkerCache } from "./outbox/iam-outbox-worker.js";
export { type CacheClient, type CacheMetrics } from "./session/session.service.js";
export {
  createStepUpBinding,
  createStepUpService,
  hasFreshKeycloakStepUpAssurance,
  requireStepUp,
  type ActionClass,
  type StepUpBinding,
  type StepUpService,
} from "./mfa/step-up.service.js";
export {
  AtlasSupportSessionService,
} from "./support/atlas-support-session.service.js";
export { SqlAtlasSupportSessionRepository } from "./support/sql-atlas-support-session.repository.js";
export {
  createAtlasSupportSessionRoutes,
  type AtlasSupportSessionRoutesDependencies,
} from "./support/atlas-support-session.routes.js";
export {
  ATLAS_SUPPORT_SESSION_PERMISSION,
  ATLAS_SUPPORT_SESSION_TOKEN_VERSION,
  AtlasSupportSessionError,
} from "./support/atlas-support-session.types.js";
export type {
  AtlasSupportAuditEntry,
  AtlasSupportAuditEvent,
  AtlasSupportAuthEpochRevalidator,
  AtlasSupportScope,
  AtlasSupportSessionRecord,
  AtlasSupportSessionRepository,
  AtlasSupportSessionServiceDependencies,
  AtlasSupportShadowPrincipal,
  AtlasSupportThreadFactory,
  StartedAtlasSupportSession,
  StartAtlasSupportSessionRequest,
  VerifiedAtlasSupportSession,
  VerifyAtlasSupportSessionRequest,
} from "./support/atlas-support-session.types.js";
export { checkPermission, checkPermissionBatch, requireAllow } from "./permission/permission.service.js";
export { getEffectiveModuleAccess, type EffectiveModuleAccess } from "./permission/module-access.service.js";
export { createCompanyCodeScopeService, type CompanyCodeAccess, type ScopeResolutionResult } from "./permission/company-code-scope.service.js";
export { resolveParameterSnapshot, getIntParam, getStringParam, type ParameterSnapshot } from "./parameters/parameter-resolver.service.js";
export { jitProvisionPrincipal, type JitPrincipalInput, type JitPrincipalResult } from "./jit/jit.service.js";
export {
  buildEffectivePermissionContext,
  computePersonaFingerprint,
  computeProfileHash,
  computeSchemaHash,
  createAdminResolver,
  createMeshResolver,
  createNeonResolver,
  createPermissionContextMiddleware,
  createPermissionResolverRegistry,
  composeVerifiedRequestContext,
  EffectivePermissionContextMismatchError,
  ensureEffectivePermissionContext,
  isPlaneKey,
  readEffectivePermissionContext,
  readVerifiedRequestContext,
  requireVerifiedContext,
  requireVerifiedRequestContext,
  storeVerifiedRequestContext,
  VerifiedRequestContextRequiredError,
  loadPermissionAliasMap,
  loadPlaneEligiblePermissions,
  PLANE_KEYS,
  type AdminResolverDeps,
  type CreateResolverRegistryDeps,
  type EffectiveGrantStatus,
  type EffectivePermissionContext,
  type EffectivePermissionEntry,
  type MeshResolverDeps,
  type NeonResolverDeps,
  type PermissionContextMiddlewareDeps,
  type PermissionResolver,
  type PermissionResolverRegistry,
  type PlaneKey,
  type ResolverInput,
  type VerifiedRequestContext,
} from "./permission-context/index.js";
