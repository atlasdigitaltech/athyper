/**
 * @athyper/document-runtime — Approvable Document Header
 *
 * Reusable header for all approvable documents (Invoice, PO, Payment Entry, etc.).
 * Three display modes:
 *   expanded  — full identity + party/money/dates + metadata + approval flow + tabs
 *   collapsed — identity bar + tabs only (compact)
 *   pinned    — expanded but sticky to top (z-30)
 *
 * Tabs are caller-managed; pass `tabs`, `activeTab`, `onTabChange` as props.
 */
"use client";

import React, { useState } from "react";
import { Check, Clock, AlertCircle, PanelTopOpen, PanelTop, Pin } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { Badge, Button, Separator } from "@athyper/ui/primitives";
import type {
  ApprovableDocumentHeaderDTO,
  ApprovableFlowStep,
  HeaderMode,
} from "./types";

// ── Tab type (public) ────────────────────────────────────────────────────────

export interface ApprovableDocumentHeaderTab {
  id: string;
  label: string;
  /** Rendered as a compact count badge beside the label */
  count?: number;
  disabled?: boolean;
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface ApprovableDocumentHeaderProps {
  data: ApprovableDocumentHeaderDTO;
  initialMode?: HeaderMode;
  onModeChange?: (mode: HeaderMode) => void;
  /** Called with the action code from data.primaryAction / secondaryActions / destructiveAction */
  onAction?: (action: string) => void;
  tabs?: ApprovableDocumentHeaderTab[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  className?: string;
}

// ── Internal sub-components ──────────────────────────────────────────────────

function PartyAvatar({ initials, color }: { initials: string; color?: string }) {
  return (
    <div
      className={cn(
        "flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-full text-sm font-bold text-white",
        color ?? "bg-primary",
      )}
    >
      {initials.slice(0, 2).toUpperCase()}
    </div>
  );
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: HeaderMode;
  onChange: (m: HeaderMode) => void;
}) {
  const modes: { key: HeaderMode; icon: React.ReactNode; title: string }[] = [
    { key: "expanded", icon: <PanelTopOpen className="h-3.5 w-3.5" />, title: "Expanded" },
    { key: "collapsed", icon: <PanelTop className="h-3.5 w-3.5" />, title: "Collapsed" },
    { key: "pinned", icon: <Pin className="h-3.5 w-3.5" />, title: "Pinned" },
  ];

  return (
    <div className="flex items-center overflow-hidden rounded-md border">
      {modes.map(({ key, icon, title }, i) => (
        <button
          key={key}
          title={title}
          onClick={() => onChange(key)}
          className={cn(
            "flex items-center justify-center px-2 py-1.5 transition-colors",
            i > 0 && "border-l",
            mode === key
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}

function DueBadge({ label, intent }: { label: string; intent: "info" | "warning" | "error" }) {
  const cls = {
    info: "bg-info/10 text-info border-info/30",
    warning: "bg-warning/10 text-warning border-warning/30",
    error: "bg-destructive/10 text-destructive border-destructive/30",
  }[intent];
  return (
    <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-semibold", cls)}>
      {label}
    </span>
  );
}

function MetadataItem({
  label,
  value,
  url,
}: {
  label: string;
  value: string;
  url?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {url ? (
        <a href={url} className="text-xs font-medium text-primary hover:underline">
          {value}
        </a>
      ) : (
        <p className="truncate text-xs font-medium">{value}</p>
      )}
    </div>
  );
}

function ApprovalFlowStrip({ steps }: { steps: ApprovableFlowStep[] }) {
  return (
    <div className="flex items-start overflow-x-auto pb-1">
      {steps.flatMap((step, i) => {
        const dotClass = {
          completed: "border-success bg-success",
          current: "border-primary bg-primary/10 ring-2 ring-primary/20",
          blocked: "border-destructive bg-destructive/10",
          pending: "border-muted-foreground/40 bg-background",
        }[step.status];

        const icon = {
          completed: <Check className="h-3 w-3 text-white" />,
          current: <Clock className="h-3 w-3 text-primary" />,
          blocked: <AlertCircle className="h-3 w-3 text-destructive" />,
          pending: <Clock className="h-3 w-3 text-muted-foreground/50" />,
        }[step.status];

        const lineClass =
          step.status === "completed" ? "bg-success" : "bg-border";

        const items = [
          <div key={`step-${i}`} className="flex flex-col items-center">
            <div
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full border-2",
                dotClass,
              )}
            >
              {icon}
            </div>
            <span className="mt-1.5 whitespace-nowrap text-[11px] font-medium leading-tight">
              {step.name}
            </span>
            {step.assignee && (
              <span className="whitespace-nowrap text-[10px] leading-tight text-muted-foreground">
                {step.assignee}
              </span>
            )}
            {step.note && (
              <span className="whitespace-nowrap text-[10px] leading-tight text-muted-foreground">
                {step.note}
              </span>
            )}
          </div>,
        ];

        if (i < steps.length - 1) {
          items.push(
            <div
              key={`line-${i}`}
              className={cn("mt-3 h-0.5 min-w-[24px] flex-1", lineClass)}
            />,
          );
        }

        return items;
      })}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function ApprovableDocumentHeader({
  data,
  initialMode = "expanded",
  onModeChange,
  onAction,
  tabs,
  activeTab,
  onTabChange,
  className,
}: ApprovableDocumentHeaderProps) {
  const [mode, setMode] = useState<HeaderMode>(initialMode);

  const handleModeChange = (m: HeaderMode) => {
    setMode(m);
    onModeChange?.(m);
  };

  const {
    identity,
    party,
    money,
    dates,
    references,
    submittedBy,
    costCenter,
    approvalFlow,
    primaryAction,
    secondaryActions,
    destructiveAction,
  } = data;

  const isExpanded = mode !== "collapsed";

  const statusVariant = (
    {
      success: "success",
      warning: "warning",
      error: "destructive",
      info: "info",
      neutral: "outline",
      primary: "outline",
      accent: "outline",
      muted: "muted",
    } as const
  )[identity.statusIntent] ?? "outline";

  const hasMetadata =
    (references && references.length > 0) ||
    submittedBy ||
    costCenter ||
    money?.paymentTerms ||
    dates?.createdAt;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border bg-card",
        mode === "pinned" && "sticky top-0 z-30",
        className,
      )}
    >
      {/* ── Identity Bar ──────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        {/* Left: type chip + number + version + status */}
        <div className="flex min-w-0 items-center gap-2">
          <Badge variant="outline" className="shrink-0 text-[10px] font-bold uppercase tracking-wide">
            {identity.typeLabel}
          </Badge>
          <span className="truncate text-base font-semibold">{identity.number}</span>
          {identity.version && (
            <Badge variant="muted" className="shrink-0 text-[10px]">
              {identity.version}
            </Badge>
          )}
          <Badge variant={statusVariant} className="shrink-0">
            {identity.statusLabel}
          </Badge>
        </div>

        {/* Right: mode toggle + actions */}
        <div className="flex shrink-0 items-center gap-2">
          <ModeToggle mode={mode} onChange={handleModeChange} />

          {(primaryAction || (secondaryActions && secondaryActions.length > 0) || destructiveAction) && (
            <Separator orientation="vertical" className="h-5" />
          )}

          {primaryAction && (
            <Button
              size="sm"
              onClick={() => onAction?.(primaryAction.action)}
              className="text-xs"
            >
              {primaryAction.label}
            </Button>
          )}

          {secondaryActions?.map((a) => (
            <Button
              key={a.action}
              variant="ghost"
              size="sm"
              onClick={() => onAction?.(a.action)}
              className="text-xs"
            >
              {a.label}
            </Button>
          ))}

          {destructiveAction && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAction?.(destructiveAction.action)}
              className="text-xs text-destructive hover:text-destructive"
            >
              {destructiveAction.label}
            </Button>
          )}
        </div>
      </div>

      {/* ── Expanded body ─────────────────────────────────────── */}
      {isExpanded && (
        <>
          <Separator />

          {/* Party · Money · Dates */}
          {(party || money || dates) && (
            <div className="flex flex-wrap items-start gap-x-6 gap-y-4 px-4 py-4">
              {/* Party */}
              {party && (
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <PartyAvatar initials={party.initials} color={party.avatarColor} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{party.name}</p>
                    {party.subtitle && (
                      <p className="text-xs text-muted-foreground">{party.subtitle}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Money */}
              {money && (
                <div className="shrink-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {money.totalLabel ?? "Total"}
                  </p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-bold tabular-nums">{money.formatted}</span>
                    <span className="text-sm text-muted-foreground">{money.currency}</span>
                  </div>
                  {(money.subtotal || money.tax) && (
                    <p className="text-[10px] tabular-nums text-muted-foreground">
                      {money.subtotal && `Subtotal ${money.subtotal}`}
                      {money.subtotal && money.tax && " + "}
                      {money.tax && `VAT ${money.tax}`}
                    </p>
                  )}
                </div>
              )}

              {/* Vertical separator between money and dates */}
              {money && dates && (
                <Separator orientation="vertical" className="hidden h-12 self-center md:block" />
              )}

              {/* Dates */}
              {dates && (
                <div className="shrink-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {dates.documentDateLabel ?? "Date"}
                  </p>
                  <p className="text-sm font-medium">{dates.documentDate}</p>
                  {dates.dueDate && (
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <p className="text-xs text-muted-foreground">{dates.dueDate}</p>
                      {dates.dueMeta && (
                        <DueBadge label={dates.dueMeta.label} intent={dates.dueMeta.intent} />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Metadata row */}
          {hasMetadata && (
            <>
              <Separator />
              <div className="flex flex-wrap items-start gap-x-8 gap-y-3 px-4 py-3">
                {references?.map((ref) => (
                  <MetadataItem key={ref.label} label={ref.label} value={ref.value} url={ref.url} />
                ))}
                {costCenter && (
                  <MetadataItem
                    label="Cost Center"
                    value={`${costCenter.code} · ${costCenter.name}`}
                  />
                )}
                {money?.paymentTerms && (
                  <MetadataItem
                    label="Payment Terms"
                    value={
                      money.earlyPayDiscount
                        ? `${money.paymentTerms} · ${money.earlyPayDiscount} discount`
                        : money.paymentTerms
                    }
                  />
                )}
                {submittedBy && <MetadataItem label="Submitted By" value={submittedBy} />}
                {dates?.createdAt && <MetadataItem label="Created" value={dates.createdAt} />}
              </div>
            </>
          )}

          {/* Approval flow strip */}
          {approvalFlow && approvalFlow.length > 0 && (
            <>
              <Separator />
              <div className="px-4 py-3">
                <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Approval Flow
                </p>
                <ApprovalFlowStrip steps={approvalFlow} />
              </div>
            </>
          )}
        </>
      )}

      {/* ── Tabs bar ──────────────────────────────────────────── */}
      {tabs && tabs.length > 0 && (
        <>
          <Separator />
          <div className="flex items-center overflow-x-auto px-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                disabled={tab.disabled}
                onClick={() => onTabChange?.(tab.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition-colors",
                  activeTab === tab.id
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                  tab.disabled && "pointer-events-none opacity-50",
                )}
              >
                {tab.label}
                {tab.count != null && (
                  <span
                    className={cn(
                      "rounded px-1 py-0.5 text-[10px] tabular-nums",
                      activeTab === tab.id
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
