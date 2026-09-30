import type { ImportValidationRow, ImportValidationSummary, RecordImportSession } from "@athyper/server-contract-records";
import type { ImportStagingStore, StoredImport } from "./transfer-service.js";

type Row = Readonly<Record<string, unknown>>;
interface MutableImport { session: RecordImportSession; rows: Row[]; validation?: readonly ImportValidationRow[]; summary?: ImportValidationSummary; chunks: Map<number, { chunkChecksum: string; cumulativeChecksum: string; rowCount: number }>; }
interface ExportState { tenantId: string; entityCode: string; exactFilter: Readonly<Record<string, unknown>>; actorPrincipalId: string; status: "queued" | "cancelled" | "failed"; }

/** Deterministic reference store for tests and single-process development. Production hosts should provide a transactional durable store. */
export function createInMemoryRecordTransferStore<Transaction = unknown>(): ImportStagingStore<Transaction> {
  const imports = new Map<string, MutableImport>();
  const exports = new Map<string, ExportState>();
  return {
    async create(session, rows) {
      const key = importKey(session.tenantId, session.id);
      const existing = imports.get(key);
      if (existing) {
        if (stable(existing.session) !== stable(session) || stable(existing.rows) !== stable(rows)) throw new Error("Import session idempotency conflict");
        return;
      }
      imports.set(key, { session: structuredClone(session), rows: [...structuredClone(rows)], chunks: new Map() });
    },
    async get(tenantId, sessionId) {
      const value = imports.get(importKey(tenantId, sessionId));
      return value ? clone(value) : null;
    },
    async getChunk(tenantId, sessionId, chunkIndex) {
      return imports.get(importKey(tenantId, sessionId))?.chunks.get(chunkIndex) ?? null;
    },
    async appendChunk(input) {
      const value = imports.get(importKey(input.tenantId, input.sessionId));
      if (!value || value.session.status !== "uploading") throw new Error("Import upload session is unavailable");
      const existing = value.chunks.get(input.chunkIndex);
      if (existing) {
        if (existing.chunkChecksum !== input.chunkChecksum) throw new Error("Import chunk idempotency conflict");
        return "replayed";
      }
      const expected = value.session.nextChunkIndex ?? 0;
      if (input.chunkIndex !== expected) throw new Error(`Expected import chunk ${expected}`);
      value.chunks.set(input.chunkIndex, { chunkChecksum: input.chunkChecksum, cumulativeChecksum: input.cumulativeChecksum, rowCount: input.rows.length });
      value.rows.push(...structuredClone(input.rows));
      value.session = { ...value.session, stagedRowCount: value.rows.length, checksum: input.cumulativeChecksum, nextChunkIndex: expected + 1 };
      return "created";
    },
    async seal(input) {
      const value = imports.get(importKey(input.tenantId, input.sessionId));
      if (!value || value.session.status !== "uploading") throw new Error("Import upload session is unavailable");
      if ((value.session.nextChunkIndex ?? 0) !== input.expectedChunkCount || value.session.checksum !== input.checksum) throw new Error("Import upload seal mismatch");
      value.session = { ...value.session, status: "staged" };
    },
    async saveValidation(sessionId, rows, _transaction, summary, errorReportKey) {
      const value = uniqueImport(imports, sessionId);
      value.validation = structuredClone(rows);
      value.summary = summary ? structuredClone(summary) : undefined;
      const validRowCount = rows.filter((row) => row.valid).length;
      value.session = { ...value.session, validRowCount, invalidRowCount: rows.length - validRowCount, ...(errorReportKey ? { errorReportKey } : {}) };
    },
    async setStatus(sessionId, status) { const value = uniqueImport(imports, sessionId); value.session = { ...value.session, status }; },
    async cancelImport(tenantId, sessionId, cancelledAt) {
      const value = imports.get(importKey(tenantId, sessionId));
      if (!value) return "not_found";
      if (["committed", "cancelled", "failed"].includes(value.session.status)) return "already_terminal";
      value.session = { ...value.session, status: "cancelled", cancelledAt };
      return "cancelled";
    },
    async failQueuedImport(tenantId,sessionId,errorCode,errorDetail,failedAt){const value=imports.get(importKey(tenantId,sessionId));if(!value||value.session.status!=="commit_queued")return false;value.session={...value.session,status:"failed",errorCode,errorMessage:errorDetail,completedAt:failedAt,progress:{stage:"failed",completed:0,updatedAt:failedAt}};return true;},
    async saveExportRequest(input) {
      const key = exportKey(input.tenantId, input.id), existing = exports.get(key);
      const state: ExportState = { tenantId: input.tenantId, entityCode: input.entityCode, exactFilter: structuredClone(input.exactFilter), actorPrincipalId: input.actorPrincipalId, status: "queued" };
      if (existing) { if (stable(existing) !== stable(state)) throw new Error("Export request idempotency conflict"); return "replayed"; }
      exports.set(key, state);
      return "created";
    },
    async cancelExport(tenantId, exportRequestId) {
      const key = exportKey(tenantId, exportRequestId), value = exports.get(key);
      if (!value) return "not_found";
      if (value.status !== "queued") return "already_terminal";
      exports.set(key, { ...value, status: "cancelled" });
      return "cancelled";
    },
    async failQueuedExport(tenantId,exportRequestId){const key=exportKey(tenantId,exportRequestId),value=exports.get(key);if(!value||value.status!=="queued")return false;exports.set(key,{...value,status:"failed"});return true;},
  };
}

function clone(value: MutableImport): StoredImport { return { session: structuredClone(value.session), rows: structuredClone(value.rows), ...(value.validation ? { validation: structuredClone(value.validation) } : {}), ...(value.summary ? { summary: structuredClone(value.summary) } : {}) }; }
function uniqueImport(values: Map<string, MutableImport>, sessionId: string) { const matches = [...values.values()].filter((value) => value.session.id === sessionId); if (matches.length !== 1) throw new Error(matches.length ? "Import session is ambiguous" : "Import session is unavailable"); return matches[0]!; }
function importKey(tenantId: string, sessionId: string) { return `${tenantId}:${sessionId}`; }
function exportKey(tenantId: string, requestId: string) { return `${tenantId}:${requestId}`; }
function stable(value: unknown): string { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`; }
