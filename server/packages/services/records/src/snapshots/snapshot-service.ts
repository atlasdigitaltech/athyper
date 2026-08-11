import type { MetadataReader } from "@athyper/server-contract-metadata";
import type { RecordMutationService, RecordQueryService, RecordSnapshotRepository, RecordSnapshotService } from "@athyper/server-contract-records";
import { RecordServiceError } from "../errors.js";

export function createRecordSnapshotService(options: { readonly metadata: MetadataReader; readonly queries: RecordQueryService; readonly mutations: RecordMutationService; readonly repository: RecordSnapshotRepository }): RecordSnapshotService {
  return {
    async capture(context, entityCode, recordId, capture = {}) {
      const descriptor = await options.metadata.getEntityDescriptor(context, entityCode);
      if (!descriptor) throw new RecordServiceError(409, "ENTITY_OPERATION_UNAVAILABLE", "Entity descriptor is not published");
      const found = await options.queries.get({ context, entityCode, recordId });
      if (!found.data) throw new RecordServiceError(404, "RECORD_NOT_FOUND", "Record was not found");
      const versionValue = descriptor.storage.versionField ? found.data[descriptor.storage.versionField] : undefined;
      const sourceRecordVersion = typeof versionValue === "number" && Number.isInteger(versionValue) && versionValue >= 1 ? versionValue : undefined;
      return options.repository.capture({
        tenantId: context.tenantId, principalId: context.principalId, planeKey: context.planeKey,
        entityType: `${descriptor.storage.schema}.${descriptor.storage.object}`, entityId: recordId, entityCode,
        entityContractHash: descriptor.contractHash, ...(sourceRecordVersion ? { sourceRecordVersion } : {}),
        captureEvent: capture.captureEvent ?? "records.snapshot.capture", captureKind: capture.captureKind ?? "manual",
        ...(context.correlationId ? { correlationId: context.correlationId } : {}), ...(capture.auditEventId ? { auditEventId: capture.auditEventId } : {}),
        ...(capture.validFrom ? { validFrom: capture.validFrom } : {}), ...(capture.validUntil ? { validUntil: capture.validUntil } : {}),
        retentionClass: capture.retentionClass ?? "standard", captureSource: capture.captureSource ?? "application",
        payload: structuredClone(found.data),
      });
    },
    async query(context, snapshotId) { const snapshot = await options.repository.get(scope(context), snapshotId); if (!snapshot) throw new RecordServiceError(404, "SNAPSHOT_NOT_FOUND", "Snapshot was not found"); return snapshot; },
    async compare(context, fromSnapshotId, toSnapshotId) { const [from, to] = await Promise.all([options.repository.get(scope(context), fromSnapshotId), options.repository.get(scope(context), toSnapshotId)]); if (!from || !to) throw new RecordServiceError(404, "SNAPSHOT_NOT_FOUND", "Snapshot was not found"); if (from.entityType !== to.entityType || from.entityId !== to.entityId) throw new RecordServiceError(409, "SNAPSHOT_COORDINATE_MISMATCH", "Snapshots must belong to the same record"); const keys = new Set([...Object.keys(from.payload), ...Object.keys(to.payload)]); return { fromSnapshotId, toSnapshotId, changedFields: [...keys].filter((field) => stable(from.payload[field]) !== stable(to.payload[field])).map((field) => ({ field, before: from.payload[field], after: to.payload[field] })) }; },
    async restore(context, snapshotId, expectedVersion, idempotencyKey) { const snapshot = await options.repository.get(scope(context), snapshotId); if (!snapshot) throw new RecordServiceError(404, "SNAPSHOT_NOT_FOUND", "Snapshot was not found"); if (!snapshot.entityCode) throw new RecordServiceError(409, "SNAPSHOT_RESTORE_UNAVAILABLE", "Snapshot has no published entity code"); const descriptor = await options.metadata.getEntityDescriptor(context, snapshot.entityCode); if (!descriptor) throw new RecordServiceError(409, "ENTITY_OPERATION_UNAVAILABLE", "Entity descriptor is not published"); const writable = new Set(descriptor.fields.filter((field) => field.writableOn.includes("patch")).map((field) => field.key)); const input = Object.fromEntries(Object.entries(snapshot.payload).filter(([key]) => writable.has(key))); return options.mutations.patch({ context, entityCode: snapshot.entityCode, recordId: snapshot.entityId, input, expectedVersion, idempotencyKey, origin: "operation", validationMode: "strict" }); },
  };
}

export function stable(value: unknown): string { if (value === undefined) return "undefined"; if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`; }
function scope(context: { readonly tenantId: string; readonly principalId: string; readonly planeKey: "studio" | "neon" | "mesh" }) { return { tenantId: context.tenantId, principalId: context.principalId, planeKey: context.planeKey }; }
