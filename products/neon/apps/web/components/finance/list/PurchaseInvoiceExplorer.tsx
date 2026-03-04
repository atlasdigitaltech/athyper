"use client";

// components/finance/list/PurchaseInvoiceExplorer.tsx
//
// List explorer for Purchase Invoices.
// Renders a filterable, searchable, paginated table of invoices.

import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import { useState, useMemo } from "react";

import {
  DateCell,
  MoneyCell,
  StatusBadgeCell,
  ApprovalRouteBadge,
} from "./finance-shared";

import type { ListFilterOptions } from "@/lib/finance/use-finance-list";

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
import { usePurchaseInvoiceList } from "@/lib/finance/use-finance-list";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 25;

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All Statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "APPROVED", label: "Approved" },
  { value: "POSTED", label: "Posted" },
  { value: "PARTIALLY_PAID", label: "Partially Paid" },
  { value: "PAID", label: "Paid" },
  { value: "CANCELLED", label: "Cancelled" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PurchaseInvoiceExplorer() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [offset, setOffset] = useState(0);

  const filters = useMemo<ListFilterOptions>(
    () => ({
      limit: PAGE_SIZE,
      offset,
      status: status !== "all" ? status : undefined,
      search: search || undefined,
      sort: "invoiceDate",
      dir: "desc",
    }),
    [offset, status, search],
  );

  const { data, loading, error, refresh } = usePurchaseInvoiceList(filters);

  // ── Reset offset when filters change ────────────────────────────
  const handleStatusChange = (value: string) => {
    setStatus(value);
    setOffset(0);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setOffset(0);
  };

  // ── Pagination ──────────────────────────────────────────────────
  const canPrev = offset > 0;
  const canNext = data?.hasMore ?? false;
  const total = data?.total ?? 0;
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

  return (
    <div className="space-y-4">
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="size-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Purchase Invoices</h1>
          {!loading && (
            <span className="text-sm text-muted-foreground">
              ({total} total)
            </span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          disabled={loading}
        >
          <RefreshCw
            className={`mr-1.5 size-3.5 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {/* ── Filters ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search invoices..."
            value={search}
            onChange={handleSearchChange}
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-[180px]" size="sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Error state ───────────────────────────────────────── */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={refresh}
          >
            <RefreshCw className="mr-1.5 size-3.5" />
            Retry
          </Button>
        </div>
      )}

      {/* ── Loading state ─────────────────────────────────────── */}
      {loading && !data && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────── */}
      {data && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[160px]">Invoice #</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="w-[130px]">Invoice Date</TableHead>
                <TableHead className="w-[120px]">Due Date</TableHead>
                <TableHead className="w-[150px] text-right">Total</TableHead>
                <TableHead className="w-[150px] text-right">Paid</TableHead>
                <TableHead className="w-[130px]">Status</TableHead>
                <TableHead className="w-[120px]">Approval</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No invoices found.
                  </TableCell>
                </TableRow>
              )}
              {data.items.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell>
                    <span className="font-mono text-sm font-medium">
                      {inv.invoiceNumber}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {inv.supplierName ?? inv.supplierId}
                  </TableCell>
                  <TableCell>
                    <DateCell date={inv.invoiceDate} />
                  </TableCell>
                  <TableCell>
                    <DateCell date={inv.dueDate} />
                  </TableCell>
                  <TableCell>
                    <MoneyCell
                      amount={inv.totalAmount}
                      currency={inv.currencyCode}
                    />
                  </TableCell>
                  <TableCell>
                    <MoneyCell
                      amount={inv.paidAmount}
                      currency={inv.currencyCode}
                    />
                  </TableCell>
                  <TableCell>
                    <StatusBadgeCell status={inv.status} />
                  </TableCell>
                  <TableCell>
                    <ApprovalRouteBadge route={inv.approvalRoute} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* ── Pagination ────────────────────────────────── */}
          <div className="flex items-center justify-between border-t pt-3">
            <span className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!canPrev}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                <ChevronLeft className="mr-1 size-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!canNext}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Next
                <ChevronRight className="ml-1 size-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
