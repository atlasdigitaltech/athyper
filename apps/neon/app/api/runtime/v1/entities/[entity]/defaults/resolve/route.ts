// POST /api/runtime/v1/entities/[entity]/defaults/resolve
// Metadata-driven batch source-change default resolver.
import { NextResponse, type NextRequest } from "next/server";
import {
  evaluateSourceChange,
  type EntityFieldDefaults,
  type FieldProvenance,
  type SourceChangeIntent,
} from "@athyper/cascade";
import type { MetaEntityField } from "@athyper/runtime-contracts";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";
import { getNeonServerSession } from "@/lib/server/session";
import { GET as getFieldOptions } from "../../fields/[field]/options/route";

type Values = Record<string, unknown>;

interface ResolveBody {
  recordId?: string | null;
  changedFields?: string[];
  oldValues?: Values;
  newValues?: Values;
  provenance?: Record<string, FieldProvenance>;
  rowStatus?: string | null;
}

interface ResolveResult {
  ok: true;
  valueUpdates: Record<string, unknown>;
  derivedFields: string[];
  clearedFields: string[];
  warnings: Record<string, string>;
  errors: Record<string, string>;
  intents: SourceChangeIntent[];
  explain: Array<Record<string, unknown>>;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string }> },
) {
  const session = await getNeonServerSession();
  if (!session) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED", message: "Sign in again to resolve defaults." },
      { status: 401 },
    );
  }

  const { entity } = await params;
  const entityCode = entity.trim().replace(/-/g, "_");
  const descriptor = await getMetaEntityRuntimeDescriptor(entityCode);
  if (!descriptor) {
    return NextResponse.json(
      { error: "ENTITY_NOT_FOUND", message: "This Neon route is not registered for the tenant control plane." },
      { status: 404 },
    );
  }

  const body = await readJson(request) as ResolveBody;
  const changedFields = Array.isArray(body.changedFields)
    ? body.changedFields.filter((field): field is string => typeof field === "string" && field.length > 0)
    : [];
  if (changedFields.length === 0) {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "Body must include changedFields." },
      { status: 400 },
    );
  }

  const defaultsByField = buildDefaultsByField(descriptor.fields);
  const oldValues = asRecord(body.oldValues);
  const newValues = asRecord(body.newValues);
  const provenance = asProvenance(body.provenance);

  const explicitIntents = evaluateSourceChange({
    changedFields,
    oldValues,
    newValues,
    provenance,
    defaultsByField,
    layer: "client_on_change",
    rowStatus: body.rowStatus ?? null,
  });
  const intents = [
    ...explicitIntents,
    ...buildImplicitDependentPickerIntents(descriptor.fields, changedFields, explicitIntents),
  ];

  const result: ResolveResult = {
    ok: true,
    valueUpdates: {},
    derivedFields: [],
    clearedFields: [],
    warnings: {},
    errors: {},
    intents,
    explain: [],
  };
  const working: Values = { ...newValues };

  for (const intent of intents) {
    if (shouldSkipForMode(intent, provenance, working)) continue;

    switch (intent.action) {
      case "clear":
        result.valueUpdates[intent.target] = null;
        working[intent.target] = null;
        result.clearedFields.push(intent.target);
        result.explain.push({ action: "clear", target: intent.target, sources: intent.sources });
        break;

      case "rederive": {
        if (!intent.resolver) {
          result.explain.push({
            action: "skip",
            target: intent.target,
            resolver: null,
            reason: "missing_resolver",
          });
          break;
        }
        const value = intent.resolver === "picker.first_option"
          ? await resolvePickerFirstOption({
              request,
              entityCode,
              fieldName: intent.target,
              values: working,
              recordId: body.recordId ?? null,
            })
          : await resolveNamedResolver({
              request,
              entityCode,
              intent,
              values: working,
            });
        if (value !== null && value !== undefined) {
          if (isPatchValue(value)) {
            for (const [field, fieldValue] of Object.entries(value)) {
              if (field === "__patch") continue;
              result.valueUpdates[field] = fieldValue;
              working[field] = fieldValue;
              if (!result.derivedFields.includes(field)) result.derivedFields.push(field);
            }
          } else {
            result.valueUpdates[intent.target] = value;
            working[intent.target] = value;
            result.derivedFields.push(intent.target);
          }
          result.explain.push({
            action: "rederive",
            target: intent.target,
            resolver: intent.resolver,
            value,
            sources: intent.sources,
          });
        } else {
          result.warnings[intent.target] = intent.message ?? "No default option was available for the current selection.";
          result.explain.push({
            action: "rederive",
            target: intent.target,
            resolver: intent.resolver,
            value: null,
            sources: intent.sources,
          });
        }
        break;
      }

      case "refilter": {
        const currentValue = working[intent.target];
        if (isBlank(currentValue)) break;
        const passes = await optionStillValid({
          request,
          entityCode,
          fieldName: intent.target,
          values: working,
          value: currentValue,
          recordId: body.recordId ?? null,
        });
        if (!passes) {
          result.valueUpdates[intent.target] = null;
          working[intent.target] = null;
          result.clearedFields.push(intent.target);
        }
        result.explain.push({ action: "refilter", target: intent.target, passes, sources: intent.sources });
        break;
      }

      case "validate":
        result.errors[intent.target] = intent.message
          ?? `Value is no longer valid because ${intent.sources.join(", ")} changed.`;
        break;

      case "warn":
        result.warnings[intent.target] = intent.message
          ?? `Verify ${intent.target} because ${intent.sources.join(", ")} changed.`;
        break;

      case "lock":
        result.explain.push({ action: "lock", target: intent.target, sources: intent.sources });
        break;
    }
  }

  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}

function buildDefaultsByField(fields: MetaEntityField[]): Record<string, EntityFieldDefaults> {
  const out: Record<string, EntityFieldDefaults> = {};
  for (const field of fields) {
    const defaults = field.defaults as EntityFieldDefaults | undefined;
    if (defaults && (defaults.on_source_change || defaults.default_value_source)) {
      out[field.name] = defaults;
    }
  }
  return out;
}

function buildImplicitDependentPickerIntents(
  fields: MetaEntityField[],
  changedFields: string[],
  explicitIntents: SourceChangeIntent[],
): SourceChangeIntent[] {
  const explicitTargets = new Set(explicitIntents.map((intent) => intent.target));
  const changed = new Set(changedFields);
  const out: SourceChangeIntent[] = [];

  for (const field of fields) {
    if (explicitTargets.has(field.name) || changed.has(field.name)) continue;
    const sources = optionDependencyFields(field).filter((source) => changed.has(source));
    if (sources.length === 0) continue;
    if (!isPickerField(field)) continue;
    out.push({
      target: field.name,
      action: "rederive",
      resolver: "picker.first_option",
      sources,
      mode: "if_empty_or_derived",
      reason: "source_changed",
      message: "Filled from the first valid metadata-filtered option.",
    });
  }

  return out;
}

function optionDependencyFields(field: MetaEntityField): string[] {
  const fields = new Set<string>();
  const source = field.editor?.optionSource ?? field.optionSource;
  if (source?.kind === "reference" && source.dependsOn?.field) {
    fields.add(source.dependsOn.field);
  }

  for (const config of [field.referenceConfig, field.lookupConfig]) {
    const dependency = readRecord(config, "dependent_filter");
    const sourceField =
      readString(dependency, "source_field")
      ?? readString(dependency, "sourceField")
      ?? readString(dependency, "field");
    if (sourceField) fields.add(sourceField);
  }

  const scope = readRecord(field.lookupConfig, "scope");
  const scopeSourceField =
    readString(scope, "source_field")
    ?? readString(scope, "sourceField");
  if (scopeSourceField) fields.add(scopeSourceField);

  return [...fields].sort();
}

function isPickerField(field: MetaEntityField): boolean {
  const source = field.editor?.optionSource ?? field.optionSource;
  return source?.kind === "reference" || Boolean(readRecord(field.lookupConfig, "dependent_filter"));
}

function shouldSkipForMode(
  intent: SourceChangeIntent,
  provenance: Record<string, FieldProvenance>,
  working: Values,
): boolean {
  if (intent.action !== "rederive") return false;
  const mode = intent.mode ?? "if_empty_or_derived";
  if (mode === "always") return false;
  const current = working[intent.target];
  if (isBlank(current)) return false;
  return (provenance[intent.target] ?? "unset") !== "derived";
}

async function resolvePickerFirstOption(input: {
  request: NextRequest;
  entityCode: string;
  fieldName: string;
  values: Values;
  recordId: string | null;
}): Promise<unknown | null> {
  const body = await readFieldOptions(input);
  const options = readOptions(body);
  return options.find((option) => option.value && option.disabled !== true)?.value ?? null;
}

async function resolveNamedResolver(input: {
  request: NextRequest;
  entityCode: string;
  intent: SourceChangeIntent;
  values: Values;
}): Promise<unknown | null> {
  if (!input.intent.resolver) return null;
  const url = new URL(input.request.url);
  url.pathname = `/api/runtime/v1/resolvers/${encodeURIComponent(input.intent.resolver)}`;
  url.search = "";

  const resolverInputs: Values = {
    field: input.intent.target,
    entity: input.entityCode,
    formData: { ...input.values },
  };
  for (const source of input.intent.sources) {
    resolverInputs[source] = input.values[source];
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: input.request.headers.get("cookie") ?? "",
      authorization: input.request.headers.get("authorization") ?? "",
      "x-org": input.request.headers.get("x-org") ?? "",
      "x-realm": input.request.headers.get("x-realm") ?? "",
    },
    body: JSON.stringify({ inputs: resolverInputs }),
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) return null;
  const body = await response.json().catch(() => null) as unknown;
  return isRecord(body) ? body["value"] ?? null : null;
}

async function optionStillValid(input: {
  request: NextRequest;
  entityCode: string;
  fieldName: string;
  values: Values;
  value: unknown;
  recordId: string | null;
}): Promise<boolean> {
  const body = await readFieldOptions(input);
  const options = readOptions(body);
  return options.some((option) => option.value === String(input.value) && option.disabled !== true);
}

async function readFieldOptions(input: {
  request: NextRequest;
  entityCode: string;
  fieldName: string;
  values: Values;
  value?: unknown;
  recordId: string | null;
}): Promise<unknown> {
  const url = new URL(input.request.url);
  url.pathname = `/api/runtime/v1/entities/${encodeURIComponent(input.entityCode)}/fields/${encodeURIComponent(input.fieldName)}/options`;
  url.search = "";
  if (input.value !== undefined && input.value !== null && input.value !== "") {
    url.searchParams.set("value", String(input.value));
  }
  if (input.recordId) url.searchParams.set("context.id", input.recordId);
  for (const [key, value] of Object.entries(input.values)) {
    if (value === null || value === undefined || value === "") continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      url.searchParams.set(`context.${key}`, String(value));
    }
  }

  const response = await getFieldOptions(
    new Request(url, { headers: input.request.headers }) as NextRequest,
    { params: Promise.resolve({ entity: input.entityCode, field: input.fieldName }) },
  );
  return response.json().catch(() => null);
}

function readOptions(body: unknown): Array<{ value: string; disabled?: boolean }> {
  if (!isRecord(body) || !Array.isArray(body["options"])) return [];
  return body["options"].flatMap((option) => {
    if (!isRecord(option) || typeof option["value"] !== "string") return [];
    return [{ value: option["value"], disabled: option["disabled"] === true }];
  });
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Values {
  return isRecord(value) ? value : {};
}

function asProvenance(value: unknown): Record<string, FieldProvenance> {
  if (!isRecord(value)) return {};
  return value as Record<string, FieldProvenance>;
}

function readRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const child = value[key];
  return isRecord(child) ? child : null;
}

function readString(value: unknown, key: string): string | null {
  if (!isRecord(value)) return null;
  const child = value[key];
  return typeof child === "string" && child.length > 0 ? child : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

function isPatchValue(value: unknown): value is Record<string, unknown> {
  return Boolean(
    value
      && typeof value === "object"
      && !Array.isArray(value)
      && (
        (value as Record<string, unknown>)["__patch"] === true
        ||
        Object.prototype.hasOwnProperty.call(value, "exchange_rate")
        || Object.prototype.hasOwnProperty.call(value, "fx_rate_snapshot")
        || Object.prototype.hasOwnProperty.call(value, "payment_exchange_rate")
        || Object.prototype.hasOwnProperty.call(value, "payment_fx_rate_snapshot")
      ),
  );
}
