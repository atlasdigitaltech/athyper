"use client";

// components/finance/admin/DocumentRegistryDashboard.tsx
//
// Compliance and exception dashboard for the financial document registry.
// Shows registry statistics, posting inconsistencies, and compliance exceptions.

import React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileStack,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from "lucide-react";

import { StatusBadgeCell, MoneyCell, DateCell } from "../list/finance-shared";
import { useRegistryStats, useRegistryCompliance } from "@/lib/finance/use-document-registry";
import type { PostingInconsistencyDTO, RegistryStatsDTO } from "@/lib/finance/types";

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  icon: Icon,
  variant = "default",
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  variant?: "default" | "warning" | "critical" | "success";
}) {
  const variantClasses = {
    default: "bg-white border-gray-200",
    warning: "bg-amber-50 border-amber-200",
    critical: "bg-red-50 border-red-200",
    success: "bg-green-50 border-green-200",
  };

  return (
    <div className={`rounded-lg border p-4 ${variantClasses[variant]}`}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inconsistency type labels and severity
// ---------------------------------------------------------------------------

const INCONSISTENCY_LABELS: Record<string, { label: string; severity: "warning" | "critical" }> = {
  POSTED_NO_JE: { label: "Posted without JE", severity: "critical" },
  JE_EXISTS_BUT_NOT_POSTED: { label: "JE exists but not posted", severity: "warning" },
  JE_REVERSED_DOC_NOT: { label: "JE reversed, doc not", severity: "critical" },
  ENTITY_MISMATCH: { label: "Entity code mismatch", severity: "warning" },
  POSTED_IN_CLOSED_PERIOD: { label: "Posted in closed period", severity: "critical" },
  FUTURE_POSTING_DATE: { label: "Future posting date", severity: "warning" },
  INCOMPLETE_MULTIBOOK: { label: "Incomplete multi-book", severity: "warning" },
  ACCRUAL_MISSING_REVERSAL: { label: "Accrual missing reversal", severity: "critical" },
  RECLASS_MISSING_APPROVAL: { label: "Reclass missing approval", severity: "critical" },
  DN_WITHOUT_INVOICE: { label: "Debit note without invoice", severity: "warning" },
  FX_ZERO_GAIN_LOSS: { label: "FX reval zero adjustment", severity: "warning" },
  FX_REVAL_AFTER_CLOSE: { label: "FX reval in closed period", severity: "critical" },
  IC_ENTITY_MISMATCH: { label: "IC entity mismatch", severity: "critical" },
  IC_UNBALANCED: { label: "IC elimination unbalanced", severity: "critical" },
};

// ---------------------------------------------------------------------------
// Dashboard Component
// ---------------------------------------------------------------------------

interface DocumentRegistryDashboardProps {
  entityCode: string;
}

export function DocumentRegistryDashboard({
  entityCode,
}: DocumentRegistryDashboardProps) {
  const stats = useRegistryStats(entityCode);
  const compliance = useRegistryCompliance(entityCode);

  const refreshAll = () => {
    stats.refresh();
    compliance.refresh();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileStack className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Document Registry Compliance</h2>
        </div>
        <button
          onClick={refreshAll}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Stats Grid */}
      {stats.data && (
        <StatsGrid stats={stats.data} />
      )}
      {stats.loading && !stats.data && (
        <div className="text-sm text-muted-foreground">Loading statistics...</div>
      )}
      {stats.error && (
        <div className="text-sm text-red-600">Error: {stats.error}</div>
      )}

      {/* Compliance Exceptions */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" />
          <h3 className="text-sm font-semibold">Posting Exceptions</h3>
          {compliance.data && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
              {compliance.data.length}
            </span>
          )}
        </div>

        {compliance.loading && !compliance.data && (
          <div className="text-sm text-muted-foreground">Loading compliance data...</div>
        )}
        {compliance.error && (
          <div className="text-sm text-red-600">Error: {compliance.error}</div>
        )}

        {compliance.data && compliance.data.length === 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            No posting exceptions detected
          </div>
        )}

        {compliance.data && compliance.data.length > 0 && (
          <InconsistencyTable items={compliance.data} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stats Grid
// ---------------------------------------------------------------------------

function StatsGrid({ stats }: { stats: RegistryStatsDTO }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatCard
        label="Total Documents"
        value={stats.totalDocuments}
        icon={FileStack}
      />
      <StatCard
        label="Approved (Unposted)"
        value={stats.unpostedApproved}
        icon={AlertTriangle}
        variant={stats.unpostedApproved > 20 ? "critical" : stats.unpostedApproved > 0 ? "warning" : "default"}
      />
      <StatCard
        label="Posted without JE"
        value={stats.postedWithoutJe}
        icon={XCircle}
        variant={stats.postedWithoutJe > 0 ? "critical" : "success"}
      />
      <StatCard
        label="Recently Reversed"
        value={stats.recentlyReversed}
        icon={AlertTriangle}
        variant={stats.recentlyReversed > 5 ? "warning" : "default"}
      />
      <StatCard
        label="No Decision Score"
        value={stats.approvedWithoutScoring}
        icon={ShieldAlert}
        variant={stats.approvedWithoutScoring > 20 ? "warning" : "default"}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inconsistency Table
// ---------------------------------------------------------------------------

function InconsistencyTable({
  items,
}: {
  items: PostingInconsistencyDTO[];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-gray-600">
              Severity
            </th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">
              Doc #
            </th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">
              Type
            </th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">
              Status
            </th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">
              Issue
            </th>
            <th className="px-3 py-2 text-right font-medium text-gray-600">
              Amount
            </th>
            <th className="px-3 py-2 text-left font-medium text-gray-600">
              Posting Date
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map((item, idx) => {
            const meta = INCONSISTENCY_LABELS[item.inconsistencyType] ?? {
              label: item.inconsistencyType,
              severity: "warning" as const,
            };
            return (
              <tr key={idx} className="hover:bg-gray-50">
                <td className="px-3 py-2">
                  {meta.severity === "critical" ? (
                    <XCircle className="h-4 w-4 text-red-500" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  )}
                </td>
                <td className="px-3 py-2 font-mono font-medium">
                  {item.document.docNo}
                </td>
                <td className="px-3 py-2">{item.document.docType}</td>
                <td className="px-3 py-2">
                  <StatusBadgeCell status={item.document.status} />
                </td>
                <td className="px-3 py-2">
                  <span className="text-sm">{meta.label}</span>
                  {item.detail && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({item.detail})
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <MoneyCell
                    amount={item.document.totalAmount}
                    currency={item.document.currencyCode}
                  />
                </td>
                <td className="px-3 py-2">
                  <DateCell date={item.document.postingDate} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
