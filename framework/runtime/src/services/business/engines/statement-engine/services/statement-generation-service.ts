// framework/runtime/src/services/business/engines/statement-engine/services/statement-generation-service.ts
//
// Core service: generates financial statement instances from definitions + GL data.
// Pure rendering logic — takes definition metadata, resolves accounts,
// computes calculations, and produces an immutable snapshot.

import { ok, fail } from "../../shared/engine-base.js";

import type {
  ServiceResult,
  OperationContext,
} from "../../shared/engine-base.js";
import type {
  StatementDefinition,
  StatementLine,
  StatementInstance,
  StatementInstanceLine,
  GenerateStatementInput,
  ResolvedAccountBalance,
  CalculationStep,
  AccountBreakdownEntry,
  InstanceStatus,
} from "../domain/types.js";
import type {
  StatementDefinitionRepo,
  StatementInstanceRepo,
  AccountResolutionRepo,
} from "../persistence/statement-repo.js";

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface StatementGenerationService {
  /** Generate a new statement instance from a definition */
  generate(
    ctx: OperationContext,
    input: GenerateStatementInput,
  ): Promise<ServiceResult<StatementInstance>>;

  /** Get a statement instance with computed lines */
  getInstance(
    tenantId: string,
    instanceId: string,
  ): Promise<ServiceResult<{
    instance: StatementInstance;
    lines: StatementInstanceLine[];
  }>>;

  /** List available statement definitions */
  listDefinitions(
    tenantId: string,
    entityCode: string,
    statementType?: string,
  ): Promise<StatementDefinition[]>;

  /** Transition instance status (DRAFT → REVIEWED → APPROVED → FINALIZED) */
  updateStatus(
    ctx: OperationContext,
    instanceId: string,
    targetStatus: InstanceStatus,
  ): Promise<ServiceResult<StatementInstance>>;
}

// ---------------------------------------------------------------------------
// Default implementation
// ---------------------------------------------------------------------------

export class DefaultStatementGenerationService
  implements StatementGenerationService
{
  constructor(
    private readonly defRepo: StatementDefinitionRepo,
    private readonly instanceRepo: StatementInstanceRepo,
    private readonly acctRepo: AccountResolutionRepo,
  ) {}

  async generate(
    ctx: OperationContext,
    input: GenerateStatementInput,
  ): Promise<ServiceResult<StatementInstance>> {
    const startTime = Date.now();

    // ── 1. Load definition ──────────────────────────────────────
    const definition = await this.defRepo.getById(
      input.tenantId,
      input.definitionId,
    );
    if (!definition) {
      return fail("DEFINITION_NOT_FOUND", `Statement definition ${input.definitionId} not found`);
    }
    if (!definition.isActive) {
      return fail("DEFINITION_INACTIVE", `Statement definition ${definition.definitionCode} is inactive`);
    }

    // ── 2. Validate book code ───────────────────────────────────
    const bookCode = input.bookCode ?? "STAT";
    if (definition.bookCodes && !definition.bookCodes.includes(bookCode)) {
      return fail(
        "INVALID_BOOK",
        `Book ${bookCode} is not configured for statement ${definition.definitionCode}. ` +
        `Allowed: ${definition.bookCodes.join(", ")}`,
      );
    }

    // ── 3. Load line definitions ────────────────────────────────
    const lines = await this.defRepo.getLines(definition.id);
    if (lines.length === 0) {
      return fail("NO_LINES", "Statement definition has no line items");
    }

    // ── 4. Resolve accounts → GL balances ───────────────────────
    const accountBalances = await this.acctRepo.resolveAccounts(
      input.tenantId,
      input.entityCode,
      definition.id,
      input.fiscalYear,
      input.periodFrom,
      input.periodTo,
      bookCode,
      input.dimensionSetId ?? null,
    );

    // ── 5. Resolve prior year (if requested) ────────────────────
    let priorBalances: ResolvedAccountBalance[] = [];
    if (input.includePriorYear !== false) {
      priorBalances = await this.acctRepo.resolveAccounts(
        input.tenantId,
        input.entityCode,
        definition.id,
        input.fiscalYear - 1,
        input.periodFrom,
        input.periodTo,
        bookCode,
        input.dimensionSetId ?? null,
      );
    }

    // ── 6. Compute line values ──────────────────────────────────
    const computedLines = this.computeLineValues(
      lines,
      accountBalances,
      priorBalances,
    );

    // ── 7. Check for existing instance (supersession) ───────────
    const existingInstances = await this.instanceRepo.list(
      input.tenantId,
      input.entityCode,
      {
        definitionId: definition.id,
        fiscalYear: input.fiscalYear,
        bookCode,
      },
    );
    const activeInstance = existingInstances.find(
      (inst) =>
        inst.periodFrom === input.periodFrom &&
        inst.periodTo === input.periodTo &&
        inst.status !== "SUPERSEDED",
    );

    // ── 8. Create instance ──────────────────────────────────────
    const durationMs = Date.now() - startTime;
    const instance = await this.instanceRepo.create({
      tenantId: input.tenantId,
      entityCode: input.entityCode,
      definitionId: definition.id,
      definitionVersion: definition.version,
      fiscalYear: input.fiscalYear,
      periodFrom: input.periodFrom,
      periodTo: input.periodTo,
      bookCode,
      dimensionSetId: input.dimensionSetId ?? null,
      dimensionFilter: input.dimensionFilter ?? null,
      currencyCode: input.currencyCode ?? definition.currencyCode ?? "USD",
      generatedBy: input.generatedBy ?? ctx.actorId,
      glBalanceAsOf: new Date(),
      generationDurationMs: durationMs,
      totalLineCount: computedLines.length,
      supersedesId: activeInstance?.id ?? null,
    });

    // Mark old instance as superseded
    if (activeInstance) {
      await this.instanceRepo.updateStatus(
        input.tenantId,
        activeInstance.id,
        "SUPERSEDED",
        ctx.actorId,
      );
    }

    // ── 9. Insert computed lines ────────────────────────────────
    await this.instanceRepo.insertLines(
      computedLines.map((cl) => ({
        instanceId: instance.id,
        lineId: cl.lineId,
        lineCode: cl.lineCode,
        label: cl.label,
        lineType: cl.lineType,
        parentLineCode: cl.parentLineCode,
        level: cl.level,
        sortOrder: cl.sortOrder,
        currentAmount: cl.currentAmount,
        priorAmount: cl.priorAmount,
        budgetAmount: null,
        varianceAmount: cl.varianceAmount,
        variancePct: cl.variancePct,
        accountBreakdown: cl.accountBreakdown,
        isBold: cl.isBold,
        isUnderlined: cl.isUnderlined,
        indentLevel: cl.indentLevel,
        isCalculated: cl.isCalculated,
      })),
    );

    return ok(instance);
  }

  async getInstance(
    tenantId: string,
    instanceId: string,
  ): Promise<
    ServiceResult<{
      instance: StatementInstance;
      lines: StatementInstanceLine[];
    }>
  > {
    const instance = await this.instanceRepo.getById(tenantId, instanceId);
    if (!instance) {
      return fail("INSTANCE_NOT_FOUND", `Statement instance ${instanceId} not found`);
    }

    const lines = await this.instanceRepo.getLines(instanceId);
    return ok({ instance, lines });
  }

  async listDefinitions(
    tenantId: string,
    entityCode: string,
    statementType?: string,
  ): Promise<StatementDefinition[]> {
    return this.defRepo.list(tenantId, entityCode, {
      statementType,
      isActive: true,
    });
  }

  async updateStatus(
    ctx: OperationContext,
    instanceId: string,
    targetStatus: InstanceStatus,
  ): Promise<ServiceResult<StatementInstance>> {
    const instance = await this.instanceRepo.getById(ctx.tenantId, instanceId);
    if (!instance) {
      return fail("INSTANCE_NOT_FOUND", `Statement instance ${instanceId} not found`);
    }

    const { INSTANCE_TRANSITIONS } = await import("../domain/types.js");
    const allowed = INSTANCE_TRANSITIONS[instance.status];
    if (!allowed.includes(targetStatus)) {
      return fail(
        "INVALID_TRANSITION",
        `Cannot transition from ${instance.status} to ${targetStatus}`,
      );
    }

    const updated = await this.instanceRepo.updateStatus(
      ctx.tenantId,
      instanceId,
      targetStatus,
      ctx.actorId,
    );
    return ok(updated);
  }

  // ─── Private: Compute line values ─────────────────────────────

  private computeLineValues(
    lines: StatementLine[],
    currentBalances: ResolvedAccountBalance[],
    priorBalances: ResolvedAccountBalance[],
  ): ComputedLine[] {
    // Group balances by line code
    const currentByLine = groupByLineCode(currentBalances);
    const priorByLine = groupByLineCode(priorBalances);

    // Build line code → parent line code map
    const lineMap = new Map(lines.map((l) => [l.id, l]));
    const lineByCode = new Map(lines.map((l) => [l.lineCode, l]));

    // Phase 1: Compute ACCOUNT and MOVEMENT lines from GL balances
    const computedValues = new Map<string, number>();
    const computedPrior = new Map<string, number>();
    const breakdowns = new Map<string, AccountBreakdownEntry[]>();

    for (const line of lines) {
      if (line.lineType === "ACCOUNT") {
        const { amount, breakdown } = computeAccountLine(
          line,
          currentByLine.get(line.lineCode) ?? [],
        );
        computedValues.set(line.lineCode, amount);
        breakdowns.set(line.lineCode, breakdown);

        const { amount: priorAmt } = computeAccountLine(
          line,
          priorByLine.get(line.lineCode) ?? [],
        );
        computedPrior.set(line.lineCode, priorAmt);
      }

      // MOVEMENT lines: balance sheet delta (closing_current - closing_prior)
      // Used for indirect-method cash flow working capital changes
      if (line.lineType === "MOVEMENT") {
        const { amount: closingCurrent, breakdown } = computeMovementLine(
          line,
          currentByLine.get(line.lineCode) ?? [],
        );
        const { amount: closingPrior } = computeMovementLine(
          line,
          priorByLine.get(line.lineCode) ?? [],
        );
        const delta = closingCurrent - closingPrior;
        computedValues.set(line.lineCode, delta);
        breakdowns.set(line.lineCode, breakdown);

        // Prior-year movement: not applicable — set to 0
        computedPrior.set(line.lineCode, 0);
      }
    }

    // Phase 2: Compute SUBTOTAL lines (sum of children)
    // Process in order of level (deeper first = bottom-up)
    const sortedByLevel = [...lines].sort((a, b) => b.level - a.level);
    for (const line of sortedByLevel) {
      if (line.lineType === "SUBTOTAL") {
        const children = lines.filter(
          (l) => l.parentLineId === line.id && l.isActive,
        );
        let sum = 0;
        let priorSum = 0;
        for (const child of children) {
          sum += computedValues.get(child.lineCode) ?? 0;
          priorSum += computedPrior.get(child.lineCode) ?? 0;
        }
        computedValues.set(line.lineCode, sum);
        computedPrior.set(line.lineCode, priorSum);
      }
    }

    // Phase 3: Compute CALCULATION lines (formula from line references)
    for (const line of lines) {
      if (line.lineType === "CALCULATION" && line.calculationFormula) {
        const current = evaluateFormula(line.calculationFormula, computedValues);
        const prior = evaluateFormula(line.calculationFormula, computedPrior);
        computedValues.set(line.lineCode, current);
        computedPrior.set(line.lineCode, prior);
      }
    }

    // Phase 4: Build output
    const result: ComputedLine[] = [];
    for (const line of lines) {
      if (!line.isActive) continue;

      const current = computedValues.get(line.lineCode) ?? 0;
      const prior = computedPrior.get(line.lineCode) ?? null;
      const parentLine = line.parentLineId
        ? lineMap.get(line.parentLineId)
        : null;

      let varianceAmount: string | null = null;
      let variancePct: string | null = null;
      if (prior !== null) {
        const va = current - prior;
        varianceAmount = va.toFixed(4);
        variancePct =
          prior !== 0 ? ((va / Math.abs(prior)) * 100).toFixed(4) : null;
      }

      result.push({
        lineId: line.id,
        lineCode: line.lineCode,
        label: line.label,
        lineType: line.lineType,
        parentLineCode: parentLine?.lineCode ?? null,
        level: line.level,
        sortOrder: line.sortOrder,
        currentAmount: current.toFixed(4),
        priorAmount: prior !== null ? prior.toFixed(4) : null,
        varianceAmount,
        variancePct,
        accountBreakdown: breakdowns.get(line.lineCode) ?? null,
        isBold: line.isBold,
        isUnderlined: line.isUnderlined,
        indentLevel: line.indentLevel,
        isCalculated:
          line.lineType === "SUBTOTAL" ||
          line.lineType === "CALCULATION" ||
          line.lineType === "MOVEMENT",
      });
    }

    return result;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ComputedLine {
  lineId: string;
  lineCode: string;
  label: string;
  lineType: string;
  parentLineCode: string | null;
  level: number;
  sortOrder: number;
  currentAmount: string;
  priorAmount: string | null;
  varianceAmount: string | null;
  variancePct: string | null;
  accountBreakdown: AccountBreakdownEntry[] | null;
  isBold: boolean;
  isUnderlined: boolean;
  indentLevel: number;
  isCalculated: boolean;
}

function groupByLineCode(
  balances: ResolvedAccountBalance[],
): Map<string, ResolvedAccountBalance[]> {
  const map = new Map<string, ResolvedAccountBalance[]>();
  for (const b of balances) {
    const list = map.get(b.lineCode);
    if (list) {
      list.push(b);
    } else {
      map.set(b.lineCode, [b]);
    }
  }
  return map;
}

function computeAccountLine(
  line: StatementLine,
  balances: ResolvedAccountBalance[],
): { amount: number; breakdown: AccountBreakdownEntry[] } {
  let total = 0;
  const breakdown: AccountBreakdownEntry[] = [];

  for (const b of balances) {
    const debit = parseFloat(b.periodDebit) || 0;
    const credit = parseFloat(b.periodCredit) || 0;

    // Compute balance based on the line's normal balance direction
    let amount: number;
    if (line.normalBalance === "CREDIT") {
      amount = credit - debit; // Credit-normal: positive when credits > debits
    } else {
      amount = debit - credit; // Debit-normal: positive when debits > credits
    }

    // Apply sign treatment from mapping
    if (b.signTreatment === "INVERT") {
      amount = -amount;
    }

    total += amount;
    breakdown.push({
      accountId: b.accountId,
      accountCode: b.accountCode,
      accountName: b.accountName,
      amount: amount.toFixed(4),
    });
  }

  return { amount: total, breakdown };
}

/**
 * Compute a MOVEMENT line: closing balance for mapped accounts.
 * Used by indirect cash flow to compute balance sheet deltas.
 * The caller computes the delta: closingCurrent - closingPrior.
 */
function computeMovementLine(
  line: StatementLine,
  balances: ResolvedAccountBalance[],
): { amount: number; breakdown: AccountBreakdownEntry[] } {
  let total = 0;
  const breakdown: AccountBreakdownEntry[] = [];

  for (const b of balances) {
    const closingDebit = parseFloat(b.closingDebit) || 0;
    const closingCredit = parseFloat(b.closingCredit) || 0;

    let amount: number;
    if (line.normalBalance === "CREDIT") {
      amount = closingCredit - closingDebit;
    } else {
      amount = closingDebit - closingCredit;
    }

    if (b.signTreatment === "INVERT") {
      amount = -amount;
    }

    total += amount;
    breakdown.push({
      accountId: b.accountId,
      accountCode: b.accountCode,
      accountName: b.accountName,
      amount: amount.toFixed(4),
    });
  }

  return { amount: total, breakdown };
}

function evaluateFormula(
  steps: CalculationStep[],
  values: Map<string, number>,
): number {
  if (steps.length === 0) return 0;

  let result = values.get(steps[0].lineCode) ?? 0;
  if (steps[0].operator === "-") result = -result;

  for (let i = 1; i < steps.length; i++) {
    const val = values.get(steps[i].lineCode) ?? 0;
    switch (steps[i].operator) {
      case "+":
        result += val;
        break;
      case "-":
        result -= val;
        break;
      case "*":
        result *= val;
        break;
      case "/":
        result = val !== 0 ? result / val : 0;
        break;
    }
  }

  return result;
}
