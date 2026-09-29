import { createHash } from "node:crypto";
import { sql, type Transaction } from "kysely";
import type {
  RecordSnapshot,
  RecordTransactionCoordinator,
  SnapshotReadScope,
  SnapshotRetentionClass,
} from "@athyper/server-contract-records";
import { createKyselyCommandExecutionStore } from "../kysely-command-execution-store.js";
import { RecordServiceError } from "../errors.js";
import { snapshotRow } from "./kysely-snapshot-repository.js";

type Tx = Transaction<Record<string, never>>;
export type ActivitySnapshotScope = SnapshotReadScope & {
  entityType: string;
  entityCode: string;
  entityId: string;
};
export interface ActivitySnapshotWindow {
  from: string;
  until: string;
  after?: { at: string; id: string };
  limit: number;
}
/** Payload v2 stores the authorized capture and its coverage together in the immutable ledger.
 * The command receipt stores only identity; retries never return historical payload without reauthorization. */
export class ActivitySnapshotRepository {
  constructor(
    private readonly transactions: RecordTransactionCoordinator<Tx>,
  ) {}
  async list(scope: ActivitySnapshotScope, page: ActivitySnapshotWindow) {
    return this.transactions.run(
      scope.planeKey,
      scope,
      async (tx) =>
        (
          await sql<Record<string, unknown>>`
      SELECT i.*, to_char(i.captured_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS captured_at
      FROM snapshot.entity_snapshot_identity i
      WHERE i.tenant_id=${scope.tenantId}::uuid AND i.entity_type=${scope.entityType} AND i.entity_id=${scope.entityId}::uuid AND i.entity_code=${scope.entityCode}
      AND i.captured_at>=${page.from}::timestamptz AND i.captured_at<=${page.until}::timestamptz
      ${page.after ? sql`AND (i.captured_at,i.id)<(${page.after.at}::timestamptz,${page.after.id}::uuid)` : sql``}
      ORDER BY i.captured_at DESC,i.id DESC LIMIT ${page.limit}`.execute(tx)
        ).rows,
    );
  }
  async get(
    scope: ActivitySnapshotScope,
    id: string,
  ): Promise<RecordSnapshot | null> {
    return this.transactions.run(scope.planeKey, scope, async (tx) => {
      const row = (
        await sql<
          Record<string, unknown>
        >`SELECT i.*,p.payload_json FROM snapshot.entity_snapshot_identity i
        JOIN snapshot.entity_snapshot p ON p.tenant_id=i.tenant_id AND p.snapshot_id=i.id AND p.captured_at=i.captured_at
        WHERE i.tenant_id=${scope.tenantId}::uuid AND i.entity_type=${scope.entityType} AND i.entity_id=${scope.entityId}::uuid AND i.entity_code=${scope.entityCode} AND i.id=${id}::uuid`.execute(
          tx,
        )
      ).rows[0];
      return row
        ? snapshotRow(row, row.payload_json as Record<string, unknown>)
        : null;
    });
  }
  async capture(
    input: ActivitySnapshotScope & {
      idempotencyKey: string;
      releaseHash: string;
      contractHash: string;
      retentionClass: SnapshotRetentionClass;
      sourceRecordVersion?: number;
      payload: Readonly<Record<string, unknown>>;
      /** Executed after replay admission, within the same repeatable-read transaction as persistence. */
      readConsistent?: (
        tx: Tx,
      ) => Promise<{
        record: Readonly<Record<string, unknown>>;
        owned: Readonly<Record<string, unknown>>;
        sourceRecordVersion?: number;
      }>;
    },
  ) {
    const commands = createKyselyCommandExecutionStore<{ id: string }>();
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify([
          input.principalId,
          input.entityType,
          input.entityCode,
          input.entityId,
          input.releaseHash,
          input.contractHash,
          input.retentionClass,
          ...(input.readConsistent ? ["consistent-multi-section"] : []),
        ]),
      )
      .digest("hex");
    return this.transactions.run(
      input.planeKey,
      input,
      async (tx) => {
        if (input.readConsistent) {
          const isolation = await sql<{
            level: string;
          }>`SELECT current_setting('transaction_isolation') AS level`.execute(
            tx,
          );
          if (isolation.rows[0]?.level !== "repeatable read")
            throw Error("ACTIVITY_CAPTURE_ISOLATION_REQUIRED");
        }
        const command = await commands.begin(
          {
            tenantId: input.tenantId,
            actorPrincipalId: input.principalId,
            commandCode: "records.snapshot.capture",
            idempotencyKey: input.idempotencyKey,
            requestFingerprint: fingerprint,
            sourceService: "entity-activity",
          },
          tx,
        );
        if (command.kind === "replay")
          return { id: command.result.id, replayed: true };
        if (command.kind !== "started")
          throw new RecordServiceError(
            409,
            "ACTIVITY_CAPTURE_CONFLICT",
            "Capture key belongs to another command or is in progress",
          );
        const captured = input.readConsistent
          ? await input.readConsistent(tx)
          : undefined;
        const record = captured?.record ?? input.payload;
        const payload = {
          schema: "athyper.activity-snapshot/1",
          record,
          ...(captured ? { owned: captured.owned } : {}),
          coverage: {
            kind: "authorized_fields",
            fields: Object.keys(record).sort(),
          },
          releaseHash: input.releaseHash,
        };
        const row = (
          await sql<{
            id: string;
          }>`SELECT snapshot.fn_capture_entity(${input.entityType},${input.entityId}::uuid,${input.entityCode},${captured ? 3 : 2},${input.contractHash},${captured?.sourceRecordVersion ?? input.sourceRecordVersion ?? null}::bigint,
        'records.snapshot.capture','manual'::snapshot.capture_kind_d,${JSON.stringify(payload)}::jsonb,NULL::uuid,NULL::uuid,NULL::timestamptz,NULL::timestamptz,${input.retentionClass}::snapshot.retention_class_d,'entity-activity') AS id`.execute(
            tx,
          )
        ).rows[0];
        if (!row) throw Error("ACTIVITY_CAPTURE_RECEIPT_MISSING");
        await commands.complete(
          command.executionId,
          { id: row.id },
          input.principalId,
          tx,
        );
        return { id: row.id, replayed: false };
      },
      undefined,
      input.readConsistent ? { isolationLevel: "repeatable read" } : undefined,
    );
  }
}
