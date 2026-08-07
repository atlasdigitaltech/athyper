"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@athyper/platform-theme/utils";
import type { EntityHeaderModel, HeaderFact, HeaderMode } from "./types";
import { RuntimeEntityActionBar } from "./runtime-entity-action-bar";
import { RuntimeEntityIdentityBar } from "./runtime-entity-identity-bar";
import { RuntimeEntityTabBar, type RuntimeEntityTabBarProps } from "./runtime-entity-tab-bar";
import { entityHeaderEditClass, entityHeaderShellClass } from "./header-chrome";
import { usePublishHeaderOffset } from "./use-publish-header-offset";

interface AmountSummary {
  label: string;
  amount: string;
  currency?: string;
  subtext?: string;
}

export interface RuntimeEntityHeaderProps {
  model: EntityHeaderModel;
  /**
   * Controlled mode. When provided, the header reflects this value on every
   * render and parent-driven transitions (e.g. expanded → pinned on scroll)
   * propagate immediately. When omitted, the header is uncontrolled and uses
   * `defaultMode` (or `"expanded"`) as the initial state.
   *
   * Pinned mode renders a sticky, condensed strip suitable for long-scroll
   * object pages; expanded mode renders the full identity + tab bar.
   */
  mode?: HeaderMode;
  /** Initial mode for the uncontrolled variant. Ignored when `mode` is set. */
  defaultMode?: HeaderMode;
  /** Notifier for mode transitions. Fires for both controlled and uncontrolled. */
  onModeChange?: (mode: HeaderMode) => void;
  editMode?: boolean;
  /** Suppresses the built-in "EDITING" badge in the identity bar. */
  hideEditingBadge?: boolean;
  onAction?: (id: string) => void;
  onBack?: () => void;
  activeTab?: string;
  onTabChange?: (id: string) => void;
  onTabIntent?: (id: string) => void;
  platformIcons?: RuntimeEntityTabBarProps["platformIcons"];
  onPlatformIconClick?: (id: string) => void;
  activePlatformIcon?: string;
  onTypeClick?: () => void;
  identitySlot?: ReactNode;
  actionLeadingSlot?: ReactNode;
  /**
   * Arbitrary content rendered below the identity bar in both pinned and
   * expanded modes. Useful for scroll-spy breadcrumbs or pinned alerts.
   */
  extensionSlot?: ReactNode;
  className?: string;
}

function normaliseCurrencyCode(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : undefined;
}

function toAmountSummary(xlFact: HeaderFact): AmountSummary {
  let amount = xlFact.value.trim();
  let currency = normaliseCurrencyCode(xlFact.currency);

  const prefixed = amount.match(/^([A-Z]{3})\s+(.+)$/);
  if (prefixed) {
    const parsedCurrency = normaliseCurrencyCode(prefixed[1]);
    const prefixedAmount = prefixed[2];
    if (prefixedAmount && parsedCurrency && (!currency || currency === parsedCurrency)) {
      currency = currency ?? parsedCurrency;
      amount = prefixedAmount.trim();
    }
  }

  const suffixed = amount.match(/^(.+?)\s+([A-Z]{3})$/);
  if (suffixed) {
    const suffixedAmount = suffixed[1];
    const parsedCurrency = normaliseCurrencyCode(suffixed[2]);
    if (suffixedAmount && parsedCurrency && (!currency || currency === parsedCurrency)) {
      currency = currency ?? parsedCurrency;
      amount = suffixedAmount.trim();
    }
  }

  return {
    label: xlFact.label,
    amount,
    currency,
    subtext: xlFact.subValue,
  };
}

export function RuntimeEntityHeader({
  model,
  mode: controlledMode,
  defaultMode,
  onModeChange,
  editMode = false,
  hideEditingBadge = false,
  onAction,
  onBack,
  activeTab,
  onTabChange,
  onTabIntent,
  platformIcons,
  onPlatformIconClick,
  activePlatformIcon,
  onTypeClick,
  identitySlot,
  actionLeadingSlot,
  extensionSlot,
  className,
}: RuntimeEntityHeaderProps) {
  // Controlled when `mode` is explicitly provided; otherwise fall back to
  // internal state seeded from `defaultMode` (default "expanded"). This lets
  // parents drive expanded → pinned transitions on scroll while preserving
  // standalone usage in storybook / classic-tabs callers.
  const isControlled = controlledMode !== undefined;
  const [internalMode, setInternalMode] = useState<HeaderMode>(defaultMode ?? "expanded");
  const mode = isControlled ? controlledMode : internalMode;
  // Retained for future user-initiated mode toggles (e.g. an expand/collapse
  // affordance). Surfacing it now keeps the controlled/uncontrolled story
  // symmetric for callers that wire either pattern.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const setMode = (m: HeaderMode) => {
    if (!isControlled) setInternalMode(m);
    onModeChange?.(m);
  };
  const isPinned = mode === "pinned";

  // Measure the complete, potentially wrapping record header in every mode.
  // Section navigation consumes this live value instead of assuming a row count.
  const headerRef = usePublishHeaderOffset(true);

  const xlFact = model.facts?.find((fact) => fact.xl);
  const amountSummary = xlFact ? toAmountSummary(xlFact) : undefined;
  const actionsSlot = <RuntimeEntityActionBar actions={model.actions} onAction={onAction} />;
  const mobileActionsSlot = <RuntimeEntityActionBar actions={model.actions} onAction={onAction} compact />;

  const identityBar = (
    <RuntimeEntityIdentityBar
      identity={model.identity}
      onBack={onBack}
      actionsSlot={actionsSlot}
      mobileActionsSlot={mobileActionsSlot}
      amountSummary={amountSummary}
      statusDimensions={model.statuses}
      editMode={editMode}
      hideEditingBadge={hideEditingBadge}
      onTypeClick={onTypeClick}
      identitySlot={identitySlot}
      actionLeadingSlot={actionLeadingSlot}
    />
  );

  const tabBar = ((model.tabs?.length ?? 0) > 0 || (platformIcons?.length ?? 0) > 0) ? (
    <RuntimeEntityTabBar
      tabs={model.tabs ?? []}
      activeTab={activeTab}
      onTabChange={onTabChange}
      onTabIntent={onTabIntent}
      platformIcons={platformIcons}
      onPlatformIconClick={onPlatformIconClick}
      activePlatformIcon={activePlatformIcon}
    />
  ) : null;

  const extensionBlock = extensionSlot ? (
    <div className="border-t border-border/60 px-4 py-2 sm:px-5 lg:px-[22px]">
      {extensionSlot}
    </div>
  ) : null;

  // Identity/actions and tabs stay together as one sticky record header.
  // Once content has moved underneath it, add a little visual separation.
  return (
    <div
      ref={headerRef}
      className={cn(
        "sticky top-0 z-sticky bg-background",
        "before:absolute before:inset-x-0 before:-top-6 before:h-6 before:bg-background before:content-['']",
      )}
    >
      <div
        className={cn(
          "relative bg-card transition-shadow",
          isPinned && "shadow-md",
          entityHeaderShellClass,
          editMode && entityHeaderEditClass,
          className,
        )}
      >
        {editMode && <div className="h-[2px] bg-primary/70" />}
        {identityBar}
        {extensionBlock}
        {tabBar}
      </div>
    </div>
  );
}
