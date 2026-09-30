import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { DocumentService } from "@athyper/server-contract-documents";
import type { Application, RequestHandler, Response } from "express";
import { DocumentError } from "./errors.js";

export interface DocumentRouteOptions {
  readonly authenticate: RequestHandler;
  readonly readContext: (response: Response) => VerifiedRequestContext;
  readonly documents: DocumentService;
}

export function registerDocumentRoutes(
  application: Application,
  options: DocumentRouteOptions,
): void {
  application.post(
    "/api/documents/render",
    options.authenticate,
    async (request, response, next) => {
      try {
        const value = body(request.body);
        if (["trustedJobId","exactTemplate","provenance"].some(k=>Object.hasOwn(value,k))) throw new DocumentError(400,"TRUSTED_SOURCE_NOT_CALLER_INPUT","Trusted document sources are selected by their owning service");
        const variant = optional(value, "variant");
        const locale = optional(value, "locale");
        const fileName = optional(value, "fileName");
        const idempotencyKey = header(request.headers["idempotency-key"]);
        const result = await options.documents.render({
          context: options.readContext(response),
          entityType: text(value, "entityType"),
          entityId: text(value, "entityId"),
          operationCode: text(value, "operationCode"),
          ...(variant ? { variant } : {}),
          ...(locale ? { locale } : {}),
          data: object(value["data"], "data"),
          ...(fileName ? { fileName } : {}),
          ...(idempotencyKey ? { idempotencyKey } : {}),
        });
        response.status(201).json(result);
      } catch (error) {
        handle(error, response, next);
      }
    },
  );
  application.post(
    "/api/documents/:documentId/download",
    options.authenticate,
    async (request, response, next) => {
      try {
        response.setHeader("Cache-Control", "no-store");
        response.status(200).json(
          await options.documents.createDownload({
            context: options.readContext(response),
            documentId: String(request.params["documentId"] ?? ""),
          }),
        );
      } catch (error) {
        handle(error, response, next);
      }
    },
  );
}
function body(value: unknown): Record<string, unknown> {
  return object(value, "body");
}
function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new DocumentError(400, "INVALID_BODY", `${name} must be an object`);
  return value as Record<string, unknown>;
}
function optional(
  value: Record<string, unknown>,
  key: string,
): string | undefined {
  const item = value[key];
  if (item === undefined) return undefined;
  if (typeof item !== "string" || !item.trim())
    throw new DocumentError(400, "INVALID_FIELD", `${key} must be a non-empty string`);
  return item.trim();
}
function text(value: Record<string, unknown>, key: string): string {
  const item = optional(value, key);
  if (!item)
    throw new DocumentError(400, "MISSING_FIELD", `${key} is required`);
  return item;
}
function header(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^[\x21-\x7e]{1,128}$/.test(value))
    throw new DocumentError(400, "INVALID_IDEMPOTENCY_KEY", "Idempotency key must be 1-128 visible ASCII characters");
  return value;
}
function handle(
  error: unknown,
  response: Response,
  next: (error?: unknown) => void,
): void {
  if (error instanceof DocumentError)
    response
      .status(error.statusCode)
      .json({ error: error.code, message: error.message });
  else next(error);
}
