import { encodePathSegment, type ApiFetch } from "../base";
import { type JournalEntry, type PostingLine, type PostingTrace } from "../types";

export function createLedgerClient(fetch: ApiFetch) {
  return {
    async listJournals(
      params?: Record<string, string>,
    ): Promise<{ data: JournalEntry[]; pagination: unknown }> {
      const qs = params ? `?${new URLSearchParams(params)}` : "";
      return fetch(`/api/ledger/journals${qs}`);
    },

    async getPostingLines(journalId: string): Promise<PostingLine[]> {
      return fetch(
        `/api/ledger/journals/${encodePathSegment(journalId)}/lines`,
      );
    },

    async getPostingTrace(docType: string, docId: string): Promise<PostingTrace> {
      return fetch(
        `/api/ledger/trace/${encodePathSegment(docType)}/${encodePathSegment(docId)}`,
      );
    },
  };
}

export type LedgerClient = ReturnType<typeof createLedgerClient>;
