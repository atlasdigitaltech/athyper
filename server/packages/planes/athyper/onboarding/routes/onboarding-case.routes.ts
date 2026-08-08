import type { Request, Router } from "express";
import { isUuid, verifyBearerToken } from "@athyper/svc-shared/route-helpers";
import {
  ONBOARDING_CASE_STATUSES,
  type OnboardingPrincipalContext,
} from "../contracts/onboarding-case.contract.js";
import type { OnboardingCaseRepository } from "../repositories/onboarding-case.repository.js";

export interface OnboardingCaseRouteDeps {
  repository: OnboardingCaseRepository;
  auth: { verifyToken(token: string): Promise<Record<string, unknown>> };
  logger?: { error(event: string, fields?: Record<string, unknown>): void };
}

function header(req: Request, name: string): string {
  const value = req.headers[name];
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? "" : "";
}

function principalContext(claims: Record<string, unknown>): OnboardingPrincipalContext | null {
  const tenantId = claims.tenant_id ?? claims.tenantId;
  const principalId = claims.principal_id ?? claims.principalId;
  if (typeof tenantId !== "string" || !isUuid(tenantId)) return null;
  if (typeof principalId !== "string" || !isUuid(principalId)) return null;
  return { tenantId, principalId };
}

export function registerOnboardingCaseRoutes(router: Router, deps: OnboardingCaseRouteDeps): void {
  router.get("/onboarding/public/cases/:caseId", async (req, res) => {
    const caseId = req.params.caseId ?? "";
    const tenantId = header(req, "x-tenant-id");
    const accessToken = header(req, "x-onboarding-access-token");
    if (!isUuid(caseId) || !isUuid(tenantId) || !accessToken) {
      return res.status(400).json({ error: "INVALID_ONBOARDING_ACCESS" });
    }

    try {
      const item = await deps.repository.findForGuest(tenantId, caseId, accessToken);
      if (!item) return res.status(404).json({ error: "ONBOARDING_CASE_NOT_FOUND" });
      res.setHeader("Cache-Control", "no-store");
      return res.json({ case: item });
    } catch (error) {
      deps.logger?.error("onboarding.public_case_read_failed", { error: String(error) });
      return res.status(500).json({ error: "ONBOARDING_READ_FAILED" });
    }
  });

  router.get("/onboarding/cases/:caseId", async (req, res) => {
    const verified = await verifyBearerToken(req.headers.authorization ?? "", deps.auth);
    if (!verified.ok) return res.status(verified.status).json({ error: verified.code });
    const context = principalContext(verified.claims);
    const caseId = req.params.caseId ?? "";
    if (!context) return res.status(403).json({ error: "ONBOARDING_CONTEXT_REQUIRED" });
    if (!isUuid(caseId)) return res.status(400).json({ error: "INVALID_CASE_ID" });

    const item = await deps.repository.findForPrincipal(context, caseId);
    if (!item) return res.status(404).json({ error: "ONBOARDING_CASE_NOT_FOUND" });
    return res.json({ case: item });
  });

  router.patch("/onboarding/cases/:caseId/status", async (req, res) => {
    const verified = await verifyBearerToken(req.headers.authorization ?? "", deps.auth);
    if (!verified.ok) return res.status(verified.status).json({ error: verified.code });
    const context = principalContext(verified.claims);
    const caseId = req.params.caseId ?? "";
    const nextStatus = typeof req.body?.status === "string" ? req.body.status : "";
    const reason = typeof req.body?.reason === "string" ? req.body.reason : undefined;
    if (!context) return res.status(403).json({ error: "ONBOARDING_CONTEXT_REQUIRED" });
    if (!isUuid(caseId) || !ONBOARDING_CASE_STATUSES.has(nextStatus)) {
      return res.status(400).json({ error: "INVALID_STATUS_CHANGE" });
    }

    const item = await deps.repository.advanceStatus(context, caseId, nextStatus, reason);
    if (!item) return res.status(404).json({ error: "ONBOARDING_CASE_NOT_FOUND" });
    return res.json({ case: item });
  });
}
