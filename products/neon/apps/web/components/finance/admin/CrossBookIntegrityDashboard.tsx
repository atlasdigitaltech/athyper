"use client";

// components/finance/admin/CrossBookIntegrityDashboard.tsx
//
// Admin dashboard for cross-book integrity monitoring.
// Shows audit issues, severity breakdown, and quick actions.

import {
  AlertTriangle,
  ChevronRight,
  Download,
  Loader2,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useCrossBookAudit,
  type AuditFilters,
} from "@/lib/finance/use-cross-book-audit";
import type { AuditSeverity } from "@/lib/finance/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEVERITY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All Severities" },
  { value: "CRITICAL", label: "Critical" },
  { value: "WARNING", label: "Warning" },
  { value: "INFO", label: "Info" },
];

const BOOK_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All Books" },
  { value: "STAT", label: "Statutory" },
  { value: "TAX", label: "Tax" },
  { value: "MGMT", label: "Management" },
  { value: "IFRS", label: "IFRS" },
  { value: "LOCAL", label: "Local GAAP" },
];

const ISSUE_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All Issue Types" },
  { value: "ORPHANED_DERIVATION", label: "Orphaned Derivation" },
  { value: "MISSING_DERIVATION", label: "Missing Derivation" },
  { value: "UNASSIGNED_BOOK", label: "Unassigned Book" },
  { value: "BALANCE_DRIFT", label: "Balance Drift" },
  { value: "CLOSED_BOOK_POSTING", label: "Closed Book Posting" },
  { value: "INACTIVE_BOOK", label: "Inactive Book" },
];

const SEVERITY_COLORS: Record<AuditSeverity, { bg: string; text: string; icon: typeof ShieldAlert }> = {
  CRITICAL: { bg: "bg-red-100", text: "text-red-700", icon: XCircle },
  WARNING: { bg: "bg-amber-100", text: "text-amber-700", icon: AlertTriangle },
  INFO: { bg: "bg-blue-100", text: "text-blue-700", icon: Shield },
};

const ISSUE_TYPE_LABELS: Record<string, string> = {
  ORPHANED_DERIVATION: "Orphaned Derivation",
  MISSING_DERIVATION: "Missing Derivation",
  UNASSIGNED_BOOK: "Unassigned Book",
  BALANCE_DRIFT: "Balance Drift",
  CLOSED_BOOK_POSTING: "Closed Book Posting",
  INACTIVE_BOOK: "Inactive Book",
};

const BOOK_COLORS: Record<string, string> = {
  STAT: "bg-blue-100 text-blue-700",
  TAX: "bg-red-100 text-red-700",
  MGMT: "bg-green-100 text-green-700",
  IFRS: "bg-purple-100 text-purple-700",
  LOCAL: "bg-amber-100 text-amber-700",
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SeverityBadge({ severity }: { severity: AuditSeverity }) {
  const config = SEVERITY_COLORS[severity];
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.bg} ${config.text}`}
    >
      <Icon className="size-3" />
      {severity}
    </span>
  );
}

function BookBadge({ bookCode }: { bookCode: string }) {
  const colors = BOOK_COLORS[bookCode] ?? "bg-gray-100 text-gray-700";

  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold ${colors}`}
    >
      {bookCode}
    </span>
  );
}

function SummaryCard({
  label,
  count,
  severity,
}: {
  label: string;
  count: number;
  severity: AuditSeverity;
}) {
  const config = SEVERITY_COLORS[severity];
  const Icon = config.icon;

  return (
    <div className={`rounded-lg border p-4 ${count > 0 ? config.bg : "bg-muted/30"}`}>
      <div className="flex items-center gap-2">
        <Icon className={`size-5 ${count > 0 ? config.text : "text-muted-foreground"}`} />
        <span className={`text-2xl font-bold tabular-nums ${count > 0 ? config.text : "text-muted-foreground"}`}>
          {count}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CrossBookIntegrityDashboard() {
  const [severity, setSeverity] = useState("all");
  const [bookFilter, setBookFilter] = useState("all");
  const [issueTypeFilter, setIssueTypeFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filters = useMemo<AuditFilters>(
    () => ({
      severity: severity !== "all" ? severity : undefined,
    }),
    [severity],
  );

  const { data: issues, loading, error, refresh } = useCrossBookAudit(filters);

  // Filter by search + book + issue type locally
  const filtered = useMemo(() => {
    if (!issues) return [];
    let result = issues;

    if (bookFilter !== "all") {
      result = result.filter((i) => i.bookCode === bookFilter);
    }
    if (issueTypeFilter !== "all") {
      result = result.filter((i) => i.issueType === issueTypeFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (i) =>
          i.jeNumber.toLowerCase().includes(q) ||
          i.bookCode.toLowerCase().includes(q) ||
          i.issueType.toLowerCase().includes(q) ||
          i.detail.toLowerCase().includes(q) ||
          (i.ruleCode && i.ruleCode.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [issues, search, bookFilter, issueTypeFilter]);

  // Severity breakdown
  const criticalCount = filtered.filter((i) => i.severity === "CRITICAL").length;
  const warningCount = filtered.filter((i) => i.severity === "WARNING").length;
  const infoCount = filtered.filter((i) => i.severity === "INFO").length;
  const allClear = filtered.length === 0 && !loading && !error;

  // CSV export
  const exportCsv = useCallback(() => {
    if (!filtered.length) return;
    const headers = ["Severity", "Issue Type", "Book", "JE #", "Related Book", "Rule", "Detail", "Detected At"];
    const rows = filtered.map((i) => [
      i.severity,
      i.issueType,
      i.bookCode,
      i.jeNumber,
      i.relatedBook ?? "",
      i.ruleCode ?? "",
      `"${i.detail.replace(/"/g, '""')}"`,
      i.detectedAt ?? "",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cross-book-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered]);

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="size-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Cross-Book Integrity</h1>
        </div>
        <div className="flex items-center gap-2">
          {filtered.length > 0 && (
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="mr-1.5 size-3.5" />
              Export CSV
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={`mr-1.5 size-3.5 ${loading ? "animate-spin" : ""}`} />
            Run Audit
          </Button>
        </div>
      </div>

      {/* ── Summary cards ───────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard label="Critical issues" count={criticalCount} severity="CRITICAL" />
        <SummaryCard label="Warnings" count={warningCount} severity="WARNING" />
        <SummaryCard label="Informational" count={infoCount} severity="INFO" />
      </div>

      {/* ── All clear state ─────────────────────────────────────── */}
      {allClear && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-green-200 bg-green-50 py-8">
          <ShieldCheck className="size-10 text-green-600" />
          <p className="text-sm font-medium text-green-700">All books are consistent</p>
          <p className="text-xs text-green-600">No integrity issues detected</p>
        </div>
      )}

      {/* ── Filters ─────────────────────────────────────────────── */}
      {!allClear && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search issues..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger className="w-[160px]" size="sm">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              {SEVERITY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={bookFilter} onValueChange={setBookFilter}>
            <SelectTrigger className="w-[150px]" size="sm">
              <SelectValue placeholder="Book" />
            </SelectTrigger>
            <SelectContent>
              {BOOK_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={issueTypeFilter} onValueChange={setIssueTypeFilter}>
            <SelectTrigger className="w-[190px]" size="sm">
              <SelectValue placeholder="Issue Type" />
            </SelectTrigger>
            <SelectContent>
              {ISSUE_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* ── Error state ─────────────────────────────────────────── */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={refresh}>
            <RefreshCw className="mr-1.5 size-3.5" />
            Retry
          </Button>
        </div>
      )}

      {/* ── Loading state ───────────────────────────────────────── */}
      {loading && !issues && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* ── Issues table ────────────────────────────────────────── */}
      {filtered.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Severity</TableHead>
              <TableHead className="w-[180px]">Issue Type</TableHead>
              <TableHead className="w-[80px]">Book</TableHead>
              <TableHead className="w-[120px]">JE #</TableHead>
              <TableHead className="w-[80px]">Related</TableHead>
              <TableHead>Detail</TableHead>
              <TableHead className="w-[140px]">Detected</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((issue, idx) => (
              <TableRow key={`${issue.jeId}-${issue.issueType}-${idx}`}>
                <TableCell>
                  <SeverityBadge severity={issue.severity} />
                </TableCell>
                <TableCell>
                  <span className="text-sm font-medium">
                    {ISSUE_TYPE_LABELS[issue.issueType] ?? issue.issueType}
                  </span>
                </TableCell>
                <TableCell>
                  <BookBadge bookCode={issue.bookCode} />
                </TableCell>
                <TableCell>
                  <span className="font-mono text-sm">{issue.jeNumber}</span>
                </TableCell>
                <TableCell>
                  {issue.relatedBook ? (
                    <div className="flex items-center gap-1">
                      <BookBadge bookCode={issue.relatedBook} />
                      <ChevronRight className="size-3 text-muted-foreground" />
                    </div>
                  ) : (
                    <span className="text-muted-foreground">--</span>
                  )}
                </TableCell>
                <TableCell className="max-w-[400px] truncate text-sm text-muted-foreground">
                  {issue.detail}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {issue.detectedAt
                    ? new Date(issue.detectedAt).toLocaleString()
                    : "--"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
