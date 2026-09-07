import { randomUUID } from "node:crypto";
import type { RecordSnapshot, RecordSnapshotCaptureInput, RecordSnapshotRepository, RecordTransactionCoordinator, SnapshotCaptureReceipt, SnapshotReadScope } from "@athyper/server-contract-records";
import { sql, type Transaction } from "kysely";
import { stable } from "./snapshot-service.js";

type Database = Record<string, never>;
type Tx = Transaction<Database>;
type Row = Record<string, unknown>;

export class KyselyRecordSnapshotRepository implements RecordSnapshotRepository {
  constructor(private readonly transactions: RecordTransactionCoordinator<Tx>, private readonly createId: () => string = randomUUID) {}

  capture(input: RecordSnapshotCaptureInput): Promise<SnapshotCaptureReceipt> {
    // Hash and compare the exact JSON representation persisted in jsonb (including Dates).
    input = { ...input, payload: JSON.parse(JSON.stringify(input.payload)) as Record<string, unknown> };
    return this.transactions.run(input.planeKey, { tenantId: input.tenantId, principalId: input.principalId }, async (transaction) => {
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.tenantId}::uuid::text || ':' || ${input.entityType} || ':' || ${input.entityId}::uuid::text, 0))`.execute(transaction);
      const previous = await this.latestIn(input.tenantId, input.entityType, input.entityId, transaction);
      if (previous && sameCapture(previous, input)) return { kind: "replayed", snapshot: previous };
      const id = this.createId();
      const capturedAt = new Date().toISOString();
      const chainSequence = (previous?.chainSequence ?? 0) + 1;
      // Use the same JSONB canonicalization and evidence function as the payload trigger.
      const payloadJson = JSON.stringify(input.payload);
      const evidence = await sql<{ payload_hash: string; payload_size_bytes: number | string }>`
        SELECT snapshot.fn_compute_entity_snapshot_hash(
          ${input.tenantId}::uuid, ${input.entityType}, ${input.entityId}::uuid,
          ${chainSequence}::integer, 1, ${input.entityContractHash}, ${input.captureEvent},
          ${input.captureKind}::snapshot.capture_kind_d, ${payloadJson}::jsonb,
          ${previous?.id ?? null}::uuid, ${previous?.payloadHash ?? null}
        ) AS payload_hash, octet_length((${payloadJson}::jsonb)::text) AS payload_size_bytes
      `.execute(transaction);
      const payloadHash = evidence.rows[0]!.payload_hash;
      const payloadSizeBytes = Number(evidence.rows[0]!.payload_size_bytes);
      const inserted = await sql<Row>`
        INSERT INTO snapshot.entity_snapshot_identity(
          id, tenant_id, entity_type, entity_id, entity_code, version_number, payload_schema_version,
          entity_contract_hash, source_record_version, capture_event, capture_kind, payload_hash,
          previous_snapshot_id, previous_payload_hash, chain_seq, correlation_id, audit_event_id,
          valid_from, valid_until, retention_class, payload_size_bytes, captured_at, captured_by, capture_source
        ) VALUES (
          ${id}::uuid, ${input.tenantId}::uuid, ${input.entityType}, ${input.entityId}::uuid, ${input.entityCode ?? null}, ${chainSequence}, 1,
          ${input.entityContractHash}, ${input.sourceRecordVersion ?? null}, ${input.captureEvent}, ${input.captureKind}, ${payloadHash},
          ${previous?.id ?? null}::uuid, ${previous?.payloadHash ?? null}, ${chainSequence}, ${input.correlationId ?? null}::uuid, ${input.auditEventId ?? null}::uuid,
          ${input.validFrom ?? null}::timestamptz, ${input.validUntil ?? null}::timestamptz, ${input.retentionClass}, ${payloadSizeBytes}, ${capturedAt}::timestamptz,
          ${input.principalId}::uuid, ${input.captureSource}
        ) RETURNING *
      `.execute(transaction);
      await sql`INSERT INTO snapshot.entity_snapshot(tenant_id, snapshot_id, captured_at, payload_json) VALUES (${input.tenantId}::uuid, ${id}::uuid, ${capturedAt}::timestamptz, ${payloadJson}::jsonb)`.execute(transaction);
      return { kind: "created", snapshot: snapshotRow(inserted.rows[0]!, input.payload) };
    });
  }

  latest(scope: SnapshotReadScope, entityType: string, entityId: string): Promise<RecordSnapshot | null> {
    return this.transactions.run(scope.planeKey, scope, (transaction) => this.latestIn(scope.tenantId, entityType, entityId, transaction));
  }

  get(scope: SnapshotReadScope, snapshotId: string): Promise<RecordSnapshot | null> {
    return this.transactions.run(scope.planeKey, scope, async (transaction) => {
      const result = await sql<Row>`SELECT i.*, p.payload_json FROM snapshot.entity_snapshot_identity i JOIN snapshot.entity_snapshot p ON p.tenant_id=i.tenant_id AND p.snapshot_id=i.id AND p.captured_at=i.captured_at WHERE i.tenant_id=${scope.tenantId}::uuid AND i.id=${snapshotId}::uuid LIMIT 1`.execute(transaction);
      return result.rows[0] ? snapshotRow(result.rows[0], object(result.rows[0]["payload_json"])) : null;
    });
  }

  private async latestIn(tenantId: string, entityType: string, entityId: string, transaction: Tx): Promise<RecordSnapshot | null> {
    const result = await sql<Row>`SELECT i.*, p.payload_json FROM snapshot.entity_snapshot_identity i JOIN snapshot.entity_snapshot p ON p.tenant_id=i.tenant_id AND p.snapshot_id=i.id AND p.captured_at=i.captured_at WHERE i.tenant_id=${tenantId}::uuid AND i.entity_type=${entityType} AND i.entity_id=${entityId}::uuid ORDER BY i.chain_seq DESC LIMIT 1 FOR UPDATE OF i`.execute(transaction);
    return result.rows[0] ? snapshotRow(result.rows[0], object(result.rows[0]["payload_json"])) : null;
  }
}

function snapshotRow(row: Row, payload: Readonly<Record<string, unknown>>): RecordSnapshot { return { id: String(row["id"]), tenantId: String(row["tenant_id"]), entityType: String(row["entity_type"]), entityId: String(row["entity_id"]), ...(row["entity_code"] ? { entityCode: String(row["entity_code"]) } : {}), versionNumber: Number(row["version_number"]), payloadSchemaVersion: Number(row["payload_schema_version"]), entityContractHash: String(row["entity_contract_hash"]), ...(row["source_record_version"] ? { sourceRecordVersion: Number(row["source_record_version"]) } : {}), captureEvent: String(row["capture_event"]), captureKind: String(row["capture_kind"]) as RecordSnapshot["captureKind"], payloadHash: String(row["payload_hash"]), ...(row["previous_snapshot_id"] ? { previousSnapshotId: String(row["previous_snapshot_id"]) } : {}), ...(row["previous_payload_hash"] ? { previousPayloadHash: String(row["previous_payload_hash"]) } : {}), chainSequence: Number(row["chain_seq"]), ...(row["correlation_id"] ? { correlationId: String(row["correlation_id"]) } : {}), ...(row["audit_event_id"] ? { auditEventId: String(row["audit_event_id"]) } : {}), ...(row["valid_from"] ? { validFrom: iso(row["valid_from"]) } : {}), ...(row["valid_until"] ? { validUntil: iso(row["valid_until"]) } : {}), retentionClass: String(row["retention_class"]) as RecordSnapshot["retentionClass"], payloadSizeBytes: Number(row["payload_size_bytes"]), capturedAt: iso(row["captured_at"]), capturedBy: String(row["captured_by"]), captureSource: String(row["capture_source"]), payload }; }
function object(value: unknown): Readonly<Record<string, unknown>> { if (typeof value === "string") return JSON.parse(value) as Record<string, unknown>; return value as Readonly<Record<string, unknown>>; }
function iso(value: unknown): string { return (value instanceof Date ? value : new Date(String(value))).toISOString(); }

// Request correlation and actor are delivery metadata; changes to the captured
// contract, version, event, validity or retention must produce fresh evidence.
function sameCapture(previous: RecordSnapshot, input: RecordSnapshotCaptureInput): boolean {
  const keys = ["entityCode", "entityContractHash", "sourceRecordVersion", "captureEvent", "captureKind", "auditEventId", "validFrom", "validUntil", "retentionClass", "captureSource", "payload"] as const;
  return keys.every(key => stable(previous[key]) === stable(input[key]));
}
