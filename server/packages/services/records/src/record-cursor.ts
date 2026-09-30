import { createHash } from "node:crypto";
import type { RecordRepositoryListInput } from "@athyper/server-contract-records";
import { RecordServiceError } from "./errors.js";

export interface DecodedRecordCursor {
  readonly values: readonly (string | number | boolean | null)[];
  readonly id: string;
}

export function encodeRecordCursor(input: RecordRepositoryListInput, row: Readonly<Record<string, unknown>>): string {
  const values = (input.sort ?? []).map((sort) => cursorValue(row[sort.field], sort.field));
  const id = row[input.descriptor.storage.idField];
  if (typeof id !== "string" || !id) throw new Error("Record cursor requires a string identity value");
  return Buffer.from(JSON.stringify({ version: 1, binding: binding(input), values, id }), "utf8").toString("base64url");
}

export function decodeRecordCursor(input: RecordRepositoryListInput): DecodedRecordCursor | undefined {
  if (!input.cursor) return undefined;
  try {
    if (input.cursor.length > 4096) throw new Error();
    const parsed: unknown = JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    const record = parsed as Record<string, unknown>;
    if (record["version"] !== 1 || record["binding"] !== binding(input) || typeof record["id"] !== "string" || !record["id"] || !Array.isArray(record["values"]) || record["values"].length !== (input.sort?.length ?? 0)) throw new Error();
    const values = record["values"].map((value) => {
      if (value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return value;
      throw new Error();
    });
    return Object.freeze({ values: Object.freeze(values), id: record["id"] });
  } catch {
    throw new RecordServiceError(400, "INVALID_CURSOR", "Record cursor is invalid, stale, or belongs to another query scope");
  }
}

function binding(input: RecordRepositoryListInput): string {
  return createHash("sha256").update(stable({
    descriptorHash: input.descriptor.compiledHash,
    plane: input.descriptor.planeKey,
    tenantId: input.tenantId,
    cursorScope: input.cursorScope,
    filters: input.filters ?? [],
    ...(input.viewRelationships?{viewRelationships:input.viewRelationships}:{}),
    ...(input.recordIds!==undefined?{recordIds:[...input.recordIds].sort()}:{}),
    sort: input.sort ?? [],
    group: input.group ?? null,
    search: input.search ?? null,
    projection: input.projection,
  })).digest("hex");
}

function cursorValue(value: unknown, field: string): string | number | boolean | null {
  if (value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return value;
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  throw new Error(`Record cursor cannot encode sort field ${field}`);
}

function stable(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : "null";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return "null";
}
