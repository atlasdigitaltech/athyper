import "server-only";

import { runtimeServerPath } from "@athyper/api-contracts/runtime-server-paths";
import type {
  ChildCollectionContract,
  DocumentEditRuntimeContract,
  DocumentEditSection,
  MetaEntityRelation,
  MetaEntityRuntimeDescriptor,
  SectionBatchResponse,
} from "@athyper/runtime-contracts";
import type { V4Session } from "@athyper/auth-bff";
import type { RuntimeRecordRow } from "@athyper/runtime-shared/core";
import {
  getChildRuntimeProjection,
  getMetaEntityRuntimeDescriptor,
} from "@/lib/server/meta-entity-runtime";
import { hydrateMetaEntityRecordRows } from "@/lib/server/meta-entity-records";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";

const FETCH_PAGE_SIZE = 200;
const PAGINATION_HARD_CAP = 20;
const SECTION_DEFAULT_TIMEOUT_MS = 3_000;
const SECTION_MIN_TIMEOUT_MS = 250;
const SECTION_MAX_TIMEOUT_MS = 10_000;
const LOG_PREFIX = "[document-edit-runtime]";

interface BackendListResponse {
  data?: RuntimeRecordRow[];
  pagination?: { total?: number; page?: number; page_size?: number; total_pages?: number };
  isFullyLoaded?: boolean;
}

interface PolymorphicChildBinding {
  binding_code: string;
  parent_entity_code: string;
  child_entity_code: string;
  binding_kind: "fk" | "polymorphic";
  fk_field: string | null;
  source_doc_type_value: string | null;
  source_doc_id_field: string | null;
  source_line_id_field: string | null;
  status: "active" | "inactive";
  record_filter: Record<string, string> | null;
}

export interface DocumentEditCorePayload {
  ok: true;
  entityCode: string;
  recordId: string;
  record: RuntimeRecordRow;
  descriptor: MetaEntityRuntimeDescriptor;
  editRuntime: DocumentEditRuntimeContract;
  processState?: unknown;
  selectedAddressSummaries: Record<string, DocumentEditSelectedAddressSummary>;
  selectedOptionLabels: Record<string, DocumentEditSelectedOptionLabel>;
  sectionManifest: Array<{
    key: string;
    label: string;
    loadPolicy: DocumentEditSection["loadPolicy"];
    cacheTtlMs: number;
    accessible: boolean;
    deniedReason?: string;
    childCollections: string[];
  }>;
}

export interface DocumentEditSelectedOptionLabel {
  field: string;
  value: string | number | boolean;
  label: string;
  source: "lookup" | "reference" | "static" | "field";
  code?: string;
}

export interface DocumentEditSelectedAddressSummary {
  address_id: string;
  purpose: string;
  is_primary: boolean | null;
  code: string | null;
  name: string | null;
  line1: string | null;
  city: string | null;
  region: string | null;
  country_code: string | null;
  formatted_address: string | null;
  tax_jurisdiction_id: string | null;
  jurisdiction_name: string | null;
  jurisdiction_code: string | null;
}

export interface BuildDocumentEditSectionBatchInput {
  session: V4Session;
  descriptor: MetaEntityRuntimeDescriptor;
  editRuntime: DocumentEditRuntimeContract;
  recordId: string;
  record: RuntimeRecordRow;
  requestedKeys: string[];
  context?: unknown;
  signal?: AbortSignal;
}

type DocumentEditChildCacheStatus = "none" | "db";

interface DocumentEditSectionChildTiming {
  key: string;
  entityCode: string;
  durationMs: number;
  rowCount: number;
  totalRows: number;
  cacheHit: DocumentEditChildCacheStatus;
}

interface DocumentEditSectionChildResult {
  collection: {
    key: string;
    entityCode: string;
    relationName?: string;
    bindingCode?: string;
    records: RuntimeRecordRow[];
    pagination: { total: number; fully_loaded: boolean };
  };
  timing: DocumentEditSectionChildTiming;
}

export function buildDocumentEditCorePayload(input: {
  entityCode: string;
  recordId: string;
  descriptor: MetaEntityRuntimeDescriptor;
  editRuntime: DocumentEditRuntimeContract;
  record: RuntimeRecordRow;
  processState?: unknown;
}): DocumentEditCorePayload {
  return {
    ok: true,
    entityCode: input.entityCode,
    recordId: input.recordId,
    record: input.record,
    descriptor: input.descriptor,
    editRuntime: input.editRuntime,
    processState: input.processState,
    selectedAddressSummaries: buildSelectedAddressSummaries(input.record),
    selectedOptionLabels: buildSelectedOptionLabels(input.descriptor, input.record),
    sectionManifest: input.editRuntime.sections.map((section) => ({
      key: section.key,
      label: section.label,
      loadPolicy: section.loadPolicy,
      cacheTtlMs: section.cacheTtlMs,
      accessible: section.accessible,
      ...(section.deniedReason ? { deniedReason: section.deniedReason } : {}),
      childCollections: input.editRuntime.childCollections
        .filter((collection) => collection.sectionKey === section.key)
        .map((collection) => collection.key),
    })),
  };
}

function buildSelectedOptionLabels(
  descriptor: MetaEntityRuntimeDescriptor,
  record: RuntimeRecordRow,
): Record<string, DocumentEditSelectedOptionLabel> {
  const out: Record<string, DocumentEditSelectedOptionLabel> = {};

  for (const field of descriptor.fields) {
    const value = readRecordScalar(record, field.name);
    if (value == null) continue;

    const source = selectedOptionSource(field);
    if (!source) continue;

    const staticLabel = field.optionSource?.kind === "static"
      ? field.optionSource.options.find((option) => option.value === String(value))?.label
      : undefined;
    const label =
      staticLabel
      ?? firstRecordString(record, [
        `${field.name}_label`,
        `${field.name}_display`,
        `${field.name}_name`,
        `${field.name}_title`,
        `${field.name}_code`,
      ])
      ?? String(value);
    const code = firstRecordString(record, [
      `${field.name}_code`,
      `${field.name}_number`,
    ]);

    out[field.name] = {
      field: field.name,
      value,
      label,
      source,
      ...(code ? { code } : {}),
    };
  }

  return out;
}

function selectedOptionSource(
  field: MetaEntityRuntimeDescriptor["fields"][number],
): DocumentEditSelectedOptionLabel["source"] | null {
  if (field.optionSource?.kind === "lookup") return "lookup";
  if (field.optionSource?.kind === "reference") return "reference";
  if (field.optionSource?.kind === "static") return "static";
  if (field.enumDomainCode) return "lookup";
  if (field.referenceEntity) return "reference";
  return null;
}

function buildSelectedAddressSummaries(
  record: RuntimeRecordRow,
): Record<string, DocumentEditSelectedAddressSummary> {
  const out: Record<string, DocumentEditSelectedAddressSummary> = {};
  for (const spec of HEADER_ADDRESS_SPECS) {
    const addressId = readRecordString(record, spec.field);
    if (!addressId) continue;
    out[spec.field] = {
      address_id: addressId,
      purpose: spec.purpose,
      is_primary: null,
      code: firstRecordString(record, spec.prefixes.map((prefix) => `${prefix}_address_code`)),
      name: firstRecordString(record, [
        `${spec.field}_label`,
        ...spec.prefixes.map((prefix) => `${prefix}_address_name`),
        ...spec.prefixes.map((prefix) => `${prefix}_name`),
      ]) ?? spec.label,
      line1: firstRecordString(record, spec.prefixes.map((prefix) => `${prefix}_address_line1`)),
      city: firstRecordString(record, spec.prefixes.map((prefix) => `${prefix}_address_city`)),
      region: firstRecordString(record, spec.prefixes.map((prefix) => `${prefix}_address_region`)),
      country_code: firstRecordString(record, [
        ...spec.prefixes.map((prefix) => `${prefix}_country_code`),
        ...spec.prefixes.map((prefix) => `${prefix}_address_country_code`),
      ]),
      formatted_address: firstRecordString(record, spec.prefixes.map((prefix) => `${prefix}_formatted_address`)),
      tax_jurisdiction_id: firstRecordString(record, spec.jurisdictionIdFields),
      jurisdiction_name: firstRecordString(record, spec.jurisdictionNameFields),
      jurisdiction_code: firstRecordString(record, spec.jurisdictionCodeFields),
    };
  }
  return out;
}

const HEADER_ADDRESS_SPECS: Array<{
  field: string;
  purpose: string;
  label: string;
  prefixes: string[];
  jurisdictionIdFields: string[];
  jurisdictionNameFields: string[];
  jurisdictionCodeFields: string[];
}> = [
  {
    field: "shipto_address_id",
    purpose: "ship_to",
    label: "Selected Ship-To address",
    prefixes: ["shipto", "ship_to"],
    jurisdictionIdFields: ["to_tax_jurisdiction_id", "shipto_tax_jurisdiction_id"],
    jurisdictionNameFields: ["to_tax_jurisdiction_name", "shipto_tax_jurisdiction_name"],
    jurisdictionCodeFields: ["to_tax_jurisdiction_code", "shipto_tax_jurisdiction_code"],
  },
  {
    field: "shipfrom_address_id",
    purpose: "ship_from",
    label: "Selected Ship-From address",
    prefixes: ["shipfrom", "ship_from"],
    jurisdictionIdFields: ["from_tax_jurisdiction_id", "shipfrom_tax_jurisdiction_id"],
    jurisdictionNameFields: ["from_tax_jurisdiction_name", "shipfrom_tax_jurisdiction_name"],
    jurisdictionCodeFields: ["from_tax_jurisdiction_code", "shipfrom_tax_jurisdiction_code"],
  },
  {
    field: "ship_to_address_id",
    purpose: "ship_to",
    label: "Selected Ship-To address",
    prefixes: ["ship_to", "shipto"],
    jurisdictionIdFields: ["to_tax_jurisdiction_id", "ship_to_tax_jurisdiction_id"],
    jurisdictionNameFields: ["to_tax_jurisdiction_name", "ship_to_tax_jurisdiction_name"],
    jurisdictionCodeFields: ["to_tax_jurisdiction_code", "ship_to_tax_jurisdiction_code"],
  },
  {
    field: "ship_from_address_id",
    purpose: "ship_from",
    label: "Selected Ship-From address",
    prefixes: ["ship_from", "shipfrom"],
    jurisdictionIdFields: ["from_tax_jurisdiction_id", "ship_from_tax_jurisdiction_id"],
    jurisdictionNameFields: ["from_tax_jurisdiction_name", "ship_from_tax_jurisdiction_name"],
    jurisdictionCodeFields: ["from_tax_jurisdiction_code", "ship_from_tax_jurisdiction_code"],
  },
  {
    field: "billto_address_id",
    purpose: "bill_to",
    label: "Selected Bill-To address",
    prefixes: ["billto", "bill_to"],
    jurisdictionIdFields: ["billto_tax_jurisdiction_id", "bill_to_tax_jurisdiction_id"],
    jurisdictionNameFields: ["billto_tax_jurisdiction_name", "bill_to_tax_jurisdiction_name"],
    jurisdictionCodeFields: ["billto_tax_jurisdiction_code", "bill_to_tax_jurisdiction_code"],
  },
  {
    field: "billfrom_address_id",
    purpose: "bill_from",
    label: "Selected Bill-From address",
    prefixes: ["billfrom", "bill_from"],
    jurisdictionIdFields: ["billfrom_tax_jurisdiction_id", "bill_from_tax_jurisdiction_id"],
    jurisdictionNameFields: ["billfrom_tax_jurisdiction_name", "bill_from_tax_jurisdiction_name"],
    jurisdictionCodeFields: ["billfrom_tax_jurisdiction_code", "bill_from_tax_jurisdiction_code"],
  },
  {
    field: "remitto_address_id",
    purpose: "remit_to",
    label: "Selected Remit-To address",
    prefixes: ["remitto", "remit_to"],
    jurisdictionIdFields: ["remitto_tax_jurisdiction_id", "remit_to_tax_jurisdiction_id"],
    jurisdictionNameFields: ["remitto_tax_jurisdiction_name", "remit_to_tax_jurisdiction_name"],
    jurisdictionCodeFields: ["remitto_tax_jurisdiction_code", "remit_to_tax_jurisdiction_code"],
  },
];

function firstRecordString(record: RuntimeRecordRow, keys: string[]): string | null {
  for (const key of keys) {
    const value = readRecordString(record, key);
    if (value) return value;
  }
  return null;
}

function readRecordScalar(record: RuntimeRecordRow, key: string): string | number | boolean | null {
  const direct = (record as Record<string, unknown>)[key];
  if (typeof direct === "string" && direct.trim().length > 0) return direct;
  if (typeof direct === "number" || typeof direct === "boolean") return direct;

  const data = (record as { data?: unknown }).data;
  if (isRecord(data)) {
    const nested = data[key];
    if (typeof nested === "string" && nested.trim().length > 0) return nested;
    if (typeof nested === "number" || typeof nested === "boolean") return nested;
  }

  return null;
}

function readRecordString(record: RuntimeRecordRow, key: string): string | null {
  const direct = (record as Record<string, unknown>)[key];
  if (typeof direct === "string" && direct.trim().length > 0) return direct;

  const data = (record as { data?: unknown }).data;
  if (isRecord(data)) {
    const nested = data[key];
    if (typeof nested === "string" && nested.trim().length > 0) return nested;
  }

  return null;
}

export async function buildDocumentEditSectionBatch(
  input: BuildDocumentEditSectionBatchInput,
): Promise<SectionBatchResponse> {
  const requestedKeys = normalizeRequestedSectionKeys(input.requestedKeys, input.editRuntime);
  const sectionsByKey = new Map(input.editRuntime.sections.map((section) => [section.key, section]));
  const parentRecordId = readResolvedRecordId(input.record, input.recordId);

  const sections = await Promise.all(
    requestedKeys.map(async (sectionKey) => {
      const startedAt = performance.now();
      const section = sectionsByKey.get(sectionKey);

      if (!section) {
        return {
          key: sectionKey,
          status: "error" as const,
          error: { code: "SECTION_NOT_DECLARED", category: "contract", retryable: false },
          timing: { serverMs: elapsedMs(startedAt), cacheHit: "none" as const },
        };
      }

      if (!section.accessible) {
        return {
          key: section.key,
          status: "forbidden" as const,
          fallback: section.fallbackContent,
          error: { code: "SECTION_FORBIDDEN", category: "authorization", retryable: false },
          timing: { serverMs: elapsedMs(startedAt), cacheHit: "none" as const },
        };
      }

      try {
        const timeoutMs = resolveSectionTimeoutMs(section);
        const childCollections = input.editRuntime.childCollections
          .filter((collection) => collection.sectionKey === section.key);
        const children = await withSectionTimeout<DocumentEditSectionChildResult[]>({
          parentSignal: input.signal,
          timeoutMs,
          run: (signal) =>
            Promise.all(
              childCollections.map((collection) =>
                fetchChildCollectionWithTiming({
                  session: input.session,
                  parentDescriptor: input.descriptor,
                  parentRecordId,
                  sectionKey: section.key,
                  collection,
                  signal,
                }),
              ),
            ),
        });
        const childTimings = children.map((child) => child.timing);
        const sectionRows = childTimings.reduce((total, timing) => total + timing.totalRows, 0);
        const cacheHit = childTimings.some((timing) => timing.cacheHit === "db")
          ? "db" as const
          : "none" as const;
        console.info(`${LOG_PREFIX} section '${section.key}' loaded`, {
          entity: input.descriptor.entityCode,
          recordId: parentRecordId,
          section: section.key,
          status: "ok",
          serverMs: elapsedMs(startedAt),
          timeoutMs,
          sectionRows,
          cacheHit,
          childCollections: childTimings,
        });

        return {
          key: section.key,
          status: "ok" as const,
          version: buildSectionVersion(section, input.record),
          data: {
            section,
            context: normalizeSectionContext(input.context),
            childCollections: children.map((child) => child.collection),
          },
          timing: {
            serverMs: elapsedMs(startedAt),
            cacheHit,
          },
        };
      } catch (error) {
        const timeoutMs = resolveSectionTimeoutMs(section);
        if (isSectionTimeoutError(error) || isAbortError(error)) {
          console.warn(`${LOG_PREFIX} section '${section.key}' timed out`, {
            entity: input.descriptor.entityCode,
            recordId: parentRecordId,
            section: section.key,
            timeoutMs,
            reason: isSectionTimeoutError(error) ? "section_timeout" : "parent_abort",
            message: error instanceof Error ? error.message : String(error),
          });
          return {
            key: section.key,
            status: "timeout" as const,
            fallback: section.fallbackContent,
            error: { code: "SECTION_TIMEOUT", category: "timeout", retryable: true },
            timing: { serverMs: elapsedMs(startedAt), cacheHit: "none" as const },
          };
        }

        const fallbackReason = section.fallbackMode === "degrade" ? "degraded" : "load_failed";
        console.warn(`${LOG_PREFIX} section '${section.key}' failed`, {
          entity: input.descriptor.entityCode,
          recordId: parentRecordId,
          section: section.key,
          reason: fallbackReason,
          message: error instanceof Error ? error.message : String(error),
        });
        return {
          key: section.key,
          status: section.fallbackMode === "degrade" ? "degraded" as const : "error" as const,
          fallback: section.fallbackContent,
          error: { code: "SECTION_LOAD_FAILED", category: "internal", retryable: true },
          timing: { serverMs: elapsedMs(startedAt), cacheHit: "none" as const },
        };
      }
    }),
  );

  return { sections };
}

class SectionTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Document edit section exceeded ${timeoutMs}ms timeout.`);
    this.name = "SectionTimeoutError";
  }
}

async function withSectionTimeout<T>(input: {
  parentSignal?: AbortSignal;
  timeoutMs: number;
  run: (signal: AbortSignal) => Promise<T>;
}): Promise<T> {
  if (input.parentSignal?.aborted) {
    throw input.parentSignal.reason ?? new DOMException("Request aborted.", "AbortError");
  }

  const controller = new AbortController();
  const abortFromParent = () => {
    controller.abort(input.parentSignal?.reason ?? new DOMException("Request aborted.", "AbortError"));
  };
  const timeout = setTimeout(() => {
    controller.abort(new SectionTimeoutError(input.timeoutMs));
  }, input.timeoutMs);

  input.parentSignal?.addEventListener("abort", abortFromParent, { once: true });

  try {
    return await input.run(controller.signal);
  } catch (error) {
    if (controller.signal.aborted && isSectionTimeoutError(controller.signal.reason)) {
      throw controller.signal.reason;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    input.parentSignal?.removeEventListener("abort", abortFromParent);
  }
}

function resolveSectionTimeoutMs(section: DocumentEditSection): number {
  const raw = (section as DocumentEditSection & { timeoutMs?: unknown }).timeoutMs;
  const candidate = typeof raw === "number" && Number.isFinite(raw)
    ? raw
    : SECTION_DEFAULT_TIMEOUT_MS;
  return Math.max(
    SECTION_MIN_TIMEOUT_MS,
    Math.min(SECTION_MAX_TIMEOUT_MS, Math.round(candidate)),
  );
}

function isSectionTimeoutError(error: unknown): error is SectionTimeoutError {
  return error instanceof SectionTimeoutError;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

async function fetchChildCollectionWithTiming(input: {
  session: V4Session;
  parentDescriptor: MetaEntityRuntimeDescriptor;
  parentRecordId: string;
  collection: ChildCollectionContract;
  sectionKey: string;
  signal?: AbortSignal;
}): Promise<DocumentEditSectionChildResult> {
  const startedAt = performance.now();
  const collection = await fetchChildCollection(input);
  const rowCount = collection.records.length;
  const totalRows = collection.pagination.total;
  const cacheHit: DocumentEditChildCacheStatus = rowCount > 0 || totalRows > 0 ? "db" : "none";

  return {
    collection,
    timing: {
      key: `${input.sectionKey}:${input.collection.key}`,
      entityCode: collection.entityCode,
      durationMs: elapsedMs(startedAt),
      rowCount,
      totalRows,
      cacheHit,
    },
  };
}

async function fetchChildCollection(input: {
  session: V4Session;
  parentDescriptor: MetaEntityRuntimeDescriptor;
  parentRecordId: string;
  collection: ChildCollectionContract;
  signal?: AbortSignal;
}): Promise<{
  key: string;
  entityCode: string;
  relationName?: string;
  bindingCode?: string;
  records: RuntimeRecordRow[];
  pagination: { total: number; fully_loaded: boolean };
}> {
  const headers = buildRuntimeHeaders(input.session);
  const resolved = await resolveChildFetchTarget(input, headers);
  if (!resolved) {
    return {
      key: input.collection.key,
      entityCode: input.collection.entityCode,
      ...(input.collection.relationName ? { relationName: input.collection.relationName } : {}),
      ...(input.collection.bindingCode ? { bindingCode: input.collection.bindingCode } : {}),
      records: [],
      pagination: { total: 0, fully_loaded: true },
    };
  }

  const records = await fetchAllChildRows({
    headers,
    entityCode: resolved.entityCode,
    filter: resolved.filter,
    logKey: `${input.parentDescriptor.entityCode}.${input.collection.key}`,
    signal: input.signal,
  });
  const childDescriptor = getChildRuntimeProjection(input.parentDescriptor, resolved.entityCode)?.descriptor
    ?? await getMetaEntityRuntimeDescriptor(resolved.entityCode);
  const hydratedRecords = await hydrateMetaEntityRecordRows(
    records.records,
    childDescriptor,
    input.session,
    headers,
  );

  return {
    key: input.collection.key,
    entityCode: resolved.entityCode,
    ...(input.collection.relationName ? { relationName: input.collection.relationName } : {}),
    ...(input.collection.bindingCode ? { bindingCode: input.collection.bindingCode } : {}),
    records: hydratedRecords,
    pagination: { total: records.total, fully_loaded: true },
  };
}

async function resolveChildFetchTarget(
  input: {
    session: V4Session;
    parentDescriptor: MetaEntityRuntimeDescriptor;
    parentRecordId: string;
    collection: ChildCollectionContract;
    signal?: AbortSignal;
  },
  headers: Record<string, string>,
): Promise<{ entityCode: string; filter: Record<string, string> } | null> {
  if (input.collection.relationName) {
    const relation = resolveRelation(input.parentDescriptor.relations, input.collection.relationName);
    if (!relation) return null;
    const filter = computeRelationFilter(relation, input.parentRecordId);
    if (!filter) return null;
    await assertChildReadable(input.parentDescriptor, relation.targetEntity);
    return { entityCode: relation.targetEntity, filter };
  }

  if (input.collection.bindingCode) {
    const binding = await fetchBinding(input.collection.bindingCode, headers, input.signal);
    if (!binding || binding.status !== "active") return null;
    const filter = computeBindingFilter(binding, input.parentRecordId);
    if (!filter) return null;
    await assertChildReadable(input.parentDescriptor, binding.child_entity_code);
    return { entityCode: binding.child_entity_code, filter };
  }

  if (input.collection.parentLinkField) {
    await assertChildReadable(input.parentDescriptor, input.collection.entityCode);
    return {
      entityCode: input.collection.entityCode,
      filter: { [`filter.${input.collection.parentLinkField}`]: input.parentRecordId },
    };
  }

  return null;
}

async function assertChildReadable(
  parentDescriptor: MetaEntityRuntimeDescriptor,
  entityCode: string,
): Promise<void> {
  const childDescriptor = getChildRuntimeProjection(parentDescriptor, entityCode)?.descriptor
    ?? await getMetaEntityRuntimeDescriptor(entityCode);
  if (childDescriptor && !childDescriptor.capabilities.canRead) {
    throw new Error(`Child entity '${entityCode}' is not readable in the active contract.`);
  }
}

async function fetchAllChildRows(input: {
  headers: Record<string, string>;
  entityCode: string;
  filter: Record<string, string>;
  logKey: string;
  signal?: AbortSignal;
}): Promise<{ records: RuntimeRecordRow[]; total: number }> {
  const collected: RuntimeRecordRow[] = [];
  let page = 1;
  let totalPages = 1;
  let total: number | undefined;

  while (page <= totalPages) {
    if (page > PAGINATION_HARD_CAP) {
      console.warn(
        `${LOG_PREFIX} ${input.logKey}: hit pagination hard cap `
        + `(${PAGINATION_HARD_CAP} pages); returning ${collected.length} records.`,
      );
      break;
    }

    const params = buildBackendParams({
      filter: input.filter,
      page,
      pageSize: FETCH_PAGE_SIZE,
    });

    const upstream = await fetch(
      buildRuntimeUrl(`${runtimeServerPath.entityList(input.entityCode)}?${params.toString()}`),
      { headers: input.headers, cache: "no-store", signal: input.signal },
    );

    if (!upstream.ok) {
      throw new Error(`Child records service returned ${upstream.status}.`);
    }

    const body = await readJson(upstream) as BackendListResponse | null;
    const pageRecords = Array.isArray(body?.data) ? body.data : [];
    collected.push(...pageRecords);

    const pagination = body?.pagination;
    if (!pagination || pagination.total_pages == null) break;
    if (body?.isFullyLoaded === true) break;
    if (pageRecords.length < FETCH_PAGE_SIZE) break;

    totalPages = pagination.total_pages;
    total = pagination.total;
    page += 1;
  }

  if (total != null && total > 500 && total !== collected.length) {
    console.warn(
      `${LOG_PREFIX} ${input.logKey}: ${total} rows reported, ${collected.length} fetched`,
    );
  }

  return { records: collected, total: total ?? collected.length };
}

async function fetchBinding(
  bindingCode: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
): Promise<PolymorphicChildBinding | null> {
  const upstream = await fetch(
    buildRuntimeUrl(runtimeServerPath.binding(bindingCode)),
    { headers, cache: "no-store", signal },
  );

  if (!upstream.ok) return null;

  const row = await readJson(upstream);
  return isRecord(row) ? readBindingRow(row) : null;
}

function readBindingRow(record: Record<string, unknown>): PolymorphicChildBinding | null {
  const binding_code = readString(record, "binding_code");
  const parent_entity_code = readString(record, "parent_entity_code");
  const child_entity_code = readString(record, "child_entity_code");
  const binding_kind = record["binding_kind"];
  if (!binding_code || !parent_entity_code || !child_entity_code) return null;
  if (binding_kind !== "fk" && binding_kind !== "polymorphic") return null;
  const status = record["status"];
  if (status !== "active" && status !== "inactive") return null;

  return {
    binding_code,
    parent_entity_code,
    child_entity_code,
    binding_kind,
    fk_field: readNullableString(record, "fk_field"),
    source_doc_type_value: readNullableString(record, "source_doc_type_value"),
    source_doc_id_field: readNullableString(record, "source_doc_id_field"),
    source_line_id_field: readNullableString(record, "source_line_id_field"),
    status,
    record_filter: readRecordFilter(record["metadata"]),
  };
}

function resolveRelation(
  relations: ReadonlyArray<MetaEntityRelation>,
  relationName: string,
): MetaEntityRelation | null {
  return relations.find((candidate) =>
    candidate.name === relationName
    || candidate.runtimeRole === relationName
    || candidate.key === relationName,
  ) ?? null;
}

function computeRelationFilter(
  relation: MetaEntityRelation,
  parentId: string,
): Record<string, string> | null {
  const resolutionKind = relation.resolutionKind ?? "fk";
  const base: Record<string, string> | null =
    resolutionKind === "fk"
      ? (relation.fkField ? { [`filter.${relation.fkField}`]: parentId } : null)
      : resolutionKind === "polymorphic"
        ? (
            relation.sourceTypeField
            && relation.sourceTypeValue
            && relation.sourceIdField
              ? {
                  [`filter.${relation.sourceTypeField}`]: relation.sourceTypeValue,
                  [`filter.${relation.sourceIdField}`]: parentId,
                }
              : null
          )
        : null;

  if (!base) return null;

  for (const [key, value] of Object.entries(relation.recordFilter ?? {})) {
    const normalized = normalizeFilterValue(value);
    if (normalized !== null) base[`filter.${key}`] = normalized;
  }

  return base;
}

function computeBindingFilter(
  binding: PolymorphicChildBinding,
  parentId: string,
): Record<string, string> | null {
  const base: Record<string, string> | null =
    binding.binding_kind === "fk"
      ? (binding.fk_field ? { [`filter.${binding.fk_field}`]: parentId } : null)
      : (binding.source_doc_type_value && binding.source_doc_id_field
          ? {
              "filter.source_doc_type": binding.source_doc_type_value,
              [`filter.${binding.source_doc_id_field}`]: parentId,
            }
          : null);

  if (!base) return null;

  for (const [key, value] of Object.entries(binding.record_filter ?? {})) {
    base[`filter.${key}`] = value;
  }

  return base;
}

function buildBackendParams(input: {
  filter: Record<string, string>;
  pageSize: number;
  page: number;
}): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input.filter)) {
    params.set(key, value);
  }
  params.set("page", String(input.page));
  params.set("page_size", String(input.pageSize));
  return params;
}

function normalizeRequestedSectionKeys(
  requestedKeys: string[],
  editRuntime: DocumentEditRuntimeContract,
): string[] {
  const declared = editRuntime.sections.map((section) => section.key);
  const raw = requestedKeys.length > 0 ? requestedKeys : declared;
  const seen = new Set<string>();
  return raw.filter((key) => {
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildSectionVersion(section: DocumentEditSection, record: RuntimeRecordRow): string {
  const value = (record as Record<string, unknown>)[section.versionRef];
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return `${section.key}:unversioned`;
}

function normalizeSectionContext(value: unknown): unknown {
  return isRecord(value) ? value : {};
}

function readResolvedRecordId(record: RuntimeRecordRow, fallback: string): string {
  const candidate = (record as Record<string, unknown>)["id"];
  return typeof candidate === "string" && candidate.trim() ? candidate : fallback;
}

async function readJson(input: Response): Promise<unknown> {
  try {
    return await input.json() as unknown;
  } catch {
    return null;
  }
}

function readRecordFilter(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) return null;
  const filterRaw = value["record_filter"];
  if (!isRecord(filterRaw)) return null;

  const out: Record<string, string> = {};
  for (const [key, filterValue] of Object.entries(filterRaw)) {
    const normalized = normalizeFilterValue(filterValue);
    if (normalized !== null) out[key] = normalized;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function normalizeFilterValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  return null;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readNullableString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function elapsedMs(startedAt: number): number {
  return Math.max(0, Math.round((performance.now() - startedAt) * 100) / 100);
}
