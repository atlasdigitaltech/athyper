import { isEntityRuntimeKey, isEntityRuntimeUuid } from "@athyper/contract-platform-entity-runtime";
import { EntityCapabilityPolicyError } from "./entity-capability-policy.js";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { registerContractRoute } from "@athyper/server-runtime-http";
import { defineRouteContract } from "@athyper/server-runtime-http";
import type { createEntityCollaborationService } from "./entity-collaboration-service.js";
import type { Application, NextFunction, Request, RequestHandler, Response } from "express";
import { entityRuntimeBootstrapContract, entityRuntimeSummaryContract, entityRuntimeSectionContract, entityRuntimeOperationContract } from "./entity-runtime-contracts.js";
import { EntityRuntimeResourceError, type EntityRuntimeResourceContext, type createEntityRuntimeResourceService } from "./entity-section-service.js";
import { EntityRuntimeOperationError, type createEntityOperationDispatcher } from "./entity-operation-dispatcher.js";

type Service = ReturnType<typeof createEntityRuntimeResourceService>;
type Operations = ReturnType<typeof createEntityOperationDispatcher>;
export function registerEntityRuntimeRoutes(app: Application, options: { readonly authenticate: RequestHandler; readonly readContext: (response: Response) => VerifiedRequestContext; readonly service: Service; readonly operations?: Operations; readonly collaboration?: ReturnType<typeof createEntityCollaborationService> }) {
  const run = (work: (request: Request, context: VerifiedRequestContext) => Promise<unknown>) => async (request: Request, response: Response, next: NextFunction) => {
    try {
      const value = await work(request, options.readContext(response));
      if (!value) { response.status(404).json(problem(404, "ENTITY_RUNTIME_RESOURCE_NOT_FOUND")); return; }
      response.setHeader("Cache-Control", "private, no-store").status(200).json(value);
    } catch (error) {
      if (error instanceof EntityCapabilityPolicyError) { response.status(403).type("application/problem+json").json(problem(403,error.code)); return; }
      if (error instanceof EntityRuntimeResourceError || error instanceof EntityRuntimeOperationError) { response.status(error.status).type("application/problem+json").json(problem(error.status, error.code, error.message)); return; }
      next(error);
    }
  };
  registerContractRoute(app, entityRuntimeBootstrapContract, options.authenticate, run((request, context) => options.service.bootstrap({ context, entityCode: code(request.params.entityCode), recordId: uuid(request.params.recordId), surfaceKey: surface(request) })));
  if (options.collaboration) registerContractRoute(app, defineRouteContract({ method: "get",
    path: "/api/entity-runtime/:entityCode/records/:recordId/collaboration/:kind",
    operationId: "entityRuntime.collaboration", summary: "Read an authorized published record capability", authenticated: true,
    request: { query: { type: "object", additionalProperties: false, properties: { cursor: { type: "string", format: "uuid" }, threadRootId: { type: "string", format: "uuid" }, commentFilter: { type: "string", enum: ["mentions"] }, limit: { type: "string", pattern: "^(?:[1-9][0-9]?|100)$" } } } },
    responses: { 200: { description: "Authorized collaboration resource" }, 403: { description: "Capability denied" }, 503: { description: "Provider unavailable" } },
  }), options.authenticate, run((request, context) => {
    const kind = request.params.kind;
    if (kind !== "comments" && kind !== "attachments") throw new EntityCapabilityPolicyError();
    return options.collaboration!.read({ context, entityCode: code(request.params.entityCode), recordId: uuid(request.params.recordId), kind,
      ...(request.query.cursor ? { cursor: uuid(request.query.cursor) } : {}), ...(request.query.limit ? { limit: integerLimit(request.query.limit) } : {}),
      ...(request.query.threadRootId ? { threadRootId: uuid(request.query.threadRootId) } : {}), ...(request.query.commentFilter === "mentions" ? { commentFilter: "mentions" as const } : {}) });
  }));
  registerContractRoute(app, entityRuntimeSummaryContract, options.authenticate, run((request, context) => { const selectedContext = resourceContext(request); return options.service.summary({ context, entityCode: code(request.params.entityCode), recordId: uuid(request.params.recordId), surfaceKey: surface(request), ...(selectedContext ? { resourceContext: selectedContext } : {}) }); }));
  registerContractRoute(app, entityRuntimeSectionContract, options.authenticate, run((request, context) => {
    const selectedContext = resourceContext(request);
    return options.service.section({ context, entityCode: code(request.params.entityCode), recordId: uuid(request.params.recordId), surfaceKey: surface(request), sectionKey: code(request.params.sectionKey), ...(request.query.cursor ? { cursor: pageCursor(request.query.cursor) } : {}), ...(request.query.limit ? { limit: integerLimit(request.query.limit) } : {}), ...(selectedContext ? { resourceContext: selectedContext } : {}) });
  }));
  if (options.operations) registerContractRoute(app, entityRuntimeOperationContract, options.authenticate, run((request, context) => options.operations!.execute({ context, entityCode: code(request.params.entityCode), recordId: uuid(request.params.recordId), operationKey: code(request.params.operationKey), expectedVersion: integer(request.header("If-Match")), idempotencyKey: header(request.header("Idempotency-Key")), input: body(request.body) })));
}
function surface(request: Request): string { return code(request.query.surface); }
function code(value: unknown): string { if (!isEntityRuntimeKey(value)) throw new EntityRuntimeResourceError(403, "ENTITY_RUNTIME_RESOURCE_INVALID"); return value; }
function uuid(value: unknown): string { if (!isEntityRuntimeUuid(value)) throw new EntityRuntimeResourceError(403, "ENTITY_RUNTIME_RESOURCE_INVALID"); return value; }
function problem(status: number, code: string, detail?: string) { return { type: `urn:athyper:problem:${code.toLowerCase().replaceAll("_", "-")}`, title: code, status, code, ...(detail && detail !== code ? { detail } : {}) }; }
function resourceContext(request: Request): EntityRuntimeResourceContext | undefined {
  const roleLens = request.query.roleLens;
  const validRoleLens = isEntityRuntimeKey(roleLens) ? roleLens : undefined;
  const value: EntityRuntimeResourceContext = {
    ...(request.query.operatingOrganizationId ? { operatingOrganizationId: uuid(request.query.operatingOrganizationId) } : {}),
    ...(request.query.companyCodeId ? { companyCodeId: uuid(request.query.companyCodeId) } : {}),
    ...(request.query.legalEntityId ? { legalEntityId: uuid(request.query.legalEntityId) } : {}),
    ...(typeof request.query.asOf === "string" && /^\d{4}-\d{2}-\d{2}$/.test(request.query.asOf) ? { asOf: request.query.asOf } : {}),
    ...(validRoleLens ? { roleLens: validRoleLens } : {}),
    ...(request.query.threadRootId ? { threadRootId: uuid(request.query.threadRootId) } : {}),
    ...(request.query.commentFilter === "mentions" ? { commentFilter: "mentions" as const } : {}),
  };
  return Object.keys(value).length ? value : undefined;
}

function integer(value: unknown): number | undefined { if (value === undefined || value === null || value === "") return undefined; const parsed = Number(value); if (!Number.isInteger(parsed) || parsed < 0) throw new EntityRuntimeOperationError(400, "ENTITY_RUNTIME_OPERATION_VERSION_INVALID"); return parsed; }
function integerLimit(value: unknown): number { const parsed = Number(value); if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) throw new EntityRuntimeResourceError(403, "ENTITY_RUNTIME_RESOURCE_INVALID"); return parsed; }
function header(value: unknown): string | undefined { if (typeof value !== "string" || !value.trim()) return undefined; return value; }
function body(value: unknown): Readonly<Record<string, unknown>> { if (!value || typeof value !== "object" || Array.isArray(value) || !("input" in value) || !(value as Record<string, unknown>).input || typeof (value as Record<string, unknown>).input !== "object" || Array.isArray((value as Record<string, unknown>).input)) throw new EntityRuntimeOperationError(400, "ENTITY_RUNTIME_OPERATION_INPUT_INVALID"); return Object.freeze({ ...((value as Record<string, unknown>).input as Record<string, unknown>) }); }

function pageCursor(value: unknown): string { if (typeof value !== "string" || value.length > 4096 || !/^[A-Za-z0-9_.=-]+$/.test(value)) throw new EntityRuntimeResourceError(403, "ENTITY_RUNTIME_RESOURCE_INVALID"); return value; }
