import {
  createOperation,
  encodePathSegment,
  type HttpClient,
} from "@athyper/platform-api-client";
import type {
  ActivityCollectionSnapshot,
  ActivityCollectionComparisonResult,
  ActivityCollectionPage,
  ActivityCapturedValue,
} from "@athyper/contract-platform-entity-runtime";
type Subject = {
  entityCode: string;
  recordId: string;
  key: string;
  cursor?: string;
  signal?: AbortSignal;
};
const path = (input: Subject) =>
  `/entity-runtime/${encodePathSegment(input.entityCode)}/records/${encodePathSegment(input.recordId)}/activity`;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid Activity collection response");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string") throw Error("Invalid collection text");
  return value;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw Error("Invalid collection items");
  return value;
}
function integer(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0)
    throw Error("Invalid collection count");
  return Number(value);
}
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  if (!choices.includes(value as T)) throw Error("Invalid collection state");
  return value as T;
}
function state(value: unknown): ActivityCapturedValue {
  const v = object(value);
  const state = choice(v.state, ["value", "uncaptured"] as const);
  return { state, ...(state === "value" ? { value: v.value } : {}) };
}
function format(value: unknown) {
  if (value === undefined) return {};
  const v = object(value);
  return {
    format: {
      kind: choice(v.kind, ["date", "datetime", "enum"] as const),
      ...(v.options === undefined
        ? {}
        : {
            options: array(v.options).map((value) => {
              const option = object(value);
              return { value: text(option.value), label: text(option.label) };
            }),
          }),
    },
  };
}
function base(v: Record<string, unknown>) {
  return {
    key: text(v.key),
    label: text(v.label),
    releaseHash: text(v.releaseHash),
    totalItems: integer(v.totalItems),
    notes: array(v.notes).map((note) =>
      choice(note, [
        "incomplete_capture",
        "incompatible_scope",
        "restricted_scope",
        "independent_sources",
      ] as const),
    ),
    ...(v.nextCursor === undefined ? {} : { nextCursor: text(v.nextCursor) }),
  };
}
export function parseActivityCollectionSnapshot(
  value: unknown,
): ActivityCollectionPage<ActivityCollectionSnapshot> {
  const v = object(value),
    header = base(v);
  const items = array(v.items).map((value) => {
    const row = object(value);
    return {
      id: text(row.id),
      ...(row.label === undefined ? {} : { label: text(row.label) }),
      fields: array(row.fields).map((value) => {
        const f = object(value);
        return {
          key: text(f.key),
          label: text(f.label),
          ...format(f.format),
          ...state(f),
        };
      }),
    };
  });
  if (items.length > header.totalItems) throw Error("Invalid collection page");
  return {
    ...header,
    snapshotId: text(v.snapshotId),
    capturedAt: text(v.capturedAt),
    items,
  };
}
export function parseActivityCollectionComparison(
  value: unknown,
): ActivityCollectionPage<ActivityCollectionComparisonResult> {
  const v = object(value),
    header = base(v),
    rawCounts = object(v.counts);
  const counts = {
    added: integer(rawCounts.added),
    updated: integer(rawCounts.updated),
    removed: integer(rawCounts.removed),
    replaced: integer(rawCounts.replaced),
    unchanged: integer(rawCounts.unchanged),
  };
  const items = array(v.items).map((value) => {
    const row = object(value);
    return {
      id: text(row.id),
      ...(row.label === undefined ? {} : { label: text(row.label) }),
      change: choice(row.change, [
        "added",
        "updated",
        "removed",
        "replaced",
        "unchanged",
        "uncomparable",
      ] as const),
      beforePresence: choice(row.beforePresence, [
        "present",
        "absent",
        "unknown",
      ] as const),
      afterPresence: choice(row.afterPresence, [
        "present",
        "absent",
        "unknown",
      ] as const),
      valueComparison: choice(row.valueComparison, [
        "same_record",
        "different_target",
        "unavailable",
      ] as const),
      fields: array(row.fields).map((value) => {
        const f = object(value);
        if (typeof f.changed !== "boolean")
          throw Error("Invalid comparison field");
        return {
          key: text(f.key),
          label: text(f.label),
          ...format(f.format),
          before: state(f.before),
          after: state(f.after),
          changed: f.changed,
        };
      }),
    };
  });
  if (
    items.length > header.totalItems ||
    Object.values(counts).reduce((a, b) => a + b, 0) > header.totalItems
  )
    throw Error("Invalid comparison totals");
  return {
    ...header,
    from: text(v.from),
    to: text(v.to),
    counts,
    items,
    ...(v.beforeCapturedAt === undefined
      ? {}
      : { beforeCapturedAt: text(v.beforeCapturedAt) }),
    ...(v.afterCapturedAt === undefined
      ? {}
      : { afterCapturedAt: text(v.afterCapturedAt) }),
  };
}
export const entityActivityCollectionsClient = {
  read: (client: HttpClient, input: Subject & { id: string }) =>
    client.request(
      createOperation<ActivityCollectionPage<ActivityCollectionSnapshot>>({
        method: "GET",
        path: () =>
          `${path(input)}/snapshots/${encodePathSegment(input.id)}/collections/${encodePathSegment(input.key)}`,
        parse: parseActivityCollectionSnapshot,
      }),
      {
        query: input.cursor ? { cursor: input.cursor } : {},
        signal: input.signal,
      },
    ),
  compare: (
    client: HttpClient,
    input: Subject & { from: string; to: string },
  ) =>
    client.request(
      createOperation<
        ActivityCollectionPage<ActivityCollectionComparisonResult>,
        { from: string; to: string; cursor?: string }
      >({
        method: "POST",
        path: () =>
          `${path(input)}/compare/collections/${encodePathSegment(input.key)}`,
        parse: parseActivityCollectionComparison,
      }),
      {
        body: {
          from: input.from,
          to: input.to,
          ...(input.cursor ? { cursor: input.cursor } : {}),
        },
        signal: input.signal,
      },
    ),
};
