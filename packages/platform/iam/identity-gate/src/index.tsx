import * as React from "react";
import { getPlaneBrand, type BrandPlane } from "@athyper/platform-brand";
import { LockIcon, UserIcon, WarningIcon } from "@athyper/platform-icons";
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
      {recovery ? <Notice title={recovery.title} icon={<WarningIcon />} role="alert">{recovery.message}</Notice> : null}
      <ActionLink variant="primary" href={primaryHref}><LockIcon />{recovery?.action ?? "Continue securely"}</ActionLink>
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
      {contexts.length ? <IdentityContextPicker contexts={contexts} returnTo={returnTo} /> : <Notice title="No active context is available" icon={<UserIcon />} role="status">Your identity was verified, but no active plane membership could be resolved. Ask your administrator to review the identity binding and membership.</Notice>}
      <div className="a-context-actions"><ActionLink variant="secondary" href={loginHref(returnTo, "switch")}>Use a different account</ActionLink><ActionLink variant="ghost" href="/logout">Sign out securely</ActionLink></div>
    </div>
  </AuthShell>;
}

export function LogoutGatePage({ plane, csrfToken }: { readonly plane: BrandPlane; readonly csrfToken?: string }) {
  const brand = getPlaneBrand(plane);
  return <AuthShell plane={plane}><div className="a-identity-panel"><Heading id="identity-title">Choose how to sign out</Heading><SupportingText>Close only this application, or end your Athyper identity session across all participating applications.</SupportingText>
    {!csrfToken ? <Notice title="Sign-out verification is unavailable" icon={<WarningIcon />} role="alert">Return to the application and try again. No session has been changed.</Notice> : <>
      <form action="/api/auth/logout" method="post"><input type="hidden" name="_csrf" value={csrfToken}/><input type="hidden" name="scope" value="application"/><ActionButton variant="primary" type="submit"><LockIcon />Sign out of {brand.shortName}</ActionButton></form>
      <form action="/api/auth/logout" method="post"><input type="hidden" name="_csrf" value={csrfToken}/><input type="hidden" name="scope" value="global"/><ActionButton variant="secondary" type="submit">Sign out of Athyper everywhere</ActionButton></form>
    </>}
    <MetaText>Application sign-out leaves your Athyper SSO session available. Global sign-out also ends participating Neon, Mesh and Studio sessions.</MetaText><ActionLink variant="ghost" href="/">Return to application</ActionLink></div></AuthShell>;
}

export function AuthLoadingPage({ plane, label = "Preparing secure sign-in" }: { readonly plane: BrandPlane; readonly label?: string }) {
  return <AuthShell plane={plane}><div className="a-identity-panel" aria-busy="true"><Spinner/><Heading id="identity-title">{label}</Heading><SupportingText>Please wait while we establish a secure connection.</SupportingText><ScreenReaderText role="status" aria-live="polite">{label}</ScreenReaderText></div></AuthShell>;
}

function AuthShell({ plane, children }: { readonly plane: BrandPlane; readonly children: React.ReactNode }) {
  const brand = getPlaneBrand(plane);
  const story = IDENTITY_STORIES[plane];
  return <PublicIdentitySurface plane={plane} labelledBy="identity-title" story={<>
      <div className="a-identity-story-copy"><p className="a-identity-story-eyebrow">{brand.description}</p><h2>{story.heading}</h2><p>{story.copy}</p></div>
      <IdentityWave />
      <p className="a-identity-story-plane">{brand.shortName}<span>{brand.description}</span></p>
    </>} brand={<img src={brand.identityLockup.src} width={brand.identityLockup.width} height={brand.identityLockup.height} alt={brand.identityLockup.alt} decoding="sync" fetchPriority="high" />}
    footer={<><span>© {new Date().getFullYear()} Atlas Digital Technology Solutions</span><span aria-hidden="true">·</span><span className="a-identity-assurance"><img src={brand.favicon} alt="" aria-hidden="true" />Secured by Athyper Identity</span></>}>{children}</PublicIdentitySurface>;
}

const IDENTITY_STORIES = Object.freeze({
  neon: { heading: "Run your business.", copy: "Manage finance, operations, and daily work in one place." },
  mesh: { heading: "Work better together.", copy: "Connect with buyers, suppliers, and partners." },
  studio: { heading: "Build and manage Athyper.", copy: "Manage access, settings, data, and platform operations." },
} satisfies Record<BrandPlane, { readonly heading: string; readonly copy: string }>);

function IdentityWave() { return <svg className="a-identity-story-art" viewBox="0 0 1200 520" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="athyper-app-wave" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="var(--a-story-wave)" stopOpacity="0"/><stop offset=".28" stopColor="var(--a-story-wave)" stopOpacity=".75"/><stop offset=".72" stopColor="var(--a-story-wave-bright)" stopOpacity=".95"/><stop offset="1" stopColor="var(--a-story-wave)" stopOpacity=".12"/></linearGradient></defs><g className="a-identity-story-wave-lines" fill="none" stroke="url(#athyper-app-wave)" strokeWidth="2"><path d="M-40 285 C180 285 235 120 430 270 S720 430 910 220 S1110 170 1240 280"/><path d="M-40 300 C190 300 245 145 440 282 S725 415 920 232 S1115 190 1240 292"/><path d="M-40 315 C200 315 255 170 450 294 S730 400 930 244 S1120 210 1240 304"/><path d="M-40 330 C210 330 265 195 460 306 S735 385 940 256 S1125 230 1240 316"/><path d="M-40 345 C220 345 275 220 470 318 S740 370 950 268 S1130 250 1240 328"/><path d="M-40 360 C230 360 285 245 480 330 S745 355 960 280 S1135 270 1240 340"/></g></svg>; }

function getGreeting(): string { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; }
function normalizeReason(value: string): AuthRecoveryReason { const normalized = value.trim().replace(/;+$/, ""); return (["access", "service", "retry", "expired", "signed-out", "signed-out-everywhere", "logout-incomplete"] as const).includes(normalized as AuthRecoveryReason) ? normalized as AuthRecoveryReason : "retry"; }
function safeReturnTo(value: string): string { return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") && !/^\/(?:api|sign-in|logout)(?:\/|\?|$)/.test(value) ? value : "/"; }
function loginHref(returnTo: string, mode: "retry" | "switch"): string { return `/api/auth/login?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}&mode=${mode}`; }
