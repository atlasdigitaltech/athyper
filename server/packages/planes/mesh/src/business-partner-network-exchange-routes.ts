import { dateInput, timestampInput } from "./route-dates.js";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type {
  Application,
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "@athyper/server-runtime-http";
import {
  MeshNetworkExchangeError,
  type BusinessPartnerNetworkExchangeService,
} from "./business-partner-network-exchange.js";

export function registerBusinessPartnerNetworkExchangeRoutes(
  app: Application,
  options: {
    authenticate: RequestHandler;
    readContext: (response: Response) => VerifiedRequestContext;
    resolveAccountContext?: (context: VerifiedRequestContext, requested: unknown) => Promise<VerifiedRequestContext>;
    service: BusinessPartnerNetworkExchangeService;
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
        const verified = options.readContext(response);
        const context = options.resolveAccountContext
          ? await options.resolveAccountContext(verified, request.query["networkAccountId"])
          : verified;
        const result = await work(
          request,
          context,
          response,
        );
        if (!response.headersSent) response.json(result);
        statusCode = response.statusCode;
      } catch (cause) {
        outcome =
          cause instanceof MeshNetworkExchangeError && cause.status === 403
            ? "denied"
            : "error";
        statusCode =
          cause instanceof MeshNetworkExchangeError ? cause.status : 500;
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
  app.get(
    "/api/mesh/business-partner-network-workspace",
    options.authenticate,
    route("workspace.read", (_req, ctx) =>
      options.service.workspace({ context: ctx }),
    ),
  );
  app.post(
    "/api/mesh/business-partner-network-relationships",
    options.authenticate,
    route("relationship.request", async (req, ctx, res) => {
      const b = object(req.body);
      const result = await options.service.requestRelationship({
        context: ctx,
        actorRole: choice(
          b["actorRole"],
          ["buyer", "supplier"] as const,
          "actorRole",
        ),
        counterpartyTenantId: uuid(
          b["counterpartyTenantId"],
          "counterpartyTenantId",
        ),
        counterpartyAccountId: uuid(
          b["counterpartyAccountId"],
          "counterpartyAccountId",
        ),
        relationshipKind: text(
          b["relationshipKind"] ?? "commercial",
          "relationshipKind",
        ),
        ...(b["effectiveFrom"] !== undefined
          ? {
              effectiveFrom: dateInput(
                b["effectiveFrom"],
                "effectiveFrom",
                invalid,
              ),
            }
          : {}),
        ...(b["effectiveUntil"] !== undefined
          ? {
              effectiveUntil: dateInput(
                b["effectiveUntil"],
                "effectiveUntil",
                invalid,
              ),
            }
          : {}),
        reason: text(b["reason"], "reason"),
        idempotencyKey: text(
          b["idempotencyKey"] ?? req.get("idempotency-key"),
          "idempotencyKey",
        ),
      });
      res.status(result.replayed ? 200 : 201);
      return result;
    }),
  );
  app.post(
    "/api/mesh/business-partner-network-relationships/:relationshipId/decisions",
    options.authenticate,
    route("relationship.transition", (req, ctx) => {
      const b = object(req.body);
      return options.service.transitionRelationship({
        context: ctx,
        relationshipId: uuid(req.params["relationshipId"], "relationshipId"),
        action: choice(
          b["action"],
          [
            "accept",
            "reject",
            "cancel",
            "suspend",
            "reactivate",
            "terminate",
          ] as const,
          "action",
        ),
        expectedVersion: integer(b["expectedVersion"], "expectedVersion"),
        reason: text(b["reason"], "reason"),
        idempotencyKey: text(
          b["idempotencyKey"] ?? req.get("idempotency-key"),
          "idempotencyKey",
        ),
      });
    }),
  );
  app.post(
    "/api/mesh/business-partner-network-relationships/:relationshipId/capabilities",
    options.authenticate,
    route("capability.request", async (req, ctx, res) => {
      const b = object(req.body),
        result = await options.service.requestCapability({
          context: ctx,
          relationshipId: uuid(req.params["relationshipId"], "relationshipId"),
          capabilityCode: text(b["capabilityCode"], "capabilityCode"),
          effectiveFrom: dateInput(
            b["effectiveFrom"],
            "effectiveFrom",
            invalid,
          ),
          ...(b["effectiveUntil"] !== undefined
            ? {
                effectiveUntil: dateInput(
                  b["effectiveUntil"],
                  "effectiveUntil",
                  invalid,
                ),
              }
            : {}),
          routingPolicy: optionalObject(b["routingPolicy"]),
          reason: text(b["reason"], "reason"),
          idempotencyKey: text(
            b["idempotencyKey"] ?? req.get("idempotency-key"),
            "idempotencyKey",
          ),
        });
      res.status(result.replayed ? 200 : 201);
      return result;
    }),
  );
  app.post(
    "/api/mesh/business-partner-network-capabilities/:capabilityId/decisions",
    options.authenticate,
    route("capability.transition", (req, ctx) => {
      const b = object(req.body);
      return options.service.transitionCapability({
        context: ctx,
        capabilityId: uuid(req.params["capabilityId"], "capabilityId"),
        action: choice(
          b["action"],
          ["accept", "reject", "suspend", "end"] as const,
          "action",
        ),
        expectedVersion: integer(b["expectedVersion"], "expectedVersion"),
        reason: text(b["reason"], "reason"),
        idempotencyKey: text(
          b["idempotencyKey"] ?? req.get("idempotency-key"),
          "idempotencyKey",
        ),
      });
    }),
  );
  app.post(
    "/api/mesh/business-partner-registration-exchanges",
    options.authenticate,
    route("registration.issue", async (req, ctx, res) => {
      const b = object(req.body),
        result = await options.service.issueExchange({
          context: ctx,
          counterpartyTenantId: uuid(
            b["counterpartyTenantId"],
            "counterpartyTenantId",
          ),
          counterpartyAccountId: uuid(
            b["counterpartyAccountId"],
            "counterpartyAccountId",
          ),
          intentKind: choice(
            b["intentKind"],
            [
              "buyer_request",
              "supplier_self_registration",
              "discovery_nomination",
            ] as const,
            "intentKind",
          ),
          relationshipKind: text(
            b["relationshipKind"] ?? "commercial",
            "relationshipKind",
          ),
          contractName: text(b["contractName"], "contractName"),
          contractVersion: integer(b["contractVersion"], "contractVersion"),
          contractHash: hash(b["contractHash"], "contractHash"),
          intentSnapshot: optionalObject(b["intentSnapshot"]),
          invitationTokenHash: hash(
            b["invitationTokenHash"],
            "invitationTokenHash",
          ),
          expiresAt: timestampInput(b["expiresAt"], "expiresAt", invalid),
          reason: text(b["reason"], "reason"),
          idempotencyKey: text(
            b["idempotencyKey"] ?? req.get("idempotency-key"),
            "idempotencyKey",
          ),
        });
      res.status(result.replayed ? 200 : 201);
      return result;
    }),
  );
  app.post(
    "/api/mesh/business-partner-registration-exchanges/:exchangeId/decisions",
    options.authenticate,
    route("registration.transition", (req, ctx) => {
      const b = object(req.body);
      return options.service.transitionExchange({
        context: ctx,
        exchangeId: uuid(req.params["exchangeId"], "exchangeId"),
        action: choice(
          b["action"],
          ["accept", "reject", "cancel", "expire"] as const,
          "action",
        ),
        expectedVersion: integer(b["expectedVersion"], "expectedVersion"),
        reason: text(b["reason"], "reason"),
        idempotencyKey: text(
          b["idempotencyKey"] ?? req.get("idempotency-key"),
          "idempotencyKey",
        ),
      });
    }),
  );
}
function object(v: unknown) {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw invalid("JSON object required");
  return v as Record<string, unknown>;
}
function optionalObject(v: unknown) {
  return v == null ? {} : object(v);
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
function integer(v: unknown, name: string) {
  const value = v;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
    throw invalid(`${name} must be a positive integer`);
  return value;
}
function hash(v: unknown, name: string) {
  const value = text(v, name);
  if (!/^[a-f0-9]{64}$/.test(value))
    throw invalid(`${name} must be a lowercase SHA-256 hash`);
  return value;
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
  return new MeshNetworkExchangeError(400, "MESH_EXCHANGE_INVALID", message);
}
function handle(cause: unknown, response: Response, next: NextFunction) {
  if (!(cause instanceof MeshNetworkExchangeError)) {
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
