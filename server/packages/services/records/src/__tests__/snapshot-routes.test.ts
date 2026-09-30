import { createServer } from "node:http";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerRecordSnapshotRoutes } from "../snapshots/snapshot-routes.js";
import { RecordServiceError } from "../errors.js";

const A = "018f6d2a-1111-7a11-8111-111111111111", B = "018f6d2a-2222-7a22-8222-222222222222";
const paths = [`/api/records/partner/${A}/snapshots`, `/api/record-snapshots/${A}`, `/api/record-snapshots/${A}/compare/${B}`, `/api/record-snapshots/${A}/restore`];
const context = { tenantId: A, principalId: B, planeKey: "neon" } as never;
const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }))); });
async function setup() {
  const snapshots = { capture: vi.fn(async () => ({ kind: "created" })), query: vi.fn(async () => ({ payload: {} })), compare: vi.fn(async () => ({ changedFields: [] })), restore: vi.fn(async () => ({ kind: "Committed", action: "patch", replayed: false })) };
  const authorize = vi.fn(async () => ({ allowed: true }));
  const app = express(); app.use(express.json());
  registerRecordSnapshotRoutes(app, { authenticate: (req, res, next) => { if (req.headers.authorization !== "Bearer test") { res.sendStatus(401); return; } next(); }, readContext: () => context, authorizer: { authorize } as never, snapshots: snapshots as never });
  app.use((error: { statusCode?: number; code?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(error.statusCode ?? 500).json({ code: error.code ?? "INTERNAL_ERROR" }); });
  const server = createServer(app); servers.push(server); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No address");
  const request = (index: number, init: RequestInit = {}, path = paths[index]!) => fetch(`http://127.0.0.1:${address.port}${path}`, { method: index === 0 || index === 3 ? "POST" : "GET", ...(index === 0 ? { body: "{}" } : {}), ...init, headers: { authorization: "Bearer test", "content-type": "application/json", "if-match": '"2"', "idempotency-key": "idempotency-key-1", ...init.headers } });
  return { request, snapshots, authorize };
}
describe("snapshot HTTP routes", () => {
  it.each([0, 1, 2, 3])("authenticates route %s", async index => {
    const h = await setup(); expect((await h.request(index, { headers: { authorization: "" } })).status).toBe(401);
    expect(h.authorize).not.toHaveBeenCalled();
  });
  it.each([0, 1, 2, 3])("denies unauthorized route %s before service execution", async index => {
    const h = await setup(); h.authorize.mockResolvedValue({ allowed: false });
    expect((await h.request(index)).status).toBe(403);
    for (const work of Object.values(h.snapshots)) expect(work).not.toHaveBeenCalled();
  });
  it.each([0, 1, 2, 3])("returns no-store success for route %s", async index => {
    const h = await setup(); const response = await h.request(index);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("authorizes both comparison coordinates", async () => {
    const h = await setup(); h.authorize.mockResolvedValueOnce({ allowed: true }).mockResolvedValueOnce({ allowed: false });
    expect((await h.request(2)).status).toBe(403); expect(h.snapshots.compare).not.toHaveBeenCalled();
    expect(h.authorize.mock.calls).toHaveLength(2);
  });
  it.each([0, 1, 2, 3])("rejects malformed UUIDs on route %s", async index => {
    const h = await setup(); expect((await h.request(index, {}, paths[index]!.replace(A, "invalid"))).status).toBe(400);
    expect(h.authorize).not.toHaveBeenCalled();
  });
  it.each([null, [], { captureKind: "wrong" }, { retentionClass: "wrong" }, { captureSource: "forged" }, { auditEventId: "bad" }, { captureEvent: "BAD EVENT" }, { validFrom: "2026-02-30T00:00:00Z" }, { validFrom: "2026-01-01" }, { validFrom: "2026-09-06T00:00:00Z", validUntil: "2026-09-06T01:00:00+01:00" }].map(body => ({ body })))("rejects invalid capture body $body", async ({ body }) => {
    const h = await setup(); expect((await h.request(0, { body: JSON.stringify(body) })).status).toBe(400); expect(h.snapshots.capture).not.toHaveBeenCalled();
  });
  it("normalizes capture timestamps and passes only supported options", async () => {
    const h = await setup(); expect((await h.request(0, { body: JSON.stringify({ captureKind: "approval", retentionClass: "legal", validFrom: "2026-09-06T08:00:00+08:00" }) })).status).toBe(200);
    expect(h.snapshots.capture).toHaveBeenCalledWith(context, "partner", A, { captureKind: "approval", retentionClass: "legal", validFrom: "2026-09-06T00:00:00.000Z" });
  });
  it("compares validity chronologically across expanded ISO years", async () => {
    const h = await setup();
    expect((await h.request(0, { body: JSON.stringify({ validFrom: "9999-12-31T23:00:00Z", validUntil: "9999-12-31T23:59:00-01:00" }) })).status).toBe(200);
  });
  it.each(["", "0", "-1", "1.5", "1e2", 'W/"2"', "9007199254740993", '"2'])("rejects invalid If-Match %s", async version => {
    const h = await setup(); expect((await h.request(3, { headers: { "if-match": version } })).status).toBe(428); expect(h.snapshots.restore).not.toHaveBeenCalled();
  });
  it.each(["", "short", "x".repeat(129)])("rejects invalid idempotency key", async key => {
    const h = await setup(); expect((await h.request(3, { headers: { "idempotency-key": key } })).status).toBe(428); expect(h.snapshots.restore).not.toHaveBeenCalled();
  });
  it("forwards restore preconditions and maps mutation conflicts", async () => {
    const h = await setup(); h.snapshots.restore.mockResolvedValue({ kind: "VersionConflict" } as never);
    const response = await h.request(3); expect(response.status).toBe(409);
    expect(h.snapshots.restore).toHaveBeenCalledWith(context, A, 2, "idempotency-key-1");
  });
  it("maps domain errors and forwards unexpected errors", async () => {
    const h = await setup(); h.snapshots.query.mockRejectedValueOnce(new RecordServiceError(404, "SNAPSHOT_NOT_FOUND", "Missing"));
    expect((await h.request(1)).status).toBe(404);
    h.snapshots.query.mockRejectedValueOnce(new Error("private"));
    expect((await h.request(1)).status).toBe(500);
  });
});
