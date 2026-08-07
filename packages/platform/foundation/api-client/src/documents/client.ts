import { encodePathSegment, type ApiFetch } from "../base";
import {
  type DocumentDetail,
  type StatusTransitionRequest,
  type DocumentBundle,
  type EntityListFilters,
  type EntityListSortEntry,
} from "../types";

export interface DocumentListParams {
  q?:        string;
  filters?:  EntityListFilters;
  sort?:     EntityListSortEntry[];
  page?:     number;
  pageSize?: number;
}

function buildDocListQuery(params: DocumentListParams): string {
  const sp = new URLSearchParams();
  if (params.q)                        sp.set("q",         params.q);
  if (params.page && params.page > 1)  sp.set("page",      String(params.page));
  if (params.pageSize)                 sp.set("page_size", String(params.pageSize));
  if (params.sort?.length) {
    sp.set("sort", params.sort.map((s) => `${s.key}:${s.dir}`).join(","));
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export function createDocumentsClient(fetch: ApiFetch) {
  return {
    async list(
      docType: string,
      params?: DocumentListParams,
    ): Promise<{ data: DocumentDetail[]; pagination: unknown }> {
      const qs = params ? buildDocListQuery(params) : "";
      return fetch(`/api/documents/${encodePathSegment(docType)}${qs}`);
    },

    async get(docType: string, id: string): Promise<DocumentDetail> {
      return fetch(
        `/api/documents/${encodePathSegment(docType)}/${encodePathSegment(id)}`,
      );
    },

    async create(docType: string, body: { data: Record<string, unknown> }): Promise<DocumentDetail> {
      return fetch(`/api/documents/${encodePathSegment(docType)}`, {
        method: "POST",
        body:   JSON.stringify(body),
      });
    },

    async transition(
      docType: string,
      id:      string,
      body:    StatusTransitionRequest,
    ): Promise<void> {
      return fetch(
        `/api/documents/${encodePathSegment(docType)}/${encodePathSegment(id)}/transition`,
        { method: "POST", body: JSON.stringify(body) },
      );
    },

    /**
     * Fetch the document bundle: header + lines + workflow state + matching status
     * in a single round-trip. Prefer this over separate get() + workflow calls for
     * document detail pages.
     */
    async getBundle<
      H = Record<string, unknown>,
      L = Record<string, unknown>,
    >(docType: string, id: string): Promise<DocumentBundle<H, L>> {
      return fetch(
        `/api/documents/${encodePathSegment(docType)}/${encodePathSegment(id)}/bundle`,
      );
    },
  };
}

export type DocumentsClient = ReturnType<typeof createDocumentsClient>;
