import { shareAbortableRequest } from "./share-abortable-request";
import type { HttpClient } from "@athyper/platform-api-client";
import {
  attachmentPreview,
  type AttachmentPreviewResult,
} from "./collaboration-operations";

// Reuse only unexpired capabilities within the same record and security scope.
// Attachment IDs identify immutable versions. No data is persisted to storage.
const ready = new WeakMap<HttpClient, Map<string, AttachmentPreviewResult>>();
export function forgetThumbnail(client: HttpClient, scope: string, id: string) {
  ready.get(client)?.delete(JSON.stringify([scope, id, "thumbnail_sm"]));
}
const clients = new WeakMap<
  HttpClient,
  Map<
    string,
    {
      promise: Promise<AttachmentPreviewResult>;
      controller: AbortController;
      users: number;
    }
  >
>();
let active = 0;
const waiting = new Set<() => void>();
async function slot(signal: AbortSignal) {
  while (active >= 3) {
    await new Promise<void>((resolve, reject) => {
      const resume = () => {
        cleanup();
        resolve();
      };
      const abort = () => {
        cleanup();
        reject(signal.reason);
      };
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

export function requestThumbnail(
  client: HttpClient,
  scope: string,
  id: string,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  let requests = clients.get(client);
  if (!requests) {
    requests = new Map();
    clients.set(client, requests);
  }
  const key = JSON.stringify([scope, id, "thumbnail_sm"]);
  let cached = ready.get(client);
  if (!cached) {
    cached = new Map();
    ready.set(client, cached);
  }
  for (const [coordinate, result] of cached) {
    if (!result.expiresAt || Date.parse(result.expiresAt) - 5000 <= Date.now())
      cached.delete(coordinate);
  }
  const capability = cached.get(key);
  if (capability) return Promise.resolve(capability);
  return shareAbortableRequest(requests, key, async sharedSignal => {
      await slot(sharedSignal);
      try {
        const result = await client.request(attachmentPreview(id), {
          body: { rendition: "thumbnail_sm" },
          signal: sharedSignal,
        });
        if (
          !sharedSignal.aborted &&
          result.state === "ready" &&
          result.url &&
          result.expiresAt &&
          Date.parse(result.expiresAt) - 5000 > Date.now()
        ) {
          while (cached.size >= 128) cached.delete(cached.keys().next().value!);
          cached.set(key, result);
        }
        return result;
      } finally {
        active--;
        waiting.values().next().value?.();
      }
  }, signal);
}
