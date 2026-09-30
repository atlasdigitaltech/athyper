import { AsyncLocalStorage } from "node:async_hooks";

type Evidence = WeakMap<object, WeakMap<object, Map<string, Promise<unknown>>>>;
const reads = new AsyncLocalStorage<Evidence>();

/** Explicit read boundary only. Never wrap commands, jobs or a whole session. */
export function withReadEvidence<T>(work: () => T): T {
  return reads.run(new WeakMap(), work);
}

/** Share immutable metadata/IAM evidence, never authorization decisions or rows.
 * The provider and verified context objects isolate different trust coordinates.
 * Each HTTP read starts a new store; outside that boundary every call is fresh. */
export function readEvidence<T>(
  provider: object,
  context: object,
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  const scope = reads.getStore();
  if (!scope) return load();
  let contexts = scope.get(provider);
  if (!contexts) {
    contexts = new WeakMap();
    scope.set(provider, contexts);
  }
  let values = contexts.get(context);
  if (!values) {
    values = new Map();
    contexts.set(context, values);
  }
  const existing = values.get(key);
  if (existing) return existing as Promise<T>;
  const pending = Promise.resolve().then(load);
  values.set(key, pending);
  void pending.catch(() => {
    if (values.get(key) === pending) values.delete(key);
  });
  return pending;
}
