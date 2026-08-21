import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { CycleConfigService, CycleTemplateDraft, SignedCycleDesiredStateRevision } from "@athyper/server-contract-control-admin";
import { defineRouteContract, registerContractRoute } from "@athyper/server-runtime-http";
import type { Application, RequestHandler, Response } from "express";
import { assertApprovedControlAdministrationRoute } from "../control-administration-ownership.js";

export function registerCycleConfigRoutes(application: Application, options: { readonly authenticate: RequestHandler; readonly readContext: (response: Response) => VerifiedRequestContext; readonly service: CycleConfigService }): void {
  assertApprovedControlAdministrationRoute({ resource: "cycle_templates", operation: "read" });
  assertApprovedControlAdministrationRoute({ resource: "cycle_templates", operation: "write", tenantScoped: true });
  const service = options.service;
  registerContractRoute(application, contracts.preview, options.authenticate, async (request, response, next) => { try { response.json(await service.preview(options.readContext(response), template(request.body))); } catch (error) { next(error); } });
  registerContractRoute(application, contracts.validate, options.authenticate, async (request, response, next) => { try { response.json(await service.validate(options.readContext(response), template(request.body))); } catch (error) { next(error); } });
  registerContractRoute(application, contracts.publish, options.authenticate, async (request, response, next) => { try { const body = object(request.body); response.json(await service.publish({ context: options.readContext(response), template: template(body["template"]), idempotencyKey: required(body["idempotencyKey"]), expectedLatestVersion: integer(body["expectedLatestVersion"]) })); } catch (error) { next(error); } });
  registerContractRoute(application, contracts.apply, options.authenticate, async (request, response, next) => { try { const body = object(request.body); response.json(await service.applyDesiredState({ context: options.readContext(response), revision: body["revision"] as SignedCycleDesiredStateRevision, expectedLatestVersion: integer(body["expectedLatestVersion"]) })); } catch (error) { next(error); } });
  registerContractRoute(application, contracts.latest, options.authenticate, async (request, response, next) => { try { response.json(await service.readPublished(options.readContext(response), uuid(request.params["cycleTypeId"]))); } catch (error) { next(error); } });
  registerContractRoute(application, contracts.version, options.authenticate, async (request, response, next) => { try { response.json(await service.readPublished(options.readContext(response), uuid(request.params["cycleTypeId"]), integer(request.params["version"]))); } catch (error) { next(error); } });
}

function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("JSON object required"); return value as Record<string, unknown>; }
function required(value: unknown): string { if (typeof value !== "string" || !value.trim()) throw new TypeError("Required string missing"); return value.trim(); }
function integer(value: unknown): number { const result = Number(value); if (!Number.isInteger(result) || result < 0) throw new TypeError("Non-negative integer required"); return result; }
function uuid(value: unknown): string { const result = required(value); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) throw new TypeError("UUID required"); return result; }
function template(value: unknown): CycleTemplateDraft { const result = object(value); object(result["cycleType"]); for (const key of ["phases", "categories", "tasks", "dependencies", "crossDependencies", "carryForwardRules"] as const) if (!Array.isArray(result[key])) throw new TypeError(`${key} must be an array`); return result as unknown as CycleTemplateDraft; }
const schema = { type: "object", additionalProperties: true } as const;
const responses = { 200: { description: "Cycle template result", body: schema }, 400: { description: "Invalid template" }, 401: { description: "Authentication required" }, 403: { description: "Forbidden" }, 409: { description: "Version or idempotency conflict" } } as const;
const contracts = {
  preview: defineRouteContract({ method: "post", path: "/api/control-admin/cycle-config/preview", operationId: "controlAdmin.cycleConfig.preview", summary: "Preview a local cycle template", tags: ["Control Admin"], authenticated: true, request: { body: schema }, responses }),
  validate: defineRouteContract({ method: "post", path: "/api/control-admin/cycle-config/validate", operationId: "controlAdmin.cycleConfig.validate", summary: "Validate a local cycle template", tags: ["Control Admin"], authenticated: true, request: { body: schema }, responses }),
  publish: defineRouteContract({ method: "post", path: "/api/control-admin/cycle-config/publish", operationId: "controlAdmin.cycleConfig.publish", summary: "Publish an immutable local cycle-template revision", tags: ["Control Admin"], authenticated: true, request: { body: schema }, responses }),
  apply: defineRouteContract({ method: "post", path: "/api/control-admin/cycle-config/desired-state/apply", operationId: "controlAdmin.cycleConfig.applyDesiredState", summary: "Verify and idempotently apply a Studio desired-state revision", tags: ["Control Admin"], authenticated: true, request: { body: schema }, responses }),
  latest: defineRouteContract({ method: "get", path: "/api/control-admin/cycle-config/:cycleTypeId/revisions/latest", operationId: "controlAdmin.cycleConfig.readLatest", summary: "Read the latest local cycle-template revision", tags: ["Control Admin"], authenticated: true, responses }),
  version: defineRouteContract({ method: "get", path: "/api/control-admin/cycle-config/:cycleTypeId/revisions/:version", operationId: "controlAdmin.cycleConfig.readVersion", summary: "Read a local cycle-template revision", tags: ["Control Admin"], authenticated: true, responses }),
} as const;
