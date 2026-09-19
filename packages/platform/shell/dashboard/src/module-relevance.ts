"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface ModuleRelevanceStore { readonly pinned:readonly string[];readonly recent:readonly string[]; }
const EMPTY:ModuleRelevanceStore=Object.freeze({pinned:Object.freeze([]),recent:Object.freeze([])}),MAX_RECENT=20;

export function useWorkspaceModuleRelevance(storageNamespace:string,preferenceScope:string,workspaceCode:string,entitledModuleCodes:readonly string[],activeModuleCode?:string){
  const storageKey=`athyper.${storageNamespace}.workspace-modules.v1:${preferenceScope}:${workspaceCode}`,[store,setStore]=useState<ModuleRelevanceStore>(EMPTY),entitledKey=entitledModuleCodes.join("|");
  useEffect(()=>{const entitled=new Set(entitledModuleCodes),restored=readStore(storageKey),sanitized={pinned:restored.pinned.filter((code)=>entitled.has(code)),recent:restored.recent.filter((code)=>entitled.has(code))};const next=activeModuleCode&&entitled.has(activeModuleCode)?{...sanitized,recent:[activeModuleCode,...sanitized.recent.filter((code)=>code!==activeModuleCode)].slice(0,MAX_RECENT)}:sanitized;setStore(next);writeStore(storageKey,next);},[storageKey,entitledKey,activeModuleCode]);
  const togglePinned=useCallback((moduleCode:string)=>{if(!entitledModuleCodes.includes(moduleCode))return;setStore((current)=>{const pinned=current.pinned.includes(moduleCode)?current.pinned.filter((code)=>code!==moduleCode):[moduleCode,...current.pinned.filter((code)=>code!==moduleCode)];const next={...current,pinned};writeStore(storageKey,next);return next;});},[storageKey,entitledKey]);
  const orderedModuleCodes=useMemo(()=>orderModuleCodes(entitledModuleCodes,store.pinned,store.recent),[entitledKey,store]);
  return Object.freeze({pinnedModuleCodes:store.pinned,recentModuleCodes:store.recent,orderedModuleCodes,togglePinned});
}

export function orderModuleCodes(catalogCodes:readonly string[],pinnedCodes:readonly string[],recentCodes:readonly string[]):readonly string[]{const entitled=new Set(catalogCodes),seen=new Set<string>(),result:string[]=[];for(const code of [...pinnedCodes,...recentCodes,...catalogCodes])if(entitled.has(code)&&!seen.has(code)){seen.add(code);result.push(code);}return Object.freeze(result);}
function readStore(key:string):ModuleRelevanceStore{try{const value=JSON.parse(localStorage.getItem(key)??"{}") as Record<string,unknown>;return{pinned:codes(value.pinned),recent:codes(value.recent).slice(0,MAX_RECENT)};}catch{localStorage.removeItem(key);return EMPTY;}}
function writeStore(key:string,value:ModuleRelevanceStore){try{localStorage.setItem(key,JSON.stringify(value));}catch{/* Storage availability must never block module navigation. */}}
function codes(value:unknown):readonly string[]{if(!Array.isArray(value))return[];const seen=new Set<string>();return value.flatMap((item)=>typeof item==="string"&&/^[a-z][a-z0-9_-]{0,63}$/u.test(item)&&!seen.has(item)?(seen.add(item),[item]):[]);}
