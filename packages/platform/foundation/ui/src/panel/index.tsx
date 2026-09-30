"use client";
import { useId, useRef, type HTMLAttributes, type ReactNode, type Ref, type MouseEventHandler } from "react";

import { Tooltip } from "../tooltip";

export interface PanelHeaderAction {
  readonly label: string;
  readonly tooltip?: string;
  readonly icon: ReactNode;
  readonly onClick?: MouseEventHandler<HTMLButtonElement | HTMLAnchorElement>;
  readonly href?: string;
  readonly disabled?: boolean;
  readonly pressed?: boolean;
  readonly expanded?: boolean;
  readonly controls?: string;
  readonly buttonRef?: Ref<HTMLButtonElement>;
}
export interface PanelHeaderCapabilities {
  readonly new?: PanelHeaderAction;
  readonly history?: PanelHeaderAction;
  readonly pin?: PanelHeaderAction;
  readonly fullView?: PanelHeaderAction;
  readonly close?: PanelHeaderAction;
}
export function PanelHeaderActions({ capabilities }: { capabilities: PanelHeaderCapabilities }) {
  return <>{(["new", "history", "pin", "fullView", "close"] as const).map(key => {
    const action = capabilities[key];
    if (!action) return null;
    const props = { "aria-label": action.label, "aria-pressed": action.pressed,
      "aria-expanded": action.expanded, "aria-controls": action.controls,
      "data-panel-action": key, onClick: action.onClick };
    return <Tooltip key={key} portal side="bottom" label={action.tooltip ?? action.label}>
      {action.href && !action.disabled
        ? <a {...props} href={action.href}>{action.icon}</a>
        : <button {...props} ref={action.buttonRef} type="button" disabled={action.disabled}>{action.icon}</button>}
    </Tooltip>;
  })}</>;
}

/** Visual panel chrome only; owners retain navigation, data and open state. */
export function PanelHeader({icon,title,subtitle,titleId,subtitleId,titleRef,actionsLabel="Panel actions",actions,capabilities,className="",...props}:Omit<HTMLAttributes<HTMLElement>,"title"> & {icon:ReactNode;title:ReactNode;subtitle?:ReactNode;titleId?:string;subtitleId?:string;titleRef?:Ref<HTMLElement>;actionsLabel?:string;actions?:ReactNode;capabilities?:PanelHeaderCapabilities}) {
  return <header {...props} className={`a-panel-header ${className}`}><span className="a-panel-header__icon" aria-hidden="true">{icon}</span><div className="a-panel-header__identity"><strong ref={titleRef} tabIndex={titleRef ? -1 : undefined} id={titleId} role="heading" aria-level={2}>{title}</strong>{subtitle?<small id={subtitleId}>{subtitle}</small>:null}</div>{actions || capabilities?<nav className="a-panel-header__actions" aria-label={actionsLabel}>{capabilities ? <PanelHeaderActions capabilities={capabilities}/> : null}{actions}</nav>:null}</header>;
}

export type PanelTab = {key:string;label:string;count?:number;id?:string;panelId:string;accessibleLabel?:string};
export function PanelTabs({items,value,onValueChange,label,className="",hidden=false}:{items:readonly PanelTab[];value:string;onValueChange:(key:string)=>void;label:string;className?:string;hidden?:boolean}) {
  const root=useRef<HTMLDivElement>(null),id=useId();
  return <div ref={root} hidden={hidden} className={`a-panel-tabs ${className}`} role="tablist" aria-label={label}>{items.map((item,index)=><button key={item.key} id={item.id??`${id}-${item.key}`} type="button" role="tab" aria-label={item.accessibleLabel} aria-selected={value===item.key} aria-controls={item.panelId} tabIndex={value===item.key?0:-1} onClick={()=>onValueChange(item.key)} onKeyDown={event=>{
    const rtl=getComputedStyle(event.currentTarget).direction==="rtl";
    const step=event.key==="ArrowRight"?(rtl?-1:1):event.key==="ArrowLeft"?(rtl?1:-1):0;
    const next=event.key==="Home"?0:event.key==="End"?items.length-1:step?(index+step+items.length)%items.length:undefined;
    if(next===undefined)return;event.preventDefault();onValueChange(items[next]!.key);root.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }}><span>{item.label}</span>{item.count!==undefined && item.count>0?<span className="a-panel-tabs__count">{item.count}</span>:null}</button>)}</div>;
}

export function PanelEmptyState({icon,title,description,action,tone="neutral",className="",...props}:Omit<HTMLAttributes<HTMLDivElement>,"title"> & {icon:ReactNode;title:ReactNode;description?:ReactNode;action?:ReactNode;tone?:"neutral"|"error"}) {
  return <div {...props} className={`a-panel-empty-state ${className}`} data-tone={tone}><span className="a-panel-empty-state__icon" aria-hidden="true">{icon}</span><h3>{title}</h3>{description?<p>{description}</p>:null}{action?<div className="a-panel-empty-state__actions">{action}</div>:null}</div>;
}

/** Scope is supplied by the authenticated feature owner, never inferred from the URL.
 * Record tools and global attention tools share chrome without sharing scope. */
export type PanelScope =
  | { readonly kind: "record"; readonly label: ReactNode; readonly detail?: ReactNode }
  | { readonly kind: "global"; readonly label: ReactNode; readonly detail?: ReactNode };
export function PanelContextRow({ scope, className = "", ...props }: HTMLAttributes<HTMLDivElement> & { scope: PanelScope }) {
  return <div {...props} className={`a-panel-context ${className}`} data-scope={scope.kind}>
    <span className="a-panel-context__label">{scope.label}</span>
    {scope.detail ? <span className="a-panel-context__detail">{scope.detail}</span> : null}
  </div>;
}
export function PanelToolbar({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`a-panel-toolbar ${className}`} />;
}
export function PanelFooter({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`a-panel-footer ${className}`} />;
}
