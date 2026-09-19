import { sql } from "kysely";
import type { WorkerEngagementLifecycleRepository } from "./worker-engagement-lifecycle-service.js";
type Tx = { executeQuery?: unknown };
export class KyselyWorkerEngagementLifecycleRepository implements WorkerEngagementLifecycleRepository<Tx> {
  async activatePlacement(
    i: Parameters<
      WorkerEngagementLifecycleRepository<Tx>["activatePlacement"]
    >[0],
    tx: Tx,
  ) {
    const r = (
      await sql<any>`SELECT * FROM document.command_worker_operational_placement_activate(${i.tenantId}::uuid,${i.workerEngagementId}::uuid,${i.expectedVersion}::bigint,${i.idempotencyKey},${i.actorId}::uuid,${i.correlationId ?? null}::uuid,${i.effectiveFrom}::date,${i.effectiveUntil ?? null}::date,${i.companyCodeId}::uuid,${i.positionId ?? null}::uuid,${i.orgUnitId ?? null}::uuid,${i.managerEmployeeId ?? null}::uuid,${i.costCenterId ?? null}::uuid,${i.profitCenterId ?? null}::uuid,${i.projectId ?? null}::uuid,${i.siteId ?? null}::uuid,${i.allocationPercent}::numeric,${i.isPrimary}::boolean,${JSON.stringify(i.metadata)}::jsonb,${JSON.stringify(i.policyEvidence)}::jsonb)`.execute(
        tx as never,
      )
    ).rows[0];
    return r
      ? {
          workerEngagementId: r.worker_engagement_id,
          placementId: r.placement_id,
          engagementVersion: Number(r.engagement_version),
          outboxId: r.outbox_id,
          replayed: Boolean(r.replayed),
        }
      : null;
  }
  async endEngagement(
    i: Parameters<WorkerEngagementLifecycleRepository<Tx>["endEngagement"]>[0],
    tx: Tx,
  ) {
    const r = (
      await sql<any>`SELECT * FROM document.command_worker_engagement_terminate(${i.tenantId}::uuid,${i.workerEngagementId}::uuid,${i.expectedVersion}::bigint,${i.idempotencyKey},${i.actorId}::uuid,${i.correlationId ?? null}::uuid,${i.reasonCode},${i.effectiveAt}::timestamptz,${JSON.stringify(i.policyEvidence)}::jsonb)`.execute(
        tx as never,
      )
    ).rows[0];
    return r
      ? {
          workerEngagementId: r.worker_engagement_id,
          engagementVersion: Number(r.engagement_version),
          iamOutboxId: r.iam_outbox_id,
          iamDesiredHash: r.iam_desired_hash,
          outboxId: r.outbox_id,
          replayed: Boolean(r.replayed),
        }
      : null;
  }
}
