import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { BankValidationInput, BankValidationRule, ConnectorDraft, JsonValue, LookupDesiredState, RoundingAggregate, TenantEntitlementOverride } from "@athyper/server-contract-control-admin";
import type { Application, Request, RequestHandler, Response } from "express";
import type { createBankValidationService, createConnectorControlService, createEntitlementControlService, createFeatureFlagService, createLookupService, createParameterService, createRoundingService } from "./control-services.js";
import { assertApprovedControlAdministrationRoute } from "./control-administration-ownership.js";

export interface ControlServices {
  readonly features: ReturnType<typeof createFeatureFlagService>;
  readonly parameters: ReturnType<typeof createParameterService>;
  readonly lookups: ReturnType<typeof createLookupService>;
  readonly rounding: ReturnType<typeof createRoundingService>;
  readonly bankValidation: ReturnType<typeof createBankValidationService>;
  readonly entitlements: ReturnType<typeof createEntitlementControlService>;
  readonly connectors: ReturnType<typeof createConnectorControlService>;
}

export interface ControlServiceRouteFlags {
  readonly tenantOverrides: boolean;
  readonly lookupAndRoundingConfiguration: boolean;
  readonly connectorLifecycle: boolean;
  readonly localCatalogReads: boolean;
  readonly catalogAuthoring: boolean;
}

export const disabledControlServiceRouteFlags: ControlServiceRouteFlags = Object.freeze({ tenantOverrides: false, lookupAndRoundingConfiguration: false, connectorLifecycle: false, localCatalogReads: false, catalogAuthoring: false });

export function assertControlServiceRoutePlaneSafety(input: { readonly catalogAuthoringPlanes: readonly VerifiedRequestContext["planeKey"][]; readonly financeWriterPlanes: readonly VerifiedRequestContext["planeKey"][] }): void {
  if (input.catalogAuthoringPlanes.some((plane) => plane !== "studio")) throw forbidden("CONTROL_ADMIN_CATALOG_AUTHORING_STUDIO_REQUIRED");
  if (input.financeWriterPlanes.some((plane) => plane !== "neon")) throw forbidden("CONTROL_ADMIN_FINANCE_WRITER_NEON_REQUIRED");
}

/** Registers only classified command/query surfaces; no table-oriented CRUD routes exist. */
export function registerControlServiceRoutes(application: Application, options: { readonly authenticate: RequestHandler; readonly readContext: (response: Response) => VerifiedRequestContext; readonly services: ControlServices; readonly flags: ControlServiceRouteFlags }): void {
  assertControlServiceRoutePlaneSafety({ catalogAuthoringPlanes: options.flags.catalogAuthoring ? ["studio"] : [], financeWriterPlanes: options.flags.lookupAndRoundingConfiguration ? ["neon"] : [] });
  const c = (response: Response) => options.readContext(response), s = options.services;
  if (options.flags.localCatalogReads) {
    for (const resource of ["feature_definitions", "parameter_definitions", "reference_lookups", "rounding_configuration", "bank_validation_rules", "subscription_definitions", "usage_metric_catalog"] as const) assertApprovedControlAdministrationRoute({ resource, operation: "read" });
    application.get("/api/control-admin/features", options.authenticate, route(async (_r, response) => s.features.list(c(response))));
    application.get("/api/control-admin/features/:code/evaluation", options.authenticate, route(async (r, response) => s.features.evaluate(c(response), required(r.params["code"]))));
    application.get("/api/control-admin/parameters", options.authenticate, route(async (_r, response) => s.parameters.list(c(response))));
    application.get("/api/control-admin/parameters/:code/effective", options.authenticate, route(async (r, response) => s.parameters.resolve(c(response), required(r.params["code"]))));
    application.get("/api/control-admin/lookups", options.authenticate, route(async (_r, response) => s.lookups.list(c(response))));
    application.get("/api/control-admin/lookups/:code", options.authenticate, route(async (r, response) => s.lookups.read(c(response), required(r.params["code"]), optionalPositive(r.query["version"]))));
    application.get("/api/control-admin/rounding", options.authenticate, route(async (_r, response) => s.rounding.list(c(response))));
    application.post("/api/control-admin/rounding/simulate", options.authenticate, route(async (r, response) => { const b = body(r); return s.rounding.simulate(c(response), { amount: required(b["amount"]), ...(optionalString(b["companyCodeId"]) ? { companyCodeId: optionalString(b["companyCodeId"]) } : {}), ...(optionalString(b["currencyCode"]) ? { currencyCode: optionalString(b["currencyCode"]) } : {}), ...(optionalString(b["slot"]) ? { slot: optionalString(b["slot"]) } : {}) }); }));
    application.get("/api/control-admin/bank-validation/rules", options.authenticate, route(async (_r, response) => s.bankValidation.list(c(response))));
    application.post("/api/control-admin/bank-validation/verify", options.authenticate, route(async (r, response) => s.bankValidation.verify(c(response), body(r) as unknown as BankValidationInput)));
    application.get("/api/control-admin/entitlements/plans", options.authenticate, route(async (_r, response) => s.entitlements.listPlans(c(response))));
    application.get("/api/control-admin/entitlements/modules", options.authenticate, route(async (_r, response) => s.entitlements.listModules(c(response))));
  }

  if (options.flags.tenantOverrides) {
    for (const resource of ["feature_overrides", "tenant_parameter_values", "tenant_usage_limit_overrides"] as const) assertApprovedControlAdministrationRoute({ resource, operation: "write", tenantScoped: true });
    application.put("/api/control-admin/features/:code/override", options.authenticate, route(async (r, response) => { const b = body(r); return s.features.saveOverride({ context: c(response), code: required(r.params["code"]), enabled: boolean(b["enabled"]), reason: required(b["reason"]), effectiveFrom: timestamp(b["effectiveFrom"]), ...(optionalString(b["effectiveUntil"]) ? { effectiveUntil: timestamp(b["effectiveUntil"]) } : {}), ...(optionalString(b["id"]) ? { id: optionalString(b["id"]) } : {}), expectedVersion: requiredVersion(b) }); }));
    application.post("/api/control-admin/features/overrides/:id/expire", options.authenticate, route(async (r, response) => s.features.expireOverride(c(response), required(r.params["id"]), requiredVersion(body(r)))));
    application.put("/api/control-admin/parameters/:code/value", options.authenticate, route(async (r, response) => { const b = body(r); return s.parameters.saveValue({ context: c(response), code: required(r.params["code"]), value: b["value"] as JsonValue, effectiveFrom: timestamp(b["effectiveFrom"]), ...(optionalString(b["effectiveUntil"]) ? { effectiveUntil: timestamp(b["effectiveUntil"]) } : {}), ...(optionalString(b["reason"]) ? { reason: optionalString(b["reason"]) } : {}), ...(optionalString(b["id"]) ? { id: optionalString(b["id"]) } : {}), expectedVersion: requiredVersion(b) }); }));
    application.post("/api/control-admin/parameters/values/:id/expire", options.authenticate, route(async (r, response) => s.parameters.expireValue(c(response), required(r.params["id"]), requiredVersion(body(r)))));
    application.put("/api/control-admin/entitlements/overrides/:id", options.authenticate, route(async (r, response) => { const b = body(r); return s.entitlements.saveOverride({ context: c(response), override: { ...(b["override"] as Omit<TenantEntitlementOverride, "id" | "version" | "tenantId" | "status">), id: required(r.params["id"]) }, expectedVersion: requiredVersion(b) }); }));
    application.post("/api/control-admin/entitlements/overrides/:id/expire", options.authenticate, route(async (r, response) => s.entitlements.expireOverride(c(response), required(r.params["id"]), requiredVersion(body(r)))));
  }

  if (options.flags.lookupAndRoundingConfiguration) {
    assertApprovedControlAdministrationRoute({ resource: "reference_lookups", operation: "write", tenantScoped: true, rowOwnershipResolved: true });
    assertApprovedControlAdministrationRoute({ resource: "rounding_configuration", operation: "write", tenantScoped: true });
    application.post("/api/control-admin/lookups/desired-state/apply", options.authenticate, route(async (r, response) => s.lookups.applyDesiredState(c(response), body(r) as unknown as LookupDesiredState)));
    application.post("/api/control-admin/lookups/:code/values/:valueCode/retire", options.authenticate, route(async (r, response) => { const context = c(response), b = body(r); return s.lookups.retireValue(context, { domainCode: required(r.params["code"]), valueCode: required(r.params["valueCode"]), tenantId: context.tenantId, expectedVersion: requiredVersion(b) }); }));
    application.put("/api/control-admin/rounding/:id", options.authenticate, route(async (r, response) => { const context = neon(c(response)); const b = body(r); return s.rounding.save({ context, aggregate: { ...(b["aggregate"] as Omit<RoundingAggregate, "tenantId" | "version">), id: required(r.params["id"]) }, expectedVersion: requiredVersion(b) }); }));
    application.post("/api/control-admin/rounding/:id/retire", options.authenticate, route(async (r, response) => s.rounding.retire(neon(c(response)), required(r.params["id"]), requiredVersion(body(r)))));
  }

  if (options.flags.catalogAuthoring) {
    assertApprovedControlAdministrationRoute({ resource: "bank_validation_rules", operation: "author", planeKey: "studio" });
    application.post("/api/control-admin/bank-validation/rules/publish", options.authenticate, route(async (r, response) => s.bankValidation.publish(studio(c(response)), body(r) as unknown as BankValidationRule)));
  }

  if (options.flags.connectorLifecycle) {
    assertApprovedControlAdministrationRoute({ resource: "connector_instances", operation: "write", tenantScoped: true });
    application.put("/api/control-admin/connectors/:id/draft", options.authenticate, route(async (r, response) => { const b = body(r); return s.connectors.saveDraft(c(response), { ...(b["connector"] as Omit<ConnectorDraft, "tenantId" | "version">), id: required(r.params["id"]), status: "draft" }, requiredVersion(b)); }));
    application.post("/api/control-admin/connectors/validate", options.authenticate, route(async (r, response) => s.connectors.validate(c(response), body(r) as unknown as Omit<ConnectorDraft, "tenantId" | "version">)));
    for (const action of ["activate", "suspend", "deprecate"] as const) application.post(`/api/control-admin/connectors/:id/${action}`, options.authenticate, route(async (r, response) => s.connectors[action](c(response), required(r.params["id"]), requiredVersion(body(r)))));
    application.post("/api/control-admin/connectors/:id/health-checks", options.authenticate, route(async (r, response) => ({ status: 202, body: { jobId: await s.connectors.requestHealthCheck(c(response), required(r.params["id"])) } })));
  }
}

function route(work: (request: Request, response: Response) => Promise<unknown>) { return async (request: Request, response: Response, next: (error?: unknown) => void) => { try { const result = await work(request, response); if (result && typeof result === "object" && "status" in result && "body" in result) { const envelope = result as { status: number; body: unknown }; response.status(envelope.status).json(envelope.body); } else response.json(result); } catch (error) { next(error); } }; }
function body(request: Request): Record<string, unknown> { if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) throw invalid("JSON object required"); return request.body as Record<string, unknown>; }
function required(value: unknown): string { if (typeof value !== "string" || !value.trim()) throw invalid("Required string missing"); return value.trim(); }
function optionalString(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function boolean(value: unknown): boolean { if (typeof value !== "boolean") throw invalid("Boolean required"); return value; }
function timestamp(value: unknown): string { const text = required(value); if (!Number.isFinite(Date.parse(text))) throw invalid("Timestamp required"); return text; }
function optionalPositive(value: unknown): number | undefined { if (value === undefined) return undefined; const number = Number(value); if (!Number.isSafeInteger(number) || number < 1) throw invalid("Positive integer required"); return number; }
function optionalVersion(value: Record<string, unknown>): number | undefined { if (value["expectedVersion"] === undefined) return undefined; const version = Number(value["expectedVersion"]); if (!Number.isSafeInteger(version) || version < 0) throw invalid("Non-negative expectedVersion required"); return version; }
function requiredVersion(value: Record<string, unknown>): number { const version = optionalVersion(value); if (version === undefined) throw invalid("expectedVersion is required"); return version; }
function studio(context: VerifiedRequestContext): VerifiedRequestContext { if (context.planeKey !== "studio") throw forbidden("CONTROL_ADMIN_CATALOG_AUTHORING_STUDIO_REQUIRED"); return context; }
function neon(context: VerifiedRequestContext): VerifiedRequestContext { if (context.planeKey !== "neon") throw forbidden("CONTROL_ADMIN_FINANCE_WRITER_NEON_REQUIRED"); return context; }
function invalid(message: string): Error { return Object.assign(new TypeError(message), { code: "CONTROL_ADMIN_INVALID_COMMAND", status: 400 }); }
function forbidden(code: string): Error { return Object.assign(new Error(code), { code, status: 403 }); }
