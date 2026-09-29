import { parseCollectionCapture, canonicalJson, type CollectionCaptureDefinition } from "./snapshots/collection-capture.js";
import { sql, type Transaction } from "kysely";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { SnapshotRetentionClass } from "@athyper/server-contract-records";
import type {
  RecordHistoryHook,
  IdempotentRecordCommand,
} from "./record-execution.js";

type Tx = Transaction<Record<string, never>>;
/** Resolved from the exact admitted release by the host, never browser input. */
export interface RecordHistoryBinding {
  readonly collections?: readonly { readonly definition: CollectionCaptureDefinition; readonly maximumRecords: number }[];
  readonly providerKey: "platform.records.history.v1";
  readonly adapterKey?: string;
  readonly fields: readonly string[];
  readonly operations: readonly (
    "create" | "patch" | "transition" | "delete" | "aggregate" | "domain"
  )[];
  readonly automaticCapture: "none" | "committed" | "milestone";
  readonly captureOperations: readonly string[];
  readonly retentionClass: SnapshotRetentionClass;
}
const identifier = /^[a-zA-Z][a-zA-Z0-9_]{0,62}$/;
/** An installed adapter owns all collection/domain writes and reads their exact
 * transactional state. Browser requests and metadata cannot install adapters. */
export interface RecordHistoryAdapter {
  readonly key: string;
  qualify(
    descriptor: EntityRuntimeDescriptor,
    binding: RecordHistoryBinding,
  ): void;
  read(
    command: IdempotentRecordCommand,
    descriptor: EntityRuntimeDescriptor,
    transaction: Tx,
    binding?: RecordHistoryBinding,
  ): Promise<Readonly<Record<string, unknown>>>;
}
/** Root locking serializes every adapter participating in this record history. */
export function qualifyRecordHistoryDescriptor(
  d: EntityRuntimeDescriptor,
  b: RecordHistoryBinding,
  adapter?: RecordHistoryAdapter,
): void {
  if (
    b.providerKey !== "platform.records.history.v1" ||
    !d.storage.tenantField ||
    !d.storage.versionField ||
    d.referenceCapability ||
    ((d.aggregate?.collections.length ||
      d.actions?.length ||
      d.operations.aggregate ||
      b.adapterKey) &&
      (!adapter || adapter.key !== b.adapterKey)) ||
    !b.fields.length ||
    new Set(b.fields).size !== b.fields.length ||
    b.operations.some(
      (op) =>
        ![
          "create",
          "patch",
          "transition",
          "delete",
          "aggregate",
          "domain",
        ].includes(op),
    )
  )
    throw Error("RECORD_HISTORY_PROVIDER_INCOMPATIBLE");
  const owned = [
    d.operations.create && "create",
    (d.operations.patch || d.operations.update) && "patch",
    d.lifecycle?.transitions.length && "transition",
    d.operations.delete && "delete",
    d.operations.aggregate && "aggregate",
    d.actions?.length && "domain",
  ].filter(Boolean);
  if (
    !owned.length ||
    owned.some((op) => !b.operations.includes(op as never)) ||
    b.operations.some((op) => !owned.includes(op))
  )
    throw Error("RECORD_HISTORY_WRITE_OWNERSHIP_REQUIRED");
  if (
    d.lifecycle?.transitions.length &&
    (!d.storage.statusField ||
      !d.fields.some((f) => f.storagePath === d.storage.statusField))
  )
    throw Error("RECORD_HISTORY_STATUS_REQUIRED");
  const columns = [
    d.storage.schema,
    d.storage.object,
    d.storage.idField,
    d.storage.tenantField,
    d.storage.versionField,
    ...(d.storage.softDeleteField ? [d.storage.softDeleteField] : []),
  ];
  if (columns.some((column) => !column || !identifier.test(column)))
    throw Error("RECORD_HISTORY_STORAGE_INVALID");
  for (const key of b.fields) {
    const field = d.fields.find((f) => f.key === key);
    if (
      [
        "__history_version",
        "__history_deleted",
        "__owned",
        "__tombstone",
      ].includes(key) ||
      !field ||
      !identifier.test(field.storagePath) ||
      field.computation ||
      field.storagePath === d.storage.versionField
    )
      throw Error("RECORD_HISTORY_PROJECTION_INVALID");
  }
  // All writable business fields and lifecycle status must be in the reviewed
  // projection. Viewer permissions never reduce required recording coverage.
  if (
    d.fields.some(
      (f) =>
        (f.writableOn.length || f.storagePath === d.storage.statusField) &&
        !b.fields.includes(f.key),
    )
  )
    throw Error("RECORD_HISTORY_PROJECTION_INCOMPLETE");
  adapter?.qualify(d, b);
  const triggers =
    b.automaticCapture === "milestone"
      ? (d.lifecycle?.transitions ?? []).map((t) => `transition.${t.code}`)
      : b.operations;
  if (
    b.automaticCapture === "none"
      ? b.captureOperations.length > 0
      : !b.captureOperations.length ||
        b.captureOperations.some((op) => !triggers.includes(op as never))
  )
    throw Error("RECORD_HISTORY_CAPTURE_TRIGGER_INVALID");
}
function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
    .join(",")}}`;
}
export function createRecordHistoryHook(options: {
  readonly adapters?: ReadonlyMap<string, RecordHistoryAdapter>;
  resolve(
    command: IdempotentRecordCommand,
    descriptor: EntityRuntimeDescriptor,
  ): Promise<RecordHistoryBinding | undefined>;
}): RecordHistoryHook<Tx> {
  return {
    async prepare({ command, action, descriptor: d }, tx) {
      const b = await options.resolve(command, d);
      if (!b) return;
      const adapter = b.adapterKey
        ? options.adapters?.get(b.adapterKey)
        : undefined;
      qualifyRecordHistoryDescriptor(d, b, adapter);
      if (!b.operations.includes(action as never))
        throw Error("RECORD_HISTORY_OPERATION_UNSUPPORTED");
      if (command.context.planeKey !== d.planeKey)
        throw Error("RECORD_HISTORY_PLANE_MISMATCH");
      const fields = b.fields.map((key) =>
        d.fields.find((f) => f.key === key)!,
      );
      const read = async (id: string) =>
        (
          await sql<Record<string, unknown>>`SELECT
        ${sql.join(fields.map((f) => sql`${sql.ref(f.storagePath)} AS ${sql.ref(f.key)}`))}, ${sql.ref(d.storage.versionField!)} AS "__history_version"${d.storage.softDeleteField ? sql`, ${sql.ref(d.storage.softDeleteField)} AS "__history_deleted"` : sql``}
        FROM ${sql.table(`${d.storage.schema}.${d.storage.object}`)}
        WHERE ${sql.ref(d.storage.tenantField!)}=${command.context.tenantId}::uuid AND ${sql.ref(d.storage.idField)}=${id}::uuid
        FOR UPDATE`.execute(tx)
        ).rows[0];
      // Lock before mutation, so before/after describe one serialized root change.
      const before =
        action === "create" ? undefined : await read(command.recordId!);
      const beforeOwned =
        before && adapter ? await adapter.read(command, d, tx, b) : undefined;
      const validateCollections = (owned: Readonly<Record<string,unknown>> | undefined, recordId:string) => {
        for (const declared of b.collections ?? []) {
          if (!owned || !Object.hasOwn(owned,declared.definition.key)) throw Error("RECORD_HISTORY_COLLECTION_CAPTURE_REQUIRED");
          const capture=parseCollectionCapture(owned[declared.definition.key],declared.maximumRecords);
          const signature=(definition:CollectionCaptureDefinition)=>canonicalJson({...definition,fields:[...definition.fields].sort((a,b)=>a.key.localeCompare(b.key))});
          if(capture.coverage!=="complete" || capture.consistency!=="root_transaction" || signature(capture.definition)!==signature(declared.definition) || canonicalJson(capture.subject)!==canonicalJson({tenantId:command.context.tenantId,plane:command.context.planeKey,entityCode:d.entityCode,recordId})) throw Error("RECORD_HISTORY_COLLECTION_CAPTURE_INVALID");
        }
      };
      if(before) validateCollections(beforeOwned,command.recordId!);
      return async (result) => {
        if (result.kind !== "Committed") return;
        if (
          before &&
          command.expectedVersion !== undefined &&
          Number(before.__history_version) !== command.expectedVersion
        )
          throw Error("RECORD_HISTORY_EXPECTED_VERSION_MISMATCH");
        const storedAfter = await read(result.recordId);
        const deleting = action === "delete";
        if (deleting && !before)
          throw Error("RECORD_HISTORY_PRE_DELETE_STATE_REQUIRED");
        if (
          deleting &&
          (d.storage.softDeleteField
            ? !storedAfter?.__history_deleted
            : storedAfter)
        )
          throw Error("RECORD_HISTORY_DELETE_STATE_INVALID");
        const after = deleting ? before! : storedAfter;
        if (!after) throw Error("RECORD_HISTORY_POST_STATE_REQUIRED");
        const version = deleting
          ? storedAfter
            ? Number(storedAfter.__history_version)
            : Number(before!.__history_version) + 1
          : Number(after.__history_version);
        const afterOwned = deleting
          ? beforeOwned
          : adapter
            ? await adapter.read(
                { ...command, recordId: result.recordId },
                d,
                tx,
                b,
              )
            : undefined;
        validateCollections(afterOwned,result.recordId);
        if (
          !Number.isSafeInteger(version) ||
          version < 1 ||
          (before && version <= Number(before.__history_version))
        )
          throw Error("RECORD_HISTORY_VERSION_INVALID");
        // A repeated patch is a business no-op even when database triggers
        // refresh technical timestamps in the captured projection.
        if (
          action === "patch" &&
          !adapter &&
          before &&
          Object.entries(command.input ?? {}).every(
            ([key]) => stable(before[key]) === stable(after[key]),
          )
        )
          return;
        const changed = b.fields.filter(
          (key) => !before || stable(before[key]) !== stable(after[key]),
        );
        if (
          !changed.length &&
          !deleting &&
          stable(beforeOwned ?? null) === stable(afterOwned ?? null)
        )
          return; // No-op counter advances are not historical state changes.
        const payload = Object.fromEntries(
          b.fields.map((key) => [key, after[key]]),
        );
        // Tombstones preserve pre-delete data; deletion is never represented as a live post-state.
        const state = deleting ? "deleted" : "present";
        const ledgerPayload = {
          ...payload,
          ...(afterOwned ? { __owned: afterOwned } : {}),
          ...(deleting ? { __tombstone: true } : {}),
        };
        const trigger =
          b.automaticCapture === "milestone"
            ? `transition.${command.transitionCode}`
            : action;
        let snapshotId: string | null = null;
        if (
          b.automaticCapture !== "none" &&
          b.captureOperations.includes(trigger)
        ) {
          const envelope = {
            schema: "athyper.activity-snapshot/1",
            record: payload,
            coverage: { kind: "declared_fields", fields: [...b.fields].sort() },
            releaseId: d.releaseId,
            state,
            ...(afterOwned ? { owned: afterOwned } : {}),
          };
          const row = (
            await sql<{ id: string }>`SELECT snapshot.fn_capture_entity(
            ${`${d.storage.schema}.${d.storage.object}`},${result.recordId}::uuid,${d.entityCode},3,${d.contractHash},${version}::bigint,
            ${`records.${d.entityCode}.${trigger}`},${action === "create" ? "create" : "version"}::snapshot.capture_kind_d,${JSON.stringify(envelope)}::jsonb,
            NULL::uuid,NULL::uuid,NULL::timestamptz,NULL::timestamptz,${b.retentionClass}::snapshot.retention_class_d,'record-history') AS id`.execute(
              tx,
            )
          ).rows[0];
          if (!row?.id) throw Error("RECORD_HISTORY_CAPTURE_FAILED");
          snapshotId = row.id;
        }
        await sql`INSERT INTO snapshot.record_version(tenant_id,plane_code,entity_type,entity_code,entity_id,source_record_version,actor_principal_id,
          operation,transition_code,release_id,contract_hash,changed_fields,payload_json,snapshot_id)
          VALUES(${command.context.tenantId}::uuid,${d.planeKey},${`${d.storage.schema}.${d.storage.object}`},${d.entityCode},${result.recordId}::uuid,${version},${command.context.principalId}::uuid,
          ${action},${command.transitionCode ?? command.actionCode ?? null},${d.releaseId}::uuid,${d.contractHash},${changed}::text[],${JSON.stringify(ledgerPayload)}::jsonb,${snapshotId}::uuid)`.execute(
          tx,
        );
      };
    },
  };
}
