"use client";

// components/finance/list/finance-shared.tsx
//
// Shared cell renderers for finance list pages.

import React from "react";

// ---------------------------------------------------------------------------
// Status colour map
// ---------------------------------------------------------------------------

export const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: "bg-gray-100", text: "text-gray-700" },
  CREATED: { bg: "bg-gray-100", text: "text-gray-700" },
  SUBMITTED: { bg: "bg-blue-100", text: "text-blue-700" },
  APPROVED: { bg: "bg-green-100", text: "text-green-700" },
  POSTED: { bg: "bg-purple-100", text: "text-purple-700" },
  PARTIALLY_PAID: { bg: "bg-amber-100", text: "text-amber-700" },
  PAID: { bg: "bg-emerald-100", text: "text-emerald-700" },
  CANCELLED: { bg: "bg-red-100", text: "text-red-700" },
  RECONCILED: { bg: "bg-teal-100", text: "text-teal-700" },
  VOIDED: { bg: "bg-red-100", text: "text-red-700" },
  REVERSED: { bg: "bg-orange-100", text: "text-orange-700" },
};

// ---------------------------------------------------------------------------
// StatusBadgeCell
// ---------------------------------------------------------------------------

interface StatusBadgeCellProps {
  status: string;
}

export function StatusBadgeCell({ status }: StatusBadgeCellProps) {
  const colors = STATUS_COLORS[status] ?? {
    bg: "bg-gray-100",
    text: "text-gray-600",
  };
  const label = status.replace(/_/g, " ");

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors.bg} ${colors.text}`}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// MoneyCell
// ---------------------------------------------------------------------------

interface MoneyCellProps {
  amount: string;
  currency?: string;
}

const moneyFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function MoneyCell({ amount, currency }: MoneyCellProps) {
  const num = Number(amount);
  const formatted = Number.isFinite(num) ? moneyFormatter.format(num) : amount;

  return (
    <span className="block text-right font-mono text-sm tabular-nums">
      {formatted}
      {currency ? (
        <span className="ml-1 text-xs text-muted-foreground">{currency}</span>
      ) : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// DateCell
// ---------------------------------------------------------------------------

interface DateCellProps {
  date: string | null;
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export function DateCell({ date }: DateCellProps) {
  if (!date) return <span className="text-muted-foreground">--</span>;

  const parsed = new Date(date);
  const formatted = Number.isNaN(parsed.getTime())
    ? date
    : dateFormatter.format(parsed);

  return <span className="text-sm">{formatted}</span>;
}

// ---------------------------------------------------------------------------
// ApprovalRouteBadge
// ---------------------------------------------------------------------------

const APPROVAL_ROUTE_COLORS: Record<string, { bg: string; text: string }> = {
  ZERO_APPROVAL: { bg: "bg-gray-100", text: "text-gray-600" },
  STANDARD: { bg: "bg-blue-100", text: "text-blue-700" },
  ENHANCED: { bg: "bg-amber-100", text: "text-amber-700" },
  EXECUTIVE: { bg: "bg-red-100", text: "text-red-700" },
  BLOCKED: { bg: "bg-red-100", text: "text-red-700" },
};

interface ApprovalRouteBadgeProps {
  route: string | null;
}

export function ApprovalRouteBadge({ route }: ApprovalRouteBadgeProps) {
  if (!route) return null;

  const colors = APPROVAL_ROUTE_COLORS[route] ?? {
    bg: "bg-gray-100",
    text: "text-gray-600",
  };
  const label = route.replace(/_/g, " ");

  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${colors.bg} ${colors.text}`}
    >
      {label}
    </span>
  );
}
