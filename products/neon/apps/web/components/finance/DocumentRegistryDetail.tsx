"use client";

// components/finance/DocumentRegistryDetail.tsx
//
// Per-document detail drill page for the financial document registry.
// 5-tab layout: Summary, Posting Bridge, Approval Evidence, Reversal Chain,
// Compliance Flags.
//
// Follows the ReleaseDetail pattern: tabbed layout with icon tabs,
// governance banner, and refresh.

import React, { useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileStack,
  History,
  RefreshCw,
  Shield,
  ShieldAlert,
  XCircle,
} from "lucide-react";

import { StatusBadgeCell, MoneyCell, DateCell, ApprovalRouteBadge } from "./list/finance-shared";
import {
  useDocumentRegistryDetail,
  useDocumentPostings,
} from "@/lib/finance/use-document-registry";
import type {
  FinancialDocumentDTO,
  FinancialDocumentPostingDTO,
} from "@/lib/finance/types";

// ---------------------------------------------------------------------------
// Tab definition
// ---------------------------------------------------------------------------

type TabKey = "summary" | "posting" | "approval" | "reversal" | "compliance";

const TABS: Array<{ key: TabKey; label: string; icon: React.ElementType }> = [
  { key: "summary", label: "Summary", icon: FileStack },
  { key: "posting", label: "Posting Bridge", icon: BookOpen },
  { key: "approval", label: "Approval Evidence", icon: Shield },
  { key: "reversal", label: "Reversal Chain", icon: History },
  { key: "compliance", label: "Compliance", icon: ShieldAlert },
];

// ---------------------------------------------------------------------------
// Doc type labels
// ---------------------------------------------------------------------------

const DOC_TYPE_LABELS: Record<string, string> = {
  PURCHASE_INVOICE: "Purchase Invoice",
  PAYMENT_ENTRY: "Payment Entry",
  JOURNAL_ENTRY: "Journal Entry",
  CREDIT_NOTE: "Credit Note",
  DEBIT_NOTE: "Debit Note",
  ACCRUAL: "Accrual",
  REVERSAL: "Reversal",
  RECLASS: "Reclassification",
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface DocumentRegistryDetailProps {
  documentId: string;
  onBack?: () => void;
}

export function DocumentRegistryDetail({
  documentId,
  onBack,
}: DocumentRegistryDetailProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("summary");
  const doc = useDocumentRegistryDetail(documentId);
  const postings = useDocumentPostings(doc.data?.docId ?? null);

  const refreshAll = () => {
    doc.refresh();
    postings.refresh();
  };

  if (doc.loading && !doc.data) {
    return <div className="p-6 text-sm text-muted-foreground">Loading document...</div>;
  }

  if (doc.error) {
    return (
      <div className="p-6 text-sm text-red-600">
        Error loading document: {doc.error}
      </div>
    );
  }

  if (!doc.data) {
    return <div className="p-6 text-sm text-muted-foreground">Document not found</div>;
  }

  const d = doc.data;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {onBack && (
              <button onClick={onBack} className="hover:text-foreground">
                <ChevronRight className="h-4 w-4 rotate-180" />
              </button>
            )}
            <span>{DOC_TYPE_LABELS[d.docType] ?? d.docType}</span>
            <span>/</span>
            <span>{d.entityCode}</span>
          </div>
          <h2 className="text-xl font-semibold font-mono">{d.docNo}</h2>
          <div className="flex items-center gap-3">
            <StatusBadgeCell status={d.status} />
            {d.sourceStatus !== d.status && (
              <span className="text-xs text-muted-foreground">
                Source: {d.sourceStatus}
              </span>
            )}
            <ApprovalRouteBadge route={d.approvalRoute} />
          </div>
        </div>
        <button
          onClick={refreshAll}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Governance banner */}
      <GovernanceBanner doc={d} postings={postings.data} />

      {/* Tab bar */}
      <div className="flex gap-1 border-b">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`inline-flex items-center gap-1 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === key
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="pt-2">
        {activeTab === "summary" && <SummaryTab doc={d} />}
        {activeTab === "posting" && (
          <PostingBridgeTab
            doc={d}
            postings={postings.data}
            loading={postings.loading}
          />
        )}
        {activeTab === "approval" && <ApprovalTab doc={d} />}
        {activeTab === "reversal" && <ReversalTab doc={d} />}
        {activeTab === "compliance" && (
          <ComplianceTab doc={d} postings={postings.data} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Governance Banner
// ---------------------------------------------------------------------------

function GovernanceBanner({
  doc,
  postings,
}: {
  doc: FinancialDocumentDTO;
  postings: FinancialDocumentPostingDTO[] | null;
}) {
  const issues: string[] = [];

  if (
    ["POSTED", "PARTIALLY_SETTLED", "SETTLED"].includes(doc.status) &&
    !doc.jeId
  ) {
    issues.push("Missing JE linkage");
  }
  if (
    doc.status === "REVERSED" &&
    !doc.reversingDocId &&
    !doc.reversedDocId
  ) {
    issues.push("Incomplete reversal chain");
  }
  if (
    ["PURCHASE_INVOICE", "PAYMENT_ENTRY"].includes(doc.docType) &&
    ["POSTED", "SETTLED"].includes(doc.status) &&
    !doc.approvalInstanceId
  ) {
    issues.push("No approval evidence");
  }
  if (postings && postings.some((p) => p.postingStatus === "FAILED")) {
    issues.push("Failed multi-book posting");
  }

  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
        <CheckCircle2 className="h-4 w-4" />
        Clean — no compliance exceptions
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
      <AlertTriangle className="h-4 w-4" />
      {issues.length} issue{issues.length > 1 ? "s" : ""}: {issues.join(", ")}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary Tab
// ---------------------------------------------------------------------------

function SummaryTab({ doc }: { doc: FinancialDocumentDTO }) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      {/* Identity */}
      <FieldGroup title="Document Identity">
        <Field label="Doc ID" value={doc.docId} mono />
        <Field label="Txn ID" value={doc.txnId} mono />
        <Field label="Doc Number" value={doc.docNo} />
        <Field label="Doc Type" value={DOC_TYPE_LABELS[doc.docType] ?? doc.docType} />
        <Field label="Entity Code" value={doc.entityCode} />
      </FieldGroup>

      {/* Source */}
      <FieldGroup title="Source">
        <Field label="Source Module" value={doc.sourceModule} />
        <Field label="Source Table" value={doc.sourceTable} mono />
        <Field label="Source Ref ID" value={doc.sourceRefId} mono />
      </FieldGroup>

      {/* Lifecycle */}
      <FieldGroup title="Lifecycle">
        <Field label="Canonical Status" value={doc.status} badge />
        <Field label="Source Status" value={doc.sourceStatus} />
        <Field label="Doc Date" value={doc.docDate} date />
        <Field label="Posting Date" value={doc.postingDate} date />
      </FieldGroup>

      {/* Financial */}
      <FieldGroup title="Financial">
        <Field label="Currency" value={doc.currencyCode} />
        <Field label="Total Amount" value={doc.totalAmount} money />
        <Field label="Counterparty Type" value={doc.counterpartyType ?? "--"} />
        <Field label="Counterparty ID" value={doc.counterpartyId ?? "--"} mono />
      </FieldGroup>

      {/* Audit */}
      <FieldGroup title="Audit Trail">
        <Field label="Created By" value={doc.createdBy ?? "--"} mono />
        <Field label="Created At" value={doc.createdAt} date />
        <Field label="Updated At" value={doc.updatedAt} date />
        <Field label="Last Lifecycle At" value={doc.lastLifecycleAt} date />
        <Field label="Last Posting Event" value={doc.lastPostingEventAt} date />
        <Field label="Last Event ID" value={doc.lastEventId ?? "--"} mono />
      </FieldGroup>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Posting Bridge Tab
// ---------------------------------------------------------------------------

function PostingBridgeTab({
  doc,
  postings,
  loading,
}: {
  doc: FinancialDocumentDTO;
  postings: FinancialDocumentPostingDTO[] | null;
  loading: boolean;
}) {
  return (
    <div className="space-y-4">
      {/* Primary JE linkage */}
      <FieldGroup title="Primary JE Linkage">
        <Field label="JE ID" value={doc.jeId ?? "--"} mono />
        <Field label="Book Code" value={doc.bookCode ?? "--"} />
        <Field label="Posted At" value={doc.postedAt} date />
        <Field label="Posted By" value={doc.postedBy ?? "--"} mono />
      </FieldGroup>

      {/* Multi-book bridge */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Multi-Book Postings</h4>
        {loading && (
          <div className="text-sm text-muted-foreground">Loading postings...</div>
        )}
        {postings && postings.length === 0 && (
          <div className="text-sm text-muted-foreground">
            No multi-book postings (single-book document)
          </div>
        )}
        {postings && postings.length > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Book</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">JE ID</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Status</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Posted At</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Reversed At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {postings.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium">{p.bookCode}</td>
                    <td className="px-3 py-2 font-mono text-xs">{p.jeId}</td>
                    <td className="px-3 py-2">
                      <StatusBadgeCell status={p.postingStatus} />
                    </td>
                    <td className="px-3 py-2">
                      <DateCell date={p.postedAt} />
                    </td>
                    <td className="px-3 py-2">
                      <DateCell date={p.reversedAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Approval Evidence Tab
// ---------------------------------------------------------------------------

function ApprovalTab({ doc }: { doc: FinancialDocumentDTO }) {
  const hasEvidence = doc.approvalInstanceId || doc.approvalRoute || doc.decisionScore;

  return (
    <div className="space-y-4">
      {!hasEvidence && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <AlertTriangle className="h-4 w-4" />
          No approval evidence on this document
          {["POSTED", "SETTLED", "PARTIALLY_SETTLED"].includes(doc.status) &&
            ["PURCHASE_INVOICE", "PAYMENT_ENTRY"].includes(doc.docType) && (
              <span className="ml-1 font-medium">
                — this may be a compliance gap
              </span>
            )}
        </div>
      )}

      <FieldGroup title="Approval Evidence">
        <Field
          label="Approval Instance ID"
          value={doc.approvalInstanceId ?? "--"}
          mono
        />
        <Field label="Approval Route" value={doc.approvalRoute ?? "--"} />
        <Field
          label="Decision Score"
          value={doc.decisionScore ? `${(Number(doc.decisionScore) * 100).toFixed(1)}%` : "--"}
        />
      </FieldGroup>

      {doc.approvalRoute && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Route Classification</h4>
          <div className="flex items-center gap-3">
            <ApprovalRouteBadge route={doc.approvalRoute} />
            <span className="text-sm text-muted-foreground">
              {doc.approvalRoute === "ZERO_APPROVAL" && "Auto-approved — below risk threshold"}
              {doc.approvalRoute === "STANDARD" && "Standard single-level approval"}
              {doc.approvalRoute === "ENHANCED" && "Enhanced multi-level approval required"}
              {doc.approvalRoute === "EXECUTIVE" && "Executive sign-off required"}
              {doc.approvalRoute === "BLOCKED" && "Blocked by policy — requires override"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reversal Chain Tab
// ---------------------------------------------------------------------------

function ReversalTab({ doc }: { doc: FinancialDocumentDTO }) {
  const hasReversal =
    doc.reversedDocId ||
    doc.reversingDocId ||
    doc.reversalReason ||
    doc.voidReasonCode;

  return (
    <div className="space-y-4">
      {!hasReversal && (
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          <CheckCircle2 className="h-4 w-4" />
          No reversal or void activity on this document
        </div>
      )}

      {hasReversal && (
        <>
          <FieldGroup title="Reversal Chain">
            <Field
              label="Reversed Doc ID"
              value={doc.reversedDocId ?? "--"}
              mono
              hint="Document that THIS document reverses (I am the reversal)"
            />
            <Field
              label="Reversing Doc ID"
              value={doc.reversingDocId ?? "--"}
              mono
              hint="Document that reversed THIS document (I was reversed by)"
            />
          </FieldGroup>

          <FieldGroup title="Reversal Metadata">
            <Field label="Reversal Reason" value={doc.reversalReason ?? "--"} />
            <Field label="Reversal At" value={doc.reversalAt} date />
            <Field label="Reversal By" value={doc.reversalBy ?? "--"} mono />
            <Field label="Void Reason Code" value={doc.voidReasonCode ?? "--"} />
          </FieldGroup>

          {/* Visual chain */}
          {(doc.reversedDocId || doc.reversingDocId) && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Chain Visualization</h4>
              <div className="flex items-center gap-2 text-sm">
                {doc.reversedDocId && (
                  <>
                    <span className="rounded border px-2 py-1 font-mono text-xs">
                      {doc.reversedDocId.slice(0, 8)}...
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    <span className="rounded border border-blue-200 bg-blue-50 px-2 py-1 font-mono text-xs font-medium">
                      {doc.docNo} (this)
                    </span>
                  </>
                )}
                {doc.reversingDocId && (
                  <>
                    <span className="rounded border border-blue-200 bg-blue-50 px-2 py-1 font-mono text-xs font-medium">
                      {doc.docNo} (this)
                    </span>
                    <ChevronRight className="h-4 w-4 text-red-400" />
                    <span className="rounded border border-red-200 bg-red-50 px-2 py-1 font-mono text-xs">
                      {doc.reversingDocId.slice(0, 8)}...
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compliance Flags Tab
// ---------------------------------------------------------------------------

function ComplianceTab({
  doc,
  postings,
}: {
  doc: FinancialDocumentDTO;
  postings: FinancialDocumentPostingDTO[] | null;
}) {
  const flags: Array<{ rule: string; severity: "error" | "warning"; message: string }> = [];

  // JE linkage check
  if (
    ["POSTED", "PARTIALLY_SETTLED", "SETTLED"].includes(doc.status) &&
    !doc.jeId
  ) {
    flags.push({
      rule: "TERMINAL_JE_LINKAGE",
      severity: "error",
      message: "Posted document has no journal entry linkage",
    });
  }

  // Reversal completeness
  if (doc.status === "REVERSED" && !doc.reversingDocId && !doc.reversedDocId) {
    flags.push({
      rule: "REVERSAL_CHAIN_INCOMPLETE",
      severity: "error",
      message: "Reversed document has no reversal chain pointers",
    });
  }

  // Approval evidence
  if (
    ["PURCHASE_INVOICE", "PAYMENT_ENTRY"].includes(doc.docType) &&
    ["POSTED", "SETTLED", "PARTIALLY_SETTLED"].includes(doc.status)
  ) {
    if (!doc.approvalInstanceId) {
      flags.push({
        rule: "POSTED_WITHOUT_APPROVAL",
        severity: "warning",
        message: "Posted without approval instance evidence",
      });
    }
    if (
      doc.approvalRoute &&
      ["STANDARD", "ENHANCED", "EXECUTIVE"].includes(doc.approvalRoute) &&
      !doc.decisionScore
    ) {
      flags.push({
        rule: "SCORING_MISSING",
        severity: "warning",
        message: `Governed route (${doc.approvalRoute}) without decision score`,
      });
    }
  }

  // Bridge completeness
  if (postings && postings.some((p) => p.postingStatus === "FAILED")) {
    flags.push({
      rule: "BRIDGE_FAILED_POSTING",
      severity: "error",
      message: "Multi-book posting bridge has failed entries",
    });
  }

  return (
    <div className="space-y-3">
      {flags.length === 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4" />
          All compliance checks passed
        </div>
      )}

      {flags.map((f, idx) => (
        <div
          key={idx}
          className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
            f.severity === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-amber-200 bg-amber-50 text-amber-700"
          }`}
        >
          {f.severity === "error" ? (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <div>
            <span className="font-medium">{f.rule}</span>
            <p className="text-xs opacity-80">{f.message}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared field components
// ---------------------------------------------------------------------------

function FieldGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2 rounded-lg border p-4">
      <h4 className="text-sm font-semibold text-muted-foreground">{title}</h4>
      <div className="grid grid-cols-1 gap-2">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  badge,
  date,
  money,
  hint,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
  badge?: boolean;
  date?: boolean;
  money?: boolean;
  hint?: string;
}) {
  const displayValue = value ?? "--";

  return (
    <div className="flex items-baseline justify-between gap-4">
      <div>
        <span className="text-xs text-muted-foreground">{label}</span>
        {hint && (
          <span className="ml-1 text-xs text-muted-foreground/60">({hint})</span>
        )}
      </div>
      <div className="text-right">
        {badge ? (
          <StatusBadgeCell status={displayValue} />
        ) : date ? (
          <DateCell date={displayValue === "--" ? null : displayValue} />
        ) : money ? (
          <MoneyCell amount={displayValue} />
        ) : (
          <span
            className={`text-sm ${mono ? "font-mono text-xs" : ""}`}
          >
            {displayValue}
          </span>
        )}
      </div>
    </div>
  );
}
