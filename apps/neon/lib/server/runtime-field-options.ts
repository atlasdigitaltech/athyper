// GET /api/runtime/v1/entities/[entity]/fields/[field]/options — typed option resolution for one field.
// Returns options from one of three sources: static (declared in descriptor), lookup (control.lookup domain),
// or reference (records of another entity, scoped by descriptor relation).
import "server-only";

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { documentRuntimeFeatureFlags } from "@/lib/server/document-runtime-feature-flags";
import type { MetaEntityField, MetaEntityOptionSource, MetaEntityRuntimeDescriptor } from "@athyper/runtime-contracts";
import type { RuntimeRecordRow } from "@athyper/runtime-shared/core";
import { getMetaEntityRecordDetail, getMetaEntityRecordList } from "@/lib/server/meta-entity-records";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";

interface RuntimeOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
  /**
   * Source-change hydration metadata. Set when the value still resolves to a
   * row, but that row no longer matches the field's dependent_filter against
   * the current form source. Picker UI renders a "needs review" affordance
   * instead of clearing silently.
   */
  _dependency?: {
    reason: "stale_source";
    sourceField: string;
  };
}

interface LookupDomainCandidate {
  code: string;
  inferred: boolean;
}

export interface RuntimeFieldOptionsInput {
  descriptor: MetaEntityRuntimeDescriptor;
  fieldName: string;
  query?: string;
  currentValue?: string;
  context?: Record<string, string>;
  runtimeHeaders: ReturnType<typeof buildRuntimeHeaders>;
  signal?: AbortSignal;
}

type CachedOptionResponse = {
  body: string;
  status: number;
  headers: Record<string, string>;
  expiresAt: number;
};

const OPTION_CACHE_LIMIT = 500;
const optionCache = new Map<string, CachedOptionResponse>();

export async function resolveRuntimeFieldOptions(input: RuntimeFieldOptionsInput): Promise<NextResponse> {
  throwIfAborted(input.signal);
  if (!documentRuntimeFeatureFlags.fieldOptionsServiceV2) {
    return resolveRuntimeFieldOptionsUncached(input);
  }
  const field = input.descriptor.fields.find((item) => item.name === input.fieldName || item.columnName === input.fieldName);
  const source = field ? resolveDeclaredOptionSource(field) : undefined;
  const sourceKind = source?.kind === "static"
    ? "static"
    : source?.kind === "lookup" || (field && isLookupField(input.descriptor, field))
      ? "lookup"
      : "reference";
  const cacheKey = buildOptionCacheKey(input, sourceKind);
  const cached = readOptionCache(cacheKey);
  if (cached) return responseFromCache(cached);

  const response = await resolveRuntimeFieldOptionsUncached(input);
  if (response.ok) {
    writeOptionCache(cacheKey, {
      body: await response.clone().text(),
      status: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
      expiresAt: Date.now() + (sourceKind === "reference" ? 15_000 : 300_000),
    });
  }
  return response;
}

/**
 * Resolve one field without repeating route authentication or parent descriptor
 * loading. Both the compatibility GET route and the document batch route call
 * this function after establishing their own trusted request context.
 */
async function resolveRuntimeFieldOptionsUncached({
  descriptor,
  fieldName,
  query = "",
  currentValue = "",
  context = {},
  runtimeHeaders,
  signal,
}: RuntimeFieldOptionsInput): Promise<NextResponse> {
  throwIfAborted(signal);
  const field = descriptor.fields.find((item) => item.name === fieldName || item.columnName === fieldName);
  if (!field) {
    return NextResponse.json(
      { error: "FIELD_NOT_FOUND", message: "This field is not registered for runtime option resolution." },
      { status: 404 },
    );
  }

  const optionSource = resolveDeclaredOptionSource(field);

  if (optionSource?.kind === "static") {
    return NextResponse.json({
      options: filterOptions(includeCurrentValue(optionSource.options, currentValue), query),
      source: { kind: "static" },
    });
  }

  if (optionSource?.kind === "lookup" || isLookupField(descriptor, field)) {
    return lookupOptions(descriptor, field, query, currentValue, runtimeHeaders, optionSource, signal);
  }

  const targetEntity = resolveReferenceEntity(descriptor, field, optionSource);
  if (!targetEntity) {
    return NextResponse.json(
      { error: "OPTION_SOURCE_NOT_FOUND", message: "This field does not declare a lookup or reference source." },
      { status: 400 },
    );
  }

  return referenceOptions({
    sourceEntity: descriptor.entityCode,
    sourceDescriptor: descriptor,
    sourceField: field,
    optionSource,
    targetEntity,
    query,
    currentValue,
    context,
    signal,
  });
}

function buildOptionCacheKey(input: RuntimeFieldOptionsInput, sourceKind: "static" | "lookup" | "reference"): string {
  const compiledHash = input.descriptor.audit.compiledHash ?? input.descriptor.audit.descriptorHash ?? "unversioned";
  const tenantScope = headerValue(input.runtimeHeaders, "x-tenant-id")
    || headerValue(input.runtimeHeaders, "x-org")
    || "tenant-unavailable";
  const common = [
    sourceKind,
    tenantScope,
    input.descriptor.entityCode,
    input.fieldName,
    compiledHash,
    input.query ?? "",
    input.currentValue ?? "",
  ];
  if (sourceKind !== "reference") return JSON.stringify(common);
  const authorizationScope = createHash("sha256")
    .update(JSON.stringify(Object.entries(input.runtimeHeaders).sort(([left], [right]) => left.localeCompare(right))))
    .digest("base64url");
  return JSON.stringify([
    ...common,
    authorizationScope,
    Object.entries(input.context ?? {}).sort(([left], [right]) => left.localeCompare(right)),
  ]);
}

function headerValue(headers: Record<string, string>, name: string): string {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  return entry?.[1] ?? "";
}

function readOptionCache(key: string): CachedOptionResponse | undefined {
  const entry = optionCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    optionCache.delete(key);
    return undefined;
  }
  optionCache.delete(key);
  optionCache.set(key, entry);
  return entry;
}

function writeOptionCache(key: string, entry: CachedOptionResponse): void {
  optionCache.delete(key);
  optionCache.set(key, entry);
  while (optionCache.size > OPTION_CACHE_LIMIT) {
    const oldest = optionCache.keys().next().value as string | undefined;
    if (!oldest) break;
    optionCache.delete(oldest);
  }
}

function responseFromCache(entry: CachedOptionResponse): NextResponse {
  return new NextResponse(entry.body, { status: entry.status, headers: entry.headers });
}

function isLookupField(descriptor: MetaEntityRuntimeDescriptor, field: MetaEntityField): boolean {
  return resolveLookupDomains(descriptor, field).length > 0
    || field.dataType.toLowerCase() === "enum"
    || field.dataType.toLowerCase() === "lifecycle_state"
    || Boolean(
      readStringArray(field.constraints, "options")
        ?? readStringArray(field.constraints, "values")
        ?? readStringArray(field.validation, "options")
        ?? readStringArray(field.validation, "values"),
    );
}

function resolveDeclaredOptionSource(field: MetaEntityField): MetaEntityOptionSource | undefined {
  const source = field.editor?.optionSource ?? field.optionSource;
  return source?.kind === "none" ? undefined : source;
}

function resolveLookupDomains(
  descriptor: MetaEntityRuntimeDescriptor,
  field: MetaEntityField,
  optionSource?: MetaEntityOptionSource,
): LookupDomainCandidate[] {
  const explicit = (
    optionSource?.kind === "lookup"
      ? optionSource.domainCode
      : field.enumDomainCode
  )
    ?? readString(field.lookupConfig, "domain_code")
    ?? readString(field.lookupConfig, "domainCode")
    ?? readString(field.lookupConfig, "lookup_domain")
    ?? readString(field.lookupConfig, "lookupDomain")
    ?? readString(field.lookupConfig, "domain");

  const candidates: LookupDomainCandidate[] = [];
  if (explicit) {
    candidates.push({ code: explicit, inferred: false });
  }

  const dataType = field.dataType.toLowerCase();
  if (!explicit && (field.name.endsWith("_type") || isStatusField(field.name) || dataType === "enum" || dataType === "lifecycle_state")) {
    const schema = descriptor.source.tableSchema;
    // Status fields often have entity-specific domains (`tenant.purchase_invoice_status`)
    // before falling back to a shared one (`tenant.status`). Order matters.
    if (isStatusField(field.name)) {
      candidates.push(
        { code: `${schema}.${descriptor.entityCode}_${field.name}`, inferred: true },
        { code: `${schema}.${field.name}`, inferred: true },
        { code: field.name, inferred: true },
      );
    } else {
      candidates.push(
        { code: `${schema}.${field.name}`, inferred: true },
        { code: `${schema}.${descriptor.entityCode}_${field.name}`, inferred: true },
        { code: field.name, inferred: true },
      );
    }
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.code)) return false;
    seen.add(candidate.code);
    return true;
  });
}

async function lookupOptions(
  descriptor: MetaEntityRuntimeDescriptor,
  field: MetaEntityField,
  query: string,
  currentValue: string,
  runtimeHeaders: ReturnType<typeof buildRuntimeHeaders>,
  optionSource?: MetaEntityOptionSource,
  signal?: AbortSignal,
) {
  const domainCandidates = resolveLookupDomains(descriptor, field, optionSource);
  const staticOptions = staticOptionsFromField(field, query, currentValue, optionSource);
  if (domainCandidates.length === 0) {
    return NextResponse.json({ options: staticOptions });
  }

  let lastFailure: { domainCode: string; status: number } | null = null;
  for (const candidate of domainCandidates) {
    const params = new URLSearchParams({ limit: "100" });
    if (query.trim()) params.set("q", query.trim());

    const response = await fetch(
      buildRuntimeUrl(`/api/metadata/lookups/${encodeURIComponent(candidate.code)}?${params}`),
      {
        headers: runtimeHeaders,
        cache: "no-store",
        signal,
      },
    );

    if (!response.ok) {
      lastFailure = { domainCode: candidate.code, status: response.status };
      // Hard-fail when the domain was explicitly declared; soft-fall-through for inferred candidates.
      if (!candidate.inferred && staticOptions.length === 0) {
        return NextResponse.json(
          { error: "LOOKUP_UNAVAILABLE", message: `Lookup domain '${candidate.code}' returned ${response.status}.` },
          { status: response.status },
        );
      }
      continue;
    }

    const body = await readJson(response);
    const rawValues = isRecord(body) && Array.isArray(body["values"]) ? body["values"] : [];
    const options = rawValues
      .filter(isRecord)
      .map((item): RuntimeOption | null => {
        const sourceValueField = optionSource?.kind === "lookup" ? optionSource.valueField : undefined;
        const value = sourceValueField === "id"
          ? readString(item, "id") ?? readString(item, "code")
          : readString(item, "code");
        const label = readString(item, "name") ?? value;
        if (!value || !label) return null;
        return {
          value: sourceValueField === "id" ? value : storedLookupValue(value, field),
          label,
          description: readString(item, "description") ?? undefined,
          disabled: readString(item, "status") !== "active",
        };
      })
      .filter((item): item is RuntimeOption => Boolean(item))
      .sort((left, right) => Number(left.disabled) - Number(right.disabled) || left.label.localeCompare(right.label));

    return NextResponse.json({
      options: filterOptions(includeCurrentValue(options, currentValue), query),
      source: { kind: "lookup", domainCode: candidate.code },
    });
  }

  if (staticOptions.length > 0) {
    return NextResponse.json({
      options: staticOptions,
      source: { kind: "static" },
    });
  }

  return NextResponse.json(
    {
      error: "LOOKUP_UNAVAILABLE",
      message: lastFailure
        ? `Lookup domain '${lastFailure.domainCode}' returned ${lastFailure.status}.`
        : "Lookup options are unavailable for this field.",
    },
    { status: lastFailure?.status ?? 404 },
  );
}

function staticOptionsFromField(
  field: MetaEntityField,
  query: string,
  currentValue: string,
  optionSource?: MetaEntityOptionSource,
): RuntimeOption[] {
  if (optionSource?.kind === "static") {
    return filterOptions(includeCurrentValue(optionSource.options, currentValue), query);
  }

  const values = readStringArray(field.constraints, "options")
    ?? readStringArray(field.constraints, "values")
    ?? readStringArray(field.validation, "options")
    ?? readStringArray(field.validation, "values")
    ?? fallbackLookupValues(field);

  const options = values.map((value) => ({
    value,
    label: titleLabel(value),
  }));

  return filterOptions(includeCurrentValue(options, currentValue), query);
}

function fallbackLookupValues(field: MetaEntityField): string[] {
  if (isStatusField(field.name)) return ["active", "inactive", "draft", "archived"];
  return [];
}

function storedLookupValue(code: string, field: MetaEntityField): string {
  const valueMap = readStringRecord(field.lookupConfig, "value_map");
  if (valueMap?.[code]) return valueMap[code];

  const valueCase = readString(field.lookupConfig, "value_case")?.toLowerCase();
  if (valueCase === "upper" || valueCase === "uppercase") return code.toUpperCase();
  if (valueCase === "lower" || valueCase === "lowercase") return code.toLowerCase();
  return code;
}

async function referenceOptions({
  sourceEntity,
  sourceDescriptor,
  sourceField,
  optionSource,
  targetEntity,
  query,
  currentValue,
  context,
  signal,
}: {
  sourceEntity: string;
  sourceDescriptor: MetaEntityRuntimeDescriptor;
  sourceField: MetaEntityField;
  optionSource?: MetaEntityOptionSource;
  targetEntity: string;
  query: string;
  currentValue: string;
  context: Record<string, string>;
  signal?: AbortSignal;
}) {
  throwIfAborted(signal);
  const targetDescriptor = await getMetaEntityRuntimeDescriptor(targetEntity);
  if (!targetDescriptor?.capabilities.canRead) {
    return NextResponse.json(
      { error: "REFERENCE_NOT_READABLE", message: "The referenced entity is not readable in this runtime contract." },
      { status: 403 },
    );
  }

  const searchParams = buildReferenceSearchParams(sourceField, query, context, optionSource, targetDescriptor);
  const list = await getMetaEntityRecordList(targetEntity, searchParams, targetDescriptor);
  throwIfAborted(signal);
  if (list.state.status === "unavailable") {
    return NextResponse.json(
      {
        error: "REFERENCE_OPTIONS_UNAVAILABLE",
        message: list.state.message ?? "Reference options are unavailable.",
      },
      { status: 503 },
    );
  }

  const currentRecordId = context[sourceDescriptor.storage?.primaryKey ?? "id"]
    ?? context["id"]
    ?? context["record_id"]
    ?? "";
  const orderedRecords = applyDefaultOrder(list.records, sourceField);
  const options = orderedRecords
    .filter((record) => !isSelfParentOption(sourceEntity, targetEntity, sourceField, record, currentRecordId, targetDescriptor))
    .map((record) => recordToOption(record, targetDescriptor, sourceField, optionSource))
    .filter((item): item is RuntimeOption => Boolean(item));

  const hydrated = currentValue && !options.some((option) => option.value === currentValue)
    ? await hydrateReferenceOption(targetEntity, currentValue, targetDescriptor, sourceField, optionSource, context)
    : null;

  return NextResponse.json({
    options: hydrated ? [hydrated, ...options] : options,
  });
}

function applyDefaultOrder(records: RuntimeRecordRow[], field: MetaEntityField): RuntimeRecordRow[] {
  const order = readStringArray(field.lookupConfig, "default_order")
    ?? readStringArray(field.lookupConfig, "defaultOrder")
    ?? readStringArray(field.referenceConfig, "default_order")
    ?? readStringArray(field.referenceConfig, "defaultOrder")
    ?? [];
  if (order.length === 0) return records;

  return [...records].sort((left, right) => {
    for (const rawKey of order) {
      const desc = rawKey.startsWith("-");
      const key = desc ? rawKey.slice(1) : rawKey;
      if (!key) continue;
      const cmp = compareRecordValue(recordRawValue(left, key), recordRawValue(right, key));
      if (cmp !== 0) return desc ? -cmp : cmp;
    }
    return 0;
  });
}

function compareRecordValue(left: unknown, right: unknown): number {
  if (left === right) return 0;
  if (left === null || left === undefined || left === "") return 1;
  if (right === null || right === undefined || right === "") return -1;
  if (typeof left === "boolean" || typeof right === "boolean") {
    return Number(Boolean(left)) - Number(Boolean(right));
  }
  const leftNumber = typeof left === "number" ? left : Number.NaN;
  const rightNumber = typeof right === "number" ? right : Number.NaN;
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return String(left).localeCompare(String(right));
}

function buildReferenceSearchParams(
  field: MetaEntityField,
  query: string,
  context: Record<string, string>,
  optionSource?: MetaEntityOptionSource,
  targetDescriptor?: MetaEntityRuntimeDescriptor,
): Record<string, string> {
  const params: Record<string, string> = {
    page: "1",
    page_size: String(readNumber(field.referenceConfig, "page_size") ?? readNumber(field.referenceConfig, "pageSize") ?? 20),
  };
  if (query.trim()) params.q = query.trim();

  for (const config of [field.referenceConfig, field.lookupConfig]) {
    for (const [filterField, value] of Object.entries(readFilterRecord(config))) {
      params[`filter.${filterField}`] = value;
    }
  }
  if (optionSource?.kind === "reference" && optionSource.filters) {
    for (const [filterField, value] of Object.entries(optionSource.filters)) {
      if (value !== null && value !== undefined && value !== "") {
        params[`filter.${filterField}`] = Array.isArray(value) ? value.map(String).join(",") : String(value);
      }
    }
  }

  const dependency = readRecord(field.referenceConfig, "dependent_filter")
    ?? readRecord(field.lookupConfig, "dependent_filter");
  const sourceField = (optionSource?.kind === "reference" ? optionSource.dependsOn?.field : undefined)
    ?? readString(dependency, "source_field");
  const targetField = (optionSource?.kind === "reference" ? optionSource.dependsOn?.targetField : undefined)
    ?? readString(dependency, "target_field")
    ?? sourceField;
  if (sourceField && targetField) {
    const sourceValue = context[sourceField];
    const emptyBehavior = readString(dependency, "empty_behavior");
    if (sourceValue) {
      params[`filter.${targetField}`] = sourceValue;
    } else if (emptyBehavior !== "all") {
      // `filter.id=in:` returns no rows — used when the dependency parent has no value
      // and the field is required to return an empty list rather than the full table.
      params[`filter.${targetDescriptor?.storage?.primaryKey ?? "id"}`] = "in:";
    }
  }

  applyLookupScopeFilters(field, context, params, targetDescriptor);

  return params;
}

function applyLookupScopeFilters(
  field: MetaEntityField,
  context: Record<string, string>,
  params: Record<string, string>,
  targetDescriptor?: MetaEntityRuntimeDescriptor,
): void {
  const scope = readRecord(field.lookupConfig, "scope");
  if (!scope) return;

  const kind = readString(scope, "kind");
  if (!kind) return;

  if (kind === "field_equal") {
    const sourceField = readString(scope, "source_field") ?? readString(scope, "sourceField");
    const targetField = readString(scope, "target_field") ?? readString(scope, "targetField") ?? sourceField;
    const sourceValue = sourceField ? context[sourceField] : "";
    if (sourceField && targetField) {
      if (sourceValue) params[`filter.${targetField}`] = sourceValue;
      else params[`filter.${targetDescriptor?.storage?.primaryKey ?? "id"}`] = "in:";
    }
    return;
  }

  if (kind === "supplier_addresses") {
    const sourceField = readString(scope, "source_field") ?? readString(scope, "sourceField") ?? "supplier_id";
    const supplierId = context[sourceField];
    if (supplierId) params["filter.supplier_id"] = supplierId;
    else params[`filter.${targetDescriptor?.storage?.primaryKey ?? "id"}`] = "in:";
    return;
  }

  if (kind === "site_or_company_addresses") {
    const sourceField = readString(scope, "source_field") ?? readString(scope, "sourceField") ?? "site_id";
    const headerField = readString(scope, "header_field") ?? readString(scope, "headerField") ?? "company_code_id";
    const siteId = context[sourceField];
    const companyCodeId = context[headerField];
    if (siteId) {
      params["filter.site_id"] = siteId;
    } else if (companyCodeId) {
      params["filter.company_code_id"] = companyCodeId;
    } else {
      params[`filter.${targetDescriptor?.storage?.primaryKey ?? "id"}`] = "in:";
    }
    return;
  }

  if (kind === "company_code_addresses") {
    const headerField = readString(scope, "header_field") ?? readString(scope, "headerField") ?? "company_code_id";
    const companyCodeId = context[headerField];
    if (companyCodeId) params["filter.company_code_id"] = companyCodeId;
    else params[`filter.${targetDescriptor?.storage?.primaryKey ?? "id"}`] = "in:";
  }
}

async function hydrateReferenceOption(
  targetEntity: string,
  value: string,
  descriptor: MetaEntityRuntimeDescriptor,
  sourceField: MetaEntityField,
  optionSource?: MetaEntityOptionSource,
  context?: Record<string, string>,
): Promise<RuntimeOption | null> {
  const valueField = referenceOptionValueField(sourceField, optionSource, descriptor);
  let record: RuntimeRecordRow | null = null;
  if (valueField !== "id") {
    const list = await getMetaEntityRecordList(
      targetEntity,
      { page: "1", page_size: "1", [`filter.${valueField}`]: value },
      descriptor,
    );
    if (list.state.status === "unavailable") return null;
    record = list.records[0] ?? null;
  } else {
    const detail = await getMetaEntityRecordDetail(targetEntity, value, descriptor);
    if (detail.state.status === "unavailable" || !detail.record) return null;
    record = detail.record;
  }
  if (!record) return null;

  const option = recordToOption(record, descriptor, sourceField, optionSource);
  if (!option) return null;

  // ── Dependency check ────────────────────────────────────────────────────────
  // If the field declares a dependent_filter, re-validate the hydrated row
  // against the current form's source value (passed in via context.*). When
  // the row no longer matches (source changed and target value is stale),
  // surface as disabled with _dependency metadata so the picker UI can render
  // a "needs review" affordance instead of silently showing a stale label.
  // Spec: docs/specs/entity_field_defaults.md §5 (bff_on_load_hydrate)
  if (context) {
    const dependency = readRecord(sourceField.referenceConfig, "dependent_filter")
      ?? readRecord(sourceField.lookupConfig, "dependent_filter");
    const sourceFieldName = (optionSource?.kind === "reference" ? optionSource.dependsOn?.field : undefined)
      ?? readString(dependency, "source_field");
    const targetFieldName = (optionSource?.kind === "reference" ? optionSource.dependsOn?.targetField : undefined)
      ?? readString(dependency, "target_field")
      ?? sourceFieldName;
    if (sourceFieldName && targetFieldName) {
      const sourceValue = context[sourceFieldName];
      if (sourceValue) {
        const rowSourceValue = recordValue(record, targetFieldName);
        if (rowSourceValue && rowSourceValue !== sourceValue) {
          return {
            ...option,
            disabled: true,
            _dependency: { reason: "stale_source", sourceField: sourceFieldName },
          } as RuntimeOption;
        }
      }
    }
  }

  return option;
}

function referenceOptionValueField(
  sourceField: MetaEntityField,
  optionSource?: MetaEntityOptionSource,
  descriptor?: MetaEntityRuntimeDescriptor,
): string {
  return (optionSource?.kind === "reference" ? optionSource.valueField : undefined)
    ?? readString(sourceField.referenceConfig, "value_field")
    ?? readString(sourceField.referenceConfig, "target_field")
    ?? descriptor?.storage?.primaryKey
    ?? "id";
}

function recordToOption(
  record: RuntimeRecordRow,
  descriptor: MetaEntityRuntimeDescriptor,
  sourceField: MetaEntityField,
  optionSource?: MetaEntityOptionSource,
): RuntimeOption | null {
  const valueField = referenceOptionValueField(sourceField, optionSource, descriptor);
  const labelField = (optionSource?.kind === "reference" ? optionSource.labelField : undefined)
    ?? readString(sourceField.referenceConfig, "label_field")
    ?? readString(sourceField.referenceConfig, "display_field")
    ?? descriptor.fields.find((field) => field.name === "name")?.name
    ?? descriptor.fields.find((field) => field.name === "code")?.name
    ?? "id";
  const picker = readRecord(sourceField.referenceConfig, "picker");
  const codeField = (optionSource?.kind === "reference" ? optionSource.codeField : undefined)
    ?? readString(sourceField.referenceConfig, "code_field")
    ?? readString(picker, "code_field")
    ?? descriptor.fields.find((field) => field.name === "code")?.name;
  const descriptionField = (optionSource?.kind === "reference" ? optionSource.descriptionField : undefined)
    ?? readString(sourceField.referenceConfig, "description_field")
    ?? descriptor.fields.find((field) => field.name === "description")?.name;

  const value = recordValue(record, valueField);
  if (!value) return null;

  const label = recordValue(record, labelField) ?? value;
  const code = codeField ? recordValue(record, codeField) : null;
  const description = descriptionField ? recordValue(record, descriptionField) : null;
  const showCode = readBoolean(sourceField.referenceConfig, "show_code")
    ?? readBoolean(picker, "show_code")
    ?? true;
  const displayFormat = sourceField.display?.format ?? "label_code";
  const displayLabel = formatReferenceLabel(label, code, showCode, displayFormat);

  return {
    value,
    label: displayLabel,
    description: description ?? undefined,
  };
}

function formatReferenceLabel(
  label: string,
  code: string | null,
  showCode: boolean,
  format: string,
): string {
  if (!showCode || !code || code === label) return label;
  if (format === "code") return code;
  if (format === "code_label") return `${code} - ${label}`;
  return `${label} (${code})`;
}

function resolveReferenceEntity(
  descriptor: MetaEntityRuntimeDescriptor,
  field: MetaEntityField,
  optionSource?: MetaEntityOptionSource,
): string | null {
  if (optionSource?.kind === "reference") return optionSource.entity;
  if (field.referenceEntity) return field.referenceEntity;

  const explicit = readString(field.referenceConfig, "target_entity")
    ?? readString(field.referenceConfig, "ref_entity")
    ?? readString(field.referenceConfig, "entity_code")
    ?? readString(field.referenceConfig, "entity");
  if (explicit) return explicit;

  // Convention-over-config inference: `<name>_id` columns point at `<name>` entity.
  const name = field.name;
  if (name === "parent_id") return descriptor.entityCode;
  if (name.startsWith("parent_") && name.endsWith("_id")) return name.slice("parent_".length, -"_id".length);
  if (name.endsWith("_id")) return name.slice(0, -"_id".length);
  if (field.dataType.toLowerCase() === "reference") return descriptor.entityCode;
  return null;
}

function isSelfParentOption(
  sourceEntity: string,
  targetEntity: string,
  field: MetaEntityField,
  record: RuntimeRecordRow,
  currentRecordId: string,
  targetDescriptor?: MetaEntityRuntimeDescriptor,
): boolean {
  if (!currentRecordId || sourceEntity !== targetEntity) return false;
  const fieldName = field.name.toLowerCase();
  if (fieldName !== "parent_id" && !fieldName.startsWith("parent_")) return false;
  const primaryKey = targetDescriptor?.storage?.primaryKey ?? "id";
  return recordValue(record, primaryKey) === currentRecordId;
}

function isStatusField(fieldName: string): boolean {
  return fieldName === "status" || fieldName.endsWith("_status");
}

function includeCurrentValue(options: RuntimeOption[], value: string): RuntimeOption[] {
  if (!value || options.some((option) => option.value === value)) return options;
  return [{ value, label: value, disabled: true }, ...options];
}

function filterOptions(options: RuntimeOption[], query: string): RuntimeOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter((option) => (
    option.value.toLowerCase().includes(q)
    || option.label.toLowerCase().includes(q)
    || option.description?.toLowerCase().includes(q)
  ));
}

function readContext(searchParams: URLSearchParams): Record<string, string> {
  const context: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    if (key.startsWith("context.") && value) {
      context[key.slice("context.".length)] = value;
    }
  }
  return context;
}

function readFilterRecord(value: unknown): Record<string, string> {
  const filters = readRecord(value, "filters");
  if (!filters) return {};
  return Object.fromEntries(
    Object.entries(filters)
      .map(([key, item]) => [key, Array.isArray(item) ? item.map(String).join(",") : String(item ?? "")] as const)
      .filter((entry) => entry[1] !== ""),
  );
}

function readStringRecord(value: unknown, key: string): Record<string, string> | undefined {
  const record = readRecord(value, key);
  if (!record) return undefined;
  return Object.fromEntries(
    Object.entries(record)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function readStringArray(value: unknown, key: string): string[] | undefined {
  const record = asRecord(value);
  const item = record?.[key];
  if (!Array.isArray(item)) return undefined;
  return item.filter((entry): entry is string => typeof entry === "string");
}

function readRecord(value: unknown, key: string): Record<string, unknown> | null {
  const record = asRecord(value);
  return asRecord(record?.[key]);
}

function readString(value: unknown, key: string): string | undefined {
  const record = asRecord(value);
  const item = record?.[key];
  return typeof item === "string" && item.trim() ? item.trim() : undefined;
}

function readNumber(value: unknown, key: string): number | undefined {
  const record = asRecord(value);
  const item = record?.[key];
  return typeof item === "number" && Number.isFinite(item) ? item : undefined;
}

function readBoolean(value: unknown, key: string): boolean | undefined {
  const record = asRecord(value);
  const item = record?.[key];
  return typeof item === "boolean" ? item : undefined;
}

function recordValue(record: RuntimeRecordRow, fieldName: string): string | null {
  const value = recordRawValue(record, fieldName);
  return value === null || value === undefined || value === "" ? null : String(value);
}

function recordRawValue(record: RuntimeRecordRow, fieldName: string): unknown {
  const data = asRecord(record.data) ?? {};
  return data[fieldName] ?? record[fieldName];
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return asRecord(value) !== null;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException("Request aborted.", "AbortError");
  }
}

function titleLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
