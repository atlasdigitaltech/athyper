import { NextResponse } from "next/server";
import type { MetaEntityField, MetaEntityOptionSource, MetaEntityRuntimeDescriptor } from "@athyper/runtime-contracts";
import type { RuntimeRecordRow } from "@athyper/runtime-shared/core";
import { getMetaEntityRecordDetail, getMetaEntityRecordList } from "@/lib/server/meta-entity-records";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import { getNeonServerSession } from "@/lib/server/session";

interface RuntimeOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

interface LookupDomainCandidate {
  code: string;
  inferred: boolean;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ entity: string; field: string }> },
) {
  const { entity, field: fieldName } = await params;
  const descriptor = await getMetaEntityRuntimeDescriptor(entity);
  const field = descriptor?.fields.find((item) => item.name === fieldName || item.columnName === fieldName);

  if (!descriptor || !field) {
    return NextResponse.json(
      { error: "FIELD_NOT_FOUND", message: "This field is not registered for runtime option resolution." },
      { status: 404 },
    );
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const currentValue = url.searchParams.get("value") ?? "";
  const context = readContext(url.searchParams);
  const optionSource = resolveDeclaredOptionSource(field);

  if (optionSource?.kind === "static") {
    return NextResponse.json({
      options: filterOptions(includeCurrentValue(optionSource.options, currentValue), query),
      source: { kind: "static" },
    });
  }

  if (optionSource?.kind === "lookup" || isLookupField(descriptor, field)) {
    return lookupOptions(descriptor, field, query, currentValue, optionSource);
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
    sourceField: field,
    optionSource,
    targetEntity,
    query,
    currentValue,
    context,
  });
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
  optionSource?: MetaEntityOptionSource,
) {
  const domainCandidates = resolveLookupDomains(descriptor, field, optionSource);
  const staticOptions = staticOptionsFromField(field, query, currentValue, optionSource);
  if (domainCandidates.length === 0) {
    return NextResponse.json({ options: staticOptions });
  }

  const session = await getNeonServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: "Sign in again to load options." },
      { status: 401 },
    );
  }

  let lastFailure: { domainCode: string; status: number } | null = null;
  for (const candidate of domainCandidates) {
    const params = new URLSearchParams({ limit: "100" });
    if (query.trim()) params.set("q", query.trim());

    const response = await fetch(
      buildRuntimeUrl(`/api/metadata/lookups/${encodeURIComponent(candidate.code)}?${params}`),
      {
        headers: buildRuntimeHeaders(session),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      lastFailure = { domainCode: candidate.code, status: response.status };
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
  sourceField,
  optionSource,
  targetEntity,
  query,
  currentValue,
  context,
}: {
  sourceEntity: string;
  sourceField: MetaEntityField;
  optionSource?: MetaEntityOptionSource;
  targetEntity: string;
  query: string;
  currentValue: string;
  context: Record<string, string>;
}) {
  const targetDescriptor = await getMetaEntityRuntimeDescriptor(targetEntity);
  if (!targetDescriptor?.capabilities.canRead) {
    return NextResponse.json(
      { error: "REFERENCE_NOT_READABLE", message: "The referenced entity is not readable in this runtime contract." },
      { status: 403 },
    );
  }

  const searchParams = buildReferenceSearchParams(sourceField, query, context, optionSource);
  const list = await getMetaEntityRecordList(targetEntity, searchParams, targetDescriptor);
  if (list.state.status === "unavailable") {
    return NextResponse.json({ options: [], message: list.state.message });
  }

  const currentRecordId = context["id"] ?? context["record_id"] ?? "";
  const options = list.records
    .filter((record) => !isSelfParentOption(sourceEntity, targetEntity, sourceField, record, currentRecordId))
    .map((record) => recordToOption(record, targetDescriptor, sourceField, optionSource))
    .filter((item): item is RuntimeOption => Boolean(item));

  const hydrated = currentValue && !options.some((option) => option.value === currentValue)
    ? await hydrateReferenceOption(targetEntity, currentValue, targetDescriptor, sourceField, optionSource)
    : null;

  return NextResponse.json({
    options: hydrated ? [hydrated, ...options] : options,
  });
}

function buildReferenceSearchParams(
  field: MetaEntityField,
  query: string,
  context: Record<string, string>,
  optionSource?: MetaEntityOptionSource,
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
      params["filter.id"] = "in:";
    }
  }

  return params;
}

async function hydrateReferenceOption(
  targetEntity: string,
  value: string,
  descriptor: MetaEntityRuntimeDescriptor,
  sourceField: MetaEntityField,
  optionSource?: MetaEntityOptionSource,
): Promise<RuntimeOption | null> {
  const valueField = referenceOptionValueField(sourceField, optionSource);
  if (valueField !== "id") {
    const list = await getMetaEntityRecordList(
      targetEntity,
      { page: "1", page_size: "1", [`filter.${valueField}`]: value },
      descriptor,
    );
    if (list.state.status === "unavailable") return null;
    const [record] = list.records;
    return record ? recordToOption(record, descriptor, sourceField, optionSource) : null;
  }

  const detail = await getMetaEntityRecordDetail(targetEntity, value, descriptor);
  if (detail.state.status === "unavailable" || !detail.record) return null;
  return recordToOption(detail.record, descriptor, sourceField, optionSource);
}

function referenceOptionValueField(
  sourceField: MetaEntityField,
  optionSource?: MetaEntityOptionSource,
): string {
  return (optionSource?.kind === "reference" ? optionSource.valueField : undefined)
    ?? readString(sourceField.referenceConfig, "value_field")
    ?? readString(sourceField.referenceConfig, "target_field")
    ?? "id";
}

function recordToOption(
  record: RuntimeRecordRow,
  descriptor: MetaEntityRuntimeDescriptor,
  sourceField: MetaEntityField,
  optionSource?: MetaEntityOptionSource,
): RuntimeOption | null {
  const valueField = referenceOptionValueField(sourceField, optionSource);
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
): boolean {
  if (!currentRecordId || sourceEntity !== targetEntity) return false;
  const fieldName = field.name.toLowerCase();
  if (fieldName !== "parent_id" && !fieldName.startsWith("parent_")) return false;
  return record.id === currentRecordId || recordValue(record, "id") === currentRecordId;
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
  const data = asRecord(record.data) ?? {};
  const value = data[fieldName] ?? record[fieldName];
  return value === null || value === undefined || value === "" ? null : String(value);
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

function titleLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
