/**
 * Related Documents Plugin for Entity Pages
 *
 * Adds a "Related Documents" tab showing linked financial documents:
 *   - Credit/Debit notes referencing an invoice
 *   - Payments allocated against an invoice
 *   - Journal entries from posting
 *   - Parent invoice (for line items and notes)
 *
 * Each related document is shown as a clickable card with status badge,
 * amount, date, and relationship type.
 */

"use client";

import {
  ArrowRight,
  CreditCard,
  FileText,
  BookOpen,
  Receipt,
  FileMinus,
  RefreshCw,
} from "lucide-react";

import type { TabPlugin, TabPluginProps } from "../plugin-registry";
import type { RelatedDocumentDTO, DocumentRelationship } from "@/lib/finance/types";

import { StatusBadgeCell, MoneyCell, DateCell } from "@/components/finance/list/finance-shared";
import { useRelatedDocuments } from "@/lib/finance/use-related-documents";

// ── Relationship metadata ───────────────────────────────────────────

const RELATIONSHIP_CONFIG: Record<
  DocumentRelationship,
  { label: string; icon: React.ElementType; colorClass: string }
> = {
  CREDIT_NOTE: {
    label: "Credit Note",
    icon: FileMinus,
    colorClass: "text-orange-600 bg-orange-50 border-orange-200",
  },
  DEBIT_NOTE: {
    label: "Debit Note",
    icon: Receipt,
    colorClass: "text-red-600 bg-red-50 border-red-200",
  },
  PAYMENT: {
    label: "Payment",
    icon: CreditCard,
    colorClass: "text-green-600 bg-green-50 border-green-200",
  },
  JOURNAL_ENTRY: {
    label: "Journal Entry",
    icon: BookOpen,
    colorClass: "text-purple-600 bg-purple-50 border-purple-200",
  },
  PARENT_INVOICE: {
    label: "Parent Invoice",
    icon: FileText,
    colorClass: "text-blue-600 bg-blue-50 border-blue-200",
  },
};

// ── Doc type → slug mapping for navigation ──────────────────────────

function docTypeToSlug(docType: string, entityName: string | null): string {
  if (entityName) {
    return entityName
      .replace(/([A-Z])/g, "-$1")
      .toLowerCase()
      .replace(/^-/, "");
  }
  const map: Record<string, string> = {
    PURCHASE_INVOICE: "purchase-non-po-invoice",
    PAYMENT_ENTRY: "payment-entry",
    JOURNAL_ENTRY: "journal-entry",
    CREDIT_NOTE: "credit-note",
    DEBIT_NOTE: "debit-note",
  };
  return map[docType] ?? "financial-document";
}

// ── Document Card ───────────────────────────────────────────────────

function RelatedDocumentCard({ doc }: { doc: RelatedDocumentDTO }) {
  const config = RELATIONSHIP_CONFIG[doc.relationship] ?? {
    label: doc.relationship,
    icon: FileText,
    colorClass: "text-gray-600 bg-gray-50 border-gray-200",
  };
  const Icon = config.icon;
  const slug = docTypeToSlug(doc.docType, doc.entityName);
  const href = `/app/${slug}/${doc.docId}`;

  return (
    <a
      href={href}
      className={`group flex items-start gap-4 rounded-lg border p-4 transition-colors hover:shadow-sm ${config.colorClass}`}
    >
      <div className="mt-0.5 rounded-md bg-white/60 p-2">
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider opacity-70">
            {config.label}
          </span>
          <StatusBadgeCell status={doc.status} />
        </div>
        <p className="mt-1 truncate text-sm font-medium text-gray-900 dark:text-gray-100">
          {doc.docNo}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {doc.docDate && (
            <span>
              Date: <DateCell date={doc.docDate} />
            </span>
          )}
          {doc.postingDate && (
            <span>
              Posted: <DateCell date={doc.postingDate} />
            </span>
          )}
          {doc.totalAmount && doc.currencyCode && (
            <MoneyCell amount={doc.totalAmount} currency={doc.currencyCode} />
          )}
        </div>
      </div>
      <ArrowRight className="mt-2 h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
    </a>
  );
}

// ── Empty State ─────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <FileText className="h-10 w-10 opacity-30" />
      <p className="mt-3 text-sm">No related documents found</p>
      <p className="mt-1 text-xs opacity-60">
        Credit notes, debit notes, payments, and journal entries will appear here once linked.
      </p>
    </div>
  );
}

// ── Main Tab Component ──────────────────────────────────────────────

function RelatedDocumentsTab({ entityName, entityId, staticDescriptor }: TabPluginProps) {
  // Derive docType from entity name
  const docTypeMap: Record<string, string> = {
    "purchase-non-po-invoice": "PURCHASE_INVOICE",
    "purchase-invoice": "PURCHASE_INVOICE",
    "credit-note": "CREDIT_NOTE",
    "debit-note": "DEBIT_NOTE",
    "payment-entry": "PAYMENT_ENTRY",
    "manual-journal-entry": "JOURNAL_ENTRY",
    "purchase-invoice-line": "PURCHASE_INVOICE_LINE",
  };

  const docType = docTypeMap[entityName] ?? "PURCHASE_INVOICE";

  // For line items, we need the parent invoice ID — pass the entity ID as docId
  // The API will handle the relationship lookup
  const { documents, loading, error, refresh } = useRelatedDocuments(
    entityId,
    docType,
    staticDescriptor.entityName,
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Loading related documents...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-950/30 dark:text-red-400">
        {error}
      </div>
    );
  }

  // Group by relationship type
  const grouped = new Map<DocumentRelationship, RelatedDocumentDTO[]>();
  for (const doc of documents) {
    const arr = grouped.get(doc.relationship) ?? [];
    arr.push(doc);
    grouped.set(doc.relationship, arr);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          {documents.length} related document{documents.length !== 1 ? "s" : ""}
        </h3>
        <button
          onClick={refresh}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {documents.length === 0 ? (
        <EmptyState />
      ) : (
        Array.from(grouped.entries()).map(([relationship, docs]) => (
          <div key={relationship}>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {RELATIONSHIP_CONFIG[relationship]?.label ?? relationship}
              <span className="ml-1.5 text-muted-foreground/60">({docs.length})</span>
            </h4>
            <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2">
              {docs.map((doc) => (
                <RelatedDocumentCard key={doc.docId} doc={doc} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export const relatedDocumentsPlugin: TabPlugin = {
  code: "related-documents",
  component: RelatedDocumentsTab,
};
