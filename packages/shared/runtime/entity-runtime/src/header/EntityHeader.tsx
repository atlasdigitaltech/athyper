"use client";

/**
 * EntityHeader — model-driven header for create, view, and edit surfaces.
 *
 * Priority rows (rendered only when the model field is present):
 *   P1    EntityIdentityBar + EntityActionBar + mode toggle  (always)
 *   ext   extensionSlot                                       (always when present)
 *   P1.5  EntityExceptionStrip                               (always when present)
 *   P2    EntityFactRail                                     (expanded + collapsed summary)
 *   P3+P4 EntityProgressRow (statuses + progress inline)    (expanded only)
 *   P3    EntityStatusStrip compact                          (collapsed only)
 *   audit meta                                               (expanded only)
 *   P5    EntityTabBar                                       (always when present)
 *
 * Pinned mode shows only: P1 + ext + compact P3 + P5.
 *
 * Sticky ownership: EntityWorkspaceShell provides the scroll container.
 * This component applies sticky top-0 z-30 only when mode === "pinned".
 */

import { type ReactNode, useState } from "react";
import { ChevronDown, ChevronUp, Pin } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import type { EntityHeaderModel, HeaderMode } from "./types";
import { useRailState } from "./hooks/useRailState";
import { EntityIdentityBar } from "./atoms/EntityIdentityBar";
import { EntityActionBar } from "./atoms/EntityActionBar";
import { EntityExceptionStrip } from "./atoms/EntityExceptionStrip";
import { EntityFactRail } from "./atoms/EntityFactRail";
import { EntityProgressRow } from "./atoms/EntityProgressRow";
import { EntityStatusStrip } from "./atoms/EntityStatusStrip";
import { EntityTabBar } from "./atoms/EntityTabBar";

export interface EntityHeaderProps {
  model: EntityHeaderModel;
  mode?: HeaderMode;
  onModeChange?: (mode: HeaderMode) => void;
  onAction?: (id: string) => void;
  onBack?: () => void;
  /**
   * When provided, the type chip renders as a button calling this handler
   * instead of a Link. Wire through guardNavigate on edit pages.
   */
  onTypeClick?: () => void;
  activeTab?: string;
  onTabChange?: (id: string) => void;
  /** Arbitrary content rendered below the identity bar — visible in all modes. */
  extensionSlot?: ReactNode;
  className?: string;
}

// ── Mode toggle — header infrastructure, not a model-driven atom ──────────

function ModeToggle({ mode, onChange }: { mode: HeaderMode; onChange: (m: HeaderMode) => void }) {
  const isCollapsed = mode === "collapsed";
  const isPinned    = mode === "pinned";
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        title={isCollapsed ? "Expand header" : "Collapse header"}
        onClick={() => onChange(isCollapsed ? "expanded" : "collapsed")}
        className="w-[28px] h-[28px] rounded-md border border-border bg-card flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        {isCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        title={isPinned ? "Unpin header" : "Pin header"}
        onClick={() => onChange(isPinned ? "expanded" : "pinned")}
        className={cn(
          "w-[28px] h-[28px] rounded-md border flex items-center justify-center transition-colors",
          isPinned
            ? "border-foreground bg-foreground text-background"
            : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <Pin className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Audit meta bar ────────────────────────────────────────────────────────

function AuditBar({ audit }: { audit: NonNullable<EntityHeaderModel["audit"]> }) {
  const parts: string[] = [];
  if (audit.createdAt)       parts.push(`Created ${audit.createdAt}${audit.createdBy ? ` · ${audit.createdBy}` : ""}`);
  if (audit.updatedAt)       parts.push(`Updated ${audit.updatedAt}${audit.updatedBy ? ` · ${audit.updatedBy}` : ""}`);
  if (audit.statusChangedAt) parts.push(`Status ${audit.statusChangedAt}${audit.statusChangedBy ? ` · ${audit.statusChangedBy}` : ""}`);
  if (parts.length === 0) return null;
  return (
    <div className="border-t border-dashed border-border/40 px-4 py-[7px] sm:px-5 lg:px-[22px]">
      <p className="text-2xs text-muted-foreground/55 leading-none tracking-[0.01em]">
        {parts.join("   ·   ")}
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export function EntityHeader({
  model,
  mode: initialMode = "expanded",
  onModeChange,
  onAction,
  onBack,
  onTypeClick,
  activeTab,
  onTabChange,
  extensionSlot,
  className,
}: EntityHeaderProps) {
  const [mode, setMode] = useState<HeaderMode>(initialMode);
  const handleMode = (m: HeaderMode) => { setMode(m); onModeChange?.(m); };
  const isPinned   = mode === "pinned";
  const isExpanded = mode === "expanded";

  const rail = useRailState(model.progress);

  // Mode controls (collapse/pin) are only meaningful when collapsible content exists.
  // A header with no facts and no audit has nothing to collapse.
  const hasExpandableContent = !!(model.facts?.length || model.audit);

  const actionsSlot = (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      <EntityActionBar actions={model.actions} onAction={onAction} />
      {model.actions.length > 0 && hasExpandableContent && (
        <span className="w-px h-5 bg-border/60 self-center shrink-0" />
      )}
      {hasExpandableContent && <ModeToggle mode={mode} onChange={handleMode} />}
    </div>
  );

  // Pinned: sticky strip — P1 + ext + compact P3 + P5 only
  if (isPinned) {
    return (
      <div className={cn(
        "sticky top-0 z-30 overflow-hidden rounded-xl border bg-card shadow-sm",
        className,
      )}>
        <EntityIdentityBar identity={model.identity} onBack={onBack} onTypeClick={onTypeClick} actionsSlot={actionsSlot} />
        {extensionSlot && (
          <div className="border-t border-border/60 px-4 py-2 sm:px-5 lg:px-[22px]">
            {extensionSlot}
          </div>
        )}
        {(model.statuses?.length ?? 0) > 0 && (
          <div className="border-t border-border px-4 py-2 sm:px-5 lg:px-[22px]">
            <EntityStatusStrip statuses={model.statuses!} compact />
          </div>
        )}
        {(model.tabs?.length ?? 0) > 0 && (
          <EntityTabBar tabs={model.tabs!} activeTab={activeTab} onTabChange={onTabChange} />
        )}
      </div>
    );
  }

  // Expanded + Collapsed:
  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card shadow-sm", className)}>
      {/* P1 — always visible */}
      <EntityIdentityBar identity={model.identity} onBack={onBack} actionsSlot={actionsSlot} />

      {/* Extension slot — always visible when present */}
      {extensionSlot && (
        <div className="border-t border-border/60 px-4 py-2 sm:px-5 lg:px-[22px]">
          {extensionSlot}
        </div>
      )}

      {/* P1.5 — always visible when present */}
      {(model.exceptions?.length ?? 0) > 0 && (
        <div className="border-t border-border/60 px-4 py-3 sm:px-5 lg:px-[22px]">
          <EntityExceptionStrip exceptions={model.exceptions!} />
        </div>
      )}

      {/* P2 — facts; collapsed shows hero cell summary */}
      {(model.facts?.length ?? 0) > 0 && (
        <EntityFactRail facts={model.facts!} mode={mode} />
      )}

      {/* P3 + P4 — expanded: full progress row with timeline toggle */}
      {isExpanded && ((model.statuses?.length ?? 0) > 0 || !!model.progress) && (
        <EntityProgressRow
          progress={model.progress}
          statuses={model.statuses}
          railExpanded={rail.expanded}
          onToggleRail={rail.toggle}
        />
      )}

      {/* P3 collapsed: compact status chips only (no timeline or progress) */}
      {!isExpanded && (model.statuses?.length ?? 0) > 0 && (
        <div className="border-t border-border px-4 py-2 sm:px-5 lg:px-[22px]">
          <EntityStatusStrip statuses={model.statuses!} compact />
        </div>
      )}

      {/* Audit meta — expanded only */}
      {isExpanded && model.audit && <AuditBar audit={model.audit} />}

      {/* P5 — tabs; always visible when present */}
      {(model.tabs?.length ?? 0) > 0 && (
        <EntityTabBar tabs={model.tabs!} activeTab={activeTab} onTabChange={onTabChange} />
      )}
    </div>
  );
}
