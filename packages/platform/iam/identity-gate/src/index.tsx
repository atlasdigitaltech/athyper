import * as React from "react";
import { getPlaneBrand, type BrandPlane } from "@athyper/platform-brand";
import { PublicIdentitySurface } from "@athyper/platform-surface-kit/public-identity-surface";
import { ActionButton, ActionLink, Eyebrow, Heading, MetaText, Notice, ScreenReaderText, Spinner, SupportingText } from "@athyper/platform-ui/presentation";
import { IdentityContextPicker, type IdentityContextOption } from "./context-picker";
export type { IdentityContextOption } from "./context-picker";
export { getPlaneWebMetadata } from "@athyper/platform-brand";

export type IdentityGateDecision =
  | { readonly kind: "allow" }
  | { readonly kind: "login"; readonly returnTo: string }
  | { readonly kind: "select-context" }
  | { readonly kind: "required-action"; readonly actions: readonly string[] };

export function decideIdentityGate(input: { readonly authenticated: boolean; readonly returnTo: string; readonly tenantId?: string; readonly requiredActions?: readonly string[] }): IdentityGateDecision {
  if (!input.authenticated) return { kind: "login", returnTo: safeReturnTo(input.returnTo) };
  if (input.requiredActions?.length) return { kind: "required-action", actions: Object.freeze([...new Set(input.requiredActions)]) };
  if (!input.tenantId) return { kind: "select-context" };
  return { kind: "allow" };
}

export type AuthRecoveryReason = "access" | "service" | "retry" | "expired" | "signed-out" | "signed-out-everywhere" | "logout-incomplete";
const RECOVERY = Object.freeze({
  access: { title: "Access could not be confirmed", message: "This account is not currently configured for access. Use another account or contact your administrator.", action: "Use a different account", mode: "switch" },
  service: { title: "Sign-in is temporarily unavailable", message: "A service required to complete sign-in is unavailable. Your account and credentials have not been changed.", action: "Try again", mode: "retry" },
  retry: { title: "We could not complete sign-in", message: "The sign-in request ended or could not be verified. Start a new secure sign-in to continue.", action: "Start again", mode: "retry" },
  expired: { title: "Your session has ended", message: "For your security, you have been signed out. Sign in again to continue your work.", action: "Sign in again", mode: "retry" },
  "signed-out": { title: "You are signed out", message: "Your application session has been closed securely.", action: "Sign in again", mode: "retry" },
  "signed-out-everywhere": { title: "You are signed out everywhere", message: "Your Athyper identity session and participating application sessions have been closed.", action: "Sign in again", mode: "retry" },
  "logout-incomplete": { title: "Sign-out could not be fully verified", message: "This browser has discarded its application session, but server-side revocation could not be confirmed. Close this window and contact support if the issue continues.", action: "Return to sign-in", mode: "retry" },
} satisfies Record<AuthRecoveryReason, { title: string; message: string; action: string; mode: "retry" | "switch" }>);

export interface LoginGatePageProps { readonly plane: BrandPlane; readonly reason?: string; readonly returnTo?: string; readonly requestId?: string; }
export function LoginGatePage({ plane, reason, returnTo = "/", requestId }: LoginGatePageProps) {
  const brand = getPlaneBrand(plane); const recovery = reason ? RECOVERY[normalizeReason(reason)] : undefined;
  const retryHref = loginHref(returnTo, "retry");
  const primaryHref = loginHref(returnTo, recovery?.mode ?? "retry");
  return <AuthShell plane={plane}>
    <div className="a-identity-panel">
      <Heading id="identity-title">{getGreeting()}</Heading>
      {!recovery ? <SupportingText>{`Continue to ${brand.description}. Authentication is handled securely by Athyper Identity.`}</SupportingText> : null}
      {recovery ? <Notice title={recovery.title} icon={<StatusIcon />} role="alert">{recovery.message}</Notice> : null}
      <ActionLink variant="contrast" href={primaryHref}><LockIcon />{recovery?.action ?? "Continue securely"}</ActionLink>
      {recovery?.mode === "switch" ? <ActionLink variant="secondary" href={retryHref}>Try this account again</ActionLink> : null}
      {requestId ? <MetaText>Support reference: <code>{requestId}</code></MetaText> : null}
    </div>
  </AuthShell>;
}

export function ContextGatePage({ plane, returnTo = "/", contexts = [] }: { readonly plane: BrandPlane; readonly returnTo?: string; readonly contexts?: readonly IdentityContextOption[] }) {
  const brand = getPlaneBrand(plane);
  const noun = plane === "mesh" ? "network workspace" : plane === "studio" ? "administration context" : "business context";
  return <AuthShell plane={plane}>
    <div className="a-identity-panel">
      <Eyebrow>Identity verified · {brand.shortName}</Eyebrow>
      <Heading id="identity-title">Choose your {noun}</Heading>
      <SupportingText>Only active contexts authorized for this identity are shown. Your selection creates a new isolated session scope.</SupportingText>
      {contexts.length ? <IdentityContextPicker contexts={contexts} returnTo={returnTo} /> : <Notice title="No active context is available" icon={<ContextIcon />} role="status">Your identity was verified, but no active plane membership could be resolved. Ask your administrator to review the identity binding and membership.</Notice>}
      <div className="a-context-actions"><ActionLink variant="secondary" href={loginHref(returnTo, "switch")}>Use a different account</ActionLink><ActionLink variant="ghost" href="/logout">Sign out securely</ActionLink></div>
    </div>
  </AuthShell>;
}

export function LogoutGatePage({ plane, csrfToken }: { readonly plane: BrandPlane; readonly csrfToken?: string }) {
  const brand = getPlaneBrand(plane);
  return <AuthShell plane={plane}><div className="a-identity-panel"><Heading id="identity-title">Choose how to sign out</Heading><SupportingText>Close only this application, or end your Athyper identity session across all participating applications.</SupportingText>
    {!csrfToken ? <Notice title="Sign-out verification is unavailable" icon={<StatusIcon />} role="alert">Return to the application and try again. No session has been changed.</Notice> : <>
      <form action="/api/auth/logout" method="post"><input type="hidden" name="_csrf" value={csrfToken}/><input type="hidden" name="scope" value="application"/><ActionButton variant="contrast" type="submit"><LockIcon />Sign out of {brand.shortName}</ActionButton></form>
      <form action="/api/auth/logout" method="post"><input type="hidden" name="_csrf" value={csrfToken}/><input type="hidden" name="scope" value="global"/><ActionButton variant="secondary" type="submit">Sign out of Athyper everywhere</ActionButton></form>
    </>}
    <MetaText>Application sign-out leaves your Athyper SSO session available. Global sign-out also ends participating Neon, Mesh and Studio sessions.</MetaText><ActionLink variant="ghost" href="/">Return to application</ActionLink></div></AuthShell>;
}

export function AuthLoadingPage({ plane, label = "Preparing secure sign-in" }: { readonly plane: BrandPlane; readonly label?: string }) {
  return <AuthShell plane={plane}><div className="a-identity-panel" aria-busy="true"><Spinner/><Heading id="identity-title">{label}</Heading><SupportingText>Please wait while we establish a secure connection.</SupportingText><ScreenReaderText role="status" aria-live="polite">{label}</ScreenReaderText></div></AuthShell>;
}

function AuthShell({ plane, children }: { readonly plane: BrandPlane; readonly children: React.ReactNode }) {
  const brand = getPlaneBrand(plane);
  return <PublicIdentitySurface plane={plane} labelledBy="identity-title" brand={
      <picture>
        <source media="(prefers-color-scheme: dark)" srcSet={brand.inverseWordmark.src} />
        <img src={brand.wordmark.src} width={brand.wordmark.width} height={brand.wordmark.height} alt={brand.wordmark.alt} decoding="sync" fetchPriority="high" />
      </picture>
    } footer={<><span>© {new Date().getFullYear()} Athyper</span><span aria-hidden="true">·</span><span className="a-identity-assurance"><LockIcon />Encrypted · Credentials with Athyper Identity</span></>}>{children}</PublicIdentitySurface>;
}

function LockIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 10V8a5 5 0 0 1 10 0v2m-9 0h8a2 2 0 0 1 2 2v7H6v-7a2 2 0 0 1 2-2Z"/></svg>; }
function StatusIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 8v5m0 3h.01M4.9 19h14.2a1 1 0 0 0 .87-1.5L12.87 5a1 1 0 0 0-1.74 0l-7.1 12.5A1 1 0 0 0 4.9 19Z"/></svg>; }
function ContextIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 7a7 7 0 0 1 14 0"/></svg>; }
function getGreeting(): string { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; }
function normalizeReason(value: string): AuthRecoveryReason { const normalized = value.trim().replace(/;+$/, ""); return (["access", "service", "retry", "expired", "signed-out", "signed-out-everywhere", "logout-incomplete"] as const).includes(normalized as AuthRecoveryReason) ? normalized as AuthRecoveryReason : "retry"; }
function safeReturnTo(value: string): string { return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") && !/^\/(?:api|sign-in|logout)(?:\/|\?|$)/.test(value) ? value : "/"; }
function loginHref(returnTo: string, mode: "retry" | "switch"): string { return `/api/auth/login?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}&mode=${mode}`; }
