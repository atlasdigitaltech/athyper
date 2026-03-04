/**
 * Commission Engine — Commission Service
 *
 * Orchestrates commission lifecycle: calculate, accrue, settle, clawback,
 * and statement generation.
 */

import { ok, fail } from "../../shared/engine-base.js";
import { calculateForPlan } from "../domain/plan-calculator.js";
import { CommissionStatus } from "../domain/types.js";

import type { Container } from "../../../../../kernel/container.js";
import type {
  ServiceResult,
  OperationContext,
} from "../../shared/engine-base.js";
import type {
  CommissionCalculation,
  CommissionStatement,
  CalculateCommissionInput,
  AccrueCommissionInput,
  SettleCommissionInput,
  ClawbackCommissionInput,
  GenerateStatementInput,
} from "../domain/types.js";
import type { CommissionAssignmentRepo } from "../persistence/assignment-repo.js";
import type { CommissionCalculationRepo } from "../persistence/calculation-repo.js";
import type { CommissionPlanRepo } from "../persistence/plan-repo.js";
import type { CommissionStatementRepo } from "../persistence/statement-repo.js";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface CommissionService {
  calculateCommission(
    ctx: OperationContext,
    input: CalculateCommissionInput,
  ): Promise<ServiceResult<CommissionCalculation>>;

  accrueCommission(
    ctx: OperationContext,
    input: AccrueCommissionInput,
  ): Promise<ServiceResult<CommissionCalculation>>;

  settleCommission(
    ctx: OperationContext,
    input: SettleCommissionInput,
  ): Promise<ServiceResult<CommissionCalculation>>;

  clawbackCommission(
    ctx: OperationContext,
    input: ClawbackCommissionInput,
  ): Promise<ServiceResult<CommissionCalculation>>;

  generateStatement(
    ctx: OperationContext,
    input: GenerateStatementInput,
  ): Promise<ServiceResult<CommissionStatement>>;
}

// ---------------------------------------------------------------------------
// Default Implementation
// ---------------------------------------------------------------------------

export class DefaultCommissionService implements CommissionService {
  private readonly planRepo: CommissionPlanRepo;
  private readonly assignmentRepo: CommissionAssignmentRepo;
  private readonly calculationRepo: CommissionCalculationRepo;
  private readonly statementRepo: CommissionStatementRepo;

  constructor(
    private readonly container: Container,
    deps: {
      planRepo: CommissionPlanRepo;
      assignmentRepo: CommissionAssignmentRepo;
      calculationRepo: CommissionCalculationRepo;
      statementRepo: CommissionStatementRepo;
    },
  ) {
    this.planRepo = deps.planRepo;
    this.assignmentRepo = deps.assignmentRepo;
    this.calculationRepo = deps.calculationRepo;
    this.statementRepo = deps.statementRepo;
  }

  // -------------------------------------------------------------------------
  // calculateCommission
  // -------------------------------------------------------------------------

  async calculateCommission(
    ctx: OperationContext,
    input: CalculateCommissionInput,
  ): Promise<ServiceResult<CommissionCalculation>> {
    // 1. Load the plan
    const plan = await this.planRepo.findById(input.planId);
    if (!plan) {
      return fail("COMMISSION_PLAN_NOT_FOUND", `Plan ${input.planId} not found`);
    }

    if (!plan.isActive) {
      return fail("COMMISSION_PLAN_INACTIVE", `Plan ${plan.code} is not active`);
    }

    // 2. Verify plan is effective as of today
    const today = new Date();
    if (plan.effectiveFrom > today) {
      return fail(
        "COMMISSION_PLAN_NOT_YET_EFFECTIVE",
        `Plan ${plan.code} is not effective until ${plan.effectiveFrom.toISOString()}`,
      );
    }
    if (plan.effectiveTo && plan.effectiveTo < today) {
      return fail(
        "COMMISSION_PLAN_EXPIRED",
        `Plan ${plan.code} expired on ${plan.effectiveTo.toISOString()}`,
      );
    }

    // 3. Look up the assignment to determine split percentage
    const assignments = await this.assignmentRepo.findEffectiveAssignments(
      input.tenantId,
      input.partnerId,
      today,
    );
    const assignment = assignments.find((a) => a.planId === input.planId);
    const splitPctNum = assignment ? parseFloat(assignment.splitPct) : 100.0;

    // 4. Calculate commission using the plan calculator
    let result;
    try {
      result = calculateForPlan(plan, input.baseAmount);
    } catch (err) {
      return fail(
        "COMMISSION_CALCULATION_ERROR",
        `Calculation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // 5. Apply split percentage
    const adjustedAmount =
      Math.round(result.commissionAmount * (splitPctNum / 100) * 10_000) / 10_000;

    // 6. Persist the calculation record
    const calculation = await this.calculationRepo.create({
      tenantId: input.tenantId,
      entityCode: input.entityCode,
      partnerId: input.partnerId,
      planId: input.planId,
      txnId: input.txnId,
      docId: input.docId,
      baseAmount: String(input.baseAmount),
      commissionRate: String(result.effectiveRate),
      commissionAmount: String(adjustedAmount),
      currencyCode: input.currencyCode ?? "USD",
      splitPct: String(splitPctNum),
    });

    return ok(calculation);
  }

  // -------------------------------------------------------------------------
  // accrueCommission
  // -------------------------------------------------------------------------

  async accrueCommission(
    ctx: OperationContext,
    input: AccrueCommissionInput,
  ): Promise<ServiceResult<CommissionCalculation>> {
    const calc = await this.calculationRepo.findById(input.calculationId);
    if (!calc) {
      return fail(
        "COMMISSION_CALCULATION_NOT_FOUND",
        `Calculation ${input.calculationId} not found`,
      );
    }

    if (calc.status !== CommissionStatus.CALCULATED) {
      return fail(
        "INVALID_STATUS_TRANSITION",
        `Cannot accrue commission in status ${calc.status}; expected CALCULATED`,
      );
    }

    const updated = await this.calculationRepo.updateStatus(calc.id, {
      status: CommissionStatus.ACCRUED,
      accrualJeId: input.accrualJeId,
    });

    return ok(updated);
  }

  // -------------------------------------------------------------------------
  // settleCommission
  // -------------------------------------------------------------------------

  async settleCommission(
    ctx: OperationContext,
    input: SettleCommissionInput,
  ): Promise<ServiceResult<CommissionCalculation>> {
    const calc = await this.calculationRepo.findById(input.calculationId);
    if (!calc) {
      return fail(
        "COMMISSION_CALCULATION_NOT_FOUND",
        `Calculation ${input.calculationId} not found`,
      );
    }

    // Settlement requires the calculation to be in APPROVED status
    if (calc.status !== CommissionStatus.APPROVED) {
      return fail(
        "INVALID_STATUS_TRANSITION",
        `Cannot settle commission in status ${calc.status}; expected APPROVED`,
      );
    }

    const updated = await this.calculationRepo.updateStatus(calc.id, {
      status: CommissionStatus.SETTLED,
      settlementJeId: input.settlementJeId,
    });

    return ok(updated);
  }

  // -------------------------------------------------------------------------
  // clawbackCommission
  // -------------------------------------------------------------------------

  async clawbackCommission(
    ctx: OperationContext,
    input: ClawbackCommissionInput,
  ): Promise<ServiceResult<CommissionCalculation>> {
    const calc = await this.calculationRepo.findById(input.calculationId);
    if (!calc) {
      return fail(
        "COMMISSION_CALCULATION_NOT_FOUND",
        `Calculation ${input.calculationId} not found`,
      );
    }

    // Clawback is valid from ACCRUED, APPROVED, or SETTLED statuses
    const clawbackAllowed = [
      CommissionStatus.ACCRUED,
      CommissionStatus.APPROVED,
      CommissionStatus.SETTLED,
    ];
    if (!clawbackAllowed.includes(calc.status)) {
      return fail(
        "INVALID_STATUS_TRANSITION",
        `Cannot claw back commission in status ${calc.status}; expected one of ${clawbackAllowed.join(", ")}`,
      );
    }

    // Verify clawback window if the plan has one
    const plan = await this.planRepo.findById(calc.planId);
    if (plan && plan.clawbackWindowDays > 0 && calc.calculatedAt) {
      const windowEnd = new Date(calc.calculatedAt);
      windowEnd.setDate(windowEnd.getDate() + plan.clawbackWindowDays);
      if (new Date() > windowEnd) {
        return fail(
          "CLAWBACK_WINDOW_EXPIRED",
          `Clawback window of ${plan.clawbackWindowDays} days has expired for calculation ${calc.id}`,
        );
      }
    }

    const updated = await this.calculationRepo.updateStatus(calc.id, {
      status: CommissionStatus.CLAWED_BACK,
      clawbackJeId: input.clawbackJeId,
      clawbackReason: input.reason,
    });

    return ok(updated);
  }

  // -------------------------------------------------------------------------
  // generateStatement
  // -------------------------------------------------------------------------

  async generateStatement(
    ctx: OperationContext,
    input: GenerateStatementInput,
  ): Promise<ServiceResult<CommissionStatement>> {
    const currencyCode = input.currencyCode ?? "USD";

    // 1. Fetch all calculations for the partner in the given period
    const calculations = await this.calculationRepo.findByPartnerAndPeriod(
      input.tenantId,
      input.partnerId,
      input.periodStart,
      input.periodEnd,
    );

    // 2. Aggregate totals by status
    let totalCalculated = 0;
    let totalAccrued = 0;
    let totalSettled = 0;
    let totalClawedBack = 0;

    for (const calc of calculations) {
      const amt = parseFloat(calc.commissionAmount);
      switch (calc.status) {
        case CommissionStatus.CALCULATED:
          totalCalculated += amt;
          break;
        case CommissionStatus.ACCRUED:
          totalAccrued += amt;
          break;
        case CommissionStatus.APPROVED:
          // Approved counts toward accrued for statement purposes
          totalAccrued += amt;
          break;
        case CommissionStatus.SETTLED:
          totalSettled += amt;
          break;
        case CommissionStatus.CLAWED_BACK:
          totalClawedBack += amt;
          break;
      }
    }

    const netPayable =
      Math.round(
        (totalCalculated + totalAccrued + totalSettled - totalClawedBack) *
          10_000,
      ) / 10_000;

    // 3. Check if a statement already exists for this period
    const existing = await this.statementRepo.findByPartnerAndPeriod(
      input.tenantId,
      input.partnerId,
      input.periodStart,
      input.periodEnd,
    );

    if (existing) {
      // Update existing statement totals
      const updated = await this.statementRepo.updateTotals(existing.id, {
        totalCalculated: String(round4(totalCalculated)),
        totalAccrued: String(round4(totalAccrued)),
        totalSettled: String(round4(totalSettled)),
        totalClawedBack: String(round4(totalClawedBack)),
        netPayable: String(round4(netPayable)),
      });
      return ok(updated);
    }

    // 4. Create new statement
    const statement = await this.statementRepo.create({
      tenantId: input.tenantId,
      entityCode: input.entityCode,
      partnerId: input.partnerId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      totalCalculated: String(round4(totalCalculated)),
      totalAccrued: String(round4(totalAccrued)),
      totalSettled: String(round4(totalSettled)),
      totalClawedBack: String(round4(totalClawedBack)),
      netPayable: String(round4(netPayable)),
      currencyCode,
    });

    return ok(statement);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
