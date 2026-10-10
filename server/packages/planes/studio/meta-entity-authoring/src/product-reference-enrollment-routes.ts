import express, {
  type Application,
  type RequestHandler,
  type Response,
} from "express";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import {
  AuthoringConflictError,
  AuthoringPolicyError,
  FoundationContractError,
  referenceUuid,
  validateFoundationNode,
} from "@athyper/server-contract-meta-entity-authoring";
import { parseIdempotencyKey } from "@athyper/server-contract-events";
import { ProductCommandCleanupError } from "./product-command-authority.js";
import {
  createProductReferenceEnrollment,
  type ProductReferenceCommand,
  type ProductNativeBootstrapCommand,
  type ProductReferenceEnrollmentOptions,
} from "./product-reference-enrollment.js";

export function parseProductReferenceEnrollmentRequest(
  id: string,
  body: unknown,
): ProductReferenceCommand {
  const invalid = (): never => {
    throw new FoundationContractError(
      "PRODUCT_REFERENCE_INPUT_INVALID",
      "/request",
    );
  };
  if (!body || typeof body !== "object" || Array.isArray(body))
    return invalid();
  const value = body as Record<string, unknown>;
  if (
    Object.keys(value).sort().join() !==
      "entityId,expectedRevision,expectedSourceHash,idempotencyKey" ||
    typeof value.entityId !== "string" ||
    typeof value.expectedSourceHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.expectedSourceHash) ||
    !Number.isSafeInteger(value.expectedRevision) ||
    (value.expectedRevision as number) < 0 ||
    !Number.isSafeInteger((value.expectedRevision as number) + 1) ||
    typeof value.idempotencyKey !== "string" ||
    !parseIdempotencyKey(value.idempotencyKey).ok
  )
    return invalid();
  validateFoundationNode(referenceUuid, id, "/changeSetId");
  validateFoundationNode(referenceUuid, value.entityId, "/entityId");
  return {
    changeSetId: id,
    entityId: value.entityId,
    expectedRevision: value.expectedRevision as number,
    expectedSourceHash: value.expectedSourceHash,
    idempotencyKey: value.idempotencyKey,
  };
}
export function parseProductNativeBootstrapRequest(
  id: string,
  body: unknown,
): ProductNativeBootstrapCommand {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new FoundationContractError(
      "PRODUCT_REFERENCE_INPUT_INVALID",
      "/request",
    );
  const value = body as Record<string, unknown>;
  if (
    Object.keys(value).sort().join() !==
      "entityId,idempotencyKey,proposalHash" ||
    typeof value.proposalHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.proposalHash) ||
    typeof value.idempotencyKey !== "string" ||
    !parseIdempotencyKey(value.idempotencyKey).ok
  )
    throw new FoundationContractError(
      "PRODUCT_REFERENCE_INPUT_INVALID",
      "/request",
    );
  validateFoundationNode(referenceUuid, id, "/changeSetId");
  validateFoundationNode(referenceUuid, value.entityId, "/entityId");
  return {
    changeSetId: id,
    entityId: value.entityId as string,
    proposalHash: value.proposalHash,
    idempotencyKey: value.idempotencyKey,
  };
}
/** Optional control-plane routes. Trusted resource resolution and restricted
 * database grants are prerequisites; route registration grants no authority. */
export function registerProductReferenceEnrollmentRoutes(
  app: Application,
  options: ProductReferenceEnrollmentOptions & {
    authenticate: RequestHandler;
    readContext(response: Response): VerifiedRequestContext;
  },
) {
  const service = createProductReferenceEnrollment(options);
  const handler =
    <T>(
      execute: (
        context: VerifiedRequestContext,
        command: T,
      ) => Promise<unknown>,
      parse: (id: string, body: unknown) => T,
    ): RequestHandler =>
    async (req, res, next) => {
      res.setHeader("Cache-Control", "private, no-store");
      try {
        if (Buffer.byteLength(JSON.stringify(req.body) ?? "") > 4096) {
          res.status(413).json({ code: "PRODUCT_REFERENCE_BODY_TOO_LARGE" });
          return;
        }
        if (Object.keys(req.query).length)
          throw new FoundationContractError(
            "PRODUCT_REFERENCE_INPUT_INVALID",
            "/query",
          );
        const command = parse(String(req.params.id), req.body);
        res.json(await execute(options.readContext(res), command));
      } catch (error) {
        if (error instanceof FoundationContractError) {
          res.status(400).json({ code: error.code, path: error.path });
          return;
        }
        if (error instanceof AuthoringConflictError) {
          res.status(409).json({ code: "PRODUCT_REFERENCE_CONFLICT" });
          return;
        }
        if (error instanceof AuthoringPolicyError) {
          res.status(403).json({ code: error.code });
          return;
        }
        if (error instanceof ProductCommandCleanupError) {
          res.status(503).json({ code: error.code, outcome: error.outcome });
          return;
        }
        next(error);
      }
    };
  if (options.nativeBootstrap) {
    app.post(
      "/api/platform-control/meta-entity-authoring/change-sets/:id/register-native-root",
      options.authenticate,
      express.json({ limit: 4096 }),
      handler(service.registerNativeRoot, parseProductNativeBootstrapRequest),
    );
    app.post(
      "/api/platform-control/meta-entity-authoring/change-sets/:id/bootstrap-native",
      options.authenticate,
      express.json({ limit: 4096 }),
      handler(service.bootstrapNative, parseProductNativeBootstrapRequest),
    );
  }
  if (options.nativeConversion)
    app.post(
      "/api/platform-control/meta-entity-authoring/change-sets/:id/convert-native",
      options.authenticate,
      express.json({ limit: 4096 }),
      handler(service.convertNative, parseProductReferenceEnrollmentRequest),
    );
  app.post(
    "/api/platform-control/meta-entity-authoring/change-sets/:id/initialize-ownership",
    options.authenticate,
    express.json({ limit: 4096 }),
    handler(
      service.initializeOwnership,
      parseProductReferenceEnrollmentRequest,
    ),
  );
  app.post(
    "/api/platform-control/meta-entity-authoring/change-sets/:id/install-identities",
    options.authenticate,
    express.json({ limit: 4096 }),
    handler(service.installIdentities, parseProductReferenceEnrollmentRequest),
  );
}
