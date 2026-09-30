"use client";

import { useSessionIdentity } from "@athyper/platform-shell-app-foundation";
import { useWorkspaceModuleRelevance as useSharedWorkspaceModuleRelevance } from "@athyper/platform-shell-dashboard/module-relevance";
export { orderModuleCodes } from "@athyper/platform-shell-dashboard/module-relevance";

export function useWorkspaceModuleRelevance(workspaceCode:string,entitledModuleCodes:readonly string[],activeModuleCode?:string){const scope=useSessionIdentity().scope;return useSharedWorkspaceModuleRelevance("neon",`${scope?.tenantId??"unknown"}:${scope?.principalId??"unknown"}`,workspaceCode,entitledModuleCodes,activeModuleCode);}
