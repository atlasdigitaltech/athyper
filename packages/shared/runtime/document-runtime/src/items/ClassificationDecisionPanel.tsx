"use client";

/**
 * ClassificationDecisionPanel
 *
 * Renders the full classification_decision JSONB result for a purchase invoice
 * or requisition line. Shows:
 *   • Status badge (resolved / needs_review / blocked)
 *   • Suggestion chips
 *   • Resolved domain / intent / profile / confidence
 *   • Policy flags (CAPEX threshold, HS, cross-border, regulated)
 *   • Blockers banner
 *   • Explanations
 *   • Override entries
 *   • Classify / Re-classify action
 *   • Inline override-reason dialog
 */

import { useState, useRef, useCallback } from "react";
import {
  CheckCircle2, AlertTriangle, XCircle, Zap,
  ChevronRight, RefreshCw, Pencil, Info,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { relayMutate } from "@athyper/runtime-shared/client";

// ── Types (mirrors ClassificationDecision.zod.ts — no runtime dep on server Zod) ─

type DecisionStatus = "resolved" | "needs_review" | "blocked";
type Domain = "OPEX" | "CAPEX" | "REVENUE" | "COST_OF_SALES"
            | "TRANSFER" | "REGULATORY" | "ADMIN" | "DEFERRED_REVENUE";

interface Suggestion {
  field: "spend_category_id";
  id: string;
  code: string;
  name: string;
  confidence: number;
  source: "item" | "commodity" | "trigram" | "history";
}

interface LineCommodityCode { domain_code: string; code: string; label: string; }

interface ClassificationDecision {
  version: 1;
  status: DecisionStatus;
  pipeline_id: string;
  mode: "preview" | "save";
  flow_code: string | null;
  document_type: string;
  suggestions: Suggestion[];
  selected: {
    spend_category_id: string | null;
    business_intent_id: string | null;
    profile_config_id: string | null;
    line_commodity_code: LineCommodityCode | null;
  };
  resolved: {
    domain: Domain | null;
    intent_method: "RULE_MATCH" | "CLASSIFICATION_DEFAULT" | "FAILED";
    intent_rule_id: string | null;
    profile_method: "OVERRIDE" | "RULE_MATCH" | "FAILED";
    profile_rule_id: string | null;
    confidence: number;
    tax_group_resolved_via: string;
    wht_group_resolved_via: string;
  };
  policy: {
    mapping_mode: "ALLOW" | "DENY";
    visibility: string;
    classification_required: boolean;
    hs_required: boolean;
    is_regulated: boolean;
    is_cross_border: boolean;
    asset_tagging_required: boolean;
    capex_threshold: number | null;
    capex_threshold_breached: boolean;
    source_company_code_id: string | null;
  };
  explanations: string[];
  overrides: Array<{
    field: string;
    from_id: string | null;
    to_id: string | null;
    reason: string;
    by_principal_id: string;
    at: string;
  }>;
  blockers: Array<{ code: string; field: string | null; message: string }>;
}

function isFullDecision(d: unknown): d is ClassificationDecision {
  return (
    d != null &&
    typeof d === "object" &&
    "version" in (d as object) &&
    "status" in (d as object)
  );
}

// ── Prop types ────────────────────────────────────────────────────────────────

export interface ClassificationDecisionPanelProps {
  /** Raw line record — classification_decision lives here. */
  line: Record<string, unknown>;
  entityCode: string;
  recordId: string;
  /** Called after a successful classify so the parent can refresh the line. */
  onRefresh?: () => void;
  /** Optional live-preview decision to overlay (from debounced preview calls). */
  previewDecision?: Record<string, unknown> | null;
  /** If true, a preview call is in flight. */
  isPreviewing?: boolean;
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CFG = {
  resolved: {
    icon: CheckCircle2,
    label: "Resolved",
    pill: "bg-success/10 text-success border-success/20",
    iconCls: "text-success",
  },
  needs_review: {
    icon: AlertTriangle,
    label: "Needs review",
    pill: "bg-warning/10 text-warning border-warning/20",
    iconCls: "text-warning",
  },
  blocked: {
    icon: XCircle,
    label: "Blocked",
    pill: "bg-destructive/10 text-destructive border-destructive/20",
    iconCls: "text-destructive",
  },
} as const;

const DOMAIN_COLORS: Record<string, string> = {
  OPEX:           "bg-info/10 text-info border-info/20",
  CAPEX:          "bg-accent/20 text-accent-foreground border-accent/30",
  REGULATORY:     "bg-warning/10 text-warning border-warning/20",
  COST_OF_SALES:  "bg-muted text-foreground border-border/60",
  TRANSFER:       "bg-muted text-foreground border-border/60",
  REVENUE:        "bg-success/10 text-success border-success/20",
  ADMIN:          "bg-muted text-muted-foreground border-border/50",
  DEFERRED_REVENUE: "bg-muted text-muted-foreground border-border/50",
};

// ── Small helpers ─────────────────────────────────────────────────────────────

function ConfidenceBar({ value }: { value: number }) {
  const pct  = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const cls  = pct >= 70 ? "bg-success" : pct >= 40 ? "bg-warning" : "bg-destructive";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-500", cls)} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn("text-2xs tabular-nums font-medium w-8 text-right",
        pct >= 70 ? "text-success" : pct >= 40 ? "text-warning" : "text-destructive",
      )}>{pct}%</span>
    </div>
  );
}

function PolicyTag({ label, active, variant = "muted" }: {
  label: string; active: boolean;
  variant?: "muted" | "warn" | "alert";
}) {
  if (!active) return null;
  const cls = {
    muted: "bg-muted text-muted-foreground border-border/50",
    warn:  "bg-warning/10 text-warning border-warning/20",
    alert: "bg-destructive/10 text-destructive border-destructive/20",
  }[variant];
  return (
    <span className={cn("inline-flex items-center h-5 px-2 rounded-sm text-2xs font-semibold border leading-none", cls)}>
      {label}
    </span>
  );
}

function MethodBadge({ method }: { method: string }) {
  const m = method.toLowerCase();
  const cls = m === "rule_match"   ? "text-success/80"
            : m === "override"     ? "text-accent-foreground"
            : m.includes("default") ? "text-warning/80"
            : "text-destructive/70";
  const label = m === "rule_match"           ? "Rule match"
              : m === "classification_default" ? "Category default"
              : m === "override"              ? "Override"
              : "Failed";
  return <span className={cn("text-2xs font-semibold", cls)}>{label}</span>;
}

// ── Override reason dialog ────────────────────────────────────────────────────

function OverrideReasonDialog({
  field, currentId, onConfirm, onCancel, isOpen,
}: {
  field: string;
  currentId: string | null;
  onConfirm: (reason: string, newId?: string) => void;
  onCancel: () => void;
  isOpen: boolean;
}) {
  const [reason, setReason] = useState("");
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-sm mx-4 rounded-xl border border-border bg-background shadow-xl p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Override reason required</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Overriding <span className="font-medium text-foreground">{field.replace(/_/g, " ")}</span> requires a reason for audit purposes.
          </p>
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="e.g. Agreed with finance controller — classify as CAPEX per policy memo dated 2026-04"
          className={cn(
            "w-full px-3 py-2 text-xs border border-border/60 rounded-lg bg-transparent resize-none",
            "focus:outline-none focus:ring-2 focus:ring-ring/30 focus:border-transparent transition-colors",
            "placeholder:text-muted-foreground/40",
          )}
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel}
            className="h-8 px-3 text-xs font-semibold border border-border/60 rounded-lg text-muted-foreground hover:text-foreground hover:border-border transition-colors"
          >Cancel</button>
          <button onClick={() => reason.trim().length >= 3 && onConfirm(reason.trim())}
            disabled={reason.trim().length < 3}
            className="h-8 px-4 text-xs font-semibold rounded-lg bg-foreground text-background hover:opacity-85 disabled:opacity-40 transition-opacity"
          >Confirm override</button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ClassificationDecisionPanel({
  line, entityCode, recordId, onRefresh, previewDecision, isPreviewing,
}: ClassificationDecisionPanelProps) {
  const lineAny = line as Record<string, unknown>;

  // Prefer live preview decision; fall back to persisted decision on line object
  const rawDecision = previewDecision ?? lineAny["classification_decision"];
  const decision = isFullDecision(rawDecision) ? rawDecision : null;

  const [classifying,  setClassifying]  = useState(false);
  const [classifyErr,  setClassifyErr]  = useState<string | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [showDetails,  setShowDetails]  = useState(false);

  const lineId   = String(lineAny["id"] ?? "");
  const hasLineId = lineId.length > 10;

  // Build the classify URL from the entity code
  function classifyUrl(mode: "preview" | "save") {
    if (entityCode === "purchase_invoice") {
      return `/api/finance/ap/invoices/${encodeURIComponent(recordId)}/lines/${encodeURIComponent(lineId)}/classify?mode=${mode}`;
    }
    return `/api/finance/ap/invoices/${encodeURIComponent(recordId)}/lines/${encodeURIComponent(lineId)}/classify?mode=${mode}`;
  }

  async function runClassify(mode: "preview" | "save" = "save") {
    if (!hasLineId) return;
    setClassifying(true);
    setClassifyErr(null);
    try {
      const res = await relayMutate(classifyUrl(mode), { method: "POST" });
      if (res.ok) {
        onRefresh?.();
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setClassifyErr(body.error ?? `Classify failed (${res.status})`);
      }
    } catch (e) {
      setClassifyErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setClassifying(false); }
  }

  // ── Nothing yet ──────────────────────────────────────────────────────────────

  if (!decision) {
    const isEmpty = !lineAny["spend_category_id"];
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-center space-y-2">
          <Zap className="mx-auto h-5 w-5 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">
            {isEmpty ? "Set a spend category to classify" : "Not yet classified"}
          </p>
          <p className="text-xs text-muted-foreground/60">
            {isEmpty
              ? "Select a spend category on this line to trigger automatic intent and profile resolution."
              : "The classification pipeline hasn't run on this line yet."}
          </p>
        </div>

        {!isEmpty && hasLineId && (
          <div className="flex justify-center">
            <button
              onClick={() => void runClassify("save")}
              disabled={classifying}
              className="inline-flex items-center gap-1.5 h-8 px-4 text-xs font-semibold rounded-lg bg-foreground text-background hover:opacity-85 disabled:opacity-40 transition-opacity"
            >
              <Zap className="h-3 w-3" />
              {classifying ? "Classifying…" : "Classify now"}
            </button>
          </div>
        )}

        {classifyErr && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {classifyErr}
          </div>
        )}
      </div>
    );
  }

  const cfg = STATUS_CFG[decision.status];
  const StatusIcon = cfg.icon;
  const pct = Math.round(decision.resolved.confidence * 100);

  return (
    <div className="space-y-3">

      {/* ── Status + classify action row ──────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <span className={cn(
          "inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-xs font-semibold border",
          cfg.pill,
        )}>
          <StatusIcon className="h-3 w-3" />
          {cfg.label}
          {isPreviewing && (
            <span className="ml-1 opacity-60 text-2xs">(preview)</span>
          )}
        </span>

        <button
          onClick={() => void runClassify("save")}
          disabled={classifying || isPreviewing}
          title="Re-run classification pipeline"
          className="inline-flex items-center gap-1 h-6 px-2 text-2xs font-semibold rounded border border-border/60 text-muted-foreground hover:text-foreground hover:border-border transition-colors disabled:opacity-40"
        >
          <RefreshCw className={cn("h-2.5 w-2.5", (classifying || isPreviewing) && "animate-spin")} />
          {classifying ? "Classifying…" : isPreviewing ? "Previewing…" : "Re-classify"}
        </button>
      </div>

      {/* ── Blockers banner ──────────────────────────────────────────────────── */}
      {decision.blockers.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
            <span className="text-xs font-semibold text-destructive">
              {decision.blockers.length} blocker{decision.blockers.length !== 1 ? "s" : ""} — this line cannot be submitted
            </span>
          </div>
          {decision.blockers.map((b, i) => (
            <div key={i} className="flex items-start gap-2 pl-5">
              <span className="text-xs text-destructive/80">{b.message}</span>
              <code className="ml-auto shrink-0 text-2xs font-mono text-destructive/50">{b.code}</code>
            </div>
          ))}
        </div>
      )}

      {/* ── Suggestions strip ────────────────────────────────────────────────── */}
      {decision.suggestions.length > 0 && !decision.selected.spend_category_id && (
        <div className="space-y-1.5">
          <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            Suggested categories
          </span>
          <div className="flex flex-wrap gap-1.5">
            {decision.suggestions.map((s) => (
              <span key={s.id}
                className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full border border-border/60 bg-muted/30 text-xs font-medium text-foreground cursor-default"
                title={`${Math.round(s.confidence * 100)}% confidence · source: ${s.source}`}
              >
                <span className="font-mono text-2xs text-muted-foreground">{s.code}</span>
                <span className="text-xs">{s.name}</span>
                <span className="text-2xs text-muted-foreground/60">{Math.round(s.confidence * 100)}%</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Resolution card ──────────────────────────────────────────────────── */}
      {decision.resolved.domain && (
        <div className="rounded-lg border border-border/50 bg-background overflow-hidden">
          <div className="px-3 py-2 bg-muted/30 border-b border-border/40 flex items-center justify-between">
            <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Resolution</span>
            {decision.resolved.domain && (
              <span className={cn("inline-flex items-center h-5 px-2 rounded-sm text-2xs font-semibold border",
                DOMAIN_COLORS[decision.resolved.domain] ?? "bg-muted text-foreground border-border/50"
              )}>
                {decision.resolved.domain}
              </span>
            )}
          </div>

          <div className="px-3 py-2.5 space-y-2.5">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div>
                <span className="text-muted-foreground text-2xs block mb-0.5">Intent method</span>
                <MethodBadge method={decision.resolved.intent_method} />
              </div>
              <div>
                <span className="text-muted-foreground text-2xs block mb-0.5">Profile method</span>
                <MethodBadge method={decision.resolved.profile_method} />
              </div>
              <div>
                <span className="text-muted-foreground text-2xs block mb-0.5">Tax group via</span>
                <span className="text-xs text-foreground/80">{decision.resolved.tax_group_resolved_via}</span>
              </div>
              <div>
                <span className="text-muted-foreground text-2xs block mb-0.5">WHT via</span>
                <span className="text-xs text-foreground/80">{decision.resolved.wht_group_resolved_via}</span>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-2xs font-medium text-muted-foreground">Confidence</span>
              </div>
              <ConfidenceBar value={decision.resolved.confidence} />
            </div>
          </div>
        </div>
      )}

      {/* ── Policy badges ────────────────────────────────────────────────────── */}
      {(decision.policy.is_cross_border || decision.policy.is_regulated ||
        decision.policy.hs_required || decision.policy.asset_tagging_required ||
        decision.policy.capex_threshold_breached || decision.policy.mapping_mode === "DENY") && (
        <div className="flex flex-wrap gap-1.5">
          <PolicyTag label="Cross-border" active={decision.policy.is_cross_border} variant="warn" />
          <PolicyTag label="Regulated" active={decision.policy.is_regulated} variant="warn" />
          <PolicyTag label="HS required" active={decision.policy.hs_required} variant="warn" />
          <PolicyTag label="Asset tagging" active={decision.policy.asset_tagging_required} variant="muted" />
          <PolicyTag label="CAPEX threshold ⚠" active={decision.policy.capex_threshold_breached} variant="alert" />
          <PolicyTag label="DENY mapping" active={decision.policy.mapping_mode === "DENY"} variant="alert" />
          {decision.policy.capex_threshold !== null && (
            <span className="inline-flex items-center h-5 px-2 rounded-sm text-2xs font-semibold border bg-muted text-muted-foreground border-border/50">
              CAPEX threshold {decision.policy.capex_threshold.toLocaleString()}
            </span>
          )}
        </div>
      )}

      {/* ── Explanations (collapsible) ───────────────────────────────────────── */}
      {decision.explanations.length > 0 && (
        <button
          onClick={() => setShowDetails((v) => !v)}
          className="flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground transition-colors w-full text-left"
        >
          {showDetails ? <ChevronRight className="h-3 w-3 rotate-90" /> : <ChevronRight className="h-3 w-3" />}
          {showDetails ? "Hide" : "Show"} pipeline explanations ({decision.explanations.length})
        </button>
      )}
      {showDetails && decision.explanations.length > 0 && (
        <div className="space-y-1 pl-3 border-l-2 border-border/40">
          {decision.explanations.map((e, i) => (
            <div key={i} className="flex items-start gap-2">
              <Info className="h-3 w-3 text-muted-foreground/50 mt-0.5 shrink-0" />
              <span className="text-xs text-muted-foreground">{e}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Overrides ────────────────────────────────────────────────────────── */}
      {decision.overrides.length > 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5 space-y-2">
          <div className="flex items-center gap-1.5">
            <Pencil className="h-3 w-3 text-warning shrink-0" />
            <span className="text-xs font-semibold text-warning">
              {decision.overrides.length} manual override{decision.overrides.length !== 1 ? "s" : ""}
            </span>
          </div>
          {decision.overrides.map((ov, i) => (
            <div key={i} className="pl-5 space-y-0.5">
              <span className="text-2xs font-medium text-foreground">{ov.field.replace(/_/g, " ")}</span>
              <p className="text-xs text-muted-foreground">{ov.reason}</p>
              <p className="text-2xs text-muted-foreground/50">
                {new Date(ov.at).toLocaleDateString()} · {ov.by_principal_id.slice(0, 8)}…
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ── Pipeline meta ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-2xs text-muted-foreground/40 font-mono truncate">
          {decision.pipeline_id.slice(0, 12)}…
        </span>
        <span className="text-2xs text-muted-foreground/40">
          {decision.mode === "preview" ? "preview" : "persisted"}
        </span>
      </div>

      {classifyErr && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {classifyErr}
        </div>
      )}
    </div>
  );
}

// ── Inline status badge — for line grid rows ──────────────────────────────────

export interface ClassificationStatusBadgeProps {
  line: Record<string, unknown>;
  compact?: boolean;
}

export function ClassificationStatusBadge({ line, compact }: ClassificationStatusBadgeProps) {
  const raw = line["classification_decision"];
  if (!isFullDecision(raw)) {
    return compact ? null : (
      <span className="inline-flex items-center h-5 px-1.5 rounded text-2xs font-semibold bg-muted border border-border/50 text-muted-foreground/40 leading-none">
        —
      </span>
    );
  }
  const cfg = STATUS_CFG[raw.status];
  const Icon = cfg.icon;
  if (compact) {
    return (
      <span className={cn("inline-flex items-center justify-center w-5 h-5 rounded-full border",
        raw.status === "resolved"     ? "bg-success/10 text-success border-success/20" :
        raw.status === "needs_review" ? "bg-warning/10 text-warning border-warning/20"  :
        "bg-destructive/10 text-destructive border-destructive/20",
      )} title={cfg.label}>
        <Icon className="h-2.5 w-2.5" />
      </span>
    );
  }
  return (
    <span className={cn(
      "inline-flex items-center gap-1 h-5 px-1.5 rounded text-2xs font-semibold border leading-none",
      cfg.pill,
    )}>
      <Icon className="h-2.5 w-2.5" />
      {cfg.label}
    </span>
  );
}
