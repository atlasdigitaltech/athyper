import { EntityApplicationRoute } from "@/lib/entity-application-route";
import { initialListDensity } from "@/lib/list-density";

/** Proxy rewrites this legacy alias to the shared entry point without aborting UI work. */
export default async function BusinessPartnerListAlias({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <EntityApplicationRoute
      entityCode="business_partner"
      activePath="/mdg/business-partner/manage"
      initialDensity={initialListDensity(await searchParams)}
    />
  );
}
