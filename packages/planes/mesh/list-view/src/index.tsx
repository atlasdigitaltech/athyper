"use client";

import type { EntityListScopeCoordinateV1 } from "@athyper/contract-platform-entity-list";
import { EntityListRuntime, ListScopeControl } from "@athyper/platform-entity-list-view";
import { useApiClient } from "@athyper/platform-shell-app-foundation";
import { useMeshAccountContext } from "@athyper/product-mesh-shell";
import { useMemo } from "react";

export function MeshEntityList({ entityCode }: { readonly entityCode: string }) {
  const client = useApiClient();
  const accounts = useMeshAccountContext();
  const coordinate = useMemo<EntityListScopeCoordinateV1 | undefined>(() => accounts.selected ? Object.freeze({ networkAccountId: accounts.selected.networkAccountId }) : undefined, [accounts.selected?.networkAccountId]);
  if (entityCode !== "network_relationship") return <EntityListRuntime client={client} entityCode={entityCode}/>;
  const selected = accounts.selected;
  const control = <ListScopeControl id="mesh-list-network-account" label="Acting account" value={selected?.networkAccountId} options={accounts.accounts.map((account) => ({ value: account.networkAccountId, label: `${account.code} · ${account.displayName} · ${account.role}` }))} status={accounts.status} loadingLabel="Loading network accounts…" emptyLabel="No authorized network accounts" selectLabel="Select a network account" summaryLabel="Authorized acting account" accessLabel={selected ? `${selected.role} access` : undefined} onChange={(value) => { if (value) accounts.select(value); }}/>;
  return <EntityListRuntime client={client} entityCode={entityCode} scopeCoordinate={coordinate} scopeControl={control}/>;
}
