import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AuthorizationRequest, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { RecordImportSession } from "@athyper/server-contract-records";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { createInMemoryRecordTransferStore, createMetadataImportRowValidator, createRecordLockService, createRecordTransferService, GovernedImportAdapterRegistry } from "../index.js";

const context = { planeKey: "neon", realmKey: "athyper", tenantId: "tenant-1", principalId: "principal-1", authEpoch: 1, profileHash: "p", requestId: "r", permissions: { planeKey: "neon", tenantId: "tenant-1", principalId: "principal-1", principalFingerprint: "f", profileHash: "p", schemaHash: "s", resolvedAt: 1, allowed: [], denied: [], planLocked: [], planeExcluded: [], entries: [], authorizationScopes: [] } } satisfies VerifiedRequestContext;
const transferDescriptor = { schema: "athyper.entity-runtime-descriptor/1.0", entityCode: "business_partner", planeKey: "neon", releaseId: "r", releaseNo: 1, contractHash: "a".repeat(64), compiledHash: "b".repeat(64), storage: { schema: "master", object: "business_partner", idField: "id" }, fields: [], operations: { import: { code: "import", permissionCode: "records.import" }, export: { code: "export", permissionCode: "records.export" } }, listPresentation: { dataOperations: { importAdapterKey: "test.business_partner.v1",importOperationPermissions:{create:["records.import"]} } } } satisfies EntityRuntimeDescriptor;
const adapters = new GovernedImportAdapterRegistry([Object.freeze({ key: "test.business_partner.v1", supports: () => true, operations: () => ["create", "update", "upsert"] as const, validate: async ({ rowNumber }: { rowNumber: number }) => ({ rowNumber, valid: true, errors: [] }), apply: async () => ({ outcome: "created" as const }) })]);

describe("advanced Records modules", () => {
  it("leaves adapter-owned fields and server-generated required identities to governed import adapters", async () => {
    const descriptor = { ...transferDescriptor, fields: [
      { key: "id", storagePath: "id", type: "uuid" as const, required: true, writableOn: [] },
      { key: "code", storagePath: "code", type: "string" as const, required: true, writableOn: ["create" as const, "patch" as const] },
    ] } satisfies EntityRuntimeDescriptor;
    const validator = createMetadataImportRowValidator({ getEntityDescriptor: async () => descriptor }, { authorize: async () => ({ allowed: true }) });
    await expect(validator.validate(context, "business_partner", { code: "BP-1", partner_role: "supplier", metadata: {} }, 1, "create"))
      .resolves.toEqual({ rowNumber: 1, valid: true, errors: [] });
    await expect(validator.validate(context, "business_partner", { code: "BP-1" }, 1, "update"))
      .resolves.toEqual({ rowNumber: 1, valid: true, errors: [] });
  });

  it("requires stage, validation, and preview before import commit", async () => {
    let stored: { session: RecordImportSession; rows: readonly Readonly<Record<string, unknown>>[]; validation?: readonly { rowNumber: number; valid: boolean; errors: readonly string[] }[] } | undefined;
    const jobs: Readonly<Record<string, unknown>>[] = [];
    const service = createRecordTransferService({ adapters, createId: () => "import-1", now: () => new Date("2026-08-10T00:00:00Z"), staging: {
      create: async (session, rows) => { stored = { session, rows }; }, get: async () => stored ?? null,
      saveValidation: async (_id, validation) => { stored = { ...stored!, validation }; }, setStatus: async (_id, status) => { stored = { ...stored!, session: { ...stored!.session, status } }; },
      saveExportRequest: async () => "created" as const,
    }, validator: { validate: async (_context, _entity, row, rowNumber) => ({ rowNumber, valid: typeof row["code"] === "string", errors: typeof row["code"] === "string" ? [] : ["code required"] }) }, jobs: { enqueue: async (_kind, payload) => { jobs.push(payload); return "job-1"; } }, metadata: { getEntityDescriptor: async () => transferDescriptor }, authorizer: { authorize: async () => ({ allowed: true }) }, audit: { record: async (input) => ({ ...input, id: "audit-1", occurredAt: "2026-08-10T00:00:00Z", severity: input.severity ?? "info" }) }, outbox: { append: async () => undefined }, transactions: { run: async (_plane, _actor, work) => work({}) } });
    const session = await service.stage(context, "business_partner", [{ code: "A" }]);
    await expect(service.commit(context, session.id)).rejects.toThrow("validated");
    await expect(service.validate(context, session.id)).resolves.toMatchObject({ validCount: 1, invalidCount: 0 });
    await expect(service.preview(context, session.id)).resolves.toMatchObject({ validCount: 1 });
    await expect(service.commit(context, session.id)).resolves.toEqual({ sessionId: "import-1", jobId: "records:import:import-1", status: "queued" });
    expect(stored?.session.status).toBe("commit_queued");
    expect(jobs).toHaveLength(1);
  });

  it("fails a queued import visibly when Redis dispatch is unavailable", async () => {
    const staging=createInMemoryRecordTransferStore<object>(),audit=vi.fn(async(input)=>({...input,id:"audit",occurredAt:"2026-08-10T00:00:00Z",severity:input.severity??"info"})),outbox=vi.fn(async()=>undefined);
    const service=createRecordTransferService({adapters,createId:()=>"import-dispatch-failure",now:()=>new Date("2026-08-10T00:00:00Z"),staging,validator:{validate:async(_context,_entity,_row,rowNumber)=>({rowNumber,valid:true,errors:[]})},jobs:{enqueue:async()=>{throw new Error("ECONNREFUSED");}},metadata:{getEntityDescriptor:async()=>transferDescriptor},authorizer:{authorize:async()=>({allowed:true})},audit:{record:audit},outbox:{append:outbox},transactions:{run:async(_plane,_actor,work)=>work({})}});
    const session=await service.stage(context,"business_partner",[{code:"A"}]);
    await service.validate(context,session.id);await service.preview(context,session.id);
    await expect(service.commit(context,session.id)).rejects.toMatchObject({statusCode:503,code:"TRANSFER_DISPATCH_UNAVAILABLE"});
    await expect(service.getImport(context,session.id)).resolves.toMatchObject({status:"failed",errorCode:"TRANSFER_DISPATCH_UNAVAILABLE"});
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({eventCode:"records.import.dispatch_failed",outcome:"failure"}),expect.anything());
    expect(outbox).toHaveBeenCalledWith(expect.objectContaining({eventType:"records.import.dispatch_failed"}),expect.anything());
  });

  it("fails a queued export visibly when Redis dispatch is unavailable",async()=>{
    const staging=createInMemoryRecordTransferStore<object>(),failed=vi.fn(async()=>true),audit=vi.fn(async(input)=>({...input,id:"audit",occurredAt:"2026-08-10T00:00:00Z",severity:input.severity??"info"}));staging.failQueuedExport=failed;
    const service=createRecordTransferService({adapters,createId:()=>"export-dispatch-failure",now:()=>new Date("2026-08-10T00:00:00Z"),staging,validator:{validate:async(_context,_entity,_row,rowNumber)=>({rowNumber,valid:true,errors:[]})},jobs:{enqueue:async()=>{throw new Error("ECONNREFUSED");}},metadata:{getEntityDescriptor:async()=>transferDescriptor},authorizer:{authorize:async()=>({allowed:true})},audit:{record:audit},outbox:{append:async()=>undefined},transactions:{run:async(_plane,_actor,work)=>work({})}});
    await expect(service.requestExport(context,"business_partner",{})).rejects.toMatchObject({statusCode:503,code:"TRANSFER_DISPATCH_UNAVAILABLE"});
    expect(failed).toHaveBeenCalledWith(context.tenantId,"export-dispatch-failure","TRANSFER_DISPATCH_UNAVAILABLE",expect.any(String),"2026-08-10T00:00:00.000Z",expect.anything());
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({eventCode:"records.export.dispatch_failed",outcome:"failure"}),expect.anything());
  });

  it("resumes chunks, summarizes validation, publishes an error report, and cancels", async () => {
    const staging = createInMemoryRecordTransferStore<object>();
    const authorize = vi.fn(async (_request:AuthorizationRequest) => ({ allowed: true as const }));
    let report = "";
    const cancelled: string[] = [];
    const service = createRecordTransferService({ adapters, createId: () => "import-resumable", now: () => new Date("2026-08-10T00:00:00Z"), staging,
      validator: { validate: async (_context, _entity, row, rowNumber) => ({ rowNumber, valid: typeof row["code"] === "string", errors: typeof row["code"] === "string" ? [] : ["REQUIRED:code"] }) },
      jobs: { enqueue: async () => "job", cancel: async (jobId) => { cancelled.push(jobId); return true; } }, metadata: { getEntityDescriptor: async () => transferDescriptor }, authorizer: { authorize }, audit: { record: async (input) => ({ ...input, id: "audit", occurredAt: "2026-08-10T00:00:00Z", severity: input.severity ?? "info" }) }, outbox: { append: async () => undefined }, transactions: { run: async (_plane, _actor, work) => work({}) }, validationSampleSize: 1,
      errorReports: { write: async ({ content }) => { for await (const chunk of content) report += new TextDecoder().decode(chunk); return "errors/import-resumable.ndjson"; }, createDownloadUrl: async (key) => `https://download.test/${key}` },
    });
    await service.beginImport(context, "business_partner");
    await expect(service.appendImportChunk(context, "import-resumable", 1, [{ code: "late" }])).rejects.toThrow("required before");
    const first = await service.appendImportChunk(context, "import-resumable", 0, [{ code: "A" }, {}]);
    await expect(service.appendImportChunk(context, "import-resumable", 0, [{ code: "A" }, {}])).resolves.toMatchObject({ replayed: true, chunkChecksum: first.chunkChecksum });
    await service.completeImportUpload(context, "import-resumable", 1);
    const validation = await service.validate(context, "import-resumable");
    expect(validation.summary).toMatchObject({ totalCount: 2, validCount: 1, invalidCount: 1, errorsByCode: { REQUIRED: 1 }, truncated: false });
    expect(report).toContain('"rowNumber":2');
    await expect(service.downloadErrorReport(context, "import-resumable")).resolves.toMatchObject({ url: "https://download.test/errors/import-resumable.ndjson" });
    await expect(service.cancelImport(context, "import-resumable")).resolves.toEqual({ sessionId: "import-resumable", status: "cancelled" });
    expect(cancelled).toEqual(["records:import:import-resumable"]);
    expect(authorize).toHaveBeenCalled();
    for (const [request] of authorize.mock.calls) {
      expect(request.resource).toMatchObject({ tenantId: context.tenantId });
      expect(request.resource).not.toHaveProperty("entityCode");
    }
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
