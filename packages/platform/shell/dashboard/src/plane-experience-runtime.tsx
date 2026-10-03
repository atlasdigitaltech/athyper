"use client";

import { type ExperienceSurface } from "@athyper/contract-platform-dashboard";
import { defaultExperienceSurface } from "@athyper/contract-platform-dashboard/defaults";
import type { CatalogWorkspaceRoute } from "@athyper/contract-platform-navigation";
import { useApiClient, useExperienceNavigation, useSessionIdentity } from "@athyper/platform-shell-app-foundation";
import { useActivityCenterData } from "@athyper/platform-shell-activity-center-data";
import { useCallback, useMemo, type ComponentType, type ReactNode } from "react";
import { BrowserExperienceSurface } from "./client";
import type { ExperienceRuntimeRegistry } from "./index";
import { useWorkspaceModuleRelevance } from "./module-relevance";
import { moduleBadgesFromItems, WorkspaceModuleTabs } from "./workspace-navigation";
import { ModuleLanding, WorkspaceLanding } from "./workspace-page";

export interface PlaneExperienceRuntimeConfig {
  readonly plane: "mesh" | "studio" | "neon";
  readonly displayName: string;
  readonly catalogRoutes: readonly CatalogWorkspaceRoute[];
  readonly registry: ExperienceRuntimeRegistry;
  readonly WorkspaceAccessory?: ComponentType<Readonly<{ workspaceCode: string; entitledModuleCodes: readonly string[] }>>;
}

export function PlaneExperienceSurface({ config, surfaceKey, workspaceCode, moduleCode, context }: Readonly<{ config: PlaneExperienceRuntimeConfig; surfaceKey: string; workspaceCode?: string; moduleCode?: string; context?: Readonly<Record<string, string>> }>) {
  const navigation = useExperienceNavigation(), workspace = workspaceCode ? navigation.find((item) => item.code === workspaceCode) : undefined;
  if ((workspaceCode && !workspace) || (moduleCode && !workspace?.modules.some((item) => item.code === moduleCode))) return <AccessUnavailable displayName={config.displayName}/>;
  return workspace ? <WorkspaceExperience config={config} surfaceKey={surfaceKey} workspaceCode={workspace.code} workspaceName={workspace.name} entitledModuleCodes={workspace.modules.map((item) => item.code)} activeModuleCode={moduleCode} context={context}/> : <ResolvedPlaneSurface config={config} surfaceKey={surfaceKey} context={context}/>;
}

function WorkspaceExperience({ config, surfaceKey, workspaceCode, workspaceName, entitledModuleCodes, activeModuleCode, context }: Readonly<{ config: PlaneExperienceRuntimeConfig; surfaceKey: string; workspaceCode: string; workspaceName: string; entitledModuleCodes: readonly string[]; activeModuleCode?: string; context?: Readonly<Record<string, string>> }>) {
  const route = config.catalogRoutes.find((item) => item.code === workspaceCode), scope = useSessionIdentity().scope, relevance = useWorkspaceModuleRelevance(config.plane, `${scope?.tenantId ?? "unknown"}:${scope?.principalId ?? "unknown"}`, workspaceCode, entitledModuleCodes, activeModuleCode), activity = useActivityCenterData(), badges = useMemo(() => route ? moduleBadgesFromItems(route, activity.inbox ?? []) : {}, [route, activity.inbox]);
  if (!route) return <AccessUnavailable displayName={config.displayName}/>;
  const Accessory = config.WorkspaceAccessory;
  const tabs = <WorkspaceModuleTabs workspace={route} workspaceName={workspaceName} orderedModuleCodes={relevance.orderedModuleCodes} pinnedModuleCodes={relevance.pinnedModuleCodes} recentModuleCodes={relevance.recentModuleCodes} activeModuleCode={activeModuleCode} badges={badges} onTogglePinned={relevance.togglePinned}/>;
  const accessory = Accessory ? <Accessory workspaceCode={workspaceCode} entitledModuleCodes={entitledModuleCodes}/> : null;
  // Workspace and module homes use the entity-list page frame; descriptions come
  // from the catalog's generated surfaces.
  const workspaceSurface = defaultExperienceSurface(`${config.plane}.${workspaceCode}.home`, config.plane);
  const moduleDescriptions = Object.fromEntries((workspaceSurface?.blocks ?? []).flatMap((block) => block.id.startsWith("module.") && "body" in block && typeof block.body === "string" ? [[block.id.slice(7), block.body]] : []));
  if (surfaceKey === `${config.plane}.${workspaceCode}.home`)
    return <WorkspaceLanding displayName={config.displayName} workspace={route} workspaceName={workspaceName} description={workspaceSurface?.description} moduleDescriptions={moduleDescriptions} orderedModuleCodes={relevance.orderedModuleCodes} pinnedModuleCodes={relevance.pinnedModuleCodes} badges={badges} onTogglePinned={relevance.togglePinned} navigation={tabs} accessory={accessory}/>;
  const activeModule = activeModuleCode ? route.modules.find((module) => module.code === activeModuleCode) : undefined;
  if (activeModule && surfaceKey === `${config.plane}.${workspaceCode}.${activeModule.code}.home`)
    return <ModuleLanding displayName={config.displayName} workspace={route} module={activeModule} description={moduleDescriptions[activeModule.code]} navigation={tabs}/>;
  return <><WorkspaceModuleTabs workspace={route} workspaceName={workspaceName} orderedModuleCodes={relevance.orderedModuleCodes} pinnedModuleCodes={relevance.pinnedModuleCodes} recentModuleCodes={relevance.recentModuleCodes} activeModuleCode={activeModuleCode} badges={badges} onTogglePinned={relevance.togglePinned}/>{Accessory ? <Accessory workspaceCode={workspaceCode} entitledModuleCodes={entitledModuleCodes}/> : null}<ResolvedPlaneSurface config={config} surfaceKey={surfaceKey} context={context} framedHeader visibleModuleCodes={entitledModuleCodes} orderedModuleCodes={relevance.orderedModuleCodes} pinnedModuleCodes={relevance.pinnedModuleCodes} badges={badges} badgesLoading={activity.loading === true} onTogglePinned={relevance.togglePinned}/></>;
}

function ResolvedPlaneSurface({ config, surfaceKey, context, framedHeader = false, visibleModuleCodes, orderedModuleCodes = [], pinnedModuleCodes = [], badges = {}, badgesLoading = false, onTogglePinned }: Readonly<{ config: PlaneExperienceRuntimeConfig; surfaceKey: string; context?: Readonly<Record<string, string>>; framedHeader?: boolean; visibleModuleCodes?: readonly string[]; orderedModuleCodes?: readonly string[]; pinnedModuleCodes?: readonly string[]; badges?: Readonly<Record<string, string>>; badgesLoading?: boolean; onTogglePinned?: (moduleCode: string) => void }>) {
  const client = useApiClient(), fallback = defaultExperienceSurface(surfaceKey, config.plane), transformSurface = useCallback((surface: ExperienceSurface) => orderSurface(surface, visibleModuleCodes, orderedModuleCodes), [visibleModuleCodes, orderedModuleCodes]);
  if (!fallback) return <SurfaceUnavailable displayName={config.displayName}/>;
  return <BrowserExperienceSurface client={client} surfaceKey={surfaceKey} registry={config.registry} fallback={fallback} context={context} framedHeader={framedHeader} hideHeader={surfaceKey === `${config.plane}.home`} transformSurface={transformSurface} modulePresentation={{ pinnedModuleCodes, badges, badgesLoading, onTogglePinned }}/>;
}

function orderSurface(surface: ExperienceSurface, visibleModuleCodes?: readonly string[], orderedModuleCodes: readonly string[] = []): ExperienceSurface {
  if (!visibleModuleCodes) return surface;
  const visible = new Set(visibleModuleCodes), rank = new Map(orderedModuleCodes.map((code, index) => [code, index])), blocks = surface.blocks.filter((block) => !block.id.startsWith("module.") || visible.has(block.id.slice(7))), fixed = blocks.filter((block) => !block.id.startsWith("module.")), modules = blocks.filter((block) => block.id.startsWith("module.")).sort((left, right) => (rank.get(left.id.slice(7)) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right.id.slice(7)) ?? Number.MAX_SAFE_INTEGER));
  return { ...surface, blocks: [...fixed, ...modules] };
}
function AccessUnavailable({ displayName }: { readonly displayName: string }) { return <section className="athyper-experience-state" role="alert"><h1>Access unavailable</h1><p>This route is outside your current workspace and module entitlements.</p><a href="/home">Return to {displayName} home</a></section>; }
function SurfaceUnavailable({ displayName }: { readonly displayName: string }) { return <section className="athyper-experience-state" role="alert"><h1>Experience unavailable</h1><p>The governed experience surface is not registered.</p><a href="/home">Return to {displayName} home</a></section>; }
export function PlaneRouteEntitlement({ workspaceCode, moduleCode, children }: Readonly<{ workspaceCode: string; moduleCode: string; children: ReactNode }>) { const workspace = useExperienceNavigation().find((item) => item.code === workspaceCode); return workspace?.modules.some((module) => module.code === moduleCode) ? <>{children}</> : <section role="alert"><h1>Access unavailable</h1><p>This route is outside your current workspace and module entitlements.</p></section>; }
export function safeExperiencePath(value: string | number | boolean | undefined): string { const path = typeof value === "string" ? value : "/home"; return /^\/[a-z0-9][a-z0-9/_-]*(?:\?[a-z0-9=&._-]+)?$/i.test(path) && !path.includes("//") ? path : "/home"; }
