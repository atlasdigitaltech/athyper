"use client";

import { useEffect, useState } from "react";
import type { PlaneKey } from "@athyper/session-plane";
import { getPlaneConfig } from "@athyper/session-plane";

import {
  AuthShell,
  AthyperSignInIcon,
  ErrorBanner,
  PrimaryAction,
  SecondaryAction,
  TextLinkButton,
} from "./components";
import { authErrorMessageFromSearch } from "./errors";
import { getAuthExperience } from "./experience";
import type { BrowserLocationSnapshot } from "./types";
import { buildLoginHref, readFinalDestinationFromSearch } from "./url";
import { getDefaultWorkbenchForPlane } from "./workbench";

type DiscoveryMode = "email" | "returning" | "awaiting" | "verified";

interface DiscoveryCandidate {
  id: string;
  tenantId: string;
  tenantCode: string;
  tenantName: string;
  workspaceId: string;
  workspaceCode: string;
  workspaceName: string;
  workspaceType: string;
  workspaceSubtitle: string;
  authMethodLabel: string;
  hostname: string | null;
  networkAccountId?: string | null;
  networkAccountCode?: string | null;
  networkAccountName?: string | null;
  networkAccountRole?: string | null;
  networkRelationshipType?: string | null;
}

interface RememberedOrganization {
  organizationKey?: string;
  organizationId?: string;
  organizationCode?: string;
  organizationType?: string;
  tenantId?: string;
  workspaceKey?: string;
  tenantCode: string;
  tenantName?: string;
  displayName: string;
  subtitle?: string;
  initials: string;
  hostname: string | null;
  loginUrl: string;
  loginHint?: string;
  lastVisitedAt: number;
  networkAccountId?: string | null;
  networkAccountCode?: string | null;
  networkAccountName?: string | null;
  networkAccountRole?: string | null;
  networkRelationshipType?: string | null;
}

interface DiscoveryStartResponse {
  status?: string;
  verified?: boolean;
  token?: string;
  identifier?: string;
  email?: string | null;
  identifierHint?: string;
  emailHint?: string;
  expiresInSeconds?: number;
  resendCooldownSeconds?: number;
  candidates?: DiscoveryCandidate[];
  debugVerifyUrl?: string;
  error?: string;
  message?: string;
}

interface DiscoveryVerifyResponse {
  verified?: boolean;
  identifier?: string;
  email?: string;
  expiresAt?: number;
  candidates?: DiscoveryCandidate[];
  error?: string;
}

interface DiscoverySelectResponse {
  loginUrl?: string;
  organization?: DiscoveryCandidate;
  workspace?: DiscoveryCandidate;
  error?: string;
  message?: string;
}

const REMEMBERED_LIMIT = 5;
const SENSITIVE_LOGIN_QUERY_PARAMS = [
  "context_token",
  "email",
  "login_hint",
  "selected_org",
  "selected_org_name",
  "selected_role",
  "selected_tenant",
  "selected_tenant_id",
  "selected_workspace_id",
  "selected_workspace_type",
];

export function LoginGateClient({ plane, reason }: { plane: PlaneKey; reason?: string }) {
  const config = getPlaneConfig(plane);
  const [location, setLocation] = useState<BrowserLocationSnapshot>({
    pathname: config.loginPath,
    search: "",
  });
  const [loading, setLoading] = useState<string | null>(null);
  const [mode, setMode] = useState<DiscoveryMode>("email");
  const [email, setEmail] = useState("");
  const [showNativeFallback, setShowNativeFallback] = useState(false);
  const [submittedEmailHint, setSubmittedEmailHint] = useState<string | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<DiscoveryCandidate[]>([]);
  const [debugVerifyUrl, setDebugVerifyUrl] = useState<string | null>(null);
  const [discoveryExpiresInSeconds, setDiscoveryExpiresInSeconds] = useState(900);
  const [resendAvailableAt, setResendAvailableAt] = useState(0);
  const [nowMs, setNowMs] = useState(Date.now());
  const [rememberedOrganizations, setRememberedOrganizations] = useState<RememberedOrganization[]>([]);

  function startDifferentSignIn() {
    setEmail("");
    setSubmittedEmailHint(null);
    setDiscoveryError(null);
    setVerificationToken(null);
    setVerifiedEmail(null);
    setCandidates([]);
    setDebugVerifyUrl(null);
    setResendAvailableAt(0);
    setShowNativeFallback(false);
    setMode("email");
  }

  useEffect(() => {
    const syncBrowserLocation = () => {
      const nextLocation = {
        pathname: window.location.pathname,
        search: window.location.search,
      };
      setLocation(nextLocation);
      setLoading(null);

      const params = new URLSearchParams(nextLocation.search);
      const token = params.get("verify");
      if (token) {
        void verifyDiscoveryToken(token);
        return;
      }

      const changeUser = params.get("change_user") === "1" || params.get("changeUser") === "1";
      const remembered = readRememberedOrganizations(plane);
      setRememberedOrganizations(remembered);
      setMode(!changeUser && remembered.length > 0 ? "returning" : "email");
    };

    syncBrowserLocation();
    window.addEventListener("pageshow", syncBrowserLocation);
    window.addEventListener("popstate", syncBrowserLocation);

    return () => {
      window.removeEventListener("pageshow", syncBrowserLocation);
      window.removeEventListener("popstate", syncBrowserLocation);
    };
  }, [plane]);

  useEffect(() => {
    if (mode !== "awaiting" || resendAvailableAt <= Date.now()) return undefined;
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [mode, resendAvailableAt]);

  const params = new URLSearchParams(location.search);
  const finalDestination = readFinalDestinationFromSearch(location.search, config.defaultPath);
  const error = authErrorMessageFromSearch(params);
  const experience = getAuthExperience(plane);
  const nativeHref = buildLoginHref({
    config,
    realm: config.nativeRealm,
    finalDestination,
    filter: getDefaultWorkbenchForPlane(plane),
  });
  const discoveryProductName = plane === "admin" ? "athyper Admin" : experience.product;
  const supportCopy = plane === "mesh"
    ? "To access your network account."
    : plane === "admin"
      ? "To access your admin account."
      : "To access your organization.";
  const shellCopy = discoveryShellCopy({
    emailHint: submittedEmailHint,
    mode,
    productName: discoveryProductName,
    supportCopy,
    verifiedEmail,
  });

  async function verifyDiscoveryToken(token: string) {
    setLoading("verify");
    setDiscoveryError(null);
    setVerificationToken(token);
    try {
      const res = await fetch(`/api/auth/discovery?token=${encodeURIComponent(token)}`, {
        method: "GET",
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as DiscoveryVerifyResponse;
      if (!res.ok || !data.verified) {
        throw new Error(data.error === "DISCOVERY_TOKEN_INVALID"
          ? "This verification link has expired. Request a new link to continue."
          : "We could not verify this sign-in link.");
      }
      setVerifiedEmail(data.identifier ?? data.email ?? null);
      setCandidates(data.candidates ?? []);
      setMode("verified");
    } catch (err) {
      setMode("email");
      setShowNativeFallback(false);
      setDiscoveryError(err instanceof Error ? err.message : "We could not verify this sign-in link.");
    } finally {
      setLoading(null);
    }
  }

  async function submitDiscovery(nextEmail = email) {
    const trimmed = nextEmail.trim().toLowerCase();
    if (!isValidIdentifier(trimmed)) {
      setDiscoveryError("Enter a valid username or email.");
      setShowNativeFallback(false);
      return;
    }

    setLoading("discovery");
    setDiscoveryError(null);
    setShowNativeFallback(false);
    setDebugVerifyUrl(null);
    try {
      const res = await fetch("/api/auth/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: trimmed, returnUrl: finalDestination }),
      });
      const data = (await res.json().catch(() => ({}))) as DiscoveryStartResponse;
      if (!res.ok && (data.error === "INVALID_IDENTIFIER" || data.error === "INVALID_EMAIL")) {
        throw new Error(data.message ?? "Enter a valid username or email.");
      }
      if (!res.ok && data.error === "DISCOVERY_NO_MATCH") {
        throw new Error(data.message ?? "We could not find an organization for that user ID or email.");
      }
      if (!res.ok) {
        setShowNativeFallback(true);
        throw new Error(data.message ?? "Discovery is temporarily unavailable. Use direct sign-in below.");
      }
      if ((data.status === "verified" || data.verified) && data.token) {
        setVerificationToken(data.token);
        setVerifiedEmail(data.identifier ?? data.email ?? data.emailHint ?? data.identifierHint ?? trimmed);
        setCandidates(data.candidates ?? []);
        setDebugVerifyUrl(null);
        setSubmittedEmailHint(null);
        setMode("verified");
        return;
      }
      const cooldownSeconds = typeof data.resendCooldownSeconds === "number"
        ? Math.max(0, data.resendCooldownSeconds)
        : 30;
      setDiscoveryExpiresInSeconds(typeof data.expiresInSeconds === "number" ? data.expiresInSeconds : 900);
      setResendAvailableAt(Date.now() + cooldownSeconds * 1000);
      setNowMs(Date.now());
      setSubmittedEmailHint(data.identifierHint ?? data.emailHint ?? maskIdentifier(trimmed));
      setDebugVerifyUrl(data.debugVerifyUrl ?? null);
      setMode("awaiting");
    } catch (err) {
      setDiscoveryError(err instanceof Error ? err.message : "Discovery is temporarily unavailable.");
      if (!(err instanceof Error) || (!err.message.startsWith("Enter a valid") && !err.message.startsWith("We could not find"))) {
        setShowNativeFallback(true);
      }
    } finally {
      setLoading(null);
    }
  }

  async function selectWorkspace(candidate: DiscoveryCandidate) {
    if (!verificationToken) return;
    setLoading(`select:${candidate.id}`);
    setDiscoveryError(null);
    try {
      const res = await fetch("/api/auth/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "select",
          token: verificationToken,
          optionId: candidate.id,
          returnUrl: finalDestination,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as DiscoverySelectResponse;
      if (!res.ok || !data.loginUrl) {
        throw new Error(data.message ?? `We could not prepare this ${plane === "mesh" ? "network account" : "organization"} sign-in.`);
      }
      rememberOrganization(plane, candidate, safeRememberedLoginUrl(data.loginUrl), verifiedEmail ?? email.trim());
      window.location.assign(data.loginUrl);
    } catch (err) {
      setDiscoveryError(err instanceof Error ? err.message : `We could not prepare this ${plane === "mesh" ? "network account" : "organization"} sign-in.`);
      setLoading(null);
    }
  }

  async function selectRememberedOrganization(organization: RememberedOrganization) {
    const key = rememberedOrganizationKey(organization);
    setLoading(`remembered:${key}`);
    setDiscoveryError(null);
    try {
      const res = await fetch("/api/auth/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rememberedLoginRequestBody(plane, organization, finalDestination, config.nativeRealm)),
      });
      const data = (await res.json().catch(() => ({}))) as DiscoverySelectResponse;
      if (!res.ok || !data.loginUrl) {
        throw new Error(data.message ?? `We could not prepare this ${plane === "mesh" ? "network account" : "organization"} sign-in.`);
      }
      window.location.assign(data.loginUrl);
    } catch (err) {
      setDiscoveryError(err instanceof Error ? err.message : `We could not prepare this ${plane === "mesh" ? "network account" : "organization"} sign-in.`);
      setLoading(null);
    }
  }

  const sessionReasonBanner =
    reason === "SESSION_IDLE_EXPIRED"
      ? "Your session expired due to inactivity. Please sign in again."
      : reason === "SESSION_NOT_FOUND"
        ? "Your session could not be found. Please sign in again."
        : null;

  return (
    <AuthShell
      plane={plane}
      title={shellCopy.title}
      subtitle={shellCopy.subtitle}
      variant="brand"
      footer={
        <div className="flex flex-col items-start gap-2 text-left text-[11px] leading-4 text-muted-foreground/60 sm:flex-row sm:items-center sm:justify-between sm:text-xs sm:leading-5">
          <span>&copy; {new Date().getFullYear()} athyper. All rights reserved.</span>
          <button
            className="transition-colors hover:text-foreground disabled:opacity-50"
            disabled={loading !== null}
            onClick={() => { setLoading("logout"); window.location.href = config.logoutPath; }}
            type="button"
          >
            Clear stale session
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {sessionReasonBanner && (
          <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
            {sessionReasonBanner}
          </div>
        )}
        <ErrorBanner message={discoveryError ?? error} />
        {mode === "returning" ? (
          <ReturningOrganizations
            loading={loading}
            onDifferentOrganization={() => {
              startDifferentSignIn();
            }}
            onForget={() => {
              clearRememberedOrganizations(plane);
              setRememberedOrganizations([]);
              startDifferentSignIn();
            }}
            onSelect={(organization) => { void selectRememberedOrganization(organization); }}
            plane={plane}
            organizations={rememberedOrganizations}
          />
        ) : null}
        {mode === "email" ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submitDiscovery();
            }}
          >
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor={`${plane}-identifier`}>
                User ID or Email
              </label>
              <input
                autoComplete="username"
                className="h-11 w-full rounded-md border border-border bg-background px-3 text-base outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-foreground"
                disabled={loading !== null}
                id={`${plane}-identifier`}
                inputMode="text"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com or userid"
                type="text"
                value={email}
              />
            </div>
            <PrimaryAction disabled={loading !== null} type="submit">
              <span>{loading === "discovery" ? "Checking..." : "Continue"}</span>
            </PrimaryAction>
          </form>
        ) : null}
        {mode === "awaiting" ? (
          <AwaitingVerification
            debugVerifyUrl={debugVerifyUrl}
            emailHint={submittedEmailHint}
            expiresInSeconds={discoveryExpiresInSeconds}
            loading={loading}
            onDifferentEmail={() => {
              startDifferentSignIn();
            }}
            plane={plane}
            onResend={() => { void submitDiscovery(); }}
            resendWaitSeconds={Math.max(0, Math.ceil((resendAvailableAt - nowMs) / 1000))}
          />
        ) : null}
        {mode === "verified" ? (
          <VerifiedOrganizations
            candidates={candidates}
            email={verifiedEmail}
            loading={loading}
            onDifferentEmail={() => {
              startDifferentSignIn();
            }}
            onSelect={(candidate) => { void selectWorkspace(candidate); }}
            plane={plane}
          />
        ) : null}
        {showNativeFallback ? (
          <div className="space-y-3">
            <Divider label="or" />
            <p className="text-center text-xs text-muted-foreground">
              Continue with the default {discoveryProductName} sign-in page.
            </p>
          <SecondaryAction
            disabled={loading !== null}
            onClick={() => {
              if (loading !== null) return;
              setLoading("native");
              window.location.assign(nativeHref);
            }}
          >
            <span className="flex items-center justify-center gap-2">
              <AthyperSignInIcon plane={plane} />
              <span>{loading === "native" ? "Starting sign in..." : experience.login.primaryAction}</span>
            </span>
          </SecondaryAction>
          </div>
        ) : null}
      </div>
    </AuthShell>
  );
}

function ReturningOrganizations({
  loading,
  onDifferentOrganization,
  organizations,
  onForget,
  onSelect,
  plane,
}: {
  loading: string | null;
  onDifferentOrganization: () => void;
  organizations: RememberedOrganization[];
  onForget: () => void;
  onSelect: (organization: RememberedOrganization) => void;
  plane: PlaneKey;
}) {
  const showBoundaryDetails = plane !== "admin";
  return (
    <div className="space-y-4">
      <div className="max-h-[52vh] space-y-2 overflow-y-auto overscroll-contain pr-1">
        {organizations.map((organization) => (
          <button
            className="flex w-full items-start gap-3 rounded-md bg-muted px-3 py-3 text-left transition-colors hover:bg-muted/80 disabled:opacity-60"
            disabled={loading !== null}
            key={`${rememberedOrganizationKey(organization)}:${organization.lastVisitedAt}`}
            onClick={() => {
              onSelect(organization);
            }}
            type="button"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-sm font-medium text-primary">
              {organization.initials}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{rememberedOrganizationTitle(plane, organization)}</span>
              {showBoundaryDetails ? (
                <span className="mt-1 grid gap-0.5 text-xs text-muted-foreground">
                  {rememberedOrganizationDetails(plane, organization).map((detail) => (
                    <span className="block truncate" key={detail.label}>{detail.label}: {detail.value}</span>
                  ))}
                  <span className="block truncate">Last visited {relativeTime(organization.lastVisitedAt)}</span>
                </span>
              ) : (
                <span className="block truncate text-xs text-muted-foreground">
                  Last visited {relativeTime(organization.lastVisitedAt)}
                </span>
              )}
            </span>
            <ChevronRightIcon className="mt-2 h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TextLinkButton disabled={loading !== null} onClick={onDifferentOrganization}>
          {differentSignInLabel(plane)}
        </TextLinkButton>
        <TextLinkButton disabled={loading !== null} onClick={onForget}>
          Forget devices
        </TextLinkButton>
      </div>
    </div>
  );
}

function differentSignInLabel(plane: PlaneKey): string {
  return plane === "mesh"
    ? "Use another user ID or network account"
    : "Use another user ID or organization";
}

function AwaitingVerification({
  debugVerifyUrl,
  emailHint,
  expiresInSeconds,
  loading,
  onDifferentEmail,
  plane,
  onResend,
  resendWaitSeconds,
}: {
  debugVerifyUrl: string | null;
  emailHint: string | null;
  expiresInSeconds: number;
  loading: string | null;
  onDifferentEmail: () => void;
  plane: PlaneKey;
  onResend: () => void;
  resendWaitSeconds: number;
}) {
  const resendDisabled = loading !== null || resendWaitSeconds > 0;
  return (
    <div className="space-y-4">
      <div className="rounded-md bg-muted p-4">
        <div className="flex gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <MailIcon className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-medium">Sign-in link sent</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Open the verification link for {emailHint ?? "your sign-in"} to choose your {plane === "mesh" ? "network account" : "organization"}.
              The link expires in {formatDuration(expiresInSeconds)}.
            </p>
          </div>
        </div>
      </div>
      {debugVerifyUrl ? (
        <SecondaryAction href={debugVerifyUrl} disabled={loading !== null}>
          Open dev verification link
        </SecondaryAction>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <SecondaryAction disabled={resendDisabled} onClick={onResend}>
          {loading === "discovery"
            ? "Sending..."
            : resendWaitSeconds > 0
              ? `Resend in ${resendWaitSeconds}s`
              : "Resend link"}
        </SecondaryAction>
        <SecondaryAction disabled={loading !== null} onClick={onDifferentEmail}>
          Use a different sign-in
        </SecondaryAction>
      </div>
    </div>
  );
}

function VerifiedOrganizations({
  candidates,
  email,
  loading,
  onDifferentEmail,
  onSelect,
  plane,
}: {
  candidates: DiscoveryCandidate[];
  email: string | null;
  loading: string | null;
  onDifferentEmail: () => void;
  onSelect: (candidate: DiscoveryCandidate) => void;
  plane: PlaneKey;
}) {
  const showBoundaryDetails = plane !== "admin";
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <CheckIcon className="h-3.5 w-3.5 text-emerald-600" />
          <span>Identity verified{email ? ` - ${email}` : ""}</span>
        </p>
        <p className="text-sm text-muted-foreground">{verifiedChoiceCopy(plane)}</p>
      </div>
      {candidates.length > 0 ? (
        <div className="max-h-[52vh] space-y-2 overflow-y-auto overscroll-contain pr-1">
          {candidates.map((candidate) => (
            <button
              className="flex w-full items-start gap-3 rounded-md bg-muted px-3 py-3 text-left transition-colors hover:bg-muted/80 disabled:opacity-60"
              disabled={loading !== null}
              key={candidate.id}
              onClick={() => onSelect(candidate)}
              type="button"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-sm font-medium text-primary">
                {initials(candidateTitle(plane, candidate))}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{candidateTitle(plane, candidate)}</span>
                {showBoundaryDetails ? (
                  <span className="mt-1 grid gap-0.5 text-xs text-muted-foreground">
                    {candidateDetails(plane, candidate).map((detail) => (
                      <span className="block truncate" key={detail.label}>{detail.label}: {detail.value}</span>
                    ))}
                  </span>
                ) : (
                  <span className="block truncate text-xs text-muted-foreground">{candidateOrganizationSubtitle(candidate)}</span>
                )}
              </span>
              <ChevronRightIcon className="mt-2 h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-md border bg-card px-3 py-3 text-sm text-muted-foreground">
          No {plane === "mesh" ? "network account" : "organization"} is available for this verified link.
        </div>
      )}
      <div className="flex justify-center">
        <TextLinkButton disabled={loading !== null} onClick={onDifferentEmail}>
          Use a different sign-in
        </TextLinkButton>
      </div>
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      <span>{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function discoveryShellCopy({
  emailHint,
  mode,
  productName,
  supportCopy,
  verifiedEmail,
}: {
  emailHint: string | null;
  mode: DiscoveryMode;
  productName: string;
  supportCopy: string;
  verifiedEmail: string | null;
}): { title: string; subtitle: string } {
  if (mode === "returning") {
    return {
      title: `Welcome back to ${productName}`,
      subtitle: productName.toLowerCase() === "mesh"
        ? "Continue to a network account you've signed in to"
        : "Continue to an organization you've signed in to",
    };
  }
  if (mode === "awaiting") {
    return {
      title: "Check your inbox",
      subtitle: emailHint
        ? `We sent a verification link to ${emailHint}`
        : "We sent a verification link so you can choose your organization securely",
    };
  }
  if (mode === "verified") {
    return {
      title: productName.toLowerCase() === "mesh" ? "Choose your network account" : "Choose your organization",
      subtitle: verifiedEmail ? `Identity verified - ${verifiedEmail}` : "Identity verified",
    };
  }
  return {
    title: `Sign in to ${productName}`,
    subtitle: supportCopy,
  };
}

function readRememberedOrganizations(plane: PlaneKey): RememberedOrganization[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(rememberedKey(plane)) ?? window.localStorage.getItem(legacyRememberedKey(plane));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RememberedOrganization[];
    if (!Array.isArray(parsed)) return [];
    const valid = parsed
      .flatMap((item) => {
        const loginHint = normalizeStoredLoginHint(item?.loginHint);
        if (
          !item
          || typeof item.displayName !== "string"
          || typeof item.tenantCode !== "string"
          || typeof item.loginUrl !== "string"
          || typeof item.lastVisitedAt !== "number"
          || !loginHint
        ) {
          return [];
        }
        return [{ ...item, loginHint, loginUrl: safeRememberedLoginUrl(item.loginUrl) }];
      })
      .sort((a, b) => b.lastVisitedAt - a.lastVisitedAt);
    const deduped = new Map<string, RememberedOrganization>();
    for (const item of valid) {
      const key = rememberedOrganizationDedupeKey(item);
      if (!deduped.has(key)) deduped.set(key, item);
    }
    return [...deduped.values()].slice(0, REMEMBERED_LIMIT);
  } catch {
    return [];
  }
}

function rememberOrganization(plane: PlaneKey, candidate: DiscoveryCandidate, loginUrl: string, loginHint: string | null) {
  if (typeof window === "undefined") return;
  try {
    const displayName = candidateTitle(plane, candidate);
    const organizationKey = candidate.id;
    const next: RememberedOrganization = {
      organizationKey,
      organizationId: candidate.workspaceId,
      organizationCode: candidate.workspaceCode,
      organizationType: candidate.workspaceType,
      tenantId: candidate.tenantId,
      tenantCode: candidate.tenantCode,
      tenantName: candidate.tenantName,
      displayName,
      subtitle: candidateOrganizationSubtitle(candidate),
      initials: initials(displayName),
      hostname: candidate.hostname,
      loginUrl,
      loginHint: normalizeStoredLoginHint(loginHint),
      lastVisitedAt: Date.now(),
      networkAccountId: candidate.networkAccountId ?? null,
      networkAccountCode: candidate.networkAccountCode ?? null,
      networkAccountName: candidate.networkAccountName ?? null,
      networkAccountRole: candidate.networkAccountRole ?? null,
      networkRelationshipType: candidate.networkRelationshipType ?? null,
    };
    const nextKey = rememberedOrganizationKey(next);
    const nextDedupeKey = rememberedOrganizationDedupeKey(next);
    const existing = readRememberedOrganizations(plane).filter((item) =>
      rememberedOrganizationKey(item) !== nextKey
      && rememberedOrganizationDedupeKey(item) !== nextDedupeKey
    );
    window.localStorage.setItem(rememberedKey(plane), JSON.stringify([next, ...existing].slice(0, REMEMBERED_LIMIT)));
  } catch {
    // Remembered organizations are only a convenience; sign-in must continue.
  }
}

function candidateTitle(plane: PlaneKey, candidate: DiscoveryCandidate): string {
  if (plane === "mesh") return meshAccountName(candidate);
  return candidateOrganizationName(candidate);
}

function rememberedOrganizationTitle(plane: PlaneKey, organization: RememberedOrganization): string {
  if (plane === "mesh") return meshRememberedAccountName(organization);
  return organization.displayName;
}

function verifiedChoiceCopy(plane: PlaneKey): string {
  if (plane === "mesh") return "Choose the network account you want to sign in with.";
  return "Choose the organization you want to sign in with.";
}

function candidateDetails(
  plane: PlaneKey,
  candidate: DiscoveryCandidate,
): Array<{ label: string; value: string }> {
  if (plane === "mesh") {
    return compactDetails([
      ["Network Account Code", meshAccountCode(candidate)],
      ["Role", formatMeshAccountRole(meshAccountRole(candidate))],
    ]);
  }

  return compactDetails([
    ["Tenant", candidate.tenantName],
    ["Organization / Legal Entity", candidateOrganizationName(candidate)],
  ]);
}

function rememberedOrganizationDetails(
  plane: PlaneKey,
  organization: RememberedOrganization,
): Array<{ label: string; value: string }> {
  if (plane === "mesh") {
    return compactDetails([
      ["User ID", organization.loginHint],
      ["Network Account Code", meshRememberedAccountCode(organization)],
      ["Role", formatMeshAccountRole(meshRememberedAccountRole(organization))],
    ]);
  }

  return compactDetails([
    ["User ID", organization.loginHint],
    ["Tenant", organization.tenantName ?? organization.displayName],
    ["Organization / Legal Entity", organization.displayName],
  ]);
}

function compactDetails(items: Array<[string, string | null | undefined]>): Array<{ label: string; value: string }> {
  return items
    .map(([label, value]) => ({ label, value: typeof value === "string" ? value.trim() : "" }))
    .filter((item) => item.value.length > 0);
}

function formatMembershipRole(role: string | null | undefined): string | null {
  if (!role) return null;
  const normalized = role.trim().toLowerCase();
  if (!normalized) return null;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatMeshAccountRole(role: string | null | undefined): string | null {
  const normalized = role?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "both") return "Buyer + Partner account";
  if (normalized === "buyer" || normalized === "user") return "Buyer account";
  if (
    normalized === "partner"
    || normalized === "supplier"
    || normalized === "carrier"
    || normalized === "broker"
    || normalized === "service_provider"
  ) {
    return "Partner account";
  }
  if (normalized === "platform") return "Platform account";
  return `${formatMembershipRole(normalized)} account`;
}

function meshAccountName(candidate: DiscoveryCandidate): string {
  return candidate.tenantName || candidate.networkAccountName || candidate.workspaceName || candidate.workspaceCode;
}

function meshAccountCode(candidate: DiscoveryCandidate): string | null {
  return firstNetworkAccountCode(candidate.networkAccountCode, candidate.workspaceCode, candidate.tenantCode);
}

function meshAccountRole(candidate: DiscoveryCandidate): string | null {
  return candidate.networkRelationshipType
    ?? normalizeMeshRole(candidate.networkAccountRole)
    ?? membershipRoleFromCode(candidate.networkAccountCode ?? candidate.workspaceCode);
}

function meshRememberedAccountName(organization: RememberedOrganization): string {
  return organization.displayName || organization.tenantName || organization.networkAccountName || organization.organizationCode || organization.tenantCode;
}

function meshRememberedAccountCode(organization: RememberedOrganization): string | null {
  return firstNetworkAccountCode(organization.networkAccountCode, organization.organizationCode, organization.tenantCode);
}

function meshRememberedAccountRole(organization: RememberedOrganization): string | null {
  return organization.networkRelationshipType
    ?? normalizeMeshRole(organization.networkAccountRole)
    ?? membershipRoleFromCode(organization.networkAccountCode ?? organization.organizationCode);
}

function normalizeMeshRole(role: string | null | undefined): string | null {
  const normalized = role?.trim().toLowerCase();
  if (!normalized) return null;
  if (["account_owner", "account_admin", "account_user"].includes(normalized)) return null;
  return normalized;
}

function firstNetworkAccountCode(...values: Array<string | null | undefined>): string | null {
  const normalized = values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return normalized.find((value) => /^BNA-\d{10}$/i.test(value)) ?? normalized[0] ?? null;
}

function membershipRoleFromCode(code: string | null | undefined): string | null {
  const normalized = code?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.endsWith("-partner")) return "partner";
  if (normalized.endsWith("-buyer")) return "buyer";
  return null;
}

function candidateOrganizationName(candidate: DiscoveryCandidate): string {
  return candidate.workspaceName || candidate.tenantName;
}

function candidateOrganizationSubtitle(candidate: DiscoveryCandidate): string {
  return candidate.workspaceSubtitle || candidate.authMethodLabel;
}

function rememberedOrganizationKey(organization: RememberedOrganization): string {
  const base = organization.organizationKey || organization.workspaceKey || `${organization.tenantCode}:${organization.loginUrl}`;
  const loginHint = normalizeStoredLoginHint(organization.loginHint);
  return loginHint ? `${base}:${loginHint}` : base;
}

function rememberedOrganizationDedupeKey(organization: RememberedOrganization): string {
  const loginHint = normalizeStoredLoginHint(organization.loginHint) ?? "";
  return [
    organization.tenantCode.trim().toLowerCase(),
    organization.displayName.trim().toLowerCase(),
    loginHint,
    organization.loginUrl,
  ].join(":");
}

function clearRememberedOrganizations(plane: PlaneKey) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(rememberedKey(plane));
    window.localStorage.removeItem(legacyRememberedKey(plane));
  } catch {
    // Ignore unavailable browser storage.
  }
}

function rememberedKey(plane: PlaneKey): string {
  return `${plane}.remembered_organizations`;
}

function legacyRememberedKey(plane: PlaneKey): string {
  return `${plane}.remembered_workspaces`;
}

function safeRememberedLoginUrl(value: string): string {
  try {
    const url = new URL(value, "https://local.invalid");
    for (const param of SENSITIVE_LOGIN_QUERY_PARAMS) {
      url.searchParams.delete(param);
    }
    const next = `${url.pathname}${url.search}${url.hash}`;
    return next || value;
  } catch {
    return value;
  }
}

function rememberedLoginRequestBody(
  plane: PlaneKey,
  organization: RememberedOrganization,
  finalDestination: string,
  realm: string,
): Record<string, string> {
  const hint = normalizeStoredLoginHint(organization.loginHint);
  const body: Record<string, string> = {
    action: "remembered-login",
    realm,
    returnUrl: finalDestination,
    loginHint: hint ?? "",
    selected_tenant_id: organization.tenantId ?? "",
    selected_tenant: organization.tenantCode,
  };

  if (plane !== "mesh" || hasMeshAccountContext(organization)) {
    body.selected_org = organization.organizationCode ?? "";
    body.selected_org_name = organization.displayName;
    body.selected_workspace_id = organization.organizationId ?? "";
    body.selected_workspace_type = organization.organizationType ?? "";
    body.selected_role = meshRememberedAccountRole(organization) ?? "";
  }
  return body;
}

function hasMeshAccountContext(organization: RememberedOrganization): boolean {
  return organization.organizationType === "network_account"
    || Boolean(organization.networkAccountId || organization.networkAccountCode || organization.networkAccountRole);
}

function normalizeStoredLoginHint(value: string | null | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized && isValidIdentifier(normalized) ? normalized : undefined;
}

function isValidIdentifier(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized || /\s/.test(normalized) || normalized.length > 320) return false;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return true;
  if (normalized.includes("@") || normalized.length > 128) return false;
  return /^[a-z0-9._-]+$/.test(normalized);
}

function maskEmail(value: string): string {
  const [local = "", domain = ""] = value.split("@");
  if (!local || !domain) return "your email";
  const visible = local.length <= 2 ? local[0] ?? "" : `${local[0]}${local.slice(-1)}`;
  return `${visible}${"*".repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

function maskIdentifier(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return maskEmail(normalized);
  if (!normalized) return "your sign-in";
  if (normalized.length <= 2) return `${normalized[0] ?? ""}*`;
  return `${normalized[0]}${"*".repeat(Math.min(6, normalized.length - 2))}${normalized.slice(-1)}`;
}

function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function relativeTime(value: number): string {
  const deltaMs = Date.now() - value;
  const minutes = Math.max(1, Math.floor(deltaMs / 60_000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(1, Math.floor(seconds));
  if (safeSeconds < 60) return `${safeSeconds} second${safeSeconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(safeSeconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M4 4h16v16H4z" />
      <path d="m22 6-10 7L2 6" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
