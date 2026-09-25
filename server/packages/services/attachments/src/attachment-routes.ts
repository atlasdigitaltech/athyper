import { MalwareDocumentUnsupportedError } from "@athyper/server-contract-malware-scanning";
import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import type { ContentAclService } from "@athyper/server-contract-content";
import type { Application, Request, RequestHandler, Response } from "express";
import {
  AttachmentConflictError,
  AttachmentDownloadError,
  type AttachmentLifecycle,
} from "./attachment-lifecycle.js";
import { QuotaExceededError } from "./quota.js";

export interface AttachmentRouteOptions {
  readonly authorizeCapability?: (context: VerifiedRequestContext, action: string, input: Readonly<Record<string, unknown>>, mode?: { readonly preflight: boolean }) => Promise<{readonly admittedReleaseHash: string; readonly admittedPolicyHash: string; readonly entityType?: string; readonly entityId?: string; readonly commentId?: string} | undefined>;
  readonly authenticate: RequestHandler;
  readonly readContext: (response: Response) => VerifiedRequestContext;
  readonly authorizer: Authorizer;
  readonly attachments: AttachmentLifecycle;
  readonly maxUploadBytes: number;
  readonly contentAcl?: ContentAclService;
}

export function registerAttachmentRoutes(
  application: Application,
  options: AttachmentRouteOptions,
): void {
  application.get("/api/attachments/:attachmentId/archive",options.authenticate,async(request,response,next)=>{try{const context=options.readContext(response),attachmentId=uuidValue(String(request.params["attachmentId"]??""),"attachmentId");await admitAttachmentAction(options, request,context,"archive",{attachmentId},"delete",{attachmentId},false);if(!options.attachments.archiveOutcome)throw new Error("Attachment lifecycle does not support archive outcome");response.setHeader("Cache-Control","private, no-store");response.json(await options.attachments.archiveOutcome({planeKey:context.planeKey,tenantId:context.tenantId,principalId:context.principalId,attachmentId}));}catch(error){handle(error,response,next);}});
  application.post("/api/attachments/:attachmentId/archive",options.authenticate,async(request,response,next)=>{try{const context=options.readContext(response),attachmentId=uuidValue(String(request.params["attachmentId"]??""),"attachmentId"),idempotencyKey=requireIdempotencyKey(request);await admitAttachmentAction(options, request,context,"archive",{attachmentId,idempotencyKey},"delete",{attachmentId},false);if(!options.attachments.archive)throw new Error("Attachment lifecycle does not support archive");response.status(200).json(await options.attachments.archive({planeKey:context.planeKey,tenantId:context.tenantId,principalId:context.principalId,attachmentId},{idempotencyKey}));}catch(error){handle(error,response,next);}});
  application.post("/api/attachments/folders", options.authenticate, async (request, response, next) => { try {
    const context=options.readContext(response), value=body(request.body), command=text(value,"command",16) as "create" | "move" | "delete", owner=coordinate(value);
    // Folder management belongs to the same entity-scoped capability as the
    // file collection. Do not require the legacy global attachment-create ACL
    // after that capability has admitted the record and its parent scope.
    const expectedRevision=positiveInteger(value,"expectedRevision"), idempotencyKey=request.get?.("Idempotency-Key") ?? (typeof value["idempotencyKey"] === "string" ? value["idempotencyKey"] : "");
    await admitAttachmentAction(options, request,context,"folder",{...value,...owner,expectedRevision,idempotencyKey},"create",{resourceId:String(value["folderId"] ?? "")},false);
    if (!options.attachments.manageFolder) throw new Error("Attachment lifecycle does not support folders");
    const result=await options.attachments.manageFolder({planeKey:context.planeKey,tenantId:context.tenantId,principalId:context.principalId,attachmentId:value["attachmentId"]===undefined?"00000000-0000-4000-8000-000000000000":uuid(value,"attachmentId")},{command,entityType:owner.entityType!,entityId:owner.entityId!,folderId:command==="move" && value["folderId"]===null ? null : uuid(value,"folderId"),expectedRevision,idempotencyKey,...(value["name"] ? {name:text(value,"name",256)} : {}),...(value["parentFolderId"] ? {parentFolderId:uuid(value,"parentFolderId")} : {}),...(value["attachmentId"] ? {attachmentId:uuid(value,"attachmentId")} : {})});
    response.status(200).json(result);
  } catch(error){handle(error,response,next);} });
  application.post("/api/attachments/:attachmentId/category", options.authenticate, async (request,response,next)=>{try { const context=options.readContext(response), attachmentId=uuidValue(String(request.params["attachmentId"]??""),"attachmentId"), value=body(request.body), owner=coordinate(value), category=text(value,"category",32) as "general"|"evidence",idempotencyKey=requireIdempotencyKey(request); await admitAttachmentAction(options, request,context,"category",{...value,...owner,attachmentId,idempotencyKey},"create",{attachmentId,resourceId:attachmentId},false); if(!options.attachments.setCategory) throw new Error("Attachment lifecycle does not support categories"); await options.attachments.setCategory({planeKey:context.planeKey,tenantId:context.tenantId,principalId:context.principalId,attachmentId},{entityType:owner.entityType!,entityId:owner.entityId!,category,idempotencyKey}); response.status(204).end(); }catch(error){handle(error,response,next);}});
  application.post(
    "/api/attachments/stage",
    options.authenticate,
    async (request, response, next) => {
      try {
        const context = options.readContext(response),
          value = body(request.body);
        const attachmentId = uuid(value, "attachmentId"),
          fileName = text(value, "fileName", 1024),
          contentType = text(value, "contentType", 255),
          sizeBytes = integer(value, "sizeBytes");
        const owner = coordinate(value);
        const draftId = value["draftId"] === undefined ? undefined : uuid(value, "draftId");
        const parentAttachmentId = value["parentAttachmentId"] === undefined ? undefined : uuid(value, "parentAttachmentId");
        const expectedSeriesVersion = value["expectedSeriesVersion"] === undefined ? undefined : integer(value, "expectedSeriesVersion");
        const versioning = parentAttachmentId !== undefined;
        if (versioning && (expectedSeriesVersion === undefined || expectedSeriesVersion < 1 || value["duplicateNameChoice"] !== "new_version"))
          throw new RouteError(400, "ATTACHMENT_VERSION_INPUT_INVALID", "A version upload requires its current series version and an explicit new-version choice");
        if (!versioning && (expectedSeriesVersion !== undefined || value["duplicateNameChoice"] !== undefined))
          throw new RouteError(400, "ATTACHMENT_VERSION_INPUT_INVALID", "Version input requires a parent attachment");
        if (
          owner.entityType === "content.item" &&
          options.contentAcl &&
          !(await options.contentAcl.authorize({
            context,
            contentItemId: uuidValue(owner.entityId!, "entityId"),
            required: "write",
          }))
        ) {
          problem(
            response,
            403,
            "CONTENT_ACCESS_DENIED",
            "Content item write access is required",
          );
          return;
        }
        // Entity App attachments are admitted by the published entity capability.
        // Its parent scope (for example, the BP operating organization) is part of
        // that decision and is intentionally not reconstructed as an attachment-ID
        // resource check. Owners without a capability retain the legacy route gate.
        const admission = await admitAttachmentAction(
          options, request,
          context,
          versioning ? "version" : "create",
          { ...value, ...owner, ...(draftId ? { draftId } : {}) },
          "create",
          { attachmentId, resourceId: attachmentId },
          owner.entityType === "atlas.prompt",
        );
        if (sizeBytes < 1 || sizeBytes > options.maxUploadBytes) {
          problem(
            response,
            413,
            "ATTACHMENT_SIZE_EXCEEDED",
            `Attachment size must be between 1 and ${options.maxUploadBytes} bytes`,
          );
          return;
        }
        const staged = await options.attachments.stage({
          planeKey: context.planeKey,
          tenantId: context.tenantId,
          principalId: context.principalId,
          attachmentId,
          fileName,
          contentType,
          sizeBytes,
          ...owner,
          ...(draftId ? { draftId } : {}),
          ...(parentAttachmentId ? { parentAttachmentId, expectedSeriesVersion } : {}),
          ...admission,
        });
        response.setHeader("Cache-Control", "private, no-store");
        response.status(201).json({attachmentId:staged.attachmentId,uploadUrl:staged.uploadUrl,expiresAt:staged.expiresAt});
      } catch (error) {
        handle(error, response, next);
      }
    },
  );
  application.patch(
    "/api/attachments/:attachmentId",
    options.authenticate,
    async (request, response, next) => {
      try {
        const context = options.readContext(response), attachmentId = uuidValue(String(request.params["attachmentId"] ?? ""), "attachmentId"), value = body(request.body), idempotencyKey=requireIdempotencyKey(request);
        await admitAttachmentAction(options, request, context, "rename", { ...value, attachmentId },
          "create", { attachmentId, resourceId: attachmentId }, false);
        if (!options.attachments.rename) throw new Error("Attachment lifecycle does not support rename");
        const result = await options.attachments.rename({ planeKey: context.planeKey, tenantId: context.tenantId, principalId: context.principalId, attachmentId }, { displayName: text(value, "displayName", 1024), expectedSeriesRevision: text(value, "expectedSeriesRevision", 64), idempotencyKey });
        response.status(200).json({ attachmentId: result.id, seriesId: result.seriesId, displayName: value["displayName"] });
      } catch (error) { handle(error, response, next); }
    },
  );
  application.post(
    "/api/attachments/:attachmentId/finalize",
    options.authenticate,
    async (request, response, next) => {
      // A client that disconnects mid-finalize (navigated away, timed out its own request) has
      // no one left waiting on the download+scan stream — release it instead of running it to
      // completion for nobody. `response`'s "close" is the connection-terminated signal; `request`
      // "close" is documented to fire once the request stream ends, including after a normal
      // response completes, and would misfire here. `writableEnded` distinguishes a premature
      // close (the response was never finished) from an ordinary one.
      const abortOnDisconnect = new AbortController();
      const onResponseClose = () => {
        if (!response.writableEnded) {
          abortOnDisconnect.abort(
            new Error("Client disconnected before finalize completed"),
          );
        }
      };
      response.once("close", onResponseClose);
      try {
        const context = options.readContext(response),
          attachmentId = uuidValue(
            String(request.params["attachmentId"] ?? ""),
            "attachmentId",
          );
        const value = body(request.body);
        await admitAttachmentAction(
          options, request,
          context,
          "finalize",
          { attachmentId },
          "finalize",
          { attachmentId, resourceId: attachmentId },
          () => isAtlasAttachment(options, context, attachmentId),
        );
        const result = await options.attachments.finalize(
          {
            planeKey: context.planeKey,
            tenantId: context.tenantId,
            principalId: context.principalId,
            attachmentId,
          },
          text(value, "contentType", 255),
          { signal: abortOnDisconnect.signal, authorizeCommit: async () => {
            await admitAttachmentAction(options, request, context, "finalize", { attachmentId }, "finalize",
              { attachmentId, resourceId: attachmentId }, await isAtlasAttachment(options, context, attachmentId));
          } },
        );
        response
          .status(200)
          .json({ attachmentId: result.id, status: result.status });
      } catch (error) {
        handle(error, response, next);
      } finally {
        response.off("close", onResponseClose);
      }
    },
  );
  application.get(
    "/api/attachments/:attachmentId/status",
    options.authenticate,
    async (request, response, next) => {
      try {
        const context = options.readContext(response),
          attachmentId = uuidValue(
            String(request.params["attachmentId"] ?? ""),
            "attachmentId",
          );
        const admission = await admitAttachmentAction(
          options, request,
          context,
          "status",
          { attachmentId },
          "read",
          { attachmentId, resourceId: attachmentId },
          () => isAtlasAttachment(options, context, attachmentId),
        );
        const read = admission && options.attachments.authorizedStatus ? options.attachments.authorizedStatus : options.attachments.status;
        const result = await read({
          planeKey: context.planeKey,
          tenantId: context.tenantId,
          principalId: context.principalId,
          attachmentId,
        });
        response.json({
          attachmentId: result.id,
          status: result.status,
          extractionStatus: result.textExtractionStatus ?? null,
          ...(result.fileName ? { fileName: result.fileName } : {}),
          ...(result.contentType ? { contentType: result.contentType } : {}),
          ...(result.sizeBytes === undefined
            ? {}
            : { sizeBytes: result.sizeBytes }),
        });
      } catch (error) {
        handle(error, response, next);
      }
    },
  );
  application.post(
    "/api/attachments/:attachmentId/download",
    options.authenticate,
    async (request, response, next) => {
      try {
        const context = options.readContext(response),
          attachmentId = uuidValue(
            String(request.params["attachmentId"] ?? ""),
            "attachmentId",
          );
        const value = body(request.body ?? {}),
          ttl =
            value["expirySeconds"] === undefined
              ? 120
              : integer(value, "expirySeconds");
        await admitAttachmentAction(
          options, request,
          context,
          "download",
          { attachmentId },
          "download",
          { attachmentId, resourceId: attachmentId },
          false,
        );
        const result = await options.attachments.createAuthorizedDownload(
          {
            planeKey: context.planeKey,
            tenantId: context.tenantId,
            principalId: context.principalId,
            attachmentId,
          },
          ttl,
        );
        response.setHeader("Cache-Control", "private, no-store");
        response.setHeader("Pragma", "no-cache");
        response.status(200).json(result);
      } catch (error) {
        handle(error, response, next);
      }
    },
  );
  application.delete(
    "/api/attachments/:attachmentId",
    options.authenticate,
    async (request, response, next) => {
      try {
        const context = options.readContext(response),
          attachmentId = uuidValue(
            String(request.params["attachmentId"] ?? ""),
            "attachmentId",
          );
        const admission = await admitAttachmentAction(
          options, request,
          context,
          "unlink",
          { attachmentId },
          "delete",
          { attachmentId, resourceId: attachmentId },
          () => isAtlasAttachment(options, context, attachmentId),
        );
        if (admission?.entityType && admission.entityId) {
          if (!options.attachments.unlink)
            throw new Error("Attachment lifecycle does not support unlink");
          await options.attachments.unlink(
            {
              planeKey: context.planeKey,
              tenantId: context.tenantId,
              principalId: context.principalId,
              attachmentId,
            },
            { entityType: admission.entityType, entityId: admission.entityId },
          );
        } else await options.attachments.deactivate(
          {
            planeKey: context.planeKey,
            tenantId: context.tenantId,
            principalId: context.principalId,
            attachmentId,
          },
          "user_removed",
        );
        response.status(204).end();
      } catch (error) {
        handle(error, response, next);
      }
    },
  );
  application.post(
    "/api/content/items/:id/attachments/:attachmentId/versions",
    options.authenticate,
    async (request, response, next) => {
      try {
        const context = options.readContext(response),
          contentItemId = uuidValue(String(request.params["id"] ?? ""), "id"),
          parentAttachmentId = uuidValue(
            String(request.params["attachmentId"] ?? ""),
            "attachmentId",
          );
        await allowed(
          options.authorizer,
          context,
          "document.attachment.create",
          { contentItemId, parentAttachmentId },
        );
        if (
          options.contentAcl &&
          !(await options.contentAcl.authorize({
            context,
            contentItemId,
            required: "write",
          }))
        ) {
          problem(
            response,
            403,
            "CONTENT_ACCESS_DENIED",
            "Content item write access is required",
          );
          return;
        }
        const value = body(request.body),
          attachmentId = uuid(value, "newAttachmentId"),
          fileName = text(value, "fileName", 1024),
          contentType = text(value, "contentType", 255),
          sizeBytes = integer(value, "sizeBytes"),
          expectedSeriesVersion = integer(value, "expectedSeriesVersion");
        if (expectedSeriesVersion < 1) throw new RouteError(400, "ATTACHMENT_VERSION_INPUT_INVALID", "A positive current series version is required");
        if (sizeBytes < 1 || sizeBytes > options.maxUploadBytes) {
          problem(
            response,
            413,
            "ATTACHMENT_SIZE_EXCEEDED",
            `Attachment size must be between 1 and ${options.maxUploadBytes} bytes`,
          );
          return;
        }
        const staged = await options.attachments.stage({
          planeKey: context.planeKey,
          tenantId: context.tenantId,
          principalId: context.principalId,
          attachmentId,
          fileName,
          contentType,
          sizeBytes,
          parentAttachmentId,
          expectedSeriesVersion,
          entityType: "content.item",
          entityId: contentItemId,
        });
        response.status(201).json({attachmentId:staged.attachmentId,uploadUrl:staged.uploadUrl,expiresAt:staged.expiresAt});
      } catch (error) {
        handle(error, response, next);
      }
    },
  );
}
async function isAtlasAttachment(
  options: AttachmentRouteOptions,
  context: VerifiedRequestContext,
  attachmentId: string,
): Promise<boolean> {
  const record = await options.attachments.status({
    planeKey: context.planeKey,
    tenantId: context.tenantId,
    principalId: context.principalId,
    attachmentId,
  });
  return record.entityType === "atlas.prompt";
}
async function allowed(
  authorizer: Authorizer,
  context: VerifiedRequestContext,
  permissionCode: string,
  resource?: Readonly<Record<string, unknown>>,
): Promise<void> {
  if (
    !(
      await authorizer.authorize({
        context,
        permissionCode,
        ...(resource ? { resource } : {}),
      })
    ).allowed
  )
    throw new RouteError(
      403,
      "FORBIDDEN",
      `Missing permission: ${permissionCode}`,
    );
}
async function allowedAttachment(
  authorizer: Authorizer,
  context: VerifiedRequestContext,
  operation: "create" | "finalize" | "read" | "download" | "delete",
  resource: Readonly<Record<string, unknown>>,
  atlasPrompt: boolean,
): Promise<void> {
  const atlasDecision = atlasPrompt
    ? await authorizer.authorize({
        context,
        permissionCode: `${context.planeKey}.ai.agent.use`,
      })
    : undefined;
  if (atlasDecision?.allowed) return;
  const planeCode =
    context.planeKey === "neon"
      ? `neon.collaboration.attachment.${operation}`
      : context.planeKey === "mesh"
        ? `mesh.catalog.attachment.${operation}`
        : `studio.catalog.attachment.${operation}`;
  const candidates = [
    planeCode,
    `attachment.${operation}`,
    `document.attachment.${operation}`,
    ...(operation === "finalize"
      ? [
          planeCode.replace(/finalize$/, "create"),
          "attachment.create",
          "document.attachment.create",
        ]
      : []),
  ];
  for (const permissionCode of candidates)
    if (
      (await authorizer.authorize({ context, permissionCode, resource }))
        .allowed
    )
      return;
  if (atlasDecision?.reason === "mfa_required")
    throw new RouteError(
      403,
      "ATLAS_MFA_REQUIRED",
      "Atlas attachments require an elevated MFA session",
    );
  if (atlasPrompt && atlasDecision?.reason === "missing_permission")
    throw new RouteError(
      403,
      "ATLAS_PERMISSION_REQUIRED",
      `Missing permission: ${context.planeKey}.ai.agent.use`,
    );
  throw new RouteError(
    403,
    "FORBIDDEN",
    `Missing attachment ${operation} permission`,
  );
}

/**
 * Prefer an admitted entity capability when the attachment belongs to an Entity
 * App record. The shared attachment route cannot reproduce a parent's full
 * scope from an attachment ID alone. Dedicated content and Atlas owners return
 * no admission and continue through their existing permission boundary.
 */
async function admitAttachmentAction(
  options: AttachmentRouteOptions,
  request: Request,
  context: VerifiedRequestContext,
  action: string,
  input: Readonly<Record<string, unknown>>,
  legacyOperation: "create" | "finalize" | "read" | "download" | "delete",
  legacyResource: Readonly<Record<string, unknown>>,
  atlasPrompt: boolean | (() => Promise<boolean>),
) {
  // Relay transports idempotency in a header, while capability admission reads
  // command input. Preserve the same key through initial and commit admission.
  const idempotencyKey = request.get?.("Idempotency-Key");
  const admission = await options.authorizeCapability?.(context, action,
    idempotencyKey ? { ...input, idempotencyKey } : input,
    ...(request.method === "GET" && action === "archive" ? [{preflight:true}] as const : []));
  if (admission) return admission;
  await allowedAttachment(
    options.authorizer,
    context,
    legacyOperation,
    legacyResource,
    typeof atlasPrompt === "function" ? await atlasPrompt() : atlasPrompt,
  );
  return undefined;
}
function body(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new RouteError(400, "INVALID_BODY", "JSON object required");
  return value as Record<string, unknown>;
}
function requireIdempotencyKey(request: Request): string {
  const key = request.get?.("Idempotency-Key");
  if (typeof key !== "string" || !key.trim())
    throw new RouteError(400, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header is required");
  return key.trim();
}
function text(
  value: Record<string, unknown>,
  key: string,
  max: number,
): string {
  const item = value[key];
  if (typeof item !== "string" || !item.trim() || item.length > max)
    throw new RouteError(400, "INVALID_FIELD", `${key} is invalid`);
  return item.trim();
}
function integer(value: Record<string, unknown>, key: string): number {
  const item = value[key];
  if (!Number.isSafeInteger(item))
    throw new RouteError(400, "INVALID_FIELD", `${key} must be an integer`);
  return Number(item);
}
function uuid(value: Record<string, unknown>, key: string): string {
  return uuidValue(text(value, key, 36), key);
}
function uuidValue(value: string, key: string): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new RouteError(400, "INVALID_FIELD", `${key} must be a UUID`);
  return value;
}

function positiveInteger(value: Record<string, unknown>, key: string): number {
  const candidate=value[key];
  if (!Number.isSafeInteger(candidate) || Number(candidate) < 1) throw new TypeError(`${key} must be a positive integer`);
  return Number(candidate);
}
function coordinate(value: Record<string, unknown>): {
  entityType?: string;
  entityId?: string;
} {
  const entityType = value["entityType"],
    entityId = value["entityId"];
  if (entityType === undefined && entityId === undefined) return {};
  if (
    typeof entityType !== "string" ||
    !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)?$/.test(entityType) ||
    typeof entityId !== "string" ||
    !entityId.trim() ||
    entityId.length > 512
  )
    throw new RouteError(
      400,
      "INVALID_RESOURCE_COORDINATE",
      "entityType and entityId must form a valid coordinate",
    );
  return { entityType, entityId };
}
function problem(
  response: Response,
  status: number,
  code: string,
  detail: string,
): void {
  response
    .status(status)
    .type("application/problem+json")
    .json({
      type: `https://athyper.dev/problems/${code.toLowerCase()}`,
      title: code,
      status,
      detail,
      code,
    });
}
function handle(
  error: unknown,
  response: Response,
  next: (error?: unknown) => void,
): void {
  if (error instanceof Error && "code" in error && error.code === "ENTITY_CAPABILITY_DENIED") {
    problem(response,403,"ENTITY_CAPABILITY_DENIED","Entity capability is unavailable or not authorized");
  } else if (error instanceof MalwareDocumentUnsupportedError) {
    problem(response, 422, error.code, error.message);
  } else if (error instanceof QuotaExceededError) {
    response.setHeader("Retry-After", String(error.policy.retryAfterSeconds));
    response
      .status(429)
      .type("application/problem+json")
      .json({
        type: "https://athyper.dev/problems/attachment-storage-quota-exceeded",
        title: "Attachment storage quota exceeded",
        status: 429,
        detail: error.message,
        code: "ATTACHMENT_STORAGE_QUOTA_EXCEEDED",
        quotaKind: error.policy.kind,
        limitBytes: error.policy.limitBytes,
        ...error.usage,
        requestedBytes: error.requestedBytes,
        retryAfterSeconds: error.policy.retryAfterSeconds,
      });
  } else if (error instanceof AttachmentConflictError)
    problem(response, 409, error.code, error.message);
  else if (error instanceof AttachmentDownloadError)
    problem(response, 410, error.code, error.message);
  else if (error instanceof RouteError)
    problem(response, error.status, error.code, error.message);
  else if (error instanceof TypeError)
    problem(response, 400, "INVALID_ATTACHMENT", error.message);
  else if (error instanceof Error && error.message === "Attachment not found")
    problem(response, 404, "ATTACHMENT_NOT_FOUND", error.message);
  else if (
    error instanceof Error &&
    error.message === "Attachment was quarantined"
  )
    problem(response, 422, "ATTACHMENT_QUARANTINED", error.message);
  else next(error);
}
class RouteError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
