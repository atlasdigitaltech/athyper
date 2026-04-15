import { type ApiFetch } from "../base";
import { type MasterRecord, type MasterRecordWrite } from "@athyper/api-contracts/records";
import { type PaginationRequest } from "@athyper/api-contracts/common";
import {
  type EntityListSort,
  type EntityListFilters,
  type FacetScope,
  type BulkPreflightResult,
  type BulkActionResult,
} from "@athyper/api-contracts/entity-list";

// Canonical list request params — matches EntityListQueryState server-request subset.
export interface EntityListParams {
  q?:        string;
  filters?:  EntityListFilters | Record<string, unknown>;
  sort?:     EntityListSort;
  page?:     number;
  pageSize?: number;
  facets?:   FacetScope;
}

export function createRecordsClient(fetch: ApiFetch) {
  return {
    async list(
      entityCode: string,
      params?: EntityListParams & Partial<PaginationRequest>,
    ) {
      const query = params ? (() => {
        const { filters, q, sort, pageSize, page, facets } = params;
        const sp = new URLSearchParams();

        if (q)        sp.set("q",         q);
        if (page)     sp.set("page",      String(page));
        if (pageSize) sp.set("page_size", String(pageSize));
        if (sort)     sp.set("sort",      `${sort.key}:${sort.dir}`);
        if (facets)   sp.set("facets",    facets);

        if (filters && Object.keys(filters).length > 0) {
          sp.set("filters", JSON.stringify(filters));
        }

        const qs = sp.toString();
        return qs ? `?${qs}` : "";
      })() : "";
      return fetch<{ data: MasterRecord[]; pagination: unknown; facets?: Record<string, { value: string; count: number }[]> }>(
        `/api/records/${entityCode}${query}`,
      );
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

    async bulkPreflight(
      entityCode: string,
      body: { action: string; recordIds: string[]; params?: Record<string, unknown> },
    ): Promise<BulkPreflightResult> {
      return fetch(`/api/records/${entityCode}/bulk-preflight`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },

    async bulkAction(
      entityCode: string,
      body: { action: string; recordIds: string[]; params?: Record<string, unknown> },
    ): Promise<BulkActionResult> {
      return fetch(`/api/records/${entityCode}/bulk-action`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
  };
}

export type RecordsClient = ReturnType<typeof createRecordsClient>;
