import express from "express";
import {expect, it, vi} from "vitest";
import {registerBusinessPartnerGovernedImportRoutes} from "../business-partner-governed-import-routes.js";
import {MasterDataError} from "../errors.js";
it("authenticates direct APIs, rejects generic mutation envelopes and preserves server denials", async () => {
  const app = express(); app.use(express.json());
  const execute = vi.fn(async () => {throw new MasterDataError(503, "BP_GOVERNED_IMPORT_UNAVAILABLE", "internal detail");});
  const context = {principalId: "server-verified"};
  registerBusinessPartnerGovernedImportRoutes(app, {authenticate: (req,res,next) => {if (req.headers["authorization"] !== "test") {res.sendStatus(401); return;} next();}, readContext: () => context as never, service: {execute}});
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw Error("No test address");
  const url = `http://127.0.0.1:${address.port}/api/neon/business-partner-imports`;
  const send = (body: unknown, authenticated = true) => fetch(url, {method: "POST", headers: {"content-type": "application/json", ...(authenticated ? {authorization: "test"} : {})}, body: JSON.stringify(body)});
  try {
    expect((await send({}, false)).status).toBe(401);
    expect((await send({schemaVersion: 1, mode: "upsert", context})).status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
    const body = {schemaVersion: 1, release: {releaseId: "release", compiledHash: "hash"}, batch: {}};
    const result = await send(body);
    expect(result.status).toBe(503); expect(await result.json()).toEqual({code: "BP_GOVERNED_IMPORT_UNAVAILABLE"});
    expect(execute).toHaveBeenCalledWith(context, body.release, body.batch);
    expect(result.headers.get("cache-control")).toBe("no-store");
  } finally {server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));}
});
