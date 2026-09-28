import type { Application, RequestHandler, Response } from "express";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { defineRouteContract, HttpError, registerContractRoute } from "@athyper/server-runtime-http";
import type { createPublicationPolicyEnrollment } from "./policy-enrollment.js";

export function registerPublicationPolicyEnrollmentRoutes(app: Application, options: {
  authenticate: RequestHandler;
  readContext(response: Response): VerifiedRequestContext;
  service: ReturnType<typeof createPublicationPolicyEnrollment>;
}) {
  for (const action of ["propose", "activate"] as const) {
    registerContractRoute(app, defineRouteContract({ method: "post",
      path: `/api/studio/publication-policies${action === "activate" ? "/:id/activate" : ""}`,
      operationId: `studio.publication_policy.${action}`, summary: `${action} an exact DEV publication policy`, tags: ["Studio"], authenticated: true,
      responses: { 200: { description: "Persisted policy pin", body: { type: "object", additionalProperties: true } },
        403: { description: "Authorization or separation denied" }, 409: { description: "Policy state changed" } },
    }), options.authenticate, async (req, res, next) => {
      try {
        res.setHeader("Cache-Control", "private, no-store");
        if (Object.keys(req.query).length || !req.body || typeof req.body !== "object" || Array.isArray(req.body))
          throw new HttpError(400, "PUBLICATION_POLICY_INPUT_INVALID", "Expected a policy document");
        if (action === "activate" && (Object.keys(req.body).length !== 1 || typeof req.body.expectedHash !== "string"))
          throw new HttpError(400, "PUBLICATION_POLICY_INPUT_INVALID", "An exact expectedHash is required");
        const context = options.readContext(res);
        res.json(action === "propose" ? await options.service.propose(context, req.body)
          : await options.service.activate(context, String(req.params.id), req.body.expectedHash));
      } catch (error) {
        if (error instanceof HttpError) return next(error);
        const code = error instanceof Error ? error.message : "PUBLICATION_POLICY_ENROLLMENT_FAILED";
        if (/FORBIDDEN|INDEPENDENT_ACTOR|MAKER_CHECKER|ACTOR_REVOKED|STUDIO_REQUIRED|PLATFORM_AUTHORITY_/.test(code))
          return next(new HttpError(403, "PUBLICATION_POLICY_ENROLLMENT_DENIED", "Enrollment authority was denied"));
        if (/ALREADY_EXISTS|PIN_MISMATCH|HASH_CONFLICT|APPROVAL_REQUIRED|ENTITY_SUCCESSOR_.*CHANGED|COMPILATION_RECOVERY_.*(CHANGED|UNAVAILABLE|ACTIVE|EXPIRED)/.test(code))
          return next(new HttpError(409, "PUBLICATION_POLICY_ENROLLMENT_CONFLICT", "Reload the policy revision before retrying"));
        if (/REFERENCE_ONBOARDING_|ENROLLMENT_PIN_INVALID|PUBLICATION_POLICY_SCHEMA_INVALID|ENTITY_SUCCESSOR_|COMPILATION_RECOVERY_/.test(code))
          return next(new HttpError(422, "PUBLICATION_POLICY_INPUT_INVALID", "Invalid versioned publication policy"));
        next(error);
      }
    });
  }
}
