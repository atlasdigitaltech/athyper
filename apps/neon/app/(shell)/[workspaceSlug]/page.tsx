import { notFound } from "next/navigation";
import { neonCatalogRoutes } from "@/lib/catalog-routes";
import { NeonExperienceSurface } from "@/lib/experience-runtime";

export default async function GenericWorkspacePage({ params }: { readonly params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const workspace = neonCatalogRoutes.find((candidate) => candidate.routeSlug === workspaceSlug);
  if (!workspace) notFound();
  return <NeonExperienceSurface surfaceKey={`neon.${workspace.code}.home`} requiredWorkspaceCode={workspace.code} context={{workspaceCode:workspace.code,moduleCount:String(workspace.modules.length)}}/>;
}
