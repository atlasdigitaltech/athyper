import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import express from "express";
import { it, expect, vi } from "vitest";
import { mountSupplierProcessDocuments } from "./supplier-process-document-runtime.js";
it("authenticates document commands and admits purpose only, never projection or template overrides", async () => {
  const app = express();
  app.use(express.json());
  const request = vi.fn(async () => ({ jobId: randomUUID() })),
    process = vi.fn(async () => ({ status: "ready" }));
  mountSupplierProcessDocuments(app, {
    authenticate: (req, res, next) => {
      if (req.headers.authorization !== "test-session") {
        res.status(401).end();
        return;
      }
      next();
    },
    readContext: () => ({ planeKey: "neon" }) as never,
    service: {
      request,
      process,
      view: async () => [],
      retry: process,
      download: process,
    } as never,
  });
  const server = createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  try {
    const addr = server.address();
    if (!addr || typeof addr === "string") throw Error("address");
    const base = `http://127.0.0.1:${addr.port}/api/governance/process-documents`,
      id = randomUUID(),
      headers = {
        authorization: "test-session",
        "content-type": "application/json",
      };
    expect((await fetch(`${base}/cases/${id}/view`)).status).toBe(401);
    for (const body of [
      { purpose: "unknown" },
      { purpose: "decision_document", data: { decision: "approved" } },
      { purpose: "submitted_review_pack", templateId: randomUUID() },
      { purpose: "activation_confirmation", sourceSnapshot: randomUUID() },
    ])
      expect(
        (
          await fetch(`${base}/cases/${id}/request`, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
          })
        ).status,
      ).toBe(400);
    expect(request).not.toHaveBeenCalled();
    for (const purpose of [
      "submitted_review_pack",
      "decision_document",
      "activation_confirmation",
    ])
      expect(
        (
          await fetch(`${base}/cases/${id}/request`, {
            method: "POST",
            headers,
            body: JSON.stringify({ purpose }),
          })
        ).status,
      ).toBe(200);
    expect(
      (
        await fetch(`${base}/jobs/${id}/process`, {
          method: "POST",
          headers,
          body: JSON.stringify({ status: "ready" }),
        })
      ).status,
    ).toBe(400);
    expect(process).not.toHaveBeenCalled();
    const valid = await fetch(`${base}/jobs/${id}/process`, {
      method: "POST",
      headers,
      body: "{}",
    });
    expect(valid.status).toBe(200);
    expect(valid.headers.get("cache-control")).toBe("no-store");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
