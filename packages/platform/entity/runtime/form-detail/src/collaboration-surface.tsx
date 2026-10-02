"use client";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";

import { CollaborationVisibilityContext, CollaborationPresentationContext } from "./collaboration-visibility";
import { RecordPanelActionContext } from "./panel-header-action";
import { type PanelHeaderAction, PanelHeader, PanelTabs, PanelContextRow } from "@athyper/platform-ui";
import {
  MessageSquareIcon,
  FileTextIcon,
  HistoryIcon,
  Maximize2Icon,
  PanelRightIcon,
} from "@athyper/platform-icons";
import { WorkspaceToolPanel, useWorkspaceSidePanel } from "@athyper/platform-shell/tool-panel";
import {
  useCallback, useLayoutEffect,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type CollaborationSection = { readonly key: string; readonly label: string };
/** Kept from the earlier collaboration frame so saved widths carry over. */
const preference = "athyper.collaboration.panel";
/** Below this the shell cannot dock a panel beside the record: show it in the page. */
const COMPACT_MEDIA = "(max-width:1100px)";

/** One persistent tree across dock and page content; never clone a composer.
 * The frame (slot, geometry, modality, pin, resize, focus return) is the shared
 * WorkspaceToolPanel; this owns the sections, their reading state and full view. */
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
  void showFullClose;
  const intl = useEntityI18n();
  const [localPinned, setLocalPinned] = useState(true);
  const pinned = controlledPinned ?? localPinned;
  const [newActions, setNewActions] = useState<Record<string, PanelHeaderAction | undefined>>({});
  const registerNew = useCallback((section: string, action?: PanelHeaderAction) => {
    setNewActions(current => ({...current, [section]: action}));
  }, []);
  const slot = useWorkspaceSidePanel();
  const [mount, setMount] = useState<HTMLDivElement | null>(null);
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const [localFull, setLocalFull] = useState(true),
    [compact, setCompact] = useState(false);
  const [contentTop, setContentTop] = useState(0),
    [visited, setVisited] = useState<readonly string[]>([]);
  const full = compact || (fullView ?? localFull);
  const changeFull = (next: boolean) => {
    if(onFullViewChange) onFullViewChange(next); else setLocalFull(next);
    requestAnimationFrame(() => panel?.focus({preventScroll:true}));
  };
  useEffect(() => {
    if (compact && open && (!slot || slot.owner === "collaboration") && fullView === false) onFullViewChange?.(true);
  }, [compact, open, fullView, onFullViewChange, slot?.owner]);
  const openChange = (next: boolean) => {
    if (!next && fullView === undefined) setLocalFull(true);
    onOpenChange(next);
  };
  const active = sections.some((section) => section.key === activeSectionKey)
    ? activeSectionKey!
    : sections[0]?.key;
  const visible = open && (!slot || slot.owner === "collaboration");
  // Mirrors the frame's own decision (compact is exactly "the shell cannot pin").
  const mode: "content" | "pinned" | "drawer" = full ? "content" : pinned ? "pinned" : "drawer";
  useLayoutEffect(() => {
    const media = window.matchMedia(COMPACT_MEDIA);
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (active && open) {
      preloadSection(active);
      setVisited((current) =>
        current.includes(active) ? current : [...current, active],
      );
    }
  }, [active, open, preloadSection]);
  // Preserve the reading offset across page and dock layouts without remounting content.
  const scrollPositions=useRef(new Map<string,number>());
  useLayoutEffect(()=>{
    if(!visible || !active || !panel)return;
    const key=active;
    const body=panel.querySelector<HTMLElement>(`#collaboration-section-${active}`);
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
  },[mode,active,visible,panel,mount,visited]);
  useEffect(() => {
    if (!visible || mode !== "content" || !panel) return;
    const measure = () =>
      setContentTop(Math.max(0, panel.getBoundingClientRect().top));
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [mode, visible, active, panel]);
  // Dynamic offset for the full-view composer, written to the element.
  useLayoutEffect(() => {
    panel?.style.setProperty("--collaboration-content-top", `${contentTop}px`);
  }, [panel, contentTop]);
  if (!sections.length || !active) return null;
  const toolbarFirst = full && Boolean(recordContext) && (active === "comments" || active === "attachments" || active === "activity");
  return (
    <>
      <div
        ref={setMount}
        className="a-collaboration-mount"
        data-mode={visible ? mode : "closed"}
      />
      <WorkspaceToolPanel
        id="collaboration"
        open={open}
        onOpenChange={openChange}
        labels={{
          region: intl.message(active === "activity" ? "activity.historyTitle" : "collaboration.title"),
          close: intl.message("collaboration.closeLabel"),
          pin: intl.message("collaboration.pin"),
          unpin: intl.message("collaboration.unpin"),
          resize: intl.message("collaboration.resizeLabel"),
        }}
        className="a-collaboration-panel"
        presentation={full ? "content" : "docked"}
        contentTarget={mount}
        persistent
        pinned={pinned}
        onPinnedChange={(next) => { setLocalPinned(next); onPinnedChange?.(next); }}
        preferenceKey={preference}
        revealEvent="athyper:collaboration-open"
        // Direct links have no opener: return to the record's navigation, not body.
        fallbackFocus={() => document.querySelector<HTMLElement>(".a-metadata-detail__navigation [role=tab][tabindex='0'], .a-entity-record__tabs button[aria-current='page'], .a-metadata-detail__navigation button")}
        hostClassName="a-collaboration-host"
        backdropClassName="a-collaboration-backdrop"
        panelRef={setPanel}
        panelProps={{ id: "entity-record-collaboration", "data-section": active, "data-toolbar-first": toolbarFirst || undefined }}
      >
        {(frame) => {
          const headerCapabilities = {
            new: newActions[active],
            ...(frame.capabilities.pin ? { pin: frame.capabilities.pin } : {}),
            ...(!compact ? {fullView:{label:intl.message(full ? "collaboration.openSide" : "collaboration.fullLabel"),
              tooltip:intl.message(full ? "collaboration.openSide" : "collaboration.openFull"),
              icon:full ? <PanelRightIcon size={18}/> : <Maximize2Icon size={18}/>, onClick:()=>changeFull(!full)}} : {}),
            close:{...frame.capabilities.close!, label:intl.message("collaboration.closeLabel"), tooltip:intl.message("collaboration.close")},
          };
          return (
            <>
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
                      value={frame.visible && active === section.key}
                    >
                      <CollaborationPresentationContext.Provider value={frame.mode}><RecordPanelActionContext.Provider value={{section:section.key,recordLabel:typeof recordContext?.label === "string" ? recordContext.label : undefined,register:registerNew,toolbarFirst:toolbarFirst && section.key === active,capabilities:headerCapabilities}}>{renderSection(section.key)}</RecordPanelActionContext.Provider></CollaborationPresentationContext.Provider>
                    </CollaborationVisibilityContext.Provider>
                  </div>
                ))}
            </>
          );
        }}
      </WorkspaceToolPanel>
    </>
  );
}
