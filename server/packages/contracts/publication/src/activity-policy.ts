import { parseActivityCollections, type ActivityCollectionBinding } from "./activity-collections.js";
import { PublicationContractError } from "./errors.js";

export const ACTIVITY_VIEWS = ["timeline", "auditLog", "versions", "snapshots"] as const;
export type ActivityView = (typeof ACTIVITY_VIEWS)[number];
export interface ActivityPolicy {
  readonly collections?: readonly ActivityCollectionBinding[];
  readonly recording?: {
    readonly providerKey: "platform.records.history.v1";
    readonly adapterKey?: string;
    /** Reviewed logical root fields; never caller-selected or viewer-filtered. */
    readonly fields?: readonly string[];
    readonly projection?: "stored_root";
    readonly operations: readonly (
      "create" | "patch" | "transition" | "delete" | "aggregate" | "domain"
    )[];
  };
  readonly views: readonly ActivityView[];
  readonly defaultView: ActivityView;
  readonly snapshots: {
    readonly manualCapture: boolean;
    readonly automaticCapture: "none" | "committed" | "milestone";
    readonly captureOperations: readonly string[];
    readonly retentionClass:
      | "permanent"
      | "legal"
      | "financial"
      | "operational"
      | "standard"
      | "temporary";
  };
  readonly query: {
    readonly defaultRangeDays: number;
    readonly maxRangeDays: number;
    readonly pageSize: number;
  };
}

/** Exact canonical/service mapping. The bridge must be qualified at registration;
 * this declaration neither grants permissions nor installs runtime aliases. */
export const ACTIVITY_ACTIONS = Object.freeze({
  timeline_query: Object.freeze({
    permissionCode: "common.audit.event.query",
    servicePermissionCode: "audit.event.query",
    handlerKey: "platform.activity.timeline_query.v1",
    idempotency: "none" as const,
  }),
  audit_query: Object.freeze({
    permissionCode: "common.audit.event.query",
    servicePermissionCode: "audit.event.query",
    handlerKey: "platform.activity.audit_query.v1",
    idempotency: "none" as const,
  }),
  versions_read: Object.freeze({
    permissionCode: "common.audit.event.query",
    servicePermissionCode: "audit.event.query",
    handlerKey: "platform.activity.versions_read.v1",
    idempotency: "none" as const,
  }),
  snapshots_read: Object.freeze({
    permissionCode: "common.records.snapshot.read",
    servicePermissionCode: "records.snapshot.read",
    handlerKey: "platform.activity.snapshots_read.v1",
    idempotency: "none" as const,
  }),
  snapshots_compare: Object.freeze({
    permissionCode: "common.records.snapshot.read",
    servicePermissionCode: "records.snapshot.read",
    handlerKey: "platform.activity.snapshots_compare.v1",
    idempotency: "none" as const,
  }),
  snapshots_capture: Object.freeze({
    permissionCode: "common.records.snapshot.capture",
    servicePermissionCode: "records.snapshot.capture",
    handlerKey: "platform.activity.snapshots_capture.v1",
    idempotency: "required" as const,
  }),
});

export const ACTIVITY_PROFILE_PATHS: ReadonlySet<string> = new Set([
  "collections",
  "recording.providerKey",
  "recording.adapterKey",
  "recording.fields",
  "recording.projection",
  "recording.operations",
  "views",
  "defaultView",
  "snapshots.manualCapture",
  "snapshots.automaticCapture",
  "snapshots.captureOperations",
  "snapshots.retentionClass",
  "query.defaultRangeDays",
  "query.maxRangeDays",
  "query.pageSize",
]);

function invalid(message: string): never {
  throw new PublicationContractError(
    "ENTITY_CAPABILITY_INVALID",
    `activity policy: ${message}`,
  );
}
function object(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid("object required");
  const result = value as Record<string, unknown>;
  if (
    Object.keys(result).some((key) => !keys.includes(key)) ||
    keys.some((key) => !Object.hasOwn(result, key))
  )
    invalid("unexpected or missing property");
  return result;
}
function strings(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || !item.trim()) ||
    new Set(value).size !== value.length
  )
    invalid("unique string list required");
  return value as string[];
}
function integer(value: unknown, maximum: number): number {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < 1 ||
    Number(value) > maximum
  )
    invalid("query limit outside supported range");
  return Number(value);
}

/** Closed policy shape, rechecked after overrides and on compiled binding reads. */
export function parseActivityPolicy(value: unknown): ActivityPolicy {
  const hasRecording = Boolean(
    value && typeof value === "object" && Object.hasOwn(value, "recording"),
  );
  const v = object(value, [
    "views",
    "defaultView",
    "snapshots",
    "query",
    ...(hasRecording ? ["recording"] : []),
    ...(value && typeof value === "object" && Object.hasOwn(value,"collections") ? ["collections"] : []),
  ]);
  if (hasRecording) {
    const automaticProjection = Boolean(
      v.recording &&
      typeof v.recording === "object" &&
      Object.hasOwn(v.recording, "projection"),
    );
    const recording = object(v.recording, [
      "providerKey",
      ...(v.recording &&
      typeof v.recording === "object" &&
      Object.hasOwn(v.recording, "adapterKey")
        ? ["adapterKey"]
        : []),
      automaticProjection ? "projection" : "fields",
      "operations",
    ]);
    if (recording.providerKey !== "platform.records.history.v1")
      invalid("unsupported history provider");
    if (
      recording.adapterKey !== undefined &&
      (typeof recording.adapterKey !== "string" ||
        !/^[a-z][a-z0-9_.-]{2,126}$/.test(recording.adapterKey))
    )
      invalid("invalid adapter key");
    const operations = strings(recording.operations);
    if (
      operations.some((op) => ["aggregate", "domain"].includes(op)) &&
      !recording.adapterKey
    )
      invalid("owning adapter required");
    if (automaticProjection) {
      if (recording.projection !== "stored_root")
        invalid("unsupported recording projection");
    } else {
      const fields = strings(recording.fields);
      if (
        !fields.length ||
        fields.some((key) => !/^[a-zA-Z][a-zA-Z0-9_]{0,62}$/.test(key))
      )
        invalid("invalid recording fields");
    }
    if (
      !operations.length ||
      operations.some(
        (key) =>
          ![
            "create",
            "patch",
            "transition",
            "delete",
            "aggregate",
            "domain",
          ].includes(key),
      )
    )
      invalid("unsupported history operation");
  }
  if (v.collections !== undefined) parseActivityCollections(v.collections);
  const views = strings(v.views);
  if (
    !views.length ||
    views.some((view) => !(ACTIVITY_VIEWS as readonly string[]).includes(view))
  )
    invalid("unsupported view");
  if (typeof v.defaultView !== "string" || !views.includes(v.defaultView))
    invalid("default view must be enabled");
  const capture = object(v.snapshots, [
    "manualCapture",
    "automaticCapture",
    "captureOperations",
    "retentionClass",
  ]);
  if ((v.collections as unknown[] | undefined)?.length && (!hasRecording || !(v.recording as Record<string,unknown>).adapterKey || !views.includes("snapshots"))) invalid("collections require owning adapter, snapshots");
  if (typeof capture.manualCapture !== "boolean")
    invalid("manualCapture must be boolean");
  if (
    typeof capture.automaticCapture !== "string" ||
    !["none", "committed", "milestone"].includes(capture.automaticCapture)
  )
    invalid("unsupported automatic capture mode");
  const operations = strings(capture.captureOperations);
  if (
    operations.some((operation) => !/^[a-z][a-z0-9_.-]{1,126}$/.test(operation))
  )
    invalid("invalid capture operation");
  if ((capture.automaticCapture === "none") !== (operations.length === 0))
    invalid(
      "automatic capture requires explicit operations; none requires no operations",
    );
  if (
    typeof capture.retentionClass !== "string" ||
    ![
      "permanent",
      "legal",
      "financial",
      "operational",
      "standard",
      "temporary",
    ].includes(capture.retentionClass)
  )
    invalid("unsupported retention class");
  const query = object(v.query, [
    "defaultRangeDays",
    "maxRangeDays",
    "pageSize",
  ]);
  const maximum = integer(query.maxRangeDays, 90);
  if (integer(query.defaultRangeDays, 90) > maximum)
    invalid("default range exceeds maximum");
  integer(query.pageSize, 250);
  return structuredClone(v) as unknown as ActivityPolicy;
}

/** Used by trusted preparation/qualification, not a claim of runtime registration. */
export function qualifyActivityPolicy(
  policy: ActivityPolicy,
  support: {
    readonly versionHistoryAvailable: boolean;
    readonly automaticCaptureAvailable: boolean;
    readonly writableOperations: readonly string[];
  },
): void {
  const parsed = parseActivityPolicy(policy);
  if (parsed.views.includes("versions") && !support.versionHistoryAvailable)
    invalid("authoritative version history provider required");
  if (parsed.snapshots.automaticCapture !== "none") {
    if (!support.automaticCaptureAvailable)
      invalid("transactional automatic capture provider required");
    if (
      parsed.snapshots.captureOperations.some(
        (operation) => !support.writableOperations.includes(operation),
      )
    )
      invalid("capture operation has no owning write path");
  }
}

/** Requirements only: these actions do not grant access or register handlers. */
export function activityPolicyActions(value: ActivityPolicy) {
  const policy = parseActivityPolicy(value);
  const keys: (keyof typeof ACTIVITY_ACTIONS)[] = [];
  if (policy.views.includes("timeline")) keys.push("timeline_query");
  if (policy.views.includes("auditLog")) keys.push("audit_query");
  if (policy.views.includes("versions")) keys.push("versions_read");
  if (policy.views.includes("snapshots")) {
    keys.push("snapshots_read", "snapshots_compare");
    if (policy.snapshots.manualCapture) keys.push("snapshots_capture");
  }
  return keys.map((key) => ({
    key,
    ...ACTIVITY_ACTIONS[key],
    concurrency: "none" as const,
  }));
}
