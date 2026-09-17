"use client";
import React, { type ReactNode, type HTMLAttributes } from "react";
import { PageFrame } from "./page-foundation";
import { EntityPageLayout } from "./entity-page-layout";

/** Shared collection chrome; record pages retain EntityPageLayout's ownership behavior. */
export function ManagementWorkspace({header,navigation,children,className}: {readonly header:ReactNode;readonly navigation:ReactNode;readonly children:ReactNode;readonly className?:string}) {
  return <PageFrame width="wide" className={["a-management-workspace",className].filter(Boolean).join(" ")}><EntityPageLayout collectionHeader={header} collectionNavigation={navigation}>{children}</EntityPageLayout></PageFrame>;
}
export interface ManagementNavigationItem {readonly key:string;readonly label:ReactNode;readonly href:string;readonly count?:number;readonly overflow?:boolean;}
export function ManagementNavigation({items,currentKey,label,onNavigate,moreLabel="More",appearance="card"}:{readonly items:readonly ManagementNavigationItem[];readonly currentKey?:string;readonly label:string;readonly onNavigate?:(href:string)=>void;readonly moreLabel?:string;readonly appearance?:"card"|"flat"}) {
  const link=(item:ManagementNavigationItem)=><a key={item.key} href={item.href} aria-current={item.key===currentKey?"page":undefined} onClick={event=>{if(onNavigate&&event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();onNavigate(item.href);}}}>{item.label}{item.count!==undefined&&item.count>0?<span className="a-management-navigation__count">{item.count}</span>:null}</a>;
  const overflow=items.filter(item=>item.overflow);
  return <nav className="athyper-section-nav a-management-navigation" data-appearance={appearance} aria-label={label}>{items.filter(item=>!item.overflow).map(link)}{overflow.length?<details className="a-management-navigation__more"><summary className={overflow.some(item=>item.key===currentKey)?"is-current":undefined}>{moreLabel} <span aria-hidden="true">▾</span></summary><div className="a-management-navigation__overflow">{overflow.map(link)}</div></details>:null}</nav>;
}
/** Slots stay module-owned: saved views, search and permitted controls. */
export function ManagementToolbar({children,className,...props}:HTMLAttributes<HTMLDivElement>) {
 return <div {...props} className={["a-management-toolbar",className].filter(Boolean).join(" ")}>{children}</div>;
}
