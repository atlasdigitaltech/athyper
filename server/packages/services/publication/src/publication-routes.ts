import type { AuditRecorder } from "@athyper/server-contract-audit";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { JobPublisher } from "@athyper/server-contract-jobs";
import type { PublicationAuthorityRepository } from "@athyper/server-contract-publication";
import { HttpError, defineRouteContract, registerContractRoute, type Application, type RequestHandler, type Response } from "@athyper/server-runtime-http";

import { COMPILE_PUBLICATION_ARTIFACT_JOB, PUBLICATION_APPLY_QUEUE, PUBLICATION_AUTHORITY_QUEUE, ROLLBACK_PUBLICATION_RELEASE_JOB } from "./publication-jobs.js";
import { PublicationOperationsError, type PublicationOperationsService } from "./publication-operations.js";

export interface PublicationRouteOptions {
  readonly authenticate: RequestHandler;
  readonly readContext: (response: Response) => VerifiedRequestContext;
  readonly authorizer: Authorizer;
  readonly audit: AuditRecorder;
  readonly authority: PublicationAuthorityRepository;
  readonly jobs: JobPublisher;
  readonly apiEnabled: boolean;
  readonly operations?: PublicationOperationsService;
}

const objectSchema = { type: "object", additionalProperties: true } as const;
const contracts = {
  deadLetters: defineRouteContract({ method: "get", path: "/api/publication/operations/dead-letters", operationId: "publication.listDeadLetters", summary: "List publication delivery dead letters", tags: ["Publication Operations"], authenticated: true, permission: "publication.deployment.view", responses: { 200: { description: "Publication dead letters", body: objectSchema }, 400: { description: "Invalid query" }, 403: { description: "Forbidden", body: objectSchema }, 503: { description: "Publication operations unavailable", body: objectSchema } } }),
  destinationHealth: defineRouteContract({ method: "get", path: "/api/publication/operations/destinations/:plane/:targetInstance/health", operationId: "publication.getDestinationHealth", summary: "Get publication destination health", tags: ["Publication Operations"], authenticated: true, permission: "publication.deployment.view", responses: { 200: { description: "Destination health", body: objectSchema }, 400: { description: "Invalid destination" }, 403: { description: "Forbidden", body: objectSchema }, 503: { description: "Publication operations unavailable", body: objectSchema } } }),
  provenance: defineRouteContract({ method: "get", path: "/api/publication/deployments/:deploymentId/provenance", operationId: "publication.getDeploymentProvenance", summary: "Get publication deployment provenance", tags: ["Publication Operations"], authenticated: true, permission: "publication.deployment.view", responses: { 200: { description: "Deployment provenance", body: objectSchema }, 404: { description: "Provenance not found" }, 400: { description: "Invalid deployment identifier" }, 403: { description: "Forbidden", body: objectSchema }, 503: { description: "Publication operations unavailable", body: objectSchema } } }),
  replayDelivery: defineRouteContract({ method: "post", path: "/api/publication/operations/deliveries/:deliveryId/replay", operationId: "publication.replayDelivery", summary: "Replay a publication delivery", tags: ["Publication Operations"], authenticated: true, permission: "publication.deployment.retry", request: { body: { type: "object", required: ["reason"], properties: { reason: { type: "string" }, forceUnhealthy: { type: "boolean" } } } }, responses: { 202: { description: "Replay queued", body: objectSchema }, 409: { description: "Delivery is not replayable or destination is unhealthy" }, 400: { description: "Invalid replay request" }, 403: { description: "Forbidden", body: objectSchema }, 503: { description: "Publication operations unavailable", body: objectSchema } } }),
  release: defineRouteContract({ method: "get", path: "/api/publication/releases/:releaseId", operationId: "publication.getRelease", summary: "Get a publication release", tags: ["Publication"], authenticated: true, permission: "publication.release.view", responses: { 200: { description: "Publication release", body: objectSchema }, 400: { description: "Invalid release identifier" }, 403: { description: "Forbidden" }, 404: { description: "Release not found", body: objectSchema } } }),
  deployment: defineRouteContract({ method: "get", path: "/api/publication/deployments/:deploymentId", operationId: "publication.getDeployment", summary: "Get a publication deployment", tags: ["Publication"], authenticated: true, permission: "publication.deployment.view", responses: { 200: { description: "Publication deployment", body: objectSchema }, 400: { description: "Invalid deployment identifier" }, 403: { description: "Forbidden" }, 404: { description: "Deployment not found", body: objectSchema } } }),
  publish: defineRouteContract({ method: "post", path: "/api/publication/releases/:releaseId/publish", operationId: "publication.publishRelease", summary: "Publish a release", tags: ["Publication"], authenticated: true, permission: "publication.release.publish", responses: { 202: { description: "Publication queued", body: objectSchema }, 400: { description: "Invalid release identifier" }, 403: { description: "Forbidden" }, 404: { description: "Release not found", body: objectSchema }, 503: { description: "Publication API disabled", body: objectSchema } } }),
  retry: defineRouteContract({ method: "post", path: "/api/publication/deployments/:deploymentId/retry", operationId: "publication.retryDeployment", summary: "Retry a publication deployment", tags: ["Publication"], authenticated: true, permission: "publication.deployment.retry", responses: { 202: { description: "Retry queued", body: objectSchema }, 400: { description: "Invalid deployment identifier" }, 403: { description: "Forbidden" }, 404: { description: "Deployment not found", body: objectSchema }, 503: { description: "Publication API disabled", body: objectSchema } } }),
  rollback: defineRouteContract({ method: "post", path: "/api/publication/publication-keys/:key/rollback", operationId: "publication.rollbackRelease", summary: "Roll back a publication key", tags: ["Publication"], authenticated: true, permission: "publication.release.rollback", request: { body: { type: "object", required: ["plane", "targetAppliedReleaseId", "reason"], properties: { plane: { type: "string", enum: ["studio", "neon", "mesh"] }, targetAppliedReleaseId: { type: "string" }, reason: { type: "string" } } } }, responses: { 202: { description: "Rollback queued", body: objectSchema }, 400: { description: "Invalid rollback request" }, 403: { description: "Forbidden" }, 503: { description: "Publication API disabled", body: objectSchema } } }),
} as const;

export function registerPublicationRoutes(application: Application, options: PublicationRouteOptions): void {
  registerContractRoute(application, contracts.deadLetters, options.authenticate, async (request, response, next) => {
    try {
      const context = await requirePermission(options, response, "publication.deployment.view"); if (!context) return;
      if (!options.operations) { response.status(503).json({ error: "PUBLICATION_OPERATIONS_UNAVAILABLE" }); return; }
      const plane = optionalPlane(request.query["plane"]), targetInstance = optionalString(request.query["targetInstance"]), cursor = optionalString(request.query["cursor"]), limit = optionalLimit(request.query["limit"]);
      response.json(await options.operations.listDeadLetters({ tenantId: context.tenantId, ...(plane ? { plane } : {}), ...(targetInstance ? { targetInstance } : {}), ...(cursor ? { cursor } : {}), ...(limit ? { limit } : {}) }));
    } catch (error) { next(asHttpError(error)); }
  });

  registerContractRoute(application, contracts.destinationHealth, options.authenticate, async (request, response, next) => {
    try {
      const context = await requirePermission(options, response, "publication.deployment.view"); if (!context) return;
      if (!options.operations) { response.status(503).json({ error: "PUBLICATION_OPERATIONS_UNAVAILABLE" }); return; }
      response.json(await options.operations.destinationHealth(context.tenantId, planeValue(request.params["plane"]), requiredString(request.params, "targetInstance")));
    } catch (error) { next(asHttpError(error)); }
  });

  registerContractRoute(application, contracts.provenance, options.authenticate, async (request, response, next) => {
    try {
      const context = await requirePermission(options, response, "publication.deployment.view"); if (!context) return;
      if (!options.operations) { response.status(503).json({ error: "PUBLICATION_OPERATIONS_UNAVAILABLE" }); return; }
      response.json(await options.operations.provenance(context.tenantId, uuid(request.params["deploymentId"])));
    } catch (error) { next(asHttpError(error)); }
  });

  registerContractRoute(application, contracts.replayDelivery, options.authenticate, async (request, response, next) => {
    try {
      const context = await requirePermission(options, response, "publication.deployment.retry"); if (!context) return;
      if (!options.apiEnabled) { response.status(503).json({ error: "PUBLICATION_API_DISABLED" }); return; }
      if (!options.operations) { response.status(503).json({ error: "PUBLICATION_OPERATIONS_UNAVAILABLE" }); return; }
      const result = await options.operations.replay({ deliveryId: uuid(request.params["deliveryId"]), actorId: context.principalId, tenantId: context.tenantId, requestId: context.requestId, reason: requiredString(request.body,"reason"), ...(request.body && typeof request.body === "object" && Reflect.get(request.body,"forceUnhealthy") === true ? { forceUnhealthy: true } : {}) });
      response.status(202).json(result);
    } catch (error) { next(asHttpError(error)); }
  });

  registerContractRoute(application, contracts.release, options.authenticate, async (request, response, next) => {
    try {
      const context = await requirePermission(options, response, "publication.release.view");
      if (!context) return;
      const release = await tenantRelease(options, context, uuid(request.params["releaseId"]));
      response.status(release ? 200 : 404).json(release ?? { error: "PUBLICATION_RELEASE_NOT_FOUND" });
    } catch (error) { next(asHttpError(error)); }
  });

  registerContractRoute(application, contracts.deployment, options.authenticate, async (request, response, next) => {
    try {
      const context = await requirePermission(options, response, "publication.deployment.view");
      if (!context) return;
      const deployment = await tenantDeployment(options, context, uuid(request.params["deploymentId"]));
      response.status(deployment ? 200 : 404).json(deployment ?? { error: "PUBLICATION_DEPLOYMENT_NOT_FOUND" });
    } catch (error) { next(asHttpError(error)); }
  });

  registerContractRoute(application, contracts.publish, options.authenticate, async (request, response, next) => {
    try {
      const context = await requirePermission(options, response, "publication.release.publish");
      if (!context) return;
      if (!options.apiEnabled) { response.status(503).json({ error: "PUBLICATION_API_DISABLED" }); return; }
      const releaseId = uuid(request.params["releaseId"]);
      const release = await tenantRelease(options, context, releaseId);
      if (!release) { response.status(404).json({ error: "PUBLICATION_RELEASE_NOT_FOUND" }); return; }
      const jobId = await options.jobs.enqueue(PUBLICATION_AUTHORITY_QUEUE, COMPILE_PUBLICATION_ARTIFACT_JOB, { releaseId }, {
        enqueueKey: `publication:${releaseId}:compile:1`, maxAttempts: 5, payloadSchema: { name: COMPILE_PUBLICATION_ARTIFACT_JOB, version: 1 },
        execution: coordinate(context),
      });
      await audit(options, context, "publication.release.publish", releaseId, "success", { jobId });
      response.status(202).json({ releaseId, jobId });
    } catch (error) { next(asHttpError(error)); }
  });

  registerContractRoute(application, contracts.retry, options.authenticate, async (request, response, next) => {
    try {
      const context = await requirePermission(options, response, "publication.deployment.retry");
      if (!context) return;
      if (!options.apiEnabled) { response.status(503).json({ error: "PUBLICATION_API_DISABLED" }); return; }
      const deploymentId = uuid(request.params["deploymentId"]);
      const deployment = await tenantDeployment(options, context, deploymentId);
      if (!deployment) { response.status(404).json({ error: "PUBLICATION_DEPLOYMENT_NOT_FOUND" }); return; }
      const jobId = await options.jobs.enqueue("publication.apply", "publication.apply-release", { deploymentId, targetPlane: deployment.targetPlane }, {
        enqueueKey: `publication:${deploymentId}:apply:${deployment.targetPlane}:retry:${context.requestId}`, maxAttempts: 5, execution: coordinate(context),
      });
      await audit(options, context, "publication.deployment.retry", deploymentId, "success", { jobId });
      response.status(202).json({ deploymentId, jobId });
    } catch (error) { next(asHttpError(error)); }
  });

  registerContractRoute(application, contracts.rollback, options.authenticate, async (request, response, next) => {
    try {
      const context = await requirePermission(options, response, "publication.release.rollback");
      if (!context) return;
      const plane = requiredPlane(request.body);
      const targetAppliedReleaseId = uuid(requiredString(request.body, "targetAppliedReleaseId"));
      if (!options.apiEnabled) { response.status(503).json({ error: "PUBLICATION_API_DISABLED" }); return; }
      const publicationKey=String(request.params["key"]),reason=requiredString(request.body,"reason");
      const jobId=await options.jobs.enqueue(PUBLICATION_APPLY_QUEUE,ROLLBACK_PUBLICATION_RELEASE_JOB,{publicationKey,targetAppliedReleaseId,targetPlane:plane,reason,actorId:context.principalId},{enqueueKey:`publication:${plane}:${publicationKey}:rollback:${targetAppliedReleaseId}`,maxAttempts:3,execution:coordinate(context),payloadSchema:{name:ROLLBACK_PUBLICATION_RELEASE_JOB,version:1}});
      await audit(options, context, "publication.release.rollback", targetAppliedReleaseId, "success", { plane,publicationKey,jobId });
      response.status(202).json({publicationKey,plane,targetAppliedReleaseId,jobId});
    } catch (error) { next(asHttpError(error)); }
  });
}

async function requirePermission(options: PublicationRouteOptions, response: Response, permissionCode: string) {
  const context = options.readContext(response);
  if (!(await options.authorizer.authorize({ context, permissionCode })).allowed) { response.status(403).json({ error: "FORBIDDEN" }); return undefined; }
  return context;
}

function coordinate(context: VerifiedRequestContext) { return { planeKey: context.planeKey, scope: "tenant" as const, tenantId: context.tenantId, principalId: context.principalId, correlationId: context.correlationId ?? context.requestId }; }
function uuid(value: unknown): string { const result=String(value??""); if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result))throw invalidRequest("Invalid UUID"); return result; }
function requiredString(value: unknown,key:string):string{const result=value&&typeof value==="object"?Reflect.get(value,key):undefined;if(typeof result!=="string"||!result.trim())throw invalidRequest(`${key} is required`);return result.trim();}
function requiredPlane(value:unknown):"studio"|"neon"|"mesh"{const plane=requiredString(value,"plane");if(plane!=="studio"&&plane!=="neon"&&plane!=="mesh")throw invalidRequest("plane is invalid");return plane;}
function planeValue(value:unknown):"studio"|"neon"|"mesh"{const plane=value;if(plane!=="studio"&&plane!=="neon"&&plane!=="mesh")throw invalidRequest("plane is invalid");return plane;}
function optionalPlane(value:unknown):"studio"|"neon"|"mesh"|undefined{return value===undefined?undefined:planeValue(value);}
function optionalString(value:unknown):string|undefined{if(value===undefined)return undefined;if(typeof value!=="string"||!value.trim())throw invalidRequest("Query value must be a non-empty string");return value.trim();}
function optionalLimit(value:unknown):number|undefined{if(value===undefined)return undefined;if(typeof value!=="string"||!/^\d+$/.test(value))throw invalidRequest("limit is invalid");const result=Number(value);if(!Number.isSafeInteger(result)||result<1||result>200)throw invalidRequest("limit is invalid");return result;}
async function audit(options:PublicationRouteOptions,context:VerifiedRequestContext,action:string,entityId:string,outcome:"success"|"failure",metadata:Readonly<Record<string,unknown>>){await options.audit.record({eventCode:action,action,outcome,severity:"critical",actor:{kind:"user",principalId:context.principalId},tenantId:context.tenantId,entityType:"publication",entityId,requestId:context.requestId,correlationId:context.correlationId,metadata});}

function invalidRequest(message: string): HttpError { return new HttpError(400, "PUBLICATION_INVALID_REQUEST", message); }
function asHttpError(error: unknown): unknown {
  if (!(error instanceof PublicationOperationsError)) return error;
  const status = error.code === "PUBLICATION_PROVENANCE_NOT_FOUND" ? 404
    : ["PUBLICATION_DELIVERY_NOT_REPLAYABLE", "PUBLICATION_DESTINATION_UNHEALTHY"].includes(error.code) ? 409
    : error.code === "PUBLICATION_REPLAY_REASON_REQUIRED" ? 400 : 500;
  return new HttpError(status, error.code, error.message);
}
async function tenantRelease(options: PublicationRouteOptions, context: VerifiedRequestContext, id: string) {
  const release = await options.authority.getRelease(id);
  return release?.tenantId === context.tenantId ? release : null;
}
async function tenantDeployment(options: PublicationRouteOptions, context: VerifiedRequestContext, id: string) {
  const deployment = await options.authority.getDeployment(id);
  if (!deployment || !await tenantRelease(options, context, deployment.sourceReleaseId)) return null;
  return deployment;
}
