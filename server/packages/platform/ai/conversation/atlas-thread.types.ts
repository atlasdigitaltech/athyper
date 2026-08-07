import type { VerifiedRequestContext } from "@athyper/svc-iam";

export type AtlasThreadPlane = "neon" | "mesh" | "admin";
export type AtlasThreadStatus = "active" | "archived" | "deleted";
export type AtlasMessageRole = "user" | "assistant" | "tool" | "system";
export type AtlasMessageStatus =
  | "pending"
  | "completed"
  | "failed"
  | "cancelled";
export type AtlasActiveRunStatus =
  | "started"
  | "completed"
  | "failed"
  | "cancelled";

/** JSON value accepted by the protected Atlas transcript store. */
export type AtlasStoredJson =
  | null
  | boolean
  | number
  | string
  | readonly AtlasStoredJson[]
  | { readonly [key: string]: AtlasStoredJson };

export interface AtlasStoredContentBlock {
  readonly type: string;
  readonly [key: string]: AtlasStoredJson;
}

export interface AtlasThreadRetention {
  readonly policyId: string;
  readonly expiresAt: Date | null;
  readonly purgeAfter: Date | null;
  readonly legalHold: boolean;
}

export interface AtlasThreadAccess {
  readonly participantRole: "owner" | "admin" | "member" | "observer";
  readonly owner: boolean;
}

export interface AtlasThreadRecord {
  readonly threadId: string;
  readonly tenantId: string;
  readonly plane: AtlasThreadPlane;
  readonly ownerPrincipalId: string;
  readonly title: string | null;
  readonly status: AtlasThreadStatus;
  readonly rowVersion: string;
  readonly lastMessageSequence: string;
  readonly retention: AtlasThreadRetention;
  readonly summaryVersion: number;
  readonly createdAt: Date;
  readonly updatedAt: Date | null;
  readonly access: AtlasThreadAccess;
}

export interface AtlasMessageRecord {
  readonly messageId: string;
  readonly threadId: string;
  readonly plane: AtlasThreadPlane;
  readonly sequence: string;
  readonly role: AtlasMessageRole;
  readonly status: AtlasMessageStatus;
  readonly contentBlocks: readonly AtlasStoredContentBlock[];
  readonly runId: string | null;
  readonly parentMessageId: string | null;
  readonly resultCards: readonly AtlasStoredJson[];
  readonly citationRefs: readonly AtlasStoredJson[];
  readonly toolRefs: readonly AtlasStoredJson[];
  readonly terminalErrorClass: string | null;
  readonly createdAt: Date;
  readonly terminalAt: Date | null;
}

export interface AtlasRunRecord {
  readonly runId: string;
  readonly threadId: string;
  readonly plane: AtlasThreadPlane;
  readonly principalId: string;
  readonly clientRequestId: string;
  readonly inputMessageId: string;
  readonly outputMessageId: string;
  readonly status: AtlasActiveRunStatus;
  readonly cancellationRequestedAt: Date | null;
  readonly terminalAt: Date | null;
  readonly terminalErrorClass: string | null;
  readonly meteringRunId: string | null;
  readonly startedAt: Date;
}

export interface AtlasThreadCursor {
  readonly activityAt: Date;
  readonly threadId: string;
}

export interface AtlasMessageCursor {
  /** Fetch messages whose sequence is strictly below this value. */
  readonly beforeSequence: string;
}

export interface AtlasPage<T, Cursor> {
  readonly items: readonly T[];
  readonly nextCursor: Cursor | null;
}

export interface AtlasThreadRepositoryScope {
  readonly tenantId: string;
  readonly principalId: string;
  readonly plane: AtlasThreadPlane;
}

export interface CreateAtlasThreadRecordInput {
  readonly threadId: string;
  readonly title: string | null;
  readonly retentionPolicyId: string;
  readonly expiresAt: Date | null;
}

export interface ListAtlasThreadsInput {
  readonly status: "active" | "archived" | "all";
  readonly limit: number;
  readonly cursor: AtlasThreadCursor | null;
}

export interface ListAtlasMessagesInput {
  readonly threadId: string;
  readonly limit: number;
  readonly cursor: AtlasMessageCursor | null;
}

export interface MutateAtlasThreadInput {
  readonly threadId: string;
  readonly expectedRowVersion: string;
}

export interface BeginAtlasRunInput {
  readonly threadId: string;
  readonly runId: string;
  readonly clientRequestId: string;
  readonly inputMessageId: string;
  readonly outputMessageId: string;
  readonly inputContentBlocks: readonly AtlasStoredContentBlock[];
  readonly startedAt: Date;
  /**
   * A prior started run may be recovered only when its immutable started_at is
   * at or before this server-derived lease boundary. Clients never supply it.
   */
  readonly staleBefore: Date;
}

export interface CreateAtlasThreadAndBeginRunInput
  extends CreateAtlasThreadRecordInput, BeginAtlasRunInput {}

export interface BeginAtlasRunResult {
  readonly replayed: boolean;
  readonly recoveredStaleRun?: boolean;
  readonly run: AtlasRunRecord;
  readonly inputSequence: string;
  readonly outputSequence: string;
}

export interface CompleteAtlasRunInput {
  readonly runId: string;
  readonly outputContentBlocks: readonly AtlasStoredContentBlock[];
  readonly resultCards?: readonly AtlasStoredJson[];
  readonly citationRefs?: readonly AtlasStoredJson[];
  readonly toolRefs?: readonly AtlasStoredJson[];
  readonly meteringRunId?: string | null;
  readonly terminalAt: Date;
}

export interface FailAtlasRunInput {
  readonly runId: string;
  readonly terminalErrorClass: string;
  readonly terminalAt: Date;
}

export interface CancelAtlasRunInput {
  readonly runId: string;
  /**
   * Partial output is persisted only when the caller has explicitly selected
   * that policy. The foundation service passes an empty array by default.
   */
  readonly outputContentBlocks?: readonly AtlasStoredContentBlock[];
  readonly terminalAt: Date;
}

export interface PurgeAtlasThreadsResult {
  readonly expiredCount: number;
  readonly purgedCount: number;
}

/**
 * Cross-tenant scheduled maintenance is a separate authority from the
 * request-scoped repository. Its implementation must receive an approved
 * system/admin DB connection; callers cannot supply tenant, principal, or
 * plane selectors.
 */
export interface AtlasThreadMaintenanceAuthority {
  purgeEligible(input: {
    readonly asOf: Date;
    readonly batchSize: number;
  }): Promise<PurgeAtlasThreadsResult>;
}

/**
 * Plane-neutral persistence boundary. Every method except purge is scoped by
 * the same immutable VerifiedRequestContext enforced by the service.
 */
export interface AtlasThreadRepository {
  create(
    scope: AtlasThreadRepositoryScope,
    input: CreateAtlasThreadRecordInput,
  ): Promise<AtlasThreadRecord>;
  list(
    scope: AtlasThreadRepositoryScope,
    input: ListAtlasThreadsInput,
  ): Promise<AtlasPage<AtlasThreadRecord, AtlasThreadCursor>>;
  get(
    scope: AtlasThreadRepositoryScope,
    threadId: string,
  ): Promise<AtlasThreadRecord | null>;
  listMessages(
    scope: AtlasThreadRepositoryScope,
    input: ListAtlasMessagesInput,
  ): Promise<AtlasPage<AtlasMessageRecord, AtlasMessageCursor>>;
  rename(
    scope: AtlasThreadRepositoryScope,
    input: MutateAtlasThreadInput & { readonly title: string },
  ): Promise<AtlasThreadRecord | null>;
  archive(
    scope: AtlasThreadRepositoryScope,
    input: MutateAtlasThreadInput,
  ): Promise<AtlasThreadRecord | null>;
  softDelete(
    scope: AtlasThreadRepositoryScope,
    input: MutateAtlasThreadInput & { readonly deletedAt: Date },
  ): Promise<boolean>;
  /**
   * Atomic initial-run primitive. Implementations acquire a tenant/client
   * advisory lock, recheck idempotency under tenant/principal/plane RLS, then
   * either replay or create the thread, messages, and run in one transaction.
   */
  createThreadAndBeginRun(
    scope: AtlasThreadRepositoryScope,
    input: CreateAtlasThreadAndBeginRunInput,
  ): Promise<BeginAtlasRunResult>;
  beginRun(
    scope: AtlasThreadRepositoryScope,
    input: BeginAtlasRunInput,
  ): Promise<BeginAtlasRunResult>;
  completeRun(
    scope: AtlasThreadRepositoryScope,
    input: CompleteAtlasRunInput,
  ): Promise<AtlasRunRecord | null>;
  failRun(
    scope: AtlasThreadRepositoryScope,
    input: FailAtlasRunInput,
  ): Promise<AtlasRunRecord | null>;
  cancelRun(
    scope: AtlasThreadRepositoryScope,
    input: CancelAtlasRunInput,
  ): Promise<AtlasRunRecord | null>;
}

export interface AtlasThreadPlaneAuthorizationAdapter {
  canCreate(context: VerifiedRequestContext): boolean;
  canRead(context: VerifiedRequestContext, thread: AtlasThreadRecord): boolean;
  canManage(context: VerifiedRequestContext, thread: AtlasThreadRecord): boolean;
  canRun(context: VerifiedRequestContext, thread: AtlasThreadRecord): boolean;
}

export interface AtlasRetentionPolicy {
  readonly policyId: string;
  readonly retentionDays: number;
  readonly expiresAt: Date;
  /** Approved server-derived copy for the effective tenant policy. */
  readonly displayText: string;
}

export interface AtlasRetentionPolicyResolver {
  resolve(context: VerifiedRequestContext, now: Date): Promise<AtlasRetentionPolicy>;
}

/** A portable, chronological export. It deliberately excludes run metering,
 * internal result cards, citations, and tool traces. */
export interface AtlasThreadTranscript {
  readonly format: "atlas-thread-transcript/v1";
  readonly exportedAt: Date;
  readonly thread: AtlasThreadRecord;
  readonly messages: readonly Pick<
    AtlasMessageRecord,
    | "messageId"
    | "sequence"
    | "role"
    | "status"
    | "contentBlocks"
    | "createdAt"
    | "terminalAt"
  >[];
}

export type AtlasThreadRepositoryErrorCode =
  | "THREAD_NOT_FOUND"
  | "THREAD_NOT_ACTIVE"
  | "RUN_CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "RUN_NOT_FOUND"
  | "RUN_TERMINAL";

/** Safe, content-free repository outcome used by the service error mapper. */
export class AtlasThreadRepositoryError extends Error {
  override readonly name = "AtlasThreadRepositoryError";

  constructor(readonly code: AtlasThreadRepositoryErrorCode) {
    super(code);
  }
}
