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
 *   P5    EntityTabBar                                       (always when present)
 *
 * Pinned mode shows only: P1 + ext + compact P3 + P5.
 *
 * Sticky ownership: EntityWorkspaceShell provides the scroll container.
 * This component applies sticky top-0 z-30 only when mode === "pinned".
 */

import { type ReactNode, useState } from "react";
import { cn } from "@athyper/theme/utils";
import { normaliseCurrencyCode } from "@athyper/runtime-shared/core";
import type { EntityHeaderModel, HeaderMode } from "./types";
import { useRailState } from "./hooks/useRailState";
import { usePublishHeaderOffset } from "./hooks/usePublishHeaderOffset";
import { EntityIdentityBar } from "./atoms/EntityIdentityBar";
import { EntityActionBar } from "./atoms/EntityActionBar";
import { EntityExceptionStrip } from "./atoms/EntityExceptionStrip";
import { EntityFactRail } from "./atoms/EntityFactRail";
import { EntityProgressRow } from "./atoms/EntityProgressRow";
import { EntityStatusStrip } from "./atoms/EntityStatusStrip";
import { EntityTabBar, type PlatformPanelIcon } from "./atoms/EntityTabBar";
import { entityHeaderEditClass, entityHeaderShellClass } from "./atoms/headerChrome";

function toAmountSummary(xlFact: NonNullable<EntityHeaderModel["facts"]>[number]) {
  let amount = xlFact.value.trim();
  let currency = normaliseCurrencyCode(xlFact.currency);

  const prefixed = amount.match(/^([A-Z]{3})\s+(.+)$/);
  if (prefixed) {
    const prefixedCurrency = prefixed[1];
    const prefixedAmount = prefixed[2];
    const parsedCurrency = normaliseCurrencyCode(prefixedCurrency);
    if (prefixedAmount && parsedCurrency && (!currency || currency === parsedCurrency)) {
      currency = currency ?? parsedCurrency;
      amount = prefixedAmount.trim();
    }
  }

  const suffixed = amount.match(/^(.+?)\s+([A-Z]{3})$/);
  if (suffixed) {
    const suffixedAmount = suffixed[1];
    const suffixedCurrency = suffixed[2];
    const parsedCurrency = normaliseCurrencyCode(suffixedCurrency);
    if (suffixedAmount && parsedCurrency && (!currency || currency === parsedCurrency)) {
      currency = currency ?? parsedCurrency;
      amount = suffixedAmount.trim();
    }
  }

  return {
    label:    xlFact.label,
    amount,
    currency,
    subtext:  xlFact.subValue,
  };
}

export interface EntityHeaderProps {
  model: EntityHeaderModel;
  /**
   * Controlled mode. When provided, the header reflects this value on every
   * render and parent-driven transitions (e.g. expanded → pinned on scroll)
   * propagate immediately. When omitted, the header is uncontrolled and uses
   * `defaultMode` (or `"expanded"`) as the initial state.
   */
  mode?: HeaderMode;
  /** Initial mode for the uncontrolled variant. Ignored when `mode` is set. */
  defaultMode?: HeaderMode;
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
  /** Compact contextual content rendered in the identity row beside status. */
  identitySlot?: ReactNode;
  /** Compact action content rendered immediately before the standard action cluster. */
  actionLeadingSlot?: ReactNode;
  className?: string;
}

// ── Main component ────────────────────────────────────────────────────────

export function EntityHeader({
  model,
  mode: controlledMode,
  defaultMode,
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
  identitySlot,
  actionLeadingSlot,
  className,
}: EntityHeaderProps) {
  // Controlled when `mode` is explicitly provided; otherwise fall back to
  // internal state seeded from `defaultMode` (default "expanded"). This lets
  // parents drive expanded → pinned transitions on scroll while preserving
  // standalone usage in storybook / classic-tabs callers.
  const isControlled = controlledMode !== undefined;
  const [internalMode, setInternalMode] = useState<HeaderMode>(defaultMode ?? "expanded");
  const mode = isControlled ? controlledMode! : internalMode;
  // `setMode` is retained for future user-initiated mode toggles (e.g. an
  // expand/collapse affordance). For now it surfaces controlled-vs-uncontrolled
  // semantics so callers can rely on either pattern.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const setMode = (m: HeaderMode) => {
    if (!isControlled) setInternalMode(m);
    onModeChange?.(m);
  };
  const isPinned   = mode === "pinned";
  const isExpanded = mode === "expanded";

  const pinnedRef = usePublishHeaderOffset(isPinned);

  const rail = useRailState(model.progress);

  const xlFact = model.facts?.find((f) => f.xl);
  const amountSummary = xlFact ? toAmountSummary(xlFact) : undefined;
  const nonXlFacts = model.facts?.filter((f) => !f.xl) ?? [];

  const actionsSlot       = <EntityActionBar actions={model.actions} onAction={onAction} />;
  // compact variant for mobile row 1: primary actions + ⋯ icon overflow
  const mobileActionsSlot = <EntityActionBar actions={model.actions} onAction={onAction} compact />;

  // Pinned: sticky strip — P1 + ext + compact P3 + P5 only
  if (isPinned) {
    return (
      <div
        ref={pinnedRef}
        className={cn(
          "sticky top-0 z-30",
          entityHeaderShellClass,
          editMode && entityHeaderEditClass,
          className,
        )}
      >
        {editMode && <div className="h-[2px] bg-primary/70" />}
        <EntityIdentityBar identity={model.identity} onBack={onBack} onTypeClick={onTypeClick} actionsSlot={actionsSlot} mobileActionsSlot={mobileActionsSlot} amountSummary={amountSummary} editMode={editMode} identitySlot={identitySlot} actionLeadingSlot={actionLeadingSlot} />
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
      entityHeaderShellClass,
      editMode && entityHeaderEditClass,
      className,
    )}>
      {editMode && <div className="h-[2px] bg-primary/70" />}
      {/* P1 — always visible */}
      <EntityIdentityBar identity={model.identity} onBack={onBack} onTypeClick={onTypeClick} actionsSlot={actionsSlot} mobileActionsSlot={mobileActionsSlot} amountSummary={amountSummary} editMode={editMode} identitySlot={identitySlot} actionLeadingSlot={actionLeadingSlot} />

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
