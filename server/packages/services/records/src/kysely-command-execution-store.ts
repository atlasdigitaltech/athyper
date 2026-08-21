import { sql, type Transaction } from "kysely";
import type { CommandExecutionStore } from "@athyper/server-contract-events";
import type { RecordMutationResult } from "@athyper/server-contract-records";

type Database = Record<string, never>;
type RecordTransaction = Transaction<Database>;

/** PostgreSQL adapter for event.command_execution. Every call requires the active record transaction. */
export function createKyselyCommandExecutionStore(): CommandExecutionStore<RecordTransaction, RecordMutationResult> {
  return {
    async begin(input, transaction) {
      const inserted = await sql<{ id: string }>`
        INSERT INTO event.command_execution
          (tenant_id, command_code, idempotency_key, request_fingerprint, status,
           actor_principal_id, source_service, correlation_id, started_at, created_by)
        VALUES
          (${input.tenantId}::uuid, ${input.commandCode}, ${input.idempotencyKey},
           ${input.requestFingerprint}, 'processing', ${input.actorPrincipalId}::uuid,
           ${input.sourceService}, ${input.correlationId ?? null}::uuid, clock_timestamp(),
           ${input.actorPrincipalId}::uuid)
        ON CONFLICT (tenant_id, command_code, idempotency_key) DO NOTHING
        RETURNING id
      `.execute(transaction);
      const executionId = inserted.rows[0]?.id;
      if (executionId) return { kind: "started", executionId };

      const existing = await sql<{
        id: string;
        request_fingerprint: string;
        status: string;
        result_payload: RecordMutationResult | null;
      }>`
        SELECT id, request_fingerprint, status, result_payload
          FROM event.command_execution
         WHERE tenant_id = ${input.tenantId}::uuid
           AND command_code = ${input.commandCode}
           AND idempotency_key = ${input.idempotencyKey}
         FOR UPDATE
      `.execute(transaction);
      const row = existing.rows[0];
      if (!row) throw new Error("Command execution disappeared after idempotency conflict");
      if (row.request_fingerprint.trim() !== input.requestFingerprint) return { kind: "conflict" };
      if (row.status === "succeeded" && row.result_payload) return { kind: "replay", result: row.result_payload };
      return { kind: "in_progress" };
    },

    async complete(executionId, result, actorPrincipalId, transaction) {
      const completed = await sql<{ id: string }>`
        UPDATE event.command_execution
           SET status = 'succeeded', result_payload = ${JSON.stringify(result)}::jsonb,
               completed_at = clock_timestamp(), status_changed_at = clock_timestamp(),
               status_changed_by = ${actorPrincipalId}::uuid,
               updated_at = clock_timestamp(), updated_by = ${actorPrincipalId}::uuid
         WHERE id = ${executionId}::uuid AND status = 'processing'
        RETURNING id
      `.execute(transaction);
      if (!completed.rows[0]) throw new Error("Command execution was not processing during completion");
    },
  };
}
