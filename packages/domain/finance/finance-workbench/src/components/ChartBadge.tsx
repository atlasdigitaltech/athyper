"use client";

import { Badge } from "@athyper/platform-ui/primitives";
import { cn, resolveSemanticColors, accountClassIntent, chartTierIntent, consolMethodIntent, ownerTypeIntent, reconTypeIntent } from "@athyper/platform-theme";
import type { AccountClass, ChartTier, ConsolidationMethod, OwnerType } from "../data/types";

/* -- Account class -------------------------------------------------------- */

const CLASS_LABEL: Record<string, string> = {
  asset: "Asset", contra_asset: "C/Asset", liability: "Liability",
  contra_liability: "C/Liability", equity: "Equity", contra_equity: "C/Equity",
  income: "Revenue", expense: "Expense",
};

export function AccountClassBadge({ cls, className }: { cls: AccountClass; className?: string }) {
  const { subtleBadge } = resolveSemanticColors(accountClassIntent(cls));
  return (
    <Badge variant="outline" className={cn("text-xs py-0", subtleBadge, className)}>
      {CLASS_LABEL[cls] ?? cls}
    </Badge>
  );
}

export function AccountClassDot({ cls }: { cls: AccountClass }) {
  const { dot } = resolveSemanticColors(accountClassIntent(cls));
  return <span className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", dot)} />;
}

/* -- Chart tier ----------------------------------------------------------- */

export function TierBadge({ tier, className }: { tier: ChartTier; className?: string }) {
  const { subtleBadge } = resolveSemanticColors(chartTierIntent(tier));
  return (
    <Badge variant="outline" className={cn("text-xs py-0", subtleBadge, className)}>
      {tier}
    </Badge>
  );
}

/* -- Consolidation method ------------------------------------------------- */

export function ConsolBadge({ method, className }: { method: ConsolidationMethod; className?: string }) {
  const { subtleBadge } = resolveSemanticColors(consolMethodIntent(method));
  return (
    <Badge variant="outline" className={cn("text-xs py-0", subtleBadge, className)}>
      {method}
    </Badge>
  );
}

/* -- Owner type ------------------------------------------------------------ */

export function OwnerBadge({ owner, className }: { owner: OwnerType; className?: string }) {
  const { subtleBadge } = resolveSemanticColors(ownerTypeIntent(owner));
  return (
    <Badge variant="outline" className={cn("text-xs py-0", subtleBadge, className)}>
      {owner}
    </Badge>
  );
}

/* -- Node type ------------------------------------------------------------ */

export function NodeTypeBadge({ type }: { type: "header" | "posting" }) {
  const { subtleBadge } = resolveSemanticColors(type === "posting" ? "success" : "neutral");
  return (
    <Badge variant="outline" className={cn("text-xs py-0", subtleBadge)}>
      {type}
    </Badge>
  );
}

/* -- Reconciliation ------------------------------------------------------- */

export function ReconBadge({ value }: { value: string }) {
  const { subtleBadge } = resolveSemanticColors(reconTypeIntent(value));
  return (
    <Badge variant="outline" className={cn("text-xs py-0", subtleBadge)}>
      {value}
    </Badge>
  );
}
