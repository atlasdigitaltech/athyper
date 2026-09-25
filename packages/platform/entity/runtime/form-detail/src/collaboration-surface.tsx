"use client";

import { readBrowserPreference, writeBrowserPreference } from "./record/browser-preferences";

import { CollaborationVisibilityContext, CollaborationPresentationContext, CollaborationToolbarContext } from "./collaboration-visibility";
import { PanelHeader, PanelTabs, Tooltip, useModalIsolation } from "@athyper/platform-ui";
import {
  CloseIcon,
  MessageSquareIcon,
  FileTextIcon,
  Maximize2Icon,
  PanelRightIcon,
} from "@athyper/platform-icons";
import { useWorkspaceSidePanel } from "@athyper/platform-shell";
import { createPortal } from "react-dom";
import {
  useLayoutEffect,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

type CollaborationSection = { readonly key: string; readonly label: string };
const preference = "athyper.collaboration.panel";

/** One persistent tree across dock, overlay and page content; never clone a composer. */
export function EntityCollaborationSurface({
  open,
  fullView,
  onFullViewChange,
  recordEditing = false,
  pinned = true,
  activeSectionKey,
  sections,
  onOpenChange,
  onPinnedChange,
  onActiveSectionChange,
  preloadSection,
  renderSection,
}: {
  readonly open: boolean;
  readonly fullView?: boolean;
  readonly onFullViewChange?: (full:boolean)=>void;
  readonly recordEditing?: boolean;
  readonly pinned?: boolean;
  readonly activeSectionKey?: string;
  readonly sections: readonly CollaborationSection[];
  readonly onOpenChange: (open: boolean) => void;
  readonly onPinnedChange?: (pinned: boolean) => void;
  readonly onActiveSectionChange: (sectionKey: string) => void;
  readonly preloadSection: (sectionKey: string) => void;
  readonly renderSection: (sectionKey: string) => ReactNode;
}) {
  const slot = useWorkspaceSidePanel();
  const [host, setHost] = useState<HTMLDivElement>();
  const mount = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = document.createElement("div");
    node.className = "a-collaboration-host";
    setHost(node);
    return () => node.remove();
  }, []);
  const wasOpen = useRef(false);
  const claim = slot?.claim,
    release = slot?.release;
  const [localFull, setLocalFull] = useState(false),
    [compact, setCompact] = useState(false),
    [width, setWidth] = useState(420);
  const [contentTop, setContentTop] = useState(0),
    [ready, setReady] = useState(false),
    [visited, setVisited] = useState<readonly string[]>([]);
  const root = useRef<HTMLElement>(null),
    opener = useRef<HTMLElement | null>(null);
  const full = fullView ?? localFull;
  const changeFull = (next: boolean) => {
    if(onFullViewChange) onFullViewChange(next); else setLocalFull(next);
    requestAnimationFrame(() =>
      next
        ? root.current?.focus()
        : root.current
            ?.querySelector<HTMLElement>(
              '[aria-label="Open collaboration in full view"]',
            )
            ?.focus(),
    );
  };
  const close = () => {
    onOpenChange(false);
    requestAnimationFrame(() => {
      if (opener.current?.isConnected) opener.current.focus();
    });
  };
  const [commentToolbar,setCommentToolbar]=useState<HTMLDivElement|null>(null);
  const active = sections.some((section) => section.key === activeSectionKey)
    ? activeSectionKey!
    : sections[0]?.key;
  const visible = open && (!slot || slot.owner === "collaboration");
  const mode = full ? "content" : pinned && !compact ? "pinned" : "drawer";
  useLayoutEffect(() => {
    if (!host) return;
    // Move the same portal host rather than reparenting React children. Drafts,
    // pending uploads and selection survive; docked content escapes page stacking contexts.
    const destination = mode === "content" ? mount.current : document.body;
    destination?.appendChild(host);
    const shell = document.querySelector(".athyper-shell");
    host.style.setProperty(
      "--shell-topbar",
      shell
        ? getComputedStyle(shell).getPropertyValue("--shell-topbar")
        : "0px",
    );
  }, [host, mode]);
  useEffect(() => {
    const media = window.matchMedia("(max-width:1100px)");
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    const saved = readBrowserPreference(preference);
    if (typeof saved.pinned === "boolean") onPinnedChange?.(saved.pinned);
    if (typeof saved.width === "number" && Number.isFinite(saved.width))
      setWidth(Math.max(360, Math.min(560, saved.width)));
    setReady(true);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (ready) writeBrowserPreference(preference, { pinned, width });
  }, [pinned, width, ready]);
  useEffect(() => {
    if (active && open) {
      preloadSection(active);
      setVisited((current) =>
        current.includes(active) ? current : [...current, active],
      );
    }
  }, [active, open, preloadSection]);
  useEffect(() => {
    const opening = open && !wasOpen.current;
    if (ready) wasOpen.current = open;
    // Responsive changes in a hidden tool must not take the slot from Atlas.
    if (open && ready && (opening || slot?.owner !== "atlas"))
      claim?.({ id: "collaboration", pinned: mode === "pinned", width });
    else if (!open) release?.("collaboration");
  }, [open, ready, mode, width, claim, release]);
  useEffect(() => () => release?.("collaboration"), [release]);
  useEffect(() => {
    const activate = () => {
      opener.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      claim?.({ id: "collaboration", pinned: mode === "pinned", width });
    };
    window.addEventListener("athyper:collaboration-open", activate);
    return () =>
      window.removeEventListener("athyper:collaboration-open", activate);
  }, [claim, mode, width]);
  const scrollPositions=useRef(new Map<string,{page:number;feed:number}>());
  useLayoutEffect(()=>{
    if(!visible || !active)return;
    const key=`${mode==="content"?"content":"side"}:${active}`;
    const body=root.current?.querySelector<HTMLElement>(`#collaboration-section-${active}`);
    const feed=body?.querySelector<HTMLElement>(".a-comment-feed") ?? body;
    const saved=scrollPositions.current.get(key);
    const restore=requestAnimationFrame(()=>{if(saved){window.scrollTo({top:saved.page,behavior:"instant"});if(feed)feed.scrollTop=saved.feed;}});
    const remember=()=>scrollPositions.current.set(key,{page:window.scrollY,feed:feed?.scrollTop??0});
    window.addEventListener("scroll",remember,true);
    return()=>{cancelAnimationFrame(restore);window.removeEventListener("scroll",remember,true);};
  },[mode,active,visible]);
  useModalIsolation(root, visible && mode === "drawer", {
    initialFocus: () =>
      root.current?.querySelector<HTMLElement>("button") ?? null,
    outside: () =>
      root.current?.previousElementSibling instanceof HTMLElement &&
      root.current.previousElementSibling.classList.contains(
        "a-collaboration-backdrop",
      )
        ? [root.current.previousElementSibling]
        : [],
  });
  useEffect(() => {
    if (!visible || mode !== "content") return;
    const measure = () =>
      setContentTop(
        Math.max(0, root.current?.getBoundingClientRect().top ?? 0),
      );
    const observer = new ResizeObserver(measure);
    if (root.current) observer.observe(root.current);
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [mode, visible]);
  if (!sections.length || !active) return null;
  const resize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const panelControls = (<div className="a-collaboration-panel__controls">
            {full ? (
              <Tooltip portal label="Open Collaboration in side view"><button
                type="button"
                onClick={() => changeFull(false)}
                aria-label="Open Collaboration in side view"
              >
                <PanelRightIcon size={18} />
                <span>Open Collaboration in side view</span>
              </button></Tooltip>
            ) : (
              <>
                <Tooltip portal side="bottom" label={pinned ? "Unpin Collaboration from the right side" : "Pin Collaboration to the right side"}><button
                  type="button"
                  onClick={() => onPinnedChange?.(!pinned)}
                  aria-label={
                    pinned
                      ? "Unpin collaboration"
                      : "Pin collaboration to right"
                  }
                  aria-pressed={pinned}
                >
                  <PanelRightIcon size={18} />
                </button></Tooltip>
                <Tooltip portal side="bottom" label="Open Collaboration in full view"><button
                  type="button"
                  onClick={() => changeFull(true)}
                  aria-label="Open collaboration in full view"
                >
                  <Maximize2Icon size={18} />
                </button></Tooltip>
              </>
            )}
            <Tooltip portal side={full ? "top" : "bottom"} label={full ? "Close full view and return to side panel" : "Close Collaboration"}><button
              type="button"
              aria-label={
                full
                  ? "Close full view and return to side panel"
                  : "Close collaboration"
              }
              onClick={() => (full ? changeFull(false) : close())}
            >
              <CloseIcon size={18} />
            </button></Tooltip>
          </div>);
  const panel = (
    <>
      {visible && mode === "drawer" ? (
        <button
          className="a-collaboration-backdrop"
          aria-label="Close collaboration"
          onClick={close}
        />
      ) : null}
      <section
        ref={root}
        id="entity-record-collaboration"
        className="a-collaboration-panel"
        data-mode={mode}
        hidden={!visible}
        tabIndex={-1}
        role={mode === "drawer" ? "dialog" : "region"}
        aria-modal={mode === "drawer" ? true : undefined}
        aria-label="Collaboration"
        onKeyDown={(event) => {
          if (
            event.key === "Escape" &&
            !event.defaultPrevented &&
            mode === "drawer"
          ) {
            event.preventDefault();
            close();
          }
        }}
        style={
          {
            "--collaboration-width": `${width}px`,
            "--collaboration-content-top": `${contentTop}px`,
          } as CSSProperties
        }
      >
        {mode !== "content" && !compact ? (
          <div
            className="a-collaboration-panel__resize"
            role="separator"
            tabIndex={0}
            aria-label="Resize collaboration"
            aria-orientation="vertical"
            aria-valuemin={360}
            aria-valuemax={560}
            aria-valuenow={width}
            onPointerDown={resize}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                setWidth(
                  Math.max(
                    360,
                    Math.min(560, window.innerWidth - event.clientX),
                  ),
                );
            }}
            onKeyDown={(event) => {
              if (
                ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              ) {
                event.preventDefault();
                setWidth((current) =>
                  event.key === "Home"
                    ? 360
                    : event.key === "End"
                      ? 560
                      : Math.max(
                          360,
                          Math.min(
                            560,
                            current + (event.key === "ArrowLeft" ? 20 : -20),
                          ),
                        ),
                );
              }
            }}
          />
        ) : null}
        {!full ? <PanelHeader className="a-collaboration-panel__header" icon={active === "attachments" ? <FileTextIcon size={20}/> : <MessageSquareIcon size={20}/>} title="Collaboration" subtitle="Comments and files for this record" actions={panelControls}/> : <header className="a-collaboration-panel__header" hidden={active === "comments" && Boolean(commentToolbar)}>{active === "comments" && commentToolbar ? createPortal(panelControls,commentToolbar) : panelControls}</header>}
        {recordEditing ? <p className="a-collaboration-save-note">Comments and files save separately from record changes.</p> : null}
        <PanelTabs hidden={full && Boolean(onFullViewChange)} className="a-collaboration-panel__tabs" label="Collaboration sections" value={active} onValueChange={onActiveSectionChange} items={sections.map(section=>({key:section.key,label:section.key==="attachments"?"Files":section.key==="comments"?"Comments":section.label,id:`collaboration-tab-${section.key}`,panelId:`collaboration-section-${section.key}`}))}/>
        {sections
          .filter((section) => visited.includes(section.key))
          .map((section) => (
            <div
              key={section.key}
              id={`collaboration-section-${section.key}`}
              className="a-collaboration-panel__body"
              role={full && onFullViewChange ? "region" : "tabpanel"}
              aria-label={full && onFullViewChange ? section.label : undefined}
              aria-labelledby={full && onFullViewChange ? undefined : `collaboration-tab-${section.key}`}
              hidden={active !== section.key}
            >
              <CollaborationVisibilityContext.Provider
                value={visible && active === section.key}
              >
                <CollaborationPresentationContext.Provider value={mode}><CollaborationToolbarContext.Provider value={setCommentToolbar}>{renderSection(section.key)}</CollaborationToolbarContext.Provider></CollaborationPresentationContext.Provider>
              </CollaborationVisibilityContext.Provider>
            </div>
          ))}
      </section>
    </>
  );
  return (
    <>
      <div
        ref={mount}
        className="a-collaboration-mount"
        data-mode={visible ? mode : "closed"}
      />
      {host ? createPortal(panel, host) : null}
    </>
  );
}
