// framework/runtime/src/services/business/engines/posting-engine/domain/double-entry-validator.ts

import { sumAmounts, subtractAmounts, compareAmounts } from "../../shared/money.js";

import type { CreateJournalLineInput } from "./types.js";

/**
 * Validate double-entry invariant: total debits = total credits.
 * This is the MOST CRITICAL validation in the Posting Engine (MC-8).
 *
 * MC-4 compliance: Uses BigInt arithmetic via Money lib. NO FLOAT.
 */
export function validateDoubleEntry(lines: CreateJournalLineInput[]): {
    valid: boolean;
    totalDebit: string;
    totalCredit: string;
    difference: string;
} {
    const totalDebit = sumAmounts(lines.map((l) => l.debitAmount || "0"));
    const totalCredit = sumAmounts(lines.map((l) => l.creditAmount || "0"));
    const difference = subtractAmounts(totalDebit, totalCredit);

    return {
        valid: compareAmounts(totalDebit, totalCredit) === 0,
        totalDebit,
        totalCredit,
        difference,
    };
}

/**
 * Validate individual line constraints.
 */
export function validateJournalLines(lines: CreateJournalLineInput[]): {
    valid: boolean;
    errors: string[];
} {
    const errors: string[] = [];

    if (lines.length < 2) {
        errors.push("Journal entry must have at least 2 lines");
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const debitCmp = compareAmounts(line.debitAmount || "0", "0");
        const creditCmp = compareAmounts(line.creditAmount || "0", "0");

        if (debitCmp < 0) {
            errors.push(`Line ${i + 1}: debit amount cannot be negative`);
        }
        if (creditCmp < 0) {
            errors.push(`Line ${i + 1}: credit amount cannot be negative`);
        }
        if (debitCmp > 0 && creditCmp > 0) {
            errors.push(`Line ${i + 1}: a line cannot have both debit and credit amounts`);
        }
        if (debitCmp === 0 && creditCmp === 0) {
            errors.push(`Line ${i + 1}: a line must have either a debit or credit amount`);
        }
    }

    return { valid: errors.length === 0, errors };
}
