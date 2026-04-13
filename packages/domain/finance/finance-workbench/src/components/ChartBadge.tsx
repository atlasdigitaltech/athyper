"use client";

import { Badge } from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import type { AccountClass, ChartTier, ConsolidationMethod, OwnerType } from "../data/types";

/* -- Account class -------------------------------------------------------- */

const CLASS_STYLE: Record<string, string> = {
  asset:            "bg-blue-50 text-blue-700 border-blue-200",
  contra_asset:     "bg-blue-50 text-blue-500 border-blue-200",
  liability:        "bg-purple-50 text-purple-700 border-purple-200",
  contra_liability: "bg-purple-50 text-purple-500 border-purple-200",
  equity:           "bg-indigo-50 text-indigo-700 border-indigo-200",
  contra_equity:    "bg-indigo-50 text-indigo-500 border-indigo-200",
  income:           "bg-emerald-50 text-emerald-700 border-emerald-200",
  expense:          "bg-amber-50 text-amber-700 border-amber-200",
};

const CLASS_LABEL: Record<string, string> = {
  asset: "Asset", contra_asset: "C/Asset", liability: "Liability",
  contra_liability: "C/Liability", equity: "Equity", contra_equity: "C/Equity",
  income: "Revenue", expense: "Expense",
};

const CLASS_DOT: Record<string, string> = {
  asset: "bg-blue-500", contra_asset: "bg-blue-300", liability: "bg-purple-500",
  contra_liability: "bg-purple-300", equity: "bg-indigo-500", contra_equity: "bg-indigo-300",
  income: "bg-emerald-500", expense: "bg-amber-500",
};

export function AccountClassBadge({ cls, className }: { cls: AccountClass; className?: string }) {
  return (
    <Badge variant="outline" className={cn("text-[10px] py-0", CLASS_STYLE[cls], className)}>
      {CLASS_LABEL[cls] ?? cls}
    </Badge>
  );
}

export function AccountClassDot({ cls }: { cls: AccountClass }) {
  return <span className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", CLASS_DOT[cls])} />;
}

/* -- Chart tier ----------------------------------------------------------- */

const TIER_STYLE: Record<ChartTier, string> = {
  group:     "bg-purple-50 text-purple-700 border-purple-200",
  operating: "bg-blue-50 text-blue-700 border-blue-200",
  local:     "bg-amber-50 text-amber-700 border-amber-200",
};

export function TierBadge({ tier, className }: { tier: ChartTier; className?: string }) {
  return (
    <Badge variant="outline" className={cn("text-[10px] py-0", TIER_STYLE[tier], className)}>
      {tier}
    </Badge>
  );
}

/* -- Consolidation method ------------------------------------------------- */

const CONSOL_STYLE: Record<string, string> = {
  full:          "bg-emerald-50 text-emerald-700 border-emerald-200",
  proportional:  "bg-blue-50 text-blue-700 border-blue-200",
  equity:        "bg-amber-50 text-amber-700 border-amber-200",
};

export function ConsolBadge({ method, className }: { method: ConsolidationMethod; className?: string }) {
  return (
    <Badge variant="outline" className={cn("text-[10px] py-0", CONSOL_STYLE[method], className)}>
      {method}
    </Badge>
  );
}

/* -- Owner type ----------------------------------------------------------- */

const OWNER_STYLE: Record<OwnerType, string> = {
  customer: "bg-blue-50 text-blue-700 border-blue-200",
  supplier: "bg-purple-50 text-purple-700 border-purple-200",
  employee: "bg-amber-50 text-amber-700 border-amber-200",
  internal: "bg-muted text-muted-foreground",
};

export function OwnerBadge({ owner, className }: { owner: OwnerType; className?: string }) {
  return (
    <Badge variant="outline" className={cn("text-[10px] py-0", OWNER_STYLE[owner], className)}>
      {owner}
    </Badge>
  );
}

/* -- Node type ------------------------------------------------------------ */

export function NodeTypeBadge({ type }: { type: "header" | "posting" }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] py-0",
        type === "posting"
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : "bg-muted text-muted-foreground",
      )}
    >
      {type}
    </Badge>
  );
}

/* -- Reconciliation ------------------------------------------------------- */

export function ReconBadge({ value }: { value: string }) {
  const style =
    value === "auto"   ? "bg-blue-50 text-blue-700 border-blue-200" :
    value === "manual" ? "bg-amber-50 text-amber-700 border-amber-200" :
                         "bg-muted text-muted-foreground";
  return <Badge variant="outline" className={cn("text-[10px] py-0", style)}>{value}</Badge>;
}
