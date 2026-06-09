"use client";

import { type ReactNode } from "react";
import { cn } from "@athyper/theme/utils";
import type { EntityHeaderModel, HeaderFact } from "./types";
import { RuntimeEntityActionBar } from "./RuntimeEntityActionBar";
import { RuntimeEntityIdentityBar } from "./RuntimeEntityIdentityBar";
import { RuntimeEntityTabBar, type RuntimeEntityTabBarProps } from "./RuntimeEntityTabBar";
import { entityHeaderEditClass, entityHeaderShellClass } from "./header-chrome";

interface AmountSummary {
  label: string;
  amount: string;
  currency?: string;
  subtext?: string;
}

export interface RuntimeEntityHeaderProps {
  model: EntityHeaderModel;
  editMode?: boolean;
  onAction?: (id: string) => void;
  onBack?: () => void;
  activeTab?: string;
  onTabChange?: (id: string) => void;
  platformIcons?: RuntimeEntityTabBarProps["platformIcons"];
  onPlatformIconClick?: (id: string) => void;
  activePlatformIcon?: string;
  onTypeClick?: () => void;
  identitySlot?: ReactNode;
  actionLeadingSlot?: ReactNode;
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
  editMode = false,
  onAction,
  onBack,
  activeTab,
  onTabChange,
  platformIcons,
  onPlatformIconClick,
  activePlatformIcon,
  onTypeClick,
  identitySlot,
  actionLeadingSlot,
  className,
}: RuntimeEntityHeaderProps) {
  const xlFact = model.facts?.find((fact) => fact.xl);
  const amountSummary = xlFact ? toAmountSummary(xlFact) : undefined;
  const actionsSlot = <RuntimeEntityActionBar actions={model.actions} onAction={onAction} />;
  const mobileActionsSlot = <RuntimeEntityActionBar actions={model.actions} onAction={onAction} compact />;

  return (
    <div className={cn(entityHeaderShellClass, editMode && entityHeaderEditClass, className)}>
      {editMode && <div className="h-[2px] bg-primary/70" />}
      <RuntimeEntityIdentityBar
        identity={model.identity}
        onBack={onBack}
        actionsSlot={actionsSlot}
        mobileActionsSlot={mobileActionsSlot}
        amountSummary={amountSummary}
        editMode={editMode}
        onTypeClick={onTypeClick}
        identitySlot={identitySlot}
        actionLeadingSlot={actionLeadingSlot}
      />
      {((model.tabs?.length ?? 0) > 0 || (platformIcons?.length ?? 0) > 0) && (
        <RuntimeEntityTabBar
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
