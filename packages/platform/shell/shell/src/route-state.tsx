"use client";
import React, {createContext,useContext,useState,useEffect,useMemo,type ReactNode} from "react";
import { RecordFooterProvider } from "./record-footer";
import {deriveBreadcrumbs,type DerivedShellNavigation} from "./core";
export interface EntityBreadcrumbBinding {readonly basePath:string;readonly sections:readonly {readonly href:string;readonly aliases:readonly string[];readonly label:string}[];}
export interface RecordBreadcrumbBinding { readonly pathname: string; readonly label: string; readonly recordPath?: string; }
const ShellRouteContext=createContext<{record?:RecordBreadcrumbBinding;setRecord:React.Dispatch<React.SetStateAction<RecordBreadcrumbBinding|undefined>>;pathname:string;binding?:EntityBreadcrumbBinding;setBinding:React.Dispatch<React.SetStateAction<EntityBreadcrumbBinding|undefined>>}|undefined>(undefined);
export function ShellRouteProvider({pathname,children}:{readonly pathname:string;readonly children:ReactNode}) {
  const [record,setRecord]=useState<RecordBreadcrumbBinding>();
  const [binding,setBinding]=useState<EntityBreadcrumbBinding>();
  const value=useMemo(()=>({pathname,binding,setBinding,record,setRecord}),[pathname,binding,record]);
  return <ShellRouteContext.Provider value={value}><RecordFooterProvider>{children}</RecordFooterProvider></ShellRouteContext.Provider>;
}
export const useShellRoute=()=>useContext(ShellRouteContext);
/** Registration lasts only as long as the authorized application descriptor. */
export function useEntityBreadcrumbBinding(binding:EntityBreadcrumbBinding|undefined) {
  const setBinding=useShellRoute()?.setBinding;
  const serialized=JSON.stringify(binding);
  useEffect(()=>{if(!setBinding||!serialized)return;const next=JSON.parse(serialized) as EntityBreadcrumbBinding;setBinding(next);return()=>setBinding(current=>current===next?undefined:current);},[setBinding,serialized]);
}
export function deriveEntityBreadcrumbs(navigation:DerivedShellNavigation,pathname:string,binding?:EntityBreadcrumbBinding,record?:RecordBreadcrumbBinding) {
  const path=pathname.split(/[?#]/)[0]!;
  if(record?.pathname===path){ const crumbs=deriveBreadcrumbs(navigation,path); if(record.recordPath && (path===record.recordPath || path.startsWith(`${record.recordPath}/`))) {
    const trailing=path.slice(record.recordPath.length).split("/").filter(Boolean).length;
    return crumbs.map((crumb,index)=>index===crumbs.length-trailing-1 ? {...crumb,label:record.label,href:record.recordPath} : crumb);
  }
  return [...crumbs.slice(0,-1),{label:record.label,href:path}]; }
  const section=binding?.sections.find(item=>item.href===path||item.aliases.includes(path));
  if(!binding||!section)return deriveBreadcrumbs(navigation,path);
  return [...deriveBreadcrumbs(navigation,binding.basePath),{label:section.label,href:section.href}];
}

export function useRecordBreadcrumb(label: string, recordPath?: string) {
  const route=useShellRoute(), pathname=route?.pathname, setRecord=route?.setRecord;
  useEffect(()=>{ if(!setRecord||!pathname)return; const record={pathname:pathname.split(/[?#]/)[0]!,label,recordPath}; setRecord(record); return()=>setRecord(current=>current===record?undefined:current); },[setRecord,pathname,label,recordPath]);
}
