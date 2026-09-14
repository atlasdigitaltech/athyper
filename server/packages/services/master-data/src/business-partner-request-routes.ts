import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type {
  BusinessPartnerRegistrationMode,
  BusinessPartnerRequest,
  BusinessPartnerRequestDecision,
  BusinessPartnerRequestExtensions,
  BusinessPartnerRequestKind,
  BusinessPartnerRequestService,
  BusinessPartnerRequestSource,
  BusinessPartnerRequestStatus,
  BusinessPartnerRequestView,
  BusinessPartnerRequestedRole,
} from "@athyper/server-contract-master-data";
import type {
  Application,
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";
import { toGovernedBusinessPartnerCaseView } from "./business-partner-case-view.js";
import { MasterDataError } from "./errors.js";

export interface BusinessPartnerRequestRouteOptions {
  readonly authenticate: RequestHandler;
  readonly readContext: (response: Response) => VerifiedRequestContext;
  readonly service: BusinessPartnerRequestService;
  readonly companyPilot?: boolean;
  readonly aggregate360?: {
    legacyAggregate(query: {
      readonly context: VerifiedRequestContext;
      readonly businessPartnerId: string;
      readonly operatingOrganizationId: string;
    }): Promise<unknown>;
  };
  readonly telemetry?: (measurement: {
    readonly operation: string;
    readonly outcome: "success" | "denied" | "error";
    readonly statusCode: number;
    readonly durationMs: number;
  }) => void;
}

export function registerBusinessPartnerRequestRoutes(
  app: Application,
  options: BusinessPartnerRequestRouteOptions,
): void {
  const paths = (suffix = "", legacySuffix = suffix) =>
    options.companyPilot
      ? [`/api/neon/business-partner-company-setup-cases${suffix}`]
      : [
          `/api/neon/business-partner-cases${suffix}`,
          `/api/neon/business-partner-requests${legacySuffix}`,
        ];
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
      let outcome: "success" | "denied" | "error" = "success";
      let statusCode = 200;
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
          operation,
          outcome,
          statusCode,
          durationMs: performance.now() - startedAt,
        });
      }
    };
  app.post(
    paths(""),
    options.authenticate,
    route("create-case", async (request, context, response) => {
      const body = object(request.body),
        result = await options.service.create({
          context,
          idempotencyKey: required(body, "idempotencyKey"),
          kind: enumeration(body["kind"], kinds),
          source: source(body["source"]),
          registrationMode: enumerationOptional(
            body["registrationMode"],
            registrationModes,
          ),
          invitationId: uuidOptional(body["invitationId"], "invitationId"),
          applicantPrincipalId: uuidOptional(
            body["applicantPrincipalId"],
            "applicantPrincipalId",
          ),
          representedPartyName: textOptional(body["representedPartyName"]),
          representationEvidenceId: uuidOptional(
            body["representationEvidenceId"],
            "representationEvidenceId",
          ),
          targetBusinessPartnerId: uuidOptional(
            body["targetBusinessPartnerId"],
            "targetBusinessPartnerId",
          ),
          requestedRole: enumerationOptional(body["requestedRole"], roles),
          operatingOrganizationId: uuidOptional(
            body["operatingOrganizationId"],
            "operatingOrganizationId",
          ),
          companyCodeId: uuidOptional(body["companyCodeId"], "companyCodeId"),
          ...(body["expectedForm"] === undefined
            ? {}
            : { expectedForm: schemaReference(body["expectedForm"]) }),
          draftCapture: draftCapture(body["draftCapture"]),
          proposedPayload: object(body["proposedPayload"]),
          ...(body["extensions"] === undefined
            ? {}
            : { extensions: extensions(body["extensions"]) }),
        });
      response.status(result.replayed ? 200 : 201);
      return nativeEnvelope(request, context, result);
    }),
  );
  app.get(
    paths(""),
    options.authenticate,
    route("list-cases", async (request, context) =>
      nativeList(
        request,
        context,
        await options.service.list({
          context,
          ...(options.companyPilot
            ? {
                companyCodeId: uuid(
                  request.query["companyCodeId"],
                  "companyCodeId",
                ),
              }
            : {
                operatingOrganizationId: uuid(
                  request.query["operatingOrganizationId"],
                  "operatingOrganizationId",
                ),
              }),
          status: enumerationOptional(request.query["status"], statuses),
          limit: positiveIntegerOptional(request.query["limit"]),
          beforeCreatedAt: textOptional(request.query["beforeCreatedAt"]),
        }),
      ),
    ),
  );
  app.get(
    paths("/:requestId"),
    options.authenticate,
    route("get-case", async (request, context) =>
      nativeSingle(
        request,
        context,
        await options.service.get({
          context,
          requestId: uuid(request.params["requestId"], "caseId"),
        }),
      ),
    ),
  );
  app.get(
    paths("/:requestId/view"),
    options.authenticate,
    route("get-case-view", async (request, context) =>
      nativeView(
        request,
        context,
        await options.service.getView({
          context,
          requestId: uuid(request.params["requestId"], "caseId"),
        }),
      ),
    ),
  );
  if (!options.companyPilot)
    app.get(
      "/api/neon/business-partners/:businessPartnerId",
      options.authenticate,
      route("get-aggregate", (request, context) => {
        const query = {
          context,
          businessPartnerId: uuid(
            request.params["businessPartnerId"],
            "businessPartnerId",
          ),
          operatingOrganizationId: uuid(
            request.query["operatingOrganizationId"],
            "operatingOrganizationId",
          ),
        };
        return (
          options.aggregate360?.legacyAggregate(query) ??
          options.service.getAggregate(query)
        );
      }),
    );
  app.patch(
    paths("/:requestId"),
    options.authenticate,
    route("update-case", async (request, context) => {
      const body = object(request.body);
      return nativeSingle(
        request,
        context,
        await options.service.patch({
          context,
          requestId: uuid(request.params["requestId"], "caseId"),
          expectedVersion: positiveInteger(
            body["expectedVersion"],
            "expectedVersion",
          ),
          draftCapture: draftCapture(body["draftCapture"]),
          proposedPayload: object(body["proposedPayload"]),
          ...(body["extensions"] === undefined
            ? {}
            : { extensions: extensions(body["extensions"]) }),
          operatingOrganizationId: uuidOptional(
            body["operatingOrganizationId"],
            "operatingOrganizationId",
          ),
          companyCodeId: nullableUuidOptional(body, "companyCodeId"),
          requestedRole: nullableEnumOptional(body, "requestedRole", roles),
          representationEvidenceId: nullableUuidOptional(
            body,
            "representationEvidenceId",
          ),
        }),
      );
    }),
  );
  app.post(
    paths("/:requestId/validate"),
    options.authenticate,
    route("validate-case", async (request, context) => {
      const body = object(request.body);
      const result = await options.service.validate({
        context,
        requestId: uuid(request.params["requestId"], "caseId"),
        expectedVersion: positiveInteger(
          body["expectedVersion"],
          "expectedVersion",
        ),
      });
      return nativeEnvelope(
        request,
        context,
        result,
        result.validation.findings,
      );
    }),
  );
  app.post(
    paths("/:requestId/submit"),
    options.authenticate,
    route("submit-case", async (request, context, response) => {
      const body = object(request.body);
      const result = await options.service.submit({
        context,
        requestId: uuid(request.params["requestId"], "caseId"),
        expectedVersion: positiveInteger(
          body["expectedVersion"],
          "expectedVersion",
        ),
        idempotencyKey: required(body, "idempotencyKey"),
      });
      response.status(result.replayed ? 200 : 201);
      return nativeEnvelope(request, context, result);
    }),
  );
  app.post(
    paths("/:requestId/decisions"),
    options.authenticate,
    route("decide-case", async (request, context) => {
      const body = object(request.body);
      const result = await options.service.decide({
        context,
        requestId: uuid(request.params["requestId"], "caseId"),
        workflowRequestId: uuid(
          body["cycleRunId"] ?? body["workflowRequestId"],
          "cycleRunId",
        ),
        workItemId: uuid(
          body["cycleTaskId"] ?? body["workItemId"],
          "cycleTaskId",
        ),
        expectedRequestVersion: positiveInteger(
          body["expectedVersion"] ?? body["expectedRequestVersion"],
          "expectedVersion",
        ),
        expectedWorkItemVersion: positiveInteger(
          body["expectedTaskVersion"] ?? body["expectedWorkItemVersion"],
          "expectedTaskVersion",
        ),
        decision: enumeration(body["decision"], decisions),
        reason: required(body, "reason"),
        idempotencyKey: required(body, "idempotencyKey"),
      });
      return nativeEnvelope(request, context, result);
    }),
  );
  app.post(
    paths("/:requestId/materialize", "/:requestId/apply"),
    options.authenticate,
    route("materialize-case", async (request, context, response) => {
      const body = object(request.body);
      const result = await options.service.apply({
        context,
        requestId: uuid(request.params["requestId"], "caseId"),
        expectedVersion: positiveInteger(
          body["expectedVersion"],
          "expectedVersion",
        ),
        idempotencyKey: required(body, "idempotencyKey"),
      });
      response.status(result.replayed ? 200 : 201);
      return nativeEnvelope(request, context, result);
    }),
  );
}

function isNativeCaseRoute(request: Request): boolean {
  return (
    (request.originalUrl || request.url)
      .split("?", 1)[0]!
      .startsWith("/api/neon/business-partner-cases") ||
    (request.originalUrl || request.url).startsWith(
      "/api/neon/business-partner-company-setup-cases",
    )
  );
}
function projectionContext(
  request: Request,
  context: VerifiedRequestContext,
  view?: BusinessPartnerRequestView,
) {
  return {
    companyPilot: (request.originalUrl || request.url).startsWith(
      "/api/neon/business-partner-company-setup-cases",
    ),
    permissionCodes: context.permissions.allowed,
    principalId: context.principalId,
    ...(view?.validationFindings
      ? { validationFindings: view.validationFindings }
      : {}),
    ...(view?.workflow ? { workflow: view.workflow } : {}),
  };
}
function nativeSingle(
  request: Request,
  context: VerifiedRequestContext,
  value: BusinessPartnerRequest,
) {
  return isNativeCaseRoute(request)
    ? {
        request: value,
        case: toGovernedBusinessPartnerCaseView(
          value,
          projectionContext(request, context),
        ),
      }
    : value;
}
function nativeList(
  request: Request,
  context: VerifiedRequestContext,
  values: readonly BusinessPartnerRequest[],
) {
  return isNativeCaseRoute(request)
    ? values.map((value) => ({
        request: value,
        case: toGovernedBusinessPartnerCaseView(
          value,
          projectionContext(request, context),
        ),
      }))
    : values;
}
function nativeView(
  request: Request,
  context: VerifiedRequestContext,
  value: BusinessPartnerRequestView,
) {
  return isNativeCaseRoute(request)
    ? {
        ...value,
        case: toGovernedBusinessPartnerCaseView(
          value.request,
          projectionContext(request, context, value),
        ),
      }
    : value;
}
function nativeEnvelope<T extends { readonly request: BusinessPartnerRequest }>(
  request: Request,
  context: VerifiedRequestContext,
  value: T,
  validationFindings?: readonly import("@athyper/server-contract-master-data").BusinessPartnerRequestValidationFinding[],
) {
  return isNativeCaseRoute(request)
    ? {
        ...value,
        case: toGovernedBusinessPartnerCaseView(value.request, {
          ...projectionContext(request, context),
          ...(validationFindings ? { validationFindings } : {}),
        }),
      }
    : value;
}

const kinds = [
  "new_partner",
  "amend_partner",
  "add_supplier",
  "add_customer",
  "assign_organization",
  "configure_company",
  "change_bank",
  "activate_supplier",
  "deactivate",
  "reactivate",
  "archive",
] as const satisfies readonly BusinessPartnerRequestKind[];
const roles = [
  "supplier",
  "customer",
] as const satisfies readonly BusinessPartnerRequestedRole[];
const statuses = [
  "draft",
  "validating",
  "validation_failed",
  "pending_approval",
  "returned",
  "approved",
  "rejected",
  "applying",
  "applied",
  "failed",
  "cancelled",
  "superseded",
] as const satisfies readonly BusinessPartnerRequestStatus[];
const decisions = [
  "return",
  "reject",
  "approve",
] as const satisfies readonly BusinessPartnerRequestDecision[];
const registrationModes = [
  "direct",
  "self_service",
  "on_behalf",
  "integration",
] as const satisfies readonly BusinessPartnerRegistrationMode[];
function source(value: unknown): BusinessPartnerRequestSource {
  const item = object(value),
    kind = enumeration(item["kind"], [
      "manual",
      "portal",
      "mesh",
      "import",
      "api",
    ] as const);
  return {
    kind,
    systemCode: textOptional(item["systemCode"]),
    entityCode: textOptional(item["entityCode"]),
    entityId: textOptional(item["entityId"]),
    entityCodeValue: textOptional(item["entityCodeValue"]),
    projectionId: uuidOptional(item["projectionId"], "source.projectionId"),
    version: positiveIntegerOptional(item["version"]),
    payloadHash: textOptional(item["payloadHash"]),
  };
}
function schemaReference(value: unknown) {
  const item = object(value);
  const hash = required(item, "hash");
  if (!/^[a-f0-9]{64}$/.test(hash))
    throw bad("expectedForm.hash must be SHA-256");
  return {
    code: required(item, "code"),
    version: positiveInteger(item["version"], "expectedForm.version"),
    hash,
    releaseId: uuid(item["releaseId"], "expectedForm.releaseId"),
  };
}
function extensions(value: unknown): BusinessPartnerRequestExtensions {
  const item = object(value);
  for (const key of Object.keys(item))
    if (
      ![
        "aliases",
        "governanceRelations",
        "relationships",
        "addresses",
        "contactPersons",
        "contactChannels",
        "identifiers",
        "taxRegistrations",
        "classifications",
        "certifications",
        "bankAccounts",
        "supportingDocuments",
      ].includes(key)
    )
      throw bad(`Unsupported extension group: ${key}`);
  for (const [key, rows] of Object.entries(item))
    if (
      !Array.isArray(rows) ||
      rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))
    )
      throw bad(`${key} must be an array of objects`);
  return item as unknown as BusinessPartnerRequestExtensions;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw bad("JSON object required");
  return value as Record<string, unknown>;
}
function required(value: Record<string, unknown>, key: string): string {
  const result = textOptional(value[key]);
  if (!result) throw bad(`${key} is required`);
  return result;
}
function textOptional(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function enumeration<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T {
  if (typeof value !== "string" || !allowed.includes(value as T))
    throw bad(`Expected one of: ${allowed.join(", ")}`);
  return value as T;
}
function enumerationOptional<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | undefined {
  return value == null || value === ""
    ? undefined
    : enumeration(value, allowed);
}
function positiveInteger(value: unknown, name: string): number {
  const result =
    typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(result) || Number(result) < 1)
    throw bad(`${name} must be a positive integer`);
  return Number(result);
}
function positiveIntegerOptional(value: unknown): number | undefined {
  return value == null || value === ""
    ? undefined
    : positiveInteger(value, "value");
}
function uuid(value: unknown, name: string): string {
  const result = textOptional(value);
  if (
    !result ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      result,
    )
  )
    throw bad(`${name} must be a UUID`);
  return result;
}
function uuidOptional(value: unknown, name: string): string | undefined {
  return value == null || value === "" ? undefined : uuid(value, name);
}
function nullableUuidOptional(
  value: Record<string, unknown>,
  key: string,
): string | null | undefined {
  return !(key in value)
    ? undefined
    : value[key] === null
      ? null
      : uuid(value[key], key);
}
function nullableEnumOptional<T extends string>(
  value: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T | null | undefined {
  return !(key in value)
    ? undefined
    : value[key] === null
      ? null
      : enumeration(value[key], allowed);
}
function bad(message: string): MasterDataError {
  return new MasterDataError(400, "BUSINESS_PARTNER_REQUEST_INVALID", message);
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
      ...(error.fieldErrors ? {fieldErrors:error.fieldErrors} : {}),
    });
}

function draftCapture(value:unknown):boolean { if(value===undefined)return false;if(typeof value!=="boolean")throw bad("draftCapture must be boolean");return value;}
