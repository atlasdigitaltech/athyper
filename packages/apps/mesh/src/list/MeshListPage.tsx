import { RuntimeListPage } from "@athyper/runtime-list/server";
import type { RawSearchParams } from "@athyper/runtime-list/adapter";
import { meshAdapter } from "./meshAdapter";

export function MeshListPage({
  entityCode,
  searchParams,
}: {
  entityCode: string;
  searchParams: RawSearchParams;
}) {
  return (
    <RuntimeListPage
      adapter={meshAdapter}
      entityCode={entityCode}
      searchParams={searchParams}
    />
  );
}
