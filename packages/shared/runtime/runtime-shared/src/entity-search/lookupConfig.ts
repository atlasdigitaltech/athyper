import type {
  EntityPickerOption,
  EntityPickerOptionConfig,
  EntityPickerSearchContext,
  EntityPickerSearchResult,
} from "./EntityPicker";
import { entityRowToPickerOption } from "./useEntitySearch";

export type LookupFilterScalar = string | number | boolean;
export type LookupFilterValue = LookupFilterScalar | LookupFilterScalar[];

export interface LookupDependencyConfig {
  sourceField: string;
  targetField: string;
  throughEntity?: string;
  throughSourceField: string;
  throughTargetField?: string;
  throughFilters: Record<string, LookupFilterValue>;
  sortField?: string;
  sortDirection: "asc" | "desc";
  emptyBehavior: "empty" | "all";
}

export interface SearchLookupOptionsArgs {
  entityCode: string;
  query: string;
  lookupConfig?: Record<string, unknown> | null;
  formData?: Record<string, unknown> | null;
  optionConfig?: EntityPickerOptionConfig;
  context?: EntityPickerSearchContext;
  rowToOption?: (
    row: Record<string, unknown>,
    entityCode: string,
    optionConfig?: EntityPickerOptionConfig,
  ) => EntityPickerOption | null | undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function textConfig(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function directionConfig(value: unknown): "asc" | "desc" {
  return value === "desc" ? "desc" : "asc";
}

function emptyBehaviorConfig(value: unknown): "empty" | "all" {
  return value === "all" ? "all" : "empty";
}

export function isLookupFilterValue(value: unknown): value is LookupFilterValue {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return true;
  return Array.isArray(value) && value.every((item) =>
    typeof item === "string" || typeof item === "number" || typeof item === "boolean",
  );
}

export function readLookupFilters(
  lookupConfig?: Record<string, unknown> | null,
): Record<string, LookupFilterValue> {
  const raw = asRecord(lookupConfig?.["filters"]);
  if (!raw) return {};

  return Object.fromEntries(
    Object.entries(raw).filter(
      (entry): entry is [string, LookupFilterValue] => isLookupFilterValue(entry[1]),
    ),
  );
}

export function searchParamsForLookupFilters(
  filters: Record<string, LookupFilterValue>,
): Record<string, string> | undefined {
  return Object.keys(filters).length > 0
    ? { filters: JSON.stringify(filters) }
    : undefined;
}

export function applyLookupFiltersParam(
  params: URLSearchParams,
  filters: Record<string, LookupFilterValue>,
) {
  if (Object.keys(filters).length > 0) {
    params.set("filters", JSON.stringify(filters));
  }
}

export function readLookupDependency(
  lookupConfig?: Record<string, unknown> | null,
): LookupDependencyConfig | null {
  const root = asRecord(lookupConfig);
  const raw = asRecord(root?.["dependent_filter"] ?? root?.["depends_on"] ?? root?.["dependency"]);
  if (!raw) return null;

  const through = asRecord(raw["through"]);
  const sourceField = textConfig(
    raw["source_field"] ??
    raw["sourceField"] ??
    raw["field"] ??
    raw["depends_on"] ??
    raw["dependsOn"],
  );
  if (!sourceField) return null;

  const throughEntity = textConfig(
    raw["through_entity"] ??
    raw["throughEntity"] ??
    through?.["entity"] ??
    through?.["entity_code"] ??
    through?.["entityCode"],
  );
  const throughSourceField = textConfig(
    raw["through_source_field"] ??
    raw["throughSourceField"] ??
    through?.["source_field"] ??
    through?.["sourceField"],
  ) ?? sourceField;
  const throughTargetField = textConfig(
    raw["through_target_field"] ??
    raw["throughTargetField"] ??
    raw["value_field"] ??
    raw["valueField"] ??
    through?.["target_field"] ??
    through?.["targetField"] ??
    through?.["value_field"] ??
    through?.["valueField"],
  );

  if (throughEntity && !throughTargetField) return null;

  return {
    sourceField,
    targetField: textConfig(raw["target_field"] ?? raw["targetField"]) ?? sourceField,
    throughEntity,
    throughSourceField,
    throughTargetField,
    throughFilters: readLookupFilters({
      filters: raw["through_filters"] ?? raw["throughFilters"] ?? through?.["filters"],
    }),
    sortField: textConfig(
      raw["sort_field"] ??
      raw["sortField"] ??
      raw["through_sort_field"] ??
      raw["throughSortField"] ??
      raw["order_by"] ??
      raw["orderBy"] ??
      through?.["sort_field"] ??
      through?.["sortField"] ??
      through?.["order_by"] ??
      through?.["orderBy"],
    ),
    sortDirection: directionConfig(
      raw["sort_direction"] ??
      raw["sortDirection"] ??
      raw["order_direction"] ??
      raw["orderDirection"] ??
      through?.["sort_direction"] ??
      through?.["sortDirection"] ??
      through?.["order_direction"] ??
      through?.["orderDirection"],
    ),
    emptyBehavior: emptyBehaviorConfig(raw["empty_behavior"] ?? raw["emptyBehavior"]),
  };
}

export function hasLookupDependency(
  lookupConfig?: Record<string, unknown> | null,
): boolean {
  return readLookupDependency(lookupConfig) !== null;
}

function sourceValue(
  formData: Record<string, unknown> | null | undefined,
  sourceField: string,
): LookupFilterValue | null {
  const value = sourceField.split(".").reduce<unknown>((current, segment) => {
    const record = asRecord(current);
    return record ? record[segment] : undefined;
  }, formData);

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    const values = value.filter(
      (item): item is LookupFilterScalar =>
        typeof item === "string" || typeof item === "number" || typeof item === "boolean",
    );
    return values.length > 0 ? values : null;
  }
  return null;
}

function uniqueScalars(values: unknown[]): LookupFilterScalar[] {
  const seen = new Set<string>();
  const out: LookupFilterScalar[] = [];
  values.forEach((value) => {
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return;
    const key = `${typeof value}:${String(value)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(value);
  });
  return out;
}

async function fetchRecordList(
  entityCode: string,
  params: URLSearchParams,
): Promise<{ data?: Record<string, unknown>[]; pagination?: { total?: number | string } } | null> {
  const res = await fetch(`/api/relay/api/records/${encodeURIComponent(entityCode)}?${params}`);
  if (!res.ok) return null;
  return res.json() as Promise<{
    data?: Record<string, unknown>[];
    pagination?: { total?: number | string };
  }>;
}

function paginationTotal(total: number | string | undefined): number | undefined {
  if (total === undefined) return undefined;
  const parsed = Number(total);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function setSearchParams(
  params: URLSearchParams,
  searchParams?: Record<string, string>,
) {
  Object.entries(searchParams ?? {}).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
}

export async function searchLookupOptions({
  entityCode,
  query,
  lookupConfig,
  formData,
  optionConfig,
  context,
  rowToOption,
}: SearchLookupOptionsArgs): Promise<EntityPickerSearchResult> {
  const dependency = readLookupDependency(lookupConfig);
  const filters = { ...readLookupFilters(lookupConfig) };
  let targetOrder: Map<string, number> | null = null;

  if (dependency) {
    const source = sourceValue(formData, dependency.sourceField);
    if (source === null) {
      if (dependency.emptyBehavior === "all") {
        // Intentionally leave the dependency filter off.
      } else {
        return { options: [], totalCount: 0 };
      }
    } else if (dependency.throughEntity) {
      const throughParams = new URLSearchParams({
        page_size: "100",
        page: "1",
      });
      applyLookupFiltersParam(throughParams, {
        ...dependency.throughFilters,
        [dependency.throughSourceField]: source,
      });
      if (dependency.sortField) {
        throughParams.set("sort", `${dependency.sortField}:${dependency.sortDirection}`);
      }

      const throughBody = await fetchRecordList(dependency.throughEntity, throughParams);
      const targetIds = uniqueScalars(
        (throughBody?.data ?? []).map((row) => row[dependency.throughTargetField!]),
      );
      if (targetIds.length === 0) return { options: [], totalCount: 0 };

      filters[dependency.targetField] = targetIds;
      targetOrder = new Map(targetIds.map((id, index) => [String(id), index]));
    } else {
      filters[dependency.targetField] = source;
    }
  }

  const pageSize = context?.pageSize ?? context?.limit ?? 20;
  const params = new URLSearchParams({
    q: query,
    limit: String(pageSize),
    page_size: String(pageSize),
    page: String(context?.page ?? 1),
  });
  setSearchParams(params, context?.searchParams);
  applyLookupFiltersParam(params, filters);

  const body = await fetchRecordList(entityCode, params);
  const rows = body?.data ?? [];
  if (targetOrder) {
    rows.sort((a, b) => {
      const aOrder = targetOrder!.get(String(a[dependency!.targetField])) ?? Number.MAX_SAFE_INTEGER;
      const bOrder = targetOrder!.get(String(b[dependency!.targetField])) ?? Number.MAX_SAFE_INTEGER;
      return aOrder - bOrder;
    });
  }

  return {
    options: rows
      .map((row) => rowToOption
        ? rowToOption(row, entityCode, optionConfig)
        : entityRowToPickerOption(row, entityCode, optionConfig))
      .filter((option): option is EntityPickerOption => Boolean(option)),
    totalCount: paginationTotal(body?.pagination?.total),
  };
}
