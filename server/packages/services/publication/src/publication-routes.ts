import type { AuditRecorder } from "@athyper/server-contract-audit";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { JobPublisher } from "@athyper/server-contract-jobs";
import type { PublicationAuthorityRepository } from "@athyper/server-contract-publication";
import type { Application, RequestHandler, Response } from "@athyper/server-runtime-http";

import { COMPILE_PUBLICATION_ARTIFACT_JOB, PUBLICATION_APPLY_QUEUE, PUBLICATION_AUTHORITY_QUEUE, ROLLBACK_PUBLICATION_RELEASE_JOB } from "./publication-jobs.js";

export interface PublicationRouteOptions {
  readonly authenticate: RequestHandler;
  readonly readContext: (response: Response) => VerifiedRequestContext;
  readonly authorizer: Authorizer;
  readonly audit: AuditRecorder;
  readonly authority: PublicationAuthorityRepository;
  readonly jobs: JobPublisher;
  readonly apiEnabled: boolean;
}

export function registerPublicationRoutes(application: Application, options: PublicationRouteOptions): void {
  application.get("/api/publication/releases/:releaseId", options.authenticate, async (request, response, next) => {
    try {
      const context = await requirePermission(options, response, "publication.release.view");
      if (!context) return;
      const release = await options.authority.getRelease(uuid(request.params["releaseId"]));
      response.status(release ? 200 : 404).json(release ?? { error: "PUBLICATION_RELEASE_NOT_FOUND" });
    } catch (error) { next(error); }
  });

  application.get("/api/publication/deployments/:deploymentId", options.authenticate, async (request, response, next) => {
    try {
      const context = await requirePermission(options, response, "publication.deployment.view");
      if (!context) return;
      const deployment = await options.authority.getDeployment(uuid(request.params["deploymentId"]));
      response.status(deployment ? 200 : 404).json(deployment ?? { error: "PUBLICATION_DEPLOYMENT_NOT_FOUND" });
    } catch (error) { next(error); }
  });

  application.post("/api/publication/releases/:releaseId/publish", options.authenticate, async (request, response, next) => {
    try {
      const context = await requirePermission(options, response, "publication.release.publish");
      if (!context) return;
      if (!options.apiEnabled) { response.status(503).json({ error: "PUBLICATION_API_DISABLED" }); return; }
      const releaseId = uuid(request.params["releaseId"]);
      const release = await options.authority.getRelease(releaseId);
      if (!release) { response.status(404).json({ error: "PUBLICATION_RELEASE_NOT_FOUND" }); return; }
      const jobId = await options.jobs.enqueue(PUBLICATION_AUTHORITY_QUEUE, COMPILE_PUBLICATION_ARTIFACT_JOB, { releaseId }, {
        jobId: `publication:${releaseId}:compile:1`, maxAttempts: 5, payloadSchema: { name: COMPILE_PUBLICATION_ARTIFACT_JOB, version: 1 },
        execution: coordinate(context),
      });
      await audit(options, context, "publication.release.publish", releaseId, "success", { jobId });
      response.status(202).json({ releaseId, jobId });
    } catch (error) { next(error); }
  });

  application.post("/api/publication/deployments/:deploymentId/retry", options.authenticate, async (request, response, next) => {
    try {
      const context = await requirePermission(options, response, "publication.deployment.retry");
      if (!context) return;
      if (!options.apiEnabled) { response.status(503).json({ error: "PUBLICATION_API_DISABLED" }); return; }
      const deploymentId = uuid(request.params["deploymentId"]);
      const deployment = await options.authority.getDeployment(deploymentId);
      if (!deployment) { response.status(404).json({ error: "PUBLICATION_DEPLOYMENT_NOT_FOUND" }); return; }
      const jobId = await options.jobs.enqueue("publication.apply", "publication.apply-release", { deploymentId, targetPlane: deployment.targetPlane }, {
        jobId: `publication:${deploymentId}:apply:${deployment.targetPlane}:retry:${context.requestId}`, maxAttempts: 5, execution: coordinate(context),
      });
      await audit(options, context, "publication.deployment.retry", deploymentId, "success", { jobId });
      response.status(202).json({ deploymentId, jobId });
    } catch (error) { next(error); }
  });

  application.post("/api/publication/publication-keys/:key/rollback", options.authenticate, async (request, response, next) => {
    try {
      const context = await requirePermission(options, response, "publication.release.rollback");
      if (!context) return;
      const plane = requiredPlane(request.body);
      const targetAppliedReleaseId = requiredString(request.body, "targetAppliedReleaseId");
      if (!options.apiEnabled) { response.status(503).json({ error: "PUBLICATION_API_DISABLED" }); return; }
      const publicationKey=String(request.params["key"]),reason=requiredString(request.body,"reason");
      const jobId=await options.jobs.enqueue(PUBLICATION_APPLY_QUEUE,ROLLBACK_PUBLICATION_RELEASE_JOB,{publicationKey,targetAppliedReleaseId,targetPlane:plane,reason,actorId:context.principalId},{jobId:`publication:${plane}:${publicationKey}:rollback:${targetAppliedReleaseId}`,maxAttempts:3,execution:coordinate(context),payloadSchema:{name:ROLLBACK_PUBLICATION_RELEASE_JOB,version:1}});
      await audit(options, context, "publication.release.rollback", targetAppliedReleaseId, "success", { plane,publicationKey,jobId });
      response.status(202).json({publicationKey,plane,targetAppliedReleaseId,jobId});
    } catch (error) { next(error); }
  });
}

async function requirePermission(options: PublicationRouteOptions, response: Response, permissionCode: string) {
  const context = options.readContext(response);
  if (!(await options.authorizer.authorize({ context, permissionCode })).allowed) { response.status(403).json({ error: "FORBIDDEN" }); return undefined; }
  return context;
}

function coordinate(context: VerifiedRequestContext) { return { planeKey: context.planeKey, scope: "tenant" as const, tenantId: context.tenantId, principalId: context.principalId, correlationId: context.correlationId ?? context.requestId }; }
function uuid(value: unknown): string { const result=String(value??""); if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result))throw new TypeError("Invalid UUID"); return result; }
function requiredString(value: unknown,key:string):string{const result=value&&typeof value==="object"?Reflect.get(value,key):undefined;if(typeof result!=="string"||!result.trim())throw new TypeError(`${key} is required`);return result.trim();}
function requiredPlane(value:unknown):"studio"|"neon"|"mesh"{const plane=requiredString(value,"plane");if(plane!=="studio"&&plane!=="neon"&&plane!=="mesh")throw new TypeError("plane is invalid");return plane;}
async function audit(options:PublicationRouteOptions,context:VerifiedRequestContext,action:string,entityId:string,outcome:"success"|"failure",metadata:Readonly<Record<string,unknown>>){await options.audit.record({eventCode:action,action,outcome,severity:"critical",actor:{kind:"user",principalId:context.principalId},tenantId:context.tenantId,entityType:"publication",entityId,requestId:context.requestId,correlationId:context.correlationId,metadata});}
