import type { AuditRecorder } from "@athyper/server-contract-audit";
import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import type { JobPublisher } from "@athyper/server-contract-jobs";
import {
  defineRouteContract,
  registerContractRoute,
  type Application,
  type RequestHandler,
  type Response,
} from "@athyper/server-runtime-http";
import {
  COMPILE_PUBLICATION_ARTIFACT_JOB,
  PUBLICATION_AUTHORITY_QUEUE,
} from "./publication-jobs.js";
import {
  BusinessPartnerDefinitionError,
  type BusinessPartnerDefinitionService,
} from "./business-partner-definition-service.js";

const objectSchema = { type: "object", additionalProperties: true } as const;
const contracts = {
  preview: defineRouteContract({
    method: "get",
    path: "/api/studio/local-business-partner-preview",
    operationId: "studio.localBusinessPartnerPreview",
    summary: "Read the personal local BP preview revision",
    tags: ["STUDIO Business Partner Definitions"],
    authenticated: true,
    permission: "studio.business_partner_definition.read",
    responses: {
      200: { description: "Local preview revision", body: objectSchema },
      403: { description: "Forbidden" },
      404: { description: "Local preview unavailable" },
    },
  }),
  author: defineRouteContract({
    method: "post",
    path: "/api/studio/business-partner-definitions",
    operationId: "studio.authorBusinessPartnerDefinition",
    summary: "Author an immutable Business Partner definition revision",
    tags: ["STUDIO Business Partner Definitions"],
    authenticated: true,
    permission: "studio.business_partner_definition.author",
    request: { body: objectSchema },
    responses: {
      201: { description: "Definition revision", body: objectSchema },
      409: {
        description: "Definition version or idempotency conflict",
        body: objectSchema,
      },
      400: { description: "Invalid definition" },
      403: { description: "Forbidden" },
    },
  }),
  simulate: defineRouteContract({
    method: "post",
    path: "/api/studio/business-partner-definitions/simulations",
    operationId: "studio.simulateBusinessPartnerDefinition",
    summary:
      "Dry-run Business Partner definition compatibility without publication authority",
    tags: ["STUDIO Business Partner Definitions"],
    authenticated: true,
    permission: "studio.business_partner_definition.read",
    request: { body: objectSchema },
    responses: {
      200: {
        description: "Read-only compatibility report",
        body: objectSchema,
      },
      400: { description: "Incompatible definition" },
      403: { description: "Forbidden" },
      404: { description: "Comparison revision not found" },
    },
  }),
  get: defineRouteContract({
    method: "get",
    path: "/api/studio/business-partner-definitions/:revisionId",
    operationId: "studio.getBusinessPartnerDefinition",
    summary: "Get a Business Partner definition revision",
    tags: ["STUDIO Business Partner Definitions"],
    authenticated: true,
    permission: "studio.business_partner_definition.read",
    responses: {
      200: { description: "Definition revision", body: objectSchema },
      403: { description: "Forbidden" },
      404: { description: "Not found" },
    },
  }),
  publish: defineRouteContract({
    method: "post",
    path: "/api/studio/business-partner-definitions/:revisionId/publish",
    operationId: "studio.publishBusinessPartnerDefinition",
    summary:
      "Approve and queue a signed Business Partner definition publication",
    tags: ["STUDIO Business Partner Definitions"],
    authenticated: true,
    permission: "studio.business_partner_definition.publish",
    request: { body: objectSchema },
    responses: {
      202: { description: "Publication queued", body: objectSchema },
      400: { description: "Invalid publication" },
      403: { description: "Forbidden" },
      404: { description: "Not found" },
    },
  }),
} as const;

export function registerBusinessPartnerDefinitionRoutes(
  application: Application,
  options: {
    readonly authenticate: RequestHandler;
    readonly readContext: (response: Response) => VerifiedRequestContext;
    readonly authorizer: Authorizer;
    readonly audit: AuditRecorder;
    readonly jobs: JobPublisher;
    readonly service: BusinessPartnerDefinitionService;
  },
) {
  registerContractRoute(
    application,
    contracts.preview,
    options.authenticate,
    async (_request, response, next) => {
      try {
        const context = await permitted(
          options,
          response,
          "studio.business_partner_definition.read",
        );
        if (!context) return;
        const revision = await options.service.localPreview(context.tenantId);
        if (!revision) {
          response.status(404).json({ error: "LOCAL_PREVIEW_UNAVAILABLE" });
          return;
        }
        response.status(200).json(revision);
      } catch (error) {
        definitionFailure(error, response, next);
      }
    },
  );
  registerContractRoute(
    application,
    contracts.simulate,
    options.authenticate,
    async (request, response, next) => {
      try {
        const context = await permitted(
          options,
          response,
          "studio.business_partner_definition.read",
        );
        if (!context) return;
        const body = record(request.body) ? request.body : {};
        const result = await options.service.simulate({
          tenantId: context.tenantId,
          bundle: body["bundle"],
          targetPlanes: planes(body["targetPlanes"]),
          ...(typeof body["againstRevisionId"] === "string"
            ? { againstRevisionId: uuid(body["againstRevisionId"]) }
            : {}),
        });
        response.status(200).json(result);
      } catch (error) {
        definitionFailure(error, response, next);
      }
    },
  );
  registerContractRoute(
    application,
    contracts.author,
    options.authenticate,
    async (request, response, next) => {
      try {
        const context = await permitted(
          options,
          response,
          "studio.business_partner_definition.author",
        );
        if (!context) return;
        const body = record(request.body) ? request.body : {};
        const revision = await options.service.author({
          tenantId: context.tenantId,
          actorId: context.principalId,
          idempotencyKey: header(request.headers["idempotency-key"]),
          bundle: body["bundle"],
          targetPlanes: planes(body["targetPlanes"]),
        });
        await audit(
          options,
          context,
          "studio.business_partner_definition.author",
          revision.id,
          { bundleHash: revision.bundleHash },
        );
        response.status(201).json(revision);
      } catch (error) {
        definitionFailure(error, response, next);
      }
    },
  );
  registerContractRoute(
    application,
    contracts.get,
    options.authenticate,
    async (request, response, next) => {
      try {
        const context = await permitted(
          options,
          response,
          "studio.business_partner_definition.read",
        );
        if (!context) return;
        const revision = await options.service.get(
          context.tenantId,
          uuid(request.params["revisionId"]),
        );
        response
          .status(revision ? 200 : 404)
          .json(revision ?? { error: "BUSINESS_PARTNER_DEFINITION_NOT_FOUND" });
      } catch (error) {
        definitionFailure(error, response, next);
      }
    },
  );
  registerContractRoute(
    application,
    contracts.publish,
    options.authenticate,
    async (request, response, next) => {
      try {
        const context = await permitted(
          options,
          response,
          "studio.business_partner_definition.publish",
          { revisionId: uuid(request.params["revisionId"]) },
        );
        if (!context) return;
        const body = record(request.body) ? request.body : {};
        const release = await options.service.publish({
          tenantId: context.tenantId,
          revisionId: uuid(request.params["revisionId"]),
          actorId: context.principalId,
          idempotencyKey: header(request.headers["idempotency-key"]),
          ...(typeof body["minimumRuntimeVersion"] === "string"
            ? { minimumRuntimeVersion: body["minimumRuntimeVersion"] }
            : {}),
        });
        if (!release) throw new Error("PUBLICATION_RELEASE_NOT_FOUND");
        const jobId = await options.jobs.enqueue(
          PUBLICATION_AUTHORITY_QUEUE,
          COMPILE_PUBLICATION_ARTIFACT_JOB,
          { releaseId: release.id },
          {
            enqueueKey: `publication:${release.id}:compile:1`,
            maxAttempts: 5,
            payloadSchema: {
              name: COMPILE_PUBLICATION_ARTIFACT_JOB,
              version: 1,
            },
            execution: {
              planeKey: "studio",
              scope: "tenant",
              tenantId: context.tenantId,
              principalId: context.principalId,
              correlationId: context.correlationId ?? context.requestId,
            },
          },
        );
        await audit(
          options,
          context,
          "studio.business_partner_definition.publish",
          release.id,
          { revisionId: request.params["revisionId"], jobId },
        );
        response.status(202).json({ release, jobId });
      } catch (error) {
        definitionFailure(error, response, next);
      }
    },
  );
}
async function permitted(
  options: {
    readonly readContext: (response: Response) => VerifiedRequestContext;
    readonly authorizer: Authorizer;
  },
  response: Response,
  permissionCode: string,
  resource?: Readonly<Record<string, unknown>>,
) {
  const context = options.readContext(response);
  const decision = await options.authorizer.authorize({
    context,
    permissionCode,
    ...(resource ? { resource } : {}),
  });
  if (!decision.allowed) {
    response.status(403).json({ error: "FORBIDDEN", reason: decision.reason });
    return undefined;
  }
  return context;
}
async function audit(
  options: { readonly audit: AuditRecorder },
  context: VerifiedRequestContext,
  eventCode:
    | "studio.business_partner_definition.author"
    | "studio.business_partner_definition.publish",
  entityId: string,
  metadata: Readonly<Record<string, unknown>>,
) {
  await options.audit.record({
    eventCode,
    action:
      eventCode === "studio.business_partner_definition.author"
        ? "author"
        : "publish",
    outcome: "success",
    severity: "critical",
    actor: { kind: "user", principalId: context.principalId },
    tenantId: context.tenantId,
    entityType: "business_partner_definition",
    entityId,
    requestId: context.requestId,
    correlationId: context.correlationId,
    metadata,
  });
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function string(value: unknown) {
  if (typeof value !== "string" || !value.trim())
    throw new TypeError("Required string is missing");
  return value.trim();
}
function header(value: unknown) {
  return string(Array.isArray(value) ? value[0] : value);
}
function uuid(value: unknown) {
  const result = String(value ?? "");
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      result,
    )
  )
    throw new TypeError("Invalid UUID");
  return result;
}
function planes(value: unknown): readonly ("studio" | "neon" | "mesh")[] {
  if (
    !Array.isArray(value) ||
    value.some(
      (item) => item !== "studio" && item !== "neon" && item !== "mesh",
    )
  )
    throw new TypeError("targetPlanes is invalid");
  return value as readonly ("studio" | "neon" | "mesh")[];
}

function definitionFailure(
  error: unknown,
  response: Response,
  next: (error: unknown) => void,
) {
  if (
    record(error) &&
    error["code"] === "23505" &&
    error["constraint"] === "business_partner_definition_revision_version_uq"
  ) {
    response.status(409).json({
      error: "BUSINESS_PARTNER_DEFINITION_VERSION_CONFLICT",
      message:
        "This definition version already exists. Review the saved revision, or advance the version for changed content.",
    });
  } else if (error instanceof BusinessPartnerDefinitionError) {
    const status = error.code.endsWith("NOT_FOUND")
      ? 404
      : error.code.endsWith("SELF_PUBLISH_FORBIDDEN")
        ? 403
        : error.code.includes("IDEMPOTENCY_CONFLICT")
          ? 409
          : 400;
    response.status(status).json({ error: error.code, message: error.code });
  } else if (error instanceof TypeError) {
    response.status(400).json({
      error: "BUSINESS_PARTNER_DEFINITION_INPUT_INVALID",
      message: error.message,
    });
  } else next(error);
}
