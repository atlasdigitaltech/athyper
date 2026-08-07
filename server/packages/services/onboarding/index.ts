import type { Router } from "express";
import type { Kysely } from "kysely";
import { PostgresOnboardingCaseRepository } from "./repositories/onboarding-case.repository.js";
import { registerOnboardingCaseRoutes } from "./routes/onboarding-case.routes.js";

export interface OnboardingRoutesDeps {
  db: Kysely<any>;
  auth: { verifyToken(token: string): Promise<Record<string, unknown>> };
  logger?: { error(event: string, fields?: Record<string, unknown>): void };
}

export function registerOnboardingRoutes(router: Router, deps: OnboardingRoutesDeps): void {
  registerOnboardingCaseRoutes(router, {
    repository: new PostgresOnboardingCaseRepository(deps.db),
    auth: deps.auth,
    logger: deps.logger,
  });
}

export * from "./contracts/onboarding-case.contract.js";
export * from "./repositories/onboarding-case.repository.js";
export * from "./routes/index.js";
