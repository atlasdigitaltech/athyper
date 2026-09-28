/**
 * Browser-safe resource contracts for the split compiled-entity runtime.
 * They deliberately contain references and authorized projections only: physical
 * storage bindings, policy evaluator inputs and handler internals stay server-side.
 */
import { isObjectRecord, isBoundedNonBlankText } from "./validation/values";

export type EntityRuntimeResourceState =
  | "ready"
  | "empty"
  | "restricted"
  | "unavailable"
  | "stale";

export interface EntityRuntimeLocalizedTextV1 {
  readonly labelKey: string;
  readonly defaultText: string;
}

export interface EntityRuntimeReleasePinV1 {
  readonly releaseId: string;
  readonly releaseHash: string;
  readonly artifactHashes: Readonly<Record<string, string>>;
}

export interface EntityRuntimeResourceIdentityV1 {
  readonly entityCode: string;
  readonly resourceKey: string;
  readonly recordId?: string;
  readonly sectionKey?: string;
  readonly cursor?: string;
  readonly contextGeneration: number;
}

export interface EntityRuntimeResourceV1 {
  readonly identity: EntityRuntimeResourceIdentityV1;
  readonly state: EntityRuntimeResourceState;
  readonly revision?: string;
  readonly nextCursor?: string;
  readonly reasonCode?: string;
  readonly data?: Readonly<Record<string, unknown>>;
}

export interface EntityRuntimeActionV1 {
  readonly operationKey: string;
  readonly state: "enabled" | "disabled" | "hidden";
  readonly reasonCode?: string;
}

export interface EntityRuntimeBootstrapV1 {
  readonly schema: "athyper.entity-runtime-bootstrap/1";
  readonly entityCode: string;
  readonly surfaceKey: string;
  readonly release: EntityRuntimeReleasePinV1;
  readonly resources: readonly EntityRuntimeResourceV1[];
  readonly actions: readonly EntityRuntimeActionV1[];
}

const keyPattern = /^[a-z][a-z0-9_.-]{0,126}$/;
const hashPattern = /^sha256:[a-f0-9]{64}$/;

function record(value: unknown, name: string): Record<string, unknown> {
  if (!isObjectRecord(value))
    throw new TypeError(`${name} must be an object`);
  return value as Record<string, unknown>;
}
function key(value: unknown, name: string): string {
  if (typeof value !== "string" || !keyPattern.test(value))
    throw new TypeError(`${name} is invalid`);
  return value;
}
function hash(value: unknown, name: string): string {
  if (typeof value !== "string" || !hashPattern.test(value))
    throw new TypeError(`${name} is invalid`);
  return value;
}
function nonNegativeInteger(value: unknown, name: string): number {
  if (!Number.isInteger(value) || Number(value) < 0)
    throw new TypeError(`${name} is invalid`);
  return Number(value);
}

export function parseEntityRuntimeLocalizedText(
  value: unknown,
): EntityRuntimeLocalizedTextV1 {
  const item = record(value, "localized text");
  if (
    typeof item.labelKey !== "string" ||
    !keyPattern.test(item.labelKey) ||
    !isBoundedNonBlankText(item.defaultText, 500)
  )
    throw new TypeError("localized text is invalid");
  return Object.freeze({ labelKey: item.labelKey, defaultText: item.defaultText });
}

export function parseEntityRuntimeBootstrap(
  value: unknown,
): EntityRuntimeBootstrapV1 {
  const root = record(value, "runtime bootstrap");
  if (root.schema !== "athyper.entity-runtime-bootstrap/1")
    throw new TypeError("runtime bootstrap schema is invalid");
  const release = record(root.release, "runtime bootstrap.release");
  const artifactHashes = record(release.artifactHashes, "runtime bootstrap.artifactHashes");
  for (const [artifactKey, artifactHash] of Object.entries(artifactHashes)) {
    key(artifactKey, "runtime bootstrap artifact key");
    hash(artifactHash, "runtime bootstrap artifact hash");
  }
  if (!Array.isArray(root.resources) || !Array.isArray(root.actions))
    throw new TypeError("runtime bootstrap resources/actions are invalid");
  const resources = root.resources.map((value, index) => {
    const item = record(value, `runtime resource ${index}`);
    const identity = record(item.identity, `runtime resource ${index}.identity`);
    const state = item.state;
    if (!(["ready", "empty", "restricted", "unavailable", "stale"] as const).includes(state as never))
      throw new TypeError(`runtime resource ${index}.state is invalid`);
    if (item.data !== undefined) record(item.data, `runtime resource ${index}.data`);
    return Object.freeze({
      identity: Object.freeze({
        entityCode: key(identity.entityCode, "runtime resource entity code"),
        resourceKey: key(identity.resourceKey, "runtime resource key"),
        ...(identity.recordId === undefined ? {} : { recordId: key(identity.recordId, "runtime resource record id") }),
        ...(identity.sectionKey === undefined ? {} : { sectionKey: key(identity.sectionKey, "runtime resource section key") }),
        ...(identity.cursor === undefined ? {} : { cursor: String(identity.cursor) }),
        contextGeneration: nonNegativeInteger(identity.contextGeneration, "runtime resource context generation"),
      }),
      state: state as EntityRuntimeResourceState,
      ...(typeof item.revision === "string" ? { revision: item.revision } : {}),
      ...(typeof item.nextCursor === "string" ? { nextCursor: item.nextCursor } : {}),
      ...(typeof item.reasonCode === "string" ? { reasonCode: item.reasonCode } : {}),
      ...(item.data === undefined ? {} : { data: Object.freeze({ ...(item.data as Record<string, unknown>) }) }),
    });
  });
  const actions = root.actions.map((value, index) => {
    const item = record(value, `runtime action ${index}`);
    if (!(["enabled", "disabled", "hidden"] as const).includes(item.state as never))
      throw new TypeError(`runtime action ${index}.state is invalid`);
    return Object.freeze({
      operationKey: key(item.operationKey, "runtime action operation key"),
      state: item.state as EntityRuntimeActionV1["state"],
      ...(typeof item.reasonCode === "string" ? { reasonCode: item.reasonCode } : {}),
    });
  });
  if (new Set(resources.map((item) => JSON.stringify(item.identity))).size !== resources.length)
    throw new TypeError("duplicate runtime resource identity");
  return Object.freeze({
    schema: "athyper.entity-runtime-bootstrap/1",
    entityCode: key(root.entityCode, "runtime bootstrap entity code"),
    surfaceKey: key(root.surfaceKey, "runtime bootstrap surface key"),
    release: Object.freeze({
      releaseId: key(release.releaseId, "runtime release id"),
      releaseHash: hash(release.releaseHash, "runtime release hash"),
      artifactHashes: Object.freeze({ ...artifactHashes } as Record<string, string>),
    }),
    resources: Object.freeze(resources),
    actions: Object.freeze(actions),
  });
}
