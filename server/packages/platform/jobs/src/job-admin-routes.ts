import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { JobAdministration, JobAdministrationRequest, JobGovernance, ScheduleMutation } from "@athyper/server-contract-jobs";
import type { Application, RequestHandler, Response } from "@athyper/server-runtime-http";
type HttpRequest = Parameters<RequestHandler>[0];

export function registerJobAdministrationRoutes(application: Application, options: {
  readonly authenticate: RequestHandler;
  readonly readContext: (response: Response) => VerifiedRequestContext;
  readonly authorizer: Authorizer;
  readonly jobs: JobAdministration;
  readonly governance?: JobGovernance;
}): void {
  if (options.governance) registerGovernanceRoutes(application, options as typeof options & { governance: JobGovernance });
  application.get("/api/jobs/admin/dead-letters", options.authenticate, async (request, response, next) => {
    try {
      const context = options.readContext(response);
      if (!await allowed(options.authorizer, context, "jobs.board.view")) {
        response.status(403).json({ error: "FORBIDDEN" }); return;
      }
      const entries = await options.jobs.listDeadLetters({
        execution: coordinate(context),
        limit: integer(request.query["limit"], 50),
      });
      response.status(200).json({ entries });
    } catch (error) { next(error); }
  });

  for (const command of ["cancel", "retry", "replay"] as const) {
    application.post(`/api/jobs/admin/executions/:id/${command}`, options.authenticate, async (request, response, next) => {
      try {
        const context = options.readContext(response);
        if (!await allowed(options.authorizer, context, "jobs.queue.manage")) {
          response.status(403).json({ error: "FORBIDDEN" }); return;
        }
        const input: JobAdministrationRequest = {
          executionId: uuid(request.params["id"]),
          execution: coordinate(context),
          reason: requiredReason(request.body),
        };
        const result = await options.jobs[command](input);
        response.status(result.applied ? 200 : 409).json(result);
      } catch (error) { next(error); }
    });
  }
}

function registerGovernanceRoutes(application: Application, options: {
  readonly authenticate: RequestHandler; readonly readContext: (response: Response) => VerifiedRequestContext;
  readonly authorizer: Authorizer; readonly governance: JobGovernance;
}) {
  application.get("/api/jobs/admin/queues", options.authenticate, async (_request, response, next) => {
    try { const context=options.readContext(response); if(!await allowed(options.authorizer,context,"jobs.board.view")){response.status(403).json({error:"FORBIDDEN"});return;} response.status(200).json({entries:await options.governance.listQueues()}); } catch(error){next(error);}
  });
  application.get("/api/jobs/admin/executions", options.authenticate, async (request,response,next)=>{
    try { const context=options.readContext(response); if(!await allowed(options.authorizer,context,"jobs.board.view")){response.status(403).json({error:"FORBIDDEN"});return;} response.status(200).json({entries:await options.governance.listExecutions({execution:coordinate(context),limit:integer(request.query["limit"],50),...(request.query["cursor"]?{cursor:uuid(request.query["cursor"])}:{})})}); } catch(error){next(error);}
  });
  application.get("/api/jobs/admin/schedules",options.authenticate,async(_request,response,next)=>{
    try{const context=options.readContext(response);if(!await allowed(options.authorizer,context,"jobs.schedule.view")){response.status(403).json({error:"FORBIDDEN"});return;}response.status(200).json({entries:await options.governance.listSchedules(coordinate(context))});}catch(error){next(error);}
  });
  application.post("/api/jobs/admin/schedules/preview",options.authenticate,async(request,response,next)=>{
    try{const context=options.readContext(response);if(!await allowed(options.authorizer,context,"jobs.schedule.view")){response.status(403).json({error:"FORBIDDEN"});return;}const body=objectBody(request.body);response.status(200).json(options.governance.previewCron({expression:text(body,"expression"),timezone:text(body,"timezone"),...(body["from"]?{from:text(body,"from")} : {}),...(body["count"]?{count:Number(body["count"])}:{})}));}catch(error){next(error);}
  });
  application.post("/api/jobs/admin/schedules",options.authenticate,async(request,response,next)=>mutateSchedule("create",request,response,next,options));
  application.put("/api/jobs/admin/schedules/:id",options.authenticate,async(request,response,next)=>mutateSchedule("update",request,response,next,options));
  application.post("/api/jobs/admin/schedules/:id/deactivate",options.authenticate,async(request,response,next)=>{
    try{const context=options.readContext(response);if(!await allowed(options.authorizer,context,"jobs.schedule.manage")){response.status(403).json({error:"FORBIDDEN"});return;}await options.governance.deactivateSchedule({execution:coordinate(context),scheduleId:uuid(request.params["id"]),reason:requiredReason(request.body)});response.status(204).send();}catch(error){next(error);}
  });
  application.get("/api/jobs/admin/schedules/:id/audit",options.authenticate,async(request,response,next)=>{
    try{const context=options.readContext(response);if(!await allowed(options.authorizer,context,"jobs.schedule.view")){response.status(403).json({error:"FORBIDDEN"});return;}response.status(200).json({entries:await options.governance.listScheduleAudit({execution:coordinate(context),scheduleId:uuid(request.params["id"])})});}catch(error){next(error);}
  });
}

async function mutateSchedule(kind:"create"|"update",request:HttpRequest,response:Response,next:(error:unknown)=>void,options:{readContext:(response:Response)=>VerifiedRequestContext;authorizer:Authorizer;governance:JobGovernance}) {
  try{const context=options.readContext(response);if(!await allowed(options.authorizer,context,"jobs.schedule.manage")){response.status(403).json({error:"FORBIDDEN"});return;}const body=objectBody(request.body);const schedule=scheduleBody(body);const reason=text(body,"reason");const result=kind==="create"?await options.governance.createSchedule({execution:coordinate(context),schedule,reason}):await options.governance.updateSchedule({execution:coordinate(context),scheduleId:uuid(request.params["id"]),schedule,reason});response.status(kind==="create"?201:200).json(result);}catch(error){next(error);}
}

function scheduleBody(body:Record<string,unknown>):ScheduleMutation { return {code:text(body,"code"),name:text(body,"name"),handlerType:text(body,"handlerType"),cronExpression:text(body,"cronExpression"),timezone:text(body,"timezone"),targetQueue:text(body,"targetQueue"),payloadTemplate:objectBody(body["payloadTemplate"]??{})}; }
function objectBody(value:unknown):Record<string,unknown>{if(!value||typeof value!=="object"||Array.isArray(value))throw new TypeError("JSON object body required");return value as Record<string,unknown>;}
function text(body:Record<string,unknown>,field:string):string{const value=body[field];if(typeof value!=="string"||!value.trim())throw new TypeError(`${field} is required`);return value.trim();}

async function allowed(authorizer: Authorizer, context: VerifiedRequestContext, permissionCode: string) {
  return (await authorizer.authorize({ context, permissionCode })).allowed;
}

function coordinate(context: VerifiedRequestContext) {
  return {
    planeKey: context.planeKey,
    scope: "tenant" as const,
    tenantId: context.tenantId,
    principalId: context.principalId,
    correlationId: context.correlationId ?? context.requestId,
  };
}

function requiredReason(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("JSON object body required");
  const reason = (value as Record<string, unknown>)["reason"];
  if (typeof reason !== "string" || !reason.trim()) throw new TypeError("reason is required");
  return reason.trim().slice(0, 1_000);
}

function integer(value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 200) throw new TypeError("limit must be between 1 and 200");
  return parsed;
}

function uuid(value: unknown): string {
  const result = String(value ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) {
    throw new TypeError("Invalid execution id");
  }
  return result;
}
