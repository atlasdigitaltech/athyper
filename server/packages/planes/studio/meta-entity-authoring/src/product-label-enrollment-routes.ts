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
} from "@athyper/server-contract-meta-entity-authoring";
import { ProductCommandCleanupError } from "./product-command-authority.js";
import { createProductLabelEnrollment } from "./product-label-enrollment.js";

type Command = Parameters<ReturnType<typeof createProductLabelEnrollment>>[1];
const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const keys = (
  value: Record<string, unknown>,
  required: string[],
  optional: string[] = [],
) =>
  required.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every(
    (key) => required.includes(key) || optional.includes(key),
  );

/** Transport shape only. Semantic source, locale, command-budget and ownership
 * validation remain in the canonical repository, inside admitted transactions. */
export function parseProductLabelEnrollmentRequest(
  id: string,
  body: unknown,
): Command {
  const invalid = (): never => {
    throw new FoundationContractError(
      "PRODUCT_LABEL_INPUT_INVALID",
      "/request",
    );
  };
  if (
    !uuid.test(id) ||
    !object(body) ||
    !keys(body, ["proposal"]) ||
    !object(body.proposal)
  )
    return invalid();
  const p = body.proposal;
  if (
    !keys(
      p,
      [
        "sourceHash",
        "revision",
        "idempotencyKey",
        "defaultLocale",
        "requiredLocales",
      ],
      ["declarations"],
    ) ||
    typeof p.sourceHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(p.sourceHash) ||
    !Number.isSafeInteger(p.revision) ||
    (p.revision as number) < 0 ||
    typeof p.idempotencyKey !== "string" ||
    !p.idempotencyKey.length ||
    typeof p.defaultLocale !== "string" ||
    !p.defaultLocale.length ||
    !Array.isArray(p.requiredLocales) ||
    !p.requiredLocales.every((v) => typeof v === "string" && v.length > 0)
  )
    return invalid();
  if (
    p.declarations !== undefined &&
    (!Array.isArray(p.declarations) ||
      !p.declarations.every(
        (d) =>
          object(d) &&
          keys(d, ["sourcePath", "labelKey", "defaultText"], ["values"]) &&
          typeof d.sourcePath === "string" &&
          typeof d.labelKey === "string" &&
          typeof d.defaultText === "string" &&
          (d.values === undefined ||
            (object(d.values) &&
              Object.values(d.values).every((v) => typeof v === "string"))),
      ))
  )
    return invalid();
  return {
    changeSetId: id,
    proposal: structuredClone(p) as Command["proposal"],
  };
}

/** Opt-in authenticated control-host transport. Construction requires the actual
 * canonical writer dependencies; registering the route installs no DB authority,
 * authoring host, permission binding or human publication approval. */
export function registerProductLabelEnrollmentRoutes(
  app: Application,
  options: Parameters<typeof createProductLabelEnrollment>[0] & {
    authenticate: RequestHandler;
    readContext(response: Response): VerifiedRequestContext;
  },
) {
  if (
    !Number.isSafeInteger(options.labels.maxBatchBytes) ||
    options.labels.maxBatchBytes < 1
  )
    throw Error("PRODUCT_LABEL_BODY_LIMIT_REQUIRED");
  const execute = createProductLabelEnrollment(options);
  app.post(
    "/api/platform-control/meta-entity-authoring/change-sets/:id/enroll-labels",
    options.authenticate,
    express.json({ limit: options.labels.maxBatchBytes }),
    async (req, res, next) => {
      res.setHeader("Cache-Control", "private, no-store");
      try {
        if (
          Buffer.byteLength(JSON.stringify(req.body) ?? "") >
          options.labels.maxBatchBytes
        ) {
          res.status(413).json({ code: "PRODUCT_LABEL_BODY_TOO_LARGE" });
          return;
        }
        if (Object.keys(req.query).length)
          throw new FoundationContractError(
            "PRODUCT_LABEL_INPUT_INVALID",
            "/query",
          );
        const command = parseProductLabelEnrollmentRequest(
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
          res.status(409).json({ code: "PRODUCT_LABEL_CONFLICT" });
          return;
        }
        if (error instanceof AuthoringPolicyError) {
          res.status(403).json({ code: error.code });
          return;
        }
        if (error instanceof ProductCommandCleanupError) {
          // A committed result must never be represented as a rollback. Retrying
          // uses the same idempotency key through fresh authorization.
          res.status(503).json({ code: error.code, outcome: error.outcome });
          return;
        }
        next(error);
      }
    },
  );
}
