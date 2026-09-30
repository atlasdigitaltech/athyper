import express from "express";
import type { AddressInfo } from "node:net";
import { expect, it, vi } from "vitest";
import { registerAtlasRoutes } from "../atlas-routes.js";

it("validates page context at the real HTTP boundary and keeps verified request authority", async () => {
  const id = "10000000-0000-4000-8000-000000000001";
  const verified = {
    tenantId: "verified-tenant",
    principalId: "verified-principal",
  };
  const run = vi.fn((command: any) =>
    (async function* () {
      yield {
        protocol: "atlas.sse/1",
        sequence: 1,
        runId: id,
        threadId: id,
        contextGenerationId: command.businessContext.generationId,
        emittedAt: new Date().toISOString(),
        event: { type: "run.completed", messageId: id, reason: "stop" },
      };
    })(),
  );
  const app = express();
  app.use(express.json());
  registerAtlasRoutes(app, {
    authenticate: (
      _req: express.Request,
      _res: express.Response,
      next: express.NextFunction,
    ) => next(),
    readContext: () => verified,
    runtime: { run },
    admission: {},
    threads: {},
  } as never);
  app.use(((error: any, _req: any, res: any, _next: any) =>
    res
      .status(error.statusCode ?? 500)
      .json({ code: error.code })) as express.ErrorRequestHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/atlas/threads/${id}/runs`;
    const body = {
      clientRequestId: id,
      publicModelId: "atlas-fast",
      dataClass: "internal",
      userText: "Explain this partner",
      catalogPolicyRevision: "1",
      businessContext: {
        schemaVersion: 1,
        kind: "record",
        entityCode: "business_partner",
        generationId: id,
        locale: "en",
        recordId: id,
        dirty: false,
      },
    };
    const post = (value: unknown) =>
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
    const accepted = await post(body);
    expect(accepted.status).toBe(200);
    expect(await accepted.text()).toContain(`"contextGenerationId":"${id}"`);
    expect(run.mock.calls[0]![0].context).toBe(verified);
    expect(run.mock.calls[0]![0].businessContext).toEqual(body.businessContext);
    for (const forged of [
      { tenantId: id },
      { principalId: id },
      { workContext: { companyCodeId: "bad" } },
      { schemaVersion: 2 },
      { selectedIds: [id] },
    ]) {
      const rejected = await post({
        ...body,
        businessContext: { ...body.businessContext, ...forged },
      });
      expect(rejected.status).toBe(400);
      await rejected.text();
    }
    expect(run).toHaveBeenCalledOnce();
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
