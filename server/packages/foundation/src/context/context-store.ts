import { AsyncLocalStorage } from "node:async_hooks";

export interface ContextStore<T> {
  getStore(): T | undefined;
  run<R>(context: T, work: () => R): R;
}

/** Create an isolated async context store for one context type. */
export function createContextStore<T>(): ContextStore<T> {
  const storage = new AsyncLocalStorage<T>();
  return {
    getStore: () => storage.getStore(),
    run: (context, work) => storage.run(context, work),
  };
}
