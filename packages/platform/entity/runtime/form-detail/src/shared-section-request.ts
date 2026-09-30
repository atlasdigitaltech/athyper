interface Pending<T> {
  controller: AbortController;
  promise: Promise<T>;
  subscribers: number;
}
/** A consumer owns its subscription, never another consumer's transport. */
export function createSharedRequestCoordinator<T>() {
  const pending = new Map<string, Pending<T>>();
  return (key: string, start: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal, force = false): Promise<T> => {
    if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
    let entry = force ? undefined : pending.get(key);
    if (!entry) {
      const controller = new AbortController();
      entry = { controller, promise: Promise.resolve().then(() => start(controller.signal)), subscribers: 0 };
      pending.set(key, entry);
      const created = entry;
      const clear = () => { if (pending.get(key) === created) pending.delete(key); };
      void entry.promise.then(clear, clear);
    }
    const shared = entry;
    shared.subscribers++;
    return new Promise<T>((resolve, reject) => {
      let released = false;
      const release = () => {
        if (released) return false;
        released = true;
        signal?.removeEventListener("abort", abort);
        if (--shared.subscribers === 0) {
          if (pending.get(key) === shared) pending.delete(key);
          shared.controller.abort();
        }
        return true;
      };
      const abort = () => { if (release()) reject(new DOMException("Aborted", "AbortError")); };
      signal?.addEventListener("abort", abort, { once: true });
      void shared.promise.then(
        value => { if (release()) resolve(value); },
        error => { if (release()) reject(error); },
      );
    });
  };
}
