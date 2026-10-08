import type { Application, RequestHandler, Response } from "express";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import {
  AuthoringConflictError,
  AuthoringPolicyError,
} from "@athyper/server-contract-meta-entity-authoring";
import type {
  ProductReviewAction,
  ProductReviewCommand,
} from "./product-review.js";

/** Narrow native Entity authoring surface for a separately authenticated host.
 * Identical change-set coordinates; no alternate entity or publication stack. */
export function registerProductReviewRoutes(
  app: Application,
  options: {
    basePath: "/api/platform-control/meta-entity-authoring";
    authenticate: RequestHandler;
    readContext(response: Response): VerifiedRequestContext;
    inspect(context: VerifiedRequestContext, id: string): Promise<unknown>;
    execute(
      context: VerifiedRequestContext,
      id: string,
      action: ProductReviewAction,
      command: ProductReviewCommand,
    ): Promise<unknown>;
  },
) {
  const uuid =
    /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
  const route =
    (action?: ProductReviewAction): RequestHandler =>
    async (req, res, next) => {
      try {
        const id = String(req.params.id);
        if (!uuid.test(id) || Object.keys(req.query).length) {
          res.status(400).json({ code: "PRODUCT_REVIEW_INPUT_INVALID" });
          return;
        }
        const context = options.readContext(res);
        res.setHeader("Cache-Control", "private, no-store");
        if (!action) {
          res.json(await options.inspect(context, id));
          return;
        }
        const body = req.body as ProductReviewCommand;
        if (
          !body ||
          Array.isArray(body) ||
          Object.keys(body).sort().join() !==
            "expectedContractHash,expectedRevision,requestId" ||
          !uuid.test(body.requestId) ||
          !Number.isSafeInteger(body.expectedRevision) ||
          body.expectedRevision < 0 ||
          !/^[a-f0-9]{64}$/.test(body.expectedContractHash)
        ) {
          res.status(400).json({ code: "PRODUCT_REVIEW_INPUT_INVALID" });
          return;
        }
        res.json(await options.execute(context, id, action, body));
      } catch (error) {
        if (error instanceof AuthoringConflictError) {
          res.status(409).json({ code: "PRODUCT_REVIEW_CONFLICT" });
          return;
        }
        if (error instanceof AuthoringPolicyError) {
          res.status(403).json({ code: error.code });
          return;
        }
        next(error);
      }
    };
  // This host has one registered route prefix (also constrained by the options
  // type). Keep it statically discoverable by route/OpenAPI inventory tools.
  if (options.basePath !== "/api/platform-control/meta-entity-authoring")
    throw new Error("PRODUCT_REVIEW_ROUTE_PREFIX_INVALID");
  const base = "/api/platform-control/meta-entity-authoring/change-sets/:id";
  app.get(`${base}/graph`, options.authenticate, route());
  for (const action of ["submit", "approve"] as const)
    app.post(`${base}/${action}`, options.authenticate, route(action));
}
