import { type ApiFetch } from "../base";
import { runtimePath, serializeFilterEntry } from "../paths";
import {
  type MasterRecord,
  type MasterRecordWrite,
  type EntityListSortEntry,
  type EntityListFilters,
  type FacetScope,
  type BulkPreflightResult,
  type BulkActionResult,
} from "../types";

export interface EntityListParams {
  q?:        string;
  filters?:  EntityListFilters;
  sort?:     EntityListSortEntry[];
  group?:    string;
  page?:     number;
  pageSize?: number;
  facets?:   FacetScope;
  /**
   * Parent-FK scope for child entities. The backend resolves the physical
   * column via identity_config.parent.field and applies it as a hard filter.
   * Not URL-serialised into saved views.
   */
  parent_id?: string;
}

export interface EntityListResponse {
  data:          MasterRecord[];
  pagination:    unknown;
  facets?:       Record<string, { value: string; count: number }[]>;
  group_counts?: Record<string, number>;
  reasons?:      Record<string, unknown>;
}

function buildListQuery(params: EntityListParams): string {
  const { filters, q, sort, group, pageSize, page, facets, parent_id } = params;
  const sp = new URLSearchParams();

  if (q)                sp.set("q",         q);
  if (page && page > 1) sp.set("page",      String(page));
  if (pageSize)         sp.set("page_size", String(pageSize));
  if (group)            sp.set("group",     group);
  if (facets)           sp.set("facets",    facets);
  if (parent_id)        sp.set("parent_id", parent_id);

  if (sort?.length) {
    sp.set("sort", sort.map((s) =>
      s.nulls === "first" ? `${s.key}:${s.dir}:nfirst` : `${s.key}:${s.dir}`,
    ).join(","));
  }

  if (filters) {
    for (const [field, entry] of Object.entries(filters)) {
      const sigil = serializeFilterEntry(entry);
      if (sigil) sp.set(`filter.${field}`, sigil);
    }
  }

  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export function createRecordsClient(fetch: ApiFetch) {
  return {
    async list(
      entityCode: string,
      params?:    EntityListParams,
    ): Promise<EntityListResponse> {
      const qs = params ? buildListQuery(params) : "";
      return fetch(`${runtimePath.list(entityCode)}${qs}`);
    },

    async get(entityCode: string, id: string): Promise<MasterRecord> {
      return fetch(runtimePath.detail(entityCode, id));
    },

    async create(entityCode: string, body: MasterRecordWrite): Promise<MasterRecord> {
      return fetch(runtimePath.create(entityCode), {
        method: "POST",
        body:   JSON.stringify(body),
      });
    },

    async update(
      entityCode: string,
      id:         string,
      body:       MasterRecordWrite,
    ): Promise<MasterRecord> {
      return fetch(runtimePath.detail(entityCode, id), {
        method: "PUT",
        body:   JSON.stringify(body),
      });
    },

    async remove(entityCode: string, id: string): Promise<void> {
      return fetch(runtimePath.detail(entityCode, id), { method: "DELETE" });
    },

    async bulkPreflight(
      entityCode: string,
      body: { action: string; recordIds: string[]; params?: Record<string, unknown> },
    ): Promise<BulkPreflightResult> {
      return fetch(runtimePath.bulkPreflight(entityCode), {
        method: "POST",
        body:   JSON.stringify(body),
      });
    },

    async bulkAction(
      entityCode: string,
      body: { action: string; recordIds: string[]; params?: Record<string, unknown> },
    ): Promise<BulkActionResult> {
      return fetch(runtimePath.bulkAction(entityCode), {
        method: "POST",
        body:   JSON.stringify(body),
      });
    },
  };
}

export type RecordsClient = ReturnType<typeof createRecordsClient>;
