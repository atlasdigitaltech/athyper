"use client";

import { readBrowserCsrfToken } from "./browser-csrf";
export { readBrowserCsrfToken } from "./browser-csrf";

import { parseInstant } from "@athyper/platform-temporal";
export * from "./boundaries";
export { ApplicationLoading, ApplicationFatalError, ApplicationError } from "./application-fallbacks";
export * from "./error-taxonomy";
export { FeatureGate, PermissionGate, RouteGuard, classifyServerDenial, runGuardedMutation, useAccessSnapshot, useHasAnyPermission, useHasPermission, useIsFeatureEnabled } from "@athyper/platform-shell-runtime";

import { principalQueryScope, type PrincipalQueryScope, type SanitizedSession, type SessionNextAction } from "@athyper/contract-platform-auth-session";
import { createHttpClient, ApiTransportError, type ExperienceBootstrap, type ExperienceFeature, type ExperienceProfile, type ExperienceWorkspace, type HttpClient } from "@athyper/platform-api-client";
import { getBrowserQueryClient, PlatformQueryProvider, PrincipalQueryLifecycle, type DehydratedState, type QueryClient } from "@athyper/platform-query";
import { AccessProvider, createAccessSnapshot, type AccessDiagnostic } from "@athyper/platform-shell-runtime";
import { validateSurfaceOpen, type SurfaceFrame, type SurfaceKind } from "@athyper/platform-surface-kit";
import { DENSITY_STORAGE_KEY, THEME_STORAGE_KEY, type ColorMode } from "@athyper/platform-theme/tokens";
import { Toast, ToastRegion } from "@athyper/platform-ui";
import * as React from "react";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type AppearancePreference = Partial<Pick<ExperienceProfile, "appearanceMode" | "densityCode">>;
export interface AppearanceProfileHandle { readonly profile: ExperienceProfile; readonly setPreference: (patch: AppearancePreference) => void; }
const AppearanceContext = createContext<AppearanceProfileHandle | undefined>(undefined);
/** Same keys the blocking ThemeScript reads before first paint (see @athyper/platform-theme); keep them in sync to avoid a themed-then-flash-to-light reload. */
function storedColorMode(mode: ExperienceProfile["appearanceMode"]): ColorMode | undefined {
  if (mode === "high_contrast") return "high-contrast";
  if (mode === "light" || mode === "dark") return mode;
  return undefined;
}
function profileColorMode(value: string | null): ExperienceProfile["appearanceMode"] | undefined {
  if (value === "high-contrast") return "high_contrast";
  if (value === "light" || value === "dark") return value;
  return undefined;
}
function readAppearancePreference(): AppearancePreference {
  try {
    const appearanceMode = profileColorMode(localStorage.getItem(THEME_STORAGE_KEY));
    const storedDensity = localStorage.getItem(DENSITY_STORAGE_KEY);
    const densityCode = storedDensity === "comfortable" || storedDensity === "compact" ? storedDensity : undefined;
    return Object.freeze({ ...(appearanceMode ? { appearanceMode } : {}), ...(densityCode ? { densityCode } : {}) });
  } catch { return {}; }
}
function writeAppearancePreference(patch: AppearancePreference): void {
  try {
    if (patch.appearanceMode !== undefined) {
      const mode = storedColorMode(patch.appearanceMode);
      if (mode) localStorage.setItem(THEME_STORAGE_KEY, mode); else localStorage.removeItem(THEME_STORAGE_KEY);
    }
    if (patch.densityCode !== undefined) localStorage.setItem(DENSITY_STORAGE_KEY, patch.densityCode);
  } catch { /* Keep the in-memory choice for this session. */ }
}
const SessionIdentityContext = createContext<Readonly<{ state: SanitizedSession["state"]; scope?: PrincipalQueryScope }> | undefined>(undefined);
type SessionExpiry = Readonly<{ expiresAt?: string; idleExpiresAt?: string; absoluteExpiresAt?: string }>;
const SessionExpiryContext = createContext<SessionExpiry | undefined>(undefined);
const SessionExpiryUpdateContext = createContext<((expiry: SessionExpiry) => void) | undefined>(undefined);
const SessionActionsContext = createContext<readonly SessionNextAction[] | undefined>(undefined);
const ExperienceNavigationContext = createContext<readonly ExperienceWorkspace[] | undefined>(undefined);
const ExperienceRevisionContext = createContext<Readonly<{ state: ExperienceBootstrap["state"]; revision: string }> | undefined>(undefined);
const ApiClientContext = createContext<HttpClient | undefined>(undefined);
const PermissionContext = createContext<ReadonlySet<string> | undefined>(undefined);
const FeatureContext = createContext<Readonly<Record<string, ExperienceFeature>> | undefined>(undefined);
export interface ApplicationNavigation { push(href: string): void; replace(href: string): void; refresh(): void; }
const ApplicationNavigationContext = createContext<ApplicationNavigation | undefined>(undefined);
export function ApplicationNavigationProvider({ navigation, children }: { readonly navigation?: ApplicationNavigation; readonly children: ReactNode }) { return <ApplicationNavigationContext.Provider value={navigation}>{children}</ApplicationNavigationContext.Provider>; }

interface ToastMessage { readonly id: string; readonly title: string; readonly detail?: string; readonly tone: "info" | "success" | "warning" | "danger"; }
const ToastContext = createContext<Readonly<{ messages: readonly ToastMessage[]; push(message: Omit<ToastMessage, "id">): string; dismiss(id: string): void }> | undefined>(undefined);
const SurfaceContext = createContext<Readonly<{ stack: readonly SurfaceFrame[]; open(frame: SurfaceFrame): void; close(id: string): void; closeTop(): void }> | undefined>(undefined);
const ShellContext = createContext<Readonly<{ activeWorkspaceCode?: string; setActiveWorkspace(code?: string): void }> | undefined>(undefined);

export interface AppFoundationProvidersProps {
  readonly session: SanitizedSession;
  readonly bootstrap: ExperienceBootstrap;
  readonly apiClient: HttpClient;
  readonly queryClient: QueryClient;
  readonly dehydratedState?: DehydratedState;
  readonly onAuthenticationFailure?: (error: ApiTransportError) => void;
  readonly onBootstrapRevalidation?: (reason: BootstrapRevalidationReason) => void;
  readonly onAccessDiagnostic?: (event: AccessDiagnostic) => void;
  readonly navigation?: ApplicationNavigation;
  readonly children: ReactNode;
}

/** Browser client setup shared by plane adapters; routing and bootstrap stay app-owned. */
export function BrowserApplicationProviders(props: Omit<AppFoundationProvidersProps, "apiClient" | "queryClient">) {
  const [queryClient] = useState(getBrowserQueryClient);
  const apiClient = useMemo(() => createHttpClient({ csrfToken: readBrowserCsrfToken }), []);
  return <AppFoundationProviders {...props} queryClient={queryClient} apiClient={apiClient} />;
}

/** Provider nesting is security-significant; keep this order aligned with the Phase 6 contract. */
export function AppFoundationProviders(props: AppFoundationProvidersProps) {
  const activeScope = principalQueryScope(props.session);
  if (!activeScope || props.bootstrap.planeKey !== activeScope.plane || props.bootstrap.tenantId !== activeScope.tenantId || props.bootstrap.principalId !== activeScope.principalId) throw new Error("App foundation requires one coherent authenticated session/bootstrap context");
  const lifecycle = useMemo(() => new PrincipalQueryLifecycle(props.queryClient), [props.queryClient]);
  const boundaryKey = `${props.session.plane}:${props.session.tenantId ?? "anonymous"}:${props.session.principalId ?? "anonymous"}:${props.session.authEpoch ?? -1}`;
  const [invalidatedScope, setInvalidatedScope] = useState<string>(), invalidated = invalidatedScope === boundaryKey;
  const bootstrap = invalidated ? { ...props.bootstrap, workspaces: [], permissions: [], features: {} } : props.bootstrap;
  const access = useMemo(() => createAccessSnapshot({ sessionState: props.session.state, contextAvailable: bootstrap.state === "ready" && Boolean(props.session.tenantId), entitledModules: bootstrap.workspaces.flatMap((workspace) => workspace.modules.map((module) => module.code)), permissions: bootstrap.permissions, features: bootstrap.features, onDiagnostic: props.onAccessDiagnostic ?? developmentAccessDiagnostic }), [props.session.state, props.session.tenantId, bootstrap, props.onAccessDiagnostic]);
  const markInvalidated = useCallback(() => setInvalidatedScope(boundaryKey), [boundaryKey]);
  return <AppearanceProvider profile={props.bootstrap.profile}>
    <SessionProvider session={props.session} lifecycle={lifecycle}>
      <ExperienceBootstrapProvider key={`${boundaryKey}:${invalidated}`} bootstrap={bootstrap}>
        <ApiClientProvider client={props.apiClient}>
          <PlatformQueryProvider client={props.queryClient} dehydratedState={props.dehydratedState}>
            <AccessProvider snapshot={access}><PermissionProvider permissions={bootstrap.permissions}>
              <FeatureProvider features={bootstrap.features}>
                <ApplicationNavigationProvider navigation={props.navigation}><ToastProvider><SurfaceStackProvider><ShellStateProvider>
                  <AuthenticationFailureBridge client={props.queryClient} lifecycle={lifecycle} onInvalidated={markInvalidated} onFailure={props.onAuthenticationFailure} />
                  <BootstrapFreshnessBridge session={props.session} onRevalidate={props.onBootstrapRevalidation} />
                  <SessionActivityBridge sessionState={props.session.state} onRevalidate={props.onBootstrapRevalidation} />
                  <SessionTerminationBridge plane={props.session.plane} />
                  <SessionExpiryWarning />
                  {props.children}
                </ShellStateProvider></SurfaceStackProvider></ToastProvider></ApplicationNavigationProvider>
              </FeatureProvider>
            </PermissionProvider></AccessProvider>
          </PlatformQueryProvider>
        </ApiClientProvider>
      </ExperienceBootstrapProvider>
    </SessionProvider>
  </AppearanceProvider>;
}

function AppearanceProvider({ profile, children }: { readonly profile: ExperienceProfile; readonly children: ReactNode }) {
  const [preference, setPreferenceState] = useState<AppearancePreference>(() => (typeof window === "undefined" ? {} : readAppearancePreference()));
  const effectiveProfile = useMemo(() => Object.freeze({ ...profile, ...preference }), [profile, preference]);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const dark = window.matchMedia("(prefers-color-scheme: dark)");
    const contrast = window.matchMedia("(forced-colors: active), (prefers-contrast: more)");
    const apply = () => {
      const mode = resolveProfileColorMode(effectiveProfile.appearanceMode, dark.matches, contrast.matches);
      root.dataset.theme = mode;
      root.dataset.density = effectiveProfile.densityCode;
      root.style.colorScheme = mode === "dark" || mode === "high-contrast" ? "dark" : "light";
    };
    apply();
    if (effectiveProfile.appearanceMode !== "system") return;
    dark.addEventListener("change", apply);
    contrast.addEventListener("change", apply);
    return () => {
      dark.removeEventListener("change", apply);
      contrast.removeEventListener("change", apply);
    };
  }, [effectiveProfile.appearanceMode, effectiveProfile.densityCode]);
  const setPreference = useCallback((patch: AppearancePreference) => {
    writeAppearancePreference(patch);
    setPreferenceState((current) => Object.freeze({ ...current, ...patch }));
  }, []);
  const handle = useMemo(() => Object.freeze({ profile: effectiveProfile, setPreference }), [effectiveProfile, setPreference]);
  return <AppearanceContext.Provider value={handle}>{children}</AppearanceContext.Provider>;
}

export function resolveProfileColorMode(appearanceMode: ExperienceProfile["appearanceMode"], systemDark = false, systemHighContrast = false): "light" | "dark" | "high-contrast" {
  if (appearanceMode === "high_contrast" || (appearanceMode === "system" && systemHighContrast)) return "high-contrast";
  if (appearanceMode === "dark" || (appearanceMode === "system" && systemDark)) return "dark";
  return "light";
}
function SessionProvider({ session, lifecycle, children }: { readonly session: SanitizedSession; readonly lifecycle: PrincipalQueryLifecycle; readonly children: ReactNode }) {
  const scope = principalQueryScope(session);
  const identity = useMemo(() => Object.freeze({ state: session.state, ...(scope ? { scope } : {}) }), [session.state, scope?.plane, scope?.tenantId, scope?.principalId, scope?.authEpoch]);
  const serverExpiry = useMemo(() => sessionExpiry(session), [session.expiresAt, session.idleExpiresAt, session.absoluteExpiresAt]);
  const [touchedExpiry, setTouchedExpiry] = useState<SessionExpiry>();
  const expiry = touchedExpiry ?? serverExpiry;
  const actions = session.allowedNextActions ?? [];
  useEffect(() => setTouchedExpiry(undefined), [serverExpiry]);
  useLayoutEffect(() => { void lifecycle.replace(scope); }, [lifecycle, scope?.plane, scope?.tenantId, scope?.principalId, scope?.authEpoch]);
  return <SessionIdentityContext.Provider value={identity}><SessionExpiryContext.Provider value={expiry}><SessionExpiryUpdateContext.Provider value={setTouchedExpiry}><SessionActionsContext.Provider value={actions}>{children}</SessionActionsContext.Provider></SessionExpiryUpdateContext.Provider></SessionExpiryContext.Provider></SessionIdentityContext.Provider>;
}
function ExperienceBootstrapProvider({ bootstrap, children }: { readonly bootstrap: ExperienceBootstrap; readonly children: ReactNode }) { const revision = useMemo(() => Object.freeze({ state: bootstrap.state, revision: bootstrap.revision }), [bootstrap.state, bootstrap.revision]); return <ExperienceRevisionContext.Provider value={revision}><ExperienceNavigationContext.Provider value={bootstrap.workspaces}>{children}</ExperienceNavigationContext.Provider></ExperienceRevisionContext.Provider>; }
function ApiClientProvider({ client, children }: { readonly client: HttpClient; readonly children: ReactNode }) { return <ApiClientContext.Provider value={client}>{children}</ApiClientContext.Provider>; }
function PermissionProvider({ permissions, children }: { readonly permissions: readonly string[]; readonly children: ReactNode }) { const value = useMemo(() => new Set(permissions), [permissions]); return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>; }
function FeatureProvider({ features, children }: { readonly features: Readonly<Record<string, ExperienceFeature>>; readonly children: ReactNode }) { return <FeatureContext.Provider value={features}>{children}</FeatureContext.Provider>; }

function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [messages, setMessages] = useState<readonly ToastMessage[]>([]), sequence = useRef(0);
  const dismiss = useCallback((id: string) => setMessages((current) => current.filter((message) => message.id !== id)), []);
  const push = useCallback((message: Omit<ToastMessage, "id">) => { const id = `toast-${++sequence.current}`; setMessages((current) => [...current, { ...message, id }]); return id; }, []);
  const value = useMemo(() => ({ messages, push, dismiss }), [messages, push, dismiss]);
  return <ToastContext.Provider value={value}>{children}<ToastRegion>{messages.map((message) => <Toast key={message.id} tone={message.tone} title={message.title}>{message.detail}</Toast>)}</ToastRegion></ToastContext.Provider>;
}
function SurfaceStackProvider({ children }: { readonly children: ReactNode }) {
  const [stack, setStack] = useState<readonly SurfaceFrame[]>([]);
  const open = useCallback((frame: SurfaceFrame) => setStack((current) => { const result = validateSurfaceOpen(current, frame.kind); if (!result.ok) throw new Error(result.reason); return [...current.filter((item) => item.id !== frame.id), frame]; }), []);
  const close = useCallback((id: string) => setStack((current) => current.filter((frame) => frame.id !== id)), []);
  const closeTop = useCallback(() => setStack((current) => current.slice(0, -1)), []);
  const value = useMemo(() => ({ stack, open, close, closeTop }), [stack, open, close, closeTop]);
  return <SurfaceContext.Provider value={value}>{children}</SurfaceContext.Provider>;
}
function ShellStateProvider({ children }: { readonly children: ReactNode }) { const [activeWorkspaceCode, setActiveWorkspace] = useState<string>(); const value = useMemo(() => ({ ...(activeWorkspaceCode ? { activeWorkspaceCode } : {}), setActiveWorkspace }), [activeWorkspaceCode]); return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>; }

function AuthenticationFailureBridge({ client, lifecycle, onInvalidated, onFailure }: { readonly client: QueryClient; readonly lifecycle: PrincipalQueryLifecycle; readonly onInvalidated: () => void; readonly onFailure?: (error: ApiTransportError) => void }) {
  useEffect(() => {
    const inspect = (error: unknown) => { if (isInvalidSession(error)) void lifecycle.invalidate().then(() => { onInvalidated(); onFailure?.(error); }); };
    const querySubscription = client.getQueryCache().subscribe((event) => inspect(event.query.state.error));
    const mutationSubscription = client.getMutationCache().subscribe((event) => { if ("mutation" in event && event.mutation) inspect(event.mutation.state.error); });
    return () => { querySubscription(); mutationSubscription(); };
  }, [client, lifecycle, onInvalidated, onFailure]);
  return null;
}
function isInvalidSession(error: unknown): error is ApiTransportError { return error instanceof ApiTransportError && (error.kind === "authentication" || error.problem?.code === "AUTH_CONTEXT_MISMATCH"); }

export type BootstrapRevalidationReason = "expiry" | "auth_epoch" | "context" | "experience_revision";
const BOOTSTRAP_REVALIDATE_EVENT = "athyper:bootstrap-revalidate";
export function requestBootstrapRevalidation(reason: Exclude<BootstrapRevalidationReason, "expiry">): void { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(BOOTSTRAP_REVALIDATE_EVENT, { detail: reason })); }
function BootstrapFreshnessBridge({ session, onRevalidate }: { readonly session: SanitizedSession; readonly onRevalidate?: (reason: BootstrapRevalidationReason) => void }) {
  const expiry = useSessionExpiry();
  useEffect(() => {
    if (!onRevalidate) return;
    const expiresAt = expiry.expiresAt ? parseInstant(expiry.expiresAt) : Number.NaN, delay = Number.isFinite(expiresAt) ? Math.max(0, expiresAt - Date.now() - 60_000) : undefined;
    const timer = delay === undefined ? undefined : window.setTimeout(() => onRevalidate("expiry"), delay);
    const listener = (event: Event) => { const reason = (event as CustomEvent<BootstrapRevalidationReason>).detail; if (["auth_epoch", "context", "experience_revision"].includes(reason)) onRevalidate(reason); };
    window.addEventListener(BOOTSTRAP_REVALIDATE_EVENT, listener);
    return () => { if (timer !== undefined) window.clearTimeout(timer); window.removeEventListener(BOOTSTRAP_REVALIDATE_EVENT, listener); };
  }, [expiry.expiresAt, session.authEpoch, session.tenantId, session.plane, onRevalidate]);
  return null;
}

const SESSION_EXPIRY_WARNING_MS = 5 * 60_000;
const SESSION_TOUCH_INTERVAL_MS = 60_000;
export interface SessionExpiryWarningTarget { readonly kind: "idle" | "absolute"; readonly expiresAt: string; readonly delayMs: number; }
export function sessionExpiryWarningDelay(expiresAt: string | undefined, currentTime = Date.now(), leadTimeMs = SESSION_EXPIRY_WARNING_MS): number | undefined { const expiry = expiresAt ? parseInstant(expiresAt) : Number.NaN; if (!Number.isFinite(expiry) || expiry <= currentTime) return undefined; return Math.max(0, expiry - currentTime - leadTimeMs); }
export function sessionExpiryWarningTarget(expiry: Pick<SessionExpiry, "idleExpiresAt" | "absoluteExpiresAt">, currentTime = Date.now(), leadTimeMs = SESSION_EXPIRY_WARNING_MS): SessionExpiryWarningTarget | undefined {
  const idle = expiry.idleExpiresAt ? parseInstant(expiry.idleExpiresAt) : Number.NaN, absolute = expiry.absoluteExpiresAt ? parseInstant(expiry.absoluteExpiresAt) : Number.NaN;
  const candidates = [
    ...(Number.isFinite(idle) && idle > currentTime ? [{ kind: "idle" as const, expiresAt: expiry.idleExpiresAt!, value: idle }] : []),
    ...(Number.isFinite(absolute) && absolute > currentTime ? [{ kind: "absolute" as const, expiresAt: expiry.absoluteExpiresAt!, value: absolute }] : []),
  ];
  if (!candidates.length) return undefined;
  const target = candidates.reduce((earliest, candidate) => candidate.value <= earliest.value ? candidate : earliest);
  return Object.freeze({ kind: target.kind, expiresAt: target.expiresAt, delayMs: Math.max(0, target.value - currentTime - leadTimeMs) });
}
export function shouldSendSessionTouch(lastAttemptAt: number, currentTime = Date.now(), intervalMs = SESSION_TOUCH_INTERVAL_MS): boolean { return currentTime - lastAttemptAt >= intervalMs; }
function SessionExpiryWarning() {
  const expiry = useSessionExpiry(); const { push, dismiss } = useToasts(); const warnedFor = useRef<string | undefined>(undefined); const visibleWarning = useRef<Readonly<{ key: string; id: string }> | undefined>(undefined);
  useEffect(() => {
    const target = sessionExpiryWarningTarget(expiry); const warningKey = target ? `${target.kind}:${target.expiresAt}` : undefined;
    if (visibleWarning.current && visibleWarning.current.key !== warningKey) { dismiss(visibleWarning.current.id); visibleWarning.current = undefined; }
    if (!target || !warningKey) return;
    const notify = () => { if (warnedFor.current === warningKey) return; warnedFor.current = warningKey; const time = new Date(target.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); const id = push(target.kind === "idle" ? { tone: "warning", title: "Session idle timeout approaching", detail: `You'll be signed out for inactivity at ${time}. Continue working to keep your session active.` } : { tone: "warning", title: "Session ending soon", detail: `Your security session ends at ${time}. Save your work before signing in again.` }); visibleWarning.current = { key: warningKey, id }; };
    const timer = window.setTimeout(notify, target.delayMs); return () => window.clearTimeout(timer);
  }, [expiry.idleExpiresAt, expiry.absoluteExpiresAt, push, dismiss]);
  return null;
}

function SessionActivityBridge({ sessionState, onRevalidate }: { readonly sessionState: SanitizedSession["state"]; readonly onRevalidate?: (reason: BootstrapRevalidationReason) => void }) {
  const updateExpiry = required(useContext(SessionExpiryUpdateContext), "SessionActivityBridge"); const lastAttemptAt = useRef(Date.now()); const inFlight = useRef<Promise<void> | undefined>(undefined);
  useEffect(() => {
    if (sessionState === "anonymous") return;
    const touch = () => {
      const currentTime = Date.now(); if (inFlight.current || !shouldSendSessionTouch(lastAttemptAt.current, currentTime)) return;
      const csrfToken = readBrowserCsrfToken(); if (!csrfToken) return;
      lastAttemptAt.current = currentTime;
      inFlight.current = fetch("/api/auth/touch", { method: "POST", credentials: "same-origin", headers: { "x-csrf-token": csrfToken, accept: "application/json" }, cache: "no-store" })
        .then(async (response) => { if (response.status === 401) { onRevalidate?.("expiry"); return; } if (!response.ok) return; const value = await response.json() as Partial<SanitizedSession>; updateExpiry(sessionExpiry(value)); })
        .catch(() => undefined)
        .finally(() => { inFlight.current = undefined; });
    };
    const visible = () => { if (document.visibilityState === "visible") touch(); };
    window.addEventListener("pointerdown", touch, { passive: true }); window.addEventListener("keydown", touch); window.addEventListener("focus", touch); document.addEventListener("visibilitychange", visible);
    return () => { window.removeEventListener("pointerdown", touch); window.removeEventListener("keydown", touch); window.removeEventListener("focus", touch); document.removeEventListener("visibilitychange", visible); };
  }, [sessionState, updateExpiry, onRevalidate]);
  return null;
}

export function sessionActivityChannelName(plane: SanitizedSession["plane"]): string { return `athyper:${plane}:session-activity`; }
function SessionTerminationBridge({ plane }: { readonly plane: SanitizedSession["plane"] }) {
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(sessionActivityChannelName(plane));
    channel.addEventListener("message", (event: MessageEvent<unknown>) => {
      const message = event.data;
      if (!message || typeof message !== "object" || !("type" in message)) return;
      if (message.type === "session_probe") channel.postMessage({ type: "session_listener_ready" });
      if (message.type === "session_terminated") window.location.assign("/logout?reason=signed-out");
    });
    return () => channel.close();
  }, [plane]);
  return null;
}

function sessionExpiry(value: Pick<SanitizedSession, "expiresAt" | "idleExpiresAt" | "absoluteExpiresAt">): SessionExpiry { return Object.freeze({ ...(value.expiresAt ? { expiresAt: value.expiresAt } : {}), ...(value.idleExpiresAt ? { idleExpiresAt: value.idleExpiresAt } : {}), ...(value.absoluteExpiresAt ? { absoluteExpiresAt: value.absoluteExpiresAt } : {}) }); }

function required<T>(value: T | undefined, name: string): T { if (value === undefined) throw new Error(`${name} must be used inside AppFoundationProviders`); return value; }
function developmentAccessDiagnostic(event: AccessDiagnostic): void { if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname.endsWith(".local"))) console.warn("[athyper/access]", event); }
export const useAppearanceProfile = () => required(useContext(AppearanceContext), "useAppearanceProfile");
/** Non-throwing variant for shared UI that may render outside AppFoundationProviders (e.g. isolated test fixtures). */
export const useOptionalAppearanceProfile = () => useContext(AppearanceContext);
export const useSessionIdentity = () => required(useContext(SessionIdentityContext), "useSessionIdentity");
export const useSessionExpiry = () => required(useContext(SessionExpiryContext), "useSessionExpiry");
export const useSessionActions = () => required(useContext(SessionActionsContext), "useSessionActions");
export const useExperienceNavigation = () => required(useContext(ExperienceNavigationContext), "useExperienceNavigation");
export const useExperienceRevision = () => required(useContext(ExperienceRevisionContext), "useExperienceRevision");
export const useApiClient = () => required(useContext(ApiClientContext), "useApiClient");
export const usePermissions = () => required(useContext(PermissionContext), "usePermissions");
export const usePermission = (code: string) => usePermissions().has(code);
export const useFeatures = () => required(useContext(FeatureContext), "useFeatures");
export const useFeature = (code: string) => useFeatures()[code]?.enabled === true;
export const useApplicationNavigation = () => required(useContext(ApplicationNavigationContext), "useApplicationNavigation");
export const useToasts = () => required(useContext(ToastContext), "useToasts");
export const useSurfaceStack = () => required(useContext(SurfaceContext), "useSurfaceStack");
export const useShellState = () => required(useContext(ShellContext), "useShellState");
export type { SurfaceKind };
export type { SanitizedSession } from "@athyper/contract-platform-auth-session";
export type { ExperienceBootstrap } from "@athyper/platform-api-client";
