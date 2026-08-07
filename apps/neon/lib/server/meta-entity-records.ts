import "server-only";

import { cache } from "react";
import type { V4Session } from "@athyper/platform-iam-auth-bff";
import {
  type MetaEntityField,
  type MetaEntityOptionSource,
  type MetaEntityRuntimeDescriptor,
} from "@athyper/runtime-contracts";
import type { RuntimeListPagination, RuntimeListState, RuntimeRecordRow } from "@athyper/runtime-shared/core";
import { getNeonServerSession } from "@/lib/server/session";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import { maskFieldSecurityResponse } from "@/lib/server/meta-entity-write-validation";
import type { RuntimeListDiagnosticRecorder } from "@/lib/server/runtime-list-observability";
import type { AthyperCacheState } from "@/lib/server/runtime-list-observability";
import {
  buildSessionConfigurationIdentity,
  getSessionConfiguration,
} from "@/lib/server/session-configuration-cache";

const DEFAULT_PAGE_SIZE = 20;
const SYSTEM_UUID = "00000000-0000-0000-0000-000000000000";
const LOOKUP_DOMAIN_CACHE_POLICY = {
  freshForMs: 5 * 60_000,
  staleForMs: 30 * 60_000,
} as const;
const ENTITY_CODE_ALIASES: Record<string, string> = {
  unit_of_measure: "uom",
};

export interface MetaEntityRecordList {
  records: RuntimeRecordRow[];
  state: RuntimeListState;
  pagination?: RuntimeListPagination;
  isFullyLoaded?: boolean;
  reasons?: Record<string, boolean>;
  navigation?: { hasMore: boolean; nextCursor?: string; countMode?: string; total?: number };
}

export interface MetaEntityRecordDetail {
  record?: RuntimeRecordRow;
  state: RuntimeListState;
}

export interface MetaEntityRecordReadOptions {
  /** Reuses the route's already validated request-local session. */
  session?: V4Session;
  /** Limits display hydration to fields that can be rendered in this list. */
  visibleFieldNames?: readonly string[];
  /**
   * The Records service enforces the verified tenant/organization context.
   * Keep the compatibility resolver available for non-standard callers only.
   */
  scopeStrategy?: "verified_upstream" | "bff_compatibility";
}

export const getMetaEntityRecordList = cache(
  async (
    routeEntity: string,
    searchParams: Record<string, string | string[] | undefined> = {},
    descriptor?: MetaEntityRuntimeDescriptor,
    diagnostics?: RuntimeListDiagnosticRecorder,
    options?: MetaEntityRecordReadOptions,
  ): Promise<MetaEntityRecordList> => {
    const entityCode = normalizeEntityCode(routeEntity);
    if (!entityCode) {
      return unavailable("Entity route is empty.");
    }

    const session = options?.session ?? await getNeonServerSession();
    if (!session) {
      return unavailable("Sign in again to load records.");
    }

    const headers = buildRuntimeHeaders(session);
    const scopeStartedAt = performance.now();
    const scopeStrategy = options?.scopeStrategy ?? "bff_compatibility";
    const scope = scopeStrategy === "verified_upstream"
      ? { status: "ready" as const, filters: {} }
      : await resolveScopeFilters(entityCode, descriptor, session, headers);
    diagnostics?.record("record_scope", performance.now() - scopeStartedAt, "bypass", {
      parent: "records",
      attributes: { entityCode, strategy: scopeStrategy },
    });
    if (scope.status === "unavailable") {
      return unavailable(scope.message);
    }

    const queryMode = entityQueryMode(descriptor);
    const requestedQueryV1 = firstParam(searchParams["query_v1"]);
    const useEntityQueryV1 = queryMode === "serve" && !isExplicitlyDisabled(requestedQueryV1);
    const legacyQuery = buildRecordListQuery(searchParams, scope.filters);
    const v1Query = buildRecordListQuery({
      ...searchParams,
      query_v1: "1",
      count_mode: searchParams["count_mode"] ?? "none",
    }, scope.filters);
    const recordQueryStartedAt = performance.now();
    const result = await fetchRecordRows(entityCode, useEntityQueryV1 ? v1Query : legacyQuery, headers, descriptor);
    const recordsDurationMs = performance.now() - recordQueryStartedAt;
    const recordsCacheState = result.telemetry?.cacheState ?? "bypass";
    diagnostics?.record("records", recordsDurationMs, recordsCacheState, {
      parent: "presenter_build",
      attributes: {
        entityCode,
        queryMode: useEntityQueryV1 ? "v1" : "legacy",
        rowCount: result.status === "ready" ? result.records.length : 0,
      },
    });
    if (result.telemetry) {
      diagnostics?.record("records_http", result.telemetry.httpDurationMs, recordsCacheState, {
        parent: "records",
        attributes: { entityCode },
      });
      diagnostics?.record("records_decode", result.telemetry.decodeDurationMs, recordsCacheState, {
        parent: "records",
        attributes: { entityCode },
      });
    }
    if (result.status === "unavailable") {
      return unavailable(result.message);
    }

    const hydrationStartedAt = performance.now();
    const hydratedRecords = await hydrateDisplayValues(
      result.records,
      descriptor,
      headers,
      session,
      options?.visibleFieldNames,
      diagnostics,
    );
    diagnostics?.record("references", performance.now() - hydrationStartedAt, "bypass", {
      parent: "presenter_build",
      attributes: {
        visibleFieldCount: options?.visibleFieldNames?.length,
        rowCount: result.records.length,
      },
    });
    const records = hydratedRecords
      .map((record) => maskRuntimeRecord(record, descriptor));

    return {
      records,
      state: { status: "ready" },
      pagination: result.pagination,
      isFullyLoaded: isFullyLoaded(records.length, result.pagination),
      reasons: result.reasons,
      navigation: result.navigation,
    };
  },
);

export const getMetaEntityRecordDetail = cache(
  async (
    routeEntity: string,
    recordId: string,
    descriptor?: MetaEntityRuntimeDescriptor,
    options?: Pick<MetaEntityRecordReadOptions, "session" | "scopeStrategy">,
  ): Promise<MetaEntityRecordDetail> => {
    const entityCode = normalizeEntityCode(routeEntity);
    const lookupId = normalizeRouteRecordId(recordId);
    if (!entityCode || !lookupId) {
      return unavailableDetail("Record route is empty.");
    }

    const session = options?.session ?? await getNeonServerSession();
    if (!session) {
      return unavailableDetail("Sign in again to load this record.");
    }

    const headers = buildRuntimeHeaders(session);
    const scope = options?.scopeStrategy === "verified_upstream"
      ? { status: "ready" as const, filters: {} }
      : await resolveScopeFilters(entityCode, descriptor, session, headers);
    if (scope.status === "unavailable") {
      return unavailableDetail(scope.message);
    }

    const plans = buildDetailLookupPlans(scope.filters, lookupId, descriptor);
    let lastUnavailableMessage: string | null = null;
    let record: RuntimeRecordRow | undefined;
    for (const plan of plans) {
      if (plan.status === "unavailable") {
        return unavailableDetail(plan.message);
      }

      const result = await fetchRecordRows(
        entityCode,
        buildRecordListQuery(plan.searchParams, plan.filters),
        headers,
        descriptor,
      );
      if (result.status === "unavailable") {
        lastUnavailableMessage = result.message;
        continue;
      }

      record = result.records.find((item) => plan.matches(item))
        ?? (plan.allowSingleFallback && result.records.length === 1 ? result.records[0] : undefined);
      if (record) break;
    }

    if (!record) {
      return unavailableDetail(lastUnavailableMessage ?? "Record was not found in the active organization scope.");
    }

    const [hydratedRecord] = await hydrateDisplayValues([record], descriptor, headers, session);
    const visibleRecord = maskRuntimeRecord(hydratedRecord ?? record, descriptor);

    return {
      record: visibleRecord,
      state: { status: "ready" },
    };
  },
);

function maskRuntimeRecord(
  record: RuntimeRecordRow,
  descriptor: MetaEntityRuntimeDescriptor | undefined,
): RuntimeRecordRow {
  if (!descriptor) return record;
  return maskFieldSecurityResponse(record, descriptor) as RuntimeRecordRow;
}

function buildRecordListQuery(
  searchParams: Record<string, string | string[] | undefined>,
  enforcedFilters: Record<string, string> = {},
): string {
  const params = new URLSearchParams();

  const queryV1 = String(Array.isArray(searchParams["query_v1"]) ? searchParams["query_v1"][0] : searchParams["query_v1"] ?? "").toLowerCase();
  if (!(queryV1 === "1" || queryV1 === "true" || queryV1 === "yes")) {
    setParam(params, "page", searchParams["page"]);
  }
  setParam(params, "page_size", searchParams["page_size"] ?? String(DEFAULT_PAGE_SIZE));
  setParam(params, "q", searchParams["q"]);
  setParam(params, "sort", searchParams["sort"]);
  setParam(params, "group", searchParams["group"]);
  setParam(params, "cols", searchParams["cols"]);
  setParam(params, "facets", searchParams["facets"]);
  setParam(params, "picker_tree", searchParams["picker_tree"]);
  setParam(params, "include_provisional", searchParams["include_provisional"]);
  setParam(params, "cursor", searchParams["cursor"]);
  setParam(params, "count_mode", searchParams["count_mode"]);
  setParam(params, "query_v1", searchParams["query_v1"]);

  for (const [key, value] of Object.entries(searchParams)) {
    if (key.startsWith("filter.")) {
      setParam(params, key, value);
    }
  }

  for (const [key, value] of Object.entries(enforcedFilters)) {
    params.set(key, value);
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function setParam(params: URLSearchParams, key: string, value: string | string[] | undefined): void {
  const item = Array.isArray(value) ? value[0] : value;
  if (item !== undefined && item !== "") {
    params.set(key, item);
  }
}

function firstParam(value: string | string[] | undefined): string | undefined {
  const item = Array.isArray(value) ? value[0] : value;
  return item?.trim() || undefined;
}

function isExplicitlyDisabled(value: string | undefined): boolean {
  return value !== undefined && ["0", "false", "no"].includes(value.toLowerCase());
}

function unavailable(message: string): MetaEntityRecordList {
  return {
    records: [],
    state: {
      status: "unavailable",
      message,
    },
  };
}

function unavailableDetail(message: string): MetaEntityRecordDetail {
  return {
    state: {
      status: "unavailable",
      message,
    },
  };
}

type DetailLookupPlan = {
  status: "ready";
  searchParams: Record<string, string>;
  filters: Record<string, string>;
  matches: (record: RuntimeRecordRow) => boolean;
  allowSingleFallback?: boolean;
} | {
  status: "unavailable";
  message: string;
};

function buildDetailLookupPlans(
  filters: Record<string, string>,
  recordId: string,
  descriptor: MetaEntityRuntimeDescriptor | undefined,
): DetailLookupPlan[] {
  // Detail lookup always opts into provisional visibility. The caller already
  // has the record id (from a redirect or a link), so hiding a draft they
  // just created — because the compiled descriptor happens to disagree with
  // the runtime on createMode — is a bug, not a feature. The records
  // service still applies tenant + scope + RLS; is_provisional is just a
  // list-view convenience filter that has no place on a by-id lookup.
  const searchParams: Record<string, string> = { include_provisional: "true" };
  const primaryKeyField = resolvePrimaryKeyFieldName(descriptor);
  const scopedIds = filters[`filter.${primaryKeyField}`]?.split(",").filter(Boolean)
    ?? filters["filter.id"]?.split(",").filter(Boolean)
    ?? [];
  const scopedRecordMatches = scopedIds.some((id) => sameRecordValue(id, recordId));
  if (scopedIds.length > 0 && !scopedRecordMatches) {
    return [{
      status: "unavailable",
      message: "Record is outside the active organization scope.",
    }];
  }

  const plans: DetailLookupPlan[] = [];
  if (scopedIds.length === 0 || scopedRecordMatches) {
    plans.push({
      status: "ready",
      searchParams: {
        ...detailQuerySearchParams(searchParams, descriptor, primaryKeyField),
        page_size: "1",
      },
      filters: {
        ...filters,
        [`filter.${primaryKeyField}`]: recordId,
      },
      matches: (record) => sameRecordValue(readRecordString(record, primaryKeyField), recordId)
        || sameRecordValue(record.id, recordId)
        || sameRecordValue(readRecordString(record, "id"), recordId),
      allowSingleFallback: true,
    });
  }

  for (const fieldName of detailLookupFieldNames(descriptor)) {
    plans.push({
      status: "ready",
      searchParams: {
        ...detailQuerySearchParams(searchParams, descriptor, fieldName),
        page_size: "2",
      },
      filters: {
        ...filters,
        [`filter.${fieldName}`]: recordId,
      },
      matches: (record) => sameRecordValue(readRecordString(record, fieldName), recordId),
      allowSingleFallback: true,
    });
  }

  plans.push({
    status: "ready",
    searchParams: { ...searchParams, page_size: "10", q: recordId },
    filters,
    matches: (record) => (
      sameRecordValue(record.id, recordId)
      || detailLookupFieldNames(descriptor).some((fieldName) => sameRecordValue(readRecordString(record, fieldName), recordId))
    ),
  });

  return plans;
}

function detailQuerySearchParams(
  base: Record<string, string>,
  descriptor: MetaEntityRuntimeDescriptor | undefined,
  fieldName: string,
): Record<string, string> {
  const field = descriptor?.fields.find((candidate) =>
    candidate.name === fieldName || candidate.columnName === fieldName,
  );
  if (!field || !field.isFilterable || field.isComputed) return base;
  return {
    ...base,
    // Explicit filter metadata is the authority for entering the compiled
    // path. count_mode=none prevents a by-id lookup from issuing a redundant
    // aggregate query. Missing contracts stay on the instrumented legacy
    // compatibility path until metadata repair completes.
    query_v1: "1",
    count_mode: "none",
  };
}

function detailLookupFieldNames(descriptor: MetaEntityRuntimeDescriptor | undefined): string[] {
  const existingFields = new Set(descriptor?.fields.map((field) => field.name) ?? []);
  const displayConfig = asRecordOrUndefined(descriptor?.extensions?.["displayConfig"]);
  const candidates = [
    resolvePrimaryKeyFieldName(descriptor),
    readJsonString(displayConfig, "code_field"),
    readJsonString(displayConfig, "title_field"),
    readJsonString(displayConfig, "subtitle_field"),
    descriptor?.numbering?.numberField,
    "code",
    "document_no",
    "number",
    "external_code",
    "name",
    "display_name",
    "title",
  ].filter(isPresentString);

  const seen = new Set<string>();
  return candidates.filter((fieldName) => {
    if (fieldName === "id" || seen.has(fieldName)) return false;
    if (existingFields.size > 0 && !existingFields.has(fieldName)) return false;
    seen.add(fieldName);
    return true;
  });
}

function resolvePrimaryKeyFieldName(descriptor: MetaEntityRuntimeDescriptor | undefined): string {
  const primaryKey = descriptor?.storage?.primaryKey ?? "id";
  return descriptor?.fields.find((field) => field.name === primaryKey || field.columnName === primaryKey)?.name
    ?? primaryKey;
}

type ScopeFilterResult =
  | { status: "ready"; filters: Record<string, string> }
  | { status: "unavailable"; message: string };

async function resolveScopeFilters(
  entityCode: string,
  descriptor: MetaEntityRuntimeDescriptor | undefined,
  session: V4Session,
  headers: Record<string, string>,
): Promise<ScopeFilterResult> {
  const membership = session.activeOrg ? session.organizations[session.activeOrg] : undefined;
  const tenantId = membership?.tenantId;

  if (!tenantId) {
    return {
      status: "unavailable",
      message: "Active organization is missing tenant scope.",
    };
  }

  const fields = new Set(descriptor?.fields.map((field) => field.name) ?? []);
  const primaryKeyField = resolvePrimaryKeyFieldName(descriptor);
  const filters: Record<string, string> = {};
  const tenantColumn = descriptor?.storage?.tenantColumn;
  if (tenantColumn || !descriptor) {
    const tenantField = descriptor?.fields.find((field) =>
      field.name === tenantColumn || field.columnName === tenantColumn,
    )?.name ?? "tenant_id";
    filters[`filter.${tenantField}`] = tenantId;
  }

  const activeCompanyCodeId = resolveActiveCompanyCodeId(membership);
  if (activeCompanyCodeId) {
    const result = await applyCompanyCodeScope(entityCode, fields, filters, tenantId, [activeCompanyCodeId], headers, primaryKeyField);
    return result ?? { status: "ready", filters };
  }

  if (membership?.legalEntityId) {
    const result = await applyLegalEntityScope(entityCode, fields, filters, tenantId, membership.legalEntityId, headers, primaryKeyField);
    return result ?? { status: "ready", filters };
  }

  return { status: "ready", filters };
}

function resolveActiveCompanyCodeId(membership: V4Session["organizations"][string] | undefined): string | undefined {
  if (!membership) return undefined;
  const contextType = membership.contextType?.toLowerCase();
  if (contextType !== "company_code") return undefined;
  return membership.organizationId;
}

async function applyLegalEntityScope(
  entityCode: string,
  fields: Set<string>,
  filters: Record<string, string>,
  tenantId: string,
  legalEntityId: string,
  headers: Record<string, string>,
  primaryKeyField: string,
): Promise<ScopeFilterResult | null> {
  if (entityCode === "legal_entity") {
    filters[`filter.${primaryKeyField}`] = legalEntityId;
    return null;
  }

  if (entityCode === "company_code" || fields.has("legal_entity_id")) {
    filters["filter.legal_entity_id"] = legalEntityId;
    return null;
  }

  const companyCodeResolution = await resolveCompanyCodeIdsForLegalEntity(tenantId, legalEntityId, headers);
  if (companyCodeResolution.status === "unavailable") {
    return emptyScope(companyCodeResolution.message);
  }
  const companyCodeIds = companyCodeResolution.ids;
  if (entityCode === "site" || fields.has("company_code_id")) {
    return applyCompanyCodeScope(entityCode, fields, filters, tenantId, companyCodeIds, headers, primaryKeyField);
  }

  if (entityCode === "warehouse" || fields.has("site_id")) {
    const siteResolution = await resolveSiteIdsForCompanyCodes(tenantId, companyCodeIds, headers);
    if (siteResolution.status === "unavailable") {
      return emptyScope(siteResolution.message);
    }
    if (siteResolution.ids.length === 0) return emptyScope("No sites are visible in the active legal entity scope.");
    filters["filter.site_id"] = siteResolution.ids.join(",");
  }

  return null;
}

async function applyCompanyCodeScope(
  entityCode: string,
  fields: Set<string>,
  filters: Record<string, string>,
  tenantId: string,
  companyCodeIds: string[],
  headers: Record<string, string>,
  primaryKeyField: string,
): Promise<ScopeFilterResult | null> {
  if (companyCodeIds.length === 0) return emptyScope("No company codes are visible in the active organization scope.");

  if (entityCode === "company_code") {
    filters[`filter.${primaryKeyField}`] = companyCodeIds.join(",");
    return null;
  }

  if (entityCode === "site" || fields.has("company_code_id")) {
    filters["filter.company_code_id"] = companyCodeIds.join(",");
    return null;
  }

  if (entityCode === "warehouse" || fields.has("site_id")) {
    const siteResolution = await resolveSiteIdsForCompanyCodes(tenantId, companyCodeIds, headers);
    if (siteResolution.status === "unavailable") {
      return emptyScope(siteResolution.message);
    }
    if (siteResolution.ids.length === 0) return emptyScope("No sites are visible in the active company-code scope.");
    filters["filter.site_id"] = siteResolution.ids.join(",");
  }

  return null;
}

function emptyScope(message: string): ScopeFilterResult {
  return {
    status: "unavailable",
    message,
  };
}

type ReferenceDisplayField = {
  field: MetaEntityField;
  targetEntity: string;
  valueField: string;
  labelField: string;
  codeField?: string;
};

type ReferenceDisplayValue = {
  label: string;
  code?: string;
};

async function hydrateDisplayValues(
  records: RuntimeRecordRow[],
  descriptor: MetaEntityRuntimeDescriptor | undefined,
  headers: Record<string, string>,
  session: V4Session,
  visibleFieldNames?: readonly string[],
  diagnostics?: RuntimeListDiagnosticRecorder,
): Promise<RuntimeRecordRow[]> {
  const referencePromise = measureHydration(
    diagnostics,
    "reference_hydration",
    records.length,
    () => hydrateReferenceDisplayValues(records, descriptor, headers, session, visibleFieldNames),
  );
  const lookupPromise = measureHydration(
    diagnostics,
    "lookup_hydration",
    records.length,
    () => hydrateLookupDisplayValues(records, descriptor, headers, session, visibleFieldNames, diagnostics),
  );
  const [referenceHydratedRecords, lookupHydratedRecords] = await Promise.all([
    referencePromise,
    lookupPromise,
  ]);
  return mergeHydratedRecords(records, referenceHydratedRecords, lookupHydratedRecords);
}

async function measureHydration(
  diagnostics: RuntimeListDiagnosticRecorder | undefined,
  operation: "reference_hydration" | "lookup_hydration",
  rowCount: number,
  loader: () => Promise<RuntimeRecordRow[]>,
): Promise<RuntimeRecordRow[]> {
  const startedAt = performance.now();
  try {
    return await loader();
  } finally {
    diagnostics?.record(operation, performance.now() - startedAt, "bypass", {
      parent: "references",
      attributes: { rowCount },
    });
  }
}

function mergeHydratedRecords(
  baseRecords: RuntimeRecordRow[],
  referenceRecords: RuntimeRecordRow[],
  lookupRecords: RuntimeRecordRow[],
): RuntimeRecordRow[] {
  return baseRecords.map((baseRecord, index) => {
    const referenceRecord = referenceRecords[index] ?? baseRecord;
    const lookupRecord = lookupRecords[index] ?? baseRecord;
    return {
      ...baseRecord,
      ...referenceRecord,
      ...lookupRecord,
      data: {
        ...(isRecord(baseRecord.data) ? baseRecord.data : {}),
        ...(isRecord(referenceRecord.data) ? referenceRecord.data : {}),
        ...(isRecord(lookupRecord.data) ? lookupRecord.data : {}),
      },
    };
  });
}

function visibleFieldSet(visibleFieldNames: readonly string[] | undefined): Set<string> | null {
  if (!visibleFieldNames) return null;
  return new Set(visibleFieldNames.filter((fieldName) => fieldName.trim().length > 0));
}

/**
 * Applies the canonical metadata-driven display hydration to records fetched
 * by document child/relation loaders. Those loaders intentionally fetch raw
 * rows directly, so they must opt into the same contract used by the generic
 * entity list and detail readers.
 */
export async function hydrateMetaEntityRecordRows(
  records: RuntimeRecordRow[],
  descriptor: MetaEntityRuntimeDescriptor | undefined,
  session: V4Session,
  headers: Record<string, string> = buildRuntimeHeaders(session),
  options?: Pick<MetaEntityRecordReadOptions, "visibleFieldNames"> & {
    diagnostics?: RuntimeListDiagnosticRecorder;
  },
): Promise<RuntimeRecordRow[]> {
  return hydrateDisplayValues(
    records,
    descriptor,
    headers,
    session,
    options?.visibleFieldNames,
    options?.diagnostics,
  );
}

async function hydrateReferenceDisplayValues(
  records: RuntimeRecordRow[],
  descriptor: MetaEntityRuntimeDescriptor | undefined,
  headers: Record<string, string>,
  _session: V4Session,
  visibleFieldNames?: readonly string[],
): Promise<RuntimeRecordRow[]> {
  if (!descriptor || records.length === 0) return records;

  const referenceFields = resolveReferenceDisplayFields(descriptor, visibleFieldNames);
  if (referenceFields.length === 0) return records;

  const hydratedRecords = records.map(cloneRuntimeRecord);
  const pending = new Map<string, { field: ReferenceDisplayField; values: Set<string> }>();

  for (const [recordIndex, record] of hydratedRecords.entries()) {
    for (const field of referenceFields) {
      const value = readRecordString(record, field.field.name) ?? readRecordString(record, field.field.columnName);
      if (!value) continue;
      if (readRecordString(record, `${field.field.name}_label`)) continue;

      const synthetic = resolveSyntheticDisplayValue(field, value);
      if (synthetic) {
        writeReferenceDisplayValue(hydratedRecords[recordIndex]!, field.field.name, synthetic);
        continue;
      }

      const key = referenceGroupKey(field);
      const item = pending.get(key) ?? { field, values: new Set<string>() };
      item.values.add(value);
      pending.set(key, item);
    }
  }

  const resolved = await resolveReferenceDisplayValueGroups([...pending.values()], headers);
  if (resolved.size === 0) return hydratedRecords;

  for (const record of hydratedRecords) {
    for (const field of referenceFields) {
      const value = readRecordString(record, field.field.name) ?? readRecordString(record, field.field.columnName);
      if (!value) continue;

      const displayValue = resolved.get(referenceValueKey(field, value));
      if (displayValue) {
        writeReferenceDisplayValue(record, field.field.name, displayValue);
      }
    }
  }

  return hydratedRecords;
}

function resolveReferenceDisplayFields(
  descriptor: MetaEntityRuntimeDescriptor,
  visibleFieldNames?: readonly string[],
): ReferenceDisplayField[] {
  const visible = visibleFieldSet(visibleFieldNames);
  return descriptor.fields
    .filter((field) => !visible || visible.has(field.name))
    .map((field): ReferenceDisplayField | null => {
      const source = resolveReferenceOptionSource(field);
      if (!source) return null;

      return {
        field,
        targetEntity: normalizeEntityCode(source.entity),
        valueField: source.valueField,
        labelField: source.labelField,
        codeField: source.codeField,
      };
    })
    .filter((field): field is ReferenceDisplayField => field !== null);
}

function resolveReferenceOptionSource(field: MetaEntityField): Extract<MetaEntityOptionSource, { kind: "reference" }> | null {
  const source = field.editor?.optionSource ?? field.optionSource;
  return source?.kind === "reference" ? source : null;
}

function resolveSyntheticDisplayValue(
  field: ReferenceDisplayField,
  value: string,
): ReferenceDisplayValue | null {
  if (field.targetEntity === "principal" && value === SYSTEM_UUID) {
    return { label: "System", code: "SYSTEM" };
  }
  return null;
}

async function resolveReferenceDisplayValueGroups(
  groups: Array<{ field: ReferenceDisplayField; values: Set<string> }>,
  headers: Record<string, string>,
): Promise<Map<string, ReferenceDisplayValue>> {
  const resolved = new Map<string, ReferenceDisplayValue>();

  await Promise.all(groups.map(async ({ field, values }) => {
    if (values.size === 0) return;

    const valueList = [...values];
    const query = buildRecordListQuery(
      { page_size: String(Math.max(DEFAULT_PAGE_SIZE, valueList.length)) },
      { [`filter.${field.valueField}`]: valueList.join(",") },
    );
    const result = await fetchRecordRows(field.targetEntity, query, headers);
    if (result.status === "unavailable") return;

    for (const targetRecord of result.records) {
      const value = readRecordString(targetRecord, field.valueField);
      if (!value) continue;

      const label = readRecordString(targetRecord, field.labelField) ?? value;
      const code = field.codeField ? readRecordString(targetRecord, field.codeField) : undefined;
      resolved.set(referenceValueKey(field, value), { label, code });
    }
  }));

  return resolved;
}

function referenceGroupKey(field: ReferenceDisplayField): string {
  return [
    field.targetEntity,
    field.valueField,
    field.labelField,
    field.codeField ?? "",
  ].join(":");
}

function referenceValueKey(field: ReferenceDisplayField, value: string): string {
  return `${referenceGroupKey(field)}:${value}`;
}

function cloneRuntimeRecord(record: RuntimeRecordRow): RuntimeRecordRow {
  const data = isRecord(record.data) ? { ...record.data } : {};
  return {
    ...record,
    data,
  };
}

function writeReferenceDisplayValue(
  record: RuntimeRecordRow,
  fieldName: string,
  value: ReferenceDisplayValue,
): void {
  const data = isRecord(record.data) ? record.data : {};
  data[`${fieldName}_label`] = value.label;
  record[`${fieldName}_label`] = value.label;

  if (value.code) {
    data[`${fieldName}_code`] = value.code;
    record[`${fieldName}_code`] = value.code;
  }

  record.data = data;
}

type LookupDomainCandidate = {
  code: string;
  inferred: boolean;
};

type LookupDisplayField = {
  field: MetaEntityField;
  domainCandidates: LookupDomainCandidate[];
  staticOptions: Map<string, string>;
};

async function hydrateLookupDisplayValues(
  records: RuntimeRecordRow[],
  descriptor: MetaEntityRuntimeDescriptor | undefined,
  headers: Record<string, string>,
  session: V4Session,
  visibleFieldNames?: readonly string[],
  diagnostics?: RuntimeListDiagnosticRecorder,
): Promise<RuntimeRecordRow[]> {
  if (!descriptor || records.length === 0) return records;

  const lookupFields = resolveLookupDisplayFields(descriptor, visibleFieldNames)
    .filter((lookupField) => records.some((record) => {
      const fieldName = lookupField.field.name;
      const value = readRecordString(record, fieldName)
        ?? readRecordString(record, lookupField.field.columnName);
      return Boolean(value) && !readRecordString(record, `${fieldName}_label`);
    }));
  if (lookupFields.length === 0) return records;

  const hydratedRecords = records.map(cloneRuntimeRecord);
  const lookupMaps = await resolveLookupDisplayMaps(lookupFields, headers, session, diagnostics);

  for (const record of hydratedRecords) {
    for (const lookupField of lookupFields) {
      const fieldName = lookupField.field.name;
      const value = readRecordString(record, fieldName) ?? readRecordString(record, lookupField.field.columnName);
      if (!value) continue;
      if (readRecordString(record, `${fieldName}_label`)) continue;

      const label = lookupMaps.get(fieldName)?.get(value)
        ?? lookupField.staticOptions.get(value)
        ?? toTitleLabel(value);
      writeReferenceDisplayValue(record, fieldName, { label });
    }
  }

  return hydratedRecords;
}

function resolveLookupDisplayFields(
  descriptor: MetaEntityRuntimeDescriptor,
  visibleFieldNames?: readonly string[],
): LookupDisplayField[] {
  const visible = visibleFieldSet(visibleFieldNames);
  return descriptor.fields
    .filter((field) => !visible || visible.has(field.name))
    .map((field): LookupDisplayField | null => {
      if (!isLookupDisplayField(descriptor, field)) return null;

      return {
        field,
        domainCandidates: resolveLookupDomains(descriptor, field),
        staticOptions: staticLookupOptions(field),
      };
    })
    .filter((field): field is LookupDisplayField => field !== null);
}

function isLookupDisplayField(descriptor: MetaEntityRuntimeDescriptor, field: MetaEntityField): boolean {
  const source = field.editor?.optionSource ?? field.optionSource;
  if (source?.kind === "lookup" || source?.kind === "static" || source?.kind === "lifecycle") return true;
  if (field.display?.renderer === "lookup_label") return true;
  if (field.enumDomainCode) return true;

  if (resolveLookupDomains(descriptor, field).length > 0
    || staticLookupOptions(field).size > 0) return true;

  return false;
}

function resolveLookupDomains(
  descriptor: MetaEntityRuntimeDescriptor,
  field: MetaEntityField,
): LookupDomainCandidate[] {
  const source = field.editor?.optionSource ?? field.optionSource;
  const explicit = (
    source?.kind === "lookup"
      ? source.domainCode
      : field.enumDomainCode
  )
    ?? readJsonString(field.lookupConfig, "domain_code")
    ?? readJsonString(field.lookupConfig, "domainCode")
    ?? readJsonString(field.lookupConfig, "lookup_domain")
    ?? readJsonString(field.lookupConfig, "lookupDomain")
    ?? readJsonString(field.lookupConfig, "domain");

  const candidates: LookupDomainCandidate[] = [];
  if (explicit) {
    candidates.push({ code: explicit, inferred: false });
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.code)) return false;
    seen.add(candidate.code);
    return true;
  });
}

async function resolveLookupDisplayMaps(
  fields: LookupDisplayField[],
  headers: Record<string, string>,
  session: V4Session,
  diagnostics?: RuntimeListDiagnosticRecorder,
): Promise<Map<string, Map<string, string>>> {
  const maps = new Map<string, Map<string, string>>();

  await Promise.all(fields.map(async (field) => {
    const domainMap = await fetchLookupDisplayMap(field, headers, session, diagnostics);
    maps.set(field.field.name, domainMap);
  }));

  return maps;
}

async function fetchLookupDisplayMap(
  field: LookupDisplayField,
  headers: Record<string, string>,
  session: V4Session,
  diagnostics?: RuntimeListDiagnosticRecorder,
): Promise<Map<string, string>> {
  const labels = new Map(field.staticOptions);
  if (field.domainCandidates.length === 0) return labels;

  for (const candidate of field.domainCandidates) {
    const values = await loadLookupDomainValues(candidate.code, headers, session, diagnostics);
    if (values.length === 0) continue;
    for (const item of values) {
      const source = field.field.editor?.optionSource ?? field.field.optionSource;
      const sourceValueField = source?.kind === "lookup" ? source.valueField : undefined;
      const code = item.code;
      const id = item.id;
      const label = item.label ?? code ?? id;
      if (!label) continue;

      const value = sourceValueField === "id"
        ? id ?? code
        : code
          ? storedLookupValue(code, field.field)
          : id;
      if (value) labels.set(value, label);
    }

    return labels;
  }

  return labels;
}

interface LookupDomainValue {
  code?: string;
  id?: string;
  label?: string;
}

async function loadLookupDomainValues(
  domainCode: string,
  headers: Record<string, string>,
  session: V4Session,
  diagnostics?: RuntimeListDiagnosticRecorder,
): Promise<LookupDomainValue[]> {
  const loader = async (): Promise<LookupDomainValue[]> => {
    const response = await fetch(
      buildRuntimeUrl(`/api/metadata/lookups/${encodeURIComponent(domainCode)}?limit=100`),
      { headers, cache: "no-store" },
    );
    if (!response.ok) throw new Error(`Lookup domain ${domainCode} returned ${response.status}.`);
    const body = await readJson(response);
    if (!isRecord(body) || !Array.isArray(body["values"])) {
      throw new Error(`Lookup domain ${domainCode} returned a malformed response.`);
    }
    const rawValues = body["values"];
    return rawValues.flatMap((item): LookupDomainValue[] => {
      if (!isRecord(item)) return [];
      const code = readJsonString(item, "code");
      const id = readJsonString(item, "id");
      const label = readJsonString(item, "name") ?? code ?? id;
      return code || id || label ? [{ code, id, label }] : [];
    });
  };

  const sessionIdentity = buildSessionConfigurationIdentity(session);
  if (!sessionIdentity) {
    const startedAt = performance.now();
    try {
      return await loader();
    } catch {
      return [];
    } finally {
      diagnostics?.record("lookup_domain", performance.now() - startedAt, "bypass", {
        parent: "lookup_hydration",
        attributes: { domainCode },
      });
    }
  }

  try {
    return await getSessionConfiguration({
      namespace: "lookup_domain",
      sessionIdentity,
      keyParts: { domainCode },
      policy: LOOKUP_DOMAIN_CACHE_POLICY,
      loader,
      onDiagnostic: diagnostics
        ? (event) => diagnostics.record("lookup_domain", event.durationMs, event.cacheState, {
            parent: "lookup_hydration",
            attributes: { domainCode, coalesced: event.coalesced },
          })
        : undefined,
    });
  } catch {
    return [];
  }
}

function staticLookupOptions(field: MetaEntityField): Map<string, string> {
  const source = field.editor?.optionSource ?? field.optionSource;
  if (source?.kind === "static") {
    return new Map(source.options.map((option) => [option.value, option.label]));
  }
  if (source?.kind === "lifecycle") {
    return new Map(
      [...source.fallbackOptions, ...source.options]
        .map((option) => [option.value, option.label]),
    );
  }

  const values = readJsonStringArray(field.constraints, "options")
    ?? readJsonStringArray(field.constraints, "values")
    ?? readJsonStringArray(field.validation, "options")
    ?? readJsonStringArray(field.validation, "values")
    ?? [];

  return new Map(values.map((value) => [value, toTitleLabel(value)]));
}

function storedLookupValue(code: string, field: MetaEntityField): string {
  const valueMap = readJsonStringRecord(field.lookupConfig, "value_map");
  if (valueMap?.[code]) return valueMap[code];

  const valueCase = readJsonString(field.lookupConfig, "value_case")?.toLowerCase();
  if (valueCase === "upper" || valueCase === "uppercase") return code.toUpperCase();
  if (valueCase === "lower" || valueCase === "lowercase") return code.toLowerCase();
  return code;
}

function readRecordString(record: RuntimeRecordRow, fieldName: string): string | undefined {
  const data = isRecord(record.data) ? record.data : {};
  const value = data[fieldName] ?? record[fieldName];
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return undefined;
}

function toTitleLabel(value: string): string {
  return value
    .split(/[-_\s]+/g)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function readJsonString(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const item = value[key];
  return typeof item === "string" && item.trim() ? item.trim() : undefined;
}

function readJsonStringArray(value: unknown, key: string): string[] | undefined {
  if (!isRecord(value)) return undefined;
  const item = value[key];
  if (!Array.isArray(item)) return undefined;
  const values = item.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
  return values.length > 0 ? values : undefined;
}

function readJsonStringRecord(value: unknown, key: string): Record<string, string> | undefined {
  if (!isRecord(value) || !isRecord(value[key])) return undefined;
  const result: Record<string, string> = {};
  for (const [recordKey, recordValue] of Object.entries(value[key])) {
    if (typeof recordValue === "string") result[recordKey] = recordValue;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

async function resolveCompanyCodeIdsForLegalEntity(
  tenantId: string,
  legalEntityId: string,
  headers: Record<string, string>,
): Promise<IdResolutionResult> {
  const query = buildRecordListQuery({}, {
    "filter.tenant_id": tenantId,
    "filter.legal_entity_id": legalEntityId,
  });
  const result = await fetchRecordRows("company_code", query, headers);
  return result.status === "ready"
    ? { status: "ready", ids: result.records.map((record) => record.id).filter(isPresentString) }
    : { status: "unavailable", message: result.message };
}

async function resolveSiteIdsForCompanyCodes(
  tenantId: string,
  companyCodeIds: string[],
  headers: Record<string, string>,
): Promise<IdResolutionResult> {
  if (companyCodeIds.length === 0) return { status: "ready", ids: [] };

  const query = buildRecordListQuery({}, {
    "filter.tenant_id": tenantId,
    "filter.company_code_id": companyCodeIds.join(","),
  });
  const result = await fetchRecordRows("site", query, headers);
  return result.status === "ready"
    ? { status: "ready", ids: result.records.map((record) => record.id).filter(isPresentString) }
    : { status: "unavailable", message: result.message };
}

type RecordRowsResult =
  | { status: "ready"; records: RuntimeRecordRow[]; pagination?: RuntimeListPagination; reasons?: Record<string, boolean>; navigation?: { hasMore: boolean; nextCursor?: string; countMode?: string; total?: number }; telemetry?: RecordRowsTelemetry }
  | { status: "unavailable"; message: string; telemetry?: RecordRowsTelemetry };

interface RecordRowsTelemetry {
  cacheState: AthyperCacheState;
  httpDurationMs: number;
  decodeDurationMs: number;
}

type IdResolutionResult =
  | { status: "ready"; ids: string[] }
  | { status: "unavailable"; message: string };

async function fetchRecordRows(
  entityCode: string,
  query: string,
  headers: Record<string, string>,
  descriptor?: MetaEntityRuntimeDescriptor,
): Promise<RecordRowsResult> {
  const pathname = `/api/records/${encodeURIComponent(entityCode)}${query}`;

  let response: Response;
  const httpStartedAt = performance.now();
  try {
    const requestHeaders: Record<string, string> = { ...headers };
    if (descriptor?.cachePolicy) {
      requestHeaders["X-Athyper-List-Cache-Mode"] = descriptor.cachePolicy.mode;
      requestHeaders["X-Athyper-List-Cache-Fresh-Seconds"] = String(descriptor.cachePolicy.freshForSeconds);
    }
    response = await fetch(buildRuntimeUrl(pathname), {
      headers: requestHeaders,
      cache: "no-store",
    });
  } catch (err) {
    // Silent catches here masked the real cause of 503 RECORDS_UNAVAILABLE
    // responses for hours during the AD drawer bring-up. Log the actual
    // network error so the next time fetch throws (TLS, ECONNREFUSED,
    // dispatcher abort, etc.) the cause is in the Next.js console instead
    // of behind a generic "Records service is unavailable" string.
    const errorText = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    const causeText = err instanceof Error && err.cause ? `; cause=${String(err.cause)}` : "";
    console.error(
      `[meta-entity-records] fetch threw: entity=${entityCode}; path=${pathname}; ` +
      `runtimeUrl=${buildRuntimeUrl(pathname)}; error=${errorText}${causeText}`,
    );
    return { status: "unavailable", message: "Records service is unavailable." };
  }

  const httpDurationMs = performance.now() - httpStartedAt;
  const cacheState = recordListCacheState(response.headers.get("X-List-Cache"));

  if (!response.ok) {
    const decodeStartedAt = performance.now();
    const errorBody = await readJson(response);
    return {
      status: "unavailable",
      message: formatRecordsServiceError(response.status, errorBody),
      telemetry: {
        cacheState,
        httpDurationMs,
        decodeDurationMs: performance.now() - decodeStartedAt,
      },
    };
  }

  const decodeStartedAt = performance.now();
  const json = await readJson(response);
  const decodeDurationMs = performance.now() - decodeStartedAt;
  const data = isRecord(json) && Array.isArray(json["data"]) ? json["data"] : [];
  return {
    status: "ready",
    records: data.map((row) => normalizeRuntimeRecord(row, descriptor)).filter(isRuntimeRecordRow),
    pagination: readRuntimePagination(json),
    reasons: readReasons(json),
    navigation: readKeysetNavigation(json),
    telemetry: { cacheState, httpDurationMs, decodeDurationMs },
  };
}

function recordListCacheState(value: string | null): AthyperCacheState {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "hit") return "hit";
  if (normalized === "miss") return "miss";
  if (normalized === "stale") return "stale";
  return "bypass";
}

function entityQueryMode(descriptor?: MetaEntityRuntimeDescriptor): "off" | "serve" {
  return descriptor ? "serve" : "off";
}

function isFullyLoaded(rowCount: number, pagination: RuntimeListPagination | undefined): boolean {
  if (!pagination || pagination.page !== 1) return false;
  if (typeof pagination.total !== "number") return false;
  return rowCount >= pagination.total;
}

function readReasons(value: unknown): Record<string, boolean> | undefined {
  if (!isRecord(value) || !isRecord(value["reasons"])) return undefined;
  const out: Record<string, boolean> = {};
  for (const [key, item] of Object.entries(value["reasons"])) {
    if (typeof item === "boolean") out[key] = item;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function readRuntimePagination(value: unknown): RuntimeListPagination | undefined {
  if (!isRecord(value) || !isRecord(value["pagination"])) return undefined;
  const pagination = value["pagination"];
  const total = readNonNegativeInteger(pagination["total"]);
  const page = readPositiveInteger(pagination["page"]);
  const pageSize = readPositiveInteger(pagination["page_size"]);
  const totalPages = readNonNegativeInteger(pagination["total_pages"]);
  return total !== undefined && page !== undefined && pageSize !== undefined && totalPages !== undefined
    ? { total, page, pageSize, totalPages }
    : undefined;
}

function readKeysetNavigation(value: unknown): { hasMore: boolean; nextCursor?: string; countMode?: string; total?: number } | undefined {
  if (!isRecord(value) || !isRecord(value["pagination"])) return undefined;
  const pagination = value["pagination"];
  if (typeof pagination["has_more"] !== "boolean") return undefined;
  return {
    hasMore: pagination["has_more"],
    ...(typeof pagination["next_cursor"] === "string" ? { nextCursor: pagination["next_cursor"] } : {}),
    ...(typeof pagination["count_mode"] === "string" ? { countMode: pagination["count_mode"] } : {}),
    ...(readNonNegativeInteger(pagination["total"]) !== undefined ? { total: readNonNegativeInteger(pagination["total"]) } : {}),
  };
}

function readPositiveInteger(value: unknown): number | undefined {
  const item = typeof value === "number" ? value : Number(value);
  return Number.isFinite(item) && item > 0 ? Math.floor(item) : undefined;
}

function readNonNegativeInteger(value: unknown): number | undefined {
  const item = typeof value === "number" ? value : Number(value);
  return Number.isFinite(item) && item >= 0 ? Math.floor(item) : undefined;
}

function normalizeRuntimeRecord(value: unknown, descriptor?: MetaEntityRuntimeDescriptor): RuntimeRecordRow | null {
  if (!isRecord(value)) return null;

  const nestedData = isRecord(value["data"]) ? value["data"] : undefined;
  const primaryKey = descriptor?.storage?.primaryKey;
  const rawId = value["id"]
    ?? (primaryKey ? value[primaryKey] : undefined)
    ?? (primaryKey && nestedData ? nestedData[primaryKey] : undefined);
  const id = typeof rawId === "string" || typeof rawId === "number"
    ? String(rawId)
    : undefined;

  return {
    ...value,
    id,
    data: nestedData ?? value,
  };
}

function isRuntimeRecordRow(value: RuntimeRecordRow | null): value is RuntimeRecordRow {
  return value !== null;
}

function isPresentString(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

async function readJson(response: Response): Promise<unknown | null> {
  try {
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

export function formatRecordsServiceError(status: number, body: unknown): string {
  if (isRecord(body)) {
    const code = typeof body["error"] === "string"
      ? body["error"]
      : typeof body["code"] === "string"
        ? body["code"]
        : undefined;
    const message = typeof body["message"] === "string" ? body["message"].trim() : "";
    if (code && message) return `Records service returned ${status} (${code}): ${message}`;
    if (code) return `Records service returned ${status} (${code}).`;
    if (message) return `Records service returned ${status}: ${message}`;
  }
  return `Records service returned ${status}.`;
}

export function normalizeRouteRecordId(routeRecordId: string): string {
  let normalized = routeRecordId.trim();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const decoded = decodeURIComponent(normalized);
      if (decoded === normalized) break;
      normalized = decoded;
    } catch {
      break;
    }
  }

  return normalized;
}

function normalizeEntityCode(routeEntity: string): string {
  const parts = routeEntity.trim().split(".").filter(Boolean);
  const entityCode = (parts.at(-1) ?? "").replace(/-/g, "_");
  return ENTITY_CODE_ALIASES[entityCode] ?? entityCode;
}

function sameRecordValue(value: string | undefined, expected: string): boolean {
  if (!value) return false;
  return normalizeLookupText(value) === normalizeLookupText(expected);
}

function normalizeLookupText(value: string): string {
  return normalizeRouteRecordId(value).replace(/\s+/g, " ").trim().toLowerCase();
}

function asRecordOrUndefined(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
