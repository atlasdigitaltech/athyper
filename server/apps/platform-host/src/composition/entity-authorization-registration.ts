import {
  parseEntityAuthorizationProfile,
  parseEntityAuthorizationRuntime,
  type EntityAuthorizationRuntimeRegistration,
} from "@athyper/server-contract-metadata";

/**
 * Turns one published authorization profile and its immutable runtime bindings
 * into callable registrations. Composition owns executable implementations;
 * metadata only selects their versioned keys.
 */
export function createEntityAuthorizationRegistrations(input: {
  readonly authorization: unknown;
  readonly authorizationRuntime: unknown;
  readonly handlers: Readonly<Record<string, (...args: never[]) => unknown>>;
  readonly resolvers: Readonly<Record<string, (...args: never[]) => unknown>>;
  readonly preflights?: Readonly<Record<string, (...args: never[]) => unknown>>;
}): readonly EntityAuthorizationRuntimeRegistration[] {
  const profile = parseEntityAuthorizationProfile(input.authorization);
  const runtime = parseEntityAuthorizationRuntime(
    input.authorizationRuntime,
    profile,
  );
  return Object.freeze(
    runtime.bindings.map((binding) => {
      const operation = profile.operations.find(
        (candidate) => candidate.key === binding.operation,
      );
      const handler = input.handlers[binding.handler];
      const resolver = input.resolvers[binding.resolver];
      const preflight = binding.preflight
        ? input.preflights?.[binding.preflight]
        : undefined;
      if (!operation || !handler || !resolver || (binding.preflight && !preflight))
        throw new TypeError(
          `Published entity operation cannot be composed: ${profile.entityCode}/${binding.operation}`,
        );
      return Object.freeze({
        entityCode: profile.entityCode,
        planeKey: profile.planeKey,
        operation,
        handler: Object.freeze({ key: binding.handler, invoke: handler }),
        resolver: Object.freeze({ key: binding.resolver, resolve: resolver }),
        ...(binding.preflight
          ? {
              preflight: Object.freeze({
                key: binding.preflight,
                check: preflight!,
              }),
            }
          : {}),
      });
    }),
  );
}
