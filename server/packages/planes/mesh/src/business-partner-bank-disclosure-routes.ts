import { timestampInput } from "./route-dates.js";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type {
  Application,
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "@athyper/server-runtime-http";
import {
  MeshBankDisclosureError,
  type BusinessPartnerBankDisclosureService,
} from "./business-partner-bank-disclosure.js";

export function registerBusinessPartnerBankDisclosureRoutes(
  app: Application,
  options: {
    authenticate: RequestHandler;
    readContext: (response: Response) => VerifiedRequestContext;
    service: BusinessPartnerBankDisclosureService;
    telemetry?: (event: {
      operation: string;
      outcome: "success" | "denied" | "error";
      statusCode: number;
      durationMs: number;
    }) => void;
  },
) {
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
      const started = performance.now();
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
      } catch (cause) {
        outcome =
          cause instanceof MeshBankDisclosureError && cause.status === 403
            ? "denied"
            : "error";
        statusCode =
          cause instanceof MeshBankDisclosureError ? cause.status : 500;
        handle(cause, response, next);
      } finally {
        options.telemetry?.({
          operation,
          outcome,
          statusCode,
          durationMs: performance.now() - started,
        });
      }
    };
  app.post(
    "/api/mesh/business-partner-bank-disclosures",
    options.authenticate,
    route("request", async (req, ctx, res) => {
      const body = object(req.body),
        result = await options.service.request({
          context: ctx,
          ownerAccountId: uuid(body["ownerAccountId"], "ownerAccountId"),
          bankAccountId: uuid(body["bankAccountId"], "bankAccountId"),
          networkRelationshipId: uuid(
            body["networkRelationshipId"],
            "networkRelationshipId",
          ),
          purpose: choice(
            body["purpose"],
            ["settlement", "refund"] as const,
            "purpose",
          ),
          ...(body["expiresAt"] !== undefined
            ? {
                expiresAt: timestampInput(
                  body["expiresAt"],
                  "expiresAt",
                  invalid,
                ),
              }
            : {}),
          idempotencyKey: text(
            body["idempotencyKey"] ?? req.get("idempotency-key"),
            "idempotencyKey",
          ),
        });
      res.status(result.replayed ? 200 : 201);
      return result;
    }),
  );
  app.get(
    "/api/mesh/business-partner-bank-disclosures/:disclosureId",
    options.authenticate,
    route("read", (req, ctx) =>
      options.service.get({
        context: ctx,
        disclosureId: uuid(req.params["disclosureId"], "disclosureId"),
      }),
    ),
  );
  app.post(
    "/api/mesh/business-partner-bank-disclosures/:disclosureId/decisions",
    options.authenticate,
    route("decide", async (req, ctx, res) => {
      const body = object(req.body),
        result = await options.service.decide({
          context: ctx,
          disclosureId: uuid(req.params["disclosureId"], "disclosureId"),
          decision: choice(
            body["decision"],
            ["approve", "reject"] as const,
            "decision",
          ),
          ...(body["reason"] !== undefined
            ? { reason: text(body["reason"], "reason") }
            : {}),
          ...(body["secureRetrievalReference"] !== undefined
            ? {
                secureRetrievalReference: text(
                  body["secureRetrievalReference"],
                  "secureRetrievalReference",
                ),
              }
            : {}),
          idempotencyKey: text(
            body["idempotencyKey"] ?? req.get("idempotency-key"),
            "idempotencyKey",
          ),
        });
      res.status(result.replayed ? 200 : 201);
      return result;
    }),
  );
  app.post(
    "/api/mesh/business-partner-bank-disclosures/:disclosureId/revocations",
    options.authenticate,
    route("revoke", async (req, ctx, res) => {
      const body = object(req.body),
        result = await options.service.revoke({
          context: ctx,
          disclosureId: uuid(req.params["disclosureId"], "disclosureId"),
          reason: text(body["reason"], "reason"),
          idempotencyKey: text(
            body["idempotencyKey"] ?? req.get("idempotency-key"),
            "idempotencyKey",
          ),
        });
      res.status(result.replayed ? 200 : 201);
      return result;
    }),
  );
}
function object(v: unknown) {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw invalid("JSON object required");
  return v as Record<string, unknown>;
}
function text(v: unknown, name: string) {
  const value = v;
  if (typeof value !== "string" || !value.trim())
    throw invalid(`${name} is required`);
  return value;
}
function uuid(v: unknown, name: string) {
  const value = text(v, name);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw invalid(`${name} must be a UUID`);
  return value.toLowerCase();
}
function choice<const T extends readonly string[]>(
  v: unknown,
  values: T,
  name: string,
): T[number] {
  const value = v;
  if (typeof value !== "string" || !values.includes(value))
    throw invalid(`${name} must be ${values.join(" or ")}`);
  return value as T[number];
}
function invalid(message: string) {
  return new MeshBankDisclosureError(
    400,
    "MESH_BANK_DISCLOSURE_INVALID",
    message,
  );
}
function handle(cause: unknown, response: Response, next: NextFunction) {
  if (!(cause instanceof MeshBankDisclosureError)) {
    next(cause);
    return;
  }
  response
    .status(cause.status)
    .type("application/problem+json")
    .json({
      type: `https://athyper.dev/problems/${cause.code.toLowerCase()}`,
      title: cause.code,
      status: cause.status,
      detail: cause.message,
      code: cause.code,
    });
}
