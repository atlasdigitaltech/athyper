import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { createIamAuthenticationMiddleware, readVerifiedRequestContext } from "@athyper/server-platform-iam";
import type { ContactVerificationConfiguration } from "../config/contact-verification.js";
import type { Container } from "../kernel/container.js";

type Operation = "request" | "complete" | "verify";
type Target = { readonly operation: Operation; readonly id: string };
export interface ContactVerificationAdapter {
  /** Mandatory parent/resource authorization; never replaced with a permissive fallback. */
  authorize(context: VerifiedRequestContext, target: Target): Promise<boolean>;
  execute(context: VerifiedRequestContext, target: Target, input: unknown): Promise<unknown>;
}
export type ContactVerificationFactory = (configuration: Extract<ContactVerificationConfiguration, {status: "configured"}>) => ContactVerificationAdapter;

export function registerContactVerification(container: Container, configuration?: ContactVerificationConfiguration, factory?: ContactVerificationFactory): void {
  const iam = container.platform.iam;
  if (!iam) return;
  let adapter: ContactVerificationAdapter | undefined;
  let reason: string = configuration?.status === "configured" ? "ADAPTER_UNAVAILABLE" : configuration?.reason ?? "NOT_ENABLED";
  if (configuration?.status === "configured" && factory) {
    try {
      const candidate = factory(configuration);
      if (typeof candidate?.authorize !== "function" || typeof candidate?.execute !== "function") throw new Error();
      adapter = candidate;
    } catch { reason = "ADAPTER_INITIALIZATION_FAILED"; }
  }
  container.services.contactVerificationStatus = adapter ? { available: true } : { available: false, reason };
  if (!adapter) console.warn(JSON.stringify({ event: "contact_verification.unavailable", reason, coreReadinessAffected: false }));
  // Optional state deliberately does not register a failing core readiness probe.
  const service = adapter;
  container.platform.httpRegistrars.push(app => {
    const routes = [
      { method: "post", path: "/api/master/contacts/:id/verification-challenges", operation: "request" },
      { method: "post", path: "/api/master/verification-challenges/:id/complete", operation: "complete" },
      { method: "patch", path: "/api/master/contacts/:id/verification", operation: "verify" },
    ] as const;
    for (const route of routes) app[route.method](route.path, createIamAuthenticationMiddleware(iam), async (req, res, next) => {
      res.setHeader("Cache-Control", "no-store");
      try {
        const context = readVerifiedRequestContext(res);
        if (!service) { res.status(503).json({ code: "CONTACT_VERIFICATION_UNAVAILABLE" }); return; }
        const id = String(req.params.id);
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) { res.status(400).json({ code: "INVALID_CONTACT_VERIFICATION_TARGET" }); return; }
        const target = { operation: route.operation, id };
        if (!(await service.authorize(context, target))) { res.status(403).json({ code: "CONTACT_VERIFICATION_DENIED" }); return; }
        const result = await service.execute(context, target, req.body);
        res.status(route.operation === "request" ? 202 : 200).json(result);
      } catch (error) { next(error); }
    });
  });
}
