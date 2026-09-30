export interface SharedRequest<T> {
  controller: AbortController;
  users: number;
  promise: Promise<T>;
}
/** Pending work only. Callers own the registry and include authority in its key. */
export function shareAbortableRequest<T>(
  requests: Map<string, SharedRequest<T>>,
  key: string,
  start: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  signal.throwIfAborted();
  let entry = requests.get(key);
  if (!entry || entry.controller.signal.aborted) {
    const controller = new AbortController();
    const promise = start(controller.signal);
    entry = { controller, promise, users: 0 };
    requests.set(key, entry);
    const owned = entry;
    void promise
      .finally(() => {
        if (requests.get(key) === owned) requests.delete(key);
      })
      .catch(() => {});
  }
  const owned = entry;
  owned.users++;
  return new Promise<T>((resolve, reject) => {
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      signal.removeEventListener("abort", abort);
      if (--owned.users === 0)
        queueMicrotask(() => {
          if (owned.users === 0) owned.controller.abort();
        });
    };
    const abort = () => {
      release();
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    owned.promise.then(
      (value) => {
        release();
        resolve(value);
      },
      (error) => {
        release();
        reject(error);
      },
    );
  });
}
