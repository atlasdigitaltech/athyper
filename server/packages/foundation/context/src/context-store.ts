import { AsyncLocalStorage } from "node:async_hooks";

export interface ContextStore<T> {
  getStore(): T | undefined;
  run<R>(ctx: T, fn: () => R): R;
}

/**
 * Factory that creates a typed AsyncLocalStorage wrapper.
 * Use one store instance per context type — do not share across planes.
 */
export function createContextStore<T>(): ContextStore<T> {
  const storage = new AsyncLocalStorage<T>();
  return {
    getStore: () => storage.getStore(),
    run: (ctx, fn) => storage.run(ctx, fn),
  };
}
