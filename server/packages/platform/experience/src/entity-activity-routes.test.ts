import express from "express";
import { once } from "node:events";
import { expect, it, vi } from "vitest";
import { registerEntityActivityRoutes } from "./entity-activity-routes.js";
import { EntityActivityError } from "./entity-activity-service.js";
it("Activity HTTP boundary authenticates, rejects arbitrary capture input and returns no-store failures", async () => {
  const app = express();
  app.use(express.json());
  const service = {
    describe: vi.fn(async () => ({ views: ["auditLog"] })),
    page: vi.fn(async () => ({ items: [] })),
    snapshot: vi.fn(),
    collection: vi.fn(async () => ({items:[]})),
    compareCollection: vi.fn(async () => ({items:[]})),
    compare: vi.fn(async () => ({ fields: [] })),
    capture: vi.fn(async () => ({ id: "snapshot", replayed: false })),
  };
  const authenticate = vi.fn((_req, res, next) => {
    res.locals.context = { tenantId: "trusted" };
    next();
  });
  registerEntityActivityRoutes(app, {
    authenticate,
    readContext: (response) => response.locals.context,
    service: service as never,
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}/api/entity-runtime/example_reference/records/00000000-0000-4000-8000-000000000001/activity`;
    const collection = await fetch(`${base}/snapshots/one/collections/lines`);
    expect(collection.status).toBe(200);
    expect(service.collection).toHaveBeenCalled();
    expect((await fetch(`${base}/snapshots/one/collections/lines?tenantId=other`)).status).toBe(400);
    expect((await fetch(`${base}/compare/collections/lines`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({from:"one",to:"two"})})).status).toBe(200);
    expect((await fetch(`${base}/compare/collections/lines`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({from:"one",to:"two",scope:"arbitrary"})})).status).toBe(400);
    const description = await fetch(base);
    expect(description.status).toBe(200);
    expect(description.headers.get("cache-control")).toContain("no-store");
    expect(authenticate).toHaveBeenCalled();
    const invalid = await fetch(`${base}/snapshots`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "capture-key",
      },
      body: JSON.stringify({ tenantId: "other", entityType: "arbitrary" }),
    });
    expect(invalid.status).toBe(400);
    expect(service.capture).not.toHaveBeenCalled();
    const capture = await fetch(`${base}/snapshots`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "capture-key",
      },
      body: "{}",
    });
    expect(capture.status).toBe(200);
    expect(service.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        context: { tenantId: "trusted" },
        idempotencyKey: "capture-key",
      }),
    );
    expect((await fetch(`${base}/audit?days=1000`)).status).toBe(400);
    expect((await fetch(`${base}/audit?tenantId=other`)).status).toBe(400);
    expect((await fetch(`${base}/audit?period=custom&timeZone=Asia%2FKuala_Lumpur&startDate=2026-09-01&endDate=2026-09-02`)).status).toBe(200);
    expect(service.page).toHaveBeenLastCalledWith(expect.objectContaining({range:{period:"custom",timeZone:"Asia/Kuala_Lumpur",startDate:"2026-09-01",endDate:"2026-09-02"}}));
    expect((await fetch(`${base}/audit?startDate=2026-09-01`)).status).toBe(400);
    expect((await fetch(`${base}/audit?period=today&period=yesterday&timeZone=UTC`)).status).toBe(400);
    service.page.mockRejectedValue(
      new EntityActivityError(403, "ACTIVITY_DENIED"),
    );
    const denied = await fetch(`${base}/audit`);
    expect(denied.status).toBe(403);
    expect(denied.headers.get("cache-control")).toContain("no-store");
    expect(
      (
        await fetch(`${base}/compare`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: '{"from":"one","to":"two","restore":true}',
        })
      ).status,
    ).toBe(400);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
