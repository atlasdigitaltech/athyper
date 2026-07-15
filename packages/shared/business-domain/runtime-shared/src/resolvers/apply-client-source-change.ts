/**
 * Metadata default resolver client.
 *
 * Browser code no longer evaluates and executes source-change resolvers
 * locally. It sends the whole source-change event to the runtime batch
 * endpoint, which evaluates Meta Entity metadata and runs resolvers
 * server-side.
 */

import type {
  EntityFieldDefaults,
  FieldProvenance,
  SourceChangeIntent,
} from "@athyper/cascade";
import { runtimePath } from "@athyper/api-contracts/runtime-paths";
import { getCsrfToken } from "../client/csrf";

export interface ApplyClientSourceChangeArgs {
  entityCode?:       string;
  changedFields:    string[];
  oldValues:        Record<string, unknown>;
  newValues:        Record<string, unknown>;
  provenance:       Record<string, FieldProvenance>;
  defaultsByField:  Record<string, EntityFieldDefaults>;
  rowStatus?:       string | null;
  refilterCheck?:   (target: string, value: unknown, postMerge: Record<string, unknown>, signal?: AbortSignal) => Promise<boolean>;
  signal?:          AbortSignal;
  csrfToken?:       string;
}

export interface ApplyClientSourceChangeResult {
  valueUpdates:   Record<string, unknown>;
  derivedFields:  string[];
  clearedFields:  string[];
  warnings:       Record<string, string>;
  errors:         Record<string, string>;
  intents:        SourceChangeIntent[];
  explain?:       Array<Record<string, unknown>>;
}

export interface ApplyServerDefaultsResolveArgs extends ApplyClientSourceChangeArgs {
  recordId?: string | null;
}

export async function applyServerDefaultsResolve(
  args: ApplyServerDefaultsResolveArgs,
): Promise<ApplyClientSourceChangeResult> {
  if (!args.entityCode) return emptySourceChangeResult();

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const csrfToken = args.csrfToken || getCsrfToken();
  if (csrfToken) headers["X-CSRF-Token"] = csrfToken;

  try {
    const response = await fetch(runtimePath.defaultsResolve(args.entityCode), {
      method: "POST",
      headers,
      cache: "no-store",
      signal: args.signal,
      body: JSON.stringify({
        recordId:       args.recordId ?? null,
        changedFields: args.changedFields,
        oldValues:     args.oldValues,
        newValues:     args.newValues,
        provenance:    args.provenance,
        rowStatus:     args.rowStatus ?? null,
      }),
    });
    if (!response.ok) return emptySourceChangeResult();

    const body = await response.json() as unknown;
    if (!isRecord(body) || body["ok"] !== true) return emptySourceChangeResult();

    return {
      valueUpdates:  readRecordMap(body["valueUpdates"]),
      derivedFields: readStringArray(body["derivedFields"]),
      clearedFields: readStringArray(body["clearedFields"]),
      warnings:      readStringMap(body["warnings"]),
      errors:        readStringMap(body["errors"]),
      intents:       Array.isArray(body["intents"]) ? body["intents"] as SourceChangeIntent[] : [],
      explain:       Array.isArray(body["explain"])
        ? body["explain"].filter(isRecord)
        : undefined,
    };
  } catch {
    return emptySourceChangeResult();
  }
}

function emptySourceChangeResult(): ApplyClientSourceChangeResult {
  return {
    valueUpdates: {},
    derivedFields: [],
    clearedFields: [],
    warnings: {},
    errors: {},
    intents: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readRecordMap(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function readStringMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "string") out[key] = child;
  }
  return out;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((child): child is string => typeof child === "string")
    : [];
}
