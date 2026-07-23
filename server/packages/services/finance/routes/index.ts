import type { Router } from "express";
import { createFinanceRoutes, type FinanceRouteDeps } from "./finance.route.js";
import { createApRoutes } from "./ap.route.js";
import { createBankRoutes } from "./bank.route.js";
import { createPeriodCloseRoutes } from "./period-close.route.js";
import { createJournalRoutes } from "./journal.route.js";
import { createAnalyticsRoutes } from "./analytics.route.js";
import { createReportsRoutes } from "./reports.route.js";
import { createIntakeRoutes } from "./intake.route.js";
import { createTaxonomyRoutes } from "./taxonomy.route.js";
import { createFinanceSetupRoutes } from "./finance-setup.route.js";
import { createFinanceFxSetupRoutes } from "./finance-fx-setup.route.js";
import { createFinanceTaxSetupRoutes } from "./finance-tax-setup.route.js";
import { createFinancePaymentsSetupRoutes } from "./finance-payments-setup.route.js";
import { createFinanceBankingSetupRoutes } from "./finance-banking-setup.route.js";

export function registerFinanceRoutes(router: Router, deps: FinanceRouteDeps): void {
  createFinanceRoutes(router, deps);
  createApRoutes(router, deps);
  createBankRoutes(router, deps);
  createPeriodCloseRoutes(router, deps);
  createJournalRoutes(router, deps);
  createAnalyticsRoutes(router, deps);
  createReportsRoutes(router, deps);
  createIntakeRoutes(router, deps);
  createTaxonomyRoutes(router, deps);
  createFinanceSetupRoutes(router, deps);
  createFinanceFxSetupRoutes(router, deps);
  createFinanceTaxSetupRoutes(router, deps);
  createFinancePaymentsSetupRoutes(router, deps);
  createFinanceBankingSetupRoutes(router, deps);
}
