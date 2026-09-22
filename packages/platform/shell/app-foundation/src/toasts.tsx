"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, Toast, ToastRegion } from "@athyper/platform-ui";

export interface ToastMessage {
  readonly id: string;
  readonly title: string;
  readonly detail?: string;
  readonly tone: "info" | "success" | "warning" | "danger";
  /** Success defaults to five seconds; other tones remain persistent. */
  readonly durationMs?: number;
  readonly dedupeKey?: string;
}
const ToastContext = createContext<{
  messages: readonly ToastMessage[];
  push(message: Omit<ToastMessage, "id">): string;
  dismiss(id: string): void;
} | undefined>(undefined);
export function useToasts() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToasts requires ToastProvider");
  return value;
}
const transient = (message: Omit<ToastMessage,"id">) => (message.durationMs ?? (message.tone === "success" ? 5000 : 0)) > 0;

/** Mounted inside the authenticated context boundary; stale async callers cannot repopulate it. */
export function ToastProvider({children}: {children: ReactNode}) {
  const [messages,setMessages] = useState<readonly ToastMessage[]>([]);
  const current = useRef<readonly ToastMessage[]>([]);
  const sequence = useRef(0), active = useRef(true);
  useEffect(()=>{active.current=true;return()=>{active.current=false;current.current=[];};},[]);
  const dismiss = useCallback((id:string)=>{
    if(!active.current)return;
    current.current=current.current.filter(message=>message.id!==id);
    setMessages(current.current);
  },[]);
  const push = useCallback((message:Omit<ToastMessage,"id">)=>{
    if(!active.current)return "";
    const duplicate=current.current.find(item=>message.dedupeKey ? item.dedupeKey===message.dedupeKey : item.tone===message.tone && item.title===message.title && item.detail===message.detail);
    if(duplicate)return duplicate.id;
    const id=`toast-${++sequence.current}`;
    // Routine successes replace one another; important persistent messages remain.
    let queue=current.current.filter(item=>!(message.tone==="success" && transient(message) && item.tone==="success" && transient(item)));
    if(queue.length>=5){
      const discard=queue.findIndex(transient);
      // Completed actions must not displace persistent session/security warnings.
      if(discard<0 && transient(message))return "";
      queue.splice(discard<0?0:discard,1);
    }
    current.current=[...queue,{...message,id}];setMessages(current.current);return id;
  },[]);
  const value=useMemo(()=>({messages,push,dismiss}),[messages,push,dismiss]);
  return <ToastContext.Provider value={value}>{children}<GlobalToastHost messages={messages} dismiss={dismiss}/></ToastContext.Provider>;
}
function GlobalToastHost({messages,dismiss}:{messages:readonly ToastMessage[];dismiss:(id:string)=>void}) {
  const ref=useRef<HTMLDivElement>(null);
  const [blocked,setBlocked]=useState(false);
  useEffect(()=>{
    const sync=()=>setBlocked(Boolean(ref.current?.closest("[inert]")) || document.hidden);
    const observer=new MutationObserver(sync);
    observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:["inert"]});
    document.addEventListener("visibilitychange",sync);sync();
    return()=>{observer.disconnect();document.removeEventListener("visibilitychange",sync);};
  },[]);
  // Do not exempt notifications from modal isolation. Pause timers and announcements
  // until the background is usable again; the host never takes keyboard focus.
  return <div ref={ref} className="a-global-toast-host">
    <ToastRegion aria-label="Action notifications" aria-live="off" hidden={blocked}>
      {messages.map(message=><TimedToast key={message.id} message={message} blocked={blocked} dismiss={dismiss}/>)}
    </ToastRegion>
  </div>;
}
function TimedToast({message,blocked,dismiss}:{message:ToastMessage;blocked:boolean;dismiss:(id:string)=>void}) {
  const [hovered,setHovered]=useState(false),[focused,setFocused]=useState(false);
  const remaining=useRef(message.durationMs ?? (message.tone==="success"?5000:0));
  useEffect(()=>{
    if(blocked || hovered || focused || remaining.current<=0)return;
    const start=Date.now(),timer=window.setTimeout(()=>dismiss(message.id),remaining.current);
    return()=>{window.clearTimeout(timer);remaining.current=Math.max(1,remaining.current-(Date.now()-start));};
  },[blocked,hovered,focused,dismiss,message.id]);
  return <Toast tone={message.tone} title={message.title} className="a-global-toast"
    aria-live={blocked?"off":message.tone==="danger"?"assertive":"polite"} aria-atomic="true"
    onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)}
    onFocusCapture={()=>setFocused(true)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setFocused(false);}}>
    {message.detail?<p>{message.detail}</p>:null}
    <Button variant="ghost" size="icon" aria-label="Dismiss notification" onClick={()=>dismiss(message.id)}>×</Button>
  </Toast>;
}
