import { sql } from "kysely";
import type { AnyDb } from "../ai-runtime.types.js";
import {
  AtlasThreadRepositoryError,
  type AtlasMessageCursor,
  type AtlasMessageRecord,
  type AtlasPage,
  type AtlasRunRecord,
  type AtlasStoredContentBlock,
  type AtlasStoredJson,
  type AtlasThreadCursor,
  type AtlasThreadMaintenanceAuthority,
  type AtlasThreadRecord,
  type AtlasThreadRepository,
  type AtlasThreadRepositoryScope,
  type BeginAtlasRunInput,
  type BeginAtlasRunResult,
  type CancelAtlasRunInput,
  type CompleteAtlasRunInput,
  type CreateAtlasThreadAndBeginRunInput,
  type CreateAtlasThreadRecordInput,
  type FailAtlasRunInput,
  type ListAtlasMessagesInput,
  type ListAtlasThreadsInput,
  type MutateAtlasThreadInput,
  type PurgeAtlasThreadsResult,
} from "./atlas-thread.types.js";
import type {
  AtlasMessageContentProtector,
  ProtectedAtlasMessageContent,
} from "./protected-content-store.js";

type ScalarInteger = string | number | bigint;

interface ThreadRow {
  thread_id: string;
  tenant_id: string;
  plane: string;
  owner_principal_id: string;
  title: string | null;
  status: string;
  row_version: ScalarInteger;
  last_message_sequence: ScalarInteger;
  retention_policy_id: string;
  expires_at: Date | string | null;
  purge_after: Date | string | null;
  legal_hold: boolean;
  summary_version: number;
  created_at: Date | string;
  updated_at: Date | string | null;
  activity_at: Date | string;
  participant_role: string;
  access_principal_id: string;
}

interface MessageRow {
  message_id: string;
  thread_id: string;
  plane: string;
  sequence: ScalarInteger;
  role: string;
  status: string;
  content_blocks: unknown;
  protected_content_ref: string | null;
  run_id: string | null;
  parent_message_id: string | null;
  result_cards: unknown;
  citation_refs: unknown;
  tool_refs: unknown;
  terminal_error_class: string | null;
  created_at: Date | string;
  terminal_at: Date | string | null;
}

interface RunRow {
  run_id: string;
  thread_id: string;
  plane: string;
  principal_id: string;
  client_request_id: string;
  input_message_id: string;
  output_message_id: string;
  status: string;
  cancellation_requested_at: Date | string | null;
  terminal_at: Date | string | null;
  terminal_error_class: string | null;
  metering_run_id: string | null;
  started_at: Date | string;
}

interface SequenceRow {
  sequence: ScalarInteger;
}

const STALE_RUN_ERROR_CLASS = "process_interrupted";

class MutationMiss extends Error {
  override readonly name = "MutationMiss";
}

/**
 * PostgreSQL implementation for request-scoped Atlas conversation storage.
 *
 * Every operation uses an explicit transaction and sets all three RLS GUCs.
 * SQL identifiers are static and every caller value is a bound Kysely
 * parameter. Public callers cannot append messages through this class; only
 * the internal run lifecycle primitives create or terminalize transcript rows.
 */
export class SqlAtlasThreadRepository implements AtlasThreadRepository {
  constructor(
    private readonly db: AnyDb,
    private readonly contentProtector?: AtlasMessageContentProtector,
  ) {}

  async create(
    scope: AtlasThreadRepositoryScope,
    input: CreateAtlasThreadRecordInput,
  ): Promise<AtlasThreadRecord> {
    return this.withScope(scope, async (trx) => {
      await insertThreadRows(trx, scope, input);
      const row = await selectThread(trx, scope, input.threadId);
      if (!row) throw new AtlasThreadRepositoryError("THREAD_NOT_FOUND");
      return mapThread(row);
    });
  }

  async list(
    scope: AtlasThreadRepositoryScope,
    input: ListAtlasThreadsInput,
  ): Promise<AtlasPage<AtlasThreadRecord, AtlasThreadCursor>> {
    return this.withScope(scope, async (trx) => {
      const cursorAt = input.cursor?.activityAt ?? null;
      const cursorId = input.cursor?.threadId ?? null;
      const result = await sql<ThreadRow>`
        SELECT
          c.id AS thread_id,
          c.tenant_id,
          t.plane,
          t.owner_principal_id,
          c.title,
          c.status,
          t.row_version,
          t.last_message_sequence,
          t.retention_policy_id,
          t.expires_at,
          t.purge_after,
          t.legal_hold,
          t.summary_version,
          c.created_at,
          COALESCE(t.updated_at, c.updated_at) AS updated_at,
          COALESCE(t.updated_at, c.updated_at, c.created_at) AS activity_at,
          cp.role AS participant_role,
          cp.principal_id AS access_principal_id
        FROM master.atlas_thread t
        JOIN master.conversation c
          ON c.tenant_id = t.tenant_id
         AND c.id = t.conversation_id
        JOIN master.conversation_participant cp
          ON cp.tenant_id = t.tenant_id
         AND cp.conversation_id = t.conversation_id
         AND cp.principal_id = ${scope.principalId}::uuid
         AND cp.left_at IS NULL
        WHERE t.tenant_id = ${scope.tenantId}::uuid
          AND t.plane = ${scope.plane}
          AND c.status <> 'deleted'
          AND (
            ${input.status} = 'all'
            OR c.status = ${input.status}
          )
          AND (
            ${cursorAt}::timestamptz IS NULL
            OR (
              COALESCE(t.updated_at, c.updated_at, c.created_at),
              c.id
            ) < (
              ${cursorAt}::timestamptz,
              ${cursorId}::uuid
            )
          )
        ORDER BY
          COALESCE(t.updated_at, c.updated_at, c.created_at) DESC,
          c.id DESC
        LIMIT ${input.limit + 1}
      `.execute(trx);
      const hasMore = result.rows.length > input.limit;
      const selected = result.rows.slice(0, input.limit);
      const last = selected.at(-1);
      return Object.freeze({
        items: Object.freeze(selected.map(mapThread)),
        nextCursor: hasMore && last
          ? Object.freeze({
              activityAt: requiredDate(last.activity_at, "activity_at"),
              threadId: last.thread_id,
            })
          : null,
      });
    });
  }

  async get(
    scope: AtlasThreadRepositoryScope,
    threadId: string,
  ): Promise<AtlasThreadRecord | null> {
    return this.withScope(scope, async (trx) => {
      const row = await selectThread(trx, scope, threadId);
      return row ? mapThread(row) : null;
    });
  }

  async listMessages(
    scope: AtlasThreadRepositoryScope,
    input: ListAtlasMessagesInput,
  ): Promise<AtlasPage<AtlasMessageRecord, AtlasMessageCursor>> {
    return this.withScope(scope, async (trx) => {
      const beforeSequence = input.cursor?.beforeSequence ?? null;
      const result = await sql<MessageRow>`
        SELECT
          m.id AS message_id,
          m.conversation_id AS thread_id,
          m.plane,
          m.sequence,
          m.role,
          m.status,
          m.content_blocks,
          m.protected_content_ref,
          m.run_id,
          m.parent_message_id,
          m.result_cards,
          m.citation_refs,
          m.tool_refs,
          m.terminal_error_class,
          m.created_at,
          m.terminal_at
        FROM master.atlas_message m
        JOIN master.atlas_thread t
          ON t.tenant_id = m.tenant_id
         AND t.conversation_id = m.conversation_id
         AND t.plane = m.plane
        JOIN master.conversation c
          ON c.tenant_id = m.tenant_id
         AND c.id = m.conversation_id
        JOIN master.conversation_participant cp
          ON cp.tenant_id = m.tenant_id
         AND cp.conversation_id = m.conversation_id
         AND cp.principal_id = ${scope.principalId}::uuid
         AND cp.left_at IS NULL
        WHERE m.tenant_id = ${scope.tenantId}::uuid
          AND m.conversation_id = ${input.threadId}::uuid
          AND m.plane = ${scope.plane}
          AND c.status <> 'deleted'
          AND (
            ${beforeSequence}::bigint IS NULL
            OR m.sequence < ${beforeSequence}::bigint
          )
        ORDER BY m.sequence DESC
        LIMIT ${input.limit + 1}
      `.execute(trx);
      const hasMore = result.rows.length > input.limit;
      const selectedDescending = result.rows.slice(0, input.limit);
      const oldest = selectedDescending.at(-1);
      const chronological = [...selectedDescending].reverse();
      return Object.freeze({
        items: Object.freeze(
          await Promise.all(
            chronological.map((row) => this.mapStoredMessage(scope, row)),
          ),
        ),
        nextCursor: hasMore && oldest
          ? Object.freeze({ beforeSequence: integerText(oldest.sequence) })
          : null,
      });
    });
  }

  async rename(
    scope: AtlasThreadRepositoryScope,
    input: MutateAtlasThreadInput & { readonly title: string },
  ): Promise<AtlasThreadRecord | null> {
    try {
      return await this.withScope(scope, async (trx) => {
        const bumped = await sql<{ conversation_id: string }>`
          UPDATE master.atlas_thread t
          SET row_version = t.row_version + 1,
              updated_at = now(),
              updated_by = ${scope.principalId}::uuid
          WHERE t.tenant_id = ${scope.tenantId}::uuid
            AND t.conversation_id = ${input.threadId}::uuid
            AND t.plane = ${scope.plane}
            AND t.owner_principal_id = ${scope.principalId}::uuid
            AND t.row_version = ${input.expectedRowVersion}::bigint
            AND EXISTS (
              SELECT 1
              FROM master.conversation c
              WHERE c.tenant_id = t.tenant_id
                AND c.id = t.conversation_id
                AND c.status <> 'deleted'
            )
          RETURNING t.conversation_id
        `.execute(trx);
        if (!bumped.rows[0]) throw new MutationMiss();
        await sql`
          UPDATE master.conversation
          SET title = ${input.title},
              updated_at = now(),
              updated_by = ${scope.principalId}::uuid
          WHERE tenant_id = ${scope.tenantId}::uuid
            AND id = ${input.threadId}::uuid
            AND status <> 'deleted'
        `.execute(trx);
        const row = await selectThread(trx, scope, input.threadId);
        if (!row) throw new MutationMiss();
        return mapThread(row);
      });
    } catch (error) {
      if (error instanceof MutationMiss) return null;
      throw error;
    }
  }

  async archive(
    scope: AtlasThreadRepositoryScope,
    input: MutateAtlasThreadInput,
  ): Promise<AtlasThreadRecord | null> {
    try {
      return await this.withScope(scope, async (trx) => {
        const bumped = await sql<{ conversation_id: string }>`
          UPDATE master.atlas_thread t
          SET row_version = t.row_version + 1,
              updated_at = now(),
              updated_by = ${scope.principalId}::uuid
          WHERE t.tenant_id = ${scope.tenantId}::uuid
            AND t.conversation_id = ${input.threadId}::uuid
            AND t.plane = ${scope.plane}
            AND t.owner_principal_id = ${scope.principalId}::uuid
            AND t.row_version = ${input.expectedRowVersion}::bigint
            AND EXISTS (
              SELECT 1
              FROM master.conversation c
              WHERE c.tenant_id = t.tenant_id
                AND c.id = t.conversation_id
                AND c.status = 'active'
            )
          RETURNING t.conversation_id
        `.execute(trx);
        if (!bumped.rows[0]) throw new MutationMiss();
        const changed = await sql<{ id: string }>`
          UPDATE master.conversation
          SET status = 'archived',
              status_changed_at = now(),
              status_changed_by = ${scope.principalId}::uuid,
              updated_at = now(),
              updated_by = ${scope.principalId}::uuid
          WHERE tenant_id = ${scope.tenantId}::uuid
            AND id = ${input.threadId}::uuid
            AND status = 'active'
          RETURNING id
        `.execute(trx);
        if (!changed.rows[0]) throw new MutationMiss();
        const row = await selectThread(trx, scope, input.threadId);
        if (!row) throw new MutationMiss();
        return mapThread(row);
      });
    } catch (error) {
      if (error instanceof MutationMiss) return null;
      throw error;
    }
  }

  async softDelete(
    scope: AtlasThreadRepositoryScope,
    input: MutateAtlasThreadInput & { readonly deletedAt: Date },
  ): Promise<boolean> {
    try {
      return await this.withScope(scope, async (trx) => {
        const bumped = await sql<{ conversation_id: string }>`
          UPDATE master.atlas_thread t
          SET row_version = t.row_version + 1,
              purge_after = ${input.deletedAt},
              updated_at = ${input.deletedAt},
              updated_by = ${scope.principalId}::uuid
          WHERE t.tenant_id = ${scope.tenantId}::uuid
            AND t.conversation_id = ${input.threadId}::uuid
            AND t.plane = ${scope.plane}
            AND t.owner_principal_id = ${scope.principalId}::uuid
            AND t.row_version = ${input.expectedRowVersion}::bigint
            AND t.legal_hold = false
            AND EXISTS (
              SELECT 1
              FROM master.conversation c
              WHERE c.tenant_id = t.tenant_id
                AND c.id = t.conversation_id
                AND c.status <> 'deleted'
            )
          RETURNING t.conversation_id
        `.execute(trx);
        if (!bumped.rows[0]) throw new MutationMiss();
        const deleted = await sql<{ id: string }>`
          UPDATE master.conversation
          SET status = 'deleted',
              status_changed_at = ${input.deletedAt},
              status_changed_by = ${scope.principalId}::uuid,
              deleted_at = ${input.deletedAt},
              deleted_by = ${scope.principalId}::uuid,
              updated_at = ${input.deletedAt},
              updated_by = ${scope.principalId}::uuid
          WHERE tenant_id = ${scope.tenantId}::uuid
            AND id = ${input.threadId}::uuid
            AND status <> 'deleted'
          RETURNING id
        `.execute(trx);
        if (!deleted.rows[0]) throw new MutationMiss();
        return true;
      });
    } catch (error) {
      if (error instanceof MutationMiss) return false;
      throw error;
    }
  }

  async createThreadAndBeginRun(
    scope: AtlasThreadRepositoryScope,
    input: CreateAtlasThreadAndBeginRunInput,
  ): Promise<BeginAtlasRunResult> {
    try {
      return await this.withScope(scope, async (trx) => {
        await lockClientRequest(trx, scope, input.clientRequestId);
        let existing = await selectRunByClientRequest(
          trx,
          scope,
          input.clientRequestId,
        );
        if (existing) {
          if (
            existing.run.status === "started"
            && existing.run.startedAt.getTime() <= input.staleBefore.getTime()
          ) {
            const recovered = await recoverStaleRun(trx, scope, {
              threadId: existing.run.threadId,
              runId: existing.run.runId,
              staleBefore: input.staleBefore,
              terminalAt: input.startedAt,
            });
            if (recovered) {
              existing = await selectRunByClientRequest(
                trx,
                scope,
                input.clientRequestId,
              );
              if (!existing) {
                throw new AtlasThreadRepositoryError("RUN_NOT_FOUND");
              }
              return Object.freeze({
                ...existing,
                recoveredStaleRun: true,
              });
            }
          }
          return existing;
        }
        await insertThreadRows(trx, scope, input);
        return insertNewRunRows(
          trx,
          scope,
          input,
          await this.protectMessage(
            scope,
            input.inputMessageId,
            input.inputContentBlocks,
          ),
        );
      });
    } catch (error) {
      const constraint = postgresConstraint(error);
      if (constraint === "atlas_run_client_request_uq") {
        throw new AtlasThreadRepositoryError("IDEMPOTENCY_CONFLICT");
      }
      if (constraint === "atlas_run_one_started_per_thread_uq") {
        throw new AtlasThreadRepositoryError("RUN_CONFLICT");
      }
      throw error;
    }
  }

  async beginRun(
    scope: AtlasThreadRepositoryScope,
    input: BeginAtlasRunInput,
  ): Promise<BeginAtlasRunResult> {
    try {
      return await this.withScope(scope, async (trx) => {
        await lockClientRequest(trx, scope, input.clientRequestId);
        const locked = await sql<{ thread_id: string; status: string }>`
          SELECT t.conversation_id AS thread_id, c.status
          FROM master.atlas_thread t
          JOIN master.conversation c
            ON c.tenant_id = t.tenant_id
           AND c.id = t.conversation_id
          JOIN master.conversation_participant cp
            ON cp.tenant_id = t.tenant_id
           AND cp.conversation_id = t.conversation_id
           AND cp.principal_id = ${scope.principalId}::uuid
           AND cp.left_at IS NULL
          WHERE t.tenant_id = ${scope.tenantId}::uuid
            AND t.conversation_id = ${input.threadId}::uuid
            AND t.plane = ${scope.plane}
            AND t.owner_principal_id = ${scope.principalId}::uuid
          FOR UPDATE OF t, c
        `.execute(trx);
        const thread = locked.rows[0];
        if (!thread) throw new AtlasThreadRepositoryError("THREAD_NOT_FOUND");
        if (thread.status !== "active") {
          throw new AtlasThreadRepositoryError("THREAD_NOT_ACTIVE");
        }

        const recoveredStaleRun = await recoverStaleRun(trx, scope, {
          threadId: input.threadId,
          staleBefore: input.staleBefore,
          terminalAt: input.startedAt,
          ownerBoundaryLocked: true,
        });

        const existing = await selectRunByClientRequest(
          trx,
          scope,
          input.clientRequestId,
          true,
        );
        if (existing) {
          if (
            existing.run.threadId !== input.threadId
            || existing.run.plane !== scope.plane
            || existing.run.principalId !== scope.principalId
          ) {
            throw new AtlasThreadRepositoryError("IDEMPOTENCY_CONFLICT");
          }
          return Object.freeze({
            ...existing,
            recoveredStaleRun,
          });
        }

        const active = await sql<{ run_id: string }>`
          SELECT r.id AS run_id
          FROM event.atlas_run r
          WHERE r.tenant_id = ${scope.tenantId}::uuid
            AND r.conversation_id = ${input.threadId}::uuid
            AND r.plane = ${scope.plane}
            AND r.status = 'started'
          LIMIT 1
        `.execute(trx);
        if (active.rows[0]) {
          throw new AtlasThreadRepositoryError("RUN_CONFLICT");
        }

        const inserted = await insertNewRunRows(
          trx,
          scope,
          input,
          await this.protectMessage(
            scope,
            input.inputMessageId,
            input.inputContentBlocks,
          ),
        );
        return Object.freeze({
          ...inserted,
          recoveredStaleRun,
        });
      });
    } catch (error) {
      const constraint = postgresConstraint(error);
      if (constraint === "atlas_run_client_request_uq") {
        throw new AtlasThreadRepositoryError("IDEMPOTENCY_CONFLICT");
      }
      if (constraint === "atlas_run_one_started_per_thread_uq") {
        throw new AtlasThreadRepositoryError("RUN_CONFLICT");
      }
      throw error;
    }
  }

  async completeRun(
    scope: AtlasThreadRepositoryScope,
    input: CompleteAtlasRunInput,
  ): Promise<AtlasRunRecord | null> {
    return this.terminalize(scope, input.runId, "completed", input.terminalAt, {
      contentBlocks: input.outputContentBlocks,
      resultCards: input.resultCards ?? [],
      citationRefs: input.citationRefs ?? [],
      toolRefs: input.toolRefs ?? [],
      terminalErrorClass: null,
      meteringRunId: input.meteringRunId ?? null,
    });
  }

  async failRun(
    scope: AtlasThreadRepositoryScope,
    input: FailAtlasRunInput,
  ): Promise<AtlasRunRecord | null> {
    return this.terminalize(scope, input.runId, "failed", input.terminalAt, {
      contentBlocks: [],
      resultCards: [],
      citationRefs: [],
      toolRefs: [],
      terminalErrorClass: input.terminalErrorClass,
      meteringRunId: null,
    });
  }

  async cancelRun(
    scope: AtlasThreadRepositoryScope,
    input: CancelAtlasRunInput,
  ): Promise<AtlasRunRecord | null> {
    return this.terminalize(scope, input.runId, "cancelled", input.terminalAt, {
      // The service foundation policy passes [] for cancelled partial output.
      contentBlocks: input.outputContentBlocks ?? [],
      resultCards: [],
      citationRefs: [],
      toolRefs: [],
      terminalErrorClass: "cancelled",
      meteringRunId: null,
    });
  }

  private async terminalize(
    scope: AtlasThreadRepositoryScope,
    runId: string,
    target: "completed" | "failed" | "cancelled",
    terminalAt: Date,
    output: {
      contentBlocks: readonly AtlasStoredContentBlock[];
      resultCards: readonly AtlasStoredJson[];
      citationRefs: readonly AtlasStoredJson[];
      toolRefs: readonly AtlasStoredJson[];
      terminalErrorClass: string | null;
      meteringRunId: string | null;
    },
  ): Promise<AtlasRunRecord | null> {
    return this.withScope(scope, async (trx) => {
      const lockedResult = await sql<RunRow>`
        ${runSelectSql(scope)}
        AND r.id = ${runId}::uuid
        FOR UPDATE
      `.execute(trx);
      const locked = lockedResult.rows[0];
      if (!locked) return null;
      if (locked.status === target) return mapRun(locked);
      if (locked.status !== "started") {
        throw new AtlasThreadRepositoryError("RUN_TERMINAL");
      }
      const protectedOutput = await this.protectMessage(
        scope,
        locked.output_message_id,
        output.contentBlocks,
      );
      const messageResult = await sql<{ id: string }>`
        UPDATE master.atlas_message
        SET status = ${target},
            content_blocks = ${JSON.stringify(protectedOutput.contentBlocks)}::jsonb,
            protected_content_ref = ${protectedOutput.protectedContentRef},
            result_cards = ${JSON.stringify(output.resultCards)}::jsonb,
            citation_refs = ${JSON.stringify(output.citationRefs)}::jsonb,
            tool_refs = ${JSON.stringify(output.toolRefs)}::jsonb,
            terminal_error_class = ${output.terminalErrorClass},
            terminal_at = ${terminalAt},
            updated_at = ${terminalAt},
            updated_by = ${scope.principalId}::uuid
        WHERE tenant_id = ${scope.tenantId}::uuid
          AND conversation_id = ${locked.thread_id}::uuid
          AND plane = ${scope.plane}
          AND id = ${locked.output_message_id}::uuid
          AND run_id = ${runId}::uuid
          AND role = 'assistant'
          AND status = 'pending'
        RETURNING id
      `.execute(trx);
      if (!messageResult.rows[0]) {
        throw new AtlasThreadRepositoryError("RUN_TERMINAL");
      }
      const runResult = await sql<RunRow>`
        UPDATE event.atlas_run
        SET status = ${target},
            cancellation_requested_at = CASE
              WHEN ${target} = 'cancelled' THEN ${terminalAt}
              ELSE cancellation_requested_at
            END,
            cancellation_requested_by = CASE
              WHEN ${target} = 'cancelled' THEN ${scope.principalId}::uuid
              ELSE cancellation_requested_by
            END,
            terminal_at = ${terminalAt},
            terminal_error_class = ${output.terminalErrorClass},
            metering_run_id = ${output.meteringRunId}::uuid,
            updated_at = ${terminalAt},
            updated_by = ${scope.principalId}::uuid
        WHERE tenant_id = ${scope.tenantId}::uuid
          AND id = ${runId}::uuid
          AND conversation_id = ${locked.thread_id}::uuid
          AND plane = ${scope.plane}
          AND principal_id = ${scope.principalId}::uuid
          AND status = 'started'
        RETURNING
          id AS run_id,
          conversation_id AS thread_id,
          plane,
          principal_id,
          client_request_id,
          input_message_id,
          output_message_id,
          status,
          cancellation_requested_at,
          terminal_at,
          terminal_error_class,
          metering_run_id,
          started_at
      `.execute(trx);
      const updated = runResult.rows[0];
      if (!updated) throw new AtlasThreadRepositoryError("RUN_TERMINAL");
      return mapRun(updated);
    });
  }

  private async protectMessage(
    scope: AtlasThreadRepositoryScope,
    messageId: string,
    contentBlocks: readonly AtlasStoredContentBlock[],
  ): Promise<ProtectedAtlasMessageContent> {
    if (!this.contentProtector) {
      return Object.freeze({
        contentBlocks,
        protectedContentRef: null,
      });
    }
    return this.contentProtector.protect(scope, messageId, contentBlocks);
  }

  private async mapStoredMessage(
    scope: AtlasThreadRepositoryScope,
    row: MessageRow,
  ): Promise<AtlasMessageRecord> {
    if (row.protected_content_ref === null) return mapMessage(row);
    if (!this.contentProtector) {
      throw new Error(
        "Atlas protected content cannot be read without its approved store.",
      );
    }
    const inline = jsonObjectArray(row.content_blocks, "content_blocks");
    if (inline.length > 0) {
      throw new Error(
        "Atlas message cannot contain inline and protected content together.",
      );
    }
    const revealed = await this.contentProtector.reveal(
      scope,
      row.protected_content_ref,
    );
    return mapMessage(row, revealed);
  }

  private async withScope<T>(
    scope: AtlasThreadRepositoryScope,
    work: (trx: AnyDb) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction().execute(async (transaction) => {
      const trx = transaction as unknown as AnyDb;
      await sql`
        SELECT
          set_config('app.current_tenant_id', ${scope.tenantId}, true),
          set_config('app.current_principal_id', ${scope.principalId}, true),
          set_config('app.current_atlas_plane', ${scope.plane}, true)
      `.execute(trx);
      return work(trx);
    });
  }
}

export interface SqlAtlasThreadMaintenanceOptions {
  /**
   * Explicit construction acknowledgement. The supplied DB must use the
   * approved athyperadmin maintenance role; the application DB is not enough.
   */
  authority: "athyperadmin_atlas_maintenance";
  systemPrincipalId: string;
}

/**
 * Cross-tenant retention/purge primitive for a scheduled worker. It exposes no
 * tenant/principal/plane selectors and must never be installed in a web route.
 */
export class SqlAtlasThreadMaintenanceAuthority
implements AtlasThreadMaintenanceAuthority {
  constructor(
    private readonly systemDb: AnyDb,
    private readonly options: SqlAtlasThreadMaintenanceOptions,
  ) {
    if (options.authority !== "athyperadmin_atlas_maintenance") {
      throw new Error("An approved Atlas maintenance DB authority is required.");
    }
  }

  async purgeEligible(input: {
    readonly asOf: Date;
    readonly batchSize: number;
  }): Promise<PurgeAtlasThreadsResult> {
    return this.systemDb.transaction().execute(async (transaction) => {
      const trx = transaction as unknown as AnyDb;
      const authority = await sql<{ authorized: boolean }>`
        SELECT (
          pg_has_role(
            current_user,
            'athyperadmin_atlas_maintenance',
            'USAGE'
          )
          AND NOT pg_has_role(current_user, 'athyperapp', 'USAGE')
        ) AS authorized
      `.execute(trx);
      if (authority.rows[0]?.authorized !== true) {
        throw new Error(
          "The database session is not the isolated Atlas maintenance authority.",
        );
      }
      const expired = await sql<{ id: string }>`
        WITH candidates AS (
          SELECT
            t.tenant_id,
            t.conversation_id
          FROM master.atlas_thread t
          JOIN master.conversation c
            ON c.tenant_id = t.tenant_id
           AND c.id = t.conversation_id
          WHERE t.legal_hold = false
            AND t.expires_at IS NOT NULL
            AND t.expires_at <= ${input.asOf}
            AND c.status <> 'deleted'
          ORDER BY t.expires_at, t.tenant_id, t.conversation_id
          LIMIT ${input.batchSize}
          FOR UPDATE OF t, c SKIP LOCKED
        ),
        thread_updates AS (
          UPDATE master.atlas_thread t
          SET purge_after = COALESCE(t.purge_after, ${input.asOf}),
              row_version = t.row_version + 1,
              updated_at = ${input.asOf},
              -- This FK is tenant-composite. A cross-tenant maintenance
              -- principal must not be written into customer-tenant rows.
              updated_by = NULL
          FROM candidates x
          WHERE t.tenant_id = x.tenant_id
            AND t.conversation_id = x.conversation_id
          RETURNING t.tenant_id, t.conversation_id
        )
        UPDATE master.conversation c
        SET status = 'deleted',
            status_changed_at = ${input.asOf},
            status_changed_by = ${this.options.systemPrincipalId}::uuid,
            deleted_at = ${input.asOf},
            deleted_by = ${this.options.systemPrincipalId}::uuid,
            updated_at = ${input.asOf},
            updated_by = ${this.options.systemPrincipalId}::uuid
        FROM thread_updates x
        WHERE c.tenant_id = x.tenant_id
          AND c.id = x.conversation_id
          AND c.status <> 'deleted'
        RETURNING c.id
      `.execute(trx);
      // Strict deleted_at < asOf guarantees that an expiry marked above gets
      // at least one committed soft-delete pass before hard deletion.
      const purged = await sql<{ id: string }>`
        WITH candidates AS (
          SELECT
            t.tenant_id,
            t.conversation_id
          FROM master.atlas_thread t
          JOIN master.conversation c
            ON c.tenant_id = t.tenant_id
           AND c.id = t.conversation_id
          WHERE t.legal_hold = false
            AND t.purge_after IS NOT NULL
            AND t.purge_after <= ${input.asOf}
            AND c.status = 'deleted'
            AND c.deleted_at IS NOT NULL
            AND c.deleted_at < ${input.asOf}
          ORDER BY t.purge_after, t.tenant_id, t.conversation_id
          LIMIT ${input.batchSize}
          FOR UPDATE OF t, c SKIP LOCKED
        )
        DELETE FROM master.conversation c
        USING candidates x
        WHERE c.tenant_id = x.tenant_id
          AND c.id = x.conversation_id
          AND c.deleted_at IS NOT NULL
        RETURNING c.id
      `.execute(trx);
      return Object.freeze({
        expiredCount: expired.rows.length,
        purgedCount: purged.rows.length,
      });
    });
  }
}

async function lockClientRequest(
  trx: AnyDb,
  scope: AtlasThreadRepositoryScope,
  clientRequestId: string,
): Promise<void> {
  // The tenant is part of the lock key because client_request_id uniqueness is
  // tenant scoped. The lock lives for the surrounding transaction.
  await sql`
    SELECT pg_advisory_xact_lock(
      hashtextextended(
        ${`${scope.tenantId}:${clientRequestId}`},
        0
      )
    )
  `.execute(trx);
}

/**
 * Expires one abandoned run under the immutable owner boundary.
 *
 * The thread envelope and run are rechecked and locked in the caller's
 * transaction. This makes recovery race safely with a late provider
 * finalizer: whichever locks the run first determines the terminal outcome.
 * Failed/cancelled partial output is never retained by the foundation policy.
 */
async function recoverStaleRun(
  trx: AnyDb,
  scope: AtlasThreadRepositoryScope,
  input: {
    threadId: string;
    runId?: string;
    staleBefore: Date;
    terminalAt: Date;
    ownerBoundaryLocked?: boolean;
  },
): Promise<boolean> {
  if (!input.ownerBoundaryLocked) {
    const thread = await sql<{ thread_id: string }>`
      SELECT t.conversation_id AS thread_id
      FROM master.atlas_thread t
      JOIN master.conversation c
        ON c.tenant_id = t.tenant_id
       AND c.id = t.conversation_id
      JOIN master.conversation_participant cp
        ON cp.tenant_id = t.tenant_id
       AND cp.conversation_id = t.conversation_id
       AND cp.principal_id = ${scope.principalId}::uuid
       AND cp.left_at IS NULL
      WHERE t.tenant_id = ${scope.tenantId}::uuid
        AND t.conversation_id = ${input.threadId}::uuid
        AND t.plane = ${scope.plane}
        AND t.owner_principal_id = ${scope.principalId}::uuid
        AND c.status <> 'deleted'
      FOR UPDATE OF t, c
    `.execute(trx);
    if (!thread.rows[0]) return false;
  }

  const run = await sql<RunRow>`
    ${runSelectSql(scope)}
    AND r.conversation_id = ${input.threadId}::uuid
    AND r.status = 'started'
    AND r.started_at <= ${input.staleBefore}
    ${input.runId ? sql`AND r.id = ${input.runId}::uuid` : sql``}
    ORDER BY r.started_at, r.id
    LIMIT 1
    FOR UPDATE
  `.execute(trx);
  const locked = run.rows[0];
  if (!locked) return false;

  const message = await sql<{ id: string }>`
    UPDATE master.atlas_message
    SET status = 'failed',
        content_blocks = '[]'::jsonb,
        result_cards = '[]'::jsonb,
        citation_refs = '[]'::jsonb,
        tool_refs = '[]'::jsonb,
        terminal_error_class = ${STALE_RUN_ERROR_CLASS},
        terminal_at = ${input.terminalAt},
        updated_at = ${input.terminalAt},
        updated_by = ${scope.principalId}::uuid
    WHERE tenant_id = ${scope.tenantId}::uuid
      AND conversation_id = ${input.threadId}::uuid
      AND plane = ${scope.plane}
      AND id = ${locked.output_message_id}::uuid
      AND run_id = ${locked.run_id}::uuid
      AND role = 'assistant'
      AND status = 'pending'
    RETURNING id
  `.execute(trx);
  if (!message.rows[0]) {
    throw new AtlasThreadRepositoryError("RUN_TERMINAL");
  }

  const terminal = await sql<{ id: string }>`
    UPDATE event.atlas_run
    SET status = 'failed',
        terminal_at = ${input.terminalAt},
        terminal_error_class = ${STALE_RUN_ERROR_CLASS},
        updated_at = ${input.terminalAt},
        updated_by = ${scope.principalId}::uuid
    WHERE tenant_id = ${scope.tenantId}::uuid
      AND conversation_id = ${input.threadId}::uuid
      AND plane = ${scope.plane}
      AND principal_id = ${scope.principalId}::uuid
      AND id = ${locked.run_id}::uuid
      AND status = 'started'
      AND started_at <= ${input.staleBefore}
    RETURNING id
  `.execute(trx);
  if (!terminal.rows[0]) {
    throw new AtlasThreadRepositoryError("RUN_TERMINAL");
  }
  return true;
}

async function selectRunByClientRequest(
  trx: AnyDb,
  scope: AtlasThreadRepositoryScope,
  clientRequestId: string,
  forUpdate = false,
): Promise<BeginAtlasRunResult | null> {
  const query = sql<RunRow>`
    ${runSelectSql(scope)}
    AND r.client_request_id = ${clientRequestId}::uuid
    AND EXISTS (
      SELECT 1
      FROM master.conversation c
      WHERE c.tenant_id = r.tenant_id
        AND c.id = r.conversation_id
        AND c.status <> 'deleted'
    )
    LIMIT 1
  `;
  const result = forUpdate
    ? await sql<RunRow>`${query} FOR UPDATE`.execute(trx)
    : await query.execute(trx);
  const existing = result.rows[0];
  if (!existing) return null;
  const sequences = await selectRunSequences(
    trx,
    scope,
    existing.input_message_id,
    existing.output_message_id,
  );
  return Object.freeze({
    replayed: true,
    run: mapRun(existing),
    inputSequence: sequences.input,
    outputSequence: sequences.output,
  });
}

async function insertThreadRows(
  trx: AnyDb,
  scope: AtlasThreadRepositoryScope,
  input: CreateAtlasThreadRecordInput,
): Promise<void> {
  await sql`
    INSERT INTO master.conversation (
      id, tenant_id, type, title, status, created_by
    ) VALUES (
      ${input.threadId}::uuid,
      ${scope.tenantId}::uuid,
      'atlas_agent',
      ${input.title},
      'active',
      ${scope.principalId}::uuid
    )
  `.execute(trx);
  // Live athyperapp RLS requires the Atlas scope row before the private owner
  // participant. The deferred envelope trigger validates that owner at commit.
  await sql`
    INSERT INTO master.atlas_thread (
      conversation_id,
      tenant_id,
      plane,
      owner_principal_id,
      retention_policy_id,
      expires_at,
      purge_after,
      created_by
    ) VALUES (
      ${input.threadId}::uuid,
      ${scope.tenantId}::uuid,
      ${scope.plane},
      ${scope.principalId}::uuid,
      ${input.retentionPolicyId},
      ${input.expiresAt},
      NULL,
      ${scope.principalId}::uuid
    )
  `.execute(trx);
  await sql`
    INSERT INTO master.conversation_participant (
      tenant_id,
      conversation_id,
      principal_id,
      role,
      created_by
    ) VALUES (
      ${scope.tenantId}::uuid,
      ${input.threadId}::uuid,
      ${scope.principalId}::uuid,
      'owner',
      ${scope.principalId}::uuid
    )
  `.execute(trx);
}

async function insertNewRunRows(
  trx: AnyDb,
  scope: AtlasThreadRepositoryScope,
  input: BeginAtlasRunInput,
  protectedInput: ProtectedAtlasMessageContent,
): Promise<BeginAtlasRunResult> {
  const inputMessage = await sql<SequenceRow>`
    INSERT INTO master.atlas_message (
      id,
      tenant_id,
      conversation_id,
      plane,
      role,
      content_blocks,
      protected_content_ref,
      status,
      run_id,
      terminal_at,
      created_at,
      created_by
    ) VALUES (
      ${input.inputMessageId}::uuid,
      ${scope.tenantId}::uuid,
      ${input.threadId}::uuid,
      ${scope.plane},
      'user',
      ${JSON.stringify(protectedInput.contentBlocks)}::jsonb,
      ${protectedInput.protectedContentRef},
      'completed',
      ${input.runId}::uuid,
      ${input.startedAt},
      ${input.startedAt},
      ${scope.principalId}::uuid
    )
    RETURNING sequence
  `.execute(trx);
  const inputSequence = inputMessage.rows[0]?.sequence;
  if (inputSequence === undefined) {
    throw new Error("Atlas input message sequence was not allocated.");
  }
  const outputMessage = await sql<SequenceRow>`
    INSERT INTO master.atlas_message (
      id,
      tenant_id,
      conversation_id,
      plane,
      role,
      content_blocks,
      status,
      run_id,
      parent_message_id,
      created_at,
      created_by
    ) VALUES (
      ${input.outputMessageId}::uuid,
      ${scope.tenantId}::uuid,
      ${input.threadId}::uuid,
      ${scope.plane},
      'assistant',
      '[]'::jsonb,
      'pending',
      ${input.runId}::uuid,
      ${input.inputMessageId}::uuid,
      ${input.startedAt},
      ${scope.principalId}::uuid
    )
    RETURNING sequence
  `.execute(trx);
  const outputSequence = outputMessage.rows[0]?.sequence;
  if (outputSequence === undefined) {
    throw new Error("Atlas output message sequence was not allocated.");
  }
  const runResult = await sql<RunRow>`
    INSERT INTO event.atlas_run (
      id,
      tenant_id,
      conversation_id,
      plane,
      principal_id,
      client_request_id,
      input_message_id,
      output_message_id,
      status,
      started_at,
      created_at,
      created_by
    ) VALUES (
      ${input.runId}::uuid,
      ${scope.tenantId}::uuid,
      ${input.threadId}::uuid,
      ${scope.plane},
      ${scope.principalId}::uuid,
      ${input.clientRequestId}::uuid,
      ${input.inputMessageId}::uuid,
      ${input.outputMessageId}::uuid,
      'started',
      ${input.startedAt},
      ${input.startedAt},
      ${scope.principalId}::uuid
    )
    RETURNING
      id AS run_id,
      conversation_id AS thread_id,
      plane,
      principal_id,
      client_request_id,
      input_message_id,
      output_message_id,
      status,
      cancellation_requested_at,
      terminal_at,
      terminal_error_class,
      metering_run_id,
      started_at
  `.execute(trx);
  const run = runResult.rows[0];
  if (!run) throw new Error("Atlas run was not persisted.");
  return Object.freeze({
    replayed: false,
    run: mapRun(run),
    inputSequence: integerText(inputSequence),
    outputSequence: integerText(outputSequence),
  });
}

function runSelectSql(scope: AtlasThreadRepositoryScope) {
  return sql<RunRow>`
    SELECT
      r.id AS run_id,
      r.conversation_id AS thread_id,
      r.plane,
      r.principal_id,
      r.client_request_id,
      r.input_message_id,
      r.output_message_id,
      r.status,
      r.cancellation_requested_at,
      r.terminal_at,
      r.terminal_error_class,
      r.metering_run_id,
      r.started_at
    FROM event.atlas_run r
    WHERE r.tenant_id = ${scope.tenantId}::uuid
      AND r.plane = ${scope.plane}
      AND r.principal_id = ${scope.principalId}::uuid
  `;
}

async function selectThread(
  trx: AnyDb,
  scope: AtlasThreadRepositoryScope,
  threadId: string,
): Promise<ThreadRow | null> {
  const result = await sql<ThreadRow>`
    SELECT
      c.id AS thread_id,
      c.tenant_id,
      t.plane,
      t.owner_principal_id,
      c.title,
      c.status,
      t.row_version,
      t.last_message_sequence,
      t.retention_policy_id,
      t.expires_at,
      t.purge_after,
      t.legal_hold,
      t.summary_version,
      c.created_at,
      COALESCE(t.updated_at, c.updated_at) AS updated_at,
      COALESCE(t.updated_at, c.updated_at, c.created_at) AS activity_at,
      cp.role AS participant_role,
      cp.principal_id AS access_principal_id
    FROM master.atlas_thread t
    JOIN master.conversation c
      ON c.tenant_id = t.tenant_id
     AND c.id = t.conversation_id
    JOIN master.conversation_participant cp
      ON cp.tenant_id = t.tenant_id
     AND cp.conversation_id = t.conversation_id
     AND cp.principal_id = ${scope.principalId}::uuid
     AND cp.left_at IS NULL
    WHERE t.tenant_id = ${scope.tenantId}::uuid
      AND t.conversation_id = ${threadId}::uuid
      AND t.plane = ${scope.plane}
      AND c.status <> 'deleted'
    LIMIT 1
  `.execute(trx);
  return result.rows[0] ?? null;
}

async function selectRunSequences(
  trx: AnyDb,
  scope: AtlasThreadRepositoryScope,
  inputMessageId: string,
  outputMessageId: string,
): Promise<{ input: string; output: string }> {
  const result = await sql<{ id: string; sequence: ScalarInteger }>`
    SELECT id, sequence
    FROM master.atlas_message
    WHERE tenant_id = ${scope.tenantId}::uuid
      AND plane = ${scope.plane}
      AND id IN (${inputMessageId}::uuid, ${outputMessageId}::uuid)
  `.execute(trx);
  const input = result.rows.find((row) => row.id === inputMessageId);
  const output = result.rows.find((row) => row.id === outputMessageId);
  if (!input || !output) {
    throw new Error("An idempotent Atlas run is missing its message pair.");
  }
  return {
    input: integerText(input.sequence),
    output: integerText(output.sequence),
  };
}

function mapThread(row: ThreadRow): AtlasThreadRecord {
  const plane = atlasPlane(row.plane);
  const status =
    row.status === "active"
    || row.status === "archived"
    || row.status === "deleted"
      ? row.status
      : invalidStoredValue("thread status");
  const participantRole =
    row.participant_role === "owner"
    || row.participant_role === "admin"
    || row.participant_role === "member"
    || row.participant_role === "observer"
      ? row.participant_role
      : invalidStoredValue("participant role");
  return Object.freeze({
    threadId: row.thread_id,
    tenantId: row.tenant_id,
    plane,
    ownerPrincipalId: row.owner_principal_id,
    title: row.title,
    status,
    rowVersion: integerText(row.row_version),
    lastMessageSequence: integerText(row.last_message_sequence, true),
    retention: Object.freeze({
      policyId: row.retention_policy_id,
      expiresAt: optionalDate(row.expires_at, "expires_at"),
      purgeAfter: optionalDate(row.purge_after, "purge_after"),
      legalHold: row.legal_hold === true,
    }),
    summaryVersion: safeInteger(row.summary_version, "summary_version"),
    createdAt: requiredDate(row.created_at, "created_at"),
    updatedAt: optionalDate(row.updated_at, "updated_at"),
    access: Object.freeze({
      participantRole,
      owner:
        row.owner_principal_id === row.access_principal_id
        && participantRole === "owner",
    }),
  });
}

function mapMessage(
  row: MessageRow,
  protectedContentBlocks?: readonly AtlasStoredContentBlock[],
): AtlasMessageRecord {
  const role =
    row.role === "user"
    || row.role === "assistant"
    || row.role === "tool"
    || row.role === "system"
      ? row.role
      : invalidStoredValue("message role");
  const status =
    row.status === "pending"
    || row.status === "completed"
    || row.status === "failed"
    || row.status === "cancelled"
      ? row.status
      : invalidStoredValue("message status");
  return Object.freeze({
    messageId: row.message_id,
    threadId: row.thread_id,
    plane: atlasPlane(row.plane),
    sequence: integerText(row.sequence),
    role,
    status,
    contentBlocks: protectedContentBlocks
      ?? jsonObjectArray(row.content_blocks, "content_blocks"),
    runId: row.run_id,
    parentMessageId: row.parent_message_id,
    resultCards: jsonArray(row.result_cards, "result_cards"),
    citationRefs: jsonArray(row.citation_refs, "citation_refs"),
    toolRefs: jsonArray(row.tool_refs, "tool_refs"),
    terminalErrorClass: row.terminal_error_class,
    createdAt: requiredDate(row.created_at, "created_at"),
    terminalAt: optionalDate(row.terminal_at, "terminal_at"),
  });
}

function mapRun(row: RunRow): AtlasRunRecord {
  const status =
    row.status === "started"
    || row.status === "completed"
    || row.status === "failed"
    || row.status === "cancelled"
      ? row.status
      : invalidStoredValue("run status");
  return Object.freeze({
    runId: row.run_id,
    threadId: row.thread_id,
    plane: atlasPlane(row.plane),
    principalId: row.principal_id,
    clientRequestId: row.client_request_id,
    inputMessageId: row.input_message_id,
    outputMessageId: row.output_message_id,
    status,
    cancellationRequestedAt: optionalDate(
      row.cancellation_requested_at,
      "cancellation_requested_at",
    ),
    terminalAt: optionalDate(row.terminal_at, "terminal_at"),
    terminalErrorClass: row.terminal_error_class,
    meteringRunId: row.metering_run_id,
    startedAt: requiredDate(row.started_at, "started_at"),
  });
}

function atlasPlane(value: string): "neon" | "mesh" | "admin" {
  if (value === "neon" || value === "mesh" || value === "admin") return value;
  return invalidStoredValue("plane");
}

function integerText(value: ScalarInteger, allowZero = false): string {
  const text = String(value);
  const pattern = allowZero ? /^(0|[1-9][0-9]*)$/ : /^[1-9][0-9]*$/;
  if (!pattern.test(text)) return invalidStoredValue("integer");
  return text;
}

function safeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    return invalidStoredValue(field);
  }
  return value;
}

function requiredDate(value: Date | string, field: string): Date {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return invalidStoredValue(field);
  return date;
}

function optionalDate(
  value: Date | string | null,
  field: string,
): Date | null {
  return value === null ? null : requiredDate(value, field);
}

function jsonObjectArray(
  value: unknown,
  field: string,
): readonly AtlasStoredContentBlock[] {
  const array = jsonArray(value, field);
  for (const item of array) {
    if (
      item == null
      || typeof item !== "object"
      || Array.isArray(item)
      || typeof (item as { type?: unknown }).type !== "string"
    ) {
      return invalidStoredValue(field);
    }
  }
  return array as readonly AtlasStoredContentBlock[];
}

function jsonArray(
  value: unknown,
  field: string,
): readonly AtlasStoredJson[] {
  if (!Array.isArray(value)) return invalidStoredValue(field);
  return Object.freeze(value as AtlasStoredJson[]);
}

function invalidStoredValue(field: string): never {
  throw new Error(`Invalid Atlas persistence value: ${field}.`);
}

function postgresConstraint(error: unknown): string | null {
  if (error == null || typeof error !== "object") return null;
  const value = (error as { constraint?: unknown }).constraint;
  return typeof value === "string" ? value : null;
}
