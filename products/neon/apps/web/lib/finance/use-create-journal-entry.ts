"use client";

// lib/finance/use-create-journal-entry.ts
//
// Hook for creating manual journal entries with dimension support.
// POST /api/fin/journal-entries

import { useState, useCallback } from "react";

import { FinanceHttpError } from "./errors";
import { finPost } from "./fetcher";

import type { JournalEntryDTO, DimensionSelectionDTO } from "./types";

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface ManualJELineInput {
  accountId: string;
  debitAmount: string;
  creditAmount: string;
  currencyCode: string;
  description?: string;
  costCenterId?: string;
  profitCenterId?: string;
  /** Dimension selections from the DimensionPicker */
  dimensions?: DimensionSelectionDTO[];
}

export interface CreateManualJEInput {
  entityCode: string;
  postingDate: string;
  description: string;
  currencyCode: string;
  lines: ManualJELineInput[];
}

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface UseCreateJournalEntryResult {
  /** Submit the journal entry for creation and posting */
  submit: (input: CreateManualJEInput) => Promise<JournalEntryDTO | null>;
  /** True while the POST is in flight */
  submitting: boolean;
  /** Error message from the last failed submission */
  error: string | null;
  /** The created JE (set after successful submit) */
  createdEntry: JournalEntryDTO | null;
  /** Clear error and createdEntry state */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCreateJournalEntry(): UseCreateJournalEntryResult {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdEntry, setCreatedEntry] = useState<JournalEntryDTO | null>(
    null,
  );

  const submit = useCallback(
    async (input: CreateManualJEInput): Promise<JournalEntryDTO | null> => {
      setSubmitting(true);
      setError(null);
      setCreatedEntry(null);

      try {
        // Transform dimension selections into the backend format
        const apiLines = input.lines.map((line) => ({
          accountId: line.accountId,
          debitAmount: line.debitAmount || "0",
          creditAmount: line.creditAmount || "0",
          currencyCode: line.currencyCode,
          description: line.description,
          costCenterId: line.costCenterId,
          profitCenterId: line.profitCenterId,
          dimensionInput: line.dimensions?.length
            ? {
                dimensions: line.dimensions.map((d) => ({
                  typeCode: d.typeCode,
                  valueCode: d.valueCode,
                })),
              }
            : undefined,
        }));

        const result = await finPost<JournalEntryDTO>(
          "/api/fin/journal-entries",
          {
            entityCode: input.entityCode,
            postingDate: input.postingDate,
            description: input.description,
            currencyCode: input.currencyCode,
            docType: "MANUAL_JE",
            lines: apiLines,
          },
        );

        setCreatedEntry(result);
        return result;
      } catch (err) {
        const message =
          err instanceof FinanceHttpError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to create journal entry";
        setError(message);
        return null;
      } finally {
        setSubmitting(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setError(null);
    setCreatedEntry(null);
  }, []);

  return { submit, submitting, error, createdEntry, reset };
}
