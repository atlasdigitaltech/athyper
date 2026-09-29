import type { HttpClient } from "@athyper/platform-api-client";
import { entityDescriptorClient } from "@athyper/platform-entity-descriptor-client";

const clients = new WeakMap<HttpClient, Map<string, {
  controller: AbortController;
  users: number;
  promise: ReturnType<typeof read>;
}>>();
async function read(client: HttpClient, entity: string, recordId: string, signal: AbortSignal) {
  const [descriptor, record] = await Promise.all([
    entityDescriptorClient.detail(client, entity, recordId, signal),
    entityDescriptorClient.record(client, entity, recordId, signal),
  ]);
  return { descriptor, record };
}

/** Share pending reads only within an identical session/context and client. */
export function requestDetail(client: HttpClient, key: string, entity: string, recordId: string, signal: AbortSignal) {
  signal.throwIfAborted();
  let requests = clients.get(client);
  if (!requests) { requests = new Map(); clients.set(client, requests); }
  let entry = requests.get(key);
  if (!entry || entry.controller.signal.aborted) {
    const controller = new AbortController();
    const promise = read(client, entity, recordId, controller.signal);
    entry = { controller, promise, users: 0 };
    requests.set(key, entry);
    const owned = entry;
    void promise.finally(() => {
      if (requests.get(key) === owned) requests.delete(key);
    }).catch(() => {});
  }
  const owned = entry;
  owned.users++;
  return new Promise<Awaited<ReturnType<typeof read>>>((resolve, reject) => {
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      signal.removeEventListener("abort", abort);
      if (--owned.users === 0) queueMicrotask(() => {
        if (owned.users === 0) owned.controller.abort();
      });
    };
    const abort = () => { release(); reject(signal.reason); };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    owned.promise.then(value => { release(); resolve(value); }, error => { release(); reject(error); });
  });
}
