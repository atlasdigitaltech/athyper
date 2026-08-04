import { RuntimeListPage } from "@athyper/runtime-list/server";
import type { RawSearchParams } from "@athyper/runtime-list/adapter";
import { adminAdapter } from "./adminAdapter";

export function AdminListPage({
  entityCode,
  searchParams,
}: {
  entityCode: string;
  searchParams: RawSearchParams;
}) {
  return (
    <RuntimeListPage
      adapter={adminAdapter}
      entityCode={entityCode}
      searchParams={searchParams}
    />
  );
}
