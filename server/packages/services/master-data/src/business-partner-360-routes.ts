import { parseBusinessDate, parseInstant } from "@athyper/platform-temporal";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import {
  BUSINESS_PARTNER_360_SECTION_CODES,
  type BusinessPartner360RoleLens,
  type BusinessPartner360SectionCode,
  type BusinessPartner360Service,
} from "@athyper/server-contract-master-data";
import type {
  Application,
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";
import { registerContractRoute } from "@athyper/server-runtime-http";
import { businessPartner360RouteContracts as contracts } from "./business-partner-360-route-contracts.js";
import { MasterDataError } from "./errors.js";

export interface BusinessPartner360TelemetryEvent {
  readonly operation: string;
  readonly outcome: "success" | "failure";
  readonly statusCode: number;
  readonly durationMs: number;
  readonly payloadBytes?: number;
  readonly section?: BusinessPartner360SectionCode;
  readonly state?: string;
  readonly reasonCode?: string;
  readonly completenessStatus?: string;
  readonly redactionClasses?: readonly string[];
  readonly meshFallbackReason?: string;
  readonly revealClass?: "tax" | "bank";
}
type MutableTelemetryFacts = {
  -readonly [Key in keyof BusinessPartner360TelemetryEvent]?: BusinessPartner360TelemetryEvent[Key];
};
export function registerBusinessPartner360Routes(
  app: Application,
  options: {
    readonly authenticate: RequestHandler;
    readonly readContext: (response: Response) => VerifiedRequestContext;
    readonly service: BusinessPartner360Service;
    readonly telemetry?: (event: BusinessPartner360TelemetryEvent) => void;
  },
) {
  const route =
    (
      operation: string,
      handler: (
        request: Request,
        context: VerifiedRequestContext,
      ) => Promise<unknown>,
    ) =>
    async (request: Request, response: Response, next: NextFunction) => {
      const started = performance.now();
      let statusCode = 200,
        facts: Partial<BusinessPartner360TelemetryEvent> = {};
      response.setHeader("Cache-Control", "private, no-store");
      try {
        const value = await handler(request, options.readContext(response));
        facts = safeTelemetryFacts(operation, value);
        response.status(200).json(value);
      } catch (error) {
        statusCode = error instanceof MasterDataError ? error.status : 500;
        if (error instanceof MasterDataError) {
          facts = { reasonCode: error.code };
          response
            .status(error.status)
            .type("application/problem+json")
            .json({
              type: `urn:athyper:problem:${error.code.toLowerCase().replaceAll("_", "-")}`,
              title: title(error.status),
              status: error.status,
              detail: error.message,
              instance: request.originalUrl,
              code: error.code,
              requestId: options.readContext(response).requestId,
            });
        } else next(error);
      } finally {
        options.telemetry?.({
          operation,
          outcome: statusCode < 400 ? "success" : "failure",
          statusCode,
          durationMs: performance.now() - started,
          ...facts,
        });
      }
    };
  registerContractRoute(
    app, contracts.summary,
    options.authenticate,
    route("summary", (request, context) =>
      options.service.summary(query(request, context)),
    ),
  );
  registerContractRoute(
    app, contracts.taxReveal,
    options.authenticate,
    route("tax-reveal", (request, context) =>
      options.service.revealTaxRegistration({
        context,
        businessPartnerId: uuid(
          request.params["businessPartnerId"],
          "businessPartnerId",
        ),
        taxRegistrationId: uuid(
          body(request)["taxRegistrationId"],
          "taxRegistrationId",
        ),
        purpose: purpose(body(request)["purpose"]),
        revealId: uuid(body(request)["revealId"], "revealId"),
        purposeExpiresAt: timestamp(body(request)["purposeExpiresAt"], "purposeExpiresAt"),
      }),
    ),
  );
  registerContractRoute(
    app, contracts.bankReveal,
    options.authenticate,
    route("bank-reveal", (request, context) =>
      options.service.revealBankAccount({
        context,
        businessPartnerId: uuid(
          request.params["businessPartnerId"],
          "businessPartnerId",
        ),
        bankAccountLinkId: uuid(
          body(request)["bankAccountLinkId"],
          "bankAccountLinkId",
        ),
        purpose: purpose(body(request)["purpose"]),
        revealId: uuid(body(request)["revealId"], "revealId"),
        purposeExpiresAt: timestamp(body(request)["purposeExpiresAt"], "purposeExpiresAt"),
      }),
    ),
  );
  registerContractRoute(
    app, contracts.section,
    options.authenticate,
    route("section", (request, context) =>
      options.service.section({
        ...query(request, context),
        sectionCode: section(
          request.params["section"],
          request.query["roleLens"],
        ),
        ...(request.query["cursor"]
          ? { cursor: text(request.query["cursor"], "cursor") }
          : {}),
        ...(request.query["limit"]
          ? { limit: limit(request.query["limit"]) }
          : {}),
      }),
    ),
  );
}
function title(status: number) {
  const titles: Readonly<Record<number, string>> = {
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    409: "Conflict",
    422: "Unprocessable Content",
    423: "Locked",
    428: "Precondition Required",
    429: "Too Many Requests",
    500: "Internal Server Error",
    503: "Service Unavailable",
  };
  return titles[status] ?? "Request Failed";
}
function query(request: Request, context: VerifiedRequestContext) {
  return {
    context,
    businessPartnerId: uuid(
      request.params["businessPartnerId"],
      "businessPartnerId",
    ),
    ...(request.query["operatingOrganizationId"]
      ? {
          operatingOrganizationId: uuid(
            request.query["operatingOrganizationId"],
            "operatingOrganizationId",
          ),
        }
      : {}),
    ...(request.query["companyCodeId"]
      ? { companyCodeId: uuid(request.query["companyCodeId"], "companyCodeId") }
      : {}),
    ...(request.query["legalEntityId"]
      ? { legalEntityId: uuid(request.query["legalEntityId"], "legalEntityId") }
      : {}),
    ...(request.query["roleLens"]
      ? { roleLens: role(request.query["roleLens"]) }
      : {}),
    ...(request.query["asOf"] ? { asOf: date(request.query["asOf"]) } : {}),
  };
}
function section(value: unknown, lens: unknown): BusinessPartner360SectionCode {
  if (typeof value !== "string") throw unavailable();
  const aliases: Readonly<Record<string, BusinessPartner360SectionCode>> = {
    identifiers: "identifiers-tax",
    roles: "roles-scope",
    "company-configuration":
      lens === "customer" ? "customer-company" : "supplier-company",
    qualifications: "qualifications-certificates",
    certificates: "qualifications-certificates",
  };
  const result = aliases[value] ?? value;
  if (
    !BUSINESS_PARTNER_360_SECTION_CODES.includes(
      result as BusinessPartner360SectionCode,
    ) ||
    result === "overview"
  )
    throw unavailable();
  return result as BusinessPartner360SectionCode;
}
function role(value: unknown): BusinessPartner360RoleLens {
  if (
    value !== "all" &&
    value !== "supplier" &&
    value !== "customer"
  )
    throw invalid("roleLens is invalid");
  return value;
}
function date(value: unknown) {
  const result = text(value, "asOf");
  if (!Number.isFinite(parseBusinessDate(result)))
    throw invalid("asOf must be an ISO date");
  return result;
}
function uuid(value: unknown, name: string) {
  const result = text(value, name);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      result,
    )
  )
    throw invalid(`${name} must be a UUID`);
  return result;
}
function text(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim() || value.length > 512)
    throw invalid(`${name} is invalid`);
  return value;
}
function limit(value: unknown) {
  const result = Number(value);
  if (!Number.isInteger(result) || result < 1 || result > 100)
    throw invalid("limit must be between 1 and 100");
  return result;
}
function invalid(message: string) {
  return new MasterDataError(400, "BP_360_SCOPE_INVALID", message);
}
function unavailable() {
  return new MasterDataError(
    404,
    "BP_360_SECTION_NOT_APPLICABLE",
    "The requested section route is not available",
  );
}
function body(request: Request) {
  if (
    !request.body ||
    typeof request.body !== "object" ||
    Array.isArray(request.body)
  )
    throw invalid("A JSON command body is required");
  return request.body as Record<string, unknown>;
}
function purpose(value: unknown) {
  const result = text(value, "purpose");
  if (!/^[a-z][a-z0-9_.-]{2,62}$/.test(result))
    throw invalid("purpose is invalid");
  return result;
}
function timestamp(value: unknown, name: string) {
  const result = text(value, name);
  if (!Number.isFinite(parseInstant(result))) throw invalid(`${name} is invalid`);
  return result;
}
function safeTelemetryFacts(
  operation: string,
  value: unknown,
): MutableTelemetryFacts {
  const payloadBytes = Buffer.byteLength(JSON.stringify(value), "utf8"),
    result: MutableTelemetryFacts = {
      payloadBytes,
      ...(operation === "tax-reveal"
        ? { revealClass: "tax" as const }
        : operation === "bank-reveal"
          ? { revealClass: "bank" as const }
          : {}),
    };
  if (!value || typeof value !== "object" || Array.isArray(value))
    return result;
  const body = value as Record<string, unknown>;
  if (
    operation === "summary" &&
    body["completeness"] &&
    typeof body["completeness"] === "object"
  )
    result.completenessStatus = String(
      (body["completeness"] as Record<string, unknown>)["status"] ?? "unknown",
    );
  if (operation === "section") {
    const candidate = String(body["sectionCode"] ?? "");
    if (
      BUSINESS_PARTNER_360_SECTION_CODES.includes(
        candidate as BusinessPartner360SectionCode,
      )
    )
      result.section = candidate as BusinessPartner360SectionCode;
    result.state = safeDimension(body["state"]);
    if (Array.isArray(body["redactions"]))
      result.redactionClasses = [
        ...new Set(
          body["redactions"]
            .flatMap((item) =>
              item && typeof item === "object"
                ? [
                    safeDimension(
                      (item as Record<string, unknown>)["classification"],
                    ),
                  ]
                : [],
            )
            .filter((value): value is string => value !== undefined),
        ),
      ];
    if (
      result.section === "network" &&
      body["data"] &&
      typeof body["data"] === "object"
    ) {
      const live = (body["data"] as Record<string, unknown>)["live"];
      if (
        live &&
        typeof live === "object" &&
        String((live as Record<string, unknown>)["state"]) !== "ready"
      )
        result.meshFallbackReason = safeDimension(
          (live as Record<string, unknown>)["reasonCode"] ??
            (live as Record<string, unknown>)["state"],
        );
    }
  }
  return result;
}
function safeDimension(value: unknown) {
  const result = String(value ?? "").toLowerCase();
  return /^[a-z][a-z0-9_.-]{0,63}$/.test(result) ? result : undefined;
}
