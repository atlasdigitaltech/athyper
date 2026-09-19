import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { RecordSnapshotService, SnapshotCaptureKind, SnapshotRetentionClass } from "@athyper/server-contract-records";
import { HttpError, defineRouteContract, registerContractRoute } from "@athyper/server-runtime-http";
import type { Application, Request, RequestHandler, Response } from "express";
import { sendMutation } from "../records-routes.js";
import { RecordServiceError } from "../errors.js";

export function registerRecordSnapshotRoutes(application: Application, options: { readonly authenticate: RequestHandler; readonly readContext: (response: Response) => VerifiedRequestContext; readonly authorizer: Authorizer; readonly snapshots: RecordSnapshotService }): void {
  const route = (
    permissionCode: string,
    resources: (request: Request, context: VerifiedRequestContext) => readonly Readonly<Record<string, unknown>>[],
    work: (request: Request, context: VerifiedRequestContext, response: Response, next: (error?: unknown) => void) => Promise<void>,
  ): RequestHandler => async (request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    try {
      const context = options.readContext(response);
      for (const resource of resources(request, context)) {
        if (!(await options.authorizer.authorize({ context, permissionCode, resource })).allowed) {
          throw new RecordServiceError(403, "FORBIDDEN", `Missing permission: ${permissionCode}`);
        }
      }
      await work(request, context, response, next);
    } catch (error) {
      next(error instanceof RecordServiceError ? new HttpError(error.statusCode, error.code, error.message) : error);
    }
  };
  const snapshotResource = (context: VerifiedRequestContext, id: unknown) => ({ tenantId: context.tenantId, resourceCode: "record.snapshot", recordId: uuid(id) });
  registerContractRoute(application, contracts.capture, options.authenticate, route("records.snapshot.capture",
    (request, context) => [{ tenantId: context.tenantId, resourceCode: required(request.params["entityCode"]), recordId: uuid(request.params["recordId"]) }],
    async (request, context, response) => { response.json(await options.snapshots.capture(context, required(request.params["entityCode"]), uuid(request.params["recordId"]), captureOptions(request.body))); }));
  registerContractRoute(application, contracts.query, options.authenticate, route("records.snapshot.read",
    (request, context) => [snapshotResource(context, request.params["snapshotId"])],
    async (request, context, response) => { response.json(await options.snapshots.query(context, uuid(request.params["snapshotId"]))); }));
  registerContractRoute(application, contracts.compare, options.authenticate, route("records.snapshot.read",
    (request, context) => [snapshotResource(context, request.params["fromSnapshotId"]), snapshotResource(context, request.params["toSnapshotId"])],
    async (request, context, response) => { response.json(await options.snapshots.compare(context, uuid(request.params["fromSnapshotId"]), uuid(request.params["toSnapshotId"]))); }));
  registerContractRoute(application, contracts.restore, options.authenticate, route("records.snapshot.restore",
    (request, context) => [snapshotResource(context, request.params["snapshotId"])],
    async (request, context, response, next) => {
      sendMutation(await options.snapshots.restore(context, uuid(request.params["snapshotId"]), integer(request.headers["if-match"]), idempotency(request.headers["idempotency-key"])), request, response, next);
    }));
}

const objectSchema = { type: "object", additionalProperties: true } as const;
const problemResponses = { 400: { description: "Invalid request" }, 403: { description: "Forbidden" }, 404: { description: "Not found" }, 409: { description: "Conflict" }, 422: { description: "Validation failed" }, 423: { description: "Record locked" }, 428: { description: "Precondition required" } } as const;
const contracts = {
  capture: defineRouteContract({ method: "post", path: "/api/records/:entityCode/:recordId/snapshots", operationId: "records.snapshots.capture", summary: "Capture a record snapshot", tags: ["Records"], authenticated: true, permission: "records.snapshot.capture", request: { body: objectSchema }, responses: { ...problemResponses, 200: { description: "Snapshot captured or replayed", body: objectSchema }, 401: { description: "Authentication required" }, 403: { description: "Forbidden" }, 409: { description: "Snapshot unavailable" } } }),
  query: defineRouteContract({ method: "get", path: "/api/record-snapshots/:snapshotId", operationId: "records.snapshots.get", summary: "Get a record snapshot", tags: ["Records"], authenticated: true, permission: "records.snapshot.read", responses: { ...problemResponses, 200: { description: "Record snapshot", body: objectSchema }, 401: { description: "Authentication required" }, 403: { description: "Forbidden" }, 404: { description: "Snapshot not found" } } }),
  compare: defineRouteContract({ method: "get", path: "/api/record-snapshots/:fromSnapshotId/compare/:toSnapshotId", operationId: "records.snapshots.compare", summary: "Compare record snapshots", tags: ["Records"], authenticated: true, permission: "records.snapshot.read", responses: { ...problemResponses, 200: { description: "Snapshot comparison", body: objectSchema }, 401: { description: "Authentication required" }, 403: { description: "Forbidden" }, 404: { description: "Snapshot not found" } } }),
  restore: defineRouteContract({ method: "post", path: "/api/record-snapshots/:snapshotId/restore", operationId: "records.snapshots.restore", summary: "Restore a record snapshot", tags: ["Records"], authenticated: true, permission: "records.snapshot.restore", request: { headers: { type: "object", properties: { "If-Match": { type: "string" }, "Idempotency-Key": { type: "string" } } } }, responses: { ...problemResponses, 200: { description: "Snapshot restored", body: objectSchema }, 401: { description: "Authentication required" }, 403: { description: "Forbidden" }, 404: { description: "Snapshot not found" }, 409: { description: "Restore conflict" }, 428: { description: "Precondition required" } } }),
} as const;

function captureOptions(value: unknown): NonNullable<Parameters<RecordSnapshotService["capture"]>[3]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RecordServiceError(400, "INVALID_BODY", "JSON object required");
  const body = value as Record<string, unknown>;
  const allowed = new Set(["captureEvent", "captureKind", "auditEventId", "validFrom", "validUntil", "retentionClass"]);
  for (const [key, item] of Object.entries(body)) {
    if (!allowed.has(key) || !text(item)) throw new RecordServiceError(400, "INVALID_CAPTURE_OPTIONS", `Invalid capture option: ${key}`);
  }
  const captureKind = text(body["captureKind"]);
  const retentionClass = text(body["retentionClass"]);
  if (captureKind && !["create", "version", "publish", "release", "submit", "approval", "commitment", "fulfillment", "financial_post", "amendment", "reversal", "withdrawal", "reconcile", "migration", "manual"].includes(captureKind)) throw new RecordServiceError(400, "INVALID_CAPTURE_KIND", "Unsupported capture kind");
  if (retentionClass && !["permanent", "legal", "financial", "operational", "standard", "temporary"].includes(retentionClass)) throw new RecordServiceError(400, "INVALID_RETENTION_CLASS", "Unsupported retention class");
  const captureEvent = text(body["captureEvent"]);
  if (captureEvent && !/^[a-z][a-z0-9_.:-]{1,126}$/.test(captureEvent)) throw new RecordServiceError(400, "INVALID_CAPTURE_EVENT", "Invalid capture event");
  const validFrom = timestamp(body["validFrom"]);
  const validUntil = timestamp(body["validUntil"]);
  if (validFrom && validUntil && Date.parse(validUntil) <= Date.parse(validFrom)) throw new RecordServiceError(400, "INVALID_VALIDITY_RANGE", "validUntil must be after validFrom");
  return {
    ...(captureEvent ? { captureEvent } : {}),
    ...(captureKind ? { captureKind: captureKind as SnapshotCaptureKind } : {}),
    ...(retentionClass ? { retentionClass: retentionClass as SnapshotRetentionClass } : {}),
    ...(body["auditEventId"] ? { auditEventId: uuid(body["auditEventId"]) } : {}),
    ...(validFrom ? { validFrom } : {}), ...(validUntil ? { validUntil } : {}),
  };
}
function timestamp(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const raw = text(value);
  if (!raw || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(raw) || !Number.isFinite(Date.parse(raw))) throw new RecordServiceError(400, "INVALID_TIMESTAMP", "An ISO timestamp with timezone is required");
  const calendar = raw.slice(0, 10);
  if (new Date(`${calendar}T00:00:00Z`).toISOString().slice(0, 10) !== calendar) throw new RecordServiceError(400, "INVALID_TIMESTAMP", "Invalid calendar date");
  return new Date(raw).toISOString();
}
function required(value: unknown): string { const result = text(value); if (!result) throw new RecordServiceError(400, "INVALID_ROUTE_PARAMETER", "Route parameter is required"); return result; }
function uuid(value: unknown): string { const result = required(value); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) throw new RecordServiceError(400, "INVALID_ID", "UUID required"); return result; }
function text(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function integer(value: string | string[] | undefined): number {
  const raw = typeof value === "string" ? value.trim() : "";
  const parsed = /^(?:[1-9][0-9]*|"[1-9][0-9]*")$/.test(raw) ? Number(raw.replaceAll('"', '')) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new RecordServiceError(428, "EXPECTED_VERSION_REQUIRED", "If-Match must contain a positive safe integer version");
  return parsed;
}
function idempotency(value: string | string[] | undefined): string {
  const result = typeof value === "string" ? value.trim() : undefined;
  if (!result || result.length < 16 || result.length > 128) throw new RecordServiceError(428, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key must contain 16-128 characters");
  return result;
}
