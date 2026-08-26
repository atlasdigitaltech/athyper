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
  return <ErrorSurface model={model} reset={props.reset} applicationName={props.applicationName} onCompare={props.onCompare} />;
}

export function GlobalAppErrorBoundary(props: AppErrorBoundaryProps) {
  return <html lang="en"><body><AppErrorBoundary {...props} /></body></html>;
}

export function ErrorSurface({ model, reset, applicationName = "Athyper", onCompare }: { readonly model: AppErrorModel; readonly reset?: () => void; readonly applicationName?: string; readonly onCompare?: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [model.kind]);
  return <main className="a-error-surface" data-error-kind={model.kind}>
    <PresentationCard className="a-error-surface__card" aria-labelledby="app-error-title" aria-describedby="app-error-description">
      <div role="alert" aria-live="assertive" aria-atomic="true" className="a-visually-hidden">An error needs your attention.</div>
      <div aria-hidden="true" className="a-error-surface__mark">!</div>
      <p className="a-eyebrow">{applicationName}</p>
      <h1 id="app-error-title" ref={heading} tabIndex={-1} className="a-error-surface__title">{model.title}</h1>
      <p id="app-error-description" className="a-error-surface__description">{model.description}</p>
      {model.kind === "required-action" ? <IdentityActionList actions={model.requiredActions} /> : null}
      {model.requestId ? <p className="a-error-surface__request">Request ID: <code>{model.requestId}</code></p> : null}
      <div className="a-error-surface__actions">{actions(model, reset, onCompare)}</div>
    </PresentationCard>
  </main>;
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

export function NotFoundBoundary({ applicationName = "Athyper" }: { readonly applicationName?: string }) { return <ErrorSurface applicationName={applicationName} model={Object.freeze({ kind: "unexpected", title: "Page not found", description: "The page may have moved or you may not have access to it.", action: "none", canRetry: false, preserveInput: false, requiredActions: [] })} />; }

export function EmptyStateBoundary({ title = "Nothing here yet", description = "There is no content to show.", action }: { readonly title?: string; readonly description?: string; readonly action?: ReactNode }) { return <section className="a-empty-state" aria-labelledby="empty-state-title"><h2 id="empty-state-title">{title}</h2><p>{description}</p>{action}</section>; }

export function AppLoadingBoundary({ kind = "bootstrap", label, collapsed = false, applicationName = "Athyper", planeDescriptor = "Business workspace", planeIconSrc, planeWordmarkSrc }: { readonly kind?: "bootstrap" | "public" | "refresh"; readonly label?: string; readonly collapsed?: boolean; readonly applicationName?: string; readonly planeDescriptor?: string; readonly planeIconSrc?: string; readonly planeWordmarkSrc?: string }) {
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
  return <main className="a-app-loader a-app-loader--bootstrap" data-collapsed={collapsed} aria-busy="true" aria-labelledby="loading-title">
    <h1 id="loading-title" className="a-visually-hidden">{status}</h1>
    <aside className="a-app-loader__rail" aria-hidden="true"><div className="a-app-loader__rail-brand"><span className="a-app-loader__brand-primary">{collapsed ? (planeIconSrc ? <img className="a-app-loader__brand-icon" src={planeIconSrc} alt="" /> : <b>{applicationName.slice(0,1)}</b>) : (planeWordmarkSrc ? <img className="a-app-loader__brand-wordmark" src={planeWordmarkSrc} alt="" /> : <b>{applicationName}</b>)}</span><small><span>{planeDescriptor}</span><b>{collapsed ? "›" : "‹"}</b></small></div><div className="a-app-loader__rail-nav"><span /><span /><span /></div></aside>
    <section className="a-app-loader__shell" aria-hidden="true"><header><span /><span /></header><div className="a-app-loader__crumb" /><div className="a-app-loader__canvas"><div className="a-app-loader__eyebrow" /><div className="a-app-loader__title" /><div className="a-app-loader__summary" /><div className="a-app-loader__grid"><span /><span /><span /></div></div></section>
    <span role="status" aria-live="polite" className="a-visually-hidden">{status}</span>
  </main>;
}

export async function clearLocalPrincipalState(): Promise<void> { const client = getBrowserQueryClient(); await client.cancelQueries(); client.clear(); }
export function reportRedactedBoundaryEvent(event: RedactedBoundaryEvent): void { console.error("[app-boundary]", event); }
