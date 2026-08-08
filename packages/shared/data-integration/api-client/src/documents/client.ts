import { encodePathSegment, type ApiFetch } from "../base";
import { type DocumentDetail, type StatusTransitionRequest } from "@athyper/api-contracts/documents";

export function createDocumentsClient(fetch: ApiFetch) {
  return {
    /**
     * List documents of a given type.
     *
     * NOTE: params is intentionally typed as Record<string, string> because
     * document list endpoints are consumed via BFF relay (not the records API)
     * and do not share the EntityListParams filter/sort serialization contract.
     * If a document entity migrates to the generic records runtime, use
     * RecordsClient.list() instead.
     */
    async list(docType: string, params?: Record<string, string>) {
      const query = params ? `?${new URLSearchParams(params)}` : "";
      return fetch<{ data: unknown[]; pagination: unknown }>(`/api/documents/${encodePathSegment(docType)}${query}`);
    },
    async get(docType: string, id: string): Promise<DocumentDetail> {
      return fetch(`/api/documents/${encodePathSegment(docType)}/${encodePathSegment(id)}`);
    },
    async create(docType: string, body: unknown): Promise<DocumentDetail> {
      return fetch(`/api/documents/${encodePathSegment(docType)}`, { method: "POST", body: JSON.stringify(body) });
    },
    async transition(docType: string, id: string, body: StatusTransitionRequest): Promise<void> {
      return fetch(
        `/api/documents/${encodePathSegment(docType)}/${encodePathSegment(id)}/transition`,
        { method: "POST", body: JSON.stringify(body) },
      );
    },
  };
}

export type DocumentsClient = ReturnType<typeof createDocumentsClient>;
