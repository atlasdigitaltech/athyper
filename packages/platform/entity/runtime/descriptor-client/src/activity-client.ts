import {
  createOperation,
  encodePathSegment,
  type HttpClient,
} from "@athyper/platform-api-client";
import type {
  ActivityDescription,
  ActivityDateRange,
  ActivityTimelineItem,
  ActivityEventFilters,
  ActivityVersionItem,
  ActivityAuditItem,
  ActivityComparison,
  ActivityPage,
  ActivitySnapshot,
  ActivitySnapshotItem,
} from "@athyper/contract-platform-entity-runtime";
type Subject = { entityCode: string; recordId: string; signal?: AbortSignal };
const path = (input: Subject, suffix = "") =>
  `/entity-runtime/${encodePathSegment(input.entityCode)}/records/${encodePathSegment(input.recordId)}/activity${suffix}`;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid Activity response");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string") throw Error("Invalid Activity text");
  return value;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw Error("Invalid Activity collection");
  return value;
}
function state(value: unknown) {
  const v = object(value);
  if (v.state !== "value" && v.state !== "uncaptured")
    throw Error("Invalid Activity field state");
  return {
    state: v.state,
    ...(v.state === "value" ? { value: v.value } : {}),
  } as const;
}
function snapshotItem(value: unknown): ActivitySnapshotItem {
  const v = object(value);
  if (
    !Number.isSafeInteger(v.sequence) ||
    Number(v.sequence) < 1 ||
    (v.sourceRecordVersion !== null &&
      !Number.isSafeInteger(v.sourceRecordVersion)) ||
    !["authorized_fields", "declared_fields", "unknown"].includes(
      String(v.coverage),
    )
  )
    throw Error("Invalid Activity snapshot");
  return {
    id: text(v.id),
    capturedAt: text(v.capturedAt),
    capturedBy: text(v.capturedBy),
    sequence: Number(v.sequence),
    sourceRecordVersion: v.sourceRecordVersion as number | null,
    coverage: v.coverage as ActivitySnapshotItem["coverage"],
  };
}
function audit(value: unknown): ActivityAuditItem {
  const v = object(value);
  return {
    id: text(v.id),
    occurredAt: text(v.occurredAt),
    event: text(v.event),
    operation: text(v.operation),
    outcome: text(v.outcome),
    actor: v.actor === null ? null : text(v.actor),
    changedFields: array(v.changedFields).map(text),
  };
}
function timeline(value:unknown):ActivityTimelineItem {
 const v=object(value);
 if(!["audit","snapshot","version"].includes(String(v.source)))throw Error("Invalid timeline source");
 return {...audit(v),source:v.source as ActivityTimelineItem["source"],...(v.correlation===undefined?{}:{correlation:text(v.correlation)})};
}
function versionItem(value: unknown): ActivityVersionItem {
  const v = object(value);
  if (!Number.isSafeInteger(v.version) || Number(v.version) < 1)
    throw Error("Invalid Activity version");
  return {
    id: text(v.id),
    occurredAt: text(v.occurredAt),
    version: Number(v.version),
    operation: text(v.operation),
    actor: text(v.actor),
    changedFields: array(v.changedFields).map(text),
  };
}
function page<T>(value: unknown, item: (v: unknown) => T): ActivityPage<T> {
  const v = object(value);
  return {
    items: array(v.items).map(item),
    releaseHash: text(v.releaseHash),
    ...(v.nextCursor === undefined ? {} : { nextCursor: text(v.nextCursor) }),
  };
}
export const entityActivityClient = {
  describe: (client: HttpClient, input: Subject) =>
    client.request(
      createOperation<ActivityDescription>({
        method: "GET",
        path: () => path(input),
        parse: (value) => {
          const v = object(value);
          const views = array(v.views).map((view) => {
            if (
              view !== "timeline" &&
              view !== "auditLog" &&
              view !== "snapshots" &&
              view !== "versions"
            )
              throw Error("Invalid Activity view");
            return view;
          });
          if (
            typeof v.canCapture !== "boolean" ||
            !Number.isInteger(v.maxRangeDays) ||
            !Number.isInteger(v.defaultRangeDays) ||
            (v.defaultView !== undefined &&
              !views.includes(v.defaultView as never))
          )
            throw Error("Invalid Activity description");
          return {
            supportsCalendarRanges: v.supportsCalendarRanges === true,
            views,
            defaultView: v.defaultView as ActivityDescription["defaultView"],
            canCapture: v.canCapture,
            releaseHash: text(v.releaseHash),
            maxRangeDays: Number(v.maxRangeDays),
            defaultRangeDays: Number(v.defaultRangeDays),
          };
        },
      }),
      { signal: input.signal },
    ),
  page: (
    client: HttpClient,
    input: Subject & {
      view: "timeline" | "auditLog" | "versions" | "snapshots";
      days: number;
      range?: ActivityDateRange;
      filters?:ActivityEventFilters;
      cursor?: string;
    },
  ) =>
    client.request(
      createOperation<
        ActivityPage<
          ActivityAuditItem | ActivityVersionItem | ActivitySnapshotItem
        >
      >({
        method: "GET",
        path: () =>
          path(
            input,
            input.view === "timeline" ? "/timeline" : input.view === "auditLog"
              ? "/audit"
              : input.view === "versions"
                ? "/versions"
                : "/snapshots",
          ),
        parse: (v) =>
          input.view === "timeline" ? page(v,timeline) : input.view === "auditLog"
            ? page(v, audit)
            : input.view === "versions"
              ? page(v, versionItem)
              : page(v, snapshotItem),
      }),
      {
        query: {
          days: input.days,
          ...input.range,
          ...input.filters,
          ...(input.cursor ? { cursor: input.cursor } : {}),
        },
        signal: input.signal,
      },
    ),
  snapshot: (client: HttpClient, input: Subject & { id: string }) =>
    client.request(
      createOperation<ActivitySnapshot>({
        method: "GET",
        path: () => path(input, `/snapshots/${encodePathSegment(input.id)}`),
        parse: (value) => {
          const v = object(value);
          return {
            ...snapshotItem(v),
            ...(v.collections === undefined ? {} : {collections:array(v.collections).map(value=>{const c=object(value);return {key:text(c.key),label:text(c.label),...(c.sectionKey===undefined?{}:{sectionKey:text(c.sectionKey)})};})}),
            fields: array(v.fields).map((value) => {
              const f = object(value);
              return { key: text(f.key), label: text(f.label), ...state(f), ...(f.reference === true ? { reference: true as const } : {}) };
            }),
          };
        },
      }),
      { signal: input.signal },
    ),
  compare: (
    client: HttpClient,
    input: Subject & { from: string; to: string },
  ) =>
    client.request(
      createOperation<ActivityComparison, { from: string; to: string }>({
        method: "POST",
        path: () => path(input, "/compare"),
        parse: (value) => {
          const v = object(value);
          return {
            from: text(v.from),
            to: text(v.to),
            fields: array(v.fields).map((value) => {
              const f = object(value);
              if (typeof f.changed !== "boolean")
                throw Error("Invalid comparison");
              return {
                key: text(f.key),
                label: text(f.label),
                before: state(f.before),
                after: state(f.after),
                changed: f.changed,
                ...(f.reference === true ? { reference: true as const } : {}),
              };
            }),
          };
        },
      }),
      { body: { from: input.from, to: input.to }, signal: input.signal },
    ),
  capture: (client: HttpClient, input: Subject & { idempotencyKey: string }) =>
    client.request(
      createOperation<{ id: string; replayed: boolean }, Record<string, never>>(
        {
          method: "POST",
          path: () => path(input, "/snapshots"),
          idempotency: "required",
          parse: (value) => {
            const v = object(value);
            if (typeof v.replayed !== "boolean") throw Error("Invalid capture");
            return { id: text(v.id), replayed: v.replayed };
          },
        },
      ),
      { body: {}, idempotencyKey: input.idempotencyKey, signal: input.signal },
    ),
};
