/**
 * Deterministic pricing-component -> accounting-bucket projection.
 *
 * This module intentionally contains no document-specific SQL. Callers load
 * active pricing components, condition semantics, and accounting distributions
 * in one batch and pass them here. The same function is used for preview,
 * budget, fulfillment, invoice posting, and reversal verification.
 */

import { createHash } from "node:crypto";

export type CostEffect = "REDUCE_COST" | "ADD_TO_COST" | "NO_COST_EFFECT";
export type PostingPattern =
  | "INHERIT_LINE_ACCOUNT"
  | "SEPARATE_ACCOUNT"
  | "TAX_RECOVERABLE"
  | "LIABILITY_SPLIT"
  | "TAX_SELF_ASSESSED"
  | "MEMO_ONLY";
export type DistributionPolicy = "INHERIT_LINE" | "APPORTION_TO_LINES" | "NO_COST_DISTRIBUTION";
export type ComponentBucket =
  | "BASE_COST"
  | "COST_REDUCTION"
  | "COST_ADDITION"
  | "SEPARATE_DEBIT"
  | "SEPARATE_CREDIT"
  | "RECOVERABLE_TAX"
  | "NONRECOVERABLE_TAX"
  | "WHT_LIABILITY"
  | "RETENTION_LIABILITY"
  | "SELF_ASSESSED_INPUT"
  | "SELF_ASSESSED_OUTPUT"
  | "SETTLEMENT_DISCOUNT"
  | "MEMO";

export interface ComponentProjectionInput {
  id: string;
  conditionTypeId: string;
  sourceLineId: string;
  termType: "discount" | "charge" | "tax" | "withholding" | "retention" | "principal_marker";
  computedAmount: number;
  recoverablePct?: number | null;
  costEffect: CostEffect;
  postingPattern: PostingPattern;
  distributionPolicy: DistributionPolicy;
  postingRoleCode?: string | null;
}

export interface DistributionProjectionInput {
  id: string;
  sourceLineId: string;
  distributionNo: number;
  ratio: number;
  glAccountId?: string | null;
  costCenterId?: string | null;
  profitCenterId?: string | null;
  projectId?: string | null;
  assetId?: string | null;
  budgetAllocationId?: string | null;
}

export interface LineProjectionInput {
  id: string;
  baseAmount: number;
  components: ComponentProjectionInput[];
  distributions: DistributionProjectionInput[];
}

export interface ComponentAccountingAllocation {
  sourceLineId: string;
  pricingComponentId: string | null;
  conditionTypeId: string | null;
  accountingDistributionId: string | null;
  distributionNo: number | null;
  componentBucket: ComponentBucket;
  amount: number;
  postingRoleCode: string | null;
  glAccountId: string | null;
  costCenterId: string | null;
  profitCenterId: string | null;
  projectId: string | null;
  assetId: string | null;
  budgetAllocationId: string | null;
}

export interface ComponentAccountingProjection {
  allocations: ComponentAccountingAllocation[];
  totals: Record<ComponentBucket | "DISTRIBUTABLE_COST", number>;
  calculationHash: string;
  warnings: string[];
}

const SCALE = 10_000;
const round4 = (value: number): number => Math.round((value + Number.EPSILON) * SCALE) / SCALE;

function normalizeDistributions(line: LineProjectionInput, warnings: string[]): DistributionProjectionInput[] {
  if (line.distributions.length === 0) {
    warnings.push(`Line ${line.id} has no accounting distribution; projection uses an unresolved 100% split.`);
    return [{ id: "", sourceLineId: line.id, distributionNo: 1, ratio: 1 }];
  }
  const positive = line.distributions.filter((row) => Number.isFinite(row.ratio) && row.ratio > 0);
  const sum = positive.reduce((total, row) => total + row.ratio, 0);
  if (sum <= 0) {
    warnings.push(`Line ${line.id} has no positive accounting-distribution ratio.`);
    return [{ id: "", sourceLineId: line.id, distributionNo: 1, ratio: 1 }];
  }
  if (Math.abs(sum - 1) > 0.00005) {
    warnings.push(`Line ${line.id} distribution ratios total ${round4(sum * 100)}%; normalized to 100%.`);
  }
  return positive.map((row) => ({ ...row, ratio: row.ratio / sum }));
}

/** Allocates a rounded parent amount while assigning the rounding remainder to the final split. */
function allocateAmount(amount: number, rows: DistributionProjectionInput[]): number[] {
  let assigned = 0;
  return rows.map((row, index) => {
    const allocated = index === rows.length - 1 ? round4(amount - assigned) : round4(amount * row.ratio);
    assigned = round4(assigned + allocated);
    return allocated;
  });
}

function bucketParts(component: ComponentProjectionInput): Array<{ bucket: ComponentBucket; amount: number }> {
  const amount = round4(Math.max(0, component.computedAmount));
  if (amount === 0) return [];

  if (component.postingPattern === "MEMO_ONLY") return [{ bucket: "MEMO", amount }];
  if (component.postingPattern === "LIABILITY_SPLIT") {
    return [{ bucket: component.termType === "retention" ? "RETENTION_LIABILITY" : "WHT_LIABILITY", amount }];
  }
  if (component.postingPattern === "TAX_SELF_ASSESSED") {
    const recovery = Math.min(100, Math.max(0, component.recoverablePct ?? 100)) / 100;
    const input = round4(amount * recovery);
    const result: Array<{ bucket: ComponentBucket; amount: number }> = [
      { bucket: "SELF_ASSESSED_OUTPUT", amount },
    ];
    if (input > 0) result.push({ bucket: "SELF_ASSESSED_INPUT", amount: input });
    if (amount - input > 0) result.push({ bucket: "NONRECOVERABLE_TAX", amount: round4(amount - input) });
    return result;
  }
  if (component.postingPattern === "TAX_RECOVERABLE") {
    const recovery = Math.min(100, Math.max(0, component.recoverablePct ?? 100)) / 100;
    const recoverable = round4(amount * recovery);
    const nonrecoverable = round4(amount - recoverable);
    return [
      ...(recoverable > 0 ? [{ bucket: "RECOVERABLE_TAX" as const, amount: recoverable }] : []),
      ...(nonrecoverable > 0 ? [{ bucket: "NONRECOVERABLE_TAX" as const, amount: nonrecoverable }] : []),
    ];
  }
  if (component.postingPattern === "SEPARATE_ACCOUNT") {
    if (component.termType === "discount") return [{ bucket: "SETTLEMENT_DISCOUNT", amount }];
    return [{ bucket: "SEPARATE_DEBIT", amount }];
  }
  if (component.costEffect === "REDUCE_COST") return [{ bucket: "COST_REDUCTION", amount }];
  if (component.costEffect === "ADD_TO_COST") return [{ bucket: "COST_ADDITION", amount }];
  return [{ bucket: "MEMO", amount }];
}

export function projectComponentAccounting(lines: LineProjectionInput[]): ComponentAccountingProjection {
  const allocations: ComponentAccountingAllocation[] = [];
  const warnings: string[] = [];

  for (const line of lines) {
    const distributions = normalizeDistributions(line, warnings);
    const baseParts = allocateAmount(round4(Math.max(0, line.baseAmount)), distributions);
    distributions.forEach((dist, index) => allocations.push(toAllocation(line.id, null, null, dist, "BASE_COST", baseParts[index] ?? 0, null)));

    for (const component of line.components) {
      for (const part of bucketParts(component)) {
        const costDistributed = part.bucket === "COST_REDUCTION"
          || part.bucket === "COST_ADDITION"
          || part.bucket === "NONRECOVERABLE_TAX";
        const targets = costDistributed || component.distributionPolicy !== "NO_COST_DISTRIBUTION"
          ? distributions
          : [null];
        const amounts = targets[0] === null ? [part.amount] : allocateAmount(part.amount, distributions);
        targets.forEach((dist, index) => allocations.push(toAllocation(
          line.id,
          component.id,
          component.conditionTypeId,
          dist,
          part.bucket,
          amounts[index] ?? 0,
          component.postingRoleCode ?? null,
        )));
      }
    }
  }

  const totals = emptyTotals();
  for (const allocation of allocations) totals[allocation.componentBucket] = round4(totals[allocation.componentBucket] + allocation.amount);
  totals.DISTRIBUTABLE_COST = round4(
    totals.BASE_COST - totals.COST_REDUCTION + totals.COST_ADDITION + totals.NONRECOVERABLE_TAX,
  );

  const canonical = allocations.map((row) => ({
    l: row.sourceLineId, p: row.pricingComponentId, d: row.accountingDistributionId,
    b: row.componentBucket, a: row.amount, r: row.postingRoleCode,
  }));
  const calculationHash = createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
  return { allocations, totals, calculationHash, warnings };
}

function toAllocation(
  sourceLineId: string,
  pricingComponentId: string | null,
  conditionTypeId: string | null,
  dist: DistributionProjectionInput | null,
  componentBucket: ComponentBucket,
  amount: number,
  postingRoleCode: string | null,
): ComponentAccountingAllocation {
  return {
    sourceLineId,
    pricingComponentId,
    conditionTypeId,
    accountingDistributionId: dist?.id || null,
    distributionNo: dist?.distributionNo ?? null,
    componentBucket,
    amount: round4(amount),
    postingRoleCode,
    glAccountId: dist?.glAccountId ?? null,
    costCenterId: dist?.costCenterId ?? null,
    profitCenterId: dist?.profitCenterId ?? null,
    projectId: dist?.projectId ?? null,
    assetId: dist?.assetId ?? null,
    budgetAllocationId: dist?.budgetAllocationId ?? null,
  };
}

function emptyTotals(): Record<ComponentBucket | "DISTRIBUTABLE_COST", number> {
  return {
    DISTRIBUTABLE_COST: 0, BASE_COST: 0, COST_REDUCTION: 0, COST_ADDITION: 0,
    SEPARATE_DEBIT: 0, SEPARATE_CREDIT: 0, RECOVERABLE_TAX: 0,
    NONRECOVERABLE_TAX: 0, WHT_LIABILITY: 0, RETENTION_LIABILITY: 0,
    SELF_ASSESSED_INPUT: 0, SELF_ASSESSED_OUTPUT: 0, SETTLEMENT_DISCOUNT: 0, MEMO: 0,
  };
}

