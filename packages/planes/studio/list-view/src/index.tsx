"use client";

import { EntityListRuntime } from "@athyper/platform-entity-list-view";
import { useApiClient } from "@athyper/platform-shell-app-foundation";

export function StudioCatalogList({ catalogCode }: { readonly catalogCode: string }) {
  return <EntityListRuntime client={useApiClient()} entityCode={catalogCode}/>;
}
