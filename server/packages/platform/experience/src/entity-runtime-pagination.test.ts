import express from "express";
import { createServer } from "node:http";
import { expect, it, vi } from "vitest";
import { registerEntityRuntimeRoutes } from "./entity-runtime-routes.js";

it("accepts HTTP page-size strings and opaque cursors but rejects unbounded or malformed queries", async () => {
  const app = express();
  const section = vi.fn(async () => ({ releaseId: "release", releaseHash: "hash", data: {} }));
  registerEntityRuntimeRoutes(app, { authenticate: (_q, _r, next) => next(), readContext: () => ({}) as never, service: { section } as never });
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/entity-runtime/business_partner/records/33333333-3333-4333-8333-333333333333/sections/industries?surface=detail`;
  try {
    expect((await fetch(url + "&limit=25&cursor=eyJ2IjoxfQ")).status).toBe(200);
    expect(section).toHaveBeenCalledWith(expect.objectContaining({ limit: 25, cursor: "eyJ2IjoxfQ" }));
    for (const query of ["&limit=0", "&limit=101", "&limit=2.5", "&cursor=" + "x".repeat(4097)]) expect((await fetch(url + query)).status).toBe(400);
    expect(section).toHaveBeenCalledTimes(1);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
