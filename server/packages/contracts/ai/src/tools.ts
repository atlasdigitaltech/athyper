import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { AtlasRecordDataGateway, AtlasRecordSourceCoordinate } from "./records.js";

export type AtlasToolAccess = "read" | "mutation";
export type AtlasToolRisk = "low" | "medium" | "high" | "critical";
export type AtlasToolInvocationStatus = "proposed" | "confirmed" | "executing" | "completed" | "denied" | "failed" | "expired" | "cancelled";
export type AtlasToolOperationClass = "read" | "mutate";
export type AtlasToolAutonomyDecision = "denied" | "suggest" | "assist" | "auto";

export interface AtlasToolManifest {
  readonly schema: "atlas-tool-manifest/1";
  readonly toolCode: string;
  readonly version: string;
  readonly displayName: string;
  readonly description: string;
  readonly access: AtlasToolAccess;
  readonly risk: AtlasToolRisk;
  readonly allowedPlanes: readonly VerifiedRequestContext["planeKey"][];
  readonly requiredPermissions: readonly string[];
  readonly featureKey: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly resultSchema: Readonly<Record<string, unknown>>;
  readonly timeoutMs: number;
  readonly maxResultBytes: number;
  readonly commandBinding?: string;
  readonly confirmation: "none" | "explicit_user";
}

export interface AtlasToolSourceEvidence { readonly coordinate: AtlasRecordSourceCoordinate }
export interface AtlasToolPreview {
  readonly proposalId: string;
  readonly threadId: string;
  readonly runId: string;
  readonly callId: string;
  readonly toolCode: string;
  readonly toolVersion: string;
  /** Lowercase SHA-256 of canonical validated arguments. Raw arguments are never persisted. */
  readonly argumentHash: string;
  readonly summary: string;
  readonly access: AtlasToolAccess;
  readonly risk: AtlasToolRisk;
  readonly autonomyDecision: AtlasToolAutonomyDecision;
  readonly affectedEntityType?: string;
  readonly affectedEntityId?: string;
  readonly expectedRowVersion?: number;
  readonly policyRevision: string;
  readonly profileRevision: string;
  readonly authorizationProfileHash: string;
  readonly authorizationEpoch: number;
  readonly expiresAt?: string;
  readonly confirmationRequired: boolean;
  /** One-time bearer value returned to the caller and deliberately omitted from the ledger row. */
  readonly confirmationToken?: string;
  readonly status: AtlasToolInvocationStatus;
  readonly replayed: boolean;
}

/** Content-free audit projection. Tokens, raw arguments, and policy snapshots are never returned. */
export interface AtlasToolAuditEntry {
  readonly proposalId: string;
  readonly threadId: string;
  readonly runId: string;
  readonly toolCode: string;
  readonly toolVersion: string;
  readonly summary: string;
  readonly access: AtlasToolAccess;
  readonly risk: AtlasToolRisk;
  readonly autonomyDecision: AtlasToolAutonomyDecision;
  readonly affectedEntityType?: string;
  readonly affectedEntityId?: string;
  readonly expectedRowVersion?: number;
  readonly policyRevision: string;
  readonly profileRevision: string;
  readonly authorizationEpoch: number;
  readonly confirmationRequired: boolean;
  readonly status: AtlasToolInvocationStatus;
  readonly createdAt: string;
  readonly confirmationAt?: string;
  readonly executingAt?: string;
  readonly terminalAt?: string;
  readonly durationMs?: number;
  readonly terminalErrorClass?: string;
  readonly businessTransactionId?: string;
  readonly businessTransactionType?: string;
  readonly evidenceRefs: readonly Readonly<Record<string, unknown>>[];
}

export interface AtlasToolRunResult {
  readonly proposalId: string;
  readonly outcome: "completed" | "denied" | "failed" | "cancelled";
  readonly replayed?: boolean;
  readonly data?: unknown;
  readonly sources: readonly AtlasToolSourceEvidence[];
  readonly commandId?: string;
  readonly resultRevision?: string;
}

export interface AtlasReadToolHandlerContext { readonly context: VerifiedRequestContext; readonly records: AtlasRecordDataGateway; readonly signal: AbortSignal }
export interface AtlasReadToolHandler { execute(input: { readonly context: AtlasReadToolHandlerContext; readonly arguments: Readonly<Record<string, unknown>> }): Promise<{ readonly data: unknown; readonly sources: readonly AtlasToolSourceEvidence[] }> }
export interface AtlasRegisteredTool {
  readonly manifest: AtlasToolManifest;
  readonly readHandler?: AtlasReadToolHandler;
  /** Code-owned validation runs before preview persistence and again before execution. */
  readonly validateArguments?: (argumentsValue: Readonly<Record<string, unknown>>, target: {
    readonly affectedEntityType?: string;
    readonly affectedEntityId?: string;
    readonly expectedRowVersion?: number;
  }) => void;
}

export interface AtlasToolPolicyDecision {
  readonly allowed: boolean;
  readonly policyRevision: string;
  readonly profileRevision?: string;
  readonly autonomyDecision?: AtlasToolAutonomyDecision;
  readonly reasonCode?: string;
  readonly permissionSnapshot?: Readonly<Record<string, unknown>>;
  readonly policySnapshot?: Readonly<Record<string, unknown>>;
  readonly profileSnapshot?: Readonly<Record<string, unknown>>;
}
export interface AtlasToolAuthority {
  authorize(input: { readonly context: VerifiedRequestContext; readonly manifest: AtlasToolManifest; readonly phase: "preview" | "execute" }): Promise<AtlasToolPolicyDecision>;
}
export interface AtlasConfirmationVerifier {
  issue?(input: { readonly context: VerifiedRequestContext; readonly proposalId: string; readonly expiresAt: string }): Promise<string>;
  verify(input: { readonly context: VerifiedRequestContext; readonly proposal: AtlasToolProposal; readonly confirmationToken: string }): Promise<boolean>;
}
export interface AtlasDomainCommandBus {
  execute(input: { readonly context: VerifiedRequestContext; readonly commandBinding: string; readonly arguments: Readonly<Record<string, unknown>>; readonly idempotencyKey: string; readonly expectedRowVersion: number }): Promise<{ readonly commandId: string; readonly revision: string; readonly data?: unknown }>;
}

/** Content-free durable representation of an invocation. */
export interface AtlasToolProposal extends Omit<AtlasToolPreview, "confirmationToken" | "replayed"> {
  readonly tenantId: string;
  readonly planeKey: VerifiedRequestContext["planeKey"];
  readonly principalId: string;
  readonly actionCode: string;
  readonly operationClass: AtlasToolOperationClass;
  readonly permissionSnapshot: Readonly<Record<string, unknown>>;
  readonly policySnapshot: Readonly<Record<string, unknown>>;
  readonly profileSnapshot: Readonly<Record<string, unknown>>;
  readonly confirmationTokenHash?: string;
  readonly createdAt: string;
  readonly confirmationAt?: string;
  readonly executingAt?: string;
  readonly terminalAt?: string;
  readonly durationMs?: number;
  readonly executionAuthEpoch?: number;
  readonly executionPolicyRevision?: string;
  readonly downstreamIdempotencyKey?: string;
  readonly terminalErrorClass?: string;
  readonly resultHash?: string;
  readonly businessTransactionId?: string;
  readonly businessTransactionType?: string;
  readonly evidenceRefs: readonly Readonly<Record<string, unknown>>[];
}

export type AtlasToolStoreResult = { readonly kind: "created" | "transitioned"; readonly proposal: AtlasToolProposal } | { readonly kind: "replayed"; readonly proposal: AtlasToolProposal } | { readonly kind: "conflict"; readonly proposal: AtlasToolProposal | null };

export interface AtlasToolProposalStore {
  propose(input: { readonly context: VerifiedRequestContext; readonly proposal: AtlasToolProposal }): Promise<AtlasToolStoreResult>;
  get(input: { readonly context: VerifiedRequestContext; readonly proposalId: string }): Promise<AtlasToolProposal | null>;
  list(input: { readonly context: VerifiedRequestContext; readonly limit: number }): Promise<readonly AtlasToolProposal[]>;
  confirm(input: { readonly context: VerifiedRequestContext; readonly proposalId: string; readonly tokenHash: string; readonly confirmedAt: string }): Promise<AtlasToolStoreResult>;
  beginExecution(input: { readonly context: VerifiedRequestContext; readonly proposalId: string; readonly expectedStatus: "proposed" | "confirmed"; readonly executionGuard: Readonly<Record<string, unknown>>; readonly authorizationEpoch: number; readonly policyRevision: string; readonly downstreamIdempotencyKey?: string; readonly executingAt: string }): Promise<AtlasToolStoreResult>;
  complete(input: { readonly context: VerifiedRequestContext; readonly proposalId: string; readonly resultHash: string; readonly evidenceRefs?: readonly Readonly<Record<string, unknown>>[]; readonly businessTransactionId?: string; readonly businessTransactionType?: string; readonly terminalAt: string; readonly durationMs: number }): Promise<AtlasToolStoreResult>;
  fail(input: AtlasToolTerminalFailureInput): Promise<AtlasToolStoreResult>;
  deny(input: AtlasToolTerminalFailureInput): Promise<AtlasToolStoreResult>;
  expire(input: AtlasToolTerminalFailureInput): Promise<AtlasToolStoreResult>;
  cancel(input: AtlasToolTerminalFailureInput): Promise<AtlasToolStoreResult>;
  health(): Promise<{ readonly healthy: boolean; readonly message?: string }>;
}

export interface AtlasToolTerminalFailureInput {
  readonly context: VerifiedRequestContext;
  readonly proposalId: string;
  readonly expectedStatuses: readonly ("proposed" | "confirmed" | "executing")[];
  readonly errorClass: string;
  readonly terminalAt: string;
  readonly durationMs: number;
}
