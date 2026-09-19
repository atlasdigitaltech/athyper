import {
  resolveDecimalRounding,
  roundDecimal,
} from "@athyper/server-foundation";
import {
  FinanceContractError,
  type RoundingEvidence,
  type RoundingPolicyReader,
  type RoundingResolutionRequest,
  type RoundingRuleCandidate,
} from "@athyper/server-contract-finance";
import { assertFinanceDecimal, canonicalFinanceHash } from "./canonical.js";

export class RoundingResolver {
  constructor(private readonly reader: RoundingPolicyReader) {}

  async resolve(request: RoundingResolutionRequest): Promise<RoundingEvidence> {
    const candidates = (await this.reader.listCandidates(request))
      .filter((candidate) => matches(candidate, request))
      .sort((left, right) => specificity(right) - specificity(left));
    const selected = candidates[0];
    const currency = request.currencyCode
      ? await this.reader.getCurrencyDefaults(request)
      : undefined;
    if (selected) {
      const { precisionDigits, roundingIncrement } = resolved(
        selected,
        currency,
      );
      return evidence({
        source: "rule",
        method: selected.method,
        precisionDigits,
        roundingIncrement,
        specificity: specificity(selected),
        revision: selected.revision,
        ...(selected.contextRevision
          ? { contextRevision: selected.contextRevision }
          : {}),
        ...(selected.ruleRevision
          ? { ruleRevision: selected.ruleRevision }
          : {}),
        ...(currency ? { currencyRevision: currency.revision } : {}),
        contextId: selected.contextId,
        ruleId: selected.ruleId,
        ruleCode: selected.ruleCode,
      });
    }
    if (!currency)
      throw new FinanceContractError(
        "FINANCE_NOT_FOUND",
        "No rounding rule or currency default was found",
      );
    const { precisionDigits, roundingIncrement } = resolved(
      { method: "ROUND_HALF_UP" },
      currency,
    );
    return evidence({
      source: "currency_default",
      method: "ROUND_HALF_UP",
      precisionDigits,
      roundingIncrement,
      specificity: 0,
      revision: currency.revision,
      currencyRevision: currency.revision,
    });
  }
}

export function roundFinanceDecimal(
  value: string,
  rule: RoundingEvidence,
): string {
  try {
    return roundDecimal(
      assertFinanceDecimal(value, "amount", { precision: 38, scale: 18 }),
      rule,
    );
  } catch (error) {
    throw new FinanceContractError(
      "FINANCE_INVALID_COMMAND",
      error instanceof Error ? error.message : "Invalid rounding",
    );
  }
}
function resolved(
  rule: Parameters<typeof resolveDecimalRounding>[0],
  currency?: Parameters<typeof resolveDecimalRounding>[1],
) {
  try {
    return resolveDecimalRounding(rule, currency);
  } catch (error) {
    throw new FinanceContractError(
      "FINANCE_INVALID_COMMAND",
      error instanceof Error ? error.message : "Invalid rounding",
    );
  }
}

function matches(
  candidate: RoundingRuleCandidate,
  request: RoundingResolutionRequest,
): boolean {
  return (
    (!candidate.companyCodeId ||
      candidate.companyCodeId === request.companyCodeId) &&
    (!candidate.currencyCode ||
      candidate.currencyCode === request.currencyCode) &&
    (!candidate.slot || candidate.slot === request.slot)
  );
}
function specificity(candidate: RoundingRuleCandidate): number {
  return (
    (candidate.companyCodeId ? 4 : 0) +
    (candidate.currencyCode ? 2 : 0) +
    (candidate.slot ? 1 : 0)
  );
}
function evidence(
  value: Omit<RoundingEvidence, "evidenceHash">,
): RoundingEvidence {
  return { ...value, evidenceHash: canonicalFinanceHash(value) };
}
