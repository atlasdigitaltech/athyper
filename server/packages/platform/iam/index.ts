export { registerIamRoutes, type IamRoutesDeps } from "./routes/index.js";
export { createIamOutboxWorker, type IamOutboxWorkerDeps, type OutboxWorkerCache } from "./outbox/iam-outbox-worker.js";
export { type CacheClient, type CacheMetrics } from "./session/session.service.js";
export {
  createStepUpBinding,
  createStepUpService,
  hasFreshKeycloakStepUpAssurance,
  isDeviceTrusted,
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
export {
  hasCompanyCodeAccess,
  resolveCompanyCodeScope,
  type ScopeResolutionResult,
} from "./permission/company-code-scope.service.js";
export { resolveParameterSnapshot, getIntParam, getStringParam, type ParameterSnapshot } from "./parameters/parameter-resolver.service.js";
export { jitProvisionPrincipal, type JitPrincipalInput, type JitPrincipalResult } from "./jit/jit.service.js";
export {
  AuthorizationDecisionRouter,
  AuthorizationV2EnforcementError,
  type AuthorizationDecisionEvaluators,
  type AuthorizationDecisionRouterDeps,
  type AuthorizationShadowComparison,
  type AuthorizationShadowComparisonStatus,
} from "./authorization-rollout/authorization-decision-router.js";
export {
  AuthorizationRolloutPolicyValidationError,
  parseAuthorizationRolloutSnapshot,
  selectAuthorizationRollout,
  type AuthorizationRolloutPolicyValidationCode,
} from "./authorization-rollout/authorization-rollout.policy.js";
export {
  AuthorizationRolloutService,
  type AuthorizationRolloutServiceDeps,
} from "./authorization-rollout/authorization-rollout.service.js";
export {
  AUTHORIZATION_MISMATCH_CLASSES,
  AUTHORIZATION_SHADOW_ACTION_CLASSES,
  AUTHORIZATION_SHADOW_CONSUMER_PATHS,
  AuthorizationShadowComparisonService,
  classifyMismatch,
  computeAuthorizationImmutableContextSha256,
  decisionsEqual,
  isDeterministicallySampled,
  mustCompare,
  normalizeDecision,
  type AuthorizationComparableDecision,
  type AuthorizationImmutableShadowInput,
  type AuthorizationMismatchClass,
  type AuthorizationNormalizedScope,
  type AuthorizationShadowActionClass,
  type AuthorizationShadowComparisonRecord,
  type AuthorizationShadowComparisonServiceDeps,
  type AuthorizationShadowComparisonSink,
  type AuthorizationShadowConsumerPath,
  type AuthorizationShadowDecision,
  type AuthorizationShadowEvaluators,
  type AuthorizationTypedScopeKind,
} from "./authorization-rollout/authorization-shadow-comparison.js";
export {
  evaluateAuthorizationCutoverGate,
  type AuthorizationCutoverGateInput,
  type AuthorizationCutoverGateResult,
  type AuthorizationCutoverTransition,
  type AuthorizationRollbackProjectionStatus,
} from "./authorization-rollout/authorization-cutover-gates.js";
export {
  AUTHORIZATION_ROLLOUT_AUTHORITY_BY_PLANE,
  AUTHORIZATION_ROLLOUT_MODES,
  AUTHORIZATION_ROLLOUT_PLANES,
  type AuthorizationRolloutApproval,
  type AuthorizationRolloutAuthority,
  type AuthorizationRolloutContext,
  type AuthorizationRolloutMode,
  type AuthorizationRolloutPlane,
  type AuthorizationRolloutPolicyProvider,
  type AuthorizationRolloutRule,
  type AuthorizationRolloutSelection,
  type AuthorizationRolloutSelectionOptions,
  type AuthorizationRolloutSelectionReason,
  type AuthorizationRolloutSnapshot,
} from "./authorization-rollout/authorization-rollout.types.js";
export {
  buildEffectivePermissionContext,
  createCanonicalResolver,
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
  type CanonicalResolverDeps,
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
export * from "./authorization-evaluator/index.js";
export * from "./authorization-runtime/index.js";
export {
  PlaneDatabaseRegistry,
  createPlaneDatabaseRegistry,
  type DatabasePlane,
  type PlaneDatabaseBinding,
  type PlaneDatabaseRegistryInput,
  type RuntimeDatabase,
  type RuntimePlaneKey,
} from "./runtime/plane-database-registry.js";
export {
  SqlIdentityAdmissionRepository,
  tenantIdsFromOrganizationAliases,
  type AdmittedIdentity,
  type IdentityAdmissionRepository,
  type IdentityCoordinate,
} from "./identity/identity-admission.repository.js";
export { LegacySqlIdentityAdmissionRepository } from "./identity/legacy-identity-admission.repository.js";
export {
  createIdentityAdmissionCutoverRepository,
  identityCutoverMode,
  type IdentityCutoverMode,
  type IdentityShadowRecord,
  type IdentityShadowSink,
} from "./identity/identity-admission-cutover.js";
export { SqlIdentityShadowSink } from "./identity/sql-identity-shadow-sink.js";
export { CutoverReconciliationService, type PlaneCutoverEvidence } from "./identity/cutover-reconciliation.service.js";
export * from "./session/session-cutover.js";
export { SqlSessionShadowSink } from "./session/sql-session-shadow-sink.js";
export { PlaneIdentityProvisioningRepository, type IdentityProvisioningRepository } from "./jit/identity-provisioning.repository.js";
