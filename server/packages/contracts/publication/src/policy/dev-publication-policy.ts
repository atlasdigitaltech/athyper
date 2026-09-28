/** Assessment configuration only. Parsing this contract never grants authority. */
export const DEV_CHANGE_KINDS = ["labels", "page_size", "default_sort", "visible_column_order"] as const;
export type DevChangeKind = typeof DEV_CHANGE_KINDS[number];
export interface DevPublicationTarget {
  readonly tenantId: string;
  readonly plane: "studio" | "neon" | "mesh";
  readonly entityCode: string;
}
export interface DevPublicationPolicy {
  readonly schema: "athyper.dev-publication-policy/1";
  readonly mode: "assessment_only";
  readonly environment: "dev";
  readonly policyId: string;
  readonly revision: number;
  readonly targets: readonly DevPublicationTarget[];
  readonly allowedChanges: readonly DevChangeKind[];
  readonly maxLabelLength: number;
}

export function exactObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError("DEV_POLICY_OBJECT_REQUIRED");
  const row = value as Record<string, unknown>;
  if (Object.getOwnPropertySymbols(row).length || Object.keys(row).length !== keys.length
    || keys.some(key => !Object.hasOwn(row, key) || !Object.hasOwn(Object.getOwnPropertyDescriptor(row, key) ?? {}, "value"))) throw new TypeError("DEV_POLICY_KEYS_INVALID");
  return row;
}
export function requireUuid(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value)) throw new TypeError("DEV_POLICY_UUID_INVALID");
  return value;
}
export function parseDevPublicationTarget(value: unknown): DevPublicationTarget {
  const row = exactObject(value, ["tenantId", "plane", "entityCode"]);
  requireUuid(row.tenantId);
  if (typeof row.plane !== "string" || !["studio", "neon", "mesh"].includes(row.plane) || typeof row.entityCode !== "string" || !/^[a-z][a-z0-9_]{0,126}$/.test(row.entityCode)) throw new TypeError("DEV_POLICY_TARGET_INVALID");
  return Object.freeze({ tenantId: row.tenantId as string, plane: row.plane as DevPublicationTarget["plane"], entityCode: row.entityCode });
}
export function parseDevPublicationPolicy(value: unknown): DevPublicationPolicy {
  const row = exactObject(value, ["schema", "mode", "environment", "policyId", "revision", "targets", "allowedChanges", "maxLabelLength"]);
  if (row.schema !== "athyper.dev-publication-policy/1" || row.mode !== "assessment_only" || row.environment !== "dev") throw new TypeError("DEV_POLICY_VERSION_OR_MODE_INVALID");
  if (typeof row.policyId !== "string" || !/^[a-z][a-z0-9_.-]{1,126}$/.test(row.policyId)
    || !Number.isSafeInteger(row.revision) || Number(row.revision) < 1
    || !Number.isSafeInteger(row.maxLabelLength) || Number(row.maxLabelLength) < 1 || Number(row.maxLabelLength) > 256) throw new TypeError("DEV_POLICY_LIMIT_INVALID");
  if (!Array.isArray(row.targets) || !row.targets.length || row.targets.length > 1000) throw new TypeError("DEV_POLICY_TARGETS_REQUIRED");
  const targets = Array.from(row.targets).map(parseDevPublicationTarget);
  if (new Set(targets.map(t => JSON.stringify(t))).size !== targets.length) throw new TypeError("DEV_POLICY_TARGET_DUPLICATE");
  if (!Array.isArray(row.allowedChanges) || !row.allowedChanges.length || Array.from(row.allowedChanges).some(k => !DEV_CHANGE_KINDS.includes(k))
    || new Set(row.allowedChanges).size !== row.allowedChanges.length) throw new TypeError("DEV_POLICY_CHANGE_KIND_INVALID");
  return Object.freeze({ schema: row.schema, mode: row.mode, environment: row.environment,
    policyId: row.policyId, revision: Number(row.revision), targets: Object.freeze(targets),
    allowedChanges: Object.freeze([...row.allowedChanges]) as readonly DevChangeKind[], maxLabelLength: Number(row.maxLabelLength) });
}
