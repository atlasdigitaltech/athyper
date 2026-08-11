import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { RecordImportSession } from "@athyper/server-contract-records";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { createRecordLockService, createRecordTransferService } from "../index.js";

const context = { planeKey: "neon", realmKey: "athyper", tenantId: "tenant-1", principalId: "principal-1", authEpoch: 1, profileHash: "p", requestId: "r", permissions: { planeKey: "neon", tenantId: "tenant-1", principalId: "principal-1", principalFingerprint: "f", profileHash: "p", schemaHash: "s", resolvedAt: 1, allowed: [], denied: [], planLocked: [], planeExcluded: [], entries: [], authorizationScopes: [] } } satisfies VerifiedRequestContext;
const transferDescriptor = { schema: "athyper.entity-runtime-descriptor/1.0", entityCode: "business_partner", planeKey: "neon", releaseId: "r", releaseNo: 1, contractHash: "a".repeat(64), compiledHash: "b".repeat(64), storage: { schema: "master", object: "business_partner", idField: "id" }, fields: [], operations: { import: { code: "import", permissionCode: "records.import" }, export: { code: "export", permissionCode: "records.export" } } } satisfies EntityRuntimeDescriptor;

describe("advanced Records modules", () => {
  it("requires stage, validation, and preview before import commit", async () => {
    let stored: { session: RecordImportSession; rows: readonly Readonly<Record<string, unknown>>[]; validation?: readonly { rowNumber: number; valid: boolean; errors: readonly string[] }[] } | undefined;
    const jobs: Readonly<Record<string, unknown>>[] = [];
    const service = createRecordTransferService({ createId: () => "import-1", now: () => new Date("2026-08-10T00:00:00Z"), staging: {
      create: async (session, rows) => { stored = { session, rows }; }, get: async () => stored ?? null,
      saveValidation: async (_id, validation) => { stored = { ...stored!, validation }; }, setStatus: async (_id, status) => { stored = { ...stored!, session: { ...stored!.session, status } }; },
    }, validator: { validate: async (_context, _entity, row, rowNumber) => ({ rowNumber, valid: typeof row["code"] === "string", errors: typeof row["code"] === "string" ? [] : ["code required"] }) }, jobs: { enqueue: async (_kind, payload) => { jobs.push(payload); return "job-1"; } }, metadata: { getEntityDescriptor: async () => transferDescriptor }, authorizer: { authorize: async () => ({ allowed: true }) }, audit: { record: async (input) => ({ ...input, id: "audit-1", occurredAt: "2026-08-10T00:00:00Z", severity: input.severity ?? "info" }) } });
    const session = await service.stage(context, "business_partner", [{ code: "A" }]);
    await expect(service.commit(context, session.id)).rejects.toThrow("validated");
    await expect(service.validate(context, session.id)).resolves.toMatchObject({ validCount: 1, invalidCount: 0 });
    await expect(service.preview(context, session.id)).resolves.toMatchObject({ validCount: 1 });
    await expect(service.commit(context, session.id)).resolves.toEqual({ sessionId: "import-1", jobId: "job-1", status: "queued" });
    expect(stored?.session.status).toBe("commit_queued");
    expect(jobs).toHaveLength(1);
  });

  it("does not let heartbeat resurrect a superseded fenced lock", async () => {
    const service = createRecordLockService({ acquire: async () => ({ kind: "acquired", lock: { tenantId: context.tenantId, entityCode: "party", recordId: "1", ownerPrincipalId: context.principalId, token: "token", fencingToken: 2, acquiredAt: "2026-08-10T00:00:00Z", expiresAt: "2026-08-10T00:01:00Z" } }), heartbeat: async () => null, release: async () => false });
    await expect(service.heartbeat(context, "party", "1", "old-token", 1)).rejects.toMatchObject({ code: "LOCK_SUPERSEDED" });
  });

  it("uses database time, monotonic fences, and non-resurrecting heartbeat in DDL", () => {
    const root = resolve(process.cwd(), "../../../db/ddl/common/ops");
    const tables = readFileSync(resolve(root, "03_tables.sql"), "utf8");
    const functions = readFileSync(resolve(root, "07_functions.sql"), "utf8");
    expect(tables).toContain("fencing_token      bigint");
    expect(functions).toContain("v_now timestamptz := clock_timestamp()");
    expect(functions).toContain("fencing_token=current_lock.fencing_token+1");
    expect(functions).toContain("AND fencing_token=p_fencing_token AND expires_at>v_now");
  });
});
