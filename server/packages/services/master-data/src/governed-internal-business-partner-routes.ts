import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { GovernedInternalBusinessPartnerCaseService } from "@athyper/server-contract-master-data";
import type {
  Application,
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";
import { MasterDataError } from "./errors.js";

export function registerGovernedInternalBusinessPartnerRoutes(
  app: Application,
  options: {
    readonly authenticate: RequestHandler;
    readonly readContext: (response: Response) => VerifiedRequestContext;
    readonly service: GovernedInternalBusinessPartnerCaseService;
    readonly telemetry?: (measurement: {
      readonly operation: string;
      readonly outcome: "success" | "denied" | "error";
      readonly statusCode: number;
      readonly durationMs: number;
    }) => void;
  },
): void {
  const route =
    (
      operation: string,
      work: (
        request: Request,
        context: VerifiedRequestContext,
        response: Response,
      ) => Promise<unknown>,
    ): RequestHandler =>
    async (request, response, next) => {
      const startedAt = performance.now();
      let outcome: "success" | "denied" | "error" = "success",
        statusCode = 200;
      try {
        const result = await work(
          request,
          options.readContext(response),
          response,
        );
        if (!response.headersSent) response.json(result);
        statusCode = response.statusCode;
      } catch (error) {
        outcome =
          error instanceof MasterDataError && error.status === 403
            ? "denied"
            : "error";
        statusCode = error instanceof MasterDataError ? error.status : 500;
        handle(error, response, next);
      } finally {
        options.telemetry?.({
          operation: `governed_internal.${operation}`,
          outcome,
          statusCode,
          durationMs: performance.now() - startedAt,
        });
      }
    };
  app.post(
    "/api/neon/governed-business-partner-cases",
    options.authenticate,
    route("create_draft", async (request, context, response) => {
      const body = object(request.body);
      const result = await options.service.createDraft({
        context,
        caseId: uuid(body["caseId"], "caseId"),
        caseCode: required(body, "caseCode"),
        entityContractId: uuid(body["entityContractId"], "entityContractId"),
        entityContractHash: hash(
          body["entityContractHash"],
          "entityContractHash",
        ),
        formTemplateReleaseId: uuid(
          body["formTemplateReleaseId"],
          "formTemplateReleaseId",
        ),
        formTemplateReleaseNo: positiveInteger(
          body["formTemplateReleaseNo"],
          "formTemplateReleaseNo",
        ),
        formTemplateHash: hash(body["formTemplateHash"], "formTemplateHash"),
        payload: object(body["payload"]),
        idempotencyKey: key(body["idempotencyKey"]),
      });
      response.status(result.replayed ? 200 : 201);
      return result;
    }),
  );
  app.post(
    "/api/neon/governed-business-partner-cases/:caseId/submit",
    options.authenticate,
    route("submit", async (request, context, response) => {
      const body = object(request.body),
        result = await options.service.transition({
          context,
          caseId: uuid(request.params["caseId"], "caseId"),
          action: "submit",
          expectedVersion: positiveInteger(
            body["expectedVersion"],
            "expectedVersion",
          ),
          cycleRunId: uuid(body["cycleRunId"], "cycleRunId"),
          cycleTaskId: uuid(body["cycleTaskId"], "cycleTaskId"),
          idempotencyKey: key(body["idempotencyKey"]),
        });
      response.status(result.replayed ? 200 : 201);
      return result;
    }),
  );
  app.post(
    "/api/neon/governed-business-partner-cases/:caseId/decisions",
    options.authenticate,
    route("decide", async (request, context, response) => {
      const body = object(request.body),
        action = enumeration(body["decision"], ["approve", "reject"] as const);
      const result = await options.service.transition({
        context,
        caseId: uuid(request.params["caseId"], "caseId"),
        action,
        expectedVersion: positiveInteger(
          body["expectedVersion"],
          "expectedVersion",
        ),
        cycleRunId: uuid(body["cycleRunId"], "cycleRunId"),
        cycleTaskId: uuid(body["cycleTaskId"], "cycleTaskId"),
        ...(body["reason"] == null ? {} : { reason: required(body, "reason") }),
        idempotencyKey: key(body["idempotencyKey"]),
      });
      response.status(result.replayed ? 200 : 201);
      return result;
    }),
  );
  app.post(
    "/api/neon/governed-business-partner-cases/:caseId/materialize",
    options.authenticate,
    route("materialize", async (request, context, response) => {
      const body = object(request.body),
        result = await options.service.materialize({
          context,
          caseId: uuid(request.params["caseId"], "caseId"),
          expectedVersion: positiveInteger(
            body["expectedVersion"],
            "expectedVersion",
          ),
          idempotencyKey: key(body["idempotencyKey"]),
        });
      response.status(result.replayed ? 200 : 201);
      return result;
    }),
  );
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw bad("JSON object required");
  return value as Record<string, unknown>;
}
function required(value: Record<string, unknown>, name: string): string {
  const result = typeof value[name] === "string" ? value[name].trim() : "";
  if (!result) throw bad(`${name} is required`);
  return result;
}
function key(value: unknown): string {
  const result = typeof value === "string" ? value : "";
  if (result.trim() !== result || result.length < 8 || result.length > 180)
    throw bad("idempotencyKey must be trimmed and contain 8 to 180 characters");
  return result;
}
function positiveInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1)
    throw bad(`${name} must be a positive integer`);
  return Number(value);
}
function uuid(value: unknown, name: string): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw bad(`${name} must be a UUID`);
  return value;
}
function hash(value: unknown, name: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value))
    throw bad(`${name} must be a lowercase SHA-256 hash`);
  return value;
}
function enumeration<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T {
  if (typeof value !== "string" || !allowed.includes(value as T))
    throw bad(`Expected one of: ${allowed.join(", ")}`);
  return value as T;
}
function bad(message: string) {
  return new MasterDataError(400, "GOVERNED_CASE_INVALID", message);
}
function handle(error: unknown, response: Response, next: NextFunction): void {
  if (!(error instanceof MasterDataError)) {
    next(error);
    return;
  }
  response
    .status(error.status)
    .type("application/problem+json")
    .json({
      type: `https://athyper.dev/problems/${error.code.toLowerCase()}`,
      title: error.code,
      status: error.status,
      detail: error.message,
      code: error.code,
    });
}
