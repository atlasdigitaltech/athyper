import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { Application, NextFunction, Request, RequestHandler, Response } from "@athyper/server-runtime-http";
import { NeonProfileProjectionError, type BusinessPartnerProfileProjectionService, type MeshBusinessPartnerProfileEnvelope } from "./business-partner-profile-projection.js";

export function registerBusinessPartnerProfileProjectionRoutes(app: Application, options: { authenticate: RequestHandler; readContext: (response: Response) => VerifiedRequestContext; service: BusinessPartnerProfileProjectionService; telemetry?: (event: { operation: string; outcome: "success" | "denied" | "error"; statusCode: number; durationMs: number }) => void }) {
  const route = (operation: string, work: (request: Request, context: VerifiedRequestContext, response: Response) => Promise<unknown>): RequestHandler => async (request, response, next) => {
    const started = performance.now(); let outcome: "success" | "denied" | "error" = "success"; let statusCode = 200;
    try { const result = await work(request, options.readContext(response), response); if (!response.headersSent) response.json(result); statusCode = response.statusCode; }
    catch (cause) { outcome = cause instanceof NeonProfileProjectionError && cause.status === 403 ? "denied" : "error"; statusCode = cause instanceof NeonProfileProjectionError ? cause.status : 500; handle(cause, response, next); }
    finally { options.telemetry?.({ operation, outcome, statusCode, durationMs: performance.now() - started }); }
  };
  app.post("/api/neon/business-partner-profile-events", options.authenticate, route("receive", async (request, context, response) => { const result = await options.service.receive({ context, envelope: requiredObject(request.body) as unknown as MeshBusinessPartnerProfileEnvelope }); response.status(result.disposition === "applied" ? 201 : 202); return result; }));
  app.get("/api/neon/business-partner-profile-projections", options.authenticate, route("list", (request, context) => options.service.list({ context, ...(typeof request.query["networkRelationshipId"] === "string" ? { networkRelationshipId: request.query["networkRelationshipId"] } : {}), limit: integer(request.query["limit"]) })));
  app.get("/api/neon/business-partner-profile-events/receipts", options.authenticate, route("receipts", (request, context) => options.service.processingReceipts({ context, limit: integer(request.query["limit"]) })));
  app.get("/api/neon/business-partner-profile-events/quarantine", options.authenticate, route("quarantine", (request, context) => options.service.quarantine({ context, limit: integer(request.query["limit"]) })));
  app.post("/api/neon/business-partner-profile-events/:eventId/replays", options.authenticate, route("replay", (request, context) => options.service.replay({ context, eventId: uuid(request.params["eventId"]) })));
}
function requiredObject(value: unknown) { if (!value || typeof value !== "object" || Array.isArray(value)) throw new NeonProfileProjectionError(400, "MESH_PROFILE_ENVELOPE_INVALID", "JSON object required"); return value as Record<string, unknown>; }
function integer(value: unknown) { if (value == null || value === "") return undefined; const number = Number(value); if (!Number.isSafeInteger(number)) throw new NeonProfileProjectionError(400, "MESH_PROFILE_ENVELOPE_INVALID", "limit must be an integer"); return number; }
function uuid(value: unknown) { const text = String(value); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) throw new NeonProfileProjectionError(400, "MESH_PROFILE_ENVELOPE_INVALID", "eventId must be a UUID"); return text; }
function handle(cause: unknown, response: Response, next: NextFunction) { if (!(cause instanceof NeonProfileProjectionError)) { next(cause); return; } response.status(cause.status).type("application/problem+json").json({ type: `https://athyper.dev/problems/${cause.code.toLowerCase()}`, title: cause.code, status: cause.status, detail: cause.message, code: cause.code }); }
