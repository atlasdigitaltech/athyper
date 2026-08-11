import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { AuditEvent, AuditExportManifest, AuditExportRequest, AuditGovernanceStore } from "@athyper/server-contract-audit";
import { createAuditExportWorker, sanitizeCsvFormula } from "../index.js";

const request: AuditExportRequest = { id: "export-1", tenantId: "tenant-1", actorPrincipalId: "principal-1", exactFilter: { occurredFrom: "2026-08-01T00:00:00Z", occurredUntil: "2026-08-02T00:00:00Z" }, format: "csv", status: "queued", requestedAt: "2026-08-02T00:00:00Z", retentionUntil: "2026-08-09T00:00:00Z" };
const event: AuditEvent = { id: "event-1", occurredAt: "2026-08-01T01:00:00Z", eventCode: "records.record.created", action: "create", outcome: "success", severity: "info", actor: { kind: "user", principalId: "principal-1" }, tenantId: "tenant-1", entityType: "partner", entityId: "=2+2" };

describe("audit export governance", () => {
  it("sanitizes spreadsheet formulas and streams hashed chunks", async () => {
    let manifest: AuditExportManifest | undefined;
    const store = {
      getExportById: async () => request, markExportRunning: async () => undefined,
      stream: async function* () { yield [event]; }, completeExport: async (_id: string, value: AuditExportManifest) => { manifest = value; }, failExport: async () => undefined,
    } as unknown as AuditGovernanceStore;
    const writes: Uint8Array[] = [];
    const worker = createAuditExportWorker({ store, artifacts: { begin: async () => undefined, write: async (_key, _sequence, bytes) => { writes.push(bytes); }, complete: async () => undefined, abort: async () => undefined, createDownloadUrl: async () => "unused" } });
    await worker.run(request.id);
    const artifact = Buffer.concat(writes).toString("utf8");
    expect(artifact).toContain("'=2+2");
    expect(manifest).toMatchObject({ rowCount: 1, format: "csv", chunks: [{ sequence: 0 }] });
    expect(manifest?.sha256).toBe(createHash("sha256").update(Buffer.concat(writes)).digest("hex"));
  });

  it("detects formula prefixes even after whitespace", () => { expect(sanitizeCsvFormula("  @SUM(A1:A2)")).toBe("'  @SUM(A1:A2)"); });

  it("persists immutable manifests, integrity evidence, legal holds, and independent retention policy", () => {
    const root = resolve(process.cwd(), "../../../db/ddl/common/audit");
    const tables = readFileSync(resolve(root, "03_tables.sql"), "utf8");
    const triggers = readFileSync(resolve(root, "08_triggers.sql"), "utf8");
    expect(tables).toContain("CREATE TABLE audit.export_request");
    expect(tables).toContain("CREATE TABLE audit.export_manifest");
    expect(tables).toContain("CREATE TABLE audit.integrity_check_evidence");
    expect(tables).toContain("CREATE TABLE audit.legal_hold_manifest");
    expect(tables).toContain("does not mutate normal retention policy");
    expect(triggers).toContain("trg_export_manifest_immutable");
    expect(triggers).toContain("trg_integrity_check_evidence_immutable");
  });

  it("sources the PII inventory from published Entity Metadata classifications", () => {
    const root = resolve(process.cwd(), "../../../db/ddl/planes/studio/metadata");
    const tables = readFileSync(resolve(root, "03_tables.sql"), "utf8");
    const views = readFileSync(resolve(root, "09_views.sql"), "utf8");
    expect(tables).toContain("data_classification");
    expect(views).toContain("CREATE VIEW metadata.pii_inventory");
    expect(views).toContain("field_row.data_classification IN ('pii','sensitive_pii')");
    expect(views).not.toMatch(/column_name|information_schema\.columns/u);
  });
});
