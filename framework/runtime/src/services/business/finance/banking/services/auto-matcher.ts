// finance/banking/services/auto-matcher.ts
//
// 3-pass auto-matching algorithm for bank reconciliation.
// Matches bank statement lines to payment entries.

import { compareAmounts } from "../../../engines/shared/money.js";

import type { BankStatementLine, MatchResult } from "../domain/types.js";

// Payment summary for matching (from payment entry repo)
export interface PaymentMatchCandidate {
  id: string;
  paymentNumber: string;
  totalAmount: string;
  paymentDate: Date;
  reference: string | null;
  supplierId: string;
  status: string; // Only POSTED payments are matchable
}

/**
 * Compute Levenshtein edit distance between two strings.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Check if two dates are within the given number of business days.
 */
function withinDays(a: Date, b: Date, maxDays: number): boolean {
  const diffMs = Math.abs(a.getTime() - b.getTime());
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= maxDays;
}

/**
 * Run the 3-pass auto-matching algorithm.
 *
 * Pass 1 (EXACT): amount + reference + date within 3 days -> confidence 95+
 * Pass 2 (FUZZY_REF): amount exact + partial reference (Levenshtein <= 3) -> confidence 80-94
 * Pass 3 (AMOUNT_ONLY): exact amount within 5-day window -> confidence 60-79
 *
 * Auto-match threshold: confidence >= 90 (only EXACT matches auto-apply).
 * Below threshold -> flagged for manual review.
 */
export function autoMatch(
  lines: BankStatementLine[],
  candidates: PaymentMatchCandidate[],
  options?: { autoApplyThreshold?: number },
): MatchResult[] {
  const threshold = options?.autoApplyThreshold ?? 90;
  const results: MatchResult[] = [];
  const matchedPaymentIds = new Set<string>();
  const matchedLineIds = new Set<string>();

  // Only consider DEBIT lines (outgoing payments)
  const unmatchedLines = lines.filter(
    (l) => l.matchStatus === "UNMATCHED" && l.direction === "DEBIT",
  );

  // Pass 1: EXACT — amount + reference + date within 3 business days
  for (const line of unmatchedLines) {
    if (matchedLineIds.has(line.id)) continue;
    if (!line.reference) continue;

    const normalizedRef = line.reference.trim().toUpperCase();

    for (const candidate of candidates) {
      if (matchedPaymentIds.has(candidate.id)) continue;
      if (compareAmounts(line.amount, candidate.totalAmount) !== 0) continue;
      if (!withinDays(line.transactionDate, candidate.paymentDate, 3)) continue;

      const candidateRef = (candidate.reference ?? candidate.paymentNumber)
        .trim()
        .toUpperCase();
      if (
        normalizedRef === candidateRef ||
        normalizedRef.includes(candidateRef) ||
        candidateRef.includes(normalizedRef)
      ) {
        results.push({
          lineId: line.id,
          paymentId: candidate.id,
          confidence: 97,
          matchType: "EXACT",
        });
        matchedPaymentIds.add(candidate.id);
        matchedLineIds.add(line.id);
        break;
      }
    }
  }

  // Pass 2: FUZZY_REF — amount exact + partial reference (Levenshtein <= 3)
  for (const line of unmatchedLines) {
    if (matchedLineIds.has(line.id)) continue;
    if (!line.reference) continue;

    const normalizedRef = line.reference.trim().toUpperCase();

    for (const candidate of candidates) {
      if (matchedPaymentIds.has(candidate.id)) continue;
      if (compareAmounts(line.amount, candidate.totalAmount) !== 0) continue;

      const candidateRef = (candidate.reference ?? candidate.paymentNumber)
        .trim()
        .toUpperCase();
      const distance = levenshtein(normalizedRef, candidateRef);

      if (distance <= 3) {
        const confidence = Math.max(80, 94 - distance * 4);
        results.push({
          lineId: line.id,
          paymentId: candidate.id,
          confidence,
          matchType: "FUZZY_REF",
        });
        matchedPaymentIds.add(candidate.id);
        matchedLineIds.add(line.id);
        break;
      }
    }
  }

  // Pass 3: AMOUNT_ONLY — exact amount within 5-day window
  for (const line of unmatchedLines) {
    if (matchedLineIds.has(line.id)) continue;

    for (const candidate of candidates) {
      if (matchedPaymentIds.has(candidate.id)) continue;
      if (compareAmounts(line.amount, candidate.totalAmount) !== 0) continue;
      if (!withinDays(line.transactionDate, candidate.paymentDate, 5)) continue;

      // Closer dates get higher confidence
      const diffMs = Math.abs(
        line.transactionDate.getTime() - candidate.paymentDate.getTime(),
      );
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      const confidence = Math.max(60, Math.round(79 - diffDays * 3));

      results.push({
        lineId: line.id,
        paymentId: candidate.id,
        confidence,
        matchType: "AMOUNT_ONLY",
      });
      matchedPaymentIds.add(candidate.id);
      matchedLineIds.add(line.id);
      break;
    }
  }

  return results;
}
