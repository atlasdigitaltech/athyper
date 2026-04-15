import { type ApiFetch } from "../base";
import { type MasterRecord, type MasterRecordWrite } from "@athyper/api-contracts/records";
import { type PaginationRequest } from "@athyper/api-contracts/common";

export function createRecordsClient(fetch: ApiFetch) {
  return {
    async list(
      entityCode: string,
      params?: Partial<PaginationRequest> & { filters?: Record<string, unknown>; q?: string },
    ) {
      const query = params ? (() => {
        const { filters, q, ...pagination } = params;
        const sp = new URLSearchParams(
          Object.fromEntries(
            (Object.entries(pagination) as [string, unknown][])
              .filter(([, v]) => v !== undefined)
              .map(([k, v]) => [k, String(v)])
          )
        );
        if (filters && Object.keys(filters).length > 0) sp.set("filters", JSON.stringify(filters));
        if (q) sp.set("q", q);
        return `?${sp}`;
      })() : "";
      return fetch<{ data: MasterRecord[]; pagination: unknown }>(`/api/records/${entityCode}${query}`);
    },

    async get(entityCode: string, id: string): Promise<MasterRecord> {
      return fetch(`/api/records/${entityCode}/${id}`);
    },

    async create(entityCode: string, body: MasterRecordWrite): Promise<MasterRecord> {
      return fetch(`/api/records/${entityCode}`, { method: "POST", body: JSON.stringify(body) });
    },

    async update(entityCode: string, id: string, body: MasterRecordWrite): Promise<MasterRecord> {
      return fetch(`/api/records/${entityCode}/${id}`, { method: "PUT", body: JSON.stringify(body) });
    },

    async remove(entityCode: string, id: string): Promise<void> {
      return fetch(`/api/records/${entityCode}/${id}`, { method: "DELETE" });
    },
  };
}

export type RecordsClient = ReturnType<typeof createRecordsClient>;
