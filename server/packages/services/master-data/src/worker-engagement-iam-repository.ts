import { sql } from "kysely";
import type { WorkerEngagementIamRepository } from "./worker-engagement-iam-service.js";

type Tx = { executeQuery?: unknown };
type Row = { worker_engagement_id: string; desired_status: "active" | "suspended" | "deprovisioned"; desired_version: string | number; desired_hash: string; outbox_id: string; replayed: boolean };

export class KyselyWorkerEngagementIamRepository implements WorkerEngagementIamRepository<Tx> {
  async project(input: Parameters<WorkerEngagementIamRepository<Tx>["project"]>[0], transaction: Tx) {
    const row = (await sql<Row>`SELECT * FROM document.command_worker_engagement_iam_projection(
      ${input.tenantId}::uuid,${input.workerEngagementId}::uuid,${input.expectedVersion}::bigint,
      ${input.idempotencyKey},${input.actorId}::uuid,${input.correlationId ?? null}::uuid,
      ${JSON.stringify(input.policyEvidence)}::jsonb
    )`.execute(transaction as never)).rows[0];
    return row ? {
      workerEngagementId: row.worker_engagement_id,
      desiredStatus: row.desired_status,
      desiredVersion: Number(row.desired_version),
      desiredHash: row.desired_hash,
      outboxId: row.outbox_id,
      replayed: Boolean(row.replayed),
    } : null;
  }
}
