import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type {
  Application,
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";
import type { createWorkerEngagementLifecycleService } from "./worker-engagement-lifecycle-service.js";
import { MasterDataError } from "./errors.js";
type Service = ReturnType<typeof createWorkerEngagementLifecycleService>;
export function registerWorkerEngagementLifecycleRoutes(
  app: Application,
  o: {
    authenticate: RequestHandler;
    readContext: (r: Response) => VerifiedRequestContext;
    service: Service;
  },
) {
  const route =
    (
      work: (q: Request, c: VerifiedRequestContext) => Promise<any>,
    ): RequestHandler =>
    async (q, r, n) => {
      r.setHeader("Cache-Control", "private, no-store");
      try {
        const value = await work(q, o.readContext(r));
        r.status(value.replayed ? 200 : 201).json(value);
      } catch (e) {
        if (e instanceof MasterDataError)
          r.status(e.status).type("application/problem+json").json({
            title: e.code,
            status: e.status,
            detail: e.message,
            code: e.code,
          });
        else n(e);
      }
    };
  app.post(
    "/api/neon/supplier-workforce/engagements/:workerEngagementId/placements",
    o.authenticate,
    route((q, c) => {
      const b = object(q.body);
      return o.service.activatePlacement({
        context: c,
        workerEngagementId: uuid(q.params["workerEngagementId"]),
        ...placement(b),
      });
    }),
  );
  app.post(
    "/api/neon/supplier-workforce/engagements/:workerEngagementId/termination",
    o.authenticate,
    route((q, c) => {
      const b = object(q.body);
      return o.service.endEngagement({
        context: c,
        workerEngagementId: uuid(q.params["workerEngagementId"]),
        expectedVersion: integer(b["expectedVersion"]),
        idempotencyKey: text(b["idempotencyKey"]),
        reasonCode: text(b["reasonCode"]),
        effectiveAt: text(b["effectiveAt"]),
      });
    }),
  );
}
function placement(b: Record<string, unknown>) {
  return {
    expectedVersion: integer(b["expectedVersion"]),
    idempotencyKey: text(b["idempotencyKey"]),
    effectiveFrom: text(b["effectiveFrom"]),
    ...(b["effectiveUntil"]
      ? { effectiveUntil: text(b["effectiveUntil"]) }
      : {}),
    companyCodeId: uuid(b["companyCodeId"]),
    ...optionalUuid(b, "positionId"),
    ...optionalUuid(b, "orgUnitId"),
    ...optionalUuid(b, "managerEmployeeId"),
    ...optionalUuid(b, "costCenterId"),
    ...optionalUuid(b, "profitCenterId"),
    ...optionalUuid(b, "projectId"),
    ...optionalUuid(b, "siteId"),
    ...(b["allocationPercent"] !== undefined
      ? { allocationPercent: Number(b["allocationPercent"]) }
      : {}),
    ...(b["isPrimary"] !== undefined
      ? { isPrimary: boolean(b["isPrimary"], "isPrimary") }
      : {}),
    metadata: object(b["metadata"] ?? {}),
  };
}
function optionalUuid(b: Record<string, unknown>, k: string) {
  return b[k] ? { [k]: uuid(b[k]) } : {};
}
function object(v: unknown) {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw bad("JSON object required");
  return v as Record<string, unknown>;
}
function text(v: unknown) {
  const x = String(v ?? "");
  if (!x) throw bad("Required value is missing");
  return x;
}
function integer(v: unknown) {
  const x = Number(v);
  if (!Number.isSafeInteger(x) || x < 1)
    throw bad("Expected a positive integer");
  return x;
}
function boolean(v: unknown, name: string) {
  if (typeof v !== "boolean") throw bad(`${name} must be boolean`);
  return v;
}
function uuid(v: unknown) {
  const x = text(v);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      x,
    )
  )
    throw bad("Expected a UUID");
  return x;
}
function bad(m: string) {
  return new MasterDataError(400, "WORKER_ENGAGEMENT_LIFECYCLE_INVALID", m);
}
