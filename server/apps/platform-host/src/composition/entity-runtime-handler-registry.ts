import type {
  EntityRuntimeOperationHandler,
  EntityRuntimeOperationHandlerRegistry,
} from "@athyper/server-platform-experience";

/** Composition-only handler registry. Published metadata can select a handler
 * key, but cannot supply executable code. */
export function createEntityRuntimeHandlerRegistry(input: {
  readonly registries?: readonly EntityRuntimeOperationHandlerRegistry[];
  readonly fallback?: (
    handlerKey: string,
  ) => EntityRuntimeOperationHandler | undefined;
}): EntityRuntimeOperationHandlerRegistry {
  return Object.freeze({
    get(handlerKey: string): EntityRuntimeOperationHandler | undefined {
      for (const registry of input.registries ?? []) {
        const handler = registry.get(handlerKey);
        if (handler) return handler;
      }
      return input.fallback?.(handlerKey);
    },
  });
}
