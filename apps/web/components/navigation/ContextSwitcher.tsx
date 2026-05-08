"use client";

/**
 * ContextSwitcher — sidebar-top context indicator + switcher
 *
 * Unified compact control showing the current user, entity, and workbench
 * in a single widget. Intended for placement at the top of the sidebar
 * (above SessionNav), complementing the header's EntitySelector +
 * WorkbenchToggle pair which target desktop topbar use.
 *
 * Differences from EntitySelector / WorkbenchToggle:
 *   - Designed for sidebar/vertical layout (not topbar)
 *   - Shows user identity alongside context
 *   - Combined single dropdown for both org and workbench switching
 *   - Expands to full sidebar width when sidebar is open
 */

import { useEffect, useRef, useState } from "react";
import { Building2, Check, ChevronDown, User } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { getWorkbenchLabel } from "@/lib/auth/workbench-config";
import { useShellSession } from "@/components/providers/SessionProvider";

export function ContextSwitcher() {
  const { bff, switchContext } = useShellSession();
  const { displayName, organizations, activeOrg, activeWorkbench } = bff;

  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const activeOrgEntry = activeOrg ? organizations[activeOrg] : null;
  const activeEntityCode = activeOrg?.split("--")[1] ?? activeOrg ?? null;
  const workbenchLabel = activeWorkbench ? getWorkbenchLabel(activeWorkbench) : null;

  // Avatar: first two initials of display name
  const initials = displayName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();

  async function handleOrgSelect(orgAlias: string) {
    if (switching) return;
    const org = organizations[orgAlias];
    if (!org || orgAlias === activeOrg) return;
    const wb =
      activeWorkbench && org.roles.includes(activeWorkbench)
        ? activeWorkbench
        : (org.roles[0] ?? "user");
    setSwitching(`org:${orgAlias}`);
    try {
      await switchContext(orgAlias, wb);
      setOpen(false);
    } catch {
      // leave open so the user can retry
    } finally {
      setSwitching(null);
    }
  }

  async function handleWorkbenchSelect(workbench: string) {
    if (switching || !activeOrg || workbench === activeWorkbench) return;
    setSwitching(`wb:${workbench}`);
    try {
      await switchContext(activeOrg, workbench);
      setOpen(false);
    } catch {
      // leave open
    } finally {
      setSwitching(null);
    }
  }

  const activeOrgWorkbenches = activeOrg ? (organizations[activeOrg]?.roles ?? []) : [];
  const allOrgs = Object.values(organizations);

  return (
    <div className="relative w-full" ref={panelRef}>
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors",
          "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          open && "bg-accent",
        )}
      >
        {/* Avatar */}
        <span
          aria-hidden
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-doc-subtitle font-semibold text-primary"
        >
          {initials || <User className="h-3.5 w-3.5" />}
        </span>

        {/* Identity + context */}
        <div className="flex min-w-0 flex-1 flex-col items-start">
          <span className="max-w-full truncate text-xs font-medium leading-tight text-foreground">
            {activeOrgEntry?.name ?? displayName}
          </span>
          <span className="max-w-full truncate text-doc-support leading-tight text-muted-foreground">
            {activeEntityCode && workbenchLabel
              ? `${activeEntityCode} · ${workbenchLabel}`
              : (activeEntityCode ?? workbenchLabel ?? "No context")}
          </span>
        </div>

        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Switch context"
          className={cn(
            "absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border bg-popover shadow-lg",
            "animate-in fade-in-0 zoom-in-95 duration-100",
          )}
        >
          {/* Org list */}
          {allOrgs.length > 1 && (
            <section>
              <p className="px-3 pb-1 pt-2.5 text-doc-support font-semibold uppercase tracking-widest text-muted-foreground">
                Entity
              </p>
              {allOrgs.map((org) => {
                const isActive = org.alias === activeOrg;
                const entityCode = org.alias.split("--")[1] ?? org.alias;
                const isLoading = switching === `org:${org.alias}`;

                return (
                  <button
                    key={org.alias}
                    disabled={switching !== null}
                    onClick={() => handleOrgSelect(org.alias)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-sm",
                      "transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50",
                      isActive && "bg-accent/60",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <div className="flex min-w-0 flex-col items-start">
                        <span className="truncate text-xs font-medium">{org.name}</span>
                        <span className="text-doc-support text-muted-foreground">{entityCode}</span>
                      </div>
                    </div>
                    {isLoading ? (
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted border-t-primary" />
                    ) : isActive ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                    ) : null}
                  </button>
                );
              })}
            </section>
          )}

          {/* Workbench list — only when 2+ roles available for active org */}
          {activeOrgWorkbenches.length >= 2 && (
            <>
              {allOrgs.length > 1 && <div className="mx-3 my-1 border-t" />}
              <section className="pb-1">
                <p className="px-3 pb-1 pt-2 text-doc-support font-semibold uppercase tracking-widest text-muted-foreground">
                  Workbench
                </p>
                {activeOrgWorkbenches.map((role) => {
                  const isActive = role === activeWorkbench;
                  const isLoading = switching === `wb:${role}`;
                  return (
                    <button
                      key={role}
                      disabled={switching !== null}
                      onClick={() => handleWorkbenchSelect(role)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-sm",
                        "transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50",
                        isActive && "bg-accent/60",
                      )}
                    >
                      <span className="text-xs">{getWorkbenchLabel(role)}</span>
                      {isLoading ? (
                        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted border-t-primary" />
                      ) : isActive ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                      ) : null}
                    </button>
                  );
                })}
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
