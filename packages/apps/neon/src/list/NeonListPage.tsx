import { RuntimeListPage } from "@athyper/runtime-list/server";
import { createNeonAdapter } from "./createNeonAdapter";
import type { NeonAdapterConfig } from "./createNeonAdapter";
import type { RuntimeListSlots, RawSearchParams } from "@athyper/runtime-list/adapter";

interface NeonListPageProps {
  entityCode:   string;
  searchParams: RawSearchParams;
  adapterConfig:NeonAdapterConfig;
  slots?:       RuntimeListSlots;
}

// Thin server-component wrapper. The app route supplies fetchDescriptor +
// fetchRecords via adapterConfig so this package never imports from apps/neon.
export function NeonListPage({
  entityCode,
  searchParams,
  adapterConfig,
  slots,
}: NeonListPageProps) {
  const adapter = createNeonAdapter(adapterConfig);
  return (
    <RuntimeListPage
      adapter={adapter}
      entityCode={entityCode}
      searchParams={searchParams}
      slots={slots}
    />
  );
}
