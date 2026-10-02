"use client";
import * as React from "react";
import { Children, cloneElement, isValidElement, useEffect, useId, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { registerModalBranch } from "./modal-isolation";

export function Tooltip({ label, children, portal = false, onlyWhenTruncated = false, side = "top" }: { readonly side?: "top" | "bottom"; readonly label: string; readonly children: ReactElement; readonly portal?: boolean; readonly onlyWhenTruncated?: boolean }) {
  const id = useId(); const child = Children.only(children);
  const anchor = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({left:8,top:8});
  const [truncated, setTruncated] = useState(false);
  const openTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const interaction = useRef({ anchor: false, bubble: false, focus: false, dismissed: false, open: false });
  const clearTimers = () => { clearTimeout(openTimer.current); clearTimeout(closeTimer.current); openTimer.current=undefined; closeTimer.current=undefined; };
  const dismiss = () => { clearTimers(); interaction.current.dismissed=true; interaction.current.open=false; setOpen(false); };
  const show = () => { if (!interaction.current.dismissed) { interaction.current.open=true; setOpen(true); } };
  const leave = () => {
    clearTimeout(openTimer.current); openTimer.current=undefined;
    if (interaction.current.anchor || interaction.current.bubble || interaction.current.focus) return;
    // Allow crossing the small physical gap to either inline or portalled content.
    clearTimeout(closeTimer.current);
    closeTimer.current=setTimeout(() => { interaction.current.open=false; setOpen(false); },150);
  };
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key==='Escape' && (interaction.current.open || openTimer.current !== undefined)) {
        event.preventDefault(); event.stopPropagation(); dismiss();
      }
    };
    document.addEventListener('keydown',escape,true);
    return () => { clearTimers(); document.removeEventListener('keydown',escape,true); };
  }, []);
  React.useLayoutEffect(() => {
    if (!onlyWhenTruncated) return;
    const child = anchor.current?.firstElementChild as HTMLElement | null;
    const target = child?.querySelector<HTMLElement>('[data-tooltip-label]') ?? child;
    if (!target) return;
    const measure = () => setTruncated(getComputedStyle(target).display === 'none' || target.scrollWidth > target.clientWidth + 1 || target.scrollHeight > target.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    return () => observer.disconnect();
  }, [onlyWhenTruncated, label]);
  const suppressed = (onlyWhenTruncated && !truncated) || Boolean((child.props as Record<string, unknown>)["data-tooltip-dismissed"]);
  const previousSuppressed = useRef(suppressed);
  useEffect(() => {
    const becameAvailable=previousSuppressed.current && !suppressed;
    previousSuppressed.current=suppressed;
    clearTimers(); interaction.current.open=false; setOpen(false);
    if (suppressed || interaction.current.dismissed) return;
    // Re-measurement may reveal a truncated label while its trigger is focused.
    // File actions can also clear explicit suppression on fresh hover/Tab.
    if (interaction.current.focus && (onlyWhenTruncated || (becameAvailable && !interaction.current.anchor))) show();
    else if (becameAvailable && interaction.current.anchor)
      openTimer.current=setTimeout(()=>{openTimer.current=undefined;show();},600);
  }, [label, suppressed]);
  React.useLayoutEffect(() => {
    if (portal && open && !suppressed && anchor.current && bubble.current)
      return registerModalBranch(anchor.current,bubble.current);
  }, [portal,open,suppressed]);
  React.useLayoutEffect(() => {
    if (!portal || !open || suppressed) return;
    const place = () => {
      const rect = anchor.current?.getBoundingClientRect();
      const tip = bubble.current?.getBoundingClientRect();
      if (!rect || !tip) return;
      const above = rect.top-tip.height-8, below = rect.bottom+8;
      const top = side === "bottom"
        ? (below+tip.height <= window.innerHeight-8 ? below : above)
        : (above >= 8 ? above : below);
      setPosition({left:Math.max(8,Math.min(rect.right-tip.width,window.innerWidth-tip.width-8)),top:Math.max(8,Math.min(top,window.innerHeight-tip.height-8))});
    };
    place(); window.addEventListener("resize",place); window.addEventListener("scroll",place,true);
    return () => {window.removeEventListener("resize",place);window.removeEventListener("scroll",place,true);};
  },[portal,open,label,suppressed,side]);
  const describedBy = isValidElement<{ "aria-describedby"?: string }>(child) ? child.props["aria-describedby"] : undefined;
  const content = <span ref={bubble} id={id} role="tooltip" onPointerEnter={()=>{interaction.current.bubble=true;clearTimeout(closeTimer.current);}} onPointerLeave={()=>{interaction.current.bubble=false;leave();}} className={portal ? "a-tooltip__portal" : "a-tooltip__content"} style={portal ? {position:"fixed",...position,width:"max-content",maxWidth:"min(20rem, calc(100vw - 16px))",whiteSpace:"normal",overflowWrap:"anywhere",pointerEvents:"auto",zIndex:2147483647,padding:".375rem .625rem",borderRadius:"var(--a-radius-sm)",background:"var(--a-foreground)",color:"var(--a-background)",fontSize:"var(--a-font-size-xs)"} : side === "bottom" ? {insetBlockEnd:"auto",insetBlockStart:"calc(100% + .375rem)"} : undefined}>{label}</span>;
  return <span ref={anchor} className="a-tooltip" onPointerEnter={event=>{
    if(event.pointerType==='touch') return;
    interaction.current.anchor=true; interaction.current.dismissed=false;
    clearTimers(); if (!suppressed) openTimer.current=setTimeout(()=>{openTimer.current=undefined;show();},600);
  }} onPointerLeave={()=>{interaction.current.anchor=false;leave();}}
  onPointerDownCapture={dismiss} onClick={dismiss}
  onFocusCapture={(event)=>{ interaction.current.focus=true;
    // Keyboard focus only: focus that returns after a click or a native dialog
    // (for example the file picker behind Attach) must not leave a tooltip open.
    let keyboard=true; try { keyboard=(event.target as Element).matches(":focus-visible"); } catch { /* older engines: keep showing */ }
    if(keyboard && !interaction.current.dismissed && !suppressed) {clearTimers();show();} }}
  onBlurCapture={()=>{interaction.current.focus=false;interaction.current.dismissed=false;leave();}}>
    {cloneElement(child as ReactElement<Record<string, unknown>>, { "aria-describedby": [describedBy, open && !suppressed ? id : undefined].filter(Boolean).join(" ") })}
    {open && !suppressed ? portal ? createPortal(content,document.body) : content : null}
  </span>;
}
