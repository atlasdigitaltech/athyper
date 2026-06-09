"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlaneKey } from "@athyper/session-plane";
import { getPlaneConfig } from "@athyper/session-plane";

import {
  AuthCard,
  AuthShell,
  ErrorBanner,
  LoadingState,
  SecondaryAction,
  TextLinkButton,
} from "./components";
import { getLastContext, setLastContext } from "./context-storage";
import { csrfHeaders } from "./csrf";
import { authErrorFromResponse, authErrorMessageFromSearch } from "./errors";
import {
  groupByTenant,
  type OrgEntry,
  toOrgEntries,
} from "./org";
import type { BrowserLocationSnapshot, PublicSession } from "./types";
import {
  currentPathWithSearch,
  readFinalDestinationFromSearch,
} from "./url";
import {
  getWorkbenchDescription,
  getDefaultWorkbenchForPlane,
  getWorkbenchLabel,
} from "./workbench";

export function ContextSelectClient({ plane }: { plane: PlaneKey }) {
  const config = getPlaneConfig(plane);
  const [location, setLocation] = useState<BrowserLocationSnapshot | null>(null);
  const [session, setSession] = useState<PublicSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrg, setSelectedOrg] = useState<OrgEntry | null>(null);
  const [activating, setActivating] = useState<string | null>(null);
  const autoActivatedRef = useRef(false);

  useEffect(() => {
    setLocation({
      pathname: window.location.pathname,
      search: window.location.search,
    });
  }, []);

  const finalDestination = useMemo(() => {
    if (!location) return config.defaultPath;
    return readFinalDestinationFromSearch(location.search, config.defaultPath);
  }, [config.defaultPath, location]);

  const workbenchFilter = useMemo(() => {
    if (!location) return null;
    const raw = new URLSearchParams(location.search).get("filter");
    return raw === "user" || raw === "partner" || raw === "admin" ? raw : null;
  }, [location]);

  const pageError = useMemo(() => {
    if (!location) return null;
    return authErrorMessageFromSearch(new URLSearchParams(location.search));
  }, [location]);

  const activate = useCallback(
    async (org: OrgEntry, workbench: string) => {
      const key = `${org.alias}:${workbench}`;
      setActivating(key);
      setError(null);
      try {
        const res = await fetch("/api/auth/session", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...csrfHeaders(plane) },
          body: JSON.stringify({ org: org.alias, workbench }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
            message?: string;
            requestId?: string;
          };
          throw new Error(authErrorFromResponse(body));
        }
        setLastContext(plane, org.alias, workbench);
        window.location.replace(finalDestination);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to activate context.");
        setActivating(null);
      }
    },
    [finalDestination, plane],
  );

  useEffect(() => {
    if (!location) return;
    const currentLocation = location;
    const controller = new AbortController();

    async function loadSession() {
      try {
        const res = await fetch("/api/auth/session", { signal: controller.signal });
        if (!res.ok) {
          const loginUrl = new URL(config.loginPath, window.location.origin);
          loginUrl.searchParams.set("returnUrl", finalDestination);
          const body = (await res.json().catch(() => ({}))) as { error?: string; requestId?: string };
          if (body.error) loginUrl.searchParams.set("error", body.error);
          if (body.requestId) loginUrl.searchParams.set("ref", body.requestId);
          window.location.replace(loginUrl.toString());
          return;
        }
        const data = (await res.json()) as PublicSession | {
          authenticated?: false;
          error?: string;
          message?: string;
          requestId?: string;
        };
        if (!("authenticated" in data) || data.authenticated !== true) {
          const loginUrl = new URL(config.loginPath, window.location.origin);
          loginUrl.searchParams.set("returnUrl", finalDestination);
          if (data.error) loginUrl.searchParams.set("error", data.error);
          if (data.requestId) loginUrl.searchParams.set("ref", data.requestId);
          window.location.replace(loginUrl.toString());
          return;
        }

        if (data.mfaRequired && !data.mfaVerified) {
          const mfaUrl = new URL("/mfa/challenge", window.location.origin);
          mfaUrl.searchParams.set("returnUrl", currentPathWithSearch(currentLocation));
          window.location.replace(mfaUrl.toString());
          return;
        }

        setSession(data);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Unable to load the current session. Please try again.");
      }
    }

    void loadSession();
    return () => controller.abort();
  }, [config.loginPath, finalDestination, location]);

  const entries = useMemo(() => {
    if (!session) return [];
    const preferred = workbenchFilter ?? getDefaultWorkbenchForPlane(plane);
    const preferredEntries = toOrgEntries(session.organizations ?? {}, preferred);
    if (preferredEntries.length > 0 || workbenchFilter) return preferredEntries;
    return toOrgEntries(session.organizations ?? {}, null);
  }, [plane, session, workbenchFilter]);

  useEffect(() => {
    if (!session || autoActivatedRef.current || entries.length === 0) return;
    autoActivatedRef.current = true;

    const last = getLastContext(plane);
    if (last) {
      const match = entries.find((entry) => entry.alias === last.org);
      if (match?.workbenches.includes(last.workbench)) {
        void activate(match, last.workbench);
        return;
      }
    }

    const onlyEntry = entries.length === 1 ? entries[0] : undefined;
    if (onlyEntry && onlyEntry.workbenches.length === 1) {
      void activate(onlyEntry, onlyEntry.workbenches[0]!);
      return;
    }
    if (onlyEntry) {
      setSelectedOrg(onlyEntry);
    }
  }, [activate, entries, plane, session]);

  if (!location || (!session && !error && !pageError)) {
    return <LoadingState plane={plane} message="Loading session..." />;
  }

  const groups = groupByTenant(entries);

  return (
    <AuthShell
      footer={session ? (
        <ContextFooter
          onClearStaleSession={() => {
            window.location.href = config.logoutPath;
          }}
        />
      ) : undefined}
      plane={plane}
      title={selectedOrg ? "Choose access" : contextSelectTitle(plane)}
      subtitle={
        selectedOrg
          ? `Select how to enter ${selectedOrg.name}.`
          : session
            ? `Identity verified - ${identityLabel(session)}`
            : contextSelectSubtitle(plane)
      }
      variant={plane === "neon" ? "brand" : "compact"}
    >
      <div className="space-y-5">
        <ErrorBanner message={error ?? pageError} />
        {session && !error && entries.length === 0 ? (
          <AuthCard>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>No available context was found for this app.</p>
              <SecondaryAction href={config.logoutPath}>Sign out</SecondaryAction>
            </div>
          </AuthCard>
        ) : null}
        {session && !error && entries.length > 0 ? (
          selectedOrg ? (
            <WorkbenchPicker
              activating={activating}
              onBack={entries.length > 1 ? () => setSelectedOrg(null) : undefined}
              onSelect={(workbench) => void activate(selectedOrg, workbench)}
              org={selectedOrg}
              plane={plane}
            />
          ) : (
            <OrgPicker
              activating={activating}
              groups={groups}
              identity={identityLabel(session)}
              onDifferentSignIn={() => {
                window.location.href = config.logoutPath;
              }}
              onSelect={(org) => {
                if (org.workbenches.length === 1) {
                  void activate(org, org.workbenches[0]!);
                } else {
                  setSelectedOrg(org);
                }
              }}
              plane={plane}
            />
          )
        ) : null}
      </div>
    </AuthShell>
  );
}

function OrgPicker({
  activating,
  groups,
  identity,
  onDifferentSignIn,
  onSelect,
  plane,
}: {
  activating: string | null;
  groups: ReturnType<typeof groupByTenant>;
  identity: string;
  onDifferentSignIn: () => void;
  onSelect: (org: OrgEntry) => void;
  plane: PlaneKey;
}) {
  const orgs = groups.flatMap((group) => group.orgs);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <CheckIcon className="h-3.5 w-3.5 text-emerald-600" />
          <span>Identity verified - {identity}</span>
        </p>
        <p className="text-sm text-muted-foreground">{contextChoiceCopy(plane)}</p>
      </div>
      <div className="max-h-[52vh] space-y-2 overflow-y-auto overscroll-contain pr-1">
        {orgs.map((org) => (
          <button
            className="group flex w-full items-start gap-3 rounded-md bg-muted px-3 py-3 text-left transition-colors hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={activating !== null}
            key={org.alias}
            onClick={() => onSelect(org)}
            type="button"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-sm font-medium text-primary">
              {initials(org.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {activating?.startsWith(`${org.alias}:`) ? "Activating..." : org.name}
              </span>
              <span className="mt-1 grid gap-0.5 text-xs text-muted-foreground">
                {orgDetails(plane, org).map((detail) => (
                  <span className="block truncate" key={detail.label}>{detail.label}: {detail.value}</span>
                ))}
              </span>
            </span>
            <ChevronRightIcon className="mt-2 h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </div>
      <div className="flex justify-center">
        <TextLinkButton disabled={activating !== null} onClick={onDifferentSignIn}>
          Use a different sign-in
        </TextLinkButton>
      </div>
    </div>
  );
}

function WorkbenchPicker({
  activating,
  onBack,
  onSelect,
  org,
  plane,
}: {
  activating: string | null;
  onBack?: () => void;
  onSelect: (workbench: string) => void;
  org: OrgEntry;
  plane: PlaneKey;
}) {
  return (
    <div className="space-y-3">
      {onBack ? <TextLinkButton onClick={onBack}>Back to contexts</TextLinkButton> : null}
      <AuthCard>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground">
            {initials(org.name)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{org.name}</p>
            <p className="truncate text-xs text-muted-foreground">{org.alias}</p>
          </div>
        </div>
      </AuthCard>
      <div className="grid gap-2">
        {org.workbenches.map((workbench) => (
          <button
            className="group flex w-full items-center justify-between gap-3 rounded-lg border bg-card px-3 py-3 text-left text-card-foreground transition-colors hover:border-ring hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            disabled={activating !== null}
            key={workbench}
            onClick={() => onSelect(workbench)}
            type="button"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium group-hover:text-foreground">
                {activating === `${org.alias}:${workbench}` ? "Activating..." : getWorkbenchLabel(workbench, plane)}
              </span>
              <span className="block text-xs leading-5 text-muted-foreground">
                {getWorkbenchDescription(workbench, plane)}
              </span>
            </span>
            <span className="text-sm text-muted-foreground group-hover:text-foreground">Open</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ContextFooter({
  onClearStaleSession,
}: {
  onClearStaleSession: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs leading-none text-muted-foreground/60">
      <span>&copy; {new Date().getFullYear()} athyper. All rights reserved.</span>
      <button
        className="transition-colors hover:text-foreground disabled:opacity-50"
        onClick={onClearStaleSession}
        type="button"
      >
        Clear stale session
      </button>
    </div>
  );
}

function contextSelectTitle(plane: PlaneKey): string {
  return plane === "mesh" ? "Choose your network account" : "Choose your organization";
}

function contextSelectSubtitle(plane: PlaneKey): string {
  return plane === "mesh" ? "Choose a verified network account" : "Choose a verified organization";
}

function contextChoiceCopy(plane: PlaneKey): string {
  if (plane === "mesh") return "Choose the network account you want to sign in with.";
  return "Choose the organization you want to sign in with.";
}

function identityLabel(session: PublicSession): string {
  return session.username || session.email || session.displayName;
}

function orgDetails(
  plane: PlaneKey,
  org: OrgEntry,
): Array<{ label: string; value: string }> {
  if (plane === "mesh") {
    return compactDetails([
      ["Network Account Code", org.entity],
      ["Role", org.workbenches.map((workbench) => getWorkbenchLabel(workbench, plane)).join(" / ")],
    ]);
  }

  if (plane === "admin") {
    return compactDetails([
      ["Tenant", tenantDisplayName(org)],
      ["Administration Context", org.entityName],
    ]);
  }

  return compactDetails([
    ["Tenant", tenantDisplayName(org)],
    ["Organization / Legal Entity", org.entityName],
  ]);
}

function compactDetails(items: Array<[string, string | null | undefined]>): Array<{ label: string; value: string }> {
  return items
    .map(([label, value]) => ({ label, value: typeof value === "string" ? value.trim() : "" }))
    .filter((item) => item.value.length > 0);
}

function tenantDisplayName(org: OrgEntry): string {
  return org.tenantName ?? org.tenant.toUpperCase();
}

function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="m9 18 6-6-6-6" />
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
