import { RuntimeListPage } from "@athyper/runtime-list/server";
import type { RawSearchParams } from "@athyper/runtime-list/adapter";
import type { MeshAdapterConfig } from "./meshAdapter";
import { createMeshAdapter } from "./meshAdapter";

export function MeshListPage({
  entityCode,
  searchParams,
  adapterConfig,
}: {
  entityCode: string;
  searchParams: RawSearchParams;
  adapterConfig: MeshAdapterConfig;
}) {
  return (
    <RuntimeListPage
      adapter={createMeshAdapter(adapterConfig)}
      entityCode={entityCode}
      searchParams={searchParams}
    />
  );
}
