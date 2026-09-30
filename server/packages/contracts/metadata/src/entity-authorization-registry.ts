import { parseEntityAuthorizationRuntime } from "./entity-authorization-runtime.js";
import {
  parseEntityAuthorizationProfile,
  type EntityAuthorizationOperationV1,
} from "./entity-authorization.js";

/** This registry proves callable availability and exact semantics, not authenticated journey qualification. */
export interface EntityAuthorizationRuntimeRegistration {
  readonly entityCode: string;
  readonly planeKey: string;
  readonly operation: EntityAuthorizationOperationV1;
  readonly handler: {
    readonly key: string;
    readonly invoke: (...args: never[]) => unknown;
  };
  readonly resolver: {
    readonly key: string;
    readonly resolve: (...args: never[]) => unknown;
  };
  readonly preflight?: {
    readonly key: string;
    readonly check: (...args: never[]) => unknown;
  };
}
export function createEntityAuthorizationRuntimeRegistry(
  registrations: readonly EntityAuthorizationRuntimeRegistration[],
  capabilities: {
    readonly sourceConstraints?: (...args: never[]) => unknown;
  } = {},
) {
  const entries = new Map<string, EntityAuthorizationRuntimeRegistration>();
  const key = (plane: string, entity: string, operation: string) =>
    `${plane}/${entity}/${operation}`;
  for (const entry of registrations) {
    const id = key(entry.planeKey, entry.entityCode, entry.operation.key);
    if (
      entries.has(id) ||
      typeof entry.handler.invoke !== "function" ||
      typeof entry.resolver.resolve !== "function" ||
      (entry.operation.requiresPreflight &&
        typeof entry.preflight?.check !== "function")
    )
      throw new TypeError(
        "Invalid or duplicate callable authorization registration",
      );
    entries.set(
      id,
      Object.freeze({
        ...entry,
        operation: Object.freeze({ ...entry.operation }),
        handler: Object.freeze({ ...entry.handler }),
        resolver: Object.freeze({ ...entry.resolver }),
        ...(entry.preflight
          ? { preflight: Object.freeze({ ...entry.preflight }) }
          : {}),
      }),
    );
  }
  return Object.freeze({
    qualify(profileRaw: unknown, runtimeRaw: unknown): void {
      const profile = parseEntityAuthorizationProfile(profileRaw);
      const runtime = parseEntityAuthorizationRuntime(runtimeRaw, profile);
      if (
        runtime.schemaVersion === 2 &&
        typeof capabilities.sourceConstraints !== "function"
      )
        throw new TypeError(
          "Canonical read source-constraint verifier unavailable",
        );
      const unresolved: string[] = [];
      for (const binding of runtime.bindings) {
        const entry = entries.get(
          key(profile.planeKey, profile.entityCode, binding.operation),
        );
        const operation = profile.operations.find(
          (item) => item.key === binding.operation,
        )!;
        if (
          !entry ||
          entry.handler.key !== binding.handler ||
          entry.resolver.key !== binding.resolver ||
          entry.preflight?.key !== binding.preflight ||
          Object.keys(operation).some(
            (property) =>
              Reflect.get(operation, property) !==
              Reflect.get(entry.operation, property),
          ) ||
          Object.keys(entry.operation).some(
            (property) =>
              Reflect.get(operation, property) !==
              Reflect.get(entry.operation, property),
          )
        )
          unresolved.push(binding.operation);
      }
      if (unresolved.length)
        throw new TypeError(
          `Unqualified authorization runtime binding: ${unresolved.join(", ")}`,
        );
    },
  });
}
