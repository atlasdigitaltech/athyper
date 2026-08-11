import type { Authorizer } from "@athyper/server-contract-auth";
import { authorizationManagementPermissions, authorizationMutationKinds, type AuthorizationManagementAudit, type AuthorizationManagementCommand, type AuthorizationManagementRepository, type AuthorizationManagementRepositoryProvider, type AuthorizationManagementResult, type AuthorizationManagementRolloutSelector, type AuthorizationManagementService, type AuthorizationMutationKind, type AuthorizationProofDecision, type AuthorizationProofInput, type AuthorizationShadowObservation, type AuthorizationWriterSwitchGate, type AuthorizationWriterSwitchState, type LegacyAuthorizationWriter, type VerifiedRequestContext } from "@athyper/server-contract-auth";

export function createAuthorizationManagementService(options: { readonly authorizer: Authorizer; readonly repositories: AuthorizationManagementRepositoryProvider; readonly legacyWriter: LegacyAuthorizationWriter; readonly rollout: AuthorizationManagementRolloutSelector; readonly writerGate: AuthorizationWriterSwitchGate; readonly audit: AuthorizationManagementAudit; readonly mutationsEnabled?: boolean }): AuthorizationManagementService {
  const mutationsEnabled = options.mutationsEnabled ?? false;
  return {
    async readStatus(context) {
      await requirePermission(options.authorizer, context, authorizationManagementPermissions.read);
      const selected = await options.rollout.select({ planeKey: context.planeKey, tenantId: context.tenantId, principalId: context.principalId, mutationKind: "role.create" });
      const writerSwitch = await options.writerGate.inspect(context.planeKey);
      if (selected.mode === "enforce") requireQualifiedWriterSwitch(writerSwitch);
      return { mode: selected.mode, rolloutRevision: selected.revision, mutationsEnabled, writerSwitch };
    },
    async execute(command) {
    const selected = await options.rollout.select({ planeKey: command.context.planeKey, tenantId: command.context.tenantId, principalId: command.context.principalId, mutationKind: command.kind });
    let writerSwitch: AuthorizationWriterSwitchState | undefined;
    try {
      await authorize(options.authorizer, command);
      if (!mutationsEnabled) throw coded("AUTHZ_MUTATIONS_DISABLED");
      validate(command);
      if (selected.mode === "legacy") {
        const receipt = await options.legacyWriter.execute(command);
        await evidence(options.audit, command, selected.mode, "legacy", "success");
        return { mode: selected.mode, writer: "legacy", rolloutRevision: selected.revision, receipt };
      }
      if (selected.mode === "shadow") {
        const receipt = await options.legacyWriter.execute(command);
        let shadow: AuthorizationShadowObservation;
        try { shadow = await exactRepository(options.repositories, command.context.planeKey).preview(command); } catch (error) { shadow = { accepted: false, normalizedHash: "unavailable", reason: code(error) }; }
        await evidence(options.audit, command, selected.mode, "legacy", "success");
        return { mode: selected.mode, writer: "legacy", rolloutRevision: selected.revision, receipt, shadow };
      }
      writerSwitch = await options.writerGate.inspect(command.context.planeKey);
      requireQualifiedWriterSwitch(writerSwitch);
      const repository = exactRepository(options.repositories, command.context.planeKey);
      const receipt = await repository.apply(command);
      await evidence(options.audit, command, selected.mode, "authorization-v2", "success", undefined, writerSwitch);
      return { mode: selected.mode, writer: "authorization-v2", rolloutRevision: selected.revision, receipt };
    } catch (error) {
      await evidence(options.audit, command, selected.mode, selected.mode === "enforce" ? "authorization-v2" : "legacy", "rejected", code(error), writerSwitch);
      throw error;
    }
  } };
}

export function evaluateAuthorizationProofs(input: AuthorizationProofInput): AuthorizationProofDecision {
  if (!input.tenantBoundaryPassed) return deny("tenant_boundary_failed");
  if (!input.identityActive) return deny("identity_inactive");
  if (!input.planeAdmissionActive) return deny("plane_admission_inactive");
  if (!input.operationCompatible) return deny("operation_plane_incompatible");
  if (!input.entitlementAvailable) return deny("entitlement_unavailable");
  if (!input.hardPolicyPassed) return deny("hard_policy_failed");
  if (input.explicitDeny) return deny("explicit_deny");
  if (!input.scopeContained) return deny("scope_not_contained");
  if (input.roleAllow) return { allowed: true, proof: "role" };
  if (input.delegationAllow) return { allowed: true, proof: "delegation" };
  if (input.recordAclAllow) return { allowed: true, proof: "record_acl" };
  if (input.overrideAllow) return { allowed: true, proof: "override" };
  return deny("no_complete_allow_path");
}

function validate(command: AuthorizationManagementCommand): void {
  if (!(authorizationMutationKinds as readonly string[]).includes(command.kind)) throw coded("AUTHZ_INVALID_COMMAND");
  if (!command.commandId.trim() || !command.idempotencyKey.trim()) throw coded("AUTHZ_INVALID_COMMAND");
  if (command.expectedVersion !== undefined && (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 1)) throw coded("AUTHZ_INVALID_EXPECTED_VERSION");
  const payload = command.payload;
  const bounded = command.kind === "delegation.create" || command.kind === "override.request";
  validateEffectiveWindow(command.effectiveFrom, command.effectiveUntil, bounded);
  if (command.kind === "delegation.create" && (required(payload, "delegatorId") === required(payload, "delegateId"))) throw coded("AUTHZ_SELF_DELEGATION");
  if (command.kind === "delegation.create") required(payload, "reason");
  if (command.kind === "override.request") { required(payload, "principalId"); required(payload, "permissionId"); required(payload, "scopeTargetId"); required(payload, "reason"); required(payload, "approvalTicket"); }
  if (command.kind === "override.approve" && required(payload, "requestedBy") === command.context.principalId) throw coded("AUTHZ_APPROVER_SEPARATION_REQUIRED");
  if (command.kind === "acl.grant") { required(payload, "recordId"); required(payload, "resourceCode"); required(payload, "permissionId"); }
  if (command.kind === "deny.create") required(payload, "reason");
  if (command.kind === "scopeTarget.create" && payload["parentScopeTargetId"] === payload["id"]) throw coded("AUTHZ_SCOPE_CYCLE");
  if (command.kind === "trustedDevice.register") {
    const deviceTokenHash = required(payload, "deviceTokenHash");
    if (!/^[a-f0-9]{64}$/.test(deviceTokenHash)) throw coded("AUTHZ_INVALID_DEVICE_TOKEN_HASH");
    const expiresAt = Date.parse(required(payload, "expiresAt"));
    if (!Number.isFinite(expiresAt)) throw coded("AUTHZ_INVALID_EFFECTIVE_WINDOW");
  }
}

async function authorize(authorizer: Authorizer, command: AuthorizationManagementCommand): Promise<void> { const permissionCode = permission(command.kind); if (!(await authorizer.authorize({ context: command.context, permissionCode })).allowed) throw coded("AUTHZ_MANAGEMENT_PERMISSION_DENIED"); }
async function requirePermission(authorizer: Authorizer, context: VerifiedRequestContext, permissionCode: string): Promise<void> { if (!(await authorizer.authorize({ context, permissionCode })).allowed) throw coded("AUTHZ_MANAGEMENT_PERMISSION_DENIED"); }
export function authorizationManagementPermissionFor(kind: AuthorizationMutationKind): string { if (kind === "override.request") return authorizationManagementPermissions.breakGlass; if (kind === "override.approve") return authorizationManagementPermissions.approve; if (kind.endsWith(".revoke") || kind.endsWith(".retire") || kind.endsWith(".suspend")) return authorizationManagementPermissions.revoke; return authorizationManagementPermissions.manage; }
function permission(kind: AuthorizationMutationKind): string { return authorizationManagementPermissionFor(kind); }
function exactRepository(provider: AuthorizationManagementRepositoryProvider, planeKey: AuthorizationManagementCommand["context"]["planeKey"]): AuthorizationManagementRepository { const repository = provider.forExactPlane(planeKey); if (!repository || repository.planeKey !== planeKey) throw coded("AUTHZ_EXACT_PLANE_REPOSITORY_REQUIRED"); return repository; }
function requireQualifiedWriterSwitch(state: AuthorizationWriterSwitchState): void { if (!state.approved || !state.targetWritable || !state.goldenEvaluatorCorpusQualified || !state.ddlEpochIntegrationQualified || !nonEmpty(state.sourceWatermark) || state.sourceWatermark !== state.appliedWatermark || !isSha256(state.goldenCorpusSha256) || !state.approvedBy.some(nonEmpty) || !nonEmpty(state.approvalTicket)) throw coded("AUTHZ_WRITER_SWITCH_NOT_APPROVED"); }
async function evidence(audit: AuthorizationManagementAudit, command: AuthorizationManagementCommand, mode: AuthorizationManagementResult["mode"], writer: AuthorizationManagementResult["writer"], outcome: "success" | "rejected", reason?: string, state?: AuthorizationWriterSwitchState): Promise<void> { await audit.record({ tenantId: command.context.tenantId, principalId: command.context.principalId, planeKey: command.context.planeKey, requestId: command.context.requestId, ...(command.context.correlationId ? { correlationId: command.context.correlationId } : {}), commandId: command.commandId, mutationKind: command.kind, mode, writer, outcome, ...(reason ? { reason } : {}), ...(state ? { writerSwitchEvidence: { sourceWatermark: state.sourceWatermark, appliedWatermark: state.appliedWatermark, goldenCorpusSha256: state.goldenCorpusSha256, goldenEvaluatorCorpusQualified: state.goldenEvaluatorCorpusQualified, ddlEpochIntegrationQualified: state.ddlEpochIntegrationQualified, approvalTicket: state.approvalTicket, approvedBy: state.approvedBy } } : {}) }); }
function required(payload: Readonly<Record<string, unknown>>, field: string): string { const value = payload[field]; if (typeof value !== "string" || !value.trim()) throw coded("AUTHZ_INVALID_COMMAND"); return value; }
function validateEffectiveWindow(effectiveFrom: string | undefined, effectiveUntil: string | undefined, requiredWindow: boolean): void {
  if (!effectiveFrom && !effectiveUntil && !requiredWindow) return;
  if (!effectiveFrom || !effectiveUntil) throw coded("AUTHZ_INVALID_EFFECTIVE_WINDOW");
  const from = Date.parse(effectiveFrom);
  const until = Date.parse(effectiveUntil);
  if (!Number.isFinite(from) || !Number.isFinite(until) || until <= from) throw coded("AUTHZ_INVALID_EFFECTIVE_WINDOW");
}
function nonEmpty(value: string | null): value is string { return typeof value === "string" && value.trim().length > 0; }
function isSha256(value: string | null): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
function deny(reason: string): AuthorizationProofDecision { return { allowed: false, reason }; }
function code(error: unknown): string { return typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : error instanceof Error ? error.message : "AUTHZ_UNKNOWN_ERROR"; }
function coded(value: string): Error { return Object.assign(new Error(value), { code: value }); }
