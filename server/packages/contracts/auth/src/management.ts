import type { PlaneKey } from "@athyper/server-foundation/context";
import type { VerifiedRequestContext } from "./authorization.js";

export type AuthorizationManagementMode = "legacy" | "shadow" | "enforce";
export const authorizationMutationKinds = [
  "role.create",
  "role.update",
  "role.activate",
  "role.suspend",
  "role.retire",
  "role.permission.assign",
  "role.permission.revoke",
  "group.create",
  "group.update",
  "group.activate",
  "group.suspend",
  "group.retire",
  "group.member.add",
  "group.member.revoke",
  "group.role.assign",
  "group.role.revoke",
  "deny.create",
  "deny.revoke",
  "delegation.create",
  "delegation.revoke",
  "delegation.grant.assign",
  "delegation.grant.revoke",
  "override.request",
  "override.approve",
  "override.revoke",
  "acl.grant",
  "acl.revoke",
  "trustedDevice.register",
  "trustedDevice.revoke",
  "scopeTarget.create",
  "scopeTarget.update",
  "scopeTarget.suspend",
  "scopeTarget.retire",
  "entityOperation.publish",
  "entityScopeBinding.publish",
] as const;
export type AuthorizationMutationKind =
  (typeof authorizationMutationKinds)[number];

export interface AuthorizationManagementCommand {
  readonly context: VerifiedRequestContext;
  readonly kind: AuthorizationMutationKind;
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly resourceId?: string;
  readonly expectedVersion?: number;
  readonly effectiveFrom?: string;
  readonly effectiveUntil?: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface AuthorizationMutationReceipt {
  readonly commandId: string;
  readonly resourceId: string;
  readonly version: number;
  readonly replayed: boolean;
}
export interface AuthorizationShadowObservation {
  readonly accepted: boolean;
  readonly normalizedHash: string;
  readonly reason?: string;
}
export interface AuthorizationManagementResult {
  readonly mode: AuthorizationManagementMode;
  readonly writer: "legacy" | "authorization-v2";
  readonly rolloutRevision: string;
  readonly receipt: AuthorizationMutationReceipt;
  readonly shadow?: AuthorizationShadowObservation;
}

/** Reads must be scoped to the verified tenant and plane. Writers must recheck
 * pending status and approver separation atomically when applying approval. */
export interface AuthorizationOverrideReader {
  /** Verify the complete command fingerprint before allowing an approval replay. */
  findReceipt?(
    command: AuthorizationManagementCommand,
  ): Promise<AuthorizationMutationReceipt | undefined>;
  readOverrideRequest?(
    context: VerifiedRequestContext,
    resourceId: string,
  ): Promise<
    { readonly requestedBy: string; readonly status: string } | undefined
  >;
}

export interface AuthorizationManagementRepository extends AuthorizationOverrideReader {
  readonly planeKey: PlaneKey;
  preview(
    command: AuthorizationManagementCommand,
  ): Promise<AuthorizationShadowObservation>;
  apply(
    command: AuthorizationManagementCommand,
  ): Promise<AuthorizationMutationReceipt>;
}
export interface AuthorizationWriterSwitchState {
  readonly approved: boolean;
  readonly targetWritable: boolean;
  readonly sourceWatermark: string | null;
  readonly appliedWatermark: string | null;
  readonly goldenCorpusSha256: string | null;
  readonly goldenEvaluatorCorpusQualified: boolean;
  readonly ddlEpochIntegrationQualified: boolean;
  readonly approvedBy: readonly string[];
  readonly approvalTicket: string | null;
}
export interface AuthorizationManagementRepositoryProvider {
  forExactPlane(
    planeKey: PlaneKey,
  ): AuthorizationManagementRepository | undefined;
}
export interface LegacyAuthorizationWriter extends AuthorizationOverrideReader {
  execute(
    command: AuthorizationManagementCommand,
  ): Promise<AuthorizationMutationReceipt>;
}
export interface AuthorizationManagementRolloutSelector {
  select(input: {
    readonly planeKey: PlaneKey;
    readonly tenantId: string;
    readonly principalId: string;
    readonly mutationKind: AuthorizationMutationKind;
  }): Promise<{
    readonly mode: AuthorizationManagementMode;
    readonly revision: string;
  }>;
}
export interface AuthorizationManagementRolloutPolicy {
  readonly planeKey: PlaneKey;
  readonly mode: AuthorizationManagementMode;
  readonly revision: string;
  readonly approved: boolean;
  readonly approvedAt?: string;
  readonly expiresAt?: string;
  readonly cohortPrincipalIds?: readonly string[];
}
export interface AuthorizationManagementRolloutPolicySource {
  loadExactPlane(
    planeKey: PlaneKey,
  ): Promise<AuthorizationManagementRolloutPolicy | undefined>;
}
export interface AuthorizationWriterSwitchGate {
  inspect(planeKey: PlaneKey): Promise<AuthorizationWriterSwitchState>;
}
export interface AuthorizationManagementAudit {
  record(input: {
    readonly tenantId: string;
    readonly principalId: string;
    readonly planeKey: PlaneKey;
    readonly requestId?: string;
    readonly correlationId?: string;
    readonly commandId: string;
    readonly mutationKind: AuthorizationMutationKind;
    readonly mode: AuthorizationManagementMode;
    readonly writer: "legacy" | "authorization-v2";
    readonly outcome: "success" | "rejected";
    readonly reason?: string;
    readonly writerSwitchEvidence?: Readonly<Record<string, unknown>>;
  }): Promise<void>;
}
export interface AuthorizationManagementStatus {
  readonly mode: AuthorizationManagementMode;
  readonly rolloutRevision: string;
  readonly mutationsEnabled: boolean;
  readonly writerSwitch: AuthorizationWriterSwitchState;
}
export interface AuthorizationManagementService {
  readStatus(
    context: VerifiedRequestContext,
  ): Promise<AuthorizationManagementStatus>;
  execute(
    command: AuthorizationManagementCommand,
  ): Promise<AuthorizationManagementResult>;
}

export const authorizationManagementPermissions = {
  read: "authorization.management.read",
  manage: "authorization.management.manage",
  approve: "authorization.management.approve",
  revoke: "authorization.management.revoke",
  breakGlass: "authorization.management.break_glass",
} as const;

export interface AuthorizationProofInput {
  readonly tenantBoundaryPassed: boolean;
  readonly identityActive: boolean;
  readonly planeAdmissionActive: boolean;
  readonly operationCompatible: boolean;
  readonly entitlementAvailable: boolean;
  readonly hardPolicyPassed: boolean;
  readonly explicitDeny: boolean;
  readonly scopeContained: boolean;
  readonly roleAllow: boolean;
  readonly delegationAllow: boolean;
  readonly recordAclAllow: boolean;
  readonly overrideAllow: boolean;
}
export type AuthorizationProofDecision =
  | {
      readonly allowed: true;
      readonly proof: "role" | "delegation" | "record_acl" | "override";
    }
  | { readonly allowed: false; readonly reason: string };

/** All ports must use the same database transaction. Commit only after work
 * succeeds; rollback effects, idempotency receipts, audit and outbox together.
 * Approval reads must lock the authoritative row until commit. Remote effects
 * must be represented by a transactional outbox, never performed inline. */
export interface AuthorizationManagementTransaction {
  readonly legacyWriter: LegacyAuthorizationWriter;
  readonly repositories: AuthorizationManagementRepositoryProvider;
  readonly audit: AuthorizationManagementAudit;
}
export interface AuthorizationManagementUnitOfWork {
  run<T>(
    context: VerifiedRequestContext,
    work: (ports: AuthorizationManagementTransaction) => Promise<T>,
  ): Promise<T>;
}
