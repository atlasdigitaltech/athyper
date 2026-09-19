import type { Application } from "express";
import type { MasterDataRouteOptions } from "./master-data-routes.js";
import type { createLocalContactChallenges } from "./local-contact-challenge.js";
import { MasterDataError } from "./errors.js";
export function registerLocalContactChallengeRoutes(app: Application, options: Pick<MasterDataRouteOptions, "authenticate" | "readContext">,
  service: ReturnType<typeof createLocalContactChallenges>) {
  for (const operation of ["request", "complete"] as const) {
    const path = operation === "request" ? "/api/master/contacts/:contactId/verification-challenges" : "/api/master/verification-challenges/:challengeId/complete";
    app.post(path, options.authenticate, async (req, res, next) => {
      res.setHeader("Cache-Control", "no-store");
      try {
        const context = options.readContext(res);
        const id = operation === "request" ? req.params.contactId : req.params.challengeId;
        if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new MasterDataError(422, "INVALID_INPUT", "Invalid identifier");
        if (operation === "request") res.status(202).json(await service.request(context, id));
        else {
          if (typeof req.body?.token !== "string" || req.body.token.length > 100) throw new MasterDataError(422, "INVALID_INPUT", "Invalid token");
          res.json(await service.complete(context, id, req.body.token));
        }
      } catch (error) {
        if (error instanceof MasterDataError) {
          if (error.status === 429) res.setHeader("Retry-After", "600");
          res.status(error.status).json({ code: error.code, message: error.message });
        }
        else next(error);
      }
    });
  }
}
