import type { ActivityDateRange } from "@athyper/contract-platform-entity-runtime";
import { withReadEvidence } from "@athyper/server-foundation/context";
import {
  defineRouteContract,
  registerContractRoute,
} from "@athyper/server-runtime-http";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type {
  Application,
  Request,
  Response,
  RequestHandler,
  NextFunction,
} from "express";
import { EntityCapabilityPolicyError } from "./entity-capability-policy.js";
import {
  EntityActivityError,
  type createEntityActivityService,
} from "./entity-activity-service.js";

export function registerEntityActivityRoutes(
  app: Application,
  options: {
    authenticate: RequestHandler;
    readContext(response: Response): VerifiedRequestContext;
    service: ReturnType<typeof createEntityActivityService>;
  },
) {
  const subject = (request: Request, response: Response) => ({
    context: options.readContext(response),
    entityCode: String(request.params.entityCode ?? ""),
    recordId: String(request.params.recordId ?? ""),
  });
  function register(
    method: "get" | "post",
    suffix: string,
    work: (req: Request, res: Response) => Promise<unknown>,
  ) {
    registerContractRoute(
      app,
      defineRouteContract({
        method,
        path: `/api/entity-runtime/:entityCode/records/:recordId/activity${suffix}`,
        operationId: `entityActivity.${method}.${suffix.replace(/[^a-z]/g, "") || "describe"}`,
        summary: "Authorized record Activity",
        authenticated: true,
        responses: {
          200: { description: "Authorized Activity projection" },
          403: { description: "Denied" },
          409: { description: "Incompatible snapshot or command" },
        },
      }),
      options.authenticate,
      async (req: Request, res: Response, next: NextFunction) => {
        res.setHeader("Cache-Control", "private, no-store");
        try {
          const result = await (method === "get" || suffix === "/compare"
            ? withReadEvidence(() => work(req, res)) : work(req, res));
          if (result === null) {
            res.status(403).json({ code: "ACTIVITY_DENIED" });
            return;
          }
          res.json(result);
        } catch (error) {
          if (error instanceof EntityActivityError) {
            res.status(error.status).json({ code: error.code });
            return;
          }
          if (error instanceof EntityCapabilityPolicyError) {
            res.status(403).json({ code: "ACTIVITY_DENIED" });
            return;
          }
          next(error);
        }
      },
    );
  }
  register("get", "", (req, res) =>
    options.service.describe(subject(req, res)),
  );
  for (const [path, view] of [
    ["/timeline", "timeline"],
    ["/audit", "auditLog"],
    ["/versions", "versions"],
    ["/snapshots", "snapshots"],
  ] as const)
    register("get", path, (req, res) => {
      if (
        Object.keys(req.query).some(
          (key) => !["days", "cursor", "period", "timeZone", "startDate", "endDate", ...(["auditLog","timeline"].includes(view)?["event","actor","outcome"]:[])].includes(key),
        ) ||
        (req.query.days !== undefined &&
          (typeof req.query.days !== "string" ||
            !/^\d{1,3}$/.test(req.query.days))) ||
        (req.query.cursor !== undefined && typeof req.query.cursor !== "string")
      )
        throw new EntityActivityError(400, "ACTIVITY_INPUT_INVALID");
      if(["event","actor","outcome","period","timeZone","startDate","endDate"].some(key=>req.query[key]!==undefined && typeof req.query[key]!=="string"))throw new EntityActivityError(400,"ACTIVITY_INPUT_INVALID");
      if (!req.query.period && ["timeZone","startDate","endDate"].some(key=>req.query[key]!==undefined)) throw new EntityActivityError(400,"ACTIVITY_INPUT_INVALID");
      return options.service.page({
        ...subject(req, res),
        view,
        ...(req.query.period ? {range:{period:String(req.query.period),timeZone:String(req.query.timeZone??""),...(req.query.startDate!==undefined?{startDate:String(req.query.startDate)}:{}),...(req.query.endDate!==undefined?{endDate:String(req.query.endDate)}:{})} as ActivityDateRange}:{}),
        filters:Object.fromEntries(["event","actor","outcome"].filter(key=>req.query[key]!==undefined).map(key=>[key,String(req.query[key])])),
        ...(req.query.days ? { days: Number(req.query.days) } : {}),
        ...(req.query.cursor ? { cursor: String(req.query.cursor) } : {}),
      });
    });
  register("get", "/snapshots/:snapshotId", (req, res) =>
    options.service.snapshot({
      ...subject(req, res),
      id: String(req.params.snapshotId),
    }),
  );
  register("post", "/snapshots", (req, res) => {
    if (
      req.body &&
      (typeof req.body !== "object" ||
        Array.isArray(req.body) ||
        Object.keys(req.body).length)
    )
      throw new EntityActivityError(400, "ACTIVITY_INPUT_INVALID");
    return options.service.capture({
      ...subject(req, res),
      idempotencyKey: req.header("Idempotency-Key") ?? "",
    });
  });
  register("post", "/compare", (req, res) => {
    const body = req.body;
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).sort().join() !== "from,to" ||
      typeof body.from !== "string" ||
      typeof body.to !== "string"
    )
      throw new EntityActivityError(400, "ACTIVITY_INPUT_INVALID");
    return options.service.compare({
      ...subject(req, res),
      from: body.from,
      to: body.to,
    });
  });
  register("get", "/snapshots/:snapshotId/collections/:collectionKey", (req,res)=>{
    if(Object.keys(req.query).some(key=>key!=="cursor") || (req.query.cursor!==undefined && typeof req.query.cursor!=="string")) throw new EntityActivityError(400,"ACTIVITY_INPUT_INVALID");
    return options.service.collection({...subject(req,res),id:String(req.params.snapshotId),key:String(req.params.collectionKey),...(req.query.cursor ? {cursor:String(req.query.cursor)} : {})});
  });
  register("post", "/compare/collections/:collectionKey", (req,res)=>{
    const body=req.body;
    if(Object.keys(req.query).length || !body || typeof body!=="object" || Array.isArray(body) || Object.keys(body).some(key=>!["from","to","cursor"].includes(key)) || typeof body.from!=="string" || typeof body.to!=="string" || (body.cursor!==undefined && typeof body.cursor!=="string")) throw new EntityActivityError(400,"ACTIVITY_INPUT_INVALID");
    return options.service.compareCollection({...subject(req,res),key:String(req.params.collectionKey),from:body.from,to:body.to,...(body.cursor ? {cursor:body.cursor} : {})});
  });

}
