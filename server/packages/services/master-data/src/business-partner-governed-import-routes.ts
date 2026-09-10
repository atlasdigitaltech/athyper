import type {Application, RequestHandler, Response} from "express";
import type {VerifiedRequestContext} from "@athyper/server-contract-auth";
import type {BusinessPartnerGovernedImportOutcome} from "./business-partner-governed-import.js";
import {MasterDataError} from "./errors.js";

export function registerBusinessPartnerGovernedImportRoutes(app: Application, options: {
  readonly authenticate: RequestHandler;
  readonly readContext: (response: Response) => VerifiedRequestContext;
  readonly service: {execute(context: VerifiedRequestContext, release: {readonly releaseId: string; readonly compiledHash: string}, batch: unknown): Promise<{readonly release: {readonly releaseId: string; readonly compiledHash: string}; readonly outcomes: readonly BusinessPartnerGovernedImportOutcome[]}>};
}) {
  app.post("/api/neon/business-partner-imports", options.authenticate, async (request, response) => {
    try {
      const body = request.body;
      if (!body || typeof body !== "object" || Array.isArray(body) || body.schemaVersion !== 1 || Object.keys(body).some(k => !["schemaVersion", "release", "batch"].includes(k))) throw new MasterDataError(400, "BP_GOVERNED_IMPORT_INVALID", "A versioned governed import request is required");
      const result = await options.service.execute(options.readContext(response), body.release, body.batch);
      response.setHeader("Cache-Control", "no-store");
      response.status(200).json(result);
    } catch (error) {
      response.setHeader("Cache-Control", "no-store");
      response.status(error instanceof MasterDataError ? error.status : 503).json({code: error instanceof MasterDataError ? error.code : "BP_GOVERNED_IMPORT_UNAVAILABLE"});
    }
  });
}
