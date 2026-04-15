"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

// ── Payload / result types ────────────────────────────────────────────────────

export interface CreateJournalLine {
  gl_account_code: string;
  debit?:          number;
  credit?:         number;
  item_text?:      string;
}

export interface CreateJournalPayload {
  company_code:  string;
  fiscal_year:   number;
  period_number: number;
  posting_date:  string;
  currency_code: string;
  description?:  string;
  lines:         CreateJournalLine[];
}

export interface CreateJournalResult {
  journal_entry_id: string;
  je_number:        string;
  status:           string;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Mutation hook for creating a manual journal entry.
 * On success, invalidates the journals list query so the grid refreshes.
 */
export function useCreateJournal() {
  const queryClient = useQueryClient();

  return useMutation<CreateJournalResult, Error, CreateJournalPayload>({
    mutationFn: async (payload) => {
      const res = await fetch("/api/finance/journals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error(String(err["message"] ?? err["error"] ?? "Failed to create journal entry"));
      }
      return res.json() as Promise<CreateJournalResult>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["finance", "journals"] });
    },
  });
}
