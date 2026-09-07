import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { controlAdminSchemas, type BankValidationInput, type BankValidationRule, type ConnectorDraft, type JsonValue, type LookupDesiredState, type RoundingAggregate, type TenantEntitlementOverride } from "@athyper/server-contract-control-admin";
import { HttpError, defineRouteContract, registerContractRoute, type RuntimeSchema } from "@athyper/server-runtime-http";
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
  registerParameterRoutes(application,{...options,service:s.parameters,reads:options.flags.localCatalogReads,writes:options.flags.tenantOverrides});
  if (options.flags.localCatalogReads) {
    for (const resource of ["feature_definitions", "parameter_definitions", "reference_lookups", "rounding_configuration", "bank_validation_rules", "subscription_definitions", "usage_metric_catalog"] as const) assertApprovedControlAdministrationRoute({ resource, operation: "read" });
    registerContractRoute(application, featureContract("get","/api/control-admin/features","features.list","List feature definitions",controlAdminSchemas.featureDefinitions), options.authenticate, route(async (_r, response) => s.features.list(c(response))));
    registerContractRoute(application, featureContract("get","/api/control-admin/features/:code/evaluation","features.evaluate","Evaluate a feature",controlAdminSchemas.featureEvaluation), options.authenticate, route(async (r, response) => s.features.evaluate(c(response), required(r.params["code"]))));
    registerContractRoute(application, lookupContract("get","/api/control-admin/lookups","lookups.list","List reference lookups",controlAdminSchemas.lookupDomains), options.authenticate, route(async (_r, response) => s.lookups.list(c(response))));
    registerContractRoute(application, lookupContract("get","/api/control-admin/lookups/:code","lookups.read","Read a reference lookup",controlAdminSchemas.lookupDomain), options.authenticate, route(async (r, response) => s.lookups.read(c(response), required(r.params["code"]), optionalPositive(r.query["version"]))));
    registerContractRoute(application, roundingContract("get","/api/control-admin/rounding","rounding.list","List rounding configuration",controlAdminSchemas.roundingRecords), options.authenticate, route(async (_r, response) => s.rounding.list(c(response))));
    registerContractRoute(application, roundingContract("post","/api/control-admin/rounding/simulate","rounding.simulate","Simulate rounding",controlAdminSchemas.roundingResult,controlAdminSchemas.roundingSimulation), options.authenticate, route(async (r, response) => { const b = body(r); return s.rounding.simulate(c(response), { amount: required(b["amount"]), ...(optionalString(b["companyCodeId"]) ? { companyCodeId: optionalString(b["companyCodeId"]) } : {}), ...(optionalString(b["currencyCode"]) ? { currencyCode: optionalString(b["currencyCode"]) } : {}), ...(optionalString(b["slot"]) ? { slot: optionalString(b["slot"]) } : {}) }); }));
    registerContractRoute(application, bankContract("get", "/api/control-admin/bank-validation/rules", "bankValidation.list", "List bank-validation rules", "control.catalog.read", controlAdminSchemas.bankRules), options.authenticate, route(async (_r, response) => s.bankValidation.list(c(response))));
    registerContractRoute(application, bankContract("post", "/api/control-admin/bank-validation/verify", "bankValidation.verify", "Verify bank details", "control.catalog.read", controlAdminSchemas.bankResult, controlAdminSchemas.bankInput), options.authenticate, route(async (r, response) => s.bankValidation.verify(c(response), body(r) as unknown as BankValidationInput)));
    registerContractRoute(application, entitlementContract("get", "/api/control-admin/entitlements/plans", "entitlements.plans.list", "List entitlement plans", controlAdminSchemas.entitlementPlans), options.authenticate, route(async (_r, response) => s.entitlements.listPlans(c(response))));
    registerContractRoute(application, entitlementContract("get", "/api/control-admin/entitlements/modules", "entitlements.modules.list", "List entitlement modules", controlAdminSchemas.entitlementModules), options.authenticate, route(async (_r, response) => s.entitlements.listModules(c(response))));
  }

  if (options.flags.tenantOverrides) {
    for (const resource of ["feature_overrides", "tenant_parameter_values", "tenant_usage_limit_overrides"] as const) assertApprovedControlAdministrationRoute({ resource, operation: "write", tenantScoped: true });
    registerContractRoute(application, featureContract("put","/api/control-admin/features/:code/override","features.override.put","Set a tenant feature override",controlAdminSchemas.featureRecord,controlAdminSchemas.featureOverride), options.authenticate, route(async (r, response) => { const b = body(r); return s.features.saveOverride({ context: c(response), code: required(r.params["code"]), enabled: boolean(b["enabled"]), reason: required(b["reason"]), effectiveFrom: required(b["effectiveFrom"]), ...(optionalString(b["effectiveUntil"]) ? { effectiveUntil: optionalString(b["effectiveUntil"])! } : {}), ...(optionalString(b["id"]) ? { id: optionalString(b["id"]) } : {}), expectedVersion: requiredVersion(b) }); }));
    registerContractRoute(application, featureContract("post","/api/control-admin/features/overrides/:id/expire","features.override.expire","Expire a tenant feature override",controlAdminSchemas.featureRecord,controlAdminSchemas.featureVersion), options.authenticate, route(async (r, response) => s.features.expireOverride(c(response), required(r.params["id"]), requiredVersion(body(r)))));
    registerContractRoute(application, entitlementContract("put", "/api/control-admin/entitlements/overrides/:id", "entitlements.override.put", "Set a tenant entitlement override", controlAdminSchemas.entitlementRecord, controlAdminSchemas.entitlementOverride), options.authenticate, route(async (r, response) => { const b = body(r); return s.entitlements.saveOverride({ context: c(response), override: { ...(b["override"] as Omit<TenantEntitlementOverride, "id" | "version" | "tenantId" | "status">), id: required(r.params["id"]) }, expectedVersion: requiredVersion(b) }); }));
    registerContractRoute(application, entitlementContract("post", "/api/control-admin/entitlements/overrides/:id/expire", "entitlements.override.expire", "Expire a tenant entitlement override", controlAdminSchemas.entitlementRecord, controlAdminSchemas.entitlementVersion), options.authenticate, route(async (r, response) => s.entitlements.expireOverride(c(response), required(r.params["id"]), requiredVersion(body(r)))));
  }

  if (options.flags.lookupAndRoundingConfiguration) {
    assertApprovedControlAdministrationRoute({ resource: "reference_lookups", operation: "write", tenantScoped: true, rowOwnershipResolved: true });
    assertApprovedControlAdministrationRoute({ resource: "rounding_configuration", operation: "write", tenantScoped: true });
    registerContractRoute(application, lookupContract("post","/api/control-admin/lookups/desired-state/apply","lookups.desiredState.apply","Apply lookup desired state",controlAdminSchemas.lookupDomain,controlAdminSchemas.lookupDesiredState), options.authenticate, route(async (r, response) => s.lookups.applyDesiredState(c(response), body(r) as unknown as LookupDesiredState)));
    registerContractRoute(application, lookupContract("post","/api/control-admin/lookups/:code/values/:valueCode/retire","lookups.value.retire","Retire a lookup value",controlAdminSchemas.lookupDomain,controlAdminSchemas.lookupVersion), options.authenticate, route(async (r, response) => { const context = c(response), b = body(r); return s.lookups.retireValue(context, { domainCode: required(r.params["code"]), valueCode: required(r.params["valueCode"]), tenantId: context.tenantId, expectedVersion: requiredVersion(b) }); }));
    registerContractRoute(application, roundingContract("put","/api/control-admin/rounding/:id","rounding.put","Set rounding configuration",controlAdminSchemas.roundingRecord,controlAdminSchemas.roundingSave), options.authenticate, route(async (r, response) => { const context = neon(c(response)); const b = body(r); return s.rounding.save({ context, aggregate: { ...(b["aggregate"] as Omit<RoundingAggregate, "tenantId" | "version">), id: required(r.params["id"]) }, expectedVersion: requiredVersion(b) }); }));
    registerContractRoute(application, roundingContract("post","/api/control-admin/rounding/:id/retire","rounding.retire","Retire rounding configuration",controlAdminSchemas.roundingRecord,controlAdminSchemas.roundingRetire), options.authenticate, route(async (r, response) => s.rounding.retire(neon(c(response)), required(r.params["id"]), requiredVersion(body(r)))));
  }

  if (options.flags.catalogAuthoring) {
    assertApprovedControlAdministrationRoute({ resource: "bank_validation_rules", operation: "author", planeKey: "studio" });
    registerContractRoute(application, bankContract("post", "/api/control-admin/bank-validation/rules/publish", "bankValidation.rules.publish", "Publish a bank-validation rule", "control.catalog.publish", controlAdminSchemas.bankRule, controlAdminSchemas.bankRule), options.authenticate, route(async (r, response) => s.bankValidation.publish(c(response), body(r) as unknown as BankValidationRule)));
  }

  if (options.flags.connectorLifecycle) {
    assertApprovedControlAdministrationRoute({ resource: "connector_instances", operation: "write", tenantScoped: true });
    registerContractRoute(application, connectorContract("put", "/api/control-admin/connectors/:id/draft", "connectors.draft.put", "Save a connector draft", controlAdminSchemas.connectorRecord, controlAdminSchemas.connectorSave), options.authenticate, route(async (r, response) => { const b = body(r); const draft = b["connector"] as ConnectorDraft; if (draft.id !== undefined && draft.id !== r.params["id"]) throw new HttpError(400, "CONTROL_ADMIN_CONNECTOR_INVALID", "Connector id must match the route"); return s.connectors.saveDraft(c(response), { ...(b["connector"] as Omit<ConnectorDraft, "tenantId" | "version">), id: required(r.params["id"]), status: "draft" }, requiredVersion(b)); }));
    registerContractRoute(application, connectorContract("post", "/api/control-admin/connectors/validate", "connectors.validate", "Validate a connector", controlAdminSchemas.connectorValidation, controlAdminSchemas.connector), options.authenticate, route(async (r, response) => s.connectors.validate(c(response), body(r) as unknown as Omit<ConnectorDraft, "tenantId" | "version">)));
    for (const action of ["activate", "suspend", "deprecate"] as const) registerContractRoute(application, connectorContract("post", `/api/control-admin/connectors/:id/${action}`, `connectors.${action}`, `${action} a connector`, controlAdminSchemas.connectorRecord, controlAdminSchemas.connectorVersion), options.authenticate, route(async (r, response) => s.connectors[action](c(response), required(r.params["id"]), requiredVersion(body(r)))));
    registerContractRoute(application, connectorContract("post", "/api/control-admin/connectors/:id/health-checks", "connectors.healthChecks.request", "Request a connector health check", controlAdminSchemas.connectorHealthJob, undefined, 202), options.authenticate, route(async (r, response) => ({ status: 202, body: { jobId: await s.connectors.requestHealthCheck(c(response), required(r.params["id"])) } })));
  }
}

export function registerParameterRoutes(application:Application,options:{readonly authenticate:RequestHandler;readonly readContext:(response:Response)=>VerifiedRequestContext;readonly service:ControlServices["parameters"];readonly reads:boolean;readonly writes:boolean}) {
 const c=options.readContext,s={parameters:options.service};
 if(options.reads) {
  assertApprovedControlAdministrationRoute({resource:"parameter_definitions",operation:"read"});
    registerContractRoute(application, parameterContract("get","/api/control-admin/parameters","parameters.list","List parameter definitions",controlAdminSchemas.parameterDefinitions), options.authenticate, route(async (_r, response) => s.parameters.list(c(response))));
    registerContractRoute(application, parameterContract("get","/api/control-admin/parameters/:code/effective","parameters.resolve","Resolve an effective parameter",controlAdminSchemas.parameterEffective), options.authenticate, route(async (r, response) => s.parameters.resolve(c(response), required(r.params["code"]))));
 }
 if(options.writes) {
  assertApprovedControlAdministrationRoute({resource:"tenant_parameter_values",operation:"write",tenantScoped:true});
    registerContractRoute(application, parameterContract("put","/api/control-admin/parameters/:code/value","parameters.value.put","Set a tenant parameter value",controlAdminSchemas.parameterRecord,controlAdminSchemas.parameterValue), options.authenticate, route(async (r, response) => { const b = body(r); return s.parameters.saveValue({ context: c(response), code: required(r.params["code"]), value: b["value"] as JsonValue, effectiveFrom: b["effectiveFrom"] as string, ...(b["effectiveUntil"] !== undefined ? { effectiveUntil: b["effectiveUntil"] as string } : {}), ...(optionalString(b["reason"]) ? { reason: optionalString(b["reason"]) } : {}), ...(optionalString(b["id"]) ? { id: optionalString(b["id"]) } : {}), expectedVersion: requiredVersion(b) }); }));
    registerContractRoute(application, parameterContract("post","/api/control-admin/parameters/values/:id/expire","parameters.value.expire","Expire a tenant parameter value",controlAdminSchemas.parameterRecord,controlAdminSchemas.parameterExpire), options.authenticate, route(async (r, response) => s.parameters.expireValue(c(response), required(r.params["id"]), requiredVersion(body(r)))));
 }
}

function parameterContract(method:"get"|"put"|"post",path:string,operation:string,summary:string,responseSchema:RuntimeSchema,bodySchema?:RuntimeSchema) {
 return defineRouteContract({method,path,operationId:`controlAdmin.${operation}`,summary,tags:["Control Administration"],authenticated:true,permission:method==="get"?"control.catalog.read":"control.tenant_override.manage",
 request:{...(path.includes(":code")?{params:controlAdminSchemas.parameterCodeParams}:path.includes(":id")?{params:controlAdminSchemas.parameterIdParams}:{}),...(bodySchema?{body:bodySchema}:{})},
 responses:{200:{description:"Parameter response",body:responseSchema},400:{description:"Invalid parameter or version"},401:{description:"Authentication required"},403:{description:"Permission or override denied"},404:{description:"Parameter or tenant value not found"},409:{description:"Version, lifecycle or period conflict"},503:{description:"Repository unavailable or invalid stored configuration"}}});
}

function lookupContract(method:"get"|"post",path:string,operation:string,summary:string,responseSchema:RuntimeSchema,bodySchema?:RuntimeSchema) {
  return defineRouteContract({method,path,operationId:`controlAdmin.${operation}`,summary,tags:["Control Administration"],authenticated:true,
    permission:method==="get"?"control.catalog.read":path.endsWith("/retire")?"control.tenant_override.manage":"control.catalog.publish",
    request:{...(path.includes(":valueCode")?{params:controlAdminSchemas.lookupValueParams}:path.includes(":code")?{params:controlAdminSchemas.lookupCodeParams}:{}),
      ...(method==="get"?{query:path.includes(":code")?controlAdminSchemas.lookupQuery:{type:"object",additionalProperties:false,properties:{}}}:{}),...(bodySchema?{body:bodySchema}:{})},
    responses:{200:{description:"Lookup response",body:responseSchema},400:{description:"Invalid lookup or revision"},401:{description:"Authentication required"},403:{description:"Permission, target plane or ownership denied"},404:{description:"Lookup revision or tenant value not found"},409:{description:"Version, lifecycle or reference-use conflict"},503:{description:"Exact-plane repository unavailable"}}});
}

function featureContract(method:"get"|"put"|"post",path:string,operation:string,summary:string,responseSchema:RuntimeSchema,bodySchema?:RuntimeSchema){
  return defineRouteContract({method,path,operationId:`controlAdmin.${operation}`,summary,tags:["Control Administration"],authenticated:true,permission:method==="get"?"control.catalog.read":"control.tenant_override.manage",
    request:{...(path.includes(":code")?{params:controlAdminSchemas.featureCodeParams}:path.includes(":id")?{params:controlAdminSchemas.featureIdParams}:{}),...(bodySchema?{body:bodySchema}:{})},
    responses:{200:{description:"Feature response",body:responseSchema},400:{description:"Invalid feature command"},401:{description:"Authentication required"},403:{description:"Permission denied"},404:{description:"Feature or override not found"},409:{description:"Version, lifecycle, or period conflict"},503:{description:"Exact-plane repository unavailable"}}});
}

function entitlementContract(method: "get" | "put" | "post", path: string, operation: string, summary: string, responseSchema: RuntimeSchema, bodySchema?: RuntimeSchema) {
  return defineRouteContract({ method, path, operationId: `controlAdmin.${operation}`, summary, tags: ["Control Administration"], authenticated: true, permission: method === "get" ? "control.catalog.read" : "control.tenant_override.manage",
    request: { ...(path.includes(":id") ? { params: controlAdminSchemas.entitlementParams } : {}), ...(bodySchema ? { body: bodySchema } : {}) },
    responses: { 200: { description: "Entitlement response", body: responseSchema }, 400: { description: "Invalid entitlement override or version" }, 401: { description: "Authentication required" }, 403: { description: "Permission denied" }, 404: { description: "Plan, target, or override not found" }, 409: { description: "Version or lifecycle conflict" }, 503: { description: "Entitlement repository unavailable" } },
  });
}

function connectorContract(method: "post" | "put", path: string, operation: string, summary: string, responseSchema: RuntimeSchema, bodySchema?: RuntimeSchema, successStatus = 200) {
  return defineRouteContract({ method, path, operationId: `controlAdmin.${operation}`, summary, tags: ["Control Administration"], authenticated: true, permission: "control.connector.manage",
    request: { ...(path.includes(":id") ? { params: controlAdminSchemas.connectorParams } : {}), ...(bodySchema ? { body: bodySchema } : {}) },
    responses: { [successStatus]: { description: "Connector response", body: responseSchema }, 400: { description: "Invalid connector or version" }, 401: { description: "Authentication required" }, 403: { description: "Permission denied" }, 404: { description: "Connector not found" }, 409: { description: "Version or lifecycle conflict" }, 503: { description: "Connector repository or health job unavailable" } },
  });
}

function bankContract(method: "get" | "post", path: string, operation: string, summary: string, permission: string, responseSchema: RuntimeSchema, bodySchema?: RuntimeSchema) {
  return defineRouteContract({ method, path, operationId: `controlAdmin.${operation}`, summary, tags: ["Control Administration"], authenticated: true, permission,
    ...(bodySchema ? { request: { body: bodySchema } } : {}),
    responses: { 200: { description: "Bank-validation response", body: responseSchema }, 400: { description: "Invalid bank input or rule" }, 401: { description: "Authentication required" }, 403: { description: "Permission or plane denied" }, 409: { description: "Rule version conflict" }, 503: { description: "Bank-validation repository unavailable" } },
  });
}

function route(work: (request: Request, response: Response) => Promise<unknown>) { return async (request: Request, response: Response, next: (error?: unknown) => void) => { try { const result = await work(request, response); if (result && typeof result === "object" && "status" in result && "body" in result) { const envelope = result as { status: number; body: unknown }; response.status(envelope.status).json(envelope.body); } else response.json(result); } catch (error) { next(error); } }; }
function body(request: Request): Record<string, unknown> { if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) throw invalid("JSON object required"); return request.body as Record<string, unknown>; }
function required(value: unknown): string { if (typeof value !== "string" || !value.trim()) throw invalid("Required string missing"); return value.trim(); }
function optionalString(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function boolean(value: unknown): boolean { if (typeof value !== "boolean") throw invalid("Boolean required"); return value; }
function optionalPositive(value: unknown): number | undefined { if (value === undefined) return undefined; const number = Number(value); if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(number)) throw new HttpError(400, "CONTROL_ADMIN_INVALID_COMMAND", "Positive safe-integer version required"); return number; }
function optionalVersion(value: Record<string, unknown>): number | undefined { if (value["expectedVersion"] === undefined) return undefined; const version = Number(value["expectedVersion"]); if (!Number.isSafeInteger(version) || version < 0) throw invalid("Non-negative expectedVersion required"); return version; }
function requiredVersion(value: Record<string, unknown>): number { const version = optionalVersion(value); if (version === undefined) throw invalid("expectedVersion is required"); return version; }
function neon(context: VerifiedRequestContext): VerifiedRequestContext { if (context.planeKey !== "neon") throw forbidden("CONTROL_ADMIN_FINANCE_WRITER_NEON_REQUIRED"); return context; }
function invalid(message: string): Error { return Object.assign(new TypeError(message), { code: "CONTROL_ADMIN_INVALID_COMMAND", status: 400 }); }
function forbidden(code: string): Error { return Object.assign(new Error(code), { code, status: 403 }); }

function roundingContract(method:"get"|"post"|"put",path:string,operation:string,summary:string,responseSchema:RuntimeSchema,bodySchema?:RuntimeSchema){
 return defineRouteContract({method,path,operationId:`controlAdmin.${operation}`,summary,tags:["Control Administration"],authenticated:true,permission:path.includes(":id")?"control.finance_config.manage":"control.catalog.read",request:{...(path.includes(":id")?{params:controlAdminSchemas.roundingIdParams}:{}),...(bodySchema?{body:bodySchema}:{}),query:{type:"object",additionalProperties:false,properties:{}}},responses:{200:{description:"Rounding response",body:responseSchema},400:{description:"Invalid rounding command"},401:{description:"Authentication required"},403:{description:"Permission or Neon writer required"},404:{description:"Tenant rule not found"},409:{description:"Version, lifecycle or context conflict"},503:{description:"Invalid stored configuration or repository unavailable"}}});
}
