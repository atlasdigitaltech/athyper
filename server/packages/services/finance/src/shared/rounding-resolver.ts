import { FinanceContractError, type RoundingEvidence, type RoundingPolicyReader, type RoundingResolutionRequest, type RoundingRuleCandidate } from "@athyper/server-contract-finance";
import { assertFinanceDecimal, canonicalFinanceHash } from "./canonical.js";

export class RoundingResolver {
  constructor(private readonly reader: RoundingPolicyReader) {}

  async resolve(request: RoundingResolutionRequest): Promise<RoundingEvidence> {
    const candidates = (await this.reader.listCandidates(request)).filter((candidate) => matches(candidate, request)).sort((left, right) => specificity(right) - specificity(left));
    const selected = candidates[0];
    const currency = request.currencyCode ? await this.reader.getCurrencyDefaults(request) : undefined;
    if (selected) {
      const precisionDigits = selected.precisionDigits ?? currency?.minorUnits;
      if (precisionDigits === undefined) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Rounding precision cannot be resolved");
      const roundingIncrement = assertFinanceDecimal(selected.roundingIncrement ?? currency?.roundingIncrement ?? decimalIncrement(precisionDigits), "roundingIncrement", { precision: 18, scale: 6 });
      return evidence({ source: "rule", method: selected.method, precisionDigits, roundingIncrement, specificity: specificity(selected), revision: selected.revision, ...(selected.contextRevision ? { contextRevision: selected.contextRevision } : {}), ...(selected.ruleRevision ? { ruleRevision: selected.ruleRevision } : {}), ...(currency ? { currencyRevision: currency.revision } : {}), contextId: selected.contextId, ruleId: selected.ruleId, ruleCode: selected.ruleCode });
    }
    if (!currency) throw new FinanceContractError("FINANCE_NOT_FOUND", "No rounding rule or currency default was found");
    return evidence({ source: "currency_default", method: "ROUND_HALF_UP", precisionDigits: currency.minorUnits, roundingIncrement: assertFinanceDecimal(currency.roundingIncrement ?? decimalIncrement(currency.minorUnits), "roundingIncrement", { precision: 18, scale: 6 }), specificity: 0, revision: currency.revision, currencyRevision: currency.revision });
  }
}

export function roundFinanceDecimal(value: string, rule: RoundingEvidence): string {
  // Intermediate tax/FX values legitimately carry more scale than their ledger
  // column; the selected rule is what reduces them to the persisted precision.
  const amount = decimal(assertFinanceDecimal(value, "amount", { precision: 38, scale: 18 }));
  const increment = decimal(assertFinanceDecimal(rule.roundingIncrement, "roundingIncrement", { precision: 18, scale: 6 }));
  if (increment.numerator <= 0n) throw new FinanceContractError("FINANCE_INVALID_COMMAND", "Rounding increment must be positive");
  const numerator = amount.numerator * pow10(increment.scale);
  const denominator = pow10(amount.scale) * increment.numerator;
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  let units = absolute / denominator;
  const remainder = absolute % denominator;
  if (rule.method === "ROUND_UP" && remainder > 0n) units += 1n;
  if (rule.method === "ROUND_HALF_UP" && remainder * 2n >= denominator) units += 1n;
  if (rule.method === "ROUND_HALF_EVEN" && (remainder * 2n > denominator || (remainder * 2n === denominator && units % 2n === 1n))) units += 1n;
  const rounded = (negative ? -units : units) * increment.numerator;
  return format(rounded, increment.scale, rule.precisionDigits);
}

function matches(candidate: RoundingRuleCandidate, request: RoundingResolutionRequest): boolean { return (!candidate.companyCodeId || candidate.companyCodeId === request.companyCodeId) && (!candidate.currencyCode || candidate.currencyCode === request.currencyCode) && (!candidate.slot || candidate.slot === request.slot); }
function specificity(candidate: RoundingRuleCandidate): number { return (candidate.companyCodeId ? 4 : 0) + (candidate.currencyCode ? 2 : 0) + (candidate.slot ? 1 : 0); }
function decimalIncrement(precision: number): string { return precision === 0 ? "1" : `0.${"0".repeat(precision - 1)}1`; }
function evidence(value: Omit<RoundingEvidence, "evidenceHash">): RoundingEvidence { return { ...value, evidenceHash: canonicalFinanceHash(value) }; }
function decimal(value: string): { numerator: bigint; scale: number } { const negative = value.startsWith("-"); const unsigned = negative ? value.slice(1) : value; const [whole, fraction = ""] = unsigned.split("."); const numerator = BigInt(`${whole}${fraction}`) * (negative ? -1n : 1n); return { numerator, scale: fraction.length }; }
function pow10(scale: number): bigint { return 10n ** BigInt(scale); }
function format(numerator: bigint, scale: number, precision: number): string { const negative = numerator < 0n; const absolute = negative ? -numerator : numerator; const raw = absolute.toString().padStart(scale + 1, "0"); const whole = scale ? raw.slice(0, -scale) : raw; const fraction = scale ? raw.slice(-scale) : ""; const adjusted = precision ? fraction.padEnd(precision, "0").slice(0, precision) : ""; return `${negative && absolute !== 0n ? "-" : ""}${whole}${precision ? `.${adjusted}` : ""}`; }
