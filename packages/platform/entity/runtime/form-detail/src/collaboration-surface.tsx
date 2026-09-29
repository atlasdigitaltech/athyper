"use client";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";

import { readBrowserPreference, writeBrowserPreference } from "./record/browser-preferences";

import { CollaborationVisibilityContext, CollaborationPresentationContext } from "./collaboration-visibility";
import { RecordPanelActionContext } from "./panel-header-action";
import { type PanelHeaderAction, PanelHeader, PanelTabs, PanelContextRow } from "@athyper/platform-ui";
import {
  PinIcon, PinOffIcon, CloseIcon,
  MessageSquareIcon,
  FileTextIcon,
  HistoryIcon,
  Maximize2Icon,
  PanelRightIcon,


} from "@athyper/platform-icons";
import { useWorkspaceSidePanel } from "@athyper/platform-shell";
import { createPortal } from "react-dom";
import {
  useCallback, useLayoutEffect,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

type CollaborationSection = { readonly key: string; readonly label: string };
const preference = "athyper.collaboration.panel";
const minPanelWidth = 360;
const maxPanelWidth = 560;

/** One persistent tree across dock and page content; never clone a composer. */
export function EntityCollaborationSurface({
  open,
  fullView,
  onFullViewChange,
  recordEditing = false,
  recordContext,
  showFullClose = false,

  activeSectionKey,
  sections,
  onOpenChange,
  onPinnedChange,
  pinned: controlledPinned,
  onActiveSectionChange,
  preloadSection,
  renderSection,
}: {
  readonly open: boolean;
  readonly fullView?: boolean;
  readonly onFullViewChange?: (full:boolean)=>void;
  readonly recordEditing?: boolean;
  readonly recordContext?: { readonly label: ReactNode; readonly detail?: ReactNode };
  readonly showFullClose?: boolean;
  readonly pinned?: boolean;
  readonly activeSectionKey?: string;
  readonly sections: readonly CollaborationSection[];
  readonly onOpenChange: (open: boolean) => void;
  readonly onPinnedChange?: (pinned: boolean) => void;
  readonly onActiveSectionChange: (sectionKey: string) => void;
  readonly preloadSection: (sectionKey: string) => void;
  readonly renderSection: (sectionKey: string) => ReactNode;
}) {
  const intl = useEntityI18n();
  const [localPinned, setLocalPinned] = useState(true);
  const pinned = controlledPinned ?? localPinned;
  const [newActions, setNewActions] = useState<Record<string, PanelHeaderAction | undefined>>({});
  const registerNew = useCallback((section: string, action?: PanelHeaderAction) => {
    setNewActions(current => ({...current, [section]: action}));
  }, []);
  const changePinned = () => { setLocalPinned(!pinned); onPinnedChange?.(!pinned); };
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
  const [localFull, setLocalFull] = useState(true),
    [compact, setCompact] = useState(false),
    [width, setWidth] = useState(maxPanelWidth);
  const [contentTop, setContentTop] = useState(0),
    [ready, setReady] = useState(false),
    [visited, setVisited] = useState<readonly string[]>([]);
  const root = useRef<HTMLElement>(null),
    opener = useRef<HTMLElement | null>(null);
  const full = compact || (fullView ?? localFull);
  const changeFull = (next: boolean) => {
    if(onFullViewChange) onFullViewChange(next); else setLocalFull(next);
    requestAnimationFrame(() => root.current?.focus({preventScroll:true}));
  };
  useEffect(() => {
    if (compact && open && (!slot || slot.owner === "collaboration") && fullView === false) onFullViewChange?.(true);
  }, [compact, open, fullView, onFullViewChange, slot?.owner]);
  const close = () => {
    if (fullView === undefined) setLocalFull(true);
    onOpenChange(false);
    requestAnimationFrame(() => {
      if (opener.current?.isConnected && opener.current !== document.body) {
        opener.current.focus({ preventScroll: true });
      } else {
        // Direct links have no opener: return to the record's navigation, not body.
        document.querySelector<HTMLElement>(".a-metadata-detail__navigation [role=tab][tabindex='0'], .a-entity-record__tabs button[aria-current='page'], .a-metadata-detail__navigation button")?.focus({ preventScroll: true });
      }
    });
  };
  const active = sections.some((section) => section.key === activeSectionKey)
    ? activeSectionKey!
    : sections[0]?.key;
  const visible = open && (!slot || slot.owner === "collaboration");
  const mode: "content" | "pinned" | "drawer" = full ? "content" : pinned ? "pinned" : "drawer";
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
  // Restore width independently from the owner-controlled pin preference.
  useLayoutEffect(() => {
    const media = window.matchMedia("(max-width:1100px)");
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    const saved = readBrowserPreference(preference);

    if (typeof saved.width === "number" && Number.isFinite(saved.width))
      setWidth(Math.max(minPanelWidth, Math.min(maxPanelWidth, saved.width)));
    setReady(true);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (ready) writeBrowserPreference(preference, { width });
  }, [width, ready]);
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
      const focused = document.activeElement;
      // Internal tab switches must not replace the external return target.
      if (focused instanceof HTMLElement && !root.current?.contains(focused))
        opener.current = focused;
      claim?.({ id: "collaboration", pinned: mode === "pinned", width });
    };
    window.addEventListener("athyper:collaboration-open", activate);
    return () =>
      window.removeEventListener("athyper:collaboration-open", activate);
  }, [claim, mode, width]);
  // Preserve the reading offset across page and dock layouts without remounting content.
  const scrollPositions=useRef(new Map<string,number>());
  useLayoutEffect(()=>{
    if(!visible || !active)return;
    const key=active;
    const body=root.current?.querySelector<HTMLElement>(`#collaboration-section-${active}`);
    const getFeed=()=>body?.querySelector<HTMLElement>(".a-comment-feed, .a-entity-activity__content, .a-files-scroll-area") ?? body;
    const saved=scrollPositions.current.get(key);
    const restore=requestAnimationFrame(()=>{
      const feed=getFeed();if(!feed)return;
      if(mode==="content") {
        const top=saved ? feed.getBoundingClientRect().top+window.scrollY+saved : 0;
        window.scrollTo({top,behavior:"instant"});
      } else if(saved!==undefined) feed.scrollTop=saved;
    });
    const remember=(event: Event)=>{
      const feed=getFeed();if(!feed)return;
      if(mode==="content") scrollPositions.current.set(key,Math.max(0,-feed.getBoundingClientRect().top));
      else if(event.target===feed) scrollPositions.current.set(key,feed.scrollTop);
    };
    if(mode==="content") window.addEventListener("scroll",remember);
    else body?.addEventListener("scroll",remember,true);
    return()=>{cancelAnimationFrame(restore);window.removeEventListener("scroll",remember);body?.removeEventListener("scroll",remember,true);};
  },[mode,active,visible,host,visited]);
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
  }, [mode, visible, active]);
  if (!sections.length || !active) return null;
  const resize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const toolbarFirst = full && Boolean(recordContext) && (active === "comments" || active === "attachments" || active === "activity");
  const headerCapabilities = {
    new: newActions[active],
    ...(!full && !compact ? {pin: {label:intl.message(pinned ? "collaboration.unpin" : "collaboration.pin"),
      icon:pinned ? <PinOffIcon size={18}/> : <PinIcon size={18}/>, pressed:pinned, onClick:changePinned}} : {}),
    ...(!compact ? {fullView:{label:intl.message(full ? "collaboration.openSide" : "collaboration.fullLabel"),
      tooltip:intl.message(full ? "collaboration.openSide" : "collaboration.openFull"),
      icon:full ? <PanelRightIcon size={18}/> : <Maximize2Icon size={18}/>, onClick:()=>changeFull(!full)}} : {}),
    close:{label:intl.message("collaboration.closeLabel"), tooltip:intl.message("collaboration.close"), icon:<CloseIcon size={18}/>, onClick:close},
  };
  const panel = (
    <>
      {visible && mode === "drawer" ? <button className="a-collaboration-backdrop" type="button" aria-label={intl.message("collaboration.close")} onClick={close}/> : null}
      <section
        ref={root}
        id="entity-record-collaboration"
        className="a-collaboration-panel a-context-panel"
        data-mode={mode}
        data-section={active}
        data-toolbar-first={toolbarFirst || undefined}
        hidden={!visible}
        tabIndex={-1}
        role="region"
        aria-label={intl.message(active === "activity" ? "activity.historyTitle" : "collaboration.title")}
        onKeyDown={(event) => {
          if (
            event.key === "Escape" &&
            !event.defaultPrevented &&
            mode !== "content"
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
            aria-label={intl.message("collaboration.resizeLabel")}
            aria-orientation="vertical"
            aria-valuemin={minPanelWidth}
            aria-valuemax={maxPanelWidth}
            aria-valuenow={width}
            onPointerDown={resize}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                setWidth(
                  Math.max(
                    minPanelWidth,
                    Math.min(maxPanelWidth, intl.localization.direction === "rtl" ? event.clientX : window.innerWidth - event.clientX),
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
                    ? minPanelWidth
                    : event.key === "End"
                      ? maxPanelWidth
                      : Math.max(
                          minPanelWidth,
                          Math.min(
                            maxPanelWidth,
                            current + ((event.key === "ArrowLeft") !== (intl.localization.direction === "rtl") ? 20 : -20),
                          ),
                        ),
                );
              }
            }}
          />
        ) : null}
        {!toolbarFirst ? <PanelHeader className="a-collaboration-panel__header" icon={active === "activity" ? <HistoryIcon size={20}/> : active === "attachments" ? <FileTextIcon size={20}/> : <MessageSquareIcon size={20}/>} title={active === "activity" ? intl.message("activity.historyTitle") : active === "attachments" ? intl.message("collaboration.files") : active === "comments" ? intl.message("collaboration.comments") : sections.find(section => section.key === active)?.label ?? intl.message("collaboration.title")} capabilities={headerCapabilities}/> : null}
        {recordContext && !toolbarFirst ? <PanelContextRow scope={{kind:"record", ...recordContext}} /> : null}

        {recordEditing ? <p className="a-collaboration-save-note">{intl.message("collaboration.separateSave")}</p> : null}
        <PanelTabs hidden={Boolean(recordContext) || active === "activity" || (full && Boolean(onFullViewChange))} className="a-collaboration-panel__tabs" label={intl.message("collaboration.sections")} value={active} onValueChange={onActiveSectionChange} items={sections.map(section=>({key:section.key,label:section.key==="attachments"?intl.message("collaboration.files"):section.key==="comments"?intl.message("collaboration.comments"):section.label,id:`collaboration-tab-${section.key}`,panelId:`collaboration-section-${section.key}`}))}/>
        {sections
          .filter((section) => visited.includes(section.key))
          .map((section) => (
            <div
              key={section.key}
              id={`collaboration-section-${section.key}`}
              className="a-collaboration-panel__body"
              role={recordContext || section.key === "activity" || (full && onFullViewChange) ? "region" : "tabpanel"}
              aria-label={recordContext || section.key === "activity" || (full && onFullViewChange) ? section.label : undefined}
              aria-labelledby={recordContext || section.key === "activity" || (full && onFullViewChange) ? undefined : `collaboration-tab-${section.key}`}
              hidden={active !== section.key}
            >
              <CollaborationVisibilityContext.Provider
                value={visible && active === section.key}
              >
                <CollaborationPresentationContext.Provider value={mode}><RecordPanelActionContext.Provider value={{section:section.key,recordLabel:typeof recordContext?.label === "string" ? recordContext.label : undefined,register:registerNew,toolbarFirst:toolbarFirst && section.key === active,capabilities:headerCapabilities}}>{renderSection(section.key)}</RecordPanelActionContext.Provider></CollaborationPresentationContext.Provider>
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
