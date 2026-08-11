import type {
  AddressValue,
  OwnerCoordinate,
  SignedProviderEvidence,
} from "@athyper/server-contract-master-data";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { Application, NextFunction, Request, RequestHandler, Response } from "express";
import { MasterDataError } from "./errors.js";
import type { MasterDataServices } from "./services.js";

export interface MasterDataRouteOptions {
  readonly authenticate: RequestHandler;
  readonly readContext: (response: Response) => VerifiedRequestContext;
  readonly services: MasterDataServices;
}

export function registerMasterDataRoutes(app: Application, options: MasterDataRouteOptions): void {
  const route = (work: (request: Request, context: VerifiedRequestContext) => Promise<unknown>): RequestHandler =>
    async (request, response, next) => {
      try {
        const result = await work(request, options.readContext(response));
        if (result === undefined) response.status(204).end();
        else response.json(result);
      } catch (error) {
        handleMasterDataError(error, response, next);
      }
    };

  app.get("/api/master/owners/:entityCode/:ownerTypeId/:ownerId/profile", options.authenticate, route(async (request, context) =>
    options.services.ownerProfile.get({
      context,
      owner: readOwner(request.params),
      asOf: optionalText(request.query.asOf),
    })));
  app.post("/api/master/owners/:entityCode/:ownerTypeId/:ownerId/contacts", options.authenticate, route(async (request, context) => {
    const body = readBody(request);
    return options.services.contacts.create({
      context,
      owner: readOwner(request.params),
      channelType: readEnum(body.channelType, ["email", "phone", "fax", "sms", "whatsapp", "website"] as const),
      value: requiredText(body, "value"),
      purpose: optionalText(body.purpose),
      roleQualifier: optionalText(body.roleQualifier),
      isPrimary: optionalBoolean(body.isPrimary),
      effectiveFrom: optionalText(body.effectiveFrom),
    });
  }));
  app.patch("/api/master/contacts/:contactId/verification", options.authenticate, route(async (request, context) => {
    const body = readBody(request);
    return options.services.contacts.changeVerification({
      context,
      contactId: requiredPath(request.params.contactId, "contactId"),
      verified: requiredBoolean(body.verified),
      evidence: readEvidence(body.evidence),
    });
  }));
  app.post("/api/master/contacts/:contactId/deactivate", options.authenticate, route(async (request, context) =>
    options.services.contacts.deactivate({
      context,
      contactId: requiredPath(request.params.contactId, "contactId"),
      effectiveUntil: optionalText(readBody(request).effectiveUntil),
    })));
  app.post("/api/master/owners/:entityCode/:ownerTypeId/:ownerId/addresses", options.authenticate, route(async (request, context) => {
    const body = readBody(request);
    return options.services.addresses.create({
      context,
      owner: readOwner(request.params),
      address: readAddress(body.address),
      purpose: optionalText(body.purpose),
      roleQualifier: optionalText(body.roleQualifier),
      attentionLine: optionalText(body.attentionLine),
      isPrimary: optionalBoolean(body.isPrimary),
      effectiveFrom: optionalText(body.effectiveFrom),
    });
  }));
  app.post("/api/master/addresses/:addressLinkId/deactivate", options.authenticate, route(async (request, context) =>
    options.services.addresses.deactivate({
      context,
      addressLinkId: requiredPath(request.params.addressLinkId, "addressLinkId"),
      effectiveUntil: optionalText(readBody(request).effectiveUntil),
    })));
}

function handleMasterDataError(error: unknown, response: Response, next: NextFunction): void {
  if (!(error instanceof MasterDataError)) {
    if (error instanceof TypeError) {
      response.status(400).type("application/problem+json").json({
        type: "https://athyper.dev/problems/invalid-master-data-request",
        title: "INVALID_MASTER_DATA_REQUEST",
        status: 400,
        detail: error.message,
      });
      return;
    }
    next(error);
    return;
  }
  response.status(error.status).type("application/problem+json").json({
    type: `https://athyper.dev/problems/${error.code.toLowerCase()}`,
    title: error.code,
    status: error.status,
    detail: error.message,
    code: error.code,
  });
}

function readOwner(params: Request["params"]): OwnerCoordinate {
  return {
    entityCode: requiredPath(params.entityCode, "entityCode"),
    ownerTypeId: requiredPath(params.ownerTypeId, "ownerTypeId"),
    ownerId: requiredPath(params.ownerId, "ownerId"),
  };
}

function readBody(request: Request): Record<string, unknown> {
  if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) throw new TypeError("JSON object required");
  return request.body as Record<string, unknown>;
}

function requiredPath(value: unknown, name: string): string {
  const result = optionalText(value);
  if (!result) throw new TypeError(`${name} is required`);
  return result;
}

function requiredText(value: Record<string, unknown>, key: string): string {
  return requiredPath(value[key], key);
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requiredBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new TypeError("Boolean required");
  return value;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return value === undefined ? undefined : requiredBoolean(value);
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new TypeError(`Expected one of: ${allowed.join(", ")}`);
  return value as T;
}

function readAddress(value: unknown): AddressValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("address must be an object");
  return value as AddressValue;
}

function readEvidence(value: unknown): SignedProviderEvidence {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("evidence must be an object");
  const evidence = value as Record<string, unknown>;
  return {
    provider: requiredText(evidence, "provider"),
    evidenceId: requiredText(evidence, "evidenceId"),
    issuedAt: requiredText(evidence, "issuedAt"),
    expiresAt: optionalText(evidence.expiresAt),
    payloadHash: requiredText(evidence, "payloadHash"),
    signature: requiredText(evidence, "signature"),
    keyId: requiredText(evidence, "keyId"),
  };
}
