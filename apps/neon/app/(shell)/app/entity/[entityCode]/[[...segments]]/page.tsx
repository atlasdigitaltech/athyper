import { initialListDensity } from "@/lib/list-density";
import { EntityApplicationLayout } from "@/lib/entity-application-layout";
import { EntityApplicationRoute } from "@/lib/entity-application-route";
import { resolveNeonEntityApplicationInternalRoute } from "@/lib/catalog-routes";
import { NeonRouteEntitlement } from "@/lib/experience-runtime";
import { notFound } from "next/navigation";

/**
 * Internal shared entity entry point. Public catalog aliases rewrite here; this
 * route deliberately owns no BP metadata, panel registry or section fetch logic.
 */
export default async function SharedEntityApplicationPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ entityCode: string; segments?: string[] }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { entityCode, segments = [] } = await params;
  const route = resolveNeonEntityApplicationInternalRoute(entityCode, segments);
  if (!route) notFound();
  return (
    <NeonRouteEntitlement
      workspaceCode={route.workspaceCode}
      moduleCode={route.moduleCode}
    >
      <EntityApplicationLayout
        entityCode={route.entityCode}
        activePath={route.publicPath}
      >
        <EntityApplicationRoute
          entityCode={route.entityCode}
          activePath={route.publicPath}
          initialDensity={initialListDensity(await searchParams)}
        />
      </EntityApplicationLayout>
    </NeonRouteEntitlement>
  );
}
