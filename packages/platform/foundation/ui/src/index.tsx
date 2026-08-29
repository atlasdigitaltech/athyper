"use client";

import * as React from "react";
import { CloseIcon } from "@athyper/platform-icons";
import { createPortal } from "react-dom";
import {
  Children, cloneElement, createContext, forwardRef, isValidElement, useCallback, useContext, useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type LabelHTMLAttributes,
  type ReactElement, type ReactNode, type SelectHTMLAttributes,
} from "react";

export function cx(...values: Array<string | false | null | undefined>): string { return values.filter(Boolean).join(" "); }

function useControllableState<T>(value: T | undefined, initial: T, onChange?: (value: T) => void): [T, (value: T) => void] {
  const [local, setLocal] = useState(initial);
  const controlled = value !== undefined;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const update = useCallback((next: T) => { if (!controlled) setLocal(next); onChangeRef.current?.(next); }, [controlled]);
  return [controlled ? value : local, update];
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { readonly variant?: "primary" | "contrast" | "secondary" | "danger" | "ghost"; readonly size?: "small" | "medium" | "large" | "icon"; readonly loading?: boolean; }
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant = "primary", size = "medium", loading = false, disabled, type = "button", children, ...props }, ref) => <button ref={ref} type={type} className={cx("a-button", `a-button--${variant}`, `a-button--${size}`, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>{loading ? <span className="a-spinner" aria-hidden="true" /> : null}{children}</button>);
Button.displayName = "Button";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> { readonly error?: boolean; }
export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, error, ...props }, ref) => <input ref={ref} className={cx("a-input", className)} aria-invalid={error || undefined} {...props} />);
Input.displayName = "Input";

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(({ className, ...props }, ref) => <label ref={ref} className={cx("a-label", className)} {...props} />);
Label.displayName = "Label";

export const Checkbox = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, "type">>(({ className, ...props }, ref) => <input ref={ref} type="checkbox" className={cx("a-checkbox", className)} {...props} />);
Checkbox.displayName = "Checkbox";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => <select ref={ref} className={cx("a-select", className)} {...props}>{children}</select>);
Select.displayName = "Select";

type TabsContextValue = { value: string; setValue: (value: string) => void; baseId: string };
const TabsContext = createContext<TabsContextValue | null>(null);
export function Tabs({ value, defaultValue = "", onValueChange, children, className }: { readonly value?: string; readonly defaultValue?: string; readonly onValueChange?: (value: string) => void; readonly children: ReactNode; readonly className?: string }) {
  const [selected, setSelected] = useControllableState(value, defaultValue, onValueChange);
  return <TabsContext.Provider value={{ value: selected, setValue: setSelected, baseId: useId() }}><div className={className}>{children}</div></TabsContext.Provider>;
}
export function TabsList({ className, onKeyDown, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div role="tablist" className={cx("a-tabs-list", className)} onKeyDown={(event) => { onKeyDown?.(event); if (event.defaultPrevented || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; const tabs = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]:not([disabled])')]; const active = tabs.indexOf(document.activeElement as HTMLElement); const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (active + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length; event.preventDefault(); tabs[next]?.focus(); tabs[next]?.click(); }} {...props} />;
}
export function TabsTrigger({ value, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { readonly value: string }) {
  const context = useContext(TabsContext); if (!context) throw new Error("TabsTrigger must be inside Tabs"); const selected = context.value === value;
  return <button type="button" role="tab" id={`${context.baseId}-tab-${value}`} aria-controls={`${context.baseId}-panel-${value}`} aria-selected={selected} tabIndex={selected ? 0 : -1} className={cx("a-tabs-trigger", className)} onClick={(event) => { props.onClick?.(event); if (!event.defaultPrevented) context.setValue(value); }} {...props} />;
}
export function TabsContent({ value, mount = "persistent", className, ...props }: HTMLAttributes<HTMLDivElement> & { readonly value: string; readonly mount?: "persistent" | "lazy" }) {
  const context = useContext(TabsContext); if (!context) throw new Error("TabsContent must be inside Tabs"); const selected = context.value === value;
  if (!selected && mount === "lazy") return null;
  return <div role="tabpanel" id={`${context.baseId}-panel-${value}`} aria-labelledby={`${context.baseId}-tab-${value}`} hidden={!selected} tabIndex={0} className={cx("a-tabs-content", className)} {...props} />;
}

export function Tooltip({ label, children }: { readonly label: string; readonly children: ReactElement }) {
  const id = useId(); const child = Children.only(children);
  const describedBy = isValidElement<{ "aria-describedby"?: string }>(child) ? child.props["aria-describedby"] : undefined;
  return <span className="a-tooltip">{cloneElement(child as ReactElement<Record<string, unknown>>, { "aria-describedby": [describedBy, id].filter(Boolean).join(" ") })}<span id={id} role="tooltip" className="a-tooltip__content">{label}</span></span>;
}

type OpenContext = { open: boolean; setOpen: (value: boolean) => void };
type MenuContextValue = OpenContext & { root: React.RefObject<HTMLDivElement | null>; content: React.RefObject<HTMLDivElement | null> };
const MenuContext = createContext<MenuContextValue | null>(null);
export const overlayOpenedEvent = "athyper:overlay-opened";
export function announceOverlayOpened(owner: Element): void {
  const EventConstructor = owner.ownerDocument.defaultView?.CustomEvent;
  if (EventConstructor) owner.ownerDocument.dispatchEvent(new EventConstructor(overlayOpenedEvent, { detail: owner }));
}
export function Menu({ open, defaultOpen = false, onOpenChange, children }: { readonly open?: boolean; readonly defaultOpen?: boolean; readonly onOpenChange?: (open: boolean) => void; readonly children: ReactNode }) {
  const [shown, setShown] = useControllableState(open, defaultOpen, onOpenChange);
  const root = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!shown) return;
    if (root.current) announceOverlayOpened(root.current);
    const dismissOutside = (event: Event) => {
      if (event.target && !root.current?.contains(event.target as Node) && !content.current?.contains(event.target as Node)) setShown(false);
    };
    const dismissForAnotherOverlay = (event: Event) => {
      if ((event as CustomEvent<Element>).detail !== root.current) setShown(false);
    };
    document.addEventListener("pointerdown", dismissOutside, true);
    document.addEventListener("click", dismissOutside, true);
    document.addEventListener("focusin", dismissOutside, true);
    document.addEventListener(overlayOpenedEvent, dismissForAnotherOverlay);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside, true);
      document.removeEventListener("click", dismissOutside, true);
      document.removeEventListener("focusin", dismissOutside, true);
      document.removeEventListener(overlayOpenedEvent, dismissForAnotherOverlay);
    };
  }, [shown, setShown]);
  return <MenuContext.Provider value={{ open: shown, setOpen: setShown, root, content }}><div ref={root} className="a-menu" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setShown(false); (event.currentTarget.querySelector('[aria-haspopup="menu"]') as HTMLElement | null)?.focus(); } }}>{children}</div></MenuContext.Provider>;
}
export function MenuTrigger({ className, onClick, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) { const c = useContext(MenuContext); if (!c) throw new Error("MenuTrigger must be inside Menu"); return <button type="button" aria-haspopup="menu" aria-expanded={c.open} className={cx("a-button", "a-button--ghost", className)} {...props} onClick={(event) => { onClick?.(event); if (!event.defaultPrevented) c.setOpen(!c.open); }} />; }
export function MenuContent({ className, portal = false, style, ...props }: HTMLAttributes<HTMLDivElement> & { readonly portal?: boolean }) {
  const c = useContext(MenuContext);
  const [position, setPosition] = useState<{ readonly left: number; readonly top: number }>();
  if (!c) throw new Error("MenuContent must be inside Menu");
  useEffect(() => {
    if (!c.open || !portal) { setPosition(undefined); return; }
    const update = () => {
      const trigger = c.root.current?.querySelector<HTMLElement>('[aria-haspopup="menu"]'), menu = c.content.current;
      if (!trigger || !menu) return;
      const anchor = trigger.getBoundingClientRect(), bounds = menu.getBoundingClientRect(), margin = 8, gap = 4;
      const left = Math.min(Math.max(margin, anchor.right - bounds.width), window.innerWidth - bounds.width - margin);
      const below = anchor.bottom + gap, top = below + bounds.height <= window.innerHeight - margin ? below : Math.max(margin, anchor.top - bounds.height - gap);
      setPosition({ left, top });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [c, c.open, portal]);
  if (!c.open) return null;
  const content = <div ref={c.content} role="menu" className={cx("a-menu__content", portal && "a-menu__content--portal", className)} style={portal ? { ...style, left: position?.left, top: position?.top, visibility: position ? "visible" : "hidden" } : style} {...props} />;
  return portal && typeof document !== "undefined" ? createPortal(content, document.body) : content;
}
export function MenuItem({ className, onClick, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) { const c = useContext(MenuContext); return <button type="button" role="menuitem" tabIndex={-1} className={cx("a-menu__item", className)} {...props} onClick={(event) => { onClick?.(event); if (!event.defaultPrevented) c?.setOpen(false); }} />; }

const DialogContext = createContext<OpenContext | null>(null);
export function Dialog({ open, defaultOpen = false, onOpenChange, children }: { readonly open?: boolean; readonly defaultOpen?: boolean; readonly onOpenChange?: (open: boolean) => void; readonly children: ReactNode }) { const [shown, setShown] = useControllableState(open, defaultOpen, onOpenChange); return <DialogContext.Provider value={{ open: shown, setOpen: setShown }}>{children}</DialogContext.Provider>; }
export function DialogTrigger(props: ButtonHTMLAttributes<HTMLButtonElement>) { const c = useContext(DialogContext); if (!c) throw new Error("DialogTrigger must be inside Dialog"); return <button type="button" aria-haspopup="dialog" aria-expanded={c.open} onClick={(e) => { props.onClick?.(e); if (!e.defaultPrevented) c.setOpen(true); }} {...props} />; }
export function DialogClose(props: ButtonHTMLAttributes<HTMLButtonElement>) { const c = useContext(DialogContext); if (!c) throw new Error("DialogClose must be inside Dialog"); return <button type="button" onClick={(e) => { props.onClick?.(e); if (!e.defaultPrevented) c.setOpen(false); }} {...props} />; }
export function DialogContent({ title, description, children, className }: { readonly title: string; readonly description?: string; readonly children: ReactNode; readonly className?: string }) {
  return <ModalContent title={title} description={description} className={className} variant="dialog">{children}</ModalContent>;
}
export function DrawerContent({ title, description, children, className }: { readonly title: string; readonly description?: string; readonly children: ReactNode; readonly className?: string }) {
  return <ModalContent title={title} description={description} className={className} variant="drawer">{children}</ModalContent>;
}

export type DrawerSize = "compact" | "standard" | "wide" | "full";
export type DrawerVariant = "task" | "activity" | "navigation" | "detail";
export type DrawerMobilePresentation = "bottom-sheet" | "fullscreen";
type DrawerAnatomyContextValue = { readonly titleId: string; readonly descriptionId: string; readonly closeButton: React.RefObject<HTMLButtonElement | null> };
const DrawerAnatomyContext = createContext<DrawerAnatomyContextValue | null>(null);

export const DrawerRoot = Dialog;
export const DrawerTrigger = DialogTrigger;
export const DrawerClose = DialogClose;

export function DrawerPanel({ size = "standard", variant = "task", mobilePresentation = "fullscreen", className, children, id, ...props }: HTMLAttributes<HTMLDivElement> & { readonly size?: DrawerSize; readonly variant?: DrawerVariant; readonly mobilePresentation?: DrawerMobilePresentation }) {
  const dialog = useContext(DialogContext); if (!dialog) throw new Error("DrawerPanel must be inside DrawerRoot");
  const titleId = useId(), descriptionId = useId(), panel = useRef<HTMLDivElement>(null), closeButton = useRef<HTMLButtonElement>(null), restore = useRef<HTMLElement | null>(null), [portalReady, setPortalReady] = useState(false);
  useEffect(() => setPortalReady(true), []);
  useEffect(() => {
    if (!dialog.open || !portalReady) return;
    restore.current = document.activeElement as HTMLElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (closeButton.current ?? firstFocusable(panel.current))?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); dialog.setOpen(false); return; }
      if (event.key !== "Tab" || !panel.current) return;
      const items = focusableElements(panel.current), first = items[0], last = items.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("keydown", key); document.body.style.overflow = previousOverflow; restore.current?.focus(); };
  }, [dialog.open, dialog.setOpen, portalReady]);
  if (!dialog.open || !portalReady) return null;
  const context = { titleId, descriptionId, closeButton };
  return createPortal(<div className="a-drawer-layer" data-variant={variant} data-mobile-presentation={mobilePresentation}>
    <button type="button" className="a-dialog-scrim" aria-label="Close panel" onClick={() => dialog.setOpen(false)}/>
    <DrawerAnatomyContext.Provider value={context}><div {...props} ref={panel} id={id} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} className={cx("a-drawer", "a-drawer--framework", className)} data-size={size} data-variant={variant} data-mobile-presentation={mobilePresentation}>{children}</div></DrawerAnatomyContext.Provider>
  </div>, document.body);
}

export function DrawerHeader({ icon, title, description, actions, closeLabel = "Close panel", className, ...props }: Omit<HTMLAttributes<HTMLElement>, "title"> & { readonly icon?: ReactNode; readonly title: ReactNode; readonly description?: ReactNode; readonly actions?: ReactNode; readonly closeLabel?: string }) {
  const drawer = useContext(DrawerAnatomyContext); if (!drawer) throw new Error("DrawerHeader must be inside DrawerPanel");
  const dialog = useDrawerDialog();
  return <header {...props} className={cx("a-drawer__header", className)}>{icon ? <span className="a-drawer__header-icon" aria-hidden="true">{icon}</span> : null}<span className="a-drawer__heading"><h2 id={drawer.titleId}>{title}</h2>{description ? <p id={drawer.descriptionId}>{description}</p> : <span id={drawer.descriptionId} className="a-visually-hidden">{typeof title === "string" ? `${title} panel` : "Drawer panel"}</span>}</span>{actions ? <span className="a-drawer__header-actions">{actions}</span> : null}<button ref={drawer.closeButton} type="button" className="a-drawer__close" aria-label={closeLabel} onClick={() => dialog.setOpen(false)}><CloseIcon/></button></header>;
}

function useDrawerDialog(): OpenContext { const dialog = useContext(DialogContext); if (!dialog) throw new Error("Drawer component must be inside DrawerRoot"); return dialog; }
export function DrawerNavigation({ className, ...props }: HTMLAttributes<HTMLElement>) { return <nav {...props} className={cx("a-drawer__navigation", className)}/>; }
export function DrawerToolbar({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div {...props} className={cx("a-drawer__toolbar", className)}/>; }
export function DrawerContext({ className, ...props }: HTMLAttributes<HTMLDListElement>) { return <dl {...props} className={cx("a-drawer__context", className)}/>; }
export function DrawerMetric({ label, value, detail, className, ...props }: Omit<HTMLAttributes<HTMLDivElement>, "children"> & { readonly label: ReactNode; readonly value: ReactNode; readonly detail?: ReactNode }) { return <div {...props} className={cx("a-drawer__metric", className)}><dt>{label}</dt><dd>{value}</dd>{detail ? <small>{detail}</small> : null}</div>; }
export function DrawerBody({ scrollable = true, className, ...props }: HTMLAttributes<HTMLDivElement> & { readonly scrollable?: boolean }) { return <div {...props} className={cx("a-drawer__body", className)} data-scrollable={scrollable || undefined}/>; }
export function DrawerFooter({ className, ...props }: HTMLAttributes<HTMLElement>) { return <footer {...props} className={cx("a-drawer__footer", className)}/>; }
export function DrawerFooterSummary({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div {...props} className={cx("a-drawer__footer-summary", className)}/>; }
export function DrawerFooterActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div {...props} className={cx("a-drawer__footer-actions", className)}/>; }
export function DrawerTabs(props: Parameters<typeof Tabs>[0]) { return <Tabs {...props} className={cx("a-drawer__tabs", props.className)}/>; }
export function DrawerTabList(props: Parameters<typeof TabsList>[0]) { return <TabsList {...props} className={cx("a-drawer__tab-list", props.className)}/>; }
export function DrawerTab(props: Parameters<typeof TabsTrigger>[0]) { return <TabsTrigger {...props} className={cx("a-drawer__tab", props.className)}/>; }
export function DrawerTabPanel(props: Parameters<typeof TabsContent>[0]) { return <TabsContent {...props} className={cx("a-drawer__tab-panel", props.className)}/>; }

export const Drawer = Object.freeze({ Root: DrawerRoot, Trigger: DrawerTrigger, Close: DrawerClose, Panel: DrawerPanel, Header: DrawerHeader, Navigation: DrawerNavigation, Toolbar: DrawerToolbar, Context: DrawerContext, Metric: DrawerMetric, Body: DrawerBody, Footer: DrawerFooter, FooterSummary: DrawerFooterSummary, FooterActions: DrawerFooterActions, Tabs: DrawerTabs, TabList: DrawerTabList, Tab: DrawerTab, TabPanel: DrawerTabPanel });

function focusableElements(owner: HTMLElement): HTMLElement[] { return [...owner.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]; }
function firstFocusable(owner: HTMLElement | null): HTMLElement | null { return owner ? focusableElements(owner)[0] ?? null : null; }
function ModalContent({ title, description, children, className, variant }: { readonly title: string; readonly description?: string; readonly children: ReactNode; readonly className?: string; readonly variant: "dialog" | "drawer" }) {
  const c = useContext(DialogContext); if (!c) throw new Error("DialogContent must be inside Dialog"); const titleId = useId(); const descriptionId = useId(); const panel = useRef<HTMLDivElement>(null); const restore = useRef<HTMLElement | null>(null); const [portalReady, setPortalReady] = useState(false);
  useEffect(() => setPortalReady(true), []);
  useEffect(() => { if (!c.open || (variant === "drawer" && !portalReady)) return; restore.current = document.activeElement as HTMLElement; const previousOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; const first = panel.current?.querySelector<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'); first?.focus(); const key = (event: KeyboardEvent) => { if (event.key === "Escape") c.setOpen(false); if (event.key === "Tab" && panel.current) { const items = [...panel.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])')]; if (!items.length) return; const firstItem = items[0]; const lastItem = items[items.length - 1]; if (event.shiftKey && document.activeElement === firstItem) { event.preventDefault(); lastItem?.focus(); } else if (!event.shiftKey && document.activeElement === lastItem) { event.preventDefault(); firstItem?.focus(); } } }; document.addEventListener("keydown", key); return () => { document.removeEventListener("keydown", key); document.body.style.overflow = previousOverflow; restore.current?.focus(); }; }, [c.open, c.setOpen, portalReady, variant]);
  if (!c.open) return null;
  const drawer = variant === "drawer";
  if (drawer && !portalReady) return null;
  const layer = <div className={drawer ? "a-drawer-layer" : "a-dialog-layer"}><button type="button" className="a-dialog-scrim" aria-label={`Close ${drawer ? "panel" : "dialog"}`} onClick={() => c.setOpen(false)} /><div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} className={cx(drawer ? "a-drawer" : "a-dialog", className)}>{drawer ? <button type="button" className="a-drawer__close" aria-label="Close panel" onClick={() => c.setOpen(false)}><CloseIcon/></button> : null}<h2 id={titleId} className="a-dialog__title">{title}</h2>{description ? <p id={descriptionId} className="a-dialog__description">{description}</p> : null}{children}</div></div>;
  return drawer ? createPortal(layer, document.body) : layer;
}

export function ToastRegion(props: HTMLAttributes<HTMLDivElement>) { return <div role="region" aria-label="Notifications" aria-live="polite" className={cx("a-toast-region", props.className)} {...props} />; }
export function Toast({ tone = "info", title, children, className, ...props }: HTMLAttributes<HTMLDivElement> & { readonly tone?: "info" | "success" | "warning" | "danger"; readonly title: string }) { return <div role={tone === "danger" ? "alert" : "status"} className={cx("a-toast", `a-toast--${tone}`, className)} {...props}><strong>{title}</strong>{children ? <div>{children}</div> : null}</div>; }
export function Card(props: HTMLAttributes<HTMLDivElement>) { return <div {...props} className={cx("a-card", props.className)} />; }
export function Badge({ tone = "neutral", ...props }: HTMLAttributes<HTMLSpanElement> & { readonly tone?: "neutral" | "success" | "warning" | "danger" }) { return <span {...props} className={cx("a-badge", `a-badge--${tone}`, props.className)} />; }
export function Separator({ orientation = "horizontal", ...props }: HTMLAttributes<HTMLDivElement> & { readonly orientation?: "horizontal" | "vertical" }) { return <div role="separator" aria-orientation={orientation} {...props} className={cx("a-separator", `a-separator--${orientation}`, props.className)} />; }
export function Skeleton({ label = "Loading", ...props }: HTMLAttributes<HTMLDivElement> & { readonly label?: string }) { return <div aria-busy="true" aria-label={label} {...props} className={cx("a-skeleton", props.className)} />; }
export function VisuallyHidden(props: HTMLAttributes<HTMLSpanElement>) { return <span {...props} className={cx("a-visually-hidden", props.className)} />; }
export function FocusGuard({ onFocus }: { readonly onFocus?: () => void }) { return <span tabIndex={0} aria-hidden="true" className="a-focus-guard" onFocus={onFocus} />; }
export * from "./presentation";
