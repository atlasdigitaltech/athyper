"use client";

/**
 * /auth/select — Entity + Workbench Selector
 *
 * Shown after successful KC authentication. Reads the user's org memberships
 * from the BFF session, groups them by tenant, and lets the user pick which
 * entity + workbench to enter.
 *
 * Adaptive behaviour:
 *   - 1 org + 1 workbench           → auto-select, no UI shown (0 clicks)
 *   - Last-used context still valid  → auto-select, no UI shown (0 clicks)
 *   - 1 org + 2+ workbenches         → show workbench picker only
 *   - 2+ orgs                        → show entity grid + workbench picker
 *
 * After selection:
 *   PATCH /api/auth/session { org, workbench } → redirect to returnUrl or /home
 */

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { NeonLogoPrimary } from "@athyper/brand";
import { AthyperLogo } from "@athyper/icons/custom/AthyperLogo";
import { Button } from "@athyper/ui/primitives";
import {
  getLastContext,
  setLastContext,
} from "@/lib/auth/context-resolver";
import {
  getWorkbenchLabel,
  getWorkbenchDescription,
  getWorkbenchDefaultRoute,
} from "@/lib/auth/workbench-config";
import { parseOrgAlias } from "@/lib/auth/parse-org-alias";
import { sanitizeReturnUrl } from "@/lib/auth/validate-return-url";
import type { OrgMembership, PublicSession } from "@/lib/auth/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OrgEntry {
  alias: string;
  name: string;
  tenant: string;
  entity: string;
  workbenches: string[];
}

interface TenantGroup {
  tenant: string;
  orgs: OrgEntry[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupByTenant(orgs: Record<string, OrgMembership>): TenantGroup[] {
  const map = new Map<string, OrgEntry[]>();
  for (const [alias, membership] of Object.entries(orgs)) {
    const { tenant, entity } = parseOrgAlias(alias);
    if (!map.has(tenant)) map.set(tenant, []);
    map.get(tenant)!.push({
      alias,
      name: membership.name,
      tenant,
      entity,
      workbenches: membership.roles,
    });
  }
  return Array.from(map.entries()).map(([tenant, orgs]) => ({ tenant, orgs }));
}

function getInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

// ─── Inner page component ─────────────────────────────────────────────────────

function SelectPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const returnUrl = sanitizeReturnUrl(params.get("returnUrl"), "/home");

  // Validate filter — only "user" | "partner" are accepted; anything else is ignored.
  const rawFilter = params.get("filter");
  const workbenchFilter: "user" | "partner" | null =
    rawFilter === "user" || rawFilter === "partner" ? rawFilter : null;

  const [session, setSession] = useState<PublicSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedOrg, setSelectedOrg] = useState<OrgEntry | null>(null);
  const [activating, setActivating] = useState<string | null>(null);

  const activate = useCallback(
    async (org: OrgEntry, workbench: string) => {
      const key = `${org.alias}:${workbench}`;
      setActivating(key);
      try {
        const res = await fetch("/api/auth/session", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ org: org.alias, workbench }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? `Session update failed (${res.status})`);
        }
        setLastContext(org.alias, workbench);
        const destination = returnUrl === "/home"
          ? getWorkbenchDefaultRoute(workbench)
          : returnUrl;
        router.replace(destination);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to activate context");
        setActivating(null);
      }
    },
    [returnUrl, router],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/auth/session");
        if (!res.ok) {
          router.replace(`/login?error=${encodeURIComponent("Session expired. Please sign in again.")}`);
          return;
        }
        const data = await res.json() as PublicSession;
        if (!data.authenticated) {
          router.replace("/login");
          return;
        }
        if (cancelled) return;

        setSession(data);

        const orgs = data.organizations ?? {};
        const allEntries: OrgEntry[] = Object.entries(orgs).map(([alias, m]) => {
          const { tenant, entity } = parseOrgAlias(alias);
          const workbenches = workbenchFilter
            ? m.roles.filter((r) => r === workbenchFilter)
            : m.roles;
          return { alias, name: m.name, tenant, entity, workbenches };
        }).filter((e) => e.workbenches.length > 0);

        if (allEntries.length === 0) {
          setError("Your account has no organisation memberships. Contact your administrator.");
          return;
        }

        // Priority 1: last-used context
        const last = getLastContext();
        if (last) {
          const match = allEntries.find((o) => o.alias === last.org);
          if (match && match.workbenches.includes(last.workbench)) {
            await activate(match, last.workbench);
            return;
          }
        }

        // Priority 2: single org + single workbench → auto-select
        const onlyEntry = allEntries.length === 1 ? allEntries[0] : undefined;
        if (onlyEntry && onlyEntry.workbenches.length === 1) {
          await activate(onlyEntry, onlyEntry.workbenches[0]!);
          return;
        }

        // Single org with multiple workbenches → skip entity grid
        if (onlyEntry) {
          setSelectedOrg(onlyEntry);
        }
      } catch {
        if (!cancelled) {
          setError("Unable to load session. Please try again.");
        }
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [activate, router]);

  if (!session && !error) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <AthyperLogo className="animate-pulse text-primary" width={40} height={40} />
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  // Apply workbenchFilter to the orgs used for rendering, mirroring the
  // auto-selection logic above so the displayed buttons match what is selectable.
  const filteredOrgs: Record<string, OrgMembership> = {};
  for (const [alias, m] of Object.entries(session?.organizations ?? {})) {
    const filteredRoles = workbenchFilter
      ? m.roles.filter((r) => r === workbenchFilter)
      : m.roles;
    if (filteredRoles.length > 0) {
      filteredOrgs[alias] = { ...m, roles: filteredRoles };
    }
  }
  const tenantGroups = session ? groupByTenant(filteredOrgs) : [];
  const allOrgs = tenantGroups.flatMap((g) => g.orgs);

  return (
    <div className="flex h-dvh">
      {/* ── Left panel — branding (lg+) ─────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-3/5 lg:h-dvh flex-col bg-primary border-r border-border text-primary-foreground">
        <div className="flex justify-center pt-10 pb-2">
          <NeonLogoPrimary className="w-[480px]" />
        </div>
        <div className="flex flex-1 flex-col justify-center px-16 pb-10">
          <div className="space-y-4">
            <p className="text-xs font-semibold tracking-widest uppercase opacity-50">Your workspace</p>
            <h3 className="text-display-auth font-bold">
              {session?.displayName ?? "Welcome back"}
            </h3>
            <p className="text-base leading-relaxed opacity-60">Choose your entity and workbench to continue.</p>
          </div>
        </div>
      </div>

      {/* ── Right panel — selector ──────────────────────────────────────── */}
      <div className="flex w-full flex-col items-center justify-center overflow-y-auto bg-background px-6 py-12 lg:w-2/5">
        <div className="w-full max-w-lg space-y-6">

          {/* Mobile logo */}
          <div className="flex items-center gap-2 lg:hidden">
            <AthyperLogo className="text-primary" width={28} height={28} />
            <span className="text-sm font-medium text-foreground">athyper</span>
          </div>

          {/* User chip */}
          {session && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {getInitial(session.displayName)}
                </div>
                <div>
                  <p className="text-sm font-medium leading-none">{session.displayName}</p>
                  <p className="text-xs text-muted-foreground">{session.email}</p>
                </div>
              </div>
              <button
                className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => router.push("/logout")}
              >
                Sign out
              </button>
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
              <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => router.replace("/login")}>
                Back to Login
              </Button>
            </div>
          )}

          {session && !error && (
            <>
              <div className="space-y-1">
                <h2 className="text-xl font-medium tracking-tight">
                  {selectedOrg ? "Choose your workbench" : "Choose your entity"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {selectedOrg
                    ? `Select how you want to access ${selectedOrg.name}`
                    : allOrgs.length === 1
                      ? "Select your workbench to continue"
                      : "Select the entity you want to work in"}
                </p>
              </div>

              {selectedOrg ? (
                <div className="space-y-3">
                  {allOrgs.length > 1 && (
                    <button
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setSelectedOrg(null)}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M15 18l-6-6 6-6"/>
                      </svg>
                      Back to entities
                    </button>
                  )}

                  <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
                      {getInitial(selectedOrg.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{selectedOrg.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{selectedOrg.alias}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {selectedOrg.workbenches.map((wb) => (
                      <button
                        key={wb}
                        className="group flex w-full items-center justify-between rounded-lg border border-border bg-background px-4 py-3 text-left transition-colors hover:border-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => void activate(selectedOrg, wb)}
                        disabled={activating !== null}
                      >
                        <div>
                          <p className="text-sm font-medium group-hover:text-primary">
                            {activating === `${selectedOrg.alias}:${wb}` ? "Activating…" : getWorkbenchLabel(wb)}
                          </p>
                          <p className="text-xs text-muted-foreground">{getWorkbenchDescription(wb)}</p>
                        </div>
                        <svg className="h-4 w-4 text-muted-foreground group-hover:text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M9 18l6-6-6-6"/>
                        </svg>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {tenantGroups.map((group) => (
                    <div key={group.tenant} className="space-y-2">
                      {tenantGroups.length > 1 && (
                        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                          {group.tenant}
                        </p>
                      )}
                      <div className="space-y-2">
                        {group.orgs.map((org) => (
                          <button
                            key={org.alias}
                            className="group flex w-full items-center gap-3 rounded-lg border border-border bg-background px-4 py-3 text-left transition-colors hover:border-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => {
                              if (org.workbenches.length === 1) {
                                void activate(org, org.workbenches[0]!);
                              } else {
                                setSelectedOrg(org);
                              }
                            }}
                            disabled={activating !== null}
                          >
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-sm font-bold text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                              {getInitial(org.name)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium group-hover:text-primary">
                                {activating?.startsWith(`${org.alias}:`) ? "Activating…" : org.name}
                              </p>
                              <p className="font-mono text-xs text-muted-foreground">{org.entity}</p>
                            </div>
                            {org.workbenches.length > 1 ? (
                              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                {org.workbenches.length} workbenches
                              </span>
                            ) : (
                              <svg className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M9 18l6-6-6-6"/>
                              </svg>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <p className="text-center text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} athyper. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SelectPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh items-center justify-center bg-background">
          <AthyperLogo className="animate-pulse text-primary" width={40} height={40} />
        </div>
      }
    >
      <SelectPageInner />
    </Suspense>
  );
}
