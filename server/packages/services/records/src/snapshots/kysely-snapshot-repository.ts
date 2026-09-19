import type {
  RecordSnapshot,
  RecordSnapshotCaptureInput,
  RecordSnapshotRepository,
  RecordTransactionCoordinator,
  SnapshotCaptureReceipt,
  SnapshotReadScope,
} from "@athyper/server-contract-records";
import { sql, type Transaction } from "kysely";
import { stable } from "./snapshot-service.js";

type Database = Record<string, never>;
type Tx = Transaction<Database>;
type Row = Record<string, unknown>;

export class KyselyRecordSnapshotRepository implements RecordSnapshotRepository {
  constructor(
    private readonly transactions: RecordTransactionCoordinator<Tx>,
  ) {}

  capture(input: RecordSnapshotCaptureInput): Promise<SnapshotCaptureReceipt> {
    // Hash and compare the exact JSON representation persisted in jsonb (including Dates).
    input = {
      ...input,
      payload: JSON.parse(JSON.stringify(input.payload)) as Record<
        string,
        unknown
      >,
    };
    return this.transactions.run(
      input.planeKey,
      { tenantId: input.tenantId, principalId: input.principalId },
      async (transaction) => {
        await sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.tenantId}::uuid::text || ':' || ${input.entityType} || ':' || ${input.entityId}::uuid::text, 0))`.execute(
          transaction,
        );
        const previous = await this.latestIn(
          input.tenantId,
          input.entityType,
          input.entityId,
          transaction,
        );
        if (previous && sameCapture(previous, input))
          return { kind: "replayed", snapshot: previous };
        // Capture authority belongs to the hardened database function. Application
        // roles only read the immutable ledger and execute this entry point.
        const captured = await sql<{
          id: string;
        }>`SELECT snapshot.fn_capture_entity(
        ${input.entityType}, ${input.entityId}::uuid, ${input.entityCode ?? null}, 1,
        ${input.entityContractHash}, ${input.sourceRecordVersion ?? null}::bigint,
        ${input.captureEvent}, ${input.captureKind}::snapshot.capture_kind_d,
        ${JSON.stringify(input.payload)}::jsonb, ${input.correlationId ?? null}::uuid,
        ${input.auditEventId ?? null}::uuid, ${input.validFrom ?? null}::timestamptz,
        ${input.validUntil ?? null}::timestamptz,
        ${input.retentionClass}::snapshot.retention_class_d, ${input.captureSource}
      ) AS id`.execute(transaction);
        const result = await this.latestIn(
          input.tenantId,
          input.entityType,
          input.entityId,
          transaction,
        );
        if (!result || result.id !== captured.rows[0]?.id)
          throw new Error(
            "Snapshot capture did not produce its ledger evidence",
          );
        return { kind: "created", snapshot: result };
      },
    );
  }

  latest(
    scope: SnapshotReadScope,
    entityType: string,
    entityId: string,
  ): Promise<RecordSnapshot | null> {
    return this.transactions.run(scope.planeKey, scope, (transaction) =>
      this.latestIn(scope.tenantId, entityType, entityId, transaction),
    );
  }

  get(
    scope: SnapshotReadScope,
    snapshotId: string,
  ): Promise<RecordSnapshot | null> {
    return this.transactions.run(scope.planeKey, scope, async (transaction) => {
      const result =
        await sql<Row>`SELECT i.*, p.payload_json FROM snapshot.entity_snapshot_identity i JOIN snapshot.entity_snapshot p ON p.tenant_id=i.tenant_id AND p.snapshot_id=i.id AND p.captured_at=i.captured_at WHERE i.tenant_id=${scope.tenantId}::uuid AND i.id=${snapshotId}::uuid LIMIT 1`.execute(
          transaction,
        );
      return result.rows[0]
        ? snapshotRow(result.rows[0], object(result.rows[0]["payload_json"]))
        : null;
    });
  }

  private async latestIn(
    tenantId: string,
    entityType: string,
    entityId: string,
    transaction: Tx,
  ): Promise<RecordSnapshot | null> {
    const result =
      await sql<Row>`SELECT i.*, p.payload_json FROM snapshot.entity_snapshot_identity i JOIN snapshot.entity_snapshot p ON p.tenant_id=i.tenant_id AND p.snapshot_id=i.id AND p.captured_at=i.captured_at WHERE i.tenant_id=${tenantId}::uuid AND i.entity_type=${entityType} AND i.entity_id=${entityId}::uuid ORDER BY i.chain_seq DESC LIMIT 1`.execute(
        transaction,
      );
    return result.rows[0]
      ? snapshotRow(result.rows[0], object(result.rows[0]["payload_json"]))
      : null;
  }
}

function snapshotRow(
  row: Row,
  payload: Readonly<Record<string, unknown>>,
): RecordSnapshot {
  return {
    id: String(row["id"]),
    tenantId: String(row["tenant_id"]),
    entityType: String(row["entity_type"]),
    entityId: String(row["entity_id"]),
    ...(row["entity_code"] ? { entityCode: String(row["entity_code"]) } : {}),
    versionNumber: Number(row["version_number"]),
    payloadSchemaVersion: Number(row["payload_schema_version"]),
    entityContractHash: String(row["entity_contract_hash"]),
    ...(row["source_record_version"]
      ? { sourceRecordVersion: Number(row["source_record_version"]) }
      : {}),
    captureEvent: String(row["capture_event"]),
    captureKind: String(row["capture_kind"]) as RecordSnapshot["captureKind"],
    payloadHash: String(row["payload_hash"]),
    ...(row["previous_snapshot_id"]
      ? { previousSnapshotId: String(row["previous_snapshot_id"]) }
      : {}),
    ...(row["previous_payload_hash"]
      ? { previousPayloadHash: String(row["previous_payload_hash"]) }
      : {}),
    chainSequence: Number(row["chain_seq"]),
    ...(row["correlation_id"]
      ? { correlationId: String(row["correlation_id"]) }
      : {}),
    ...(row["audit_event_id"]
      ? { auditEventId: String(row["audit_event_id"]) }
      : {}),
    ...(row["valid_from"] ? { validFrom: iso(row["valid_from"]) } : {}),
    ...(row["valid_until"] ? { validUntil: iso(row["valid_until"]) } : {}),
    retentionClass: String(
      row["retention_class"],
    ) as RecordSnapshot["retentionClass"],
    payloadSizeBytes: Number(row["payload_size_bytes"]),
    capturedAt: iso(row["captured_at"]),
    capturedBy: String(row["captured_by"]),
    captureSource: String(row["capture_source"]),
    payload,
  };
}
function object(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value === "string")
    return JSON.parse(value) as Record<string, unknown>;
  return value as Readonly<Record<string, unknown>>;
}
function iso(value: unknown): string {
  return (
    value instanceof Date ? value : new Date(String(value))
  ).toISOString();
}

// Request correlation and actor are delivery metadata; changes to the captured
// contract, version, event, validity or retention must produce fresh evidence.
function sameCapture(
  previous: RecordSnapshot,
  input: RecordSnapshotCaptureInput,
): boolean {
  const keys = [
    "entityCode",
    "entityContractHash",
    "sourceRecordVersion",
    "captureEvent",
    "captureKind",
    "auditEventId",
    "validFrom",
    "validUntil",
    "retentionClass",
    "captureSource",
    "payload",
  ] as const;
  return keys.every((key) => stable(previous[key]) === stable(input[key]));
}
