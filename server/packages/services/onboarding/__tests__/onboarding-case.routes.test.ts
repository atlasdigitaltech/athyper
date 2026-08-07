import { describe, expect, it, vi } from "vitest";
import { registerOnboardingCaseRoutes } from "../routes/onboarding-case.routes.js";
import type { OnboardingCaseRepository } from "../repositories/onboarding-case.repository.js";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const PRINCIPAL = "33333333-3333-4333-8333-333333333333";
const CASE_ID = "44444444-4444-4444-8444-444444444444";
const CASE = {
  id: CASE_ID, tenantId: TENANT_A, caseCode: "neon-free", targetProductCode: "neon",
  status: "draft", decisionStatus: "pending", sourceOnboardingMode: "self_service",
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
};

function harness(repository: OnboardingCaseRepository) {
  const routes = new Map<string, Function>();
  const router = {
    get: vi.fn((path: string, handler: Function) => routes.set(`GET ${path}`, handler)),
    patch: vi.fn((path: string, handler: Function) => routes.set(`PATCH ${path}`, handler)),
  };
  registerOnboardingCaseRoutes(router as never, {
    repository,
    auth: { verifyToken: vi.fn(async () => ({ tenant_id: TENANT_A, principal_id: PRINCIPAL })) },
  });
  return routes;
}

function response() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  res.setHeader = vi.fn(() => res);
  return res;
}

function repository(overrides: Partial<OnboardingCaseRepository> = {}): OnboardingCaseRepository {
  return {
    findForGuest: vi.fn(async () => null),
    findForPrincipal: vi.fn(async () => null),
    advanceStatus: vi.fn(async () => null),
    ...overrides,
  };
}

describe("onboarding case isolation boundary", () => {
  it("allows a valid guest token to read only its case", async () => {
    const repo = repository({ findForGuest: vi.fn(async () => CASE) });
    const handler = harness(repo).get("GET /onboarding/public/cases/:caseId")!;
    const res = response();
    await handler({ params: { caseId: CASE_ID }, headers: { "x-tenant-id": TENANT_A, "x-onboarding-access-token": "valid" } }, res);
    expect(res.json).toHaveBeenCalledWith({ case: CASE });
  });

  it("denies a wrong tenant or token without revealing the case", async () => {
    const repo = repository();
    const handler = harness(repo).get("GET /onboarding/public/cases/:caseId")!;
    const res = response();
    await handler({ params: { caseId: CASE_ID }, headers: { "x-tenant-id": TENANT_B, "x-onboarding-access-token": "wrong" } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it.each(["expired", "revoked"])("denies a %s guest token", async (token) => {
    const handler = harness(repository()).get("GET /onboarding/public/cases/:caseId")!;
    const res = response();
    await handler({ params: { caseId: CASE_ID }, headers: { "x-tenant-id": TENANT_A, "x-onboarding-access-token": token } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("allows a normal tenant principal to read", async () => {
    const repo = repository({ findForPrincipal: vi.fn(async () => CASE) });
    const handler = harness(repo).get("GET /onboarding/cases/:caseId")!;
    const res = response();
    await handler({ params: { caseId: CASE_ID }, headers: { authorization: "Bearer jwt" } }, res);
    expect(repo.findForPrincipal).toHaveBeenCalledWith({ tenantId: TENANT_A, principalId: PRINCIPAL }, CASE_ID);
    expect(res.json).toHaveBeenCalledWith({ case: CASE });
  });

  it("does not expose a guest mutation route", () => {
    const routes = harness(repository());
    expect(routes.has("PATCH /onboarding/public/cases/:caseId/status")).toBe(false);
    expect(routes.has("PATCH /onboarding/cases/:caseId/status")).toBe(true);
  });
});
