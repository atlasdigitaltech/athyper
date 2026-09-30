"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { parseExperienceSurface, type ExperienceSurface } from "@athyper/contract-platform-dashboard";
import type { HttpClient } from "@athyper/platform-api-client";
import { effectiveExperienceSurfaceOperation } from "@athyper/platform-api-client/experience-surface";
import { createRegistryPolicy, ExperienceSurfaceView, type ExperienceDataResult, type ExperienceModulePresentation, type ExperienceRuntimeRegistry } from "./index";
const EMPTY_CONTEXT: Readonly<Record<string,string>> = Object.freeze({});
const IDENTITY_SURFACE = (surface: ExperienceSurface): ExperienceSurface => surface;

export function BrowserExperienceSurface({ client, surfaceKey, registry, fallback, context = EMPTY_CONTEXT, headerAccessory, framedHeader = false, hideHeader = false, transformSurface = IDENTITY_SURFACE, modulePresentation }: Readonly<{ client: HttpClient; surfaceKey: string; registry: ExperienceRuntimeRegistry; fallback: ExperienceSurface; context?: Readonly<Record<string,string>>; headerAccessory?: ReactNode; framedHeader?: boolean; hideHeader?: boolean; transformSurface?: (surface: ExperienceSurface) => ExperienceSurface; modulePresentation?: ExperienceModulePresentation }>) {
  const [surface,setSurface]=useState<ExperienceSurface>(fallback),[data,setData]=useState<ReadonlyMap<string,ExperienceDataResult>>(new Map()),[notice,setNotice]=useState("");
  const displayedSurface=useMemo(()=>transformSurface(surface),[surface,transformSurface]);
  useEffect(()=>{const controller=new AbortController();setNotice("");client.request(effectiveExperienceSurfaceOperation,{params:{surfaceKey},signal:controller.signal}).then((result)=>{try{setSurface(parseExperienceSurface(result.surface,createRegistryPolicy(registry)));}catch(error){setSurface(fallback);setNotice(error instanceof Error?error.message:"Published experience failed registry validation");}}).catch((error)=>{if(!controller.signal.aborted){setSurface(fallback);setNotice(error instanceof Error?error.message:"Published experience is unavailable");}});return()=>controller.abort();},[client,surfaceKey,registry,fallback]);
  useEffect(()=>{let active=true;Promise.all(displayedSurface.blocks.flatMap((block)=>"dataSource" in block?[Promise.resolve(registry.dataSources[block.dataSource]!(context)).then((result)=>[block.id,result] as const)]:[])).then((entries)=>{if(active)setData(new Map(entries));});return()=>{active=false;};},[displayedSurface,registry,context]);
  return <>{notice?<p className="athyper-experience__notice" role="status">Using the governed system default. {notice}</p>:null}<ExperienceSurfaceView surface={displayedSurface} registry={registry} data={data} headerAccessory={headerAccessory} framedHeader={framedHeader} hideHeader={hideHeader} modulePresentation={modulePresentation}/></>;
}
