import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { Application, NextFunction, Request, RequestHandler, Response } from "express";
import type { createWorkerEngagementIamService } from "./worker-engagement-iam-service.js";
import { MasterDataError } from "./errors.js";

type Service = ReturnType<typeof createWorkerEngagementIamService>;

export function registerWorkerEngagementIamRoutes(app: Application, options: { authenticate: RequestHandler; readContext: (response: Response) => VerifiedRequestContext; service: Service }) {
  app.post("/api/neon/supplier-workforce/engagements/:workerEngagementId/iam-projections", options.authenticate, async (request: Request, response: Response, next: NextFunction) => {
    response.setHeader("Cache-Control", "private, no-store");
    try {
      const body = object(request.body);
      const result = await options.service.project({
        context: options.readContext(response),
        workerEngagementId: uuid(request.params["workerEngagementId"], "workerEngagementId"),
        expectedVersion: integer(body["expectedVersion"], "expectedVersion"),
        idempotencyKey: text(body["idempotencyKey"], "idempotencyKey"),
      });
      response.status(result.replayed ? 200 : 201).json(result);
    } catch (cause) {
      if (cause instanceof MasterDataError)
        response.status(cause.status).type("application/problem+json").json({ title: cause.code, status: cause.status, detail: cause.message, code: cause.code });
      else next(cause);
    }
  });
}

function object(value: unknown) { if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid("JSON object required"); return value as Record<string, unknown>; }
function text(value: unknown, name: string) { const result = String(value ?? ""); if (!result) throw invalid(`${name} is required`); return result; }
function integer(value: unknown, name: string) { const result = Number(value); if (!Number.isSafeInteger(result) || result < 1) throw invalid(`${name} must be positive`); return result; }
function uuid(value: unknown, name: string) { const result = text(value, name); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) throw invalid(`${name} must be a UUID`); return result; }
function invalid(message: string) { return new MasterDataError(400, "WORKER_ENGAGEMENT_IAM_INVALID", message); }
