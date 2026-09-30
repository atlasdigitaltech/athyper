import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { cycleConfigSchemas, controlAdminPermissions, type CycleConfigService, type CycleTemplateDraft, type SignedCycleDesiredStateRevision } from "@athyper/server-contract-control-admin";
import { defineRouteContract, registerContractRoute } from "@athyper/server-runtime-http";
import type { Application, Request, RequestHandler, Response } from "express";
import { assertApprovedControlAdministrationRoute } from "../control-administration-ownership.js";
import { cycleError } from "./cycle-config-validation.js";

export function registerCycleConfigRoutes(application: Application, options: { readonly authenticate: RequestHandler; readonly readContext: (response: Response) => VerifiedRequestContext; readonly service: CycleConfigService }): void {
  assertApprovedControlAdministrationRoute({ resource: "cycle_templates", operation: "read" });
  assertApprovedControlAdministrationRoute({ resource: "cycle_templates", operation: "write", tenantScoped: true });
  const service = options.service;
  registerContractRoute(application, contracts.preview, options.authenticate, route((request, response) => service.preview(options.readContext(response), request.body as CycleTemplateDraft)));
  registerContractRoute(application, contracts.validate, options.authenticate, route((request, response) => service.validate(options.readContext(response), request.body as CycleTemplateDraft)));
  registerContractRoute(application, contracts.publish, options.authenticate, route((request, response) => {
    const body = request.body as { template: CycleTemplateDraft; idempotencyKey: string; expectedLatestVersion?: number };
    return service.publish({ ...body, context: options.readContext(response) });
  }));
  registerContractRoute(application, contracts.apply, options.authenticate, route((request, response) => {
    const body = request.body as { revision: SignedCycleDesiredStateRevision; expectedLatestVersion?: number };
    return service.applyDesiredState({ ...body, context: options.readContext(response) });
  }));
  registerContractRoute(application, contracts.latest, options.authenticate, route((request, response) => service.readPublished(options.readContext(response), String(request.params["cycleTypeId"]))));
  registerContractRoute(application, contracts.version, options.authenticate, route((request, response) => {
    const version = Number(request.params["version"]);
    if (!Number.isSafeInteger(version) || version < 1 || version > 2147483647) throw cycleError("CONTROL_ADMIN_CYCLE_TEMPLATE_INVALID");
    return service.readPublished(options.readContext(response), String(request.params["cycleTypeId"]), version);
  }));
}
function route(work: (request: Request, response: Response) => Promise<unknown>): RequestHandler {
  return async (request, response, next) => {
    try {
      const result = await work(request, response);
      const conflict = result && typeof result === "object" && "kind" in result && result.kind === "version_conflict";
      response.status(conflict ? 409 : 200).json(result);
    } catch (error) { next(error); }
  };
}
const schema = { type: "object" } as const;
const responses = { 200: { description: "Cycle template result", body: schema }, 400: { description: "Invalid template or version" }, 401: { description: "Authentication required" }, 403: { description: "Permission, target, or signature denied" }, 404: { description: "Cycle type or revision not found" }, 409: { description: "Version or idempotency conflict", body: schema }, 503: { description: "Cycle repository unavailable" } } as const;
const base = { tags: ["Control Admin"], authenticated: true, responses } as const;
const manage = { ...base, permission: controlAdminPermissions.cycleTemplateManage };
const read = { ...base, permission: controlAdminPermissions.catalogRead };
const contracts = {
  preview: defineRouteContract({ ...manage, method: "post", path: "/api/control-admin/cycle-config/preview", operationId: "controlAdmin.cycleConfig.preview", summary: "Preview a local cycle template", request: { body: cycleConfigSchemas.template } }),
  validate: defineRouteContract({ ...manage, method: "post", path: "/api/control-admin/cycle-config/validate", operationId: "controlAdmin.cycleConfig.validate", summary: "Validate a local cycle template", request: { body: cycleConfigSchemas.template } }),
  publish: defineRouteContract({ ...manage, method: "post", path: "/api/control-admin/cycle-config/publish", operationId: "controlAdmin.cycleConfig.publish", summary: "Publish an immutable local cycle-template revision", request: { body: cycleConfigSchemas.publish } }),
  apply: defineRouteContract({ ...manage, method: "post", path: "/api/control-admin/cycle-config/desired-state/apply", operationId: "controlAdmin.cycleConfig.applyDesiredState", summary: "Verify and idempotently apply a Studio desired-state revision", request: { body: cycleConfigSchemas.apply } }),
  latest: defineRouteContract({ ...read, method: "get", path: "/api/control-admin/cycle-config/:cycleTypeId/revisions/latest", operationId: "controlAdmin.cycleConfig.readLatest", summary: "Read the latest local cycle-template revision", request: { params: cycleConfigSchemas.latestParams } }),
  version: defineRouteContract({ ...read, method: "get", path: "/api/control-admin/cycle-config/:cycleTypeId/revisions/:version", operationId: "controlAdmin.cycleConfig.readVersion", summary: "Read a local cycle-template revision", request: { params: cycleConfigSchemas.versionParams } }),
} as const;
