"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Search } from "lucide-react";
import type { PlaneKey } from "@athyper/platform-iam-session-plane";
import type { OrgOption, ScopeSwitchStatus } from "@athyper/shell-runtime";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@athyper/platform-ui/primitives";

// Search box appears once the list gets long enough that scanning wins over glancing.
const SEARCH_THRESHOLD = 5;

interface SubjectCopy {
  singular: string;
  plural: string;
  helper: string;
}

const SUBJECT_COPY: Record<PlaneKey, SubjectCopy> = {
  neon: {
    singular: "Legal entity",
    plural: "Legal entities",
    helper: "Switch the entity you're working in. Data you view and post will follow this scope.",
  },
  mesh: {
    singular: "Partner",
    plural: "Partners",
    helper: "Switch the partner network account you're collaborating from.",
  },
  admin: {
    singular: "Tenant",
    plural: "Tenants",
    helper: "Switch the tenant you're administering.",
  },
};

export interface ScopeSwitcherProps {
  plane: PlaneKey;
  activeName: string | null;
  activeAlias: string | null;
  organizations: readonly OrgOption[];
  status: ScopeSwitchStatus;
  errorMessage: string | null;
  onSelect: (alias: string, workbench: string) => void;
  onOpenFullPicker?: (alias: string) => void;
  /** Increments when another shell control should open this switcher. */
  openRequest?: number;
}

export function ScopeSwitcher({
  plane,
  activeName,
  activeAlias,
  organizations,
  status,
  errorMessage,
  onSelect,
  onOpenFullPicker,
  openRequest,
}: ScopeSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);

  const hasChoices = organizations.length > 1;
  const subject = SUBJECT_COPY[plane];
  const subjectLower = subject.singular.toLowerCase();
  const subjectPluralLower = subject.plural.toLowerCase();
  const activeOrg = useMemo(
    () => organizations.find((org) => org.alias === activeAlias) ?? null,
    [organizations, activeAlias],
  );
  const activeLogoName = activeOrg?.legalEntityName ?? activeName ?? "";

  const filtered = useMemo(() => {
    if (!query.trim()) return organizations;
    const needle = query.trim().toLowerCase();
    return organizations.filter((org) => (
      org.legalEntityName.toLowerCase().includes(needle)
      || org.name.toLowerCase().includes(needle)
      || org.tenantName.toLowerCase().includes(needle)
      || (org.legalEntityCode ?? "").toLowerCase().includes(needle)
      || (org.tenantCode ?? "").toLowerCase().includes(needle)
    ));
  }, [organizations, query]);

  const pinned = filtered.filter((org) => org.isActive);
  const others = filtered.filter((org) => !org.isActive);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  useEffect(() => {
    if (openRequest && openRequest > 0) setOpen(true);
  }, [openRequest]);

  useEffect(() => {
    if (!open || organizations.length < SEARCH_THRESHOLD) return;
    const raf = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open, organizations.length]);

  const handleActivate = (org: OrgOption) => {
    if (status === "switching") return;
    if (org.isActive) { setOpen(false); return; }
    if (org.workbenches.length === 1) {
      onSelect(org.alias, org.workbenches[0]!);
      return;
    }
    if (onOpenFullPicker) {
      onOpenFullPicker(org.alias);
      setOpen(false);
      return;
    }
    // Fallback: activate with the first available workbench.
    if (org.workbenches[0]) onSelect(org.alias, org.workbenches[0]);
  };

  const trigger = (
    <button
      type="button"
      className="group flex h-10 min-w-0 items-center gap-1.5 rounded-lg px-2 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
      disabled={organizations.length === 0}
      aria-label={activeLogoName ? `${subject.singular}: ${activeLogoName}. Switch ${subjectLower}.` : `Select ${subjectLower}`}
      aria-haspopup={hasChoices ? "dialog" : undefined}
      aria-expanded={hasChoices ? open : undefined}
    >
      <span className="min-w-0 max-w-[14rem] truncate text-sm font-medium text-foreground">
        {activeLogoName || `Select ${subjectLower}`}
      </span>
      {hasChoices ? (
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      ) : null}
    </button>
  );

  if (!hasChoices) {
    // Single-scope tenants get a dead chip — clean, no phantom affordance.
    return trigger;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        collisionPadding={12}
        className="flex w-[22rem] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-lg border-border p-0 shadow-lg"
        style={{ maxHeight: "min(32rem, var(--radix-popover-content-available-height, 32rem))" }}
      >
        <div className="shrink-0 border-b border-border px-3 py-3">
          <p className="text-sm font-semibold text-foreground">
            {subject.singular}
          </p>
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
            {subject.helper}
          </p>
        </div>

        {organizations.length >= SEARCH_THRESHOLD ? (
          <div className="shrink-0 border-b border-border px-3 py-2">
            <label className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 focus-within:border-ring focus-within:bg-background focus-within:ring-2 focus-within:ring-ring">
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <input
                ref={searchRef}
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Search ${subjectPluralLower}…`}
                className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
            </label>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1.5">
          {errorMessage ? (
            <div className="mx-3 mb-1.5 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {errorMessage}
            </div>
          ) : null}

          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No {subjectPluralLower} match &ldquo;{query}&rdquo;.
            </p>
          ) : null}

          {pinned.length > 0 ? (
            <OrgSection
              title="Current"
              orgs={pinned}
              status={status}
              onActivate={handleActivate}
            />
          ) : null}

          {others.length > 0 ? (
            <OrgSection
              title={pinned.length > 0 ? "Switch to" : "Available"}
              orgs={others}
              status={status}
              onActivate={handleActivate}
            />
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function OrgSection({
  title,
  orgs,
  status,
  onActivate,
}: {
  title: string;
  orgs: readonly OrgOption[];
  status: ScopeSwitchStatus;
  onActivate: (org: OrgOption) => void;
}) {
  return (
    <div className="pb-1">
      <p className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <ul className="px-1.5">
        {orgs.map((org) => (
          <li key={org.alias}>
            <button
              type="button"
              onClick={() => onActivate(org)}
              disabled={status === "switching"}
              aria-current={org.isActive ? "true" : undefined}
              className="group flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium text-foreground">
                    {org.legalEntityName}
                  </span>
                  {org.legalEntityCode ? (
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                      {org.legalEntityCode}
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {org.tenantName}
                  {org.workbenches.length > 1 ? ` · ${org.workbenches.length} workbenches` : ""}
                </span>
              </span>
              {org.isActive ? (
                <Check className="size-4 shrink-0 text-primary" aria-hidden />
              ) : status === "switching" ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
