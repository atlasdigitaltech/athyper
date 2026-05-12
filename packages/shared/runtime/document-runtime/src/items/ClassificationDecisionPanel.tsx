"use client";

/**
 * ClassificationDecisionPanel
 *
 * Renders the configured classification decision JSONB result for a document
 * line. Shows:
 *   • Metadata-configured status badge
 *   • Suggestion chips
 *   • Resolved domain / intent / profile / confidence
 *   • Metadata-configured policy flags
 *   • Blockers banner
 *   • Explanations
 *   • Override entries
 *   • Classify / Re-classify action
 *   • Inline override-reason dialog
 */

import { useState } from "react";
import {
  AlertTriangle, CheckCircle2, XCircle, Zap,
  ChevronRight, RefreshCw, Pencil, Info,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { relayMutate } from "@athyper/runtime-shared/client";
import {
  CLASSIFICATION_FALLBACK_DOMAIN_CLASS,
  classificationMethodPresentation,
  classificationStatusPresentation,
  resolveClassificationConfig,
  type ClassificationConfig,
  type ClassificationPolicyBadgeVariant,
  type ClassificationStatusIconKey,
} from "./classificationPresentation";

// ── Types (mirrors ClassificationDecision.zod.ts — no runtime dep on server Zod) ─

type DecisionStatus = string;
type Domain = string;

interface Suggestion {
  field: string;
  id: string;
  code: string;
  name: string;
  confidence: number;
  source: string;
}

interface ClassificationDecision {
  version: 1;
  status: DecisionStatus;
  pipeline_id: string;
  mode: string;
  flow_code: string | null;
  document_type: string;
  suggestions: Suggestion[];
  selected: Record<string, unknown>;
  resolved: {
    domain: Domain | null;
    intent_method: string;
    intent_rule_id: string | null;
    profile_method: string;
    profile_rule_id: string | null;
    confidence: number;
    tax_group_resolved_via: string;
    wht_group_resolved_via: string;
  };
  policy: Record<string, unknown>;
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
  /** Raw line record; persisted decision field is configured by metadata. */
  line: Record<string, unknown>;
  entityCode: string;
  recordId: string;
  /** Called after a successful classify so the parent can refresh the line. */
  onRefresh?: () => void;
  /** Optional live-preview decision to overlay (from debounced preview calls). */
  previewDecision?: Record<string, unknown> | null;
  /** If true, a preview call is in flight. */
  isPreviewing?: boolean;
  classificationConfig?: ClassificationConfig | Record<string, unknown> | null;
  decisionField?: string;
  lineIdField?: string;
  classificationRequiredField?: string;
  classifyEndpointTemplate?: string;
  saveMode?: string;
  previewMode?: string;
}

// ── Status config ─────────────────────────────────────────────────────────────

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
  variant?: ClassificationPolicyBadgeVariant;
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

function classificationIcon(icon: ClassificationStatusIconKey) {
  if (icon === "check") return CheckCircle2;
  if (icon === "x") return XCircle;
  return AlertTriangle;
}

function policyBadgeActive(policy: Record<string, unknown>, key: string, value: unknown): boolean {
  return value === undefined ? Boolean(policy[key]) : policy[key] === value;
}

function MethodBadge({ method, config }: { method: string; config: ClassificationConfig }) {
  const methodConfig = classificationMethodPresentation(config, method);
  return <span className={cn("text-2xs font-semibold", methodConfig.className)}>{methodConfig.label}</span>;
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
          placeholder="Describe the business reason for this override"
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
  line,
  entityCode,
  recordId,
  onRefresh,
  previewDecision,
  isPreviewing,
  classificationConfig,
  decisionField,
  lineIdField,
  classificationRequiredField,
  classifyEndpointTemplate,
  saveMode,
  previewMode,
}: ClassificationDecisionPanelProps) {
  const lineAny = line as Record<string, unknown>;
  const resolvedConfig = resolveClassificationConfig(classificationConfig);
  const resolvedDecisionField = decisionField ?? resolvedConfig.decisionField;
  const resolvedLineIdField = lineIdField ?? resolvedConfig.lineIdField;
  const resolvedRequiredField = classificationRequiredField ?? resolvedConfig.requiredInputField;
  const resolvedEndpointTemplate = classifyEndpointTemplate ?? resolvedConfig.classifyEndpointTemplate;
  const resolvedSaveMode = saveMode ?? resolvedConfig.saveMode;
  const resolvedPreviewMode = previewMode ?? resolvedConfig.previewMode;

  // Prefer live preview decision; fall back to persisted decision on line object
  const rawDecision = previewDecision ?? (resolvedDecisionField ? lineAny[resolvedDecisionField] : null);
  const decision = isFullDecision(rawDecision) ? rawDecision : null;

  const [classifying,  setClassifying]  = useState(false);
  const [classifyErr,  setClassifyErr]  = useState<string | null>(null);
  const [showDetails,  setShowDetails]  = useState(false);

  const lineId   = resolvedLineIdField ? String(lineAny[resolvedLineIdField] ?? "") : "";
  const hasLineId = lineId.trim().length > 0;
  const canClassify = hasLineId && Boolean(resolvedEndpointTemplate);

  function classifyUrl(mode?: string) {
    return (resolvedEndpointTemplate ?? "")
      .replace(/\{entityCode\}/g, encodeURIComponent(entityCode))
      .replace(/\{recordId\}/g, encodeURIComponent(recordId))
      .replace(/\{lineId\}/g, encodeURIComponent(lineId))
      .replace(/\{mode\}/g, encodeURIComponent(mode ?? ""));
  }

  async function runClassify(mode = resolvedSaveMode) {
    if (!canClassify) return;
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
    const isEmpty = Boolean(resolvedRequiredField && !lineAny[resolvedRequiredField]);
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-center space-y-2">
          <Zap className="mx-auto h-5 w-5 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">
            {isEmpty ? "Complete the configured input to classify" : "Not yet classified"}
          </p>
          <p className="text-xs text-muted-foreground/60">
            {isEmpty
              ? "The classification pipeline is waiting for the required metadata field."
              : "The classification pipeline hasn't run on this line yet."}
          </p>
        </div>

        {!isEmpty && canClassify && (
          <div className="flex justify-center">
            <button
              onClick={() => void runClassify(resolvedSaveMode)}
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

  const cfg = classificationStatusPresentation(resolvedConfig, decision.status);
  const StatusIcon = classificationIcon(cfg.icon);
  const policyRecord = decision.policy as unknown as Record<string, unknown>;
  const activePolicyBadges = resolvedConfig.policyBadges.filter((badge) =>
    policyBadgeActive(policyRecord, badge.key, badge.value),
  );
  const denyMappingBadge = resolvedConfig.denyMappingBadge;
  const denyMappingActive = denyMappingBadge
    ? policyBadgeActive(policyRecord, denyMappingBadge.key, denyMappingBadge.value)
    : false;
  const thresholdValue = resolvedConfig.thresholdField ? policyRecord[resolvedConfig.thresholdField] : undefined;

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
          onClick={() => void runClassify(resolvedSaveMode)}
          disabled={!canClassify || classifying || isPreviewing}
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
      {decision.suggestions.length > 0 && !(resolvedRequiredField && (decision.selected as Record<string, unknown>)[resolvedRequiredField]) && (
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
                resolvedConfig.domainClasses[decision.resolved.domain]
                  ?? resolvedConfig.fallbackDomainClass
                  ?? CLASSIFICATION_FALLBACK_DOMAIN_CLASS
              )}>
                {decision.resolved.domain}
              </span>
            )}
          </div>

          <div className="px-3 py-2.5 space-y-2.5">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div>
                <span className="text-muted-foreground text-2xs block mb-0.5">Intent method</span>
                <MethodBadge method={decision.resolved.intent_method} config={resolvedConfig} />
              </div>
              <div>
                <span className="text-muted-foreground text-2xs block mb-0.5">Profile method</span>
                <MethodBadge method={decision.resolved.profile_method} config={resolvedConfig} />
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
      {(activePolicyBadges.length > 0 || denyMappingActive || typeof thresholdValue === "number") && (
        <div className="flex flex-wrap gap-1.5">
          {activePolicyBadges.map((badge) => (
            <PolicyTag
              key={badge.key}
              label={badge.label}
              active
              variant={badge.variant}
            />
          ))}
          {denyMappingBadge && (
            <PolicyTag
              label={denyMappingBadge.label}
              active={denyMappingActive}
              variant={denyMappingBadge.variant}
            />
          )}
          {resolvedConfig.thresholdLabel && typeof thresholdValue === "number" && (
            <span className="inline-flex items-center h-5 px-2 rounded-sm text-2xs font-semibold border bg-muted text-muted-foreground border-border/50">
              {resolvedConfig.thresholdLabel} {thresholdValue.toLocaleString()}
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
          {resolvedPreviewMode && decision.mode === resolvedPreviewMode ? resolvedPreviewMode : "persisted"}
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
  classificationConfig?: ClassificationConfig | Record<string, unknown> | null;
  decisionField?: string;
}

export function ClassificationStatusBadge({
  line,
  compact,
  classificationConfig,
  decisionField,
}: ClassificationStatusBadgeProps) {
  const resolvedConfig = resolveClassificationConfig(classificationConfig);
  const resolvedDecisionField = decisionField ?? resolvedConfig.decisionField;
  const raw = resolvedDecisionField ? line[resolvedDecisionField] : null;
  if (!isFullDecision(raw)) {
    return compact ? null : (
      <span className="inline-flex items-center h-5 px-1.5 rounded text-2xs font-semibold bg-muted border border-border/50 text-muted-foreground/40 leading-none">
        —
      </span>
    );
  }
  const cfg = classificationStatusPresentation(resolvedConfig, raw.status);
  const Icon = classificationIcon(cfg.icon);
  if (compact) {
    return (
      <span
        className={cn("inline-flex items-center justify-center w-5 h-5 rounded-full border", cfg.compactPill)}
        title={cfg.label}
      >
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
