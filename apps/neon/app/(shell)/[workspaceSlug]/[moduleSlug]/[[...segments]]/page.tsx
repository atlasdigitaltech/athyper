import { notFound } from "next/navigation";
import { resolveCatalogRoute } from "@athyper/contract-platform-navigation";
import { EntityDetailRuntime, EntityFormRuntime } from "@athyper/platform-entity-form-detail";
import { NeonEntityList } from "@athyper/product-neon-list-view";
import { neonCatalogRoutes } from "@/lib/catalog-routes";
import { NeonExperienceSurface, NeonRouteEntitlement } from "@/lib/experience-runtime";

export default async function GenericCatalogPage({ params }: { readonly params: Promise<{ workspaceSlug: string; moduleSlug: string; segments?: string[] }> }) {
  const { workspaceSlug, moduleSlug, segments = [] } = await params;
  const resolved = resolveCatalogRoute(neonCatalogRoutes, [workspaceSlug, moduleSlug, ...segments]);
  if (!resolved) notFound();
  const base = `/${resolved.workspace.routeSlug}/${resolved.module.routeSlug}`;

  if (resolved.kind === "module") return <NeonExperienceSurface surfaceKey={`neon.${resolved.workspace.code}.${resolved.module.code}.home`} requiredWorkspaceCode={resolved.workspace.code} requiredModuleCode={resolved.module.code} context={{workspaceCode:resolved.workspace.code,moduleCode:resolved.module.code,entityCount:String(resolved.module.entities.length)}}/>;

  const entity = resolved.entity!;
  const entityBase = `${base}/${entity.routeSlug}`;
  if (resolved.kind === "entity-create") return <NeonRouteEntitlement workspaceCode={resolved.workspace.code} moduleCode={resolved.module.code}><EntityFormRuntime entityCode={entity.code}/></NeonRouteEntitlement>;
  if (resolved.kind === "entity-detail") return <NeonRouteEntitlement workspaceCode={resolved.workspace.code} moduleCode={resolved.module.code}><EntityDetailRuntime entityCode={entity.code} recordId={resolved.entityId!}/></NeonRouteEntitlement>;
  return <NeonRouteEntitlement workspaceCode={resolved.workspace.code} moduleCode={resolved.module.code}><NeonEntityList entityCode={entity.code}/></NeonRouteEntitlement>;
}
