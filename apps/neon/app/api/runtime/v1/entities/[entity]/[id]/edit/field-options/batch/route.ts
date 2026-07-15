import { NextResponse } from "next/server";
import {
  documentEditLifecycleHeaders,
  elapsedLifecycleMs,
  loadDocumentEditRuntimeRouteContext,
  readDocumentEditRuntimeJson,
  readLifecycleRecord,
} from "@/lib/server/document-edit-runtime-route-context";
import { buildRuntimeHeaders } from "@/lib/server/runtime-headers";
import { resolveRuntimeFieldOptions } from "@/lib/server/runtime-field-options";

const MAX_BATCH_FIELDS = 50;
const MAX_BATCH_CONCURRENCY = 8;
const MAX_QUERY_LENGTH = 200;
const MAX_CONTEXT_KEYS = 32;
const MAX_CONTEXT_VALUE_LENGTH = 512;
const ITEM_TIMEOUT_MS = 3_000;

interface BatchFieldOptionRequest {
  requestId: string;
  fieldName: string;
  query: string;
  value: string;
  context: Record<string, string>;
  validationError?: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ entity: string; id: string }> },
) {
  const startedAt = Date.now();
  const loaded = await loadDocumentEditRuntimeRouteContext({
    request,
    params,
    mode: "read",
    unauthenticatedMessage: "Sign in again to load document field options.",
  });
  if (!loaded.ok) return loaded.response;

  const body = readLifecycleRecord(await readDocumentEditRuntimeJson(request));
  const requests = readBatchRequests(body["requests"]);
  if (requests.length === 0) {
    return NextResponse.json(
      {
        error: "EMPTY_FIELD_OPTIONS_BATCH",
        message: "At least one field option request is required.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (requests.length > MAX_BATCH_FIELDS) {
    return NextResponse.json(
      {
        error: "FIELD_OPTIONS_BATCH_TOO_LARGE",
        message: `Field options batch is limited to ${MAX_BATCH_FIELDS} fields.`,
      },
      { status: 413, headers: { "Cache-Control": "no-store" } },
    );
  }

  const declaredFields = new Set(
    loaded.context.descriptor.fields.flatMap((field) => [field.name, field.columnName].filter(Boolean)),
  );
  const runtimeHeaders = buildRuntimeHeaders(loaded.context.session);
  const resolutionByKey = new Map<string, Promise<ResolvedFieldOptionResult>>();
  const results = await mapWithConcurrency(
    requests,
    MAX_BATCH_CONCURRENCY,
    async (item) => {
      if (item.validationError) {
        return {
          requestId: item.requestId,
          fieldName: item.fieldName,
          ok: false,
          status: 400,
          error: "INVALID_FIELD_OPTIONS_REQUEST",
          message: item.validationError,
          options: [],
        };
      }
      if (!declaredFields.has(item.fieldName)) {
        return {
          requestId: item.requestId,
          fieldName: item.fieldName,
          ok: false,
          status: 404,
          error: "FIELD_NOT_FOUND",
          message: "This field is not registered for runtime option resolution.",
          options: [],
        };
      }

      try {
        const resolutionKey = stableResolutionKey(item);
        let resolution = resolutionByKey.get(resolutionKey);
        if (!resolution) {
          resolution = withItemTimeout(
            request.signal,
            ITEM_TIMEOUT_MS,
            (signal) => resolveFieldOptions({
              descriptor: loaded.context.descriptor,
              item,
              runtimeHeaders,
              signal,
            }),
          );
          resolutionByKey.set(resolutionKey, resolution);
        }
        const resolved = await resolution;
        return {
          requestId: item.requestId,
          fieldName: item.fieldName,
          ...resolved,
        };
      } catch (error) {
        const timedOut = error instanceof FieldOptionTimeoutError;
        const aborted = request.signal.aborted || isAbortError(error);
        return {
          requestId: item.requestId,
          fieldName: item.fieldName,
          ok: false,
          status: timedOut ? 504 : aborted ? 499 : 500,
          error: timedOut ? "FIELD_OPTIONS_TIMEOUT" : aborted ? "FIELD_OPTIONS_ABORTED" : "FIELD_OPTIONS_FAILED",
          message: error instanceof Error ? error.message : "Field options failed.",
          options: [],
        };
      }
    },
  );

  const serverMs = elapsedLifecycleMs(startedAt);
  return NextResponse.json(
    {
      ok: true,
      lifecycle: "field_options_batch",
      entityCode: loaded.context.entityCode,
      recordId: loaded.context.recordId,
      results,
      telemetry: {
        serverMs,
        requestedFieldCount: requests.length,
        resolvedFieldCount: resolutionByKey.size,
      },
    },
    {
      headers: documentEditLifecycleHeaders("field-options-batch", serverMs),
    },
  );
}

interface ResolvedFieldOptionResult {
  ok: boolean;
  status: number;
  options: unknown[];
  source?: unknown;
  error?: string;
  message?: string;
}

async function resolveFieldOptions(input: {
  descriptor: Parameters<typeof resolveRuntimeFieldOptions>[0]["descriptor"];
  item: BatchFieldOptionRequest;
  runtimeHeaders: ReturnType<typeof buildRuntimeHeaders>;
  signal: AbortSignal;
}): Promise<ResolvedFieldOptionResult> {
  const response = await resolveRuntimeFieldOptions({
    descriptor: input.descriptor,
    fieldName: input.item.fieldName,
    query: input.item.query,
    currentValue: input.item.value,
    context: input.item.context,
    runtimeHeaders: input.runtimeHeaders,
    signal: input.signal,
  });
  const payload = await response.json().catch(() => null) as unknown;
  const record = readLifecycleRecord(payload);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: typeof record["error"] === "string" ? record["error"] : "FIELD_OPTIONS_FAILED",
      message: typeof record["message"] === "string" ? record["message"] : `Field options failed (${response.status}).`,
      options: [],
    };
  }
  return {
    ok: true,
    status: response.status,
    options: Array.isArray(record["options"]) ? record["options"] : [],
    source: record["source"] ?? null,
  };
}

function stableResolutionKey(item: BatchFieldOptionRequest): string {
  const context = Object.entries(item.context).sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify([item.fieldName, item.query, item.value, context]);
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await worker(items[index]!, index);
      }
    },
  );
  await Promise.all(runners);
  return results;
}

function readBatchRequests(value: unknown): BatchFieldOptionRequest[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: BatchFieldOptionRequest[] = [];
  for (const item of value) {
    const record = readLifecycleRecord(item);
    const requestId = readNonBlankString(record["requestId"]);
    const fieldName = readNonBlankString(record["fieldName"]);
    if (!requestId || !fieldName || seen.has(requestId)) continue;
    seen.add(requestId);
    const query = typeof record["query"] === "string" ? record["query"].trim() : "";
    const contextResult = readValidatedContext(record["context"]);
    out.push({
      requestId,
      fieldName,
      query,
      value: readNonBlankString(record["value"]) ?? "",
      context: contextResult.context,
      ...(query.length > MAX_QUERY_LENGTH
        ? { validationError: `Option query is limited to ${MAX_QUERY_LENGTH} characters.` }
        : contextResult.error
          ? { validationError: contextResult.error }
          : {}),
    });
  }
  return out;
}

function readValidatedContext(value: unknown): { context: Record<string, string>; error?: string } {
  const record = readLifecycleRecord(value);
  const entries = Object.entries(record);
  if (entries.length > MAX_CONTEXT_KEYS) {
    return { context: {}, error: `Option context is limited to ${MAX_CONTEXT_KEYS} keys.` };
  }
  const out: Record<string, string> = {};
  for (const [key, item] of entries) {
    if (!/^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/.test(key)) {
      return { context: {}, error: `Option context key '${key}' is invalid.` };
    }
    if (typeof item !== "string" || item.length > MAX_CONTEXT_VALUE_LENGTH) {
      return { context: {}, error: `Option context value for '${key}' is invalid.` };
    }
    if (item.trim()) out[key] = item.trim();
  }
  return { context: out };
}

function readNonBlankString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

class FieldOptionTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Field option resolution exceeded ${timeoutMs}ms.`);
    this.name = "FieldOptionTimeoutError";
  }
}

async function withItemTimeout<T>(
  parentSignal: AbortSignal,
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  if (parentSignal.aborted) throw parentSignal.reason ?? new DOMException("Request aborted.", "AbortError");
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parentSignal.reason ?? new DOMException("Request aborted.", "AbortError"));
  const timeout = setTimeout(() => controller.abort(new FieldOptionTimeoutError(timeoutMs)), timeoutMs);
  parentSignal.addEventListener("abort", abortFromParent, { once: true });
  try {
    return await run(controller.signal);
  } catch (error) {
    if (controller.signal.aborted && controller.signal.reason instanceof FieldOptionTimeoutError) {
      throw controller.signal.reason;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    parentSignal.removeEventListener("abort", abortFromParent);
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
