import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { HttpError } from "@athyper/server-runtime-http";
import { createHash, randomUUID } from "node:crypto";
import type {
  JsonValue,
  RuntimeApprovalDecision,
  RuntimeCommandHistoryEntry,
  RuntimeCommandSubmission,
} from "@athyper/server-contract-control-admin";
import { sql, type Kysely, type Transaction } from "kysely";
import type {
  RuntimeCommandStore,
  RuntimeCommandTransaction,
  StoredRuntimeCommandApproval,
  StoredRuntimeCommandSubmission,
} from "./runtime-command-service.js";

type Database = Record<string, never>;
type Row = Record<string, unknown>;

/** PostgreSQL-backed append-only runtime command, approval, and history ledger. */
export class KyselyRuntimeCommandStore implements RuntimeCommandStore {
  constructor(private readonly db: Kysely<Database>) {}

  private inTransaction<T>(
    work: (transaction: Transaction<Database>) => Promise<T>,
  ): Promise<T> {
    return this.db.isTransaction
      ? work(this.db as Transaction<Database>)
      : this.db.transaction().execute(work);
  }
  async atomic<T>(
    context: VerifiedRequestContext,
    key: string,
    work: (
      store: RuntimeCommandStore,
      transaction: RuntimeCommandTransaction,
    ) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.inTransaction(async (transaction) => {
        const plane = (
          await sql<Row>`SELECT current_setting('app.database_plane',true) AS plane`.execute(
            transaction,
          )
        ).rows[0]?.["plane"];
        if (plane !== context.planeKey)
          throw coded("CONTROL_ADMIN_RUNTIME_PLANE_MISMATCH", 503);
        await sql`SELECT set_config('app.current_tenant_id',${context.tenantId},true),set_config('app.current_principal_id',${context.principalId},true),set_config('app.current_actor_type','user',true)`.execute(
          transaction,
        );
        await sql`SET LOCAL lock_timeout = '5s'`.execute(transaction);
        await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.planeKey}:${context.tenantId}:${key}`},0))`.execute(
          transaction,
        );
        return work(new KyselyRuntimeCommandStore(transaction), {
          kind: "postgres",
          database: transaction,
        });
      });
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (["40001", "40P01", "55P03"].includes(code ?? ""))
        throw coded("CONTROL_ADMIN_RUNTIME_TRANSACTION_CONFLICT", 409);
      throw error;
    }
  }
  async findSubmission(
    tenantId: string,
    idempotencyKey: string,
  ): Promise<StoredRuntimeCommandSubmission | undefined> {
    const row = (
      await sql<Row>`
      SELECT plane_code,idempotency_key,fingerprint,submission,created_by
        FROM ops.control_runtime_command_submission
       WHERE tenant_id=${tenantId}::uuid AND idempotency_key=${idempotencyKey}
       ORDER BY CASE outcome WHEN 'applied' THEN 4 WHEN 'failed' THEN 3 WHEN 'pending' THEN 2 ELSE 1 END DESC, occurred_at DESC
       LIMIT 1
    `.execute(this.db)
    ).rows[0];
    return row ? submissionRow(tenantId, row) : undefined;
  }

  async appendSubmission(
    record: StoredRuntimeCommandSubmission,
  ): Promise<boolean> {
    return this.inTransaction(async (transaction) => {
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${record.tenantId}:${record.idempotencyKey}`},0))`.execute(
        transaction,
      );
      const existing = await new KyselyRuntimeCommandStore(
        transaction,
      ).findSubmission(record.tenantId, record.idempotencyKey);
      if (
        existing &&
        (existing.fingerprint !== record.fingerprint ||
          existing.actorId !== record.actorId ||
          existing.planeKey !== record.planeKey)
      )
        throw coded("CONTROL_ADMIN_IDEMPOTENCY_CONFLICT", 409);
      const outcome =
        record.submission.outcome === "replayed"
          ? "applied"
          : record.submission.outcome;
      const allowed = existing
        ? existing.submission.outcome === "approval_required"
          ? outcome === "pending"
          : existing.submission.outcome === "pending"
            ? outcome === "applied" || outcome === "failed"
            : false
        : outcome === "approval_required" || outcome === "pending";
      if (!allowed) return false;
      const result = await sql<Row>`
      INSERT INTO ops.control_runtime_command_submission
        (tenant_id,plane_code,command_id,idempotency_key,fingerprint,outcome,submission,created_by)
      VALUES
        (${record.tenantId}::uuid,${record.planeKey},${record.submission.commandId},${record.idempotencyKey},
         ${record.fingerprint},${outcome},${JSON.stringify(record.submission)}::jsonb,
         ${record.actorId}::uuid)
      ON CONFLICT (tenant_id,idempotency_key,outcome) DO NOTHING
      RETURNING id
    `.execute(transaction);
      return Boolean(result.rows[0]);
    });
  }

  async appendApprovalRequest(
    approval: StoredRuntimeCommandApproval,
  ): Promise<void> {
    const result = await sql<Row>`
      INSERT INTO ops.control_runtime_command_approval_request
        (id,tenant_id,plane_code,command_id,kind,command_fingerprint,preview_fingerprint,requested_by,requested_at)
      VALUES
        (${approval.approvalId}::uuid,${approval.tenantId}::uuid,${approval.planeKey},${approval.commandId},
         ${approval.kind},${approval.commandFingerprint},${approval.previewFingerprint ?? null},${approval.requestedBy}::uuid,${approval.requestedAt}::timestamptz)
      ON CONFLICT (id) DO NOTHING RETURNING id
    `.execute(this.db);
    if (!result.rows[0]) {
      const existing = await this.getApproval(approval.approvalId);
      if (
        !existing ||
        existing.commandFingerprint !== approval.commandFingerprint ||
        existing?.previewFingerprint !== approval.previewFingerprint ||
        existing?.requestedBy !== approval.requestedBy ||
        existing?.tenantId !== approval.tenantId ||
        existing?.planeKey !== approval.planeKey
      )
        throw coded("CONTROL_ADMIN_IDEMPOTENCY_CONFLICT", 409);
    }
  }

  async appendApprovalDecision(input: {
    readonly approvalId: string;
    readonly decision: RuntimeApprovalDecision;
    readonly decidedBy: string;
    readonly decidedAt: string;
    readonly reason: string;
  }): Promise<StoredRuntimeCommandApproval> {
    const result = await sql<Row>`
      INSERT INTO ops.control_runtime_command_approval_decision
        (approval_id,decision,reason,decided_by,decided_at)
      VALUES
        (${input.approvalId}::uuid,${input.decision},${input.reason},${input.decidedBy}::uuid,${input.decidedAt}::timestamptz)
      ON CONFLICT (approval_id) DO NOTHING RETURNING approval_id
    `.execute(this.db);
    if (!result.rows[0]) throw coded("CONTROL_ADMIN_APPROVAL_INVALID", 409);
    const approval = await this.getApproval(input.approvalId);
    if (!approval) throw coded("CONTROL_ADMIN_APPROVAL_NOT_FOUND", 404);
    return approval;
  }

  async getApproval(
    approvalId: string,
  ): Promise<StoredRuntimeCommandApproval | undefined> {
    const row = (
      await sql<Row>`
      SELECT request.*,decision.decision,decision.reason AS decision_reason,
             decision.decided_by,decision.decided_at
        FROM ops.control_runtime_command_approval_request request
        LEFT JOIN ops.control_runtime_command_approval_decision decision ON decision.approval_id=request.id
       WHERE request.id=${approvalId}::uuid
    `.execute(this.db)
    ).rows[0];
    return row ? approvalRow(row) : undefined;
  }

  async appendHistory(
    input: Omit<
      RuntimeCommandHistoryEntry,
      "historyId" | "entryHash" | "previousHash"
    >,
  ): Promise<RuntimeCommandHistoryEntry> {
    return this.inTransaction(async (transaction) => {
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.planeKey}:${input.tenantId}`},0))`.execute(
        transaction,
      );
      const previousHash =
        String(
          (
            await sql<Row>`
        SELECT entry_hash FROM ops.control_runtime_command_history
         WHERE tenant_id=${input.tenantId}::uuid AND plane_code=${input.planeKey}
         ORDER BY sequence_no DESC LIMIT 1
      `.execute(transaction)
          ).rows[0]?.["entry_hash"] ?? "",
        ) || undefined;
      const historyId = randomUUID();
      const entryHash = sha256(
        canonical({ ...input, historyId, previousHash: previousHash ?? null }),
      );
      const row = (
        await sql<Row>`
        INSERT INTO ops.control_runtime_command_history
          (id,tenant_id,plane_code,command_id,kind,event,actor_id,reason,fingerprint,detail,
           occurred_at,previous_hash,entry_hash)
        VALUES
          (${historyId}::uuid,${input.tenantId}::uuid,${input.planeKey},${input.commandId},${input.kind},
           ${input.event},${input.actorId}::uuid,${input.reason},${input.fingerprint},
           ${JSON.stringify(input.detail)}::jsonb,${input.occurredAt}::timestamptz,
           ${previousHash ?? null},${entryHash})
        RETURNING *
      `.execute(transaction)
      ).rows[0]!;
      return historyRow(row);
    });
  }

  async listHistory(input: {
    readonly tenantId: string;
    readonly limit: number;
  }): Promise<readonly RuntimeCommandHistoryEntry[]> {
    const rows = (
      await sql<Row>`
      SELECT * FROM ops.control_runtime_command_history
       WHERE tenant_id=${input.tenantId}::uuid
       ORDER BY sequence_no DESC LIMIT ${input.limit}
    `.execute(this.db)
    ).rows;
    return rows.map(historyRow);
  }

  async health(): Promise<void> {
    await sql`SELECT 1 FROM ops.control_runtime_command_history LIMIT 1`.execute(
      this.db,
    );
    await sql`SELECT preview_fingerprint FROM ops.control_runtime_command_approval_request LIMIT 0`.execute(
      this.db,
    );
  }
}

function submissionRow(
  tenantId: string,
  row: Row,
): StoredRuntimeCommandSubmission {
  return {
    tenantId,
    planeKey: String(
      row["plane_code"],
    ) as StoredRuntimeCommandSubmission["planeKey"],
    actorId: String(row["created_by"]),
    idempotencyKey: String(row["idempotency_key"]),
    fingerprint: String(row["fingerprint"]),
    submission: object(
      row["submission"],
    ) as unknown as RuntimeCommandSubmission,
  };
}
function approvalRow(row: Row): StoredRuntimeCommandApproval {
  const decision =
    row["decision"] == null
      ? undefined
      : (String(row["decision"]) as RuntimeApprovalDecision);
  return {
    approvalId: String(row["id"]),
    commandId: String(row["command_id"]),
    commandFingerprint: String(row["command_fingerprint"]),
    ...(row["preview_fingerprint"] == null
      ? {}
      : { previewFingerprint: String(row["preview_fingerprint"]) }),
    requestedBy: String(row["requested_by"]),
    requestedAt: new Date(String(row["requested_at"])).toISOString(),
    status: decision ?? "pending",
    kind: String(row["kind"]),
    tenantId: String(row["tenant_id"]),
    planeKey: String(
      row["plane_code"],
    ) as StoredRuntimeCommandApproval["planeKey"],
    ...(decision
      ? {
          decidedBy: String(row["decided_by"]),
          decidedAt: new Date(String(row["decided_at"])).toISOString(),
          decisionReason: String(row["decision_reason"]),
        }
      : {}),
  };
}
function historyRow(row: Row): RuntimeCommandHistoryEntry {
  return {
    historyId: String(row["id"]),
    commandId: String(row["command_id"]),
    kind: String(row["kind"]),
    event: String(row["event"]) as RuntimeCommandHistoryEntry["event"],
    planeKey: String(
      row["plane_code"],
    ) as RuntimeCommandHistoryEntry["planeKey"],
    tenantId: String(row["tenant_id"]),
    actorId: String(row["actor_id"]),
    reason: String(row["reason"]),
    fingerprint: String(row["fingerprint"]),
    detail: object(row["detail"]) as Readonly<Record<string, JsonValue>>,
    occurredAt: new Date(String(row["occurred_at"])).toISOString(),
    ...(row["previous_hash"] == null
      ? {}
      : { previousHash: String(row["previous_hash"]) }),
    entryHash: String(row["entry_hash"]),
  };
}
function object(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
function coded(code: string, status: number): HttpError {
  return new HttpError(status, code, code);
}
