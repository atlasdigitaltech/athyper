"use client";

/**
 * EntitySelector — header entity switcher
 *
 * Shows the active entity as a compact badge-button.
 * On click opens a dropdown listing all accessible orgs, grouped by tenant.
 * For 5+ total orgs a search input appears.
 *
 * Adaptive behaviour (spec 4.4):
 *   1 org total  → renders only the entity badge (no dropdown trigger)
 *   2–4 orgs     → dropdown, no search
 *   5+ orgs      → dropdown with search input
 *   2+ tenants   → groups separated by tenant label
 *
 * On selection: calls SessionProvider.switchContext(org, workbench).
 * Maintains the current workbench for the new org when available;
 * falls back to the first allowed workbench of the new org.
 */

import { useEffect, useRef, useState } from "react";
import { Building2, Check, ChevronDown, Search } from "lucide-react";
import { Badge } from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import { useShellSession } from "@/components/providers/SessionProvider";

export function EntitySelector() {
  const { bff, switchContext } = useShellSession();
  const { organizations, activeOrg, activeWorkbench } = bff;

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
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

  // Group orgs by tenant (split on "--")
  const tenantGroups = new Map<string, (typeof organizations)[string][]>();
  for (const org of Object.values(organizations)) {
    const tenant = org.alias.split("--")[0] ?? org.alias;
    const bucket = tenantGroups.get(tenant) ?? [];
    bucket.push(org);
    tenantGroups.set(tenant, bucket);
  }
  const totalOrgs = Object.keys(organizations).length;
  const showSearch = totalOrgs >= 5;

  // Apply search filter
  const filteredGroups = new Map<string, (typeof organizations)[string][]>();
  for (const [tenant, orgs] of tenantGroups) {
    const q = search.toLowerCase();
    const filtered = q
      ? orgs.filter(
          (o) =>
            o.name.toLowerCase().includes(q) ||
            o.alias.toLowerCase().includes(q) ||
            tenant.toLowerCase().includes(q),
        )
      : orgs;
    if (filtered.length > 0) filteredGroups.set(tenant, filtered);
  }

  const activeOrgEntry = activeOrg ? organizations[activeOrg] : null;
  const activeEntityCode = activeOrg?.split("--")[1] ?? null;

  async function handleSelect(orgAlias: string) {
    if (switching) return;
    const org = organizations[orgAlias];
    if (!org) return;
    // Keep current workbench for new org if it's allowed, else fall back to first
    const wb =
      activeWorkbench && org.roles.includes(activeWorkbench)
        ? activeWorkbench
        : (org.roles[0] ?? "user");
    setSwitching(orgAlias);
    try {
      await switchContext(orgAlias, wb);
      setOpen(false);
      setSearch("");
    } catch {
      // Error feedback handled by parent
    } finally {
      setSwitching(null);
    }
  }

  // Single org — show read-only badge, no dropdown
  if (totalOrgs <= 1) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1">
        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
        <Badge variant="secondary" className="text-[11px]">
          {activeEntityCode ?? "—"}
        </Badge>
        {activeOrgEntry && (
          <span className="hidden max-w-[160px] truncate text-xs text-muted-foreground sm:block">
            {activeOrgEntry.name}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-2 py-1 text-sm transition-colors",
          "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          open && "bg-accent",
        )}
      >
        <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <Badge variant={activeEntityCode ? "secondary" : "outline"} className="text-[11px]">
          {activeEntityCode ?? "Select"}
        </Badge>
        {activeOrgEntry && (
          <span className="hidden max-w-[140px] truncate text-xs text-muted-foreground lg:block">
            {activeOrgEntry.name}
          </span>
        )}
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
          role="listbox"
          className={cn(
            "absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border bg-popover shadow-lg",
            "animate-in fade-in-0 zoom-in-95 duration-100",
          )}
        >
          {showSearch && (
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search entities…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          )}

          <div className="max-h-72 overflow-y-auto py-1">
            {filteredGroups.size === 0 && (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                No entities found
              </p>
            )}

            {[...filteredGroups.entries()].map(([tenant, orgs]) => (
              <div key={tenant}>
                {/* Tenant group label */}
                {tenantGroups.size > 1 && (
                  <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {tenant}
                  </p>
                )}

                {orgs.map((org) => {
                  const isActive = org.alias === activeOrg;
                  const entityCode = org.alias.split("--")[1] ?? org.alias;
                  const isLoading = switching === org.alias;

                  return (
                    <button
                      key={org.alias}
                      role="option"
                      aria-selected={isActive}
                      disabled={switching !== null}
                      onClick={() => handleSelect(org.alias)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 px-3 py-2 text-sm",
                        "transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50",
                        isActive && "bg-accent/60",
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <Badge
                          variant={isActive ? "default" : "secondary"}
                          className="shrink-0 text-[10px]"
                        >
                          {entityCode}
                        </Badge>
                        <span className="truncate text-xs text-foreground/80">
                          {org.name}
                        </span>
                      </div>

                      {isLoading ? (
                        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted border-t-primary" />
                      ) : isActive ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
