import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import type { VerifiedRequestContext } from "@athyper/svc-iam";
import type { AnyDb } from "../ai-runtime.types.js";
import {
  AtlasThreadRepositoryError,
  type AtlasMessageCursor,
  type AtlasMessageRecord,
  type AtlasPage,
  type AtlasRetentionPolicyResolver,
  type AtlasRetentionPolicy,
  type AtlasRunRecord,
  type AtlasStoredContentBlock,
  type AtlasStoredJson,
  type AtlasThreadMaintenanceAuthority,
  type AtlasThreadCursor,
  type AtlasThreadPlane,
  type AtlasThreadPlaneAuthorizationAdapter,
  type AtlasThreadRecord,
  type AtlasThreadTranscript,
  type AtlasThreadRepository,
  type AtlasThreadRepositoryScope,
  type BeginAtlasRunResult,
  type PurgeAtlasThreadsResult,
} from "./atlas-thread.types.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POSITIVE_BIGINT_RE = /^[1-9][0-9]{0,18}$/;
const THREAD_READ_PERMISSION = "ai.agent.history.read";
const THREAD_MANAGE_PERMISSION = "ai.agent.history.manage";
const THREAD_DELETE_PERMISSION = "ai.agent.history.delete";
const THREAD_EXPORT_PERMISSION = "ai.agent.history.export";
const AGENT_USE_PERMISSION = "ai.agent.use";

export type AtlasThreadServiceErrorCode =
  | "INVALID_VERIFIED_CONTEXT"
  | "INVALID_ARGUMENT"
  | "PERMISSION_DENIED"
  | "THREAD_NOT_FOUND"
  | "THREAD_NOT_ACTIVE"
  | "OPTIMISTIC_CONFLICT"
  | "RUN_CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "RUN_NOT_FOUND"
  | "RUN_TERMINAL"
  | "LEGAL_HOLD";

export class AtlasThreadServiceError extends Error {
  override readonly name = "AtlasThreadServiceError";

  constructor(
    readonly code: AtlasThreadServiceErrorCode,
    readonly status: 400 | 403 | 404 | 409 | 423,
    message: string,
  ) {
    super(message);
  }
}

export interface AtlasThreadClock {
  now(): Date;
}

export interface AtlasThreadServiceOptions {
  repository: AtlasThreadRepository;
  retentionPolicies: AtlasRetentionPolicyResolver;
  authorizers: AtlasThreadPlaneAuthorizationRegistry;
  maintenanceAuthority?: AtlasThreadMaintenanceAuthority;
  clock?: AtlasThreadClock;
  purgeBatchSize: number;
  contextMaxMessages: number;
  contextMaxCharacters: number;
  /**
   * Maximum duration of a started run lease. This must exceed the configured
   * provider/runtime timeout; it has no request or client override.
   */
  staleRunTimeoutMs: number;
  /** A bounded export prevents a single request from becoming an unbounded
   * transcript exfiltration or memory operation. */
  exportMaxMessages?: number;
  /** Operational counters only; never pass content or tenant identifiers. */
  metrics?: {
    observeThreadOperation?: (operation: "create" | "read" | "list" | "purge", outcome: "success" | "denied" | "failed") => void;
    observePurge?: (result: PurgeAtlasThreadsResult) => void;
  };
}

export interface CreateAtlasThreadInput {
  readonly title?: string | null;
}

export interface AtlasThreadListRequest {
  readonly status?: "active" | "archived" | "all";
  readonly limit?: number;
  readonly cursor?: AtlasThreadCursor | null;
}

export interface AtlasMessageListRequest {
  readonly threadId: string;
  readonly limit?: number;
  readonly cursor?: AtlasMessageCursor | null;
}

export interface AtlasThreadMutationRequest {
  readonly threadId: string;
  readonly expectedRowVersion: string;
}

export interface BeginAtlasThreadRunRequest {
  readonly threadId: string;
  readonly runId?: string;
  readonly clientRequestId: string;
  readonly inputContentBlocks: readonly AtlasStoredContentBlock[];
}

export interface PrepareAtlasConversationRunRequest {
  readonly runId: string;
  readonly requestedThreadId?: string;
  readonly clientRequestId: string;
  readonly userMessage: string;
}

export interface AtlasAuthoritativeHistoryMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
}

export interface PreparedAtlasConversationRun {
  readonly runId: string;
  readonly threadId: string;
  readonly inputMessageId: string;
  readonly outputMessageId: string;
  readonly inputSequence: string;
  readonly outputSequence: string;
  readonly replayed: boolean;
  readonly recoveredStaleRun: boolean;
  readonly runStatus: AtlasRunRecord["status"];
  readonly authoritativeHistory: readonly AtlasAuthoritativeHistoryMessage[];
}

export interface FinalizeAtlasConversationRunRequest {
  readonly runId: string;
  readonly outcome: "completed" | "failed" | "cancelled";
  readonly assistantText?: string;
  readonly resultCards?: readonly AtlasStoredJson[];
  readonly safeErrorClass?: string;
  readonly meteringRunId?: string | null;
}

export interface CompleteAtlasThreadRunRequest {
  readonly runId: string;
  readonly outputContentBlocks: readonly AtlasStoredContentBlock[];
  readonly resultCards?: readonly AtlasStoredJson[];
  readonly citationRefs?: readonly AtlasStoredJson[];
  readonly toolRefs?: readonly AtlasStoredJson[];
  readonly meteringRunId?: string | null;
}

export interface FailAtlasThreadRunRequest {
  readonly runId: string;
  readonly terminalErrorClass: string;
}

export interface CancelAtlasThreadRunRequest {
  readonly runId: string;
  readonly persistPartialOutput?: boolean;
  readonly outputContentBlocks?: readonly AtlasStoredContentBlock[];
}

export interface FixedAtlasRetentionPolicyOptions {
  defaultRetentionDays: number;
  minimumRetentionDays: number;
  maximumRetentionDays: number;
}

/**
 * Server-derived retention profile. Callers never select retention in request
 * bodies, so a client cannot extend the configured tenant/platform lifetime.
 */
export class FixedAtlasRetentionPolicyResolver
implements AtlasRetentionPolicyResolver {
  private readonly days: number;

  constructor(options: FixedAtlasRetentionPolicyOptions) {
    const minimum = positiveInteger(
      options.minimumRetentionDays,
      "minimumRetentionDays",
      3_650,
    );
    const maximum = positiveInteger(
      options.maximumRetentionDays,
      "maximumRetentionDays",
      3_650,
    );
    const selected = positiveInteger(
      options.defaultRetentionDays,
      "defaultRetentionDays",
      3_650,
    );
    if (minimum > maximum || selected < minimum || selected > maximum) {
      throw new Error(
        "Atlas default retention must be within the configured minimum and maximum.",
      );
    }
    this.days = selected;
  }

  async resolve(
    _context: VerifiedRequestContext,
    now: Date,
  ): Promise<{
      policyId: string;
      retentionDays: number;
      expiresAt: Date;
      displayText: string;
    }> {
    const start = validDate(now, "now");
    const policyId = `atlas-default-${this.days}d-v1`;
    return Object.freeze({
      policyId,
      retentionDays: this.days,
      expiresAt: new Date(start.getTime() + this.days * 86_400_000),
      displayText: retentionPolicyDisplayText(policyId, this.days),
    });
  }
}

/**
 * Resolves an active tenant retention override, bounded by the platform
 * limits. An absent or malformed tenant override always falls back to the
 * platform default; it can never lengthen retention beyond that ceiling.
 */
export class SqlAtlasRetentionPolicyResolver
implements AtlasRetentionPolicyResolver {
  private readonly fallback: FixedAtlasRetentionPolicyResolver;
  private readonly minimumDays: number;
  private readonly maximumDays: number;

  constructor(
    private readonly db: AnyDb,
    options: FixedAtlasRetentionPolicyOptions,
  ) {
    this.fallback = new FixedAtlasRetentionPolicyResolver(options);
    this.minimumDays = options.minimumRetentionDays;
    this.maximumDays = options.maximumRetentionDays;
  }

  async resolve(
    context: VerifiedRequestContext,
    now: Date,
  ): Promise<{
    policyId: string;
    retentionDays: number;
    expiresAt: Date;
    displayText: string;
  }> {
    const fallback = await this.fallback.resolve(context, now);
    const result = await sql<{
      retention_days: number | string;
      revision: number | string;
    }>`
      SELECT retention_days, revision
      FROM ai.atlas_conversation_retention_policy
      WHERE tenant_id = ${context.tenantId}::uuid
        AND status = 'active'
        AND effective_from <= ${now}
        AND (effective_to IS NULL OR effective_to > ${now})
      ORDER BY revision DESC
      LIMIT 1
    `.execute(this.db);
    const row = result.rows[0];
    if (!row) return fallback;
    const days = Number(row.retention_days);
    const revision = Number(row.revision);
    if (
      !Number.isSafeInteger(days)
      || days < 1
      || days < this.minimumDays
      || days > this.maximumDays
      || !Number.isSafeInteger(revision)
      || revision < 1
    ) return fallback;
    const policyId =
      `atlas-tenant-${context.tenantId}-r${revision}-${days}d-v1`;
    return Object.freeze({
      policyId,
      retentionDays: days,
      expiresAt: new Date(now.getTime() + days * 86_400_000),
      displayText: retentionPolicyDisplayText(policyId, days),
    });
  }

}

export class AtlasThreadPlaneAuthorizationRegistry {
  constructor(
    private readonly adapters: Readonly<
      Record<AtlasThreadPlane, AtlasThreadPlaneAuthorizationAdapter>
    >,
  ) {}

  resolve(plane: AtlasThreadPlane): AtlasThreadPlaneAuthorizationAdapter {
    const adapter = this.adapters[plane];
    if (!adapter) {
      throw new AtlasThreadServiceError(
        "PERMISSION_DENIED",
        403,
        "Atlas thread authorization is unavailable for this plane.",
      );
    }
    return adapter;
  }
}

/**
 * Current private-history policy shared by each plane. It is registered per
 * plane deliberately so Mesh/Admin can later add scoped participants without
 * weakening Neon or changing the repository contract.
 */
export class PrincipalPrivateAtlasThreadAuthorizer
implements AtlasThreadPlaneAuthorizationAdapter {
  canCreate(_context: VerifiedRequestContext): boolean {
    return true;
  }

  canRead(
    context: VerifiedRequestContext,
    thread: AtlasThreadRecord,
  ): boolean {
    return sameBoundary(context, thread)
      && (thread.access.owner || Boolean(thread.access.participantRole));
  }

  canManage(
    context: VerifiedRequestContext,
    thread: AtlasThreadRecord,
  ): boolean {
    return sameBoundary(context, thread) && thread.access.owner;
  }

  canRun(
    context: VerifiedRequestContext,
    thread: AtlasThreadRecord,
  ): boolean {
    return this.canManage(context, thread) && thread.status === "active";
  }
}

export function createPrincipalPrivateAtlasThreadAuthorizers():
AtlasThreadPlaneAuthorizationRegistry {
  const neon = new PrincipalPrivateAtlasThreadAuthorizer();
  const mesh = new PrincipalPrivateAtlasThreadAuthorizer();
  const admin = new PrincipalPrivateAtlasThreadAuthorizer();
  return new AtlasThreadPlaneAuthorizationRegistry({ neon, mesh, admin });
}

export class AtlasThreadService {
  private readonly clock: AtlasThreadClock;
  private readonly purgeBatchSize: number;
  private readonly contextMaxMessages: number;
  private readonly contextMaxCharacters: number;
  private readonly staleRunTimeoutMs: number;
  private readonly exportMaxMessages: number;

  constructor(private readonly options: AtlasThreadServiceOptions) {
    this.clock = options.clock ?? { now: () => new Date() };
    this.purgeBatchSize = positiveInteger(
      options.purgeBatchSize,
      "purgeBatchSize",
      1_000,
    );
    this.contextMaxMessages = positiveInteger(
      options.contextMaxMessages,
      "contextMaxMessages",
      200,
    );
    this.contextMaxCharacters = positiveInteger(
      options.contextMaxCharacters,
      "contextMaxCharacters",
      1_048_576,
    );
    this.staleRunTimeoutMs = integerInRange(
      options.staleRunTimeoutMs,
      "staleRunTimeoutMs",
      60_000,
      86_400_000,
    );
    this.exportMaxMessages = positiveInteger(
      options.exportMaxMessages ?? 10_000,
      "exportMaxMessages",
      10_000,
    );
  }

  async createThread(
    context: VerifiedRequestContext,
    input: CreateAtlasThreadInput = {},
  ): Promise<AtlasThreadRecord> {
    const scope = scopeFromContext(context, THREAD_READ_PERMISSION);
    const authorizer = this.options.authorizers.resolve(scope.plane);
    if (!authorizer.canCreate(context)) throw permissionDenied();
    return this.createOwnedThread(context, scope, input);
  }

  private async createOwnedThread(
    context: VerifiedRequestContext,
    scope: AtlasThreadRepositoryScope,
    input: CreateAtlasThreadInput = {},
  ): Promise<AtlasThreadRecord> {
    const now = validDate(this.clock.now(), "clock.now");
    const retention = await this.options.retentionPolicies.resolve(context, now);
    const created = await this.options.repository.create(scope, {
      threadId: randomUUID(),
      title: optionalTitle(input.title),
      retentionPolicyId: requiredText(
        retention.policyId,
        "retention.policyId",
        100,
      ),
      expiresAt: validDate(retention.expiresAt, "retention.expiresAt"),
    });
    const authorizer = this.options.authorizers.resolve(scope.plane);
    if (!authorizer.canRead(context, created)) {
      // This indicates a broken repository/authorization adapter contract.
      throw permissionDenied();
    }
    return created;
  }

  async listThreads(
    context: VerifiedRequestContext,
    request: AtlasThreadListRequest = {},
  ): Promise<AtlasPage<AtlasThreadRecord, AtlasThreadCursor>> {
    const scope = scopeFromContext(context, THREAD_READ_PERMISSION);
    const authorizer = this.options.authorizers.resolve(scope.plane);
    const page = await this.options.repository.list(scope, {
      status: request.status ?? "active",
      limit: pageLimit(request.limit),
      cursor: request.cursor ?? null,
    });
    // Repository SQL and RLS both scope membership; retain an adapter filter as
    // defense in depth and never refill from unauthorized rows.
    return Object.freeze({
      items: Object.freeze(
        page.items.filter((thread) => authorizer.canRead(context, thread)),
      ),
      nextCursor: page.nextCursor,
    });
  }

  async getEffectiveRetentionPolicy(
    context: VerifiedRequestContext,
  ): Promise<AtlasRetentionPolicy> {
    scopeFromContext(context, THREAD_READ_PERMISSION);
    const now = validDate(this.clock.now(), "clock.now");
    return this.options.retentionPolicies.resolve(context, now);
  }

  async getThread(
    context: VerifiedRequestContext,
    threadId: string,
  ): Promise<AtlasThreadRecord> {
    const scope = scopeFromContext(context, THREAD_READ_PERMISSION);
    return this.requireReadableThread(context, scope, requiredUuid(threadId, "threadId"));
  }

  async listMessages(
    context: VerifiedRequestContext,
    request: AtlasMessageListRequest,
  ): Promise<AtlasPage<AtlasMessageRecord, AtlasMessageCursor>> {
    const scope = scopeFromContext(context, THREAD_READ_PERMISSION);
    const threadId = requiredUuid(request.threadId, "threadId");
    await this.requireReadableThread(context, scope, threadId);
    return this.options.repository.listMessages(scope, {
      threadId,
      limit: pageLimit(request.limit),
      cursor: request.cursor ?? null,
    });
  }

  async exportTranscript(
    context: VerifiedRequestContext,
    threadId: string,
  ): Promise<AtlasThreadTranscript> {
    const scope = scopeFromContext(context, THREAD_EXPORT_PERMISSION);
    const thread = await this.requireReadableThread(
      context,
      scope,
      requiredUuid(threadId, "threadId"),
    );
    const messages: AtlasThreadTranscript["messages"][number][] = [];
    let cursor: AtlasMessageCursor | null = null;
    do {
      const page = await this.options.repository.listMessages(scope, {
        threadId: thread.threadId,
        limit: Math.min(100, this.exportMaxMessages - messages.length),
        cursor,
      });
      for (const message of page.items) {
        messages.push(Object.freeze({
          messageId: message.messageId,
          sequence: message.sequence,
          role: message.role,
          status: message.status,
          contentBlocks: message.contentBlocks,
          createdAt: message.createdAt,
          terminalAt: message.terminalAt,
        }));
      }
      cursor = page.nextCursor;
      if (messages.length >= this.exportMaxMessages && cursor) {
        throw new AtlasThreadServiceError(
          "INVALID_ARGUMENT",
          400,
          "The Atlas transcript exceeds the configured export limit.",
        );
      }
    } while (cursor);
    messages.sort((left, right) => BigInt(left.sequence) < BigInt(right.sequence) ? -1 : 1);
    return Object.freeze({
      format: "atlas-thread-transcript/v1",
      exportedAt: validDate(this.clock.now(), "clock.now"),
      thread,
      messages: Object.freeze(messages),
    });
  }

  async renameThread(
    context: VerifiedRequestContext,
    request: AtlasThreadMutationRequest & { readonly title: string },
  ): Promise<AtlasThreadRecord> {
    const scope = scopeFromContext(context, THREAD_MANAGE_PERMISSION);
    const thread = await this.requireManageableThread(
      context,
      scope,
      request.threadId,
      request.expectedRowVersion,
    );
    const updated = await this.options.repository.rename(scope, {
      threadId: thread.threadId,
      expectedRowVersion: thread.rowVersion,
      title: requiredText(request.title, "title", 200),
    });
    if (!updated) throw optimisticConflict();
    return updated;
  }

  async archiveThread(
    context: VerifiedRequestContext,
    request: AtlasThreadMutationRequest,
  ): Promise<AtlasThreadRecord> {
    const scope = scopeFromContext(context, THREAD_MANAGE_PERMISSION);
    const thread = await this.requireManageableThread(
      context,
      scope,
      request.threadId,
      request.expectedRowVersion,
    );
    if (thread.status !== "active") {
      throw new AtlasThreadServiceError(
        "THREAD_NOT_ACTIVE",
        409,
        "Only an active Atlas thread can be archived.",
      );
    }
    const updated = await this.options.repository.archive(scope, {
      threadId: thread.threadId,
      expectedRowVersion: thread.rowVersion,
    });
    if (!updated) throw optimisticConflict();
    return updated;
  }

  async deleteThread(
    context: VerifiedRequestContext,
    request: AtlasThreadMutationRequest,
  ): Promise<void> {
    const scope = scopeFromContext(context, THREAD_DELETE_PERMISSION);
    const thread = await this.requireManageableThread(
      context,
      scope,
      request.threadId,
      request.expectedRowVersion,
    );
    if (thread.retention.legalHold) {
      throw new AtlasThreadServiceError(
        "LEGAL_HOLD",
        423,
        "The Atlas thread is retained under legal hold.",
      );
    }
    const deleted = await this.options.repository.softDelete(scope, {
      threadId: thread.threadId,
      expectedRowVersion: thread.rowVersion,
      deletedAt: validDate(this.clock.now(), "clock.now"),
    });
    if (!deleted) throw optimisticConflict();
  }

  /**
   * Internal AgentRuntime primitive. No route exposes append or run creation.
   */
  async beginRun(
    context: VerifiedRequestContext,
    request: BeginAtlasThreadRunRequest,
  ): Promise<BeginAtlasRunResult> {
    const scope = scopeFromContext(context, AGENT_USE_PERMISSION);
    const threadId = requiredUuid(request.threadId, "threadId");
    const thread = await this.options.repository.get(scope, threadId);
    const authorizer = this.options.authorizers.resolve(scope.plane);
    if (!thread || !authorizer.canRun(context, thread)) {
      throw new AtlasThreadServiceError(
        "THREAD_NOT_FOUND",
        404,
        "The Atlas thread is unavailable.",
      );
    }
    const now = validDate(this.clock.now(), "clock.now");
    if (
      thread.retention.expiresAt
      && thread.retention.expiresAt.getTime() <= now.getTime()
    ) {
      throw new AtlasThreadServiceError(
        "THREAD_NOT_ACTIVE",
        409,
        "The Atlas thread retention period has ended.",
      );
    }
    try {
      return await this.options.repository.beginRun(scope, {
        threadId,
        runId: request.runId
          ? requiredUuid(request.runId, "runId")
          : randomUUID(),
        clientRequestId: requiredUuid(
          request.clientRequestId,
          "clientRequestId",
        ),
        inputMessageId: randomUUID(),
        outputMessageId: randomUUID(),
        inputContentBlocks: contentBlocks(request.inputContentBlocks),
        startedAt: now,
        staleBefore: new Date(now.getTime() - this.staleRunTimeoutMs),
      });
    } catch (error) {
      throw mapRepositoryError(error);
    }
  }

  /**
   * Runtime coordinator entrypoint. It creates a private thread when needed,
   * persists the user/pending-assistant/run tuple before returning, and loads
   * only server-authoritative completed history that precedes this input.
   */
  async prepareRun(
    context: VerifiedRequestContext,
    request: PrepareAtlasConversationRunRequest,
  ): Promise<PreparedAtlasConversationRun> {
    const scope = scopeFromContext(context, AGENT_USE_PERMISSION);
    const runId = requiredUuid(request.runId, "runId");
    const clientRequestId = requiredUuid(
      request.clientRequestId,
      "clientRequestId",
    );
    const userMessage = requiredText(request.userMessage, "userMessage", 12_000);
    let begun: BeginAtlasRunResult;
    if (!request.requestedThreadId) {
      const authorizer = this.options.authorizers.resolve(scope.plane);
      if (!authorizer.canCreate(context)) throw permissionDenied();
      const now = validDate(this.clock.now(), "clock.now");
      const retention = await this.options.retentionPolicies.resolve(
        context,
        now,
      );
      try {
        begun = await this.options.repository.createThreadAndBeginRun(scope, {
          threadId: randomUUID(),
          title: null,
          retentionPolicyId: requiredText(
            retention.policyId,
            "retention.policyId",
            100,
          ),
          expiresAt: validDate(retention.expiresAt, "retention.expiresAt"),
          runId,
          clientRequestId,
          inputMessageId: randomUUID(),
          outputMessageId: randomUUID(),
          inputContentBlocks: [{ type: "text", text: userMessage }],
          startedAt: now,
          staleBefore: new Date(now.getTime() - this.staleRunTimeoutMs),
        });
      } catch (error) {
        throw mapRepositoryError(error);
      }
    } else {
      const thread = await this.requireRunnableThread(
        context,
        scope,
        requiredUuid(request.requestedThreadId, "requestedThreadId"),
      );
      begun = await this.beginRun(context, {
        threadId: thread.threadId,
        runId,
        clientRequestId,
        inputContentBlocks: [{ type: "text", text: userMessage }],
      });
    }
    const history = await this.loadAuthoritativeHistory(
      scope,
      begun.run.threadId,
      begun.inputSequence,
    );
    return Object.freeze({
      runId: begun.run.runId,
      threadId: begun.run.threadId,
      inputMessageId: begun.run.inputMessageId,
      outputMessageId: begun.run.outputMessageId,
      inputSequence: begun.inputSequence,
      outputSequence: begun.outputSequence,
      replayed: begun.replayed,
      recoveredStaleRun: begun.recoveredStaleRun === true,
      runStatus: begun.run.status,
      authoritativeHistory: history,
    });
  }

  /**
   * Runtime coordinator terminal entrypoint. Failed/cancelled partial text is
   * deliberately discarded in the foundation policy; the pending assistant
   * row is terminalized empty and therefore excluded from future context.
   */
  async finalizeRun(
    context: VerifiedRequestContext,
    request: FinalizeAtlasConversationRunRequest,
  ): Promise<AtlasRunRecord> {
    if (request.outcome === "completed") {
      const text = request.assistantText ?? "";
      return this.completeRun(context, {
        runId: request.runId,
        outputContentBlocks:
          text.trim().length > 0 ? [{ type: "text", text }] : [],
        resultCards: request.resultCards ?? [],
        meteringRunId: request.meteringRunId ?? null,
      });
    }
    if (request.outcome === "failed") {
      return this.failRun(context, {
        runId: request.runId,
        terminalErrorClass: requiredText(
          request.safeErrorClass ?? "internal",
          "safeErrorClass",
          100,
        ),
      });
    }
    return this.cancelRun(context, {
      runId: request.runId,
      persistPartialOutput: false,
    });
  }

  async completeRun(
    context: VerifiedRequestContext,
    request: CompleteAtlasThreadRunRequest,
  ): Promise<AtlasRunRecord> {
    const scope = scopeFromContext(context, AGENT_USE_PERMISSION);
    try {
      const run = await this.options.repository.completeRun(scope, {
        runId: requiredUuid(request.runId, "runId"),
        outputContentBlocks: contentBlocksOrEmpty(request.outputContentBlocks),
        resultCards: jsonArray(request.resultCards, "resultCards"),
        citationRefs: jsonArray(request.citationRefs, "citationRefs"),
        toolRefs: jsonArray(request.toolRefs, "toolRefs"),
        meteringRunId:
          request.meteringRunId == null
            ? null
            : requiredUuid(request.meteringRunId, "meteringRunId"),
        terminalAt: validDate(this.clock.now(), "clock.now"),
      });
      if (!run) throw runNotFound();
      return run;
    } catch (error) {
      throw mapRepositoryError(error);
    }
  }

  async failRun(
    context: VerifiedRequestContext,
    request: FailAtlasThreadRunRequest,
  ): Promise<AtlasRunRecord> {
    const scope = scopeFromContext(context, AGENT_USE_PERMISSION);
    try {
      const run = await this.options.repository.failRun(scope, {
        runId: requiredUuid(request.runId, "runId"),
        terminalErrorClass: requiredText(
          request.terminalErrorClass,
          "terminalErrorClass",
          100,
        ),
        terminalAt: validDate(this.clock.now(), "clock.now"),
      });
      if (!run) throw runNotFound();
      return run;
    } catch (error) {
      throw mapRepositoryError(error);
    }
  }

  async cancelRun(
    context: VerifiedRequestContext,
    request: CancelAtlasThreadRunRequest,
  ): Promise<AtlasRunRecord> {
    const scope = scopeFromContext(context, AGENT_USE_PERMISSION);
    try {
      const run = await this.options.repository.cancelRun(scope, {
        runId: requiredUuid(request.runId, "runId"),
        outputContentBlocks: request.persistPartialOutput
          ? contentBlocks(request.outputContentBlocks ?? [])
          : [],
        terminalAt: validDate(this.clock.now(), "clock.now"),
      });
      if (!run) throw runNotFound();
      return run;
    } catch (error) {
      throw mapRepositoryError(error);
    }
  }

  /**
   * Scheduled-job primitive. It is deliberately absent from public routes.
   * The empty job payload can only supply a bounded batch size; the dedicated
   * maintenance authority owns cross-tenant eligibility and legal-hold checks.
   */
  async purgeEligible(input: {
    asOf?: Date;
    batchSize?: number;
  }): Promise<PurgeAtlasThreadsResult> {
    if (!this.options.maintenanceAuthority) {
      throw new Error("Atlas thread maintenance authority is not configured.");
    }
    const result = await this.options.maintenanceAuthority.purgeEligible({
      asOf: validDate(input.asOf ?? this.clock.now(), "asOf"),
      batchSize: positiveInteger(
        input.batchSize ?? this.purgeBatchSize,
        "batchSize",
        this.purgeBatchSize,
      ),
    });
    this.options.metrics?.observePurge?.(result);
    this.options.metrics?.observeThreadOperation?.("purge", "success");
    return result;
  }

  private async requireRunnableThread(
    context: VerifiedRequestContext,
    scope: AtlasThreadRepositoryScope,
    threadId: string,
  ): Promise<AtlasThreadRecord> {
    const thread = await this.options.repository.get(scope, threadId);
    if (
      !thread
      || !this.options.authorizers.resolve(scope.plane).canRun(context, thread)
    ) {
      throw threadNotFound();
    }
    return thread;
  }

  private async loadAuthoritativeHistory(
    scope: AtlasThreadRepositoryScope,
    threadId: string,
    beforeSequence: string,
  ): Promise<readonly AtlasAuthoritativeHistoryMessage[]> {
    const page = await this.options.repository.listMessages(scope, {
      threadId,
      limit: this.contextMaxMessages,
      cursor: { beforeSequence },
    });
    const selected: AtlasAuthoritativeHistoryMessage[] = [];
    let characters = 0;
    // Repository pages are chronological. Walk newest-to-oldest so a bounded
    // context retains the most recent complete exchanges.
    for (let index = page.items.length - 1; index >= 0; index -= 1) {
      const message = page.items[index]!;
      if (
        message.status !== "completed"
        || (message.role !== "user" && message.role !== "assistant")
      ) {
        continue;
      }
      const text = messageText(message);
      if (!text) continue;
      if (characters + text.length > this.contextMaxCharacters) break;
      characters += text.length;
      selected.push(Object.freeze({ role: message.role, content: text }));
    }
    selected.reverse();
    return Object.freeze(selected);
  }

  private async requireReadableThread(
    context: VerifiedRequestContext,
    scope: AtlasThreadRepositoryScope,
    threadId: string,
  ): Promise<AtlasThreadRecord> {
    const thread = await this.options.repository.get(scope, threadId);
    if (
      !thread
      || !this.options.authorizers.resolve(scope.plane).canRead(context, thread)
    ) {
      throw threadNotFound();
    }
    return thread;
  }

  private async requireManageableThread(
    context: VerifiedRequestContext,
    scope: AtlasThreadRepositoryScope,
    threadIdValue: string,
    rowVersionValue: string,
  ): Promise<AtlasThreadRecord> {
    const threadId = requiredUuid(threadIdValue, "threadId");
    const expected = requiredRowVersion(rowVersionValue);
    const thread = await this.options.repository.get(scope, threadId);
    if (
      !thread
      || !this.options.authorizers.resolve(scope.plane).canManage(context, thread)
    ) {
      throw threadNotFound();
    }
    if (thread.rowVersion !== expected) throw optimisticConflict();
    return thread;
  }
}

function scopeFromContext(
  context: VerifiedRequestContext,
  permission: string,
): AtlasThreadRepositoryScope {
  assertVerifiedContext(context);
  if (!hasPermission(context, AGENT_USE_PERMISSION) || !hasPermission(context, permission)) {
    throw permissionDenied();
  }
  return Object.freeze({
    tenantId: context.tenantId,
    principalId: context.principalId,
    plane: requiredPlane(context.planeKey),
  });
}

function assertVerifiedContext(context: VerifiedRequestContext): void {
  const permissions = context?.permissions;
  const valid =
    context != null
    && UUID_RE.test(context.tenantId)
    && UUID_RE.test(context.principalId)
    && requiredPlaneOrNull(context.planeKey) !== null
    && typeof context.realmKey === "string"
    && context.realmKey.trim().length > 0
    && typeof context.requestId === "string"
    && context.requestId.trim().length > 0
    && Number.isSafeInteger(context.authEpoch)
    && context.authEpoch >= 0
    && typeof context.profileHash === "string"
    && context.profileHash.trim().length > 0
    && permissions?.tenantId === context.tenantId
    && permissions?.principalId === context.principalId
    && permissions?.planeKey === context.planeKey
    && permissions?.profileHash === context.profileHash;
  if (!valid) {
    throw new AtlasThreadServiceError(
      "INVALID_VERIFIED_CONTEXT",
      403,
      "Atlas thread access requires one internally consistent verified request context.",
    );
  }
}

function hasPermission(
  context: VerifiedRequestContext,
  permission: string,
): boolean {
  const permissions = context.permissions;
  return permissions.allowed.has(permission)
    && !permissions.denied.has(permission)
    && !permissions.planLocked.has(permission)
    && !permissions.planeExcluded.has(permission);
}

function sameBoundary(
  context: VerifiedRequestContext,
  thread: AtlasThreadRecord,
): boolean {
  return thread.tenantId === context.tenantId
    && thread.plane === context.planeKey
    && (
      thread.ownerPrincipalId === context.principalId
      || Boolean(thread.access.participantRole)
    );
}

function pageLimit(value: number | undefined): number {
  if (value === undefined) return 25;
  return positiveInteger(value, "limit", 100);
}

function optionalTitle(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return requiredText(value, "title", 200);
}

function retentionPolicyDisplayText(
  policyId: string,
  retentionDays: number,
): string {
  const unit = retentionDays === 1 ? "day" : "days";
  return `Atlas conversations are retained for ${retentionDays} ${unit} `
    + `under ${policyId}; legal holds suspend expiry and purge.`;
}

function contentBlocks(
  value: readonly AtlasStoredContentBlock[],
): readonly AtlasStoredContentBlock[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 128) {
    throw invalidArgument("contentBlocks must contain 1-128 JSON blocks.");
  }
  assertJson(value, "contentBlocks");
  for (const block of value) {
    if (
      block == null
      || typeof block !== "object"
      || Array.isArray(block)
      || typeof block.type !== "string"
      || block.type.trim().length === 0
      || block.type.length > 100
    ) {
      throw invalidArgument("Every Atlas content block requires a bounded type.");
    }
  }
  return Object.freeze(value.map((block) => Object.freeze({ ...block })));
}

function contentBlocksOrEmpty(
  value: readonly AtlasStoredContentBlock[],
): readonly AtlasStoredContentBlock[] {
  return value.length === 0 ? Object.freeze([]) : contentBlocks(value);
}

function jsonArray(
  value: readonly AtlasStoredJson[] | undefined,
  field: string,
): readonly AtlasStoredJson[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 128) {
    throw invalidArgument(`${field} must contain at most 128 JSON values.`);
  }
  assertJson(value, field);
  return Object.freeze([...value]);
}

function assertJson(value: unknown, field: string): void {
  let encoded: string | undefined;
  try {
    encoded = JSON.stringify(value);
  } catch {
    throw invalidArgument(`${field} must be valid JSON.`);
  }
  if (encoded === undefined || encoded.length > 1_000_000) {
    throw invalidArgument(`${field} exceeds the protected transcript limit.`);
  }
}

function messageText(message: AtlasMessageRecord): string {
  const values: string[] = [];
  for (const block of message.contentBlocks) {
    if (block.type === "text" && typeof block["text"] === "string") {
      const text = block["text"].trim();
      if (text) values.push(text);
    }
  }
  return values.join("\n");
}

function requiredUuid(value: string, field: string): string {
  const normalized = value?.trim().toLowerCase();
  if (!UUID_RE.test(normalized)) {
    throw invalidArgument(`${field} must be a UUID.`);
  }
  return normalized;
}

function requiredRowVersion(value: string): string {
  const normalized = value?.trim();
  if (!POSITIVE_BIGINT_RE.test(normalized)) {
    throw invalidArgument("expectedRowVersion must be a positive integer.");
  }
  return normalized;
}

function requiredPlane(value: string): AtlasThreadPlane {
  const result = requiredPlaneOrNull(value);
  if (!result) throw invalidArgument("plane must be neon, mesh, or admin.");
  return result;
}

function requiredPlaneOrNull(value: string): AtlasThreadPlane | null {
  return value === "neon" || value === "mesh" || value === "admin"
    ? value
    : null;
}

function requiredText(value: string, field: string, max: number): string {
  const normalized = value?.trim();
  if (!normalized || normalized.length > max) {
    throw invalidArgument(`${field} must contain 1-${max} characters.`);
  }
  return normalized;
}

function positiveInteger(value: number, field: string, max: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new Error(`${field} must be an integer between 1 and ${max}.`);
  }
  return value;
}

function integerInRange(
  value: number,
  field: string,
  minimum: number,
  maximum: number,
): number {
  if (
    !Number.isSafeInteger(value)
    || value < minimum
    || value > maximum
  ) {
    throw new Error(
      `${field} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return value;
}

function validDate(value: Date, field: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw invalidArgument(`${field} must be a valid date.`);
  }
  return new Date(value);
}

function mapRepositoryError(error: unknown): AtlasThreadServiceError {
  if (error instanceof AtlasThreadServiceError) return error;
  if (!(error instanceof AtlasThreadRepositoryError)) throw error;
  switch (error.code) {
    case "THREAD_NOT_FOUND":
      return threadNotFound();
    case "THREAD_NOT_ACTIVE":
      return new AtlasThreadServiceError(
        "THREAD_NOT_ACTIVE",
        409,
        "The Atlas thread is not active.",
      );
    case "RUN_CONFLICT":
      return new AtlasThreadServiceError(
        "RUN_CONFLICT",
        409,
        "The Atlas thread already has an active run.",
      );
    case "IDEMPOTENCY_CONFLICT":
      return new AtlasThreadServiceError(
        "IDEMPOTENCY_CONFLICT",
        409,
        "The client request identifier is already bound to another Atlas run.",
      );
    case "RUN_NOT_FOUND":
      return runNotFound();
    case "RUN_TERMINAL":
      return new AtlasThreadServiceError(
        "RUN_TERMINAL",
        409,
        "The Atlas run is already terminal.",
      );
  }
}

function invalidArgument(message: string): AtlasThreadServiceError {
  return new AtlasThreadServiceError("INVALID_ARGUMENT", 400, message);
}

function permissionDenied(): AtlasThreadServiceError {
  return new AtlasThreadServiceError(
    "PERMISSION_DENIED",
    403,
    "The verified principal cannot perform this Atlas history operation.",
  );
}

function threadNotFound(): AtlasThreadServiceError {
  return new AtlasThreadServiceError(
    "THREAD_NOT_FOUND",
    404,
    "The Atlas thread is unavailable.",
  );
}

function runNotFound(): AtlasThreadServiceError {
  return new AtlasThreadServiceError(
    "RUN_NOT_FOUND",
    404,
    "The Atlas run is unavailable.",
  );
}

function optimisticConflict(): AtlasThreadServiceError {
  return new AtlasThreadServiceError(
    "OPTIMISTIC_CONFLICT",
    409,
    "The Atlas thread changed before this operation completed.",
  );
}
