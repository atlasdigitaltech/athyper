"use client";

import { getBrowserQueryClient } from "@athyper/platform-query";
import { ActionButton, ActionLink, PresentationCard } from "@athyper/platform-ui";
import * as React from "react";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { classifyAppError, createRedactedBoundaryEvent, safeLocalReturnTo, safeLoginLocation, type AppErrorModel, type RedactedBoundaryEvent } from "./error-taxonomy";

export interface AppErrorBoundaryProps {
  readonly error: unknown;
  readonly reset?: () => void;
  readonly applicationName?: string;
  readonly requiredActions?: readonly string[];
  readonly autoNavigate?: boolean;
  readonly onClearPrincipal?: () => void | Promise<void>;
  readonly onTelemetry?: (event: RedactedBoundaryEvent) => void;
  readonly onCompare?: () => void;
  /** Use `content` when the boundary is rendered inside an authenticated application shell. */
  readonly surface?: "page" | "content";
  readonly homeHref?: string;
  readonly homeLabel?: string;
}

export function AppErrorBoundary(props: AppErrorBoundaryProps) {
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  const model = useMemo(() => classifyAppError({ error: props.error, online, requiredActions: props.requiredActions }), [props.error, online, props.requiredActions]);
  useEffect(() => {
    if (model.kind === "unexpected") (props.onTelemetry ?? reportRedactedBoundaryEvent)(createRedactedBoundaryEvent(props.error, model));
  }, [model, props.error, props.onTelemetry]);
  useEffect(() => {
    if (props.autoNavigate === false || (model.kind !== "authentication" && model.kind !== "context-mismatch")) return;
    let cancelled = false;
    void Promise.resolve(props.onClearPrincipal?.() ?? clearLocalPrincipalState()).finally(() => {
      if (cancelled) return;
      const returnTo = safeLocalReturnTo(`${window.location.pathname}${window.location.search}`);
      window.location.replace(model.kind === "authentication" ? safeLoginLocation(returnTo) : `/select-context?returnTo=${encodeURIComponent(returnTo)}`);
    });
    return () => { cancelled = true; };
  }, [model.kind, props.autoNavigate, props.onClearPrincipal]);
  return <ErrorSurface model={model} reset={props.reset} applicationName={props.applicationName} onCompare={props.onCompare} surface={props.surface} homeHref={props.homeHref} homeLabel={props.homeLabel} />;
}

export function GlobalAppErrorBoundary(props: AppErrorBoundaryProps) {
  return <html lang="en"><body><AppErrorBoundary {...props} /></body></html>;
}

export function ErrorSurface({ model, reset, applicationName = "Athyper", onCompare, surface = "page", homeHref, homeLabel = "Return to workspace", tone, icon }: { readonly model: AppErrorModel; readonly reset?: () => void; readonly applicationName?: string; readonly onCompare?: () => void; readonly surface?: "page" | "content"; readonly homeHref?: string; readonly homeLabel?: string; readonly tone?: "danger" | "warning" | "muted"; readonly icon?: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [model.kind]);
  const presentation = KIND_PRESENTATION[model.kind];
  const effectiveTone = tone ?? presentation.tone;
  const effectiveIcon = icon ?? presentation.icon;
  const content = <>
    <PresentationCard className="a-error-surface__card" aria-labelledby="app-error-title" aria-describedby="app-error-description">
      <div role="alert" aria-live="assertive" aria-atomic="true" className="a-visually-hidden">An error needs your attention.</div>
      <div aria-hidden="true" className="a-error-surface__mark" data-tone={effectiveTone}>{effectiveIcon}</div>
      <p className="a-eyebrow">{applicationName}</p>
      <h1 id="app-error-title" ref={heading} tabIndex={-1} className="a-error-surface__title">{model.title}</h1>
      <p id="app-error-description" className="a-error-surface__description">{model.description}</p>
      {model.kind === "required-action" ? <IdentityActionList actions={model.requiredActions} /> : null}
      {model.requestId ? <p className="a-error-surface__request">Request ID: <code>{model.requestId}</code></p> : null}
      <div className="a-error-surface__actions">{actions(model, reset, onCompare)}{homeHref ? <ActionLink variant={model.action === "none" ? "primary" : "secondary"} href={homeHref}>{homeLabel}</ActionLink> : null}</div>
    </PresentationCard>
  </>;
  return surface === "content"
    ? <section className="a-error-surface a-error-surface--content" data-error-kind={model.kind} data-tone={effectiveTone}>{content}</section>
    : <main className="a-error-surface" data-error-kind={model.kind} data-tone={effectiveTone}>{content}</main>;
}

function actions(model: AppErrorModel, reset?: () => void, onCompare?: () => void): ReactNode {
  if (model.action === "none" || model.action === "correct-fields") return null;
  if (model.action === "login") return <ActionLink variant="primary" href={safeLoginLocation("/")}>Sign in</ActionLink>;
  if (model.action === "select-context") return <ActionLink variant="primary" href="/select-context">Choose context</ActionLink>;
  if (model.action === "complete-action") return <ActionLink variant="primary" href="/auth/required-action">Continue identity check</ActionLink>;
  return <><ActionButton variant="primary" onClick={() => reset?.()} disabled={!reset}>{model.action === "reload-compare" ? "Reload latest" : "Try again"}</ActionButton>{model.action === "reload-compare" && onCompare ? <ActionButton variant="secondary" onClick={onCompare}>Compare changes</ActionButton> : null}</>;
}

function IdentityActionList({ actions }: { readonly actions: readonly string[] }) { return actions.length ? <div className="a-error-surface__notice"><p><strong>Required actions</strong></p><ul>{actions.map((action) => <li key={action}>{humanize(action)}</li>)}</ul></div> : null; }
function humanize(value: string): string { return value.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }

function Glyph({ children }: { readonly children: ReactNode }) {
  return <svg viewBox="0 0 24 24" width="1.5rem" height="1.5rem" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
}
function NotFoundIcon() { return <Glyph><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5" /><path d="M9.5 13.4a1.5 1.5 0 1 1 2.1 1.37c-.63.27-1.1.85-1.1 1.53" /><path d="M10.5 18.5h.01" /></Glyph>; }
function LockIcon() { return <Glyph><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Glyph>; }
function ShieldIcon() { return <Glyph><path d="M12 3 4 6.5V11c0 5 3.4 8.4 8 9.6 4.6-1.2 8-4.6 8-9.6V6.5L12 3Z" /></Glyph>; }
function ShieldAlertIcon() { return <Glyph><path d="M12 3 4 6.5V11c0 5 3.4 8.4 8 9.6 4.6-1.2 8-4.6 8-9.6V6.5L12 3Z" /><path d="M12 8v4M12 16h.01" /></Glyph>; }
function MergeIcon() { return <Glyph><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M6 8.5V14a5 5 0 0 0 5 5h1" /></Glyph>; }
function AlertCircleIcon() { return <Glyph><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></Glyph>; }
function ClockIcon() { return <Glyph><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></Glyph>; }
function WifiOffIcon() { return <Glyph><path d="M2 8.5a15 15 0 0 1 4.2-2.6M10.7 5a16 16 0 0 1 11.3 3.5M5 12.5a10 10 0 0 1 3.5-2M9.5 16a5 5 0 0 1 5 0" /><path d="M2 2l20 20" /><path d="M12 20h.01" /></Glyph>; }
function ServerOffIcon() { return <Glyph><rect x="2" y="3" width="20" height="8" rx="2" /><rect x="2" y="13" width="20" height="8" rx="2" /><path d="M6 7h.01M6 17h.01" /></Glyph>; }
function AlertTriangleIcon() { return <Glyph><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 9v4M12 17h.01" /></Glyph>; }

const KIND_PRESENTATION: Readonly<Record<AppErrorModel["kind"], { readonly tone: "danger" | "warning" | "muted"; readonly icon: ReactNode }>> = Object.freeze({
  authentication: { tone: "muted", icon: <LockIcon /> },
  "required-action": { tone: "muted", icon: <ShieldIcon /> },
  "permission-denied": { tone: "muted", icon: <ShieldAlertIcon /> },
  "context-mismatch": { tone: "muted", icon: <LockIcon /> },
  "not-found": { tone: "muted", icon: <NotFoundIcon /> },
  conflict: { tone: "warning", icon: <MergeIcon /> },
  validation: { tone: "warning", icon: <AlertCircleIcon /> },
  "rate-limit": { tone: "warning", icon: <ClockIcon /> },
  "service-unavailable": { tone: "danger", icon: <ServerOffIcon /> },
  network: { tone: "warning", icon: <WifiOffIcon /> },
  offline: { tone: "warning", icon: <WifiOffIcon /> },
  unexpected: { tone: "danger", icon: <AlertTriangleIcon /> },
});

export function NotFoundBoundary({ applicationName = "Athyper", surface = "page", homeHref, homeLabel }: { readonly applicationName?: string; readonly surface?: "page" | "content"; readonly homeHref?: string; readonly homeLabel?: string }) { return <ErrorSurface applicationName={applicationName} surface={surface} homeHref={homeHref} homeLabel={homeLabel} tone="muted" icon={<NotFoundIcon />} model={Object.freeze({ kind: "unexpected", title: "Page not found", description: "We could not find this page in your current workspace. Check the address, or return to a page available from the navigation.", action: "none", canRetry: false, preserveInput: false, requiredActions: [] })} />; }

export function EmptyStateBoundary({ title = "Nothing here yet", description = "There is no content to show.", action }: { readonly title?: string; readonly description?: string; readonly action?: ReactNode }) { return <section className="a-empty-state" aria-labelledby="empty-state-title"><h2 id="empty-state-title">{title}</h2><p>{description}</p>{action}</section>; }

export function AppLoadingBoundary({ kind = "bootstrap", label, collapsed = false, applicationName = "Athyper", planeDescriptor = "Business workspace", planeIconSrc, planeWordmarkSrc, persistentDesktopBrand = false }: { readonly kind?: "bootstrap" | "public" | "refresh"; readonly label?: string; readonly collapsed?: boolean; readonly applicationName?: string; readonly planeDescriptor?: string; readonly planeIconSrc?: string; readonly planeWordmarkSrc?: string; readonly persistentDesktopBrand?: boolean }) {
  const status = label ?? (kind === "public" ? "Loading sign in" : kind === "refresh" ? "Updating content" : "Loading application");
  if (kind === "refresh") return <section className="a-app-loader a-app-loader--content" aria-busy="true" aria-labelledby="content-loading-title">
    <h1 id="content-loading-title" className="a-visually-hidden">{status}</h1>
    <div className="a-app-loader__eyebrow" aria-hidden="true" />
    <div className="a-app-loader__title" aria-hidden="true" />
    <div className="a-app-loader__summary" aria-hidden="true" />
    <div className="a-app-loader__grid" aria-hidden="true"><span /><span /><span /></div>
    <span role="status" aria-live="polite" className="a-visually-hidden">{status}</span>
  </section>;
  if (kind === "public") return <main className="a-app-loader a-app-loader--public" aria-busy="true" aria-labelledby="loading-title">
    <section className="a-app-loader__public-card"><h1 id="loading-title" className="a-visually-hidden">{status}</h1><div className="a-app-loader__eyebrow" /><div className="a-app-loader__title" /><div className="a-app-loader__field" /><div className="a-app-loader__field" /><span role="status" aria-live="polite" className="a-visually-hidden">{status}</span></section>
  </main>;
  return <main className="a-app-loader a-app-loader--bootstrap" data-collapsed={collapsed} data-desktop-brand={persistentDesktopBrand} aria-busy="true" aria-labelledby="loading-title">
    <h1 id="loading-title" className="a-visually-hidden">{status}</h1>
    {persistentDesktopBrand ? <div className="a-app-loader__desktop-brand" aria-hidden="true"><span className="a-app-loader__desktop-menu"><i /><i /><i /></span><span className="a-app-loader__brand-primary">{planeWordmarkSrc ? <img className="a-app-loader__brand-wordmark" src={planeWordmarkSrc} alt="" /> : <b>{applicationName}</b>}</span></div> : null}
    <aside className="a-app-loader__rail" aria-hidden="true">{persistentDesktopBrand ? null : <div className="a-app-loader__rail-brand"><span className="a-app-loader__brand-primary">{collapsed ? (planeIconSrc ? <img className="a-app-loader__brand-icon" src={planeIconSrc} alt="" /> : <b>{applicationName.slice(0,1)}</b>) : (planeWordmarkSrc ? <img className="a-app-loader__brand-wordmark" src={planeWordmarkSrc} alt="" /> : <b>{applicationName}</b>)}</span><small><span>{planeDescriptor}</span><b>{collapsed ? "›" : "‹"}</b></small></div>}<div className="a-app-loader__rail-nav"><span /><span /><span />{persistentDesktopBrand ? <><span /><span /><span /><span /><span /></> : null}</div>{persistentDesktopBrand ? <div className="a-app-loader__rail-footer"><div><span /><span /></div><span className="a-app-loader__rail-profile" /></div> : null}</aside>
    <section className="a-app-loader__shell" aria-hidden="true"><header><span className="a-app-loader__header-context" /><div className="a-app-loader__header-actions"><span /><span /><span /><span /></div></header><div className="a-app-loader__crumb"><span /></div><div className="a-app-loader__canvas"><div className="a-app-loader__eyebrow" /><div className="a-app-loader__title" /><div className="a-app-loader__summary" /><div className="a-app-loader__grid"><span /><span /><span /></div>{persistentDesktopBrand ? <><div className="a-app-loader__secondary-grid"><section><i /><i /><i /><i /></section><section><i /><i /><i /></section></div><section className="a-app-loader__activity"><i /><i /><i /><i /></section></> : null}</div></section>
    <span role="status" aria-live="polite" className="a-visually-hidden">{status}</span>
  </main>;
}

export async function clearLocalPrincipalState(): Promise<void> { const client = getBrowserQueryClient(); await client.cancelQueries(); client.clear(); }
export function reportRedactedBoundaryEvent(event: RedactedBoundaryEvent): void { console.error("[app-boundary]", event); }
