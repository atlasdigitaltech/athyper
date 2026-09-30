export type GovernanceChannel = "email" | "sms" | "whatsapp" | "push";
export * from "./cycle-config.js";
export * from "./cycle-execution.js";
export * from "./compliance.js";
export type GovernanceSubjectType = "principal" | "person" | "contact_person" | "business_partner";

export const governanceErrorCodes = [
  "GOVERNANCE_INVALID_COMMAND",
  "GOVERNANCE_IDEMPOTENCY_CONFLICT",
  "GOVERNANCE_EXPECTED_VERSION_CONFLICT",
  "GOVERNANCE_INVALID_TRANSITION",
  "GOVERNANCE_PERMISSION_DENIED",
  "GOVERNANCE_NOT_FOUND",
] as const;
export type GovernanceErrorCode = (typeof governanceErrorCodes)[number];

export interface GovernancePageRequest { readonly limit?: number; readonly cursor?: string; }
export interface GovernancePage<T> { readonly items: readonly T[]; readonly nextCursor?: string; readonly hasMore: boolean; }
export type GovernanceCommandResult<T> =
  | { readonly kind: "applied"; readonly value: T }
  | { readonly kind: "replayed"; readonly value: T }
  | { readonly kind: "version_conflict"; readonly expectedVersion: number; readonly actualVersion: number };

export interface ChannelConsentCoordinate {
  readonly tenantId: string;
  readonly subjectType: GovernanceSubjectType;
  readonly subjectId: string;
  readonly channel: GovernanceChannel;
  readonly destinationHash?: string;
}
export interface ChannelConsentWrite extends ChannelConsentCoordinate {
  readonly consented: boolean;
  readonly effectiveAt: string;
  readonly expiresAt?: string;
  readonly eventId: string;
  readonly sourceCode: string;
  readonly evidence: Readonly<Record<string, unknown>>;
}
export interface ChannelConsentDecision extends ChannelConsentCoordinate {
  readonly consented: boolean;
  readonly effectiveAt: string;
  readonly expiresAt?: string;
}
export interface ChannelConsentEvent extends ChannelConsentCoordinate {
  readonly id: string;
  readonly action: "granted" | "revoked";
  readonly sourceCode: string;
  readonly occurredAt: string;
  readonly evidence: Readonly<Record<string, unknown>>;
  readonly actorPrincipalId?: string;
}
export interface ChannelConsentRepository<Transaction = unknown> {
  upsert(input: ChannelConsentWrite, transaction: Transaction): Promise<ChannelConsentDecision>;
  findAt(input: ChannelConsentCoordinate & { readonly at: string }, transaction: Transaction): Promise<ChannelConsentDecision | null>;
  history(input: ChannelConsentCoordinate & GovernancePageRequest & {readonly at?:string}, transaction: Transaction): Promise<GovernancePage<ChannelConsentEvent>>;
}

export interface OpenCommentModeration {
  readonly tenantId: string;
  readonly commentFlagId: string;
  readonly createdBy: string;
  readonly reviewerEvidence: Readonly<Record<string, unknown>>;
}
export type CommentModerationStatus = "open" | "reviewing" | "approved" | "rejected" | "removed";
export type CommentModerationDecision = "approved" | "rejected" | "removed";
export interface CommentModerationRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly commentFlagId: string;
  readonly status: CommentModerationStatus;
  readonly moderatorPrincipalId?: string;
  readonly decisionCode?: string;
  readonly reasonCode?: string;
  readonly decisionNote?: string;
  readonly reviewerEvidence: Readonly<Record<string, unknown>>;
}
export interface CommentModerationReceipt extends CommentModerationRecord { readonly replayed: boolean; }
export interface TransitionCommentModeration {
  readonly tenantId: string;
  readonly moderationId: string;
  readonly reviewerPrincipalId: string;
  readonly from: readonly CommentModerationStatus[];
  readonly to: CommentModerationStatus;
  readonly flagFrom: readonly ("open" | "reviewing")[];
  readonly flagStatus: "reviewing" | "resolved" | "dismissed";
  readonly decisionCode?: string;
  readonly reasonCode: string;
  readonly decisionNote?: string;
  readonly reviewerEvidence: Readonly<Record<string, unknown>>;
  readonly changedAt: string;
}
export interface CommentModerationRepository<Transaction = unknown> {
  createOrReplayOpen(input: OpenCommentModeration, transaction: Transaction): Promise<CommentModerationReceipt>;
  transition(input: TransitionCommentModeration, transaction: Transaction): Promise<CommentModerationRecord | null>;
  findById(tenantId: string, moderationId: string, transaction: Transaction): Promise<CommentModerationRecord | null>;
}

export interface GovernanceRepository<Transaction = unknown> {
  readonly consent: ChannelConsentRepository<Transaction>;
  readonly moderation: CommentModerationRepository<Transaction>;
}

export interface RecordChannelConsentCommand {
  readonly context: VerifiedRequestContext;
  readonly subjectType: GovernanceSubjectType;
  readonly subjectId: string;
  readonly channel: GovernanceChannel;
  readonly destination?: string;
  readonly consented: boolean;
  readonly effectiveAt?: string;
  readonly expiresAt?: string;
  readonly sourceCode: string;
  readonly evidence?: Readonly<Record<string, unknown>>;
}
export type RevokeChannelConsentCommand = Omit<RecordChannelConsentCommand, "consented" | "expiresAt">;
export interface CheckChannelConsentQuery {
  readonly planeKey: VerifiedRequestContext["planeKey"];
  readonly tenantId: string;
  readonly subjectType: GovernanceSubjectType;
  readonly subjectId: string;
  readonly channel: GovernanceChannel;
  readonly destination?: string;
  readonly at?: string;
}
export interface ChannelConsentHistoryQuery extends CheckChannelConsentQuery, GovernancePageRequest {}
export interface ChannelConsentService<Transaction = unknown> {
  record(command: RecordChannelConsentCommand): Promise<ChannelConsentDecision>;
  revoke(command: RevokeChannelConsentCommand): Promise<ChannelConsentDecision>;
  checkAt(query: CheckChannelConsentQuery, transaction?: Transaction): Promise<ChannelConsentDecision | null>;
  history(query: ChannelConsentHistoryQuery, transaction?: Transaction): Promise<GovernancePage<ChannelConsentEvent>>;
}

export interface OpenModerationCommand { readonly context: VerifiedRequestContext; readonly commentFlagId: string; readonly reviewerEvidence?: Readonly<Record<string, unknown>>; }
export interface ReviewModerationCommand { readonly context: VerifiedRequestContext; readonly moderationId: string; readonly reasonCode: string; readonly reviewerEvidence: Readonly<Record<string, unknown>>; }
export interface ResolveModerationCommand extends ReviewModerationCommand { readonly decision: CommentModerationDecision; readonly note?: string; }
export interface DismissModerationCommand extends ReviewModerationCommand { readonly note?: string; }
export interface ModerationService<Transaction = unknown> {
  open(command: OpenModerationCommand, transaction?: Transaction): Promise<CommentModerationReceipt>;
  review(command: ReviewModerationCommand): Promise<CommentModerationRecord>;
  resolve(command: ResolveModerationCommand): Promise<CommentModerationRecord>;
  dismiss(command: DismissModerationCommand): Promise<CommentModerationRecord>;
}

export const governancePermissions = {
  consentRead: "governance.consent.read",
  consentWrite: "governance.consent.write",
  moderationRead: "governance.moderation.read",
  moderationDecide: "governance.moderation.decide",
  cycleExecute: "governance.cycle.execute",
  cycleReview: "governance.cycle.review",
  cycleCertify: "governance.cycle.certify",
  legalHoldManage: "governance.legal_hold.manage",
  reportPackGenerate: "governance.report_pack.generate",
} as const;
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";

export * from "./process-selection.js";
