import { sql, type Kysely } from "kysely";
import type {
  JobExecutionResult,
  JobHandler,
} from "@athyper/server-contract-jobs";
import type { ObjectStorage } from "@athyper/server-contract-object-storage";
import type { PlaneKey } from "@athyper/server-foundation/context";
import type { MetricsRegistry } from "@athyper/server-foundation";

export const MAINTAIN_RECORD_TRANSFERS_JOB = "records.transfer.maintain";
export const RECORD_TRANSFER_MAINTENANCE_QUEUE = "records.transfer.maintenance";
type Database = Kysely<Record<string, never>>;
type Payload = {
  readonly planeKey: PlaneKey;
  readonly limit?: number;
  readonly stuckAfterMinutes?: number;
};
type Candidate = {
  tenant_id: string;
  transfer_kind: "import" | "export";
  transfer_id: string;
  artifact_kind: "source" | "error_report" | "artifact";
  object_key: string;
};

export function createRecordTransferMaintenanceHandler(options: {
  readonly databases: Readonly<Partial<Record<PlaneKey, Database>>>;
  readonly storage: ObjectStorage;
  readonly metrics?: MetricsRegistry;
  readonly now?: () => Date;
}): JobHandler<typeof MAINTAIN_RECORD_TRANSFERS_JOB, Payload> {
  return {
    async handle(job): Promise<JobExecutionResult> {
      const input = payload(job.data),
        database = options.databases[input.planeKey];
      if (!database)
        return { status: "discarded", reason: "plane_database_unavailable" };
      const now = (options.now?.() ?? new Date()).toISOString(),
        limit = Math.min(Math.max(input.limit ?? 500, 1), 5000),
        stuckAfter = Math.min(Math.max(input.stuckAfterMinutes ?? 15, 1), 1440);
      const candidates = (
        await sql<Candidate>`SELECT * FROM ops.record_transfer_cleanup_candidates(${input.planeKey},${now}::timestamptz,${limit})`.execute(
          database,
        )
      ).rows;
      let purged = 0,
        failed = 0;
      for (const candidate of candidates) {
        try {
          await options.storage.delete(candidate.object_key);
          const acknowledged = await sql<{
            acknowledged: boolean;
          }>`SELECT ops.acknowledge_record_transfer_cleanup(${input.planeKey},${candidate.tenant_id}::uuid,${candidate.transfer_kind},${candidate.transfer_id}::uuid,${candidate.artifact_kind},${candidate.object_key},${now}::timestamptz) AS acknowledged`.execute(
            database,
          );
          if (acknowledged.rows[0]?.acknowledged) purged += 1;
        } catch {
          failed += 1;
        }
      }
      const stuck = (
        await sql<{
          transfer_kind: "import" | "export";
          stuck_count: number | string;
        }>`SELECT * FROM ops.record_transfer_stuck_counts(${now}::timestamptz,${stuckAfter})`.execute(
          database,
        )
      ).rows;
      for (const row of stuck)
        options.metrics
          ?.gauge(
            "athyper_record_transfer_stuck",
            "Transfers whose running heartbeat exceeded the threshold",
          )
          .set(Number(row.stuck_count), {
            plane: input.planeKey,
            kind: row.transfer_kind,
          });
      options.metrics
        ?.counter(
          "athyper_record_transfer_artifacts_purged_total",
          "Expired transfer artifacts removed",
        )
        .incrementBy(purged, { plane: input.planeKey });
      if (failed)
        throw Object.assign(
          new Error(`${failed} transfer artifacts could not be purged`),
          { code: "RECORD_TRANSFER_CLEANUP_PARTIAL", retryable: true },
        );
      return {
        status: "completed",
        output: {
          planeKey: input.planeKey,
          candidates: candidates.length,
          purged,
          stuck: Object.fromEntries(
            stuck.map((row) => [row.transfer_kind, Number(row.stuck_count)]),
          ),
        },
      };
    },
  };
}

function payload(value: Payload): Payload {
  if (
    !value ||
    !(["studio", "neon", "mesh"] as readonly unknown[]).includes(value.planeKey)
  )
    throw Object.assign(
      new Error("Record-transfer maintenance plane is invalid"),
      { code: "RECORD_TRANSFER_MAINTENANCE_PAYLOAD_INVALID", retryable: false },
    );
  return value;
}
