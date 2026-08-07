import { type ReactNode } from "react";
import { type FiscalPeriodStatus, type PeriodGateDecision } from "@athyper/finance-rules";
import { type SemanticIntent } from "@athyper/platform-theme/semantic-colors";
import { cn } from "@athyper/platform-theme/utils";
import { Badge } from "../primitives";
import { StatusBadge } from "../composites";

export type AccountingPeriodVisibility = "full" | "counts_only" | "no_access";
export type AccountingPeriodPostability = "postable" | "adjustment_only" | "read_only" | "locked";
export type AccountingPeriodAggregatePosture = FiscalPeriodStatus | "mixed";
export type AccountingPeriodExceptionTone = "warning" | "error" | "neutral";

const lifecycleLabel: Record<FiscalPeriodStatus, string> = {
  future: "Future",
  open: "Open",
  soft_close: "Soft closed",
  hard_close: "Hard closed",
};

const lifecycleIntent: Record<FiscalPeriodStatus, SemanticIntent> = {
  future: "neutral",
  open: "success",
  soft_close: "warning",
  hard_close: "error",
};

const postabilityLabel: Record<AccountingPeriodPostability, string> = {
  postable: "Posting allowed",
  adjustment_only: "Adjustment only",
  read_only: "Read-only",
  locked: "Locked",
};

const postabilityIntent: Record<AccountingPeriodPostability, SemanticIntent> = {
  postable: "success",
  adjustment_only: "warning",
  read_only: "error",
  locked: "neutral",
};

const visibilityLabel: Record<AccountingPeriodVisibility, string> = {
  full: "Full access",
  counts_only: "Counts only",
  no_access: "No access",
};

export function accountingPeriodPostabilityFromDecision(
  decision: PeriodGateDecision,
  status?: { fiscalPeriodStatus?: FiscalPeriodStatus | null; bookPeriodStatus?: FiscalPeriodStatus | null },
): AccountingPeriodPostability {
  if (decision.allowed) {
    return status?.fiscalPeriodStatus === "soft_close" || status?.bookPeriodStatus === "soft_close"
      ? "adjustment_only"
      : "postable";
  }
  return status?.fiscalPeriodStatus === "hard_close" || status?.bookPeriodStatus === "hard_close"
    ? "read_only"
    : "locked";
}

export function AccountingPeriodStatusChip({
  status,
  aggregate = false,
  className,
}: {
  status: AccountingPeriodAggregatePosture | null;
  aggregate?: boolean;
  className?: string;
}) {
  if (status === "mixed") {
    return <StatusBadge intent="info" label="Mixed" className={className} />;
  }
  if (!status) {
    return <StatusBadge intent="neutral" label={aggregate ? "No posture" : "Unknown"} className={className} />;
  }
  return (
    <StatusBadge
      intent={lifecycleIntent[status]}
      label={lifecycleLabel[status]}
      className={className}
    />
  );
}

export function AccountingPeriodVisibilityChip({
  visibility,
  className,
}: {
  visibility: AccountingPeriodVisibility;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      size="sm"
      className={cn(
        "border-dashed bg-muted/40 text-muted-foreground",
        visibility === "full" && "border-border bg-transparent text-foreground",
        className,
      )}
    >
      {visibilityLabel[visibility]}
    </Badge>
  );
}

export function AccountingPeriodPostabilityText({
  postability,
  className,
}: {
  postability: AccountingPeriodPostability;
  className?: string;
}) {
  return (
    <span className={cn("text-xs font-medium", className)}>
      <StatusBadge
        intent={postabilityIntent[postability]}
        label={postabilityLabel[postability]}
        className="px-2 py-0.5"
      />
    </span>
  );
}

export function AccountingPeriodGateSummary({
  decision,
  fiscalPeriodStatus,
  bookPeriodStatus,
  className,
}: {
  decision: PeriodGateDecision;
  fiscalPeriodStatus?: FiscalPeriodStatus | null;
  bookPeriodStatus?: FiscalPeriodStatus | null;
  className?: string;
}) {
  const postability = accountingPeriodPostabilityFromDecision(decision, {
    fiscalPeriodStatus,
    bookPeriodStatus,
  });
  return (
    <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
      <AccountingPeriodPostabilityText postability={postability} />
      <span>{periodGateReasonLabel(decision.reason)}</span>
    </div>
  );
}

export interface AccountingPeriodGateAdvisoryItem {
  code: string;
  label: ReactNode;
  tone?: AccountingPeriodExceptionTone;
}

export function AccountingPeriodGateAdvisory({
  items,
  emptyLabel = "No gate advisories",
  className,
}: {
  items: AccountingPeriodGateAdvisoryItem[];
  emptyLabel?: ReactNode;
  className?: string;
}) {
  if (items.length === 0) {
    return <div className={cn("text-xs text-muted-foreground", className)}>{emptyLabel}</div>;
  }
  return (
    <div className={cn("space-y-1", className)}>
      {items.map((item) => (
        <Badge
          key={item.code}
          variant="outline"
          className={cn(
            "w-full justify-start whitespace-normal border-dashed bg-background px-2 py-1 text-xs",
            item.tone === "error" && "border-destructive/40 text-destructive",
            item.tone === "warning" && "border-warning/40 text-warning",
            item.tone === "neutral" && "text-muted-foreground",
          )}
        >
          {item.label}
        </Badge>
      ))}
    </div>
  );
}

export function AccountingPeriodExceptionChip({
  children,
  tone = "warning",
  className,
}: {
  children: ReactNode;
  tone?: AccountingPeriodExceptionTone;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      size="sm"
      className={cn(
        "border-dashed",
        tone === "error" && "border-destructive/40 text-destructive",
        tone === "warning" && "border-warning/40 text-warning",
        tone === "neutral" && "text-muted-foreground",
        className,
      )}
    >
      {children}
    </Badge>
  );
}

export function periodGateReasonLabel(reason: PeriodGateDecision["reason"]): string {
  switch (reason) {
    case "forward_open":
      return "Fiscal and book periods are open for posting.";
    case "reversal_exempt":
      return "Reversal is exempt from the forward posting gate.";
    case "fiscal_not_open":
      return "Fiscal period is not open.";
    case "book_missing":
      return "Book period is not assigned or opened.";
    case "book_not_open":
      return "Book period is not open.";
    default:
      return "Period gate status is unavailable.";
  }
}
