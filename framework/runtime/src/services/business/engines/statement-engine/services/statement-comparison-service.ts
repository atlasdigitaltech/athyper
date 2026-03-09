// framework/runtime/src/services/business/engines/statement-engine/services/statement-comparison-service.ts
//
// Compares two statement instances from different books (e.g., STAT vs IFRS)
// and produces a line-by-line variance report.

import { ok, fail } from "../../shared/engine-base.js";

import type {
  ServiceResult,
  OperationContext,
} from "../../shared/engine-base.js";
import type {
  StatementInstance,
  StatementInstanceLine,
} from "../domain/types.js";
import type { StatementInstanceRepo } from "../persistence/statement-repo.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComparisonLine {
  lineCode: string;
  label: string;
  lineType: string;
  baseAmount: string;
  compareAmount: string;
  varianceAmount: string;
  variancePct: string | null;
  sortOrder: number;
  indentLevel: number;
  isBold: boolean;
}

export interface StatementComparison {
  baseInstance: StatementInstance;
  compareInstance: StatementInstance;
  lines: ComparisonLine[];
  totalLines: number;
  linesWithVariance: number;
  maxVariancePct: number | null;
  totalVariance: string;
}

export interface CompareInput {
  tenantId: string;
  baseInstanceId: string;
  compareInstanceId: string;
}

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface StatementComparisonService {
  compare(
    ctx: OperationContext,
    input: CompareInput,
  ): Promise<ServiceResult<StatementComparison>>;
}

// ---------------------------------------------------------------------------
// Default implementation
// ---------------------------------------------------------------------------

export class DefaultStatementComparisonService
  implements StatementComparisonService
{
  constructor(private readonly instanceRepo: StatementInstanceRepo) {}

  async compare(
    ctx: OperationContext,
    input: CompareInput,
  ): Promise<ServiceResult<StatementComparison>> {
    // Load both instances
    const [baseInstance, compareInstance] = await Promise.all([
      this.instanceRepo.getById(input.tenantId, input.baseInstanceId),
      this.instanceRepo.getById(input.tenantId, input.compareInstanceId),
    ]);

    if (!baseInstance) {
      return fail("BASE_NOT_FOUND", `Base instance ${input.baseInstanceId} not found`);
    }
    if (!compareInstance) {
      return fail("COMPARE_NOT_FOUND", `Compare instance ${input.compareInstanceId} not found`);
    }

    // Validate same definition
    if (baseInstance.definitionId !== compareInstance.definitionId) {
      return fail(
        "DEFINITION_MISMATCH",
        "Cannot compare instances from different statement definitions",
      );
    }

    // Validate same period
    if (
      baseInstance.fiscalYear !== compareInstance.fiscalYear ||
      baseInstance.periodFrom !== compareInstance.periodFrom ||
      baseInstance.periodTo !== compareInstance.periodTo
    ) {
      return fail(
        "PERIOD_MISMATCH",
        "Cannot compare instances from different periods",
      );
    }

    // Load lines
    const [baseLines, compareLines] = await Promise.all([
      this.instanceRepo.getLines(baseInstance.id),
      this.instanceRepo.getLines(compareInstance.id),
    ]);

    // Build comparison
    const compareByCode = new Map<string, StatementInstanceLine>();
    for (const line of compareLines) {
      compareByCode.set(line.lineCode, line);
    }

    const result: ComparisonLine[] = [];
    let linesWithVariance = 0;
    let maxVariancePct: number | null = null;
    let totalVariance = 0;

    for (const baseLine of baseLines) {
      const compareLine = compareByCode.get(baseLine.lineCode);
      const baseAmt = parseFloat(baseLine.currentAmount) || 0;
      const compareAmt = compareLine
        ? parseFloat(compareLine.currentAmount) || 0
        : 0;

      const variance = baseAmt - compareAmt;
      totalVariance += Math.abs(variance);

      let variancePct: string | null = null;
      if (compareAmt !== 0) {
        const pct = (variance / Math.abs(compareAmt)) * 100;
        variancePct = pct.toFixed(4);
        if (maxVariancePct === null || Math.abs(pct) > Math.abs(maxVariancePct)) {
          maxVariancePct = pct;
        }
      }

      if (Math.abs(variance) > 0.005) {
        linesWithVariance++;
      }

      result.push({
        lineCode: baseLine.lineCode,
        label: baseLine.label,
        lineType: baseLine.lineType,
        baseAmount: baseAmt.toFixed(4),
        compareAmount: compareAmt.toFixed(4),
        varianceAmount: variance.toFixed(4),
        variancePct,
        sortOrder: baseLine.sortOrder,
        indentLevel: baseLine.indentLevel,
        isBold: baseLine.isBold,
      });
    }

    return ok({
      baseInstance,
      compareInstance,
      lines: result,
      totalLines: result.length,
      linesWithVariance,
      maxVariancePct,
      totalVariance: totalVariance.toFixed(4),
    });
  }
}
