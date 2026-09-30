"use client";
import { useRef, type ReactNode } from "react";

export type FilterChipItem = { value:string; label:string; count?:number; icon?:ReactNode; action?:ReactNode; className?:string };
/** Single-choice filters, separate from primary tabs and per-item management actions. */
export function FilterChipGroup({label,items,value,onValueChange,className=""}:{label:string;items:readonly FilterChipItem[];value:string;onValueChange:(value:string)=>void;className?:string}) {
  const root=useRef<HTMLDivElement>(null);
  return <div ref={root} role="group" aria-label={label} className={`a-filter-chip-group ${className}`}>{items.map((item,index)=><span key={item.value} className={`a-filter-chip-item ${item.className??""}`}>
    <button type="button" className="a-filter-chip" aria-pressed={value===item.value} onClick={()=>onValueChange(item.value)} onKeyDown={event=>{
      const rtl=getComputedStyle(event.currentTarget).direction==="rtl";
      const step=event.key==="ArrowRight"?(rtl?-1:1):event.key==="ArrowLeft"?(rtl?1:-1):0;
      const next=event.key==="Home"?0:event.key==="End"?items.length-1:step?(index+step+items.length)%items.length:undefined;
      if(next===undefined)return;event.preventDefault();onValueChange(items[next]!.value);root.current?.querySelectorAll<HTMLButtonElement>(".a-filter-chip")[next]?.focus();
    }}>{item.icon?<span className="a-filter-chip__icon" aria-hidden="true">{item.icon}</span>:null}<span>{item.label}</span>{item.count!==undefined?<span className="a-filter-chip__count">{item.count>99?"99+":item.count}</span>:null}</button>
    {item.action}
  </span>)}</div>;
}
