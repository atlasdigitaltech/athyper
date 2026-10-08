import type { Application, RequestHandler } from "express";
import type { Authenticator } from "@athyper/server-contract-auth";
import {
  createIamAuthenticationMiddleware,
  readVerifiedRequestContext,
} from "@athyper/server-platform-iam";
import type { createControlResourceReview } from "./resource-review.js";
export function registerControlResourceReview(
  app: Application,
  options: {
    authenticator: Authenticator;
    service: ReturnType<typeof createControlResourceReview>;
  },
) {
  const route: RequestHandler = async (req, res, next) => {
    try {
      const body = req.body;
      if (
        Object.keys(req.query).length ||
        !body ||
        Array.isArray(body) ||
        Object.keys(body).sort().join() !== "action,expectedSourceHash" ||
        !["propose", "approve"].includes(body.action) ||
        typeof body.expectedSourceHash !== "string" ||
        !/^[a-f0-9]{64}$/.test(body.expectedSourceHash) ||
        !/^[a-f0-9-]{36}$/.test(String(req.params.id))
      ) {
        res.status(400).json({ code: "RESOURCE_REVIEW_COMMAND_INVALID" });
        return;
      }
      res.setHeader("Cache-Control", "private, no-store");
      res.json(
        await options.service.execute(readVerifiedRequestContext(res), {
          action: body.action,
          expectedSourceHash: body.expectedSourceHash,
          releaseId: String(req.params.id),
        }),
      );
    } catch (error) {
      next(error);
    }
  };
  app.post(
    "/api/platform-control/meta-entity-authoring/resources/:id/review",
    createIamAuthenticationMiddleware(options.authenticator),
    route,
  );
}
