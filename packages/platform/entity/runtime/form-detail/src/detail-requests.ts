import type { HttpClient } from "@athyper/platform-api-client";
import type { EntityDetailReadV1 } from "@athyper/contract-platform-entity-runtime";
import { entityDescriptorClient } from "@athyper/platform-entity-descriptor-client";
import { shareAbortableRequest, type SharedRequest } from "./share-abortable-request";
const clients = new WeakMap<HttpClient, Map<string, SharedRequest<EntityDetailReadV1>>>();
/** Share pending reads only within an identical session/context and client. */
export function requestDetail(client: HttpClient, key: string, entity: string, recordId: string, signal: AbortSignal) {
  let requests = clients.get(client);
  if (!requests) { requests = new Map(); clients.set(client, requests); }
  return shareAbortableRequest(requests, JSON.stringify([key, entity, recordId]), signal => entityDescriptorClient.detailRead(client, entity, recordId, signal), signal);
}
