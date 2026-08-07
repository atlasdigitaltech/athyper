/**
 * Client singletons for @athyper/platform-query.
 *
 * Initialized once at app boot via setClients().
 * On token refresh, call refreshClients() with rebuilt clients so all hooks
 * pick up the new session without a page reload.
 *
 * The bag signature (named object) is intentional — positional args are
 * fragile as the client count grows.
 */
import {
  type MetadataClient,
  type RecordsClient,
  type WorkflowClient,
  type PlatformClient,
  type DocumentsClient,
  type CollabClient,
} from "@athyper/platform-api-client";

export interface ClientBag {
  metadata:  MetadataClient;
  records:   RecordsClient;
  documents: DocumentsClient;
  workflow:  WorkflowClient;
  platform:  PlatformClient;
  collab:    CollabClient;
}

let _clients: ClientBag | null = null;

export function setClients(bag: ClientBag): void {
  _clients = bag;
}

/** Replace all clients after a token refresh. Hooks will use new clients on next query. */
export function refreshClients(bag: ClientBag): void {
  _clients = bag;
}

function requireClients(): ClientBag {
  if (!_clients) throw new Error("@athyper/platform-query: call setClients() before using hooks.");
  return _clients;
}

export const clients = {
  metadata():  MetadataClient  { return requireClients().metadata; },
  records():   RecordsClient   { return requireClients().records; },
  documents(): DocumentsClient { return requireClients().documents; },
  workflow():  WorkflowClient  { return requireClients().workflow; },
  platform():  PlatformClient  { return requireClients().platform; },
  collab():    CollabClient    { return requireClients().collab; },
};
