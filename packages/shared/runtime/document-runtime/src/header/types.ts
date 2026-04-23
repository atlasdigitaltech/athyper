/**
 * @athyper/document-runtime — Approvable Document Header DTO
 *
 * Canonical UI-side contract for all approvable document headers.
 * Entity mappers (invoice, PO, payment-entry, etc.) produce this shape.
 * Covers: identity, party, money, dates, references, responsibility,
 * approval-flow steps, context counters, and action descriptors.
 */

import type { SemanticIntent } from "@athyper/theme/semantic-colors";
import type { StatusDimension, ActionBundleItem } from "@athyper/api-contracts/documents";

// ── Primitives ──────────────────────────────────────────────────────────────

export type HeaderMode = "expanded" | "collapsed" | "pinned";

export interface ApprovableAction {
  /** Opaque action code passed back via onAction() */
  action: string;
  label: string;
}

// ── Sub-sections ────────────────────────────────────────────────────────────

export interface ApprovableIdentity {
  /** Display chip label, e.g. "INVOICE", "PURCHASE ORDER" */
  typeLabel: string;
  /** Primary document number, e.g. "INV202610026" */
  number: string;
  /** Optional version badge, e.g. "v2" */
  version?: string;
  /** Short document title / description shown below the doc number */
  title?: string;
  /** Human-readable status, e.g. "Approved" */
  statusLabel: string;
  statusIntent: SemanticIntent;
}

export interface ApprovableParty {
  id: string;
  /** Full legal name */
  name: string;
  /** Two-letter initials rendered in avatar */
  initials: string;
  /** Secondary line: "Riyadh, SA · 42 Invoices YTD" */
  subtitle?: string;
  /** Tailwind bg class override, e.g. "bg-teal-600". Defaults to primary. */
  avatarColor?: string;
  verified?: boolean;
}

export interface ApprovableMoney {
  /** Header label, e.g. "INVOICE TOTAL" */
  totalLabel?: string;
  /** Currency code, e.g. "SAR" */
  currency: string;
  /** Pre-formatted amount without currency, e.g. "3,219,293.88" */
  formatted: string;
  /** Pre-formatted subtotal line, e.g. "2,799,383.11" */
  subtotal?: string;
  /** Pre-formatted tax line, e.g. "419,606.77" */
  tax?: string;
  /** e.g. "Net 30" */
  paymentTerms?: string;
  /** e.g. "2/10" */
  earlyPayDiscount?: string;
}

export interface ApprovableDueMeta {
  label: string;
  intent: "info" | "warning" | "error";
}

export interface ApprovableDates {
  /** Header label, e.g. "INVOICE DATE" */
  documentDateLabel?: string;
  /** Pre-formatted document date, e.g. "18 Mar 2026" */
  documentDate: string;
  /** Pre-formatted due date, e.g. "17 Apr 2026" */
  dueDate?: string;
  /** Chip shown beside the due date: "Due today", "3 days overdue" */
  dueMeta?: ApprovableDueMeta;
  /** Pre-formatted creation timestamp, e.g. "18 Mar 2026 14:22 AST" */
  createdAt?: string;
}

/** Canonical lifecycle + audit trail fields from the DB record. */
export interface ApprovableAudit {
  /** Formatted created_at timestamp */
  createdAt?: string;
  /** Display name of the creator (created_by) */
  createdBy?: string;
  /** Formatted updated_at timestamp */
  updatedAt?: string;
  /** Display name of the last editor (updated_by) */
  updatedBy?: string;
  /** Formatted status_changed_at timestamp */
  statusChangedAt?: string;
  /** Display name of who last changed the status */
  statusChangedBy?: string;
}

export interface ApprovableReference {
  /** e.g. "PO REFERENCE", "CONTRACT" */
  label: string;
  /** e.g. "Multi-Parent", "CTR-0042" */
  value: string;
  url?: string;
  /**
   * Rendering hint derived from the entity field's data_type.
   * "code"   → monospace pill (uuid, reference)
   * "date"   → plain formatted date
   * "amount" → numeric value
   * "enum"   → formatted label
   * "text"   → default plain text
   */
  valueType?: "text" | "code" | "date" | "amount" | "enum";
  /** Secondary line shown below the value in the KPI strip cell */
  subValue?: string;
}

export interface ApprovableFlowStep {
  name: string;
  status: "completed" | "current" | "pending" | "blocked";
  /** Assignee display name */
  assignee?: string;
  /** Contextual note: "2/3 hrs", "next: 17 Apr" */
  note?: string;
}

// ── Progress rail ───────────────────────────────────────────────────────────

export type SlaStatus =
  | "on_track"          // elapsed < 75% of target
  | "at_risk"           // elapsed 75–100% of target
  | "breached"          // elapsed > 100% of target, stage still active
  | "completed_ok"      // completed within SLA target
  | "completed_late";   // completed after SLA target

export interface ProgressStage {
  key: string;
  label: string;
  reachedAt?: string;
  actor?: string;
  targetAt?: string;
  /** Human-readable duration this stage took / has been running, e.g. "2h 30m" */
  durationLabel?: string;
  /** SLA compliance status — only present when slaTargetHours is known */
  slaStatus?: SlaStatus;
  /** SLA target in hours from the bound workflow_sla_policy */
  slaTargetHours?: number;
}

export interface ProgressRail {
  stages: ProgressStage[];
  currentKey: string;
  stepIndex: number;
  nextActionCopy?: string;
}

// ── Root DTO ────────────────────────────────────────────────────────────────

export interface ApprovableDocumentHeaderDTO {
  identity: ApprovableIdentity;

  /** Primary business party (supplier / customer) */
  party?: ApprovableParty;

  /** Financial totals */
  money?: ApprovableMoney;

  /** Key dates */
  dates?: ApprovableDates;

  /** Related document references rendered in the metadata row */
  references?: ApprovableReference[];

  /** Submitter display name */
  submittedBy?: string;

  costCenter?: { code: string; name: string };

  /** Horizontal approval flow shown in expanded mode */
  approvalFlow?: ApprovableFlowStep[];

  /**
   * Context counters — consumed by the caller when building the tabs array.
   * Not rendered directly; kept here so mappers have a single output shape.
   */
  context?: {
    lineItems?: number;
    attachments?: number;
    historyEvents?: number;
    comments?: number;
  };

  /**
   * Multi-dimensional status badges (lifecycle, accounting, settlement, matching).
   * When present, renders StatusBadgeStrip in the header identity bar.
   */
  statusDimensions?: StatusDimension[];

  /**
   * State-adaptive action bundle. When present, replaces the simple
   * primaryAction/secondaryActions/destructiveAction model with grouped
   * actions (primary/working/output/overflow).
   */
  actionBundle?: ActionBundleItem[];

  /** Blocked reasons that disable the primary CTA. */
  blockedReasons?: string[];

  /** High-priority CTA, e.g. "Approve", "Pay" */
  primaryAction?: ApprovableAction;

  /** Lower-priority actions: Copy, Resend, Export */
  secondaryActions?: ApprovableAction[];

  /** Destructive action: Cancel, Void */
  destructiveAction?: ApprovableAction;

  /** Document lifecycle progress rail */
  progressRail?: ProgressRail;

  /** Next-step hint shown below state chips */
  nextStep?: { label: string; copy: string };

  /** Canonical audit trail: created/updated/status-changed metadata */
  audit?: ApprovableAudit;
}
