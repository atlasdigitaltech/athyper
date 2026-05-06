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
import { cn } from "@athyper/theme/utils";
import type { EntityHeaderModel, HeaderMode } from "./types";
import { useRailState } from "./hooks/useRailState";
import { EntityIdentityBar } from "./atoms/EntityIdentityBar";
import { EntityActionBar } from "./atoms/EntityActionBar";
import { EntityExceptionStrip } from "./atoms/EntityExceptionStrip";
import { EntityFactRail } from "./atoms/EntityFactRail";
import { EntityProgressRow } from "./atoms/EntityProgressRow";
import { EntityStatusStrip } from "./atoms/EntityStatusStrip";
import { EntityTabBar, type PlatformPanelIcon } from "./atoms/EntityTabBar";

export interface EntityHeaderProps {
  model: EntityHeaderModel;
  mode?: HeaderMode;
  onModeChange?: (mode: HeaderMode) => void;
  /** When true, renders edit-mode chrome: accent bar, ring, and "Editing" badge. */
  editMode?: boolean;
  onAction?: (id: string) => void;
  onBack?: () => void;
  /**
   * When provided, the type chip renders as a button calling this handler
   * instead of a Link. Wire through guardNavigate on edit pages.
   */
  onTypeClick?: () => void;
  activeTab?: string;
  onTabChange?: (id: string) => void;
  /** Platform context panel icons (Comments, Attachments, Activity) rendered in the tab bar. */
  platformIcons?: PlatformPanelIcon[];
  onPlatformIconClick?: (id: string) => void;
  activePlatformIcon?: string;
  /** Arbitrary content rendered below the identity bar — visible in all modes. */
  extensionSlot?: ReactNode;
  className?: string;
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
  editMode = false,
  onAction,
  onBack,
  onTypeClick,
  activeTab,
  onTabChange,
  platformIcons,
  onPlatformIconClick,
  activePlatformIcon,
  extensionSlot,
  className,
}: EntityHeaderProps) {
  const [mode, setMode] = useState<HeaderMode>(initialMode);
  const handleMode = (m: HeaderMode) => { setMode(m); onModeChange?.(m); };
  const isPinned   = mode === "pinned";
  const isExpanded = mode === "expanded";

  const rail = useRailState(model.progress);

  const xlFact = model.facts?.find((f) => f.xl);
  const amountSummary = xlFact
    ? { label: xlFact.label, amount: xlFact.value, currency: xlFact.currency, subtext: xlFact.subValue }
    : undefined;
  const nonXlFacts = model.facts?.filter((f) => !f.xl) ?? [];

  const actionsSlot       = <EntityActionBar actions={model.actions} onAction={onAction} />;
  // compact variant for mobile row 1: primary actions + ⋯ icon overflow
  const mobileActionsSlot = <EntityActionBar actions={model.actions} onAction={onAction} compact />;

  // Pinned: sticky strip — P1 + ext + compact P3 + P5 only
  if (isPinned) {
    return (
      <div className={cn(
        "sticky top-0 z-30 overflow-hidden rounded-xl border bg-card shadow-sm",
        editMode && "ring-1 ring-inset ring-primary/30",
        className,
      )}>
        {editMode && <div className="h-[2px] bg-primary/70" />}
        <EntityIdentityBar identity={model.identity} onBack={onBack} onTypeClick={onTypeClick} actionsSlot={actionsSlot} mobileActionsSlot={mobileActionsSlot} amountSummary={amountSummary} editMode={editMode} />
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
        {((model.tabs?.length ?? 0) > 0 || (platformIcons?.length ?? 0) > 0) && (
          <EntityTabBar
            tabs={model.tabs ?? []}
            activeTab={activeTab}
            onTabChange={onTabChange}
            platformIcons={platformIcons}
            onPlatformIconClick={onPlatformIconClick}
            activePlatformIcon={activePlatformIcon}
          />
        )}
      </div>
    );
  }

  // Expanded + Collapsed:
  return (
    <div className={cn(
      "overflow-hidden rounded-xl border bg-card shadow-sm",
      editMode && "ring-1 ring-inset ring-primary/30",
      className,
    )}>
      {editMode && <div className="h-[2px] bg-primary/70" />}
      {/* P1 — always visible */}
      <EntityIdentityBar identity={model.identity} onBack={onBack} onTypeClick={onTypeClick} actionsSlot={actionsSlot} mobileActionsSlot={mobileActionsSlot} amountSummary={amountSummary} editMode={editMode} />

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

      {/* P2 — non-xl facts (xl/total is now in the identity bar). */}
      {nonXlFacts.length > 0 && (
        <EntityFactRail facts={nonXlFacts} mode={mode} />
      )}

      {/* Audit meta — expanded only */}
      {isExpanded && model.audit && <AuditBar audit={model.audit} />}

      {/* P5 — tabs + platform icons; always visible when either is present */}
      {((model.tabs?.length ?? 0) > 0 || (platformIcons?.length ?? 0) > 0) && (
        <EntityTabBar
          tabs={model.tabs ?? []}
          activeTab={activeTab}
          onTabChange={onTabChange}
          platformIcons={platformIcons}
          onPlatformIconClick={onPlatformIconClick}
          activePlatformIcon={activePlatformIcon}
        />
      )}

      {/* P3 + P4 — workflow/progress below tabs; expanded only; collapsible */}
      {isExpanded && ((model.statuses?.length ?? 0) > 0 || !!model.progress) && (
        <EntityProgressRow
          progress={model.progress}
          statuses={model.statuses}
          railExpanded={rail.expanded}
          onToggleRail={rail.toggle}
        />
      )}
    </div>
  );
}
