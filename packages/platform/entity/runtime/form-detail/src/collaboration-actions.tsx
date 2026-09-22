"use client";
import { Tooltip, registerModalBranch } from "@athyper/platform-ui";
import { createPortal } from "react-dom";
import { MoreHorizontalIcon } from "@athyper/platform-icons";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** Native disclosure keeps actions keyboard accessible without browser prompts. */
export function CollaborationActions({
  label,
  children,
  portal = false,
}: {
  readonly label: string;
  readonly portal?: boolean;
  readonly children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{top:number;left:number}>();
  const close = () => { ref.current?.removeAttribute("open"); setPosition(undefined); };
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target) && !menuRef.current?.contains(event.target))
        close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && ref.current?.open) {
        event.preventDefault();
        event.stopPropagation();
        close();
        ref.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    const reposition = (event: Event) => {
      if (portal && !(event.target instanceof Node && menuRef.current?.contains(event.target))) close();
    };
    window.addEventListener("resize", reposition);
    document.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", reposition);
      document.removeEventListener("scroll", reposition, true);
    };
  }, [portal]);
  useLayoutEffect(()=>{
    if(portal && position && ref.current && menuRef.current)return registerModalBranch(ref.current,menuRef.current);
  },[portal,Boolean(position)]);
  useLayoutEffect(()=>{
    if(!portal || !position || !menuRef.current || !ref.current)return;
    const anchor=ref.current.getBoundingClientRect(), menu=menuRef.current.getBoundingClientRect();
    const left=Math.max(8,Math.min(anchor.right-menu.width,window.innerWidth-menu.width-8));
    const top=anchor.bottom+4+menu.height<=window.innerHeight-8 ? anchor.bottom+4 : Math.max(8,anchor.top-menu.height-4);
    if(left!==position.left || top!==position.top)setPosition({left,top});
  },[portal,position]);
  const menu = <div
    ref={menuRef}
    className={`a-collaboration-actions__list${portal ? " a-collaboration-actions__list--portal" : ""}`}
    role="group"
    aria-label={label}
    style={portal ? {position:"fixed",top:position?.top,left:position?.left,right:"auto",zIndex:"var(--a-z-popover)",maxHeight:"calc(100dvh - 16px)",overflowY:"auto"} : undefined}
    onClick={event=>{if((event.target as HTMLElement).closest("button")) close();}}
  >{children}</div>;
  return <Tooltip label={label}><details ref={ref} className="a-collaboration-actions" onToggle={()=>{
    if(!portal)return;
    if(!ref.current?.open){setPosition(undefined);return;}
    const bounds=ref.current.getBoundingClientRect();
    setPosition({top:Math.min(bounds.bottom,window.innerHeight-80),left:Math.max(8,Math.min(bounds.right-208,window.innerWidth-216))});
  }}>
    <summary aria-label={label} onKeyDown={event=>{
      if(portal && event.key==="Tab" && !event.shiftKey && ref.current?.open && menuRef.current){
        event.preventDefault();menuRef.current.querySelector<HTMLButtonElement>("button")?.focus();
      }
    }}><MoreHorizontalIcon size={18} aria-hidden="true"/></summary>
    {portal ? position ? createPortal(menu,document.body) : null : menu}
  </details></Tooltip>;

}
export function collaborationTime(value: unknown) {
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
}
export function collaborationFileSize(value: unknown) {
  const bytes = Number(value);
  return Number.isFinite(bytes)
    ? bytes < 1024
      ? `${bytes} B`
      : bytes < 1024 * 1024
        ? `${Math.round(bytes / 1024)} KB`
        : `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : "";
}
