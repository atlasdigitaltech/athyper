"use client";

import { useMemo, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  FileWarning,
  Info,
  ListChecks,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import type { AccountingDistribution, DocumentLine } from "@athyper/api-contracts/documents";
import { fmtAmount } from "@athyper/runtime-shared/core";

type ReadinessStatus = "ready" | "warning" | "blocked";
type ExceptionSeverity = "warning" | "blocked" | "info";
type ComponentType =
  | "base"
  | "tax"
  | "withholding_tax"
  | "discount"
  | "charge"
  | "retention"
  | "advance_recovery"
  | "net_payable";

export interface CommercialComponent {
  id: string;
  componentType: ComponentType;
  label: string;
  source: string;
  basisAmount: number | null;
  rate: string | null;
  amount: number;
  treatment: string;
}

export interface DistributionProofLine {
  line: DocumentLine;
  lineAmount: number;
  distributedAmount: number;
  remainingAmount: number;
  distributions: AccountingDistribution[];
  missingDimensions: string[];
}

export interface EnginePreviewLine {
  seq: number;
  account: string;
  side: "Dr" | "Cr";
  amount: number;
  dimensions: string;
  resolution: string[];
}

export interface ReadinessException {
  id: string;
  severity: ExceptionSeverity;
  title: string;
  detail: string;
  actionLabel?: string;
  actionTarget?: "lines" | "distributions" | "tax" | "engine";
}

export interface AccountingReadinessPacket {
  documentType: string;
  documentId: string;
  currencyCode: string;
  readinessStatus: ReadinessStatus;
  profileCode: string | null;
  eventCode: string | null;
  bookCode: string | null;
  headerTotal: number;
  lineTotal: number;
  distributionTotal: number;
  components: CommercialComponent[];
  distributionProof: DistributionProofLine[];
  previewLines: EnginePreviewLine[];
  exceptions: ReadinessException[];
}

export interface AccountingReadinessPanelProps {
  entityCode: string;
  recordId: string;
  record: Record<string, unknown>;
  lines: DocumentLine[];
  distributions: AccountingDistribution[];
  isLoading?: boolean;
  currencyCode?: string;
  onOpenLines?: () => void;
}

const MONEY_EPSILON = 0.005;
const SUMMARY_BOX =
  "min-w-0 rounded-lg border border-border/40 bg-muted/20 px-3.5 py-3";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function textValue(value: unknown): string | null {
  if (value == null || typeof value === "object") return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function numberValue(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function firstNumber(record: Record<string, unknown>, fields: string[]): number | null {
  for (const field of fields) {
    const n = numberValue(record[field]);
    if (n != null) return n;
  }
  return null;
}

function firstText(record: Record<string, unknown>, fields: string[]): string | null {
  for (const field of fields) {
    const value = textValue(record[field]);
    if (value) return value;
  }
  return null;
}

function lineRecord(line: DocumentLine): Record<string, unknown> {
  return { ...(line as unknown as Record<string, unknown>), ...asRecord(line.data) };
}

function lineId(line: DocumentLine): string {
  return String((line as unknown as Record<string, unknown>)["id"] ?? "");
}

function lineNumber(line: DocumentLine): string {
  const row = lineRecord(line);
  return textValue(row["line_no"]) ?? textValue(row["line_number"]) ?? "-";
}

function lineDescription(line: DocumentLine): string {
  const row = lineRecord(line);
  return firstText(row, ["item_description", "description", "name", "item_code"]) ?? "Line";
}

function lineAmount(line: DocumentLine): number {
  const row = lineRecord(line);
  return firstNumber(row, ["net_amount", "line_amount", "gross_amount"]) ?? 0;
}

function lineGrossAmount(line: DocumentLine): number {
  const row = lineRecord(line);
  return firstNumber(row, ["gross_amount", "line_amount", "net_amount"]) ?? 0;
}

function lineTaxAmount(line: DocumentLine): number {
  return firstNumber(lineRecord(line), ["tax_amount"]) ?? 0;
}

function lineWhtAmount(line: DocumentLine): number {
  return firstNumber(lineRecord(line), ["withholding_tax_amount", "wht_amount"]) ?? 0;
}

function lineDiscountAmount(line: DocumentLine): number {
  return firstNumber(lineRecord(line), ["discount_amount"]) ?? 0;
}

function lineRetentionAmount(line: DocumentLine): number {
  return firstNumber(lineRecord(line), ["retention_amount"]) ?? 0;
}

function lineHasValue(line: DocumentLine, fields: string[]): boolean {
  const row = lineRecord(line);
  return fields.some((field) => textValue(row[field]) != null || numberValue(row[field]) != null);
}

function headerAmount(record: Record<string, unknown>): number {
  return firstNumber(record, [
    "total_amount",
    "gross_amount",
    "invoice_total",
    "document_total",
    "payable_amount",
    "net_amount",
    "subtotal_amount",
  ]) ?? 0;
}

function headerDiscount(record: Record<string, unknown>): number {
  return firstNumber(record, ["discount_amount"]) ?? 0;
}

function headerCharges(record: Record<string, unknown>): number {
  return (
    (firstNumber(record, ["freight_amount"]) ?? 0) +
    (firstNumber(record, ["misc_charges_amount", "charges_amount", "charge_amount"]) ?? 0)
  );
}

function headerAdvanceRecovery(record: Record<string, unknown>): number {
  return firstNumber(record, [
    "advance_deduction_amount",
    "advance_recovery_amount",
    "advance_recovered_amount",
  ]) ?? 0;
}

function headerRetention(record: Record<string, unknown>): number {
  return firstNumber(record, ["retention_amount"]) ?? 0;
}

function shortId(value: unknown): string {
  const text = textValue(value);
  if (!text) return "-";
  return text.length > 12 ? `${text.slice(0, 8)}...` : text;
}

function sourceLineNumber(line: DocumentLine): string {
  return `Line ${lineNumber(line)}`;
}

function rateLabel(amount: number, basis: number): string | null {
  if (basis === 0 || amount === 0) return null;
  return `${Math.abs((amount / basis) * 100).toFixed(2)}%`;
}

function currencyFrom(record: Record<string, unknown>, explicit?: string): string {
  return (
    textValue(explicit) ??
    firstText(record, ["currency_code", "document_currency_code", "base_currency_code"]) ??
    ""
  );
}

function fmtSigned(amount: number, currency: string): string {
  const text = fmtAmount(Math.abs(amount), currency);
  return amount < 0 ? `(${text})` : text;
}

function resolutionLabel(source: unknown): string {
  const text = textValue(source) ?? "FROM_CATEGORY";
  return text
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusTone(status: ReadinessStatus): string {
  if (status === "ready") return "border-success/25 bg-success/10 text-success";
  if (status === "blocked") return "border-destructive/30 bg-destructive/10 text-destructive";
  return "border-warning/30 bg-warning/10 text-warning";
}

function severityTone(severity: ExceptionSeverity): string {
  if (severity === "blocked") return "border-l-destructive";
  if (severity === "warning") return "border-l-warning";
  return "border-l-info";
}

function severityIcon(severity: ExceptionSeverity): ReactNode {
  if (severity === "info") return <Info className="h-4 w-4 text-info" />;
  return <AlertTriangle className={cn("h-4 w-4", severity === "blocked" ? "text-destructive" : "text-warning")} />;
}

function distributionProof(
  lines: DocumentLine[],
  distributions: AccountingDistribution[],
): DistributionProofLine[] {
  const byLine = new Map<string, AccountingDistribution[]>();
  for (const dist of distributions) {
    const key = String(dist.source_line_id ?? "");
    if (!key) continue;
    const list = byLine.get(key) ?? [];
    list.push(dist);
    byLine.set(key, list);
  }

  return lines.map((line) => {
    const id = lineId(line);
    const lineDists = byLine.get(id) ?? [];
    const amount = lineAmount(line);
    const distributedAmount = lineDists.reduce((sum, dist) => sum + (numberValue(dist.distributed_amount) ?? 0), 0);
    const missingDimensions: string[] = [];
    if (lineDists.some((dist) => !dist.cost_center_id)) missingDimensions.push("cost center");
    if (lineDists.some((dist) => !dist.project_id) && lineHasValue(line, ["project_id"])) missingDimensions.push("project");
    return {
      line,
      lineAmount: amount,
      distributedAmount,
      remainingAmount: amount - distributedAmount,
      distributions: lineDists,
      missingDimensions,
    };
  });
}

function buildComponents(
  record: Record<string, unknown>,
  lines: DocumentLine[],
): CommercialComponent[] {
  const components: CommercialComponent[] = [];
  for (const line of lines) {
    const amount = lineAmount(line);
    if (Math.abs(amount) <= MONEY_EPSILON) continue;
    components.push({
      id: `base:${lineId(line)}`,
      componentType: "base",
      label: `Base - ${lineDescription(line)}`,
      source: sourceLineNumber(line),
      basisAmount: null,
      rate: null,
      amount,
      treatment: "Expense or asset, included",
    });
  }

  const baseTotal = lines.reduce((sum, line) => sum + lineAmount(line), 0);
  const taxAmount = lines.reduce((sum, line) => sum + lineTaxAmount(line), 0);
  if (Math.abs(taxAmount) > MONEY_EPSILON) {
    components.push({
      id: "tax",
      componentType: "tax",
      label: "Tax",
      source: "Tax group",
      basisAmount: baseTotal,
      rate: rateLabel(taxAmount, baseTotal),
      amount: taxAmount,
      treatment: "Recoverable or expensed by rule",
    });
  }

  const whtAmount = lines.reduce((sum, line) => sum + lineWhtAmount(line), 0);
  if (Math.abs(whtAmount) > MONEY_EPSILON) {
    components.push({
      id: "withholding_tax",
      componentType: "withholding_tax",
      label: "Withholding tax",
      source: "WHT group",
      basisAmount: baseTotal,
      rate: rateLabel(whtAmount, baseTotal),
      amount: -Math.abs(whtAmount),
      treatment: "Withheld at post",
    });
  }

  const lineDiscount = lines.reduce((sum, line) => sum + lineDiscountAmount(line), 0);
  const discount = lineDiscount + headerDiscount(record);
  if (Math.abs(discount) > MONEY_EPSILON) {
    components.push({
      id: "discount",
      componentType: "discount",
      label: "Discount",
      source: lineDiscount ? "Line discount" : "Header discount",
      basisAmount: baseTotal,
      rate: rateLabel(discount, baseTotal),
      amount: -Math.abs(discount),
      treatment: "Reduces expense or posts separately by rule",
    });
  }

  const charges = headerCharges(record);
  if (Math.abs(charges) > MONEY_EPSILON) {
    components.push({
      id: "charges",
      componentType: "charge",
      label: "Charges",
      source: "Header charges",
      basisAmount: baseTotal,
      rate: null,
      amount: charges,
      treatment: "Allocated or posted by charge rule",
    });
  }

  const lineRetention = lines.reduce((sum, line) => sum + lineRetentionAmount(line), 0);
  const retention = lineRetention || headerRetention(record);
  if (Math.abs(retention) > MONEY_EPSILON) {
    components.push({
      id: "retention",
      componentType: "retention",
      label: "Retention",
      source: "Terms or contract",
      basisAmount: baseTotal,
      rate: rateLabel(retention, baseTotal),
      amount: -Math.abs(retention),
      treatment: "Hold payable until release event",
    });
  }

  const advanceRecovery = headerAdvanceRecovery(record);
  if (Math.abs(advanceRecovery) > MONEY_EPSILON) {
    components.push({
      id: "advance_recovery",
      componentType: "advance_recovery",
      label: "Advance recovery",
      source: "Prior advance",
      basisAmount: headerAmount(record) || baseTotal,
      rate: null,
      amount: -Math.abs(advanceRecovery),
      treatment: "Clears advance balance",
    });
  }

  const netPayable = components.reduce((sum, component) => sum + component.amount, 0);
  components.push({
    id: "net_payable",
    componentType: "net_payable",
    label: "Net payable",
    source: "Derived",
    basisAmount: null,
    rate: null,
    amount: netPayable,
    treatment: "Supplier liability",
  });

  return components;
}

function buildExceptions(
  record: Record<string, unknown>,
  proof: DistributionProofLine[],
  components: CommercialComponent[],
  headerTotal: number,
  lineTotal: number,
): ReadinessException[] {
  const exceptions: ReadinessException[] = [];
  if (headerTotal !== 0 && Math.abs(headerTotal - lineTotal) > MONEY_EPSILON) {
    exceptions.push({
      id: "header-line-mismatch",
      severity: "blocked",
      title: `Header total differs from line total by ${Math.abs(headerTotal - lineTotal).toFixed(2)}`,
      detail: "Header totals must derive from lines before posting.",
      actionLabel: "Review lines",
      actionTarget: "lines",
    });
  }

  for (const item of proof) {
    if (item.distributions.length === 0) {
      exceptions.push({
        id: `distribution-missing:${lineId(item.line)}`,
        severity: "warning",
        title: `${sourceLineNumber(item.line)} has no accounting distribution`,
        detail: "The engine can derive a fallback, but distribution proof is incomplete.",
        actionLabel: "Add distribution",
        actionTarget: "distributions",
      });
      continue;
    }
    if (Math.abs(item.remainingAmount) > MONEY_EPSILON) {
      exceptions.push({
        id: `distribution-gap:${lineId(item.line)}`,
        severity: "warning",
        title: `${sourceLineNumber(item.line)} distribution total is short by ${Math.abs(item.remainingAmount).toFixed(2)}`,
        detail: "Distributed amount should reconcile to the commercial line amount.",
        actionLabel: "Fix distributions",
        actionTarget: "distributions",
      });
    }
    if (item.missingDimensions.length > 0) {
      exceptions.push({
        id: `dimension-missing:${lineId(item.line)}`,
        severity: "warning",
        title: `${sourceLineNumber(item.line)} missing ${item.missingDimensions.join(", ")}`,
        detail: "Dimension rules may use a fallback. Pick values to avoid implicit posting.",
        actionLabel: "Set dimensions",
        actionTarget: "distributions",
      });
    }
  }

  const lines = proof.map((item) => item.line);
  const taxAmount = components.find((item) => item.componentType === "tax")?.amount ?? 0;
  if (Math.abs(taxAmount) > MONEY_EPSILON && lines.some((line) => !lineHasValue(line, ["tax_group_id"]))) {
    exceptions.push({
      id: "tax-group-missing",
      severity: "warning",
      title: "Tax amount exists on a line without tax group",
      detail: "Tax posting should be traceable to a tax component or tax group.",
      actionLabel: "Review tax",
      actionTarget: "tax",
    });
  }

  const whtAmount = components.find((item) => item.componentType === "withholding_tax")?.amount ?? 0;
  if (Math.abs(whtAmount) > MONEY_EPSILON && lines.some((line) => !lineHasValue(line, ["withholding_tax_group_id"]))) {
    exceptions.push({
      id: "wht-group-missing",
      severity: "warning",
      title: "Withholding tax exists without WHT group",
      detail: "WHT should be tied to the supplier, rule, or manual component.",
      actionLabel: "Review WHT",
      actionTarget: "tax",
    });
  }

  const profileCode = firstText(record, ["accounting_profile_code", "acct_profile_code", "profile_code"]);
  if (!profileCode) {
    exceptions.push({
      id: "profile-inferred",
      severity: "info",
      title: "Accounting profile will be resolved by engine",
      detail: "No explicit profile code is stored on this document. Intent and document type will drive resolution.",
      actionLabel: "Engine preview",
      actionTarget: "engine",
    });
  }

  return exceptions;
}

function buildPreviewLines(
  proof: DistributionProofLine[],
  components: CommercialComponent[],
): EnginePreviewLine[] {
  const preview: EnginePreviewLine[] = [];
  let seq = 10;

  for (const item of proof) {
    if (item.distributions.length > 0) {
      for (const dist of item.distributions) {
        const amount = numberValue(dist.distributed_amount) ?? 0;
        if (Math.abs(amount) <= MONEY_EPSILON) continue;
        const source = textValue(dist.account_source) ?? "FROM_CATEGORY";
        preview.push({
          seq,
          account: dist.account_code ? `${dist.account_code} expense` : `${lineDescription(item.line)} expense`,
          side: "Dr",
          amount,
          dimensions: [
            dist.cost_center_id ? `CC ${shortId(dist.cost_center_id)}` : "CC ?",
            dist.project_id ? `Project ${shortId(dist.project_id)}` : null,
          ].filter(Boolean).join(" - "),
          resolution: [resolutionLabel(source), ...(dist.account_code ? ["Fixed Override"] : [])],
        });
        seq += 10;
      }
    } else if (Math.abs(item.lineAmount) > MONEY_EPSILON) {
      preview.push({
        seq,
        account: `${lineDescription(item.line)} expense`,
        side: "Dr",
        amount: item.lineAmount,
        dimensions: "Line dimensions",
        resolution: ["From Category"],
      });
      seq += 10;
    }
  }

  const tax = components.find((item) => item.componentType === "tax");
  if (tax && Math.abs(tax.amount) > MONEY_EPSILON) {
    preview.push({
      seq,
      account: "Input tax recoverable",
      side: "Dr",
      amount: Math.abs(tax.amount),
      dimensions: "-",
      resolution: ["Posting Role"],
    });
    seq += 10;
  }

  const advance = components.find((item) => item.componentType === "advance_recovery");
  if (advance && Math.abs(advance.amount) > MONEY_EPSILON) {
    preview.push({
      seq,
      account: "Supplier advance clearing",
      side: "Cr",
      amount: Math.abs(advance.amount),
      dimensions: "-",
      resolution: ["Posting Role"],
    });
    seq += 10;
  }

  const wht = components.find((item) => item.componentType === "withholding_tax");
  if (wht && Math.abs(wht.amount) > MONEY_EPSILON) {
    preview.push({
      seq,
      account: "WHT payable",
      side: "Cr",
      amount: Math.abs(wht.amount),
      dimensions: "-",
      resolution: ["Posting Role"],
    });
    seq += 10;
  }

  const discount = components.find((item) => item.componentType === "discount");
  if (discount && Math.abs(discount.amount) > MONEY_EPSILON) {
    preview.push({
      seq,
      account: "Purchase Discount / Expense Offset",
      side: "Cr",
      amount: Math.abs(discount.amount),
      dimensions: discount.source === "Line discount" ? "Line allocation" : "-",
      resolution: ["From Intent", "Discount"],
    });
    seq += 10;
  }

  const retention = components.find((item) => item.componentType === "retention");
  if (retention && Math.abs(retention.amount) > MONEY_EPSILON) {
    preview.push({
      seq,
      account: "AP retention payable",
      side: "Cr",
      amount: Math.abs(retention.amount),
      dimensions: "Terms",
      resolution: ["Posting Role"],
    });
    seq += 10;
  }

  const debitTotal = preview
    .filter((item) => item.side === "Dr")
    .reduce((sum, item) => sum + item.amount, 0);
  const creditTotal = preview
    .filter((item) => item.side === "Cr")
    .reduce((sum, item) => sum + item.amount, 0);
  const remainder = debitTotal - creditTotal;
  if (Math.abs(remainder) > MONEY_EPSILON) {
    preview.push({
      seq,
      account: "AP trade payable",
      side: remainder >= 0 ? "Cr" : "Dr",
      amount: Math.abs(remainder),
      dimensions: "Supplier",
      resolution: ["Posting Role", "Remainder"],
    });
  }

  return preview;
}

function buildReadinessPacket({
  entityCode,
  recordId,
  record,
  lines,
  distributions,
  currencyCode,
}: {
  entityCode: string;
  recordId: string;
  record: Record<string, unknown>;
  lines: DocumentLine[];
  distributions: AccountingDistribution[];
  currencyCode?: string;
}): AccountingReadinessPacket {
  const currency = currencyFrom(record, currencyCode || distributions[0]?.currency_code);
  const components = buildComponents(record, lines);
  const proof = distributionProof(lines, distributions);
  const headerTotal = headerAmount(record);
  const lineTotal = lines.reduce((sum, line) => sum + lineAmount(line), 0);
  const distributionTotal = distributions.reduce((sum, dist) => sum + (numberValue(dist.distributed_amount) ?? 0), 0);
  const exceptions = buildExceptions(record, proof, components, headerTotal, lineTotal);
  const previewLines = buildPreviewLines(proof, components);
  const hasBlocked = exceptions.some((item) => item.severity === "blocked");
  const hasWarning = exceptions.some((item) => item.severity === "warning");

  return {
    documentType: entityCode,
    documentId: recordId,
    currencyCode: currency,
    readinessStatus: hasBlocked ? "blocked" : hasWarning ? "warning" : "ready",
    profileCode: firstText(record, ["accounting_profile_code", "acct_profile_code", "profile_code"]),
    eventCode: firstText(record, ["accounting_event_code", "posting_event_code", "event_code"]),
    bookCode: firstText(record, ["book_code", "ledger_book_code"]),
    headerTotal,
    lineTotal,
    distributionTotal,
    components,
    distributionProof: proof,
    previewLines,
    exceptions,
  };
}

function SectionHeader({ index, title, aside }: { index: number; title: string; aside?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="shrink-0 text-xs font-medium text-muted-foreground">
        {index} - {title}
      </span>
      <span className="h-px flex-1 bg-border/70" />
      {aside}
    </div>
  );
}

function StatusBadge({ status }: { status: ReadinessStatus }) {
  const icon = status === "ready"
    ? <CheckCircle2 className="h-4 w-4" />
    : <AlertTriangle className="h-4 w-4" />;
  const label = status === "ready"
    ? "Ready"
    : status === "blocked"
      ? "Blocked"
      : "Warning";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium", statusTone(status))}>
      {icon}
      {label}
    </span>
  );
}

function MetricBox({
  label,
  value,
  detail,
  status,
}: {
  label: string;
  value: string;
  detail: string;
  status: "ok" | "warning" | "info";
}) {
  return (
    <div className={SUMMARY_BOX}>
      <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-center gap-1.5">
        {status === "ok" ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
        ) : status === "warning" ? (
          <AlertTriangle className="h-3.5 w-3.5 text-warning" />
        ) : (
          <Info className="h-3.5 w-3.5 text-info" />
        )}
        <span className={cn("truncate text-sm font-medium", status === "warning" ? "text-warning" : "text-foreground")}>
          {value}
        </span>
      </div>
      <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function TreatmentPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex rounded-md border border-border/50 bg-muted/30 px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {children}
    </span>
  );
}

function ResolutionPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex rounded-md border border-info/20 bg-info/10 px-1.5 py-0.5 text-xs font-medium text-info">
      {children}
    </span>
  );
}

export function AccountingReadinessPanel({
  entityCode,
  recordId,
  record,
  lines,
  distributions,
  isLoading,
  currencyCode,
  onOpenLines,
}: AccountingReadinessPanelProps) {
  const packet = useMemo(
    () => buildReadinessPacket({ entityCode, recordId, record, lines, distributions, currencyCode }),
    [currencyCode, distributions, entityCode, lines, record, recordId],
  );

  const issueCounts = useMemo(() => ({
    blocked: packet.exceptions.filter((item) => item.severity === "blocked").length,
    warning: packet.exceptions.filter((item) => item.severity === "warning").length,
    info: packet.exceptions.filter((item) => item.severity === "info").length,
  }), [packet.exceptions]);

  const headerDiff = Math.abs(packet.headerTotal - packet.lineTotal);
  const distDiff = Math.abs(packet.lineTotal - packet.distributionTotal);
  const taxMissing = packet.exceptions.some((item) => item.id.includes("tax") || item.id.includes("wht"));
  const dimensionMissing = packet.exceptions.filter((item) => item.id.startsWith("dimension-missing")).length;
  const debitTotal = packet.previewLines.filter((item) => item.side === "Dr").reduce((sum, item) => sum + item.amount, 0);
  const creditTotal = packet.previewLines.filter((item) => item.side === "Cr").reduce((sum, item) => sum + item.amount, 0);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-20 animate-pulse rounded-lg bg-muted/40" />
        <div className="grid gap-2 md:grid-cols-4">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-lg bg-muted/30" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-medium text-foreground">Accounting Readiness</h2>
            <StatusBadge status={packet.readinessStatus} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {packet.profileCode ?? "Profile resolved at posting"} - {packet.eventCode ?? "event from lifecycle"} - {packet.bookCode ?? "primary book"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium text-muted-foreground">Projected balance</p>
          <p className={cn(
            "mt-1 text-sm font-medium tabular-nums",
            Math.abs(debitTotal - creditTotal) <= MONEY_EPSILON ? "text-success" : "text-warning",
          )}>
            Dr {fmtAmount(debitTotal, packet.currencyCode)} / Cr {fmtAmount(creditTotal, packet.currencyCode)}
          </p>
        </div>
      </div>

      <section className="space-y-3">
        <SectionHeader index={1} title="Readiness Summary" />
        <div className={cn("rounded-lg border px-4 py-3", statusTone(packet.readinessStatus))}>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background/70">
              {packet.readinessStatus === "ready" ? <ShieldCheck className="h-4 w-4" /> : <FileWarning className="h-4 w-4" />}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {packet.readinessStatus === "ready"
                  ? "Ready to post"
                  : packet.readinessStatus === "blocked"
                    ? `${issueCounts.blocked} blocking issue${issueCounts.blocked === 1 ? "" : "s"}`
                    : `${issueCounts.warning} warning${issueCounts.warning === 1 ? "" : "s"}, posting may require override`}
              </p>
              <p className="mt-0.5 text-xs">
                {issueCounts.blocked} blocked - {issueCounts.warning} warning - {issueCounts.info} info
              </p>
            </div>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-4">
          <MetricBox
            label="Header vs lines"
            value={headerDiff <= MONEY_EPSILON ? "Matched" : `Off by ${fmtAmount(headerDiff, packet.currencyCode)}`}
            detail={`${fmtAmount(packet.headerTotal, packet.currencyCode)} vs ${fmtAmount(packet.lineTotal, packet.currencyCode)}`}
            status={headerDiff <= MONEY_EPSILON ? "ok" : "warning"}
          />
          <MetricBox
            label="Distribution coverage"
            value={distDiff <= MONEY_EPSILON ? "Fully allocated" : `Short ${fmtAmount(distDiff, packet.currencyCode)}`}
            detail={`${fmtAmount(packet.distributionTotal, packet.currencyCode)} of ${fmtAmount(packet.lineTotal, packet.currencyCode)}`}
            status={distDiff <= MONEY_EPSILON ? "ok" : "warning"}
          />
          <MetricBox
            label="Tax components"
            value={taxMissing ? "Review needed" : "Resolved"}
            detail="Tax and WHT groups linked when present"
            status={taxMissing ? "warning" : "ok"}
          />
          <MetricBox
            label="Dimension coverage"
            value={dimensionMissing === 0 ? "Complete" : `${dimensionMissing} missing`}
            detail={dimensionMissing === 0 ? "No missing split dimensions" : "Fallback may be used"}
            status={dimensionMissing === 0 ? "ok" : "warning"}
          />
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader index={2} title="Commercial Components" />
        <div className="overflow-hidden rounded-lg border border-border/70">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs font-medium text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Component</th>
                <th className="px-3 py-2 text-left">Source</th>
                <th className="px-3 py-2 text-right">Basis</th>
                <th className="px-3 py-2 text-right">Rate</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-left">Treatment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {packet.components.map((component) => (
                <tr key={component.id} className={component.componentType === "net_payable" ? "bg-muted/20 font-medium" : undefined}>
                  <td className="px-3 py-2">{component.label}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{component.source}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {component.basisAmount == null ? "-" : fmtAmount(component.basisAmount, packet.currencyCode)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{component.rate ?? "-"}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{fmtSigned(component.amount, packet.currencyCode)}</td>
                  <td className="px-3 py-2"><TreatmentPill>{component.treatment}</TreatmentPill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader index={3} title="Distributions" />
        <div className="space-y-3">
          {packet.distributionProof.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
              No lines available for distribution proof.
            </div>
          ) : packet.distributionProof.map((item) => {
            const allocatedPct = item.lineAmount !== 0 ? (item.distributedAmount / item.lineAmount) * 100 : 0;
            const fullyAllocated = Math.abs(item.remainingAmount) <= MONEY_EPSILON;
            return (
              <div key={lineId(item.line)} className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {sourceLineNumber(item.line)} - {lineDescription(item.line)}
                  </p>
                  <p className={cn("text-xs font-medium tabular-nums", fullyAllocated ? "text-success" : "text-warning")}>
                    {allocatedPct.toFixed(2)}% allocated - {fmtAmount(item.distributedAmount, packet.currencyCode)}
                  </p>
                </div>
                <div className="overflow-hidden rounded-lg border border-border/70">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30 text-xs font-medium text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-center">%</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2 text-left">Cost center</th>
                        <th className="px-3 py-2 text-left">Project</th>
                        <th className="px-3 py-2 text-left">Account source</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {item.distributions.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-3 text-center text-xs text-muted-foreground">
                            No distribution rows. The engine may fall back to line-level dimensions.
                          </td>
                        </tr>
                      ) : item.distributions.map((dist) => (
                        <tr key={dist.id}>
                          <td className="px-3 py-2 text-center tabular-nums">{dist.split_pct ?? "-"}</td>
                          <td className="px-3 py-2 text-right font-medium tabular-nums">{fmtAmount(numberValue(dist.distributed_amount) ?? 0, packet.currencyCode)}</td>
                          <td className="px-3 py-2">{dist.cost_center_id ? shortId(dist.cost_center_id) : <span className="text-warning">missing</span>}</td>
                          <td className="px-3 py-2">{dist.project_id ? shortId(dist.project_id) : "-"}</td>
                          <td className="px-3 py-2"><ResolutionPill>{resolutionLabel(dist.account_source)}</ResolutionPill></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader
          index={4}
          title="Engine Preview"
          aside={<span className="text-xs text-muted-foreground">Local estimate until engine preview endpoint is connected</span>}
        />
        <div className="overflow-hidden rounded-lg border border-border/70">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs font-medium text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Account</th>
                <th className="px-3 py-2 text-center">Dr/Cr</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-left">Dimensions</th>
                <th className="px-3 py-2 text-left">Resolution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {packet.previewLines.map((line) => (
                <tr key={line.seq}>
                  <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">{line.seq}</td>
                  <td className="px-3 py-2 font-medium">{line.account}</td>
                  <td className={cn("px-3 py-2 text-center font-medium", line.side === "Dr" ? "text-info" : "text-destructive")}>{line.side}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtAmount(line.amount, packet.currencyCode)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{line.dimensions}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {line.resolution.map((item) => <ResolutionPill key={item}>{item}</ResolutionPill>)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border/70 bg-muted/20 text-xs">
              <tr>
                <td colSpan={3} className="px-3 py-2 font-medium">Projected balance</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">
                  Dr {fmtAmount(debitTotal, packet.currencyCode)} / Cr {fmtAmount(creditTotal, packet.currencyCode)}
                </td>
                <td className="px-3 py-2 text-muted-foreground" colSpan={2}>
                  {Math.abs(debitTotal - creditTotal) <= MONEY_EPSILON ? "balanced" : "review required"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader index={5} title="Exceptions" />
        {packet.exceptions.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-success/25 bg-success/10 px-4 py-3 text-sm text-success">
            <ListChecks className="h-4 w-4" />
            No accounting readiness exceptions found.
          </div>
        ) : (
          <div className="space-y-2">
            {packet.exceptions.map((item) => (
              <div
                key={item.id}
                className={cn("flex items-start gap-3 rounded-lg border border-border/70 border-l-4 bg-background px-3 py-3", severityTone(item.severity))}
              >
                <div className="mt-0.5">{severityIcon(item.severity)}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>
                </div>
                {item.actionLabel && (
                  <button
                    type="button"
                    onClick={item.actionTarget === "lines" || item.actionTarget === "distributions" ? onOpenLines : undefined}
                    className="shrink-0 text-xs font-medium text-info transition-colors hover:text-foreground"
                  >
                    {item.actionLabel}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        <CircleDollarSign className="h-4 w-4" />
        The preview is a business-facing proof packet. Posting accounts and books should be finalized by the accounting profile engine.
      </div>
    </div>
  );
}
