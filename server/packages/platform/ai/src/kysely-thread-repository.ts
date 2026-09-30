import type {
  AtlasMessage,
  AtlasThread,
  AtlasThreadRepository,
} from "@athyper/server-contract-ai";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import { sql, type Transaction } from "kysely";
import { assertAtlasContext } from "./context.js";
import { AtlasServiceError } from "./errors.js";

type Tx = Transaction<Record<string, never>>;
type Row = Record<string, any>;
type Input<K extends keyof AtlasThreadRepository> = Parameters<
  AtlasThreadRepository[K]
>[0];
const visible = sql`c.deleted_at IS NULL AND c.status <> 'deleted' AND (t.expires_at IS NULL OR t.expires_at > now() OR t.legal_hold)`;
const selection = sql<Row>`SELECT t.*, t.created_at::text AS cursor_created_at, c.title, c.status,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('principalId',p.principal_id,'role',p.role,
    'joinedAt',p.joined_at,'revokedAt',p.left_at) ORDER BY p.joined_at,p.principal_id)
    FROM document.conversation_participant p WHERE p.tenant_id=t.tenant_id AND p.conversation_id=t.conversation_id), '[]'::jsonb) AS participants
  FROM ai.atlas_thread t JOIN document.conversation c ON c.tenant_id=t.tenant_id AND c.id=t.conversation_id`;

/** Every operation selects the verified plane database and establishes transaction-local RLS scope. */
export class KyselyAtlasThreadRepository implements AtlasThreadRepository {
  constructor(private readonly transactions: PlaneTransactionCoordinator<Tx>) {}
  private transaction<T>(
    context: VerifiedRequestContext,
    work: (tx: Tx) => Promise<T>,
  ): Promise<T> {
    assertAtlasContext(context);
    return this.transactions.run(
      context.planeKey,
      { tenantId: context.tenantId, principalId: context.principalId },
      async (tx) => {
        await sql`SELECT set_config('app.current_atlas_plane',${context.planeKey},true)`.execute(
          tx,
        );
        return work(tx);
      },
    );
  }
  private async read(
    tx: Tx,
    context: VerifiedRequestContext,
    id: string,
  ): Promise<AtlasThread | null> {
    const result =
      await sql<Row>`${selection} WHERE t.tenant_id=${context.tenantId}::uuid AND t.plane=${context.planeKey}
      AND t.conversation_id=${id}::uuid AND ${visible}
      AND ai.fn_atlas_conversation_access(t.tenant_id,t.conversation_id,false)`.execute(
        tx,
      );
    return result.rows[0] ? thread(result.rows[0]) : null;
  }
  create(input: Input<"create">): Promise<AtlasThread> {
    return this.transaction(input.context, async (tx) => {
      const c = input.context;
      await sql`INSERT INTO document.conversation(id,tenant_id,type,title,status,created_by)
        VALUES(${input.threadId}::uuid,${c.tenantId}::uuid,'atlas_agent',${input.title},'active',${c.principalId}::uuid)`.execute(
        tx,
      );
      await sql`INSERT INTO ai.atlas_thread(conversation_id,tenant_id,plane,owner_principal_id,retention_policy_id,expires_at,purge_after,legal_hold,created_by)
        VALUES(${input.threadId}::uuid,${c.tenantId}::uuid,${c.planeKey},${c.principalId}::uuid,${input.retention.policyId},
        ${input.retention.expiresAt}::timestamptz,${input.retention.purgeAfter}::timestamptz,${input.retention.legalHold},${c.principalId}::uuid)`.execute(
        tx,
      );
      await sql`INSERT INTO document.conversation_participant(tenant_id,conversation_id,principal_id,role,created_by)
        VALUES(${c.tenantId}::uuid,${input.threadId}::uuid,${c.principalId}::uuid,'owner',${c.principalId}::uuid)`.execute(
        tx,
      );
      const result = await this.read(tx, c, input.threadId);
      if (!result)
        throw new Error("Created Atlas thread is not visible to its owner");
      return result;
    });
  }
  list(input: Input<"list">) {
    const cursor = input.cursor ? decodeCursor(input.cursor) : undefined;
    return this.transaction(input.context, async (tx) => {
      const result =
        await sql<Row>`${selection} WHERE t.tenant_id=${input.context.tenantId}::uuid AND t.plane=${input.context.planeKey}
        AND ${visible} AND ai.fn_atlas_conversation_access(t.tenant_id,t.conversation_id,false)
        ${input.status === "all" ? sql`` : sql`AND c.status=${input.status}`}
        ${cursor ? sql`AND (t.created_at,t.conversation_id)<(${cursor.at}::timestamptz,${cursor.id}::uuid)` : sql``}
        ORDER BY t.created_at DESC,t.conversation_id DESC LIMIT ${input.limit + 1}`.execute(
          tx,
        );
      const rows = result.rows.slice(0, input.limit),
        last = rows.at(-1);
      return {
        items: rows.map(thread),
        nextCursor:
          result.rows.length > input.limit && last
            ? Buffer.from(
                JSON.stringify({
                  at: last.cursor_created_at,
                  id: last.conversation_id,
                }),
              ).toString("base64url")
            : null,
      };
    });
  }
  get(input: Input<"get">) {
    return this.transaction(input.context, (tx) =>
      this.read(tx, input.context, input.threadId),
    );
  }
  listMessages(input: Input<"listMessages">) {
    return this.transaction(input.context, async (tx) => {
      const rows = (
        await sql<Row>`SELECT * FROM ai.atlas_message WHERE tenant_id=${input.context.tenantId}::uuid
        AND plane=${input.context.planeKey} AND conversation_id=${input.threadId}::uuid
        AND ai.fn_atlas_conversation_access(tenant_id,conversation_id,false)
        ${input.beforeSequence === undefined ? sql`` : sql`AND sequence<${input.beforeSequence}`}
        ORDER BY sequence DESC LIMIT ${input.limit + 1}`.execute(tx)
      ).rows;
      const page = rows.slice(0, input.limit);
      return {
        items: page.map(message),
        nextCursor:
          rows.length > input.limit ? String(page.at(-1)!.sequence) : null,
      };
    });
  }
  private async lock(
    tx: Tx,
    input: {
      context: VerifiedRequestContext;
      threadId: string;
      expectedRowVersion: number;
    },
  ) {
    return (
      (
        await sql<Row>`SELECT t.conversation_id FROM ai.atlas_thread t JOIN document.conversation c
      ON c.tenant_id=t.tenant_id AND c.id=t.conversation_id WHERE t.tenant_id=${input.context.tenantId}::uuid
      AND t.plane=${input.context.planeKey} AND t.conversation_id=${input.threadId}::uuid
      AND t.owner_principal_id=${input.context.principalId}::uuid AND t.row_version=${input.expectedRowVersion}
      AND ${visible} FOR UPDATE OF t`.execute(tx)
      ).rows.length > 0
    );
  }
  private async touch(
    tx: Tx,
    input: { context: VerifiedRequestContext; threadId: string },
  ) {
    await sql`UPDATE ai.atlas_thread SET updated_at=now(),updated_by=${input.context.principalId}::uuid
      WHERE tenant_id=${input.context.tenantId}::uuid AND plane=${input.context.planeKey} AND conversation_id=${input.threadId}::uuid`.execute(
      tx,
    );
  }
  rename(input: Input<"rename">) {
    return this.transaction(input.context, async (tx) => {
      if (!(await this.lock(tx, input))) return null;
      await sql`UPDATE document.conversation SET title=${input.title},updated_at=now(),updated_by=${input.context.principalId}::uuid
        WHERE tenant_id=${input.context.tenantId}::uuid AND id=${input.threadId}::uuid`.execute(
        tx,
      );
      await this.touch(tx, input);
      return this.read(tx, input.context, input.threadId);
    });
  }
  archive(input: Input<"archive">) {
    return this.transaction(input.context, async (tx) => {
      if (!(await this.lock(tx, input))) return null;
      await sql`UPDATE document.conversation SET status='archived',status_changed_at=now(),status_changed_by=${input.context.principalId}::uuid,
        updated_at=now(),updated_by=${input.context.principalId}::uuid WHERE tenant_id=${input.context.tenantId}::uuid AND id=${input.threadId}::uuid`.execute(
        tx,
      );
      await this.touch(tx, input);
      return this.read(tx, input.context, input.threadId);
    });
  }
  softDelete(input: Input<"softDelete">) {
    return this.transaction(input.context, async (tx) => {
      if (!(await this.lock(tx, input))) return false;
      const held = (
        await sql<Row>`SELECT legal_hold FROM ai.atlas_thread WHERE tenant_id=${input.context.tenantId}::uuid AND conversation_id=${input.threadId}::uuid`.execute(
          tx,
        )
      ).rows[0];
      if (held?.legal_hold)
        throw new AtlasServiceError(
          "PERMISSION_DENIED",
          "The Atlas thread is subject to legal hold.",
        );
      await sql`UPDATE document.conversation SET status='deleted',deleted_at=${input.deletedAt}::timestamptz,deleted_by=${input.context.principalId}::uuid,
        status_changed_at=now(),status_changed_by=${input.context.principalId}::uuid,updated_at=now(),updated_by=${input.context.principalId}::uuid
        WHERE tenant_id=${input.context.tenantId}::uuid AND id=${input.threadId}::uuid`.execute(
        tx,
      );
      await this.touch(tx, input);
      return true;
    });
  }
  putParticipant(input: Input<"putParticipant">) {
    return this.transaction(input.context, async (tx) => {
      if (!(await this.lock(tx, input))) return null;
      await sql`INSERT INTO document.conversation_participant(tenant_id,conversation_id,principal_id,role,created_by)
        VALUES(${input.context.tenantId}::uuid,${input.threadId}::uuid,${input.principalId}::uuid,${input.role},${input.context.principalId}::uuid)
        ON CONFLICT(tenant_id,conversation_id,principal_id) DO UPDATE SET role=EXCLUDED.role,left_at=NULL,left_by=NULL,leave_reason=NULL,
        updated_at=now(),updated_by=${input.context.principalId}::uuid`.execute(
        tx,
      );
      await this.touch(tx, input);
      return this.read(tx, input.context, input.threadId);
    });
  }
  revokeParticipant(input: Input<"revokeParticipant">) {
    return this.transaction(input.context, async (tx) => {
      if (!(await this.lock(tx, input))) return null;
      await sql`UPDATE document.conversation_participant SET left_at=now(),left_by=${input.context.principalId}::uuid,
        updated_at=now(),updated_by=${input.context.principalId}::uuid WHERE tenant_id=${input.context.tenantId}::uuid
        AND conversation_id=${input.threadId}::uuid AND principal_id=${input.principalId}::uuid AND role<>'owner' AND left_at IS NULL`.execute(
        tx,
      );
      await this.touch(tx, input);
      return this.read(tx, input.context, input.threadId);
    });
  }
}
function date(value: any): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}
function nullableDate(value: any): string | null {
  return value == null ? null : date(value);
}
function thread(row: Row): AtlasThread {
  return {
    threadId: row.conversation_id,
    tenantId: row.tenant_id,
    planeKey: row.plane,
    ownerPrincipalId: row.owner_principal_id,
    title: row.title,
    status: row.status,
    participants: row.participants.map((p: Row) => ({
      principalId: p.principalId,
      role: p.role,
      joinedAt: date(p.joinedAt),
      ...(p.revokedAt ? { revokedAt: date(p.revokedAt) } : {}),
    })),
    rowVersion: Number(row.row_version),
    lastMessageSequence: Number(row.last_message_sequence),
    retention: {
      policyId: row.retention_policy_id,
      expiresAt: nullableDate(row.expires_at),
      purgeAfter: nullableDate(row.purge_after),
      legalHold: row.legal_hold,
    },
    createdAt: date(row.created_at),
    updatedAt: date(row.updated_at ?? row.created_at),
  };
}
function message(row: Row): AtlasMessage {
  return {
    messageId: row.id,
    threadId: row.conversation_id,
    sequence: Number(row.sequence),
    role: row.role,
    status: row.status,
    content: row.content_blocks,
    runId: row.run_id,
    parentMessageId: row.parent_message_id,
    createdAt: date(row.created_at),
    terminalAt: nullableDate(row.terminal_at),
  };
}
function decodeCursor(value: string): { at: string; id: string } {
  try {
    if (value.length > 512) throw new Error();
    const cursor = JSON.parse(Buffer.from(value, "base64url").toString());
    if (
      typeof cursor.at !== "string" ||
      !Number.isFinite(Date.parse(cursor.at)) ||
      typeof cursor.id !== "string" ||
      !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(cursor.id)
    )
      throw new Error();
    return cursor;
  } catch {
    throw new AtlasServiceError(
      "INVALID_ARGUMENT",
      "Atlas history cursor is invalid.",
    );
  }
}
