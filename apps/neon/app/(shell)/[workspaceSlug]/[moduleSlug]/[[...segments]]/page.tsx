import { initialListDensity } from "@/lib/list-density";
import { notFound, redirect } from "next/navigation";
import { resolveCatalogRoute } from "@athyper/contract-platform-navigation";
import { EntityDetailRuntime, EntityFormRuntime } from "@athyper/platform-entity-form-detail";
import { EntityApplicationRoute } from "@/lib/entity-application-route";
import { EntityApplicationLayout } from "@/lib/entity-application-layout";
import { entityApplicationPublicPath, neonCatalogRoutes } from "@/lib/catalog-routes";
import { NeonExperienceSurface, NeonRouteEntitlement } from "@/lib/experience-runtime";

export default async function GenericCatalogPage({ params, searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>>; readonly params: Promise<{ workspaceSlug: string; moduleSlug: string; segments?: string[] }> }) {
  const { workspaceSlug, moduleSlug, segments = [] } = await params;
  const resolved = resolveCatalogRoute(neonCatalogRoutes, [workspaceSlug, moduleSlug, ...segments]);
  if (!resolved) notFound();
  const base = `/${resolved.workspace.routeSlug}/${resolved.module.routeSlug}`;

  if (resolved.kind === "module") return <NeonExperienceSurface surfaceKey={`neon.${resolved.workspace.code}.${resolved.module.code}.home`} requiredWorkspaceCode={resolved.workspace.code} requiredModuleCode={resolved.module.code} context={{workspaceCode:resolved.workspace.code,moduleCode:resolved.module.code,entityCount:String(resolved.module.entities.length)}}/>;

  const entity = resolved.entity!;
  const entityBase = `${base}/${entity.routeSlug}`;
  // A migrated entity has exactly one runtime owner.  The catalog remains its
  // public navigation authority, but delegates rendering to the shared entry.
  // Preserve the full query state so refresh and Back remain browser-native.
  const sharedPath = entityApplicationPublicPath(entity.code, []);
  if (sharedPath && resolved.kind === "entity-collection") {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(await searchParams)) {
      if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
      else if (typeof value === "string") query.set(key, value);
    }
    redirect(query.size ? `${sharedPath}?${query}` : sharedPath);
  }
  if (resolved.kind === "entity-create") return <NeonRouteEntitlement workspaceCode={resolved.workspace.code} moduleCode={resolved.module.code}><EntityFormRuntime entityCode={entity.code}/></NeonRouteEntitlement>;
  if (resolved.kind === "entity-detail") return <NeonRouteEntitlement workspaceCode={resolved.workspace.code} moduleCode={resolved.module.code}><EntityApplicationLayout entityCode={entity.code}><EntityApplicationRoute entityCode={entity.code} initialDensity={initialListDensity(await searchParams)} fallback={<EntityDetailRuntime entityCode={entity.code} recordId={resolved.entityId!}/>}/></EntityApplicationLayout></NeonRouteEntitlement>;
  return <NeonRouteEntitlement workspaceCode={resolved.workspace.code} moduleCode={resolved.module.code}><EntityApplicationLayout entityCode={entity.code}><EntityApplicationRoute entityCode={entity.code} initialDensity={initialListDensity(await searchParams)}/></EntityApplicationLayout></NeonRouteEntitlement>;
}
