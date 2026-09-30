"use client";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { useComposerPopover } from "./use-composer-popover";
export interface MentionCandidate { readonly id: string; readonly displayName: string; readonly username?: string }
export function CommentMentionPicker({visibility, search, onSelect, currentPrincipalId, disabled}: {
  visibility: "public" | "internal" | "private";
  search: (query: string, visibility: "public" | "internal" | "private") => Promise<readonly MentionCandidate[]>;
  onSelect: (person: MentionCandidate) => void; currentPrincipalId?: string; disabled: boolean;
}) {
  const intl = useEntityI18n(), id = useId();
  const root = useRef<HTMLDetailsElement>(null), panel = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  const [query,setQuery] = useState(""), [items,setItems] = useState<readonly MentionCandidate[]>([]);
  const [state,setState] = useState<"idle"|"loading"|"ready"|"error">("idle"), [retry,setRetry] = useState(0), [active,setActive] = useState(-1);
  const open = useComposerPopover(root,panel,()=>{ (input.current ?? panel.current)?.focus({preventScroll:true}); });
  const find = useEffectEvent(search);
  useEffect(()=>{
    setItems([]); setActive(-1);
    if (!open || visibility === "private" || !query.trim()) {setState("idle");return;}
    let cancelled = false; setState("loading");
    const timer = setTimeout(()=>{void find(query,visibility).then(result=>{if(!cancelled){setItems(result);setState("ready");}}).catch(()=>{if(!cancelled)setState("error");});},250);
    return ()=>{cancelled=true;clearTimeout(timer);};
  },[open,query,visibility,retry]);
  useEffect(()=>{if(!open)setQuery("");},[open]);
  const choose = (person: MentionCandidate) => { if(disabled)return; if(root.current)root.current.open=false; panel.current?.hidePopover(); onSelect(person); };
  return <details ref={root} className="a-rich-comment-composer__mentions">
    <summary role="button" aria-label={intl.message("comments.mention")} aria-expanded={open} aria-haspopup="dialog" aria-disabled={disabled} onClick={event=>{if(disabled)event.preventDefault();}}>@</summary>
    <div ref={panel} popover="auto" role="dialog" aria-label={intl.message("comments.mention")} tabIndex={-1} className="a-composer-popover">
      {visibility === "private" ? <p>{intl.message("comments.mentionPrivate")}</p> : <>
        <label htmlFor={id}>{intl.message("comments.mention")}</label>
        <input ref={input} id={id} role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={active>=0?`${id}-${active}`:undefined} placeholder={intl.message("comments.mentionSearch")} value={query} onChange={event=>{setQuery(event.currentTarget.value);setActive(-1);}} onKeyDown={event=>{
          if((event.key==="ArrowDown" || event.key==="ArrowUp") && items.length){event.preventDefault();const next=(active+(event.key==="ArrowDown"?1:active<0?0:items.length-1)+items.length)%items.length;setActive(next);document.getElementById(`${id}-${next}`)?.scrollIntoView({block:"nearest"});}
          if(event.key==="Enter"){event.preventDefault();if(active>=0 && items[active])choose(items[active]!);}
        }}/>
        <div role="status" aria-live="polite">{state==="loading"?intl.message("comments.mentionLoading"):state==="ready"&&!items.length?intl.message("comments.mentionEmpty"):state==="idle"?intl.message("comments.mentionSearch"):null}</div>
        {state==="error"?<div role="alert">{intl.message("comments.mentionError")} <button type="button" onClick={()=>setRetry(n=>n+1)}>{intl.message("action.retry")}</button></div>:null}
        <ul id={`${id}-list`} role="listbox" aria-label={intl.message("comments.matches")} aria-busy={state==="loading"}>{items.map((person,index)=><li role="option" aria-selected={active===index} id={`${id}-${index}`} key={person.id} onPointerMove={()=>setActive(index)} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(person)}>
          <span className="a-mention-avatar" aria-hidden="true">{person.displayName.trim().split(/\s+/).slice(0,2).map(part=>Array.from(part)[0]).join("")}</span>
          <span className="a-mention-identity"><span>{person.displayName}{person.id===currentPrincipalId?<small className="a-mention-self">{intl.message("comments.mentionYou")}</small>:null}</span>{person.username?<small>@{person.username}</small>:null}</span>
        </li>)}</ul>
      </>}
    </div>
  </details>;
}
