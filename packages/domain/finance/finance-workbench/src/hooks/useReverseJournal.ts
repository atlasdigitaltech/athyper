"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

export interface ReverseJournalPayload {
  jeId:         string;
  posting_date?: string;
  description?:  string;
}

export interface ReverseJournalResult {
  reversal_journal_entry_id: string;
  je_number:                 string;
  status:                    string;
  reversal_of:               string;
}

/**
 * Mutation hook for reversing a posted journal entry.
 * On success, invalidates the journals list query so the grid refreshes.
 */
export function useReverseJournal() {
  const queryClient = useQueryClient();

  return useMutation<ReverseJournalResult, Error, ReverseJournalPayload>({
    mutationFn: async ({ jeId, ...body }) => {
      const res = await fetch(`/api/finance/journals/${jeId}/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error(String(err["message"] ?? err["error"] ?? "Failed to reverse journal entry"));
      }
      return res.json() as Promise<ReverseJournalResult>;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["finance", "journals"] });
    },
  });
}
