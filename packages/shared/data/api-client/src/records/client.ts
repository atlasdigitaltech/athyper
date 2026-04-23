import { type ApiFetch } from "../base";
import { type MasterRecord, type MasterRecordWrite } from "@athyper/api-contracts/records";
import { type PaginationRequest } from "@athyper/api-contracts/common";
import {
  type EntityListSortEntry,
  type EntityListFilters,
  type FacetScope,
  type BulkPreflightResult,
  type BulkActionResult,
  serializeFilterEntry,
} from "@athyper/api-contracts/entity-list";

// Canonical list request params — matches EntityListQueryState server-request subset.
export interface EntityListParams {
  q?:        string;
  filters?:  EntityListFilters;
  sort?:     EntityListSortEntry[];
  group?:    string;
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
        const { filters, q, sort, group, pageSize, page, facets } = params;
        const sp = new URLSearchParams();

        if (q)        sp.set("q",         q);
        if (page)     sp.set("page",      String(page));
        if (pageSize) sp.set("page_size", String(pageSize));
        if (sort?.length) sp.set("sort", sort.map((s) => s.nulls === "first" ? `${s.key}:${s.dir}:nfirst` : `${s.key}:${s.dir}`).join(","));
        if (group)    sp.set("group",     group);
        if (facets)   sp.set("facets",    facets);

        // Encode filters as per-field sigil params: filter.<field>=<sigil>
        if (filters) {
          for (const [field, entry] of Object.entries(filters)) {
            const sigil = serializeFilterEntry(entry);
            if (sigil) sp.set(`filter.${field}`, sigil);
          }
        }

        const qs = sp.toString();
        return qs ? `?${qs}` : "";
      })() : "";
      return fetch<{
        data:         MasterRecord[];
        pagination:   unknown;
        facets?:      Record<string, { value: string; count: number }[]>;
        group_counts?: Record<string, number>;
        reasons?:     Record<string, unknown>;
      }>(`/api/records/${entityCode}${query}`);
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
