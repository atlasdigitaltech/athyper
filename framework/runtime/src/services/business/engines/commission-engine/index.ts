/**
 * Commission Engine — RuntimeModule entry point
 *
 * Registers all commission engine services into the DI container
 * and re-exports public types.
 */

import { DefaultCommissionAssignmentRepo } from "./persistence/assignment-repo.js";
import { DefaultCommissionCalculationRepo } from "./persistence/calculation-repo.js";
import { DefaultCommissionPlanRepo } from "./persistence/plan-repo.js";
import { DefaultCommissionStatementRepo } from "./persistence/statement-repo.js";
import { DefaultCommissionService } from "./services/commission-service.js";

import type { CommissionAssignmentRepo } from "./persistence/assignment-repo.js";
import type { CommissionCalculationRepo } from "./persistence/calculation-repo.js";
import type { CommissionPlanRepo } from "./persistence/plan-repo.js";
import type { CommissionStatementRepo } from "./persistence/statement-repo.js";
import type { Container } from "../../../../kernel/container.js";
import type { RuntimeModule } from "../../../types.js";

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export * from "./domain/types.js";
export { calculateForPlan } from "./domain/plan-calculator.js";

export type { CommissionPlanRepo } from "./persistence/plan-repo.js";
export type { CommissionAssignmentRepo } from "./persistence/assignment-repo.js";
export type { CommissionCalculationRepo } from "./persistence/calculation-repo.js";
export type { CommissionStatementRepo } from "./persistence/statement-repo.js";
export type { CommissionService } from "./services/commission-service.js";

// ---------------------------------------------------------------------------
// RuntimeModule
// ---------------------------------------------------------------------------

export const commissionEngineModule: RuntimeModule = {
  name: "commissionEngine",

  register(container: Container) {
    // Persistence
    container.register(
      "commissionPlanRepo",
      () => new DefaultCommissionPlanRepo(container),
    );
    container.register(
      "commissionAssignmentRepo",
      () => new DefaultCommissionAssignmentRepo(container),
    );
    container.register(
      "commissionCalculationRepo",
      () => new DefaultCommissionCalculationRepo(container),
    );
    container.register(
      "commissionStatementRepo",
      () => new DefaultCommissionStatementRepo(container),
    );

    // Service
    container.register(
      "commissionService",
      async () =>
        new DefaultCommissionService(container, {
          planRepo:
            await container.resolve<CommissionPlanRepo>("commissionPlanRepo"),
          assignmentRepo: await container.resolve<CommissionAssignmentRepo>(
            "commissionAssignmentRepo",
          ),
          calculationRepo: await container.resolve<CommissionCalculationRepo>(
            "commissionCalculationRepo",
          ),
          statementRepo: await container.resolve<CommissionStatementRepo>(
            "commissionStatementRepo",
          ),
        }),
    );
  },

  contribute() {
    // No cross-module contributions required at this stage.
    // Future: register commission-related health checks, event handlers, etc.
  },
};
