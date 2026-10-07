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
    (execute: typeof service.initializeOwnership): RequestHandler =>
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
        const command = parseProductReferenceEnrollmentRequest(
          String(req.params.id),
          req.body,
        );
        res.json(await execute(options.readContext(res), command));
      } catch (error) {
        if (error instanceof FoundationContractError) {
          res.status(400).json({ code: error.code });
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
  app.post(
    "/api/platform-control/meta-entity-authoring/change-sets/:id/initialize-ownership",
    options.authenticate,
    express.json({ limit: 4096 }),
    handler(service.initializeOwnership),
  );
  app.post(
    "/api/platform-control/meta-entity-authoring/change-sets/:id/install-identities",
    options.authenticate,
    express.json({ limit: 4096 }),
    handler(service.installIdentities),
  );
}
