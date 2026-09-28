"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, Toast, ToastRegion } from "@athyper/platform-ui";

export interface ToastMessage {
  readonly id: string;
  readonly title: string;
  readonly detail?: string;
  readonly tone: "info" | "success" | "warning" | "danger";
  /** Success defaults to five seconds, or ten with an action; other tones remain persistent. */
  readonly durationMs?: number;
  readonly dedupeKey?: string;
  readonly action?: { readonly label: string; readonly onClick: () => void };
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
const transient = (message: Omit<ToastMessage,"id">) => (message.durationMs ?? (message.tone === "success" ? (message.action ? 10000 : 5000) : 0)) > 0;

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
    const duplicate=current.current.find(item=>message.dedupeKey ? item.dedupeKey===message.dedupeKey : !message.action && !item.action && item.tone===message.tone && item.title===message.title && item.detail===message.detail);
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
  useEffect(() => {
    if (!messages.length) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const host = ref.current;
        const region = host?.querySelector<HTMLElement>(".a-toast-region");
        if (!host || !region) return;
        const bounds = region.getBoundingClientRect();
        let offset = 0;
        for (const element of document.querySelectorAll<HTMLElement>("[data-toast-avoid]")) {
          if (!element.getClientRects().length) continue;
          const rect = element.getBoundingClientRect();
          if (rect.right > bounds.left && rect.left < bounds.right && rect.bottom > window.innerHeight / 2 && rect.top < window.innerHeight)
            offset = Math.max(offset, window.innerHeight - rect.top);
        }
        host.style.setProperty("--a-toast-bottom-offset", `${offset}px`);
      });
    };
    const resize = new ResizeObserver(update);
    resize.observe(document.body);
    const observeControls = () => {
      resize.disconnect();
      resize.observe(document.body);
      document.querySelectorAll("[data-toast-avoid]").forEach(node => resize.observe(node));
      update();
    };
    const mutation = new MutationObserver(observeControls);
    mutation.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
    document.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    observeControls();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
      document.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      ref.current?.style.removeProperty("--a-toast-bottom-offset");
    };
  }, [messages.length]);
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
  const remaining=useRef(message.durationMs ?? (message.tone==="success"?(message.action?10000:5000):0));
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
    {message.action ? <Button className="a-global-toast__action" variant="ghost" onClick={() => { message.action!.onClick(); dismiss(message.id); }}>{message.action.label}</Button> : null}
    <Button variant="ghost" size="icon" aria-label="Dismiss notification" onClick={()=>dismiss(message.id)}>×</Button>
  </Toast>;
}
