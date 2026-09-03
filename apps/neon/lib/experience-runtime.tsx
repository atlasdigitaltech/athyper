"use client";

import { defaultExperienceSurface } from "@athyper/contract-platform-dashboard/defaults";
import type { ExperienceSurface } from "@athyper/contract-platform-dashboard";
import { BrowserExperienceSurface } from "@athyper/platform-shell-dashboard/client";
import { PlatformHome } from "@athyper/platform-shell";
import { SEMANTIC_ICONS } from "@athyper/platform-icons";
import { useApiClient, useExperienceNavigation } from "@athyper/platform-shell-app-foundation";
import { useActivityCenterData } from "@athyper/platform-shell-activity-center-data";
import type { ExperienceRuntimeRegistry } from "@athyper/platform-shell-dashboard";
import { useCallback, useMemo, type ReactNode } from "react";
import { neonCatalogRoutes } from "@/lib/catalog-routes";
import { useWorkspaceModuleRelevance } from "@/lib/workspace-module-relevance";
import { moduleBadgesFromItems, WorkspaceModuleTabs } from "@athyper/platform-shell-dashboard/workspace-navigation";

const HOME_PROPS = {
  citationRoutes: { business_partner: "/mdg/business-partner/{recordId}", business_partner_request: "/mdg/business-partner/requests/{recordId}" }, suggestions: ["Review my priorities", "Plan today’s work", "Review pending approvals"],
  workspaces: [{ name: "Master Data Governance", description: "Create, validate, approve, and maintain trusted master records.", href: "/mdg", status: "Available workspace", modules: ["Business Partner"], access: { moduleCode: "bp" } }],
  quickActions: [
    { label: "New supplier request", description: "Start governed supplier onboarding", href: "/mdg/business-partner/new", access: { moduleCode: "bp", requiredPermissions: ["neon.relationship.business_partner_request.create"] } },
    { label: "Review onboarding requests", description: "Continue validation and approval work", href: "/mdg/business-partner/requests", access: { moduleCode: "bp", requiredPermissions: ["neon.relationship.business_partner_request.read"] } },
    { label: "Browse business partners", description: "Find suppliers, customers, and dual-role partners", href: "/mdg/business-partner/partners", access: { moduleCode: "bp", requiredPermissions: ["neon.relationship.business_partner.read"] } },
  ], searchItems: [
    { title:"Master Data Governance",description:"Open the MDG workspace dashboard",href:"/mdg",category:"Workspace",keywords:["mdg","master data"],access:{moduleCode:"bp"} },
    { title:"Business Partners",description:"Browse governed supplier and customer records",href:"/mdg/business-partner/partners",category:"Records",keywords:["supplier","customer","dual role"],access:{moduleCode:"bp",requiredPermissions:["neon.relationship.business_partner.read"]} },
    { title:"Onboarding requests",description:"Review validation and approval requests",href:"/mdg/business-partner/requests",category:"Work",keywords:["pending approval","priority tasks","review"],access:{moduleCode:"bp",requiredPermissions:["neon.relationship.business_partner_request.read"]} },
    { title:"New supplier request",description:"Start a governed supplier onboarding request",href:"/mdg/business-partner/new",category:"Action",keywords:["create supplier","onboard"],access:{moduleCode:"bp",requiredPermissions:["neon.relationship.business_partner_request.create"]} },
  ],
} as const;

function AtlasWelcome() { return <PlatformHome {...HOME_PROPS}/>; }
const registry: ExperienceRuntimeRegistry = Object.freeze({
  dataSources: Object.freeze({ "catalog.summary": (context: Readonly<Record<string,string>>) => ({ value: Number(context.entityCount ?? 0), items: [] }) }),
  actions: Object.freeze({ "catalog.navigate": (input: Readonly<Record<string,string|number|boolean>>) => internalPath(input.path) }),
  extensions: Object.freeze({ "neon.atlas-welcome": AtlasWelcome }), icons:SEMANTIC_ICONS, assets:Object.freeze({"brand:neon/home":"/brand/neon-home.webp"}),
});

export function NeonExperienceSurface({ surfaceKey, context, requiredWorkspaceCode, requiredModuleCode }: Readonly<{ surfaceKey: string; context?: Readonly<Record<string,string>>;requiredWorkspaceCode?:string;requiredModuleCode?:string }>) {
  const navigation=useExperienceNavigation(),workspace=requiredWorkspaceCode?navigation.find((item)=>item.code===requiredWorkspaceCode):undefined;
  if((requiredWorkspaceCode&&!workspace)||(requiredModuleCode&&!workspace?.modules.some((module)=>module.code===requiredModuleCode)))return <section role="alert"><h1>Access unavailable</h1><p>This route is outside your current workspace and module entitlements.</p></section>;
  return workspace?<NeonWorkspaceExperience workspaceCode={workspace.code} workspaceName={workspace.name} entitledModuleCodes={workspace.modules.map((module)=>module.code)} activeModuleCode={requiredModuleCode} surfaceKey={surfaceKey} context={context}/>:<ResolvedNeonExperienceSurface surfaceKey={surfaceKey} context={context}/>;
}
export function NeonRouteEntitlement({workspaceCode,moduleCode,children}:Readonly<{workspaceCode:string;moduleCode:string;children:ReactNode}>){const navigation=useExperienceNavigation(),workspace=navigation.find((item)=>item.code===workspaceCode);if(!workspace?.modules.some((module)=>module.code===moduleCode))return <section role="alert"><h1>Access unavailable</h1><p>This route is outside your current workspace and module entitlements.</p></section>;return <>{children}</>;}
function NeonWorkspaceExperience({workspaceCode,workspaceName,entitledModuleCodes,activeModuleCode,surfaceKey,context}:{readonly workspaceCode:string;readonly workspaceName:string;readonly entitledModuleCodes:readonly string[];readonly activeModuleCode?:string;readonly surfaceKey:string;readonly context?:Readonly<Record<string,string>>}){
  const relevance=useWorkspaceModuleRelevance(workspaceCode,entitledModuleCodes,activeModuleCode),workspace=neonCatalogRoutes.find((candidate)=>candidate.code===workspaceCode),badgeState=useWorkspaceModuleBadges(workspace);
  return <><WorkspaceModuleTabs workspace={workspace!} workspaceName={workspaceName} orderedModuleCodes={relevance.orderedModuleCodes} pinnedModuleCodes={relevance.pinnedModuleCodes} activeModuleCode={activeModuleCode} badges={badgeState.badges} onTogglePinned={relevance.togglePinned}/><ResolvedNeonExperienceSurface surfaceKey={surfaceKey} context={context} framedHeader visibleModuleCodes={entitledModuleCodes} orderedModuleCodes={relevance.orderedModuleCodes} pinnedModuleCodes={relevance.pinnedModuleCodes} badges={badgeState.badges} badgesLoading={badgeState.loading} onTogglePinned={relevance.togglePinned}/></>;
}
function ResolvedNeonExperienceSurface({surfaceKey,context,framedHeader=false,visibleModuleCodes,orderedModuleCodes=[],pinnedModuleCodes=[],badges={},badgesLoading=false,onTogglePinned}:{readonly surfaceKey:string;readonly context?:Readonly<Record<string,string>>;readonly framedHeader?:boolean;readonly visibleModuleCodes?:readonly string[];readonly orderedModuleCodes?:readonly string[];readonly pinnedModuleCodes?:readonly string[];readonly badges?:Readonly<Record<string,string>>;readonly badgesLoading?:boolean;readonly onTogglePinned?:(moduleCode:string)=>void}){
  const fallback=defaultExperienceSurface(surfaceKey,"neon");
  const transformSurface=useCallback((surface:ExperienceSurface):ExperienceSurface=>{
    if(!visibleModuleCodes)return surface;
    const visible=new Set(visibleModuleCodes),rank=new Map(orderedModuleCodes.map((code,index)=>[code,index]));
    const blocks=surface.blocks.filter((block)=>!block.id.startsWith("module.")||visible.has(block.id.slice("module.".length))),fixed=blocks.filter((block)=>!block.id.startsWith("module.")),modules=blocks.filter((block)=>block.id.startsWith("module.")).sort((left,right)=>(rank.get(left.id.slice(7))??Number.MAX_SAFE_INTEGER)-(rank.get(right.id.slice(7))??Number.MAX_SAFE_INTEGER));
    return {...surface,blocks:[...fixed,...modules]};
  },[visibleModuleCodes,orderedModuleCodes]);
  if(!fallback)return <p role="alert">The governed experience surface is not registered.</p>;
  return <BrowserExperienceSurface client={useApiClient()} surfaceKey={surfaceKey} registry={registry} fallback={fallback} context={context} framedHeader={framedHeader} hideHeader={surfaceKey==="neon.home"} transformSurface={transformSurface} modulePresentation={{pinnedModuleCodes,badges,badgesLoading,onTogglePinned}}/>;
}

function useWorkspaceModuleBadges(workspace:(typeof neonCatalogRoutes)[number]|undefined){const activity=useActivityCenterData();return useMemo(()=>({badges:workspace?moduleBadgesFromItems(workspace,activity.inbox??[]):{},loading:activity.loading===true}),[activity.inbox,activity.loading,workspace]);}

function internalPath(value: string|number|boolean|undefined): string { const path=typeof value==="string"?value:"/home"; return /^\/[a-z0-9][a-z0-9/_-]*(?:\?[a-z0-9=&._-]+)?$/i.test(path)&&!path.includes("//")?path:"/home"; }
