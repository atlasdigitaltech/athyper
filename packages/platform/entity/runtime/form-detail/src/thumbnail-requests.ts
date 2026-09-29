import type { HttpClient } from "@athyper/platform-api-client";
import { attachmentPreview, type AttachmentPreviewResult } from "./collaboration-operations";

// Only pending requests are shared. Ready capabilities stay in the mounted tile.
// The scope includes principal, tenant, auth epoch and permission revision.
const clients = new WeakMap<HttpClient, Map<string, {
  promise: Promise<AttachmentPreviewResult>;
  controller: AbortController;
  users: number;
}>>();
let active = 0;
const waiting = new Set<() => void>();
async function slot(signal: AbortSignal) {
  while (active >= 3) {
    await new Promise<void>((resolve, reject) => {
      const resume = () => { cleanup(); resolve(); };
      const abort = () => { cleanup(); reject(signal.reason); };
      const cleanup = () => {
        waiting.delete(resume);
        signal.removeEventListener("abort", abort);
      };
      waiting.add(resume);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
  }
  signal.throwIfAborted();
  active++;
}

export function requestThumbnail(client: HttpClient, scope: string, id: string, signal: AbortSignal) {
  signal.throwIfAborted();
  let requests = clients.get(client);
  if (!requests) { requests = new Map(); clients.set(client, requests); }
  const key = JSON.stringify([scope, id, "thumbnail_sm"]);
  let entry = requests.get(key);
  if (!entry || entry.controller.signal.aborted) {
    const controller = new AbortController();
    const promise = (async () => {
      await slot(controller.signal);
      try {
        return await client.request(attachmentPreview(id), {
          body: { rendition: "thumbnail_sm" }, signal: controller.signal,
        });
      } finally {
        active--;
        waiting.values().next().value?.();
      }
    })();
    entry = { promise, controller, users: 0 };
    requests.set(key, entry);
    const owned = entry;
    void promise.finally(() => {
      if (requests.get(key) === owned) requests.delete(key);
    }).catch(() => {});
  }
  const owned = entry;
  owned.users++;
  return new Promise<AttachmentPreviewResult>((resolve, reject) => {
    let finished = false;
    const release = () => {
      if (finished) return;
      finished = true;
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
