import { createHash } from "node:crypto";
import {
  parseEntityCanonicalReadAdmission,
  type EntityCanonicalReadAdmissionV1,
} from "./entity-canonical-read-admission.js";
import {
  parseEntityAuthorizationProfile,
  type EntityAuthorizationProfileV1,
} from "./entity-authorization.js";

/** Published references only. Implementations come exclusively from trusted composition. */
export interface EntityAuthorizationRuntimeV1 {
  readonly schemaVersion: 1;
  readonly runtimeVersion: "entity-authorization.v1";
  readonly bindings: readonly {
    readonly operation: string;
    readonly handler: string;
    readonly resolver: string;
    readonly preflight?: string;
  }[];
}

export interface EntityAuthorizationRuntimeV2 extends Omit<
  EntityAuthorizationRuntimeV1,
  "schemaVersion" | "runtimeVersion"
> {
  readonly schemaVersion: 2;
  readonly runtimeVersion: "entity-authorization.v2";
  readonly canonicalReadAdmission: EntityCanonicalReadAdmissionV1;
}
export type EntityAuthorizationRuntime =
  EntityAuthorizationRuntimeV1 | EntityAuthorizationRuntimeV2;
function profileDigest(value: unknown): string {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, canonical(x)]),
          )
        : v;
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

export function parseEntityAuthorizationRuntime(
  raw: unknown,
  profile: EntityAuthorizationProfileV1,
): EntityAuthorizationRuntime {
  parseEntityAuthorizationProfile(profile);
  if (
    raw &&
    typeof raw === "object" &&
    Reflect.get(raw, "schemaVersion") === 2
  ) {
    if (
      Array.isArray(raw) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(raw))
    )
      throw new TypeError("Invalid authorization runtime object");
    const v = raw as Record<string, unknown>;
    if (
      Object.keys(v).length !== 4 ||
      Object.keys(v).some(
        (k) =>
          ![
            "schemaVersion",
            "runtimeVersion",
            "bindings",
            "canonicalReadAdmission",
          ].includes(k),
      ) ||
      v.runtimeVersion !== "entity-authorization.v2"
    )
      throw new TypeError("Authorization runtime v2 contract mismatch");
    const legacy = parseEntityAuthorizationRuntime(
      {
        schemaVersion: 1,
        runtimeVersion: "entity-authorization.v1",
        bindings: v.bindings,
      },
      profile,
    );
    return Object.freeze({
      schemaVersion: 2,
      runtimeVersion: "entity-authorization.v2",
      bindings: legacy.bindings,
      canonicalReadAdmission: parseEntityCanonicalReadAdmission(
        v.canonicalReadAdmission,
        profile,
        profileDigest(profile),
      ),
    });
  }
  const object = (value: unknown, keys: readonly string[]) => {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Object.keys(value).some((key) => !keys.includes(key))
    )
      throw new TypeError("Invalid authorization runtime object");
    return value as Record<string, unknown>;
  };
  const reference = (value: unknown) => {
    if (
      typeof value !== "string" ||
      !/^[a-z][a-z0-9_.-]{0,159}\.v[1-9][0-9]*$/.test(value)
    )
      throw new TypeError("Versioned runtime reference required");
    return value;
  };
  const value = object(raw, ["schemaVersion", "runtimeVersion", "bindings"]);
  if (
    value["schemaVersion"] !== 1 ||
    value["runtimeVersion"] !== "entity-authorization.v1" ||
    !Array.isArray(value["bindings"]) ||
    value["bindings"].length !== profile.operations.length
  )
    throw new TypeError("Authorization runtime coverage/version mismatch");
  const seen = new Set<string>();
  const bindings = value["bindings"].map((rawBinding) => {
    const binding = object(rawBinding, [
      "operation",
      "handler",
      "resolver",
      "preflight",
    ]);
    const operation = profile.operations.find(
      (item) => item.key === binding["operation"],
    );
    if (!operation || seen.has(operation.key))
      throw new TypeError("Unknown or duplicate runtime operation");
    seen.add(operation.key);
    if (operation.requiresPreflight !== (binding["preflight"] !== undefined))
      throw new TypeError("Runtime preflight coverage mismatch");
    const resolver = reference(binding["resolver"]);
    if (resolver !== operation.scope)
      throw new TypeError("Runtime ownership resolver mismatch");
    return Object.freeze({
      operation: operation.key,
      handler: reference(binding["handler"]),
      resolver,
      ...(operation.requiresPreflight
        ? { preflight: reference(binding["preflight"]) }
        : {}),
    });
  });
  return Object.freeze({
    schemaVersion: 1,
    runtimeVersion: "entity-authorization.v1",
    bindings: Object.freeze(
      bindings.sort((a, b) => a.operation.localeCompare(b.operation)),
    ),
  });
}
