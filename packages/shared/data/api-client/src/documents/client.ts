import { type ApiFetch } from "../base";
import { type DocumentDetail, type StatusTransitionRequest } from "@athyper/api-contracts/documents";

export function createDocumentsClient(fetch: ApiFetch) {
  return {
    async list(docType: string, params?: Record<string, string>) {
      const query = params ? `?${new URLSearchParams(params)}` : "";
      return fetch<{ data: unknown[]; pagination: unknown }>(`/api/documents/${docType}${query}`);
    },
    async get(docType: string, id: string): Promise<DocumentDetail> {
      return fetch(`/api/documents/${docType}/${id}`);
    },
    async create(docType: string, body: unknown): Promise<DocumentDetail> {
      return fetch(`/api/documents/${docType}`, { method: "POST", body: JSON.stringify(body) });
    },
    async transition(docType: string, id: string, body: StatusTransitionRequest): Promise<void> {
      return fetch(`/api/documents/${docType}/${id}/transition`, { method: "POST", body: JSON.stringify(body) });
    },
  };
}

export type DocumentsClient = ReturnType<typeof createDocumentsClient>;
