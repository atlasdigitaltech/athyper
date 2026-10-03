"use client";

import { EntityListRuntime, EntityNavigationProvider } from "@athyper/platform-entity-list-view";
import { useApiClient, useApplicationNavigation } from "@athyper/platform-shell-app-foundation";
import { entityOwnRecordOperation } from "@athyper/platform-api-client";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { useEffect, useState } from "react";
import { EntityDetailRuntime } from "./entity-detail-runtime";

/** Shared plane-neutral read surface. The APIs resolve the active descriptor and
 * authorize access; a URL or client registration is never an access grant.
 */
export function EntityReadSurface({
  entityCode,
  recordId,
  own,
}: {
  readonly entityCode: string;
  readonly recordId?: string;
  readonly own?: true;
}) {
  if (own) return <OwnRecordRedirect entityCode={entityCode} />;
  const client = useApiClient();
  const navigation = useApplicationNavigation();
  return <EntityNavigationProvider navigate={navigation.push}>{recordId ? (
    <EntityDetailRuntime entityCode={entityCode} recordId={recordId} />
  ) : (
    <EntityListRuntime client={client} entityCode={entityCode} onNavigate={navigation.push} />
  )}</EntityNavigationProvider>;
}

/** `/app/entity/{code}/me`: the server resolves the caller's own record through the
 * entity's owner field and list authorization; the browser never guesses an id. */
function OwnRecordRedirect({ entityCode }: { readonly entityCode: string }) {
  const client = useApiClient(), navigation = useApplicationNavigation(), intl = useEntityI18n();
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let active = true;
    client.request(entityOwnRecordOperation, { params: { entityCode } })
      .then(({ recordId }) => { if (active) navigation.replace(`/app/entity/${entityCode}/${encodeURIComponent(recordId)}`); })
      .catch(() => { if (active) setMissing(true); });
    return () => { active = false; };
  }, [client, navigation, entityCode]);
  return <p className="a-entity-own-record" role="status">{intl.message(missing ? "entity.own.notFound" : "entity.own.resolving")}</p>;
}
