"use client";
import { viewportQuery } from "@athyper/platform-theme/tokens";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { CloseIcon, PinIcon, PinOffIcon } from "@athyper/platform-icons";
import {
  readBrowserStorage,
  useModalIsolation,
  writeBrowserStorage,
  type PanelHeaderCapabilities,
} from "@athyper/platform-ui";
import { useWorkspaceSidePanel } from "./workspace-side-panel";

export const TOOL_PANEL_MIN_WIDTH = 360;
export const TOOL_PANEL_MAX_WIDTH = 560;
/** From this viewport the shell can reserve room for a pinned panel beside wide
 * content (`extraWide`). Pages that offer a side mode use the same rule. */
export const TOOL_PANEL_PIN_QUERY = viewportQuery({ from: "extraWide" });

/** pinned: beside the page; drawer: modal overlay; content: inside the page (full view). */
export type WorkspaceToolPanelMode = "pinned" | "drawer" | "content";

export interface WorkspaceToolPanelLabels {
  readonly region: string;
  readonly close: string;
  readonly pin: string;
  readonly unpin: string;
  readonly resize: string;
}

/** Docked workspace tool frame shared by list controls, record collaboration
 * (Comments, Files, Activity) and Atlas: right edge under the app bar,
 * pinnable where the shell can make room, resizable, full width on phones.
 * It owns geometry, the shell slot, modality, focus return and preferences;
 * the owner renders the panel anatomy and places the header capabilities
 * (pin, close) in its `PanelHeader`.
 *
 * Owners whose content must survive closing (drafts, uploads, scroll) pass
 * `persistent`; owners with a full view pass `presentation="content"` and the
 * page element to render into. The same host node moves between the page and
 * the dock, so React never remounts the content. */
export function WorkspaceToolPanel({
  id,
  open,
  onOpenChange,
  labels,
  className,
  children,
  presentation = "docked",
  contentTarget,
  persistent = false,
  pinned: controlledPinned,
  onPinnedChange,
  canPin = true,
  preferenceKey,
  revealEvent,
  fallbackFocus,
  hostClassName,
  backdropClassName,
  panelRef,
  panelProps,
  interactionRoots,
}: {
  readonly id: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly labels: WorkspaceToolPanelLabels;
  readonly className?: string;
  readonly children: (frame: {
    readonly mode: WorkspaceToolPanelMode;
    readonly visible: boolean;
    readonly capabilities: PanelHeaderCapabilities;
  }) => ReactNode;
  /** "content" renders inside `contentTarget` (the page) instead of docking. */
  readonly presentation?: "docked" | "content";
  readonly contentTarget?: HTMLElement | null;
  /** Keep the content mounted, hidden, while closed or while another tool holds the slot. */
  readonly persistent?: boolean;
  /** Owner-controlled pin preference; otherwise the panel remembers it. */
  readonly pinned?: boolean;
  readonly onPinnedChange?: (pinned: boolean) => void;
  readonly canPin?: boolean;
  /** Browser preference key for width (and pin when uncontrolled). */
  readonly preferenceKey?: string;
  /** Window event that brings an already-open panel back to the front. */
  readonly revealEvent?: string;
  /** Focus target when the element that opened the panel is gone. */
  readonly fallbackFocus?: () => HTMLElement | null | undefined;
  readonly hostClassName?: string;
  readonly backdropClassName?: string;
  /** Elements outside the panel that stay usable while it is a modal overlay
   * (for example the app bar buttons that switch it). */
  readonly interactionRoots?: () => readonly HTMLElement[];
  readonly panelRef?:
    MutableRefObject<HTMLElement | null> | ((node: HTMLElement | null) => void);
  readonly panelProps?: Omit<
    HTMLAttributes<HTMLElement>,
    | "role"
    | "className"
    | "children"
    | "tabIndex"
    | "aria-label"
    | "aria-modal"
    | "hidden"
  > &
    Partial<Record<`data-${string}`, string | boolean | undefined>>;
}) {
  const preference = preferenceKey ?? `athyper.tool-panel.${id}`;
  const slot = useWorkspaceSidePanel();
  const claim = slot?.claim,
    release = slot?.release;
  const [host, setHost] = useState<HTMLElement>();
  const [ready, setReady] = useState(false);
  const [pinnable, setPinnable] = useState(false);
  const [pinnedPreference, setPinnedPreference] = useState(false);
  const [width, setWidth] = useState(TOOL_PANEL_MAX_WIDTH);
  const root = useRef<HTMLElement | null>(null),
    backdrop = useRef<HTMLButtonElement>(null),
    opener = useRef<HTMLElement | null>(null),
    wasOpen = useRef(false);
  const pinned = controlledPinned ?? pinnedPreference;
  // Full view stays "content" even before the page target mounts, so it never
  // flashes as a modal overlay; the host attaches once the target exists.
  const mode: WorkspaceToolPanelMode =
    presentation === "content"
      ? "content"
      : pinnable && pinned
        ? "pinned"
        : "drawer";
  const visible = open && (!slot || slot.owner === id);
  const docked = mode !== "content";

  useEffect(() => {
    const node = document.createElement("div");
    node.className = `a-tool-panel-host${hostClassName ? ` ${hostClassName}` : ""}`;
    setHost(node);
    return () => node.remove();
  }, [hostClassName]);

  // Move the same host rather than reparenting React children: drafts, uploads
  // and selection survive, and the docked panel escapes page stacking contexts.
  useLayoutEffect(() => {
    if (!host) return;
    const document = host.ownerDocument;
    (mode === "content" ? contentTarget : document.body)?.appendChild(host);
    const shell = document.querySelector(".athyper-shell");
    // The portal leaves the shell subtree; carry the app bar offset with it.
    host.style.setProperty(
      "--shell-topbar",
      shell
        ? (document.defaultView
            ?.getComputedStyle(shell)
            .getPropertyValue("--shell-topbar") ?? "0px")
        : "0px",
    );
  }, [host, mode, contentTarget]);

  useLayoutEffect(() => {
    const media =
      typeof window.matchMedia === "function"
        ? window.matchMedia(TOOL_PANEL_PIN_QUERY)
        : undefined;
    const update = () => setPinnable(Boolean(media?.matches));
    update();
    media?.addEventListener("change", update);
    try {
      const saved = JSON.parse(
        readBrowserStorage(preference) ?? "{}",
      ) as Record<string, unknown>;
      if (typeof saved.width === "number" && Number.isFinite(saved.width))
        setWidth(
          Math.max(
            TOOL_PANEL_MIN_WIDTH,
            Math.min(TOOL_PANEL_MAX_WIDTH, saved.width),
          ),
        );
      if (typeof saved.pinned === "boolean") setPinnedPreference(saved.pinned);
    } catch {
      /* A malformed preference falls back to defaults. */
    }
    setReady(true);
    return () => media?.removeEventListener("change", update);
  }, [preference]);

  useEffect(() => {
    if (!ready) return;
    writeBrowserStorage(
      preference,
      JSON.stringify(
        controlledPinned === undefined
          ? { width, pinned: pinnedPreference }
          : { width },
      ),
    );
  }, [preference, ready, width, pinnedPreference, controlledPinned]);

  const rememberOpener = useCallback(() => {
    const focused =
      root.current?.ownerDocument.activeElement ?? document.activeElement;
    // Internal moves (tab switches) must not replace the external return target.
    if (focused instanceof HTMLElement && !root.current?.contains(focused))
      opener.current = focused;
  }, []);

  useEffect(() => {
    const opening = open && !wasOpen.current;
    if (!ready) return;
    wasOpen.current = open;
    if (opening) rememberOpener();
    // Responsive changes in a hidden tool must not take the slot back from Atlas;
    // Atlas itself keeps its pin and width registered.
    if (open && (opening || slot?.owner !== "atlas" || id === "atlas"))
      claim?.({ id, pinned: mode === "pinned", width });
    else if (!open) release?.(id);
  }, [open, ready, mode, width, claim, release, id, rememberOpener]);
  useEffect(() => () => release?.(id), [release, id]);

  useEffect(() => {
    if (!revealEvent) return;
    const reveal = () => {
      rememberOpener();
      claim?.({ id, pinned: mode === "pinned", width });
    };
    window.addEventListener(revealEvent, reveal);
    return () => window.removeEventListener(revealEvent, reveal);
  }, [revealEvent, claim, id, mode, width, rememberOpener]);

  // A control used in an interaction root (for example the app bar button that
  // switches the panel's section) becomes the place focus returns to.
  useEffect(() => {
    if (!visible || !interactionRoots) return;
    const document = root.current?.ownerDocument ?? window.document;
    const track = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && interactionRoots().some((element) => element.contains(target)))
        opener.current = target;
    };
    document.addEventListener("focusin", track);
    return () => document.removeEventListener("focusin", track);
  }, [visible, interactionRoots]);

  // The resizable width is dynamic, so it is written to the element instead of
  // an inline style prop; the stylesheet reads --tool-panel-width.
  useLayoutEffect(() => {
    root.current?.style.setProperty("--tool-panel-width", `${width}px`);
  }, [width, visible, host, mode]);

  useEffect(() => {
    const view = root.current?.ownerDocument.defaultView;
    if (!visible || !ready || !view) return;
    const frame = view.requestAnimationFrame(() => {
      if (!root.current?.contains(view.document.activeElement))
        root.current?.focus({ preventScroll: true });
    });
    return () => view.cancelAnimationFrame(frame);
  }, [visible, ready, host, mode]);

  const close = useCallback(() => {
    onOpenChange(false);
    const target = opener.current;
    const view = (root.current ?? target)?.ownerDocument.defaultView ?? window;
    view.requestAnimationFrame(() => {
      if (target?.isConnected && target !== target.ownerDocument.body)
        target.focus({ preventScroll: true });
      else fallbackFocus?.()?.focus({ preventScroll: true });
    });
  }, [onOpenChange, fallbackFocus]);

  // An overlay covers the page, so it is modal; pinned and full view sit beside or in it.
  // Escape closes the overlay even before focus has moved into it; inner controls
  // (tooltips, open lists) that handle Escape first still win.
  useModalIsolation(
    root,
    Boolean(host) && ready && visible && mode === "drawer",
    {
      initialFocus: () => root.current,
      outside: () => [
      ...(backdrop.current ? [backdrop.current] : []),
      ...(interactionRoots?.() ?? []),
    ],
      restoreFocus: false,
      onEscape: close,
    },
  );

  const setRoot = useCallback(
    (node: HTMLElement | null) => {
      root.current = node;
      if (typeof panelRef === "function") panelRef(node);
      else if (panelRef) panelRef.current = node;
    },
    [panelRef],
  );

  if (!host || (!visible && !persistent)) return null;
  const rtl =
    host.ownerDocument.defaultView?.getComputedStyle(host).direction === "rtl";
  const capabilities: PanelHeaderCapabilities = {
    ...(pinnable && canPin && docked
      ? {
          pin: {
            label: mode === "pinned" ? labels.unpin : labels.pin,
            icon:
              mode === "pinned" ? (
                <PinOffIcon size={18} />
              ) : (
                <PinIcon size={18} />
              ),
            pressed: mode === "pinned",
            onClick: () => {
              const next = mode !== "pinned";
              if (controlledPinned === undefined) setPinnedPreference(next);
              onPinnedChange?.(next);
            },
          },
        }
      : {}),
    close: {
      label: labels.close,
      icon: <CloseIcon size={18} />,
      onClick: close,
    },
  };
  const clamp = (value: number) =>
    Math.max(TOOL_PANEL_MIN_WIDTH, Math.min(TOOL_PANEL_MAX_WIDTH, value));
  return createPortal(
    <>
      {visible && mode === "drawer" ? (
        <button
          ref={backdrop}
          type="button"
          className={`a-tool-panel-backdrop${backdropClassName ? ` ${backdropClassName}` : ""}`}
          aria-label={labels.close}
          tabIndex={-1}
          onClick={close}
        />
      ) : null}
      <section
        {...panelProps}
        ref={setRoot}
        className={`a-tool-panel a-context-panel${className ? ` ${className}` : ""}`}
        data-mode={mode}
        role={mode === "drawer" ? "dialog" : "region"}
        aria-modal={mode === "drawer" ? true : undefined}
        aria-label={labels.region}
        hidden={!visible}
        tabIndex={-1}
        onKeyDown={(event) => {
          panelProps?.onKeyDown?.(event);
          // Full view is part of the page; Escape closes only the docked panel.
          if (event.key === "Escape" && !event.defaultPrevented && docked) {
            event.preventDefault();
            close();
          }
        }}
      >
        {docked ? (
          <div
            className="a-tool-panel__resize"
            role="separator"
            tabIndex={0}
            aria-label={labels.resize}
            aria-orientation="vertical"
            aria-valuemin={TOOL_PANEL_MIN_WIDTH}
            aria-valuemax={TOOL_PANEL_MAX_WIDTH}
            aria-valuenow={width}
            onPointerDown={(event) =>
              event.currentTarget.setPointerCapture(event.pointerId)
            }
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                setWidth(
                  clamp(
                    rtl ? event.clientX : window.innerWidth - event.clientX,
                  ),
                );
            }}
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              setWidth((current) =>
                event.key === "Home"
                  ? TOOL_PANEL_MIN_WIDTH
                  : event.key === "End"
                    ? TOOL_PANEL_MAX_WIDTH
                    : clamp(
                        current +
                          ((event.key === "ArrowLeft") !== rtl ? 20 : -20),
                      ),
              );
            }}
          />
        ) : null}
        {children({ mode, visible, capabilities })}
      </section>
    </>,
    host,
  );
}
