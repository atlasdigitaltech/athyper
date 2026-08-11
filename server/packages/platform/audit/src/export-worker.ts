import { createHash } from "node:crypto";
import type { AuditArtifactWriter, AuditEvent, AuditExportChunk, AuditExportManifest, AuditGovernanceStore } from "@athyper/server-contract-audit";

export interface AuditExportWorkerOptions { readonly store: AuditGovernanceStore; readonly artifacts: AuditArtifactWriter; readonly now?: () => Date; readonly batchSize?: number; }

export function createAuditExportWorker(options: AuditExportWorkerOptions) {
  return { async run(exportRequestId: string): Promise<AuditExportManifest> {
    const request = await options.store.getExportById(exportRequestId);
    if (!request) throw new Error("Audit export request not found");
    const objectKey = `audit/${request.tenantId}/${request.id}.${request.format}`;
    const contentType = request.format === "csv" ? "text/csv" : request.format === "ndjson" ? "application/x-ndjson" : "application/json";
    const artifactHash = createHash("sha256"); const chunks: AuditExportChunk[] = []; let sequence = 0; let rowCount = 0; let byteCount = 0; let jsonStarted = false; let csvStarted = false;
    await options.store.markExportRunning(request.id); await options.artifacts.begin(objectKey, contentType);
    const write = async (text: string) => { if (!text) return; const bytes = Buffer.from(text, "utf8"); artifactHash.update(bytes); byteCount += bytes.byteLength; const sha256 = createHash("sha256").update(bytes).digest("hex"); await options.artifacts.write(objectKey, sequence, bytes); chunks.push({ sequence, byteCount: bytes.byteLength, sha256 }); sequence += 1; };
    try {
      for await (const batch of options.store.stream(request.tenantId, request.exactFilter, options.batchSize ?? 500)) {
        if (!batch.length) continue;
        if (request.format === "ndjson") await write(batch.map((event) => JSON.stringify(event)).join("\n") + "\n");
        else if (request.format === "json") { await write(`${jsonStarted ? "," : "["}${batch.map((event) => JSON.stringify(event)).join(",")}`); jsonStarted = true; }
        else { const encoded = encodeCsv(batch, !csvStarted); await write(encoded); csvStarted = true; }
        rowCount += batch.length;
      }
      if (request.format === "json") await write(jsonStarted ? "]" : "[]");
      if (request.format === "csv" && !csvStarted) await write(csvHeader() + "\n");
      await options.artifacts.complete(objectKey);
      const manifest: AuditExportManifest = Object.freeze({ exportRequestId: request.id, tenantId: request.tenantId, actorPrincipalId: request.actorPrincipalId, exactFilter: request.exactFilter, format: request.format, rowCount, byteCount, sha256: artifactHash.digest("hex"), chunks, objectKey, createdAt: (options.now?.() ?? new Date()).toISOString(), retentionUntil: request.retentionUntil });
      await options.store.completeExport(request.id, manifest); return manifest;
    } catch (error) { await options.artifacts.abort(objectKey); await options.store.failExport(request.id, "EXPORT_FAILED"); throw error; }
  } };
}

const columns = ["id","occurredAt","eventCode","action","outcome","severity","tenantId","actorKind","actorPrincipalId","entityType","entityId","requestId","correlationId","metadata"] as const;
function csvHeader(): string { return columns.join(","); }
function encodeCsv(events: readonly AuditEvent[], includeHeader: boolean): string { const rows = events.map((event) => [event.id,event.occurredAt,event.eventCode,event.action,event.outcome,event.severity,event.tenantId ?? "",event.actor.kind,event.actor.principalId ?? "",event.entityType ?? "",event.entityId ?? "",event.requestId ?? "",event.correlationId ?? "",event.metadata ? JSON.stringify(event.metadata) : ""].map(csvCell).join(",")); return `${includeHeader ? csvHeader() + "\n" : ""}${rows.join("\n")}\n`; }
export function sanitizeCsvFormula(value: string): string { return /^[\t\r ]*[=+\-@]/u.test(value) ? `'${value}` : value; }
function csvCell(value: string): string { const safe = sanitizeCsvFormula(value); return /[",\r\n]/u.test(safe) ? `"${safe.replace(/"/gu, '""')}"` : safe; }
