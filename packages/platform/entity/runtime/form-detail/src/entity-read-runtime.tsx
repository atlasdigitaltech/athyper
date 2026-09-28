"use client";

import { EntityListRuntime } from "@athyper/platform-entity-list-view";
import { useApiClient } from "@athyper/platform-shell-app-foundation";
import { EntityDetailRuntime } from "./index";

/** Shared plane-neutral read surface. The APIs resolve the active descriptor and
 * authorize access; a URL or client registration is never an access grant.
 */
export function EntityReadRuntime({ entityCode, recordId }: { readonly entityCode: string; readonly recordId?: string }) {
  const client = useApiClient();
  return recordId
    ? <EntityDetailRuntime entityCode={entityCode} recordId={recordId} />
    : <EntityListRuntime client={client} entityCode={entityCode} />;
}
