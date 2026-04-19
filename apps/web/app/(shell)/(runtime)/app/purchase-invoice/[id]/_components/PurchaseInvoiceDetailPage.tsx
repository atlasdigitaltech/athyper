/**
 * Purchase Invoice detail page — client component.
 *
 * Data sources:
 *   useApInvoiceDetail  — AP-specific data: lines, tax, supplier, amounts
 *   ActivityTimeline    — from the relay activity endpoint
 *   Mock orchestrator   — v1.2 spec orchestrator data (satellites, health, actions)
 *
 * Layout: ApprovableDocumentShell (header + health strip + validation + tabs)
 *   → tab-panel content with Overview as default first tab.
 * Mode preference is persisted per "invoice" doc type via persistMode.
 */
"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApInvoiceDetail, type ApInvoiceLine } from "@athyper/finance-workbench/hooks";
import { mapApInvoiceToHeader } from "@athyper/finance-workbench/lib/invoice-header-mapper";
import {
  mockStatusDimensions,
  mockHealthTiles,
  mockSatelliteGroups,
  mockAmountBreakdown,
  mockValidationNotices,
  mockActionBundle,
} from "@athyper/finance-workbench/lib/invoice-orchestrator-mock";
import { ApprovableDocumentShell } from "@athyper/document-runtime";
import { SatelliteCardGroup, SatelliteDetailSheet } from "@athyper/document-runtime/satellites";
import { AmountSummaryCard } from "@athyper/document-runtime/amounts";
import { Card, CardContent, Skeleton } from "@athyper/ui/primitives";
import { PageFrame } from "@athyper/ui/layout";
import { ActivityTimeline } from "@athyper/collaboration-ui/activity";
import type { ActivityEntry } from "@athyper/api-contracts/workflow";
import type { SatelliteCard } from "@athyper/api-contracts/documents";

const ENTITY_CODE = "purchase-invoice";

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

// ── Tab panels ────────────────────────────────────────────────────────────────

function OverviewPanel({
  invoice,
}: {
  invoice: NonNullable<ReturnType<typeof useApInvoiceDetail>["data"]>;
}) {
  const [selectedCard, setSelectedCard] = useState<SatelliteCard | null>(null);
  const breakdownLines = mockAmountBreakdown(invoice);
  const satelliteGroups = mockSatelliteGroups(invoice);

  return (
    <div className="space-y-6">
      <AmountSummaryCard lines={breakdownLines} />
      <SatelliteCardGroup
        groups={satelliteGroups}
        onCardClick={(card) => setSelectedCard(card)}
      />
      <SatelliteDetailSheet
        card={selectedCard}
        open={selectedCard != null}
        onClose={() => setSelectedCard(null)}
      />
    </div>
  );
}

function DetailsPanel({
  invoice,
}: {
  invoice: NonNullable<ReturnType<typeof useApInvoiceDetail>["data"]>;
}) {
  const fields: { label: string; value: string }[] = [
    { label: "Invoice Number", value: invoice.invoiceNumber },
    { label: "Invoice Type",   value: invoice.invoiceSource },
    { label: "Status",         value: invoice.status },
    { label: "Supplier",       value: invoice.supplierName ?? "—" },
    { label: "Invoice Date",   value: fmtDate(invoice.invoiceDate) },
    { label: "Due Date",       value: invoice.dueDate ? fmtDate(invoice.dueDate) : "—" },
    { label: "Currency",       value: invoice.currencyCode },
    {
      label: "Gross Amount",
      value: `${invoice.currencyCode} ${fmt(invoice.payableAmount)}`,
    },
    {
      label: "Tax Amount",
      value: `${invoice.currencyCode} ${fmt(invoice.tax_amount)}`,
    },
    {
      label: "Outstanding",
      value: `${invoice.currencyCode} ${fmt(invoice.outstandingAmount)}`,
    },
    ...(invoice.description
      ? [{ label: "Description", value: invoice.description }]
      : []),
  ];

  return (
    <Card>
      <CardContent className="pt-5">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-3 lg:grid-cols-4">
          {fields.map(({ label, value }) => (
            <div key={label}>
              <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 text-sm">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function LinesPanel({
  lines,
  currency,
}: {
  lines: ApInvoiceLine[];
  currency: string;
}) {
  if (lines.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          No line items on this invoice.
        </CardContent>
      </Card>
    );
  }

  const totalNet = lines.reduce((s, l) => s + l.net_amount, 0);
  const totalTax = lines.reduce((s, l) => s + l.tax_amount, 0);

  return (
    <Card>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">#</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">
                Description
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">
                Qty
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">
                Unit Price
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">
                Net Amount
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">
                Tax ({currency})
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {lines.map((line) => (
              <tr key={line.id} className="transition-colors hover:bg-muted/20">
                <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{line.line_no}</td>
                <td className="px-4 py-2.5">{line.item_description}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{line.quantity}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmt(line.unit_price)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                  {fmt(line.net_amount)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                  {fmt(line.tax_amount)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/20 font-semibold">
              <td colSpan={4} className="px-4 py-2.5 text-right text-xs uppercase tracking-wider text-muted-foreground">
                Total
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">{fmt(totalNet)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                {fmt(totalTax)}
              </td>
            </tr>
          </tfoot>
        </table>
      </CardContent>
    </Card>
  );
}

function ActivityPanel({ invoiceId }: { invoiceId: string }) {
  const { data, isLoading } = useQuery<{ data: ActivityEntry[] }>({
    queryKey: ["activity", ENTITY_CODE, invoiceId],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/relay/api/activity/${ENTITY_CODE}/${invoiceId}`,
        { signal },
      );
      if (!res.ok) return { data: [] };
      return res.json() as Promise<{ data: ActivityEntry[] }>;
    },
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-2 pt-5">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <ActivityTimeline entries={data?.data ?? []} />
      </CardContent>
    </Card>
  );
}

// ── Main page component ───────────────────────────────────────────────────────

export function PurchaseInvoiceDetailPage({ invoiceId }: { invoiceId: string }) {
  const [activeTab, setActiveTab] = useState("overview");
  const { data: invoice, isLoading } = useApInvoiceDetail(invoiceId);

  if (isLoading || !invoice) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-56 w-full rounded-lg" />
        <Skeleton className="h-8 w-64 rounded" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  // ── Orchestrator data (mock for now, real API later) ──────────────────────
  const statusDimensions = mockStatusDimensions(invoice.status);
  const actionBundle = mockActionBundle(invoice.status);
  const healthTiles = mockHealthTiles(invoice.status);
  const validationNotices = mockValidationNotices(invoice.status);

  const headerData = mapApInvoiceToHeader(invoice, {
    subtotalAmount: invoice.payableAmount - invoice.tax_amount,
    statusDimensions,
    actionBundle,
  });

  const tabs = [
    { id: "overview",    label: "Overview" },
    { id: "details",     label: "Details" },
    { id: "lines",       label: "Line Items", count: invoice.lines.length },
    { id: "activity",    label: "Activity" },
    { id: "attachments", label: "Attachments" },
  ];

  return (
    <PageFrame title={invoice.invoiceNumber}>
      <ApprovableDocumentShell
        data={headerData}
        persistMode
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        healthTiles={healthTiles}
        validationNotices={validationNotices}
        onAction={(action) => {
          if (action === "export") {
            window.location.href = `/app/${ENTITY_CODE}/${invoiceId}/export`;
          }
          if (action === "copy") {
            void navigator.clipboard?.writeText(invoice.invoiceNumber);
          }
        }}
      >
        {activeTab === "overview" && <OverviewPanel invoice={invoice} />}
        {activeTab === "details" && <DetailsPanel invoice={invoice} />}
        {activeTab === "lines" && (
          <LinesPanel lines={invoice.lines} currency={invoice.currencyCode} />
        )}
        {activeTab === "activity" && <ActivityPanel invoiceId={invoiceId} />}
        {activeTab === "attachments" && (
          <Card>
            <CardContent className="pt-5">
              <p className="text-sm text-muted-foreground">
                Manage attachments at{" "}
                <a
                  href={`/app/${ENTITY_CODE}/${invoiceId}/attachments`}
                  className="text-primary underline underline-offset-2"
                >
                  /attachments
                </a>
              </p>
            </CardContent>
          </Card>
        )}
      </ApprovableDocumentShell>
    </PageFrame>
  );
}
