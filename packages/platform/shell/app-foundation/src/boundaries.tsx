"use client";

import { getBrowserQueryClient } from "@athyper/platform-query";
import * as React from "react";
import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
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
  return <html lang="en"><body style={{ margin: 0 }}><AppErrorBoundary {...props} /></body></html>;
}

export function ErrorSurface({ model, reset, applicationName = "Athyper", onCompare }: { readonly model: AppErrorModel; readonly reset?: () => void; readonly applicationName?: string; readonly onCompare?: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [model.kind]);
  return <main style={styles.page} data-error-kind={model.kind}>
    <section style={styles.card} aria-labelledby="app-error-title" aria-describedby="app-error-description">
      <div role="alert" aria-live="assertive" aria-atomic="true" style={styles.announcement}>An error needs your attention.</div>
      <div aria-hidden="true" style={styles.mark}>!</div>
      <p style={styles.eyebrow}>{applicationName}</p>
      <h1 id="app-error-title" ref={heading} tabIndex={-1} style={styles.title}>{model.title}</h1>
      <p id="app-error-description" style={styles.description}>{model.description}</p>
      {model.kind === "required-action" ? <IdentityActionList actions={model.requiredActions} /> : null}
      {model.requestId ? <p style={styles.requestId}>Request ID: <code>{model.requestId}</code></p> : null}
      <div style={styles.actions}>{actions(model, reset, onCompare)}</div>
    </section>
  </main>;
}

function actions(model: AppErrorModel, reset?: () => void, onCompare?: () => void): ReactNode {
  if (model.action === "none" || model.action === "correct-fields") return null;
  if (model.action === "login") return <a style={styles.primary} href={safeLoginLocation("/")}>Sign in</a>;
  if (model.action === "select-context") return <a style={styles.primary} href="/select-context">Choose context</a>;
  if (model.action === "complete-action") return <a style={styles.primary} href="/auth/required-action">Continue identity check</a>;
  return <><button type="button" style={styles.primary} onClick={() => reset?.()} disabled={!reset}>{model.action === "reload-compare" ? "Reload latest" : "Try again"}</button>{model.action === "reload-compare" && onCompare ? <button type="button" style={styles.secondary} onClick={onCompare}>Compare changes</button> : null}</>;
}

function IdentityActionList({ actions }: { readonly actions: readonly string[] }) { return actions.length ? <div style={styles.notice}><p style={styles.noticeTitle}>Required actions</p><ul>{actions.map((action) => <li key={action}>{humanize(action)}</li>)}</ul></div> : null; }
function humanize(value: string): string { return value.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }

export function NotFoundBoundary({ applicationName = "Athyper" }: { readonly applicationName?: string }) { return <ErrorSurface applicationName={applicationName} model={Object.freeze({ kind: "unexpected", title: "Page not found", description: "The page may have moved or you may not have access to it.", action: "none", canRetry: false, preserveInput: false, requiredActions: [] })} />; }

export function EmptyStateBoundary({ title = "Nothing here yet", description = "There is no content to show.", action }: { readonly title?: string; readonly description?: string; readonly action?: ReactNode }) { return <section style={styles.empty} aria-labelledby="empty-state-title"><h2 id="empty-state-title" style={styles.emptyTitle}>{title}</h2><p style={styles.description}>{description}</p>{action}</section>; }

export function AppLoadingBoundary({ kind = "bootstrap", label }: { readonly kind?: "bootstrap" | "public" | "refresh"; readonly label?: string }) {
  if (kind === "refresh") return <div role="status" aria-live="polite" aria-atomic="true" style={styles.refresh}><span style={styles.refreshMark} aria-hidden="true" />{label ?? "Updating content"}</div>;
  return <main style={styles.loadingPage} aria-busy="true" aria-labelledby="loading-title"><section style={kind === "public" ? styles.publicSkeleton : styles.shellSkeleton}><h1 id="loading-title" style={styles.srOnly}>{label ?? (kind === "public" ? "Loading sign in" : "Loading application")}</h1><div style={styles.skeletonLine} /><div style={styles.skeletonTitle} /><div style={styles.skeletonBlock} /><span role="status" aria-live="polite" style={styles.srOnly}>{label ?? "Loading"}</span></section></main>;
}

export async function clearLocalPrincipalState(): Promise<void> { const client = getBrowserQueryClient(); await client.cancelQueries(); client.clear(); }
export function reportRedactedBoundaryEvent(event: RedactedBoundaryEvent): void { console.error("[app-boundary]", event); }

const baseFont = "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const styles = {
  page: { minHeight: "100vh", display: "grid", placeItems: "center", padding: "24px", boxSizing: "border-box", color: "#18212f", background: "#f5f7fa", fontFamily: baseFont } satisfies CSSProperties,
  card: { width: "min(100%, 560px)", padding: "32px", boxSizing: "border-box", border: "1px solid #d7dee8", borderRadius: "16px", background: "#fff", boxShadow: "0 12px 36px rgba(20,35,55,.08)" } satisfies CSSProperties,
  announcement: { position: "absolute", width: "1px", height: "1px", padding: 0, margin: "-1px", overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 } satisfies CSSProperties,
  mark: { width: "44px", height: "44px", display: "grid", placeItems: "center", borderRadius: "50%", color: "#8b1d26", background: "#fdecee", fontWeight: 800, fontSize: "24px" } satisfies CSSProperties,
  eyebrow: { margin: "20px 0 6px", color: "#536176", fontSize: "13px", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" } satisfies CSSProperties,
  title: { margin: 0, fontSize: "clamp(28px,5vw,40px)", lineHeight: 1.15, outline: "none" } satisfies CSSProperties,
  description: { margin: "12px 0 0", color: "#536176", fontSize: "16px", lineHeight: 1.6 } satisfies CSSProperties,
  requestId: { margin: "20px 0 0", color: "#536176", fontSize: "13px" } satisfies CSSProperties,
  actions: { display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "24px" } satisfies CSSProperties,
  primary: { minHeight: "44px", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 18px", border: "1px solid #175cd3", borderRadius: "8px", color: "#fff", background: "#175cd3", font: `600 15px ${baseFont}`, textDecoration: "none", cursor: "pointer" } satisfies CSSProperties,
  secondary: { minHeight: "44px", padding: "0 18px", border: "1px solid #9aa7b8", borderRadius: "8px", color: "#18212f", background: "#fff", font: `600 15px ${baseFont}`, cursor: "pointer" } satisfies CSSProperties,
  notice: { marginTop: "20px", padding: "12px 16px", borderRadius: "8px", background: "#fff8e8", color: "#634400" } satisfies CSSProperties,
  noticeTitle: { margin: 0, fontWeight: 700 } satisfies CSSProperties,
  empty: { minHeight: "240px", display: "grid", alignContent: "center", justifyItems: "center", padding: "24px", textAlign: "center", fontFamily: baseFont } satisfies CSSProperties,
  emptyTitle: { margin: 0, fontSize: "24px" } satisfies CSSProperties,
  loadingPage: { minHeight: "100vh", padding: "24px", boxSizing: "border-box", background: "#f5f7fa", fontFamily: baseFont } satisfies CSSProperties,
  shellSkeleton: { minHeight: "520px", maxWidth: "1120px", margin: "0 auto", padding: "28px", boxSizing: "border-box", borderRadius: "16px", background: "#fff" } satisfies CSSProperties,
  publicSkeleton: { minHeight: "420px", maxWidth: "480px", margin: "8vh auto 0", padding: "32px", boxSizing: "border-box", borderRadius: "16px", background: "#fff" } satisfies CSSProperties,
  skeletonLine: { width: "96px", height: "14px", borderRadius: "7px", background: "#e4e9f0" } satisfies CSSProperties,
  skeletonTitle: { width: "min(70%, 360px)", height: "34px", marginTop: "24px", borderRadius: "8px", background: "#dce3ec" } satisfies CSSProperties,
  skeletonBlock: { width: "100%", height: "240px", marginTop: "32px", borderRadius: "12px", background: "#edf1f5" } satisfies CSSProperties,
  refresh: { minHeight: "44px", display: "inline-flex", alignItems: "center", gap: "10px", color: "#536176", fontFamily: baseFont } satisfies CSSProperties,
  refreshMark: { width: "10px", height: "10px", borderRadius: "50%", background: "#175cd3" } satisfies CSSProperties,
  srOnly: { position: "absolute", width: "1px", height: "1px", padding: 0, margin: "-1px", overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 } satisfies CSSProperties,
};
