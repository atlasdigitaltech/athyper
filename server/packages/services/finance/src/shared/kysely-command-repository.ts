import type { FinanceCommand, FinanceCommandRepository, FinanceCommandResult } from "@athyper/server-contract-finance";
import { sql, type Transaction } from "kysely";
import { verifyFinanceCommand } from "./canonical.js";

type Database = Record<string, never>;
type Row = Record<string, unknown>;

/** Durable idempotency boundary. The caller owns the surrounding business transaction. */
export class KyselyFinanceCommandRepository implements FinanceCommandRepository<Transaction<Database>> {
  async execute<Payload extends Readonly<Record<string, unknown>>, Output extends Readonly<Record<string, unknown>>>(command: FinanceCommand<Payload>, transaction: Transaction<Database>, apply: (transaction: Transaction<Database>) => Promise<{ readonly resourceId: string; readonly version: number; readonly output: Output }>): Promise<FinanceCommandResult<Output>> {
    verifyFinanceCommand(command);
    const inserted = await sql<Row>`
      INSERT INTO event.command_execution(id,tenant_id,command_code,idempotency_key,request_fingerprint,status,actor_principal_id,source_service,correlation_id,created_by)
      VALUES(${command.commandId}::uuid,${command.actor.tenantId}::uuid,${command.commandCode},${command.idempotencyKey},${command.requestFingerprint},'received',${command.actor.principalId}::uuid,'finance',${command.actor.correlationId}::uuid,${command.actor.principalId}::uuid)
      ON CONFLICT(tenant_id,command_code,idempotency_key) DO NOTHING
      RETURNING *
    `.execute(transaction);
    const row = inserted.rows[0] ?? (await sql<Row>`SELECT * FROM event.command_execution WHERE tenant_id=${command.actor.tenantId}::uuid AND command_code=${command.commandCode} AND idempotency_key=${command.idempotencyKey} FOR UPDATE`.execute(transaction)).rows[0];
    if (!row) throw new Error("FINANCE_COMMAND_RESERVATION_FAILED");
    const existingCommandId = String(row["id"]);
    if (String(row["request_fingerprint"]) !== command.requestFingerprint) return { kind: "idempotency_conflict", commandId: command.commandId, existingCommandId };
    if (!inserted.rows[0]) return replay<Output>(row, command.commandId);
    const startedAt = new Date().toISOString();
    await sql`UPDATE event.command_execution SET status='processing',started_at=${startedAt}::timestamptz,status_changed_at=${startedAt}::timestamptz,status_changed_by=${command.actor.principalId}::uuid,updated_at=${startedAt}::timestamptz,updated_by=${command.actor.principalId}::uuid WHERE id=${command.commandId}::uuid`.execute(transaction);
    const applied = await apply(transaction);
    const completedAt = new Date().toISOString();
    const resultPayload = { resourceId: applied.resourceId, version: applied.version, output: applied.output };
    await sql`UPDATE event.command_execution SET status='succeeded',result_payload=${JSON.stringify(resultPayload)}::jsonb,completed_at=${completedAt}::timestamptz,status_changed_at=${completedAt}::timestamptz,status_changed_by=${command.actor.principalId}::uuid,updated_at=${completedAt}::timestamptz,updated_by=${command.actor.principalId}::uuid WHERE id=${command.commandId}::uuid`.execute(transaction);
    return { kind: "applied", commandId: command.commandId, ...applied };
  }
}

function replay<Output extends Readonly<Record<string, unknown>>>(row: Row, requestedCommandId: string): FinanceCommandResult<Output> {
  if (row["status"] !== "succeeded") throw Object.assign(new Error("FINANCE_COMMAND_IN_PROGRESS"), { retryable: true, commandId: String(row["id"]) });
  const payload = object(row["result_payload"]);
  const output = object(payload["output"]) as Output;
  return { kind: "replayed", commandId: String(row["id"] ?? requestedCommandId), resourceId: String(payload["resourceId"]), version: Number(payload["version"]), output };
}
function object(value: unknown): Record<string, unknown> { if (typeof value === "string") { try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; } } return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
