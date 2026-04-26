/**
 * @athyper/document-runtime — ApprovableDocumentHeader v5
 *
 * Composition layer:
 *   DocumentIdentityCard  — single row: chip · number · status · [actions | v | pin]
 *   DocumentKpiStrip      — Total | Supplier | Date | Due Date | Refs | Currency
 *   ProgressRailRow       — 5-stage lifecycle rail with pulsing active dot + inline hint
 *   OpDims row            — tier-2 operational status chips
 *   Tabs                  — standard tab strip
 */
"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Pin } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { resolveSemanticColors } from "@athyper/theme/semantic-colors";
import type {
  ApprovableAudit,
  ApprovableDocumentHeaderDTO,
  HeaderMode,
  ProgressRail,
  ProgressStage,
  SlaStatus,
} from "./types";
import { DocumentActionBar } from "../actions/DocumentActionBar";
import { DocumentIdentityCard, type IdentityAction, type IdentityDueMeta } from "../identity/DocumentIdentityCard";
import { DocumentKpiStrip, type KpiStripCell } from "../kpi/DocumentKpiStrip";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Exported tab interface ─────────────────────────────────────────────────

export interface ApprovableDocumentHeaderTab {
  id: string;
  label: string;
  count?: number;
  countIntent?: "default" | "attention";
  disabled?: boolean;
}

// ── Props ──────────────────────────────────────────────────────────────────

export interface ApprovableDocumentHeaderProps {
  data: ApprovableDocumentHeaderDTO;
  initialMode?: HeaderMode;
  onModeChange?: (mode: HeaderMode) => void;
  onAction?: (action: string, remarks?: string) => void | Promise<void>;
  /** Renders a compact back chevron before the type chip */
  onBack?: () => void;
  tabs?: ApprovableDocumentHeaderTab[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  className?: string;
}

// ── Tier-2 op chip ─────────────────────────────────────────────────────────


function OpChip({ value }: { value: string; intent?: string }) {
  return (
    <span className="inline-flex items-center h-[18px] px-[6px] rounded-[4px] text-xs font-semibold bg-muted text-muted-foreground border border-border leading-none whitespace-nowrap">
      {value}
    </span>
  );
}

// ── Inline action dot-button (mirrors DotButton in DocumentIdentityCard) ──

function ActionDotButton({
  label,
  onClick,
  disabled,
  variant = "default",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "destructive";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-[7px] h-[34px] px-3.5 rounded-lg text-xs font-semibold tracking-wider leading-none whitespace-nowrap transition-opacity",
        variant === "destructive"
          ? "bg-destructive text-destructive-foreground hover:opacity-90"
          : "bg-foreground text-background hover:opacity-85",
        disabled && "opacity-40 pointer-events-none",
      )}
    >
      <span className="w-[6px] h-[6px] rounded-full bg-background/60 flex-none" />
      {label}
    </button>
  );
}

// ── Toggle button group — buttons only, no strip wrapper ──────────────────

function ToggleButtonGroup({
  mode,
  onChange,
}: {
  mode: HeaderMode;
  onChange: (m: HeaderMode) => void;
}) {
  const isCollapsed = mode === "collapsed";
  const isPinned    = mode === "pinned";
  return (
    <div className="flex items-center gap-1">
      <button
        title={isCollapsed ? "Expand header" : "Collapse header"}
        onClick={() => onChange(isCollapsed ? "expanded" : "collapsed")}
        className="w-[28px] h-[28px] rounded-md border border-border bg-card flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        {isCollapsed
          ? <ChevronDown className="h-3.5 w-3.5" />
          : <ChevronUp   className="h-3.5 w-3.5" />}
      </button>
      <button
        title={isPinned ? "Unpin header" : "Pin header"}
        onClick={() => onChange(isPinned ? "expanded" : "pinned")}
        className={cn(
          "w-[28px] h-[28px] rounded-md border flex items-center justify-center transition-colors",
          isPinned
            ? "border-foreground bg-foreground text-background"
            : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <Pin className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Audit meta bar ─────────────────────────────────────────────────────────

function AuditMetaBar({ audit }: { audit: ApprovableAudit }) {
  const parts: string[] = [];
  if (audit.createdAt) {
    parts.push(`Created ${audit.createdAt}${audit.createdBy ? ` · ${audit.createdBy}` : ""}`);
  }
  if (audit.updatedAt) {
    parts.push(`Updated ${audit.updatedAt}${audit.updatedBy ? ` · ${audit.updatedBy}` : ""}`);
  }
  if (audit.statusChangedAt) {
    parts.push(`Status ${audit.statusChangedAt}${audit.statusChangedBy ? ` · ${audit.statusChangedBy}` : ""}`);
  }
  if (parts.length === 0) return null;
  return (
    <div className="border-t border-dashed border-border/40 px-4 py-[7px] sm:px-5 lg:px-[22px]">
      <p className="text-2xs text-muted-foreground/55 leading-none tracking-[0.01em]">
        {parts.join("   ·   ")}
      </p>
    </div>
  );
}

// ── SLA badge ──────────────────────────────────────────────────────────────

const SLA_INTENT: Record<SlaStatus, "success" | "warning" | "error" | "neutral"> = {
  on_track:        "success",
  at_risk:         "warning",
  breached:        "error",
  completed_ok:    "success",
  completed_late:  "error",
};

const SLA_LABEL: Record<SlaStatus, string> = {
  on_track:        "On track",
  at_risk:         "At risk",
  breached:        "Breached",
  completed_ok:    "Within SLA",
  completed_late:  "Late",
};

function SlaBadge({ status, targetHours }: { status: SlaStatus; targetHours?: number }) {
  const intent  = SLA_INTENT[status];
  const label   = SLA_LABEL[status];
  const { subtleBadge } = resolveSemanticColors(intent);
  const target  = targetHours ? `${targetHours}h SLA` : undefined;
  return (
    <span
      title={target}
      className={cn(
        "inline-flex items-center rounded border px-1 py-px text-[9px] font-semibold leading-none",
        subtleBadge,
      )}
    >
      {label}
    </span>
  );
}

// ── Progress rail — expanded grid only ────────────────────────────────────

function ProgressRailGrid({ rail }: { rail: ProgressRail }) {
  const activeIdx = Math.max(0, rail.stages.findIndex((s) => s.key === rail.currentKey));

  return (
    <div
      className="overflow-x-auto pb-0.5"
      style={{ display: "grid", gridTemplateColumns: `repeat(${rail.stages.length}, minmax(112px, 1fr))` }}
    >
      {rail.stages.map((stage: ProgressStage, i: number) => {
        const isActive = i === activeIdx;
        const isPast   = i < activeIdx;
        return (
          <div key={stage.key} className="min-w-0 pr-2">
            {/* Node + connector */}
            <div className="flex items-center">
              <div className="relative flex-none flex items-center justify-center w-[17px] h-[17px]">
                {isActive && (
                  <span
                    className="absolute inset-0 rounded-full animate-ping bg-foreground/12"
                    style={{ animationDuration: "2.4s" }}
                  />
                )}
                <div
                  className={cn(
                    "w-[11px] h-[11px] rounded-full relative z-[1]",
                    isActive
                      ? "bg-card border-2 border-foreground shadow-[0_0_0_3px_hsl(var(--foreground)/0.07)]"
                      : isPast
                      ? "bg-foreground border-[1.5px] border-foreground"
                      : "bg-card border-[1.5px] border-border",
                  )}
                >
                  {isActive && (
                    <span className="absolute inset-[2.5px] rounded-full bg-foreground" />
                  )}
                </div>
              </div>
              {i < rail.stages.length - 1 && (
                <div className={cn("flex-1 h-px ml-1 min-w-[16px]", isPast ? "bg-foreground" : "bg-border")} />
              )}
            </div>

            {/* Labels */}
            <div className="mt-2 space-y-0.5">
              <div className={cn(
                "text-xs leading-tight",
                isActive || isPast ? "font-semibold text-foreground" : "font-medium text-muted-foreground",
              )}>
                {stage.label}
              </div>

              {/* Date reached / target */}
              {stage.reachedAt ? (
                <div className="text-xs text-muted-foreground tabular-nums">
                  {stage.reachedAt}{stage.actor ? ` · ${stage.actor}` : ""}
                </div>
              ) : stage.targetAt ? (
                <div className="text-xs text-muted-foreground/50">target {stage.targetAt}</div>
              ) : (
                <div className="text-xs text-muted-foreground/40">—</div>
              )}

              {/* Duration + SLA badge */}
              {(stage.durationLabel || stage.slaStatus) && (
                <div className="flex items-center gap-1 pt-0.5 flex-wrap">
                  {stage.durationLabel && (
                    <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
                      {isActive ? "⏱ " : ""}{stage.durationLabel}
                    </span>
                  )}
                  {stage.slaStatus && (
                    <SlaBadge status={stage.slaStatus} targetHours={stage.slaTargetHours} />
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── DTO → component props mapping ──────────────────────────────────────────

function buildIdentityActions(
  data: ApprovableDocumentHeaderDTO,
): IdentityAction[] {
  const { primaryAction, secondaryActions, destructiveAction } = data;
  const out: IdentityAction[] = [];
  if (primaryAction)
    out.push({ action: primaryAction.action, label: primaryAction.label });
  (secondaryActions ?? []).forEach((a) =>
    out.push({ action: a.action, label: a.label }),
  );
  if (destructiveAction)
    out.push({ action: destructiveAction.action, label: destructiveAction.label, variant: "destructive" });
  return out;
}

function buildDueMeta(data: ApprovableDocumentHeaderDTO): IdentityDueMeta | undefined {
  const { dates, money } = data;
  if (!dates?.dueDate && !dates?.dueMeta) return undefined;
  return {
    label:  dates?.dueMeta?.label ?? (dates?.dueDate ? `Due ${dates.dueDate}` : ""),
    date:   dates?.dueDate,
    terms:  money?.paymentTerms,
    intent: (dates?.dueMeta?.intent ?? "neutral") as IdentityDueMeta["intent"],
  };
}

function buildKpiCells(data: ApprovableDocumentHeaderDTO): KpiStripCell[] {
  const { money, party, dates, references } = data;
  const cells: KpiStripCell[] = [];

  // ── 1. Supplier / Party (supplier-related) ─────────────────────────────
  if (party && !UUID_RE.test(party.name)) {
    cells.push({
      key:      "supplier",
      label:    "Supplier",
      value:    party.name,
      subValue: party.subtitle,
    });
  }

  // ── 2. Document date (supplier-related) ───────────────────────────────
  if (dates?.documentDate) {
    cells.push({
      key:   "doc-date",
      label: dates.documentDateLabel ?? "Invoice Date",
      value: dates.documentDate,
    });
  }

  // ── 3. Due date (commercial) ───────────────────────────────────────────
  if (dates?.dueDate) {
    const subParts: string[] = [];
    if (dates.dueMeta?.label) subParts.push(dates.dueMeta.label);
    if (money?.paymentTerms)  subParts.push(money.paymentTerms);
    cells.push({
      key:       "due-date",
      label:     "Due Date",
      value:     dates.dueDate,
      intent:    dates.dueMeta?.intent === "error"   ? "error"
                : dates.dueMeta?.intent === "warning" ? "warning"
                : undefined,
      subValue:  subParts.join(" · ") || undefined,
      subIntent: dates.dueMeta?.intent === "error"   ? "error"
                : dates.dueMeta?.intent === "warning" ? "warning"
                : undefined,
    });
  }

  // ── 4. References — skip "source" and "description" (shown in identity title) ──
  // mono is driven by valueType from the entity field schema, not label guessing.
  const SKIP_REF_LABELS = new Set(["source", "description"]);
  (references ?? [])
    .filter((r) => !SKIP_REF_LABELS.has(r.label.toLowerCase()))
    .forEach((ref) => {
      cells.push({
        key:      ref.label,
        label:    ref.label,
        value:    ref.value,
        subValue: ref.subValue,
        mono:     ref.valueType === "code",
      });
    });

  // ── 5. Currency (only if no formatted total) ───────────────────────────
  if (money?.currency && !money.formatted) {
    cells.push({
      key:   "currency",
      label: "Currency",
      value: money.currency,
      mono:  true,
    });
  }

  // ── 6. Total — hero XL cell, last (commercial summary) ────────────────
  if (money?.formatted) {
    const subParts: string[] = [];
    if (money.subtotal) subParts.push(`Subtotal ${money.subtotal}`);
    if (money.tax)      subParts.push(`Tax ${money.tax}`);
    cells.push({
      key:      "total",
      label:    money.totalLabel ?? "Invoice Total",
      value:    money.formatted,
      currency: money.currency,
      xl:       true,
      subValue: subParts.length > 0 ? subParts.join(" · ") : undefined,
    });
  }

  return cells;
}

// ── Main component ─────────────────────────────────────────────────────────

export function ApprovableDocumentHeader({
  data,
  initialMode = "expanded",
  onModeChange,
  onAction,
  onBack,
  tabs,
  activeTab,
  onTabChange,
  className,
}: ApprovableDocumentHeaderProps) {
  const [mode, setMode]           = useState<HeaderMode>(initialMode);
  const [railExpanded, setRailExpanded] = useState(false);
  const handleMode = (m: HeaderMode) => { setMode(m); onModeChange?.(m); };
  const isExpanded = mode !== "collapsed";

  const { identity, statusDimensions, actionBundle, blockedReasons, progressRail } = data;

  const useActionBundle = (actionBundle?.length ?? 0) > 0;
  const tier2Dims       = (statusDimensions ?? []).filter((d) => d.dimension !== "workflow");
  const workflowDim     = (statusDimensions ?? []).find((d) => d.dimension === "workflow");
  const showProcess     = isExpanded && (progressRail || tier2Dims.length > 0 || workflowDim);
  const isBlocked       = (blockedReasons?.length ?? 0) > 0;

  // Build identity card props
  const identityActions = useActionBundle ? [] : buildIdentityActions(data);
  const dueMeta         = buildDueMeta(data);

  // Toggle buttons always appear in the identity card right slot so the header
  // is a single cohesive row: [chip | number · status] ──── [actions] [v][pin]
  const toggleBtns = <ToggleButtonGroup mode={mode} onChange={handleMode} />;

  const actionsSlot: React.ReactNode = (() => {
    if (useActionBundle) {
      return (
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <DocumentActionBar
            actions={actionBundle!}
            blockedReasons={blockedReasons}
            onAction={(code, remarks) => onAction?.(code, remarks)}
          />
          <span className="w-px h-5 bg-border/60 self-center shrink-0" />
          {toggleBtns}
        </div>
      );
    }
    if (identityActions.length > 0) {
      return (
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {identityActions.slice(0, 3).map((a) => (
            <ActionDotButton
              key={a.action}
              label={a.label}
              onClick={() => onAction?.(a.action)}
              variant={a.variant}
              disabled={a.disabled || (isBlocked && a.variant !== "destructive")}
            />
          ))}
          {identityActions.length > 3 && (
            <ActionDotButton label="More" onClick={() => onAction?.("__more")} />
          )}
          <span className="w-px h-5 bg-border/60 self-center shrink-0" />
          {toggleBtns}
        </div>
      );
    }
    return toggleBtns;
  })();

  const kpiCells = isExpanded ? buildKpiCells(data) : [];

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border bg-card shadow-sm",
        mode === "pinned" && "sticky top-0 z-30",
        className,
      )}
    >
      {/* ── IDENTITY CARD — always visible ───────────────────────────── */}
      <DocumentIdentityCard
        typeLabel={identity.typeLabel}
        number={identity.number}
        statusLabel={identity.statusLabel}
        statusIntent={identity.statusIntent as "success" | "warning" | "error" | "info" | "neutral"}
        title={identity.title}
        dueMeta={dueMeta}
        actionsSlot={actionsSlot}
        blockedReasons={blockedReasons ?? []}
        onAction={onAction}
        onBack={onBack}
      />

      {/* ── KPI STRIP — expanded only ────────────────────────────────── */}
      {isExpanded && kpiCells.length > 0 && (
        <DocumentKpiStrip cells={kpiCells} />
      )}

      {/* ── PROCESS: single status row + collapsible timeline ───────── */}
      {showProcess && (() => {
        const activeIdx   = progressRail
          ? Math.max(0, progressRail.stages.findIndex((s) => s.key === progressRail.currentKey))
          : 0;
        const activeStage = progressRail?.stages[activeIdx];

        return (
          <div className="border-t border-border px-4 py-2 sm:px-5 lg:px-[22px]">
            {/* Single line: [dot + stage + step] | [op dims] ··· [Timeline ›] */}
            <div className="flex items-center gap-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">

              {/* Progress summary */}
              {progressRail && (
                <div className="flex items-center gap-2 shrink-0">
                  <div className="relative flex-none flex items-center justify-center w-[14px] h-[14px]">
                    <span
                      className="absolute inset-0 rounded-full animate-ping bg-foreground/12"
                      style={{ animationDuration: "2.4s" }}
                    />
                    <div className="w-[8px] h-[8px] rounded-full bg-card border-2 border-foreground relative z-[1]">
                      <span className="absolute inset-[1.5px] rounded-full bg-foreground" />
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-foreground">{activeStage?.label ?? "—"}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    · Step {activeIdx + 1} / {progressRail.stages.length}
                  </span>
                </div>
              )}

              {/* Vertical separator before op dims */}
              {progressRail && (tier2Dims.length > 0 || workflowDim) && (
                <span className="w-px h-3.5 bg-border shrink-0" />
              )}

              {/* Op dims */}
              {tier2Dims.map((dim) => (
                <div key={dim.dimension} className="inline-flex items-center gap-[7px] text-xs shrink-0">
                  <span className="text-muted-foreground font-medium capitalize">{dim.label}</span>
                  <OpChip value={dim.status_label} intent={dim.intent} />
                </div>
              ))}
              {workflowDim && (
                <div className="inline-flex items-center gap-[7px] text-xs shrink-0">
                  <span className="text-muted-foreground font-medium">{workflowDim.label}</span>
                  <span className="font-semibold text-muted-foreground">{workflowDim.status_label}</span>
                </div>
              )}

              {/* Timeline toggle — pushed to far right */}
              {progressRail && (
                <button
                  onClick={() => setRailExpanded((v) => !v)}
                  className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
                >
                  <span className="font-medium">{railExpanded ? "Less" : "Timeline"}</span>
                  {railExpanded
                    ? <ChevronUp   className="h-3 w-3" />
                    : <ChevronDown className="h-3 w-3" />}
                </button>
              )}
            </div>

            {/* Expanded timeline grid */}
            {railExpanded && progressRail && (
              <div className="mt-3 pt-3 border-t border-dashed border-border">
                <ProgressRailGrid rail={progressRail} />
              </div>
            )}
          </div>
        );
      })()}

      {/* ── AUDIT META — expanded only ───────────────────────────────── */}
      {isExpanded && data.audit && <AuditMetaBar audit={data.audit} />}

      {/* ── TABS ─────────────────────────────────────────────────────── */}
      {tabs && tabs.length > 0 && (
        <div className="border-t border-border bg-muted/50 px-4 flex items-center gap-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-5 lg:px-[22px]">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              disabled={tab.disabled}
              onClick={() => onTabChange?.(tab.id)}
              className={cn(
                "relative py-2.5 text-sm font-medium whitespace-nowrap transition-colors shrink-0",
                activeTab === tab.id
                  ? "text-foreground after:absolute after:left-0 after:right-0 after:-bottom-px after:h-0.5 after:bg-foreground after:content-['']"
                  : "text-muted-foreground hover:text-foreground",
                tab.disabled && "pointer-events-none opacity-50",
              )}
            >
              {tab.label}
              {tab.count != null && (
                <span className={cn(
                  "ml-1.5 text-2xs px-1 py-0.5 rounded font-semibold tabular-nums",
                  tab.countIntent === "attention"
                    ? "bg-info/10 text-info"
                    : "bg-muted text-muted-foreground",
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
