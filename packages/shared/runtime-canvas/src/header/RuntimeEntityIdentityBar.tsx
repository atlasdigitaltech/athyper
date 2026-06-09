"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeft, Check, Pencil } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import type { HeaderIdentity } from "./types";
import {
  headerIdentityPaddingClass,
  typeChipBackButtonClass,
  typeChipClass,
  typeChipLabelClass,
  typeChipStandaloneClass,
  typeChipStandaloneStaticClass,
  typeChipStaticLabelClass,
} from "./header-chrome";

interface AmountSummary {
  label: string;
  amount: string;
  currency?: string;
  subtext?: string;
}

export interface RuntimeEntityIdentityBarProps {
  identity: HeaderIdentity;
  actionsSlot?: ReactNode;
  mobileActionsSlot?: ReactNode;
  amountSummary?: AmountSummary;
  editMode?: boolean;
  identitySlot?: ReactNode;
  actionLeadingSlot?: ReactNode;
  onTypeClick?: () => void;
  onBack?: () => void;
  className?: string;
}

function amountFontClass(amount: string): string {
  return amount.length <= 17 ? "text-sm font-medium" : "text-xs font-medium";
}

function statusIntentClasses(intent: HeaderIdentity["status"]["intent"]): string {
  switch (intent) {
    case "success":
      return "border-success/40 bg-success/10 text-success [--dot:theme(colors.success.DEFAULT)]";
    case "warning":
      return "border-warning/40 bg-warning/10 text-warning [--dot:theme(colors.warning.DEFAULT)]";
    case "error":
      return "border-destructive/40 bg-destructive/10 text-destructive [--dot:theme(colors.destructive.DEFAULT)]";
    case "info":
      return "border-info/40 bg-info/10 text-info [--dot:theme(colors.info.DEFAULT)]";
    case "primary":
    case "accent":
      return "border-primary/40 bg-primary/10 text-primary [--dot:theme(colors.primary.DEFAULT)]";
    case "muted":
    case "neutral":
    default:
      return "border-border bg-muted text-muted-foreground [--dot:theme(colors.muted.foreground)]";
  }
}

export function RuntimeEntityIdentityBar({
  identity,
  actionsSlot,
  mobileActionsSlot,
  amountSummary,
  editMode = false,
  identitySlot,
  actionLeadingSlot,
  onTypeClick,
  onBack,
  className,
}: RuntimeEntityIdentityBarProps) {
  const [copied, setCopied] = useState(false);

  const canCopy = identity.identifierAction !== "none";
  const typeLabel = identity.typeLabel.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const hasDistinctName = Boolean(identity.name && identity.name !== identity.number);
  const primaryText = identity.name ?? identity.number;
  const classificationText = identity.classification?.trim();

  const handleCopyNumber = async () => {
    if (!canCopy) return;
    try {
      await navigator.clipboard.writeText(identity.number);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable in restricted browser contexts.
    }
  };

  const typeChipLabel = identity.typeHref ? (
    <a
      href={identity.typeHref}
      title={identity.typeTooltip}
      className={typeChipLabelClass}
      onClick={(event) => {
        if (!onTypeClick) return;
        event.preventDefault();
        onTypeClick();
      }}
    >
      {typeLabel}
    </a>
  ) : (
    <span className={typeChipStaticLabelClass}>{typeLabel}</span>
  );

  const chipEl = onBack ? (
    <div className={typeChipClass}>
      <button type="button" onClick={onBack} aria-label="Go back" className={typeChipBackButtonClass}>
        <ArrowLeft aria-hidden="true" className="size-4" />
      </button>
      {typeChipLabel}
    </div>
  ) : identity.typeHref ? (
    <a
      href={identity.typeHref}
      title={identity.typeTooltip}
      className={typeChipStandaloneClass}
      onClick={(event) => {
        if (!onTypeClick) return;
        event.preventDefault();
        onTypeClick();
      }}
    >
      {typeLabel}
    </a>
  ) : (
    <span className={typeChipStandaloneStaticClass}>{typeLabel}</span>
  );

  const namePrimary = hasDistinctName ? (
    <span
      title={primaryText}
      className="block min-w-0 max-w-full truncate text-sm font-medium leading-tight text-foreground"
    >
      {primaryText}
    </span>
  ) : canCopy ? (
    <button
      type="button"
      onClick={handleCopyNumber}
      title="Copy to clipboard"
      className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-left text-sm font-medium leading-tight text-foreground tabular-nums transition-colors hover:text-foreground/70"
    >
      <span className="truncate">{primaryText}</span>
      {copied && <Check className="h-3 w-3 flex-none text-muted-foreground" />}
    </button>
  ) : (
    <span
      title={primaryText}
      className="block min-w-0 max-w-full truncate text-sm font-medium leading-tight text-foreground tabular-nums"
    >
      {primaryText}
    </span>
  );

  const codeSecondary = hasDistinctName ? (
    <div className="flex min-w-0 items-center gap-1.5">
      {canCopy ? (
        <button
          type="button"
          onClick={handleCopyNumber}
          title="Copy to clipboard"
          className="inline-flex min-w-0 max-w-full items-center gap-1 text-left text-sm font-medium text-muted-foreground tabular-nums transition-colors hover:text-foreground/60"
        >
          <span className="truncate">{identity.number}</span>
          {copied && <Check className="h-2.5 w-2.5 flex-none" />}
        </button>
      ) : (
        <span className="block min-w-0 max-w-full truncate text-sm font-medium text-muted-foreground tabular-nums">
          {identity.number}
        </span>
      )}
      {identity.version && (
        <>
          <span aria-hidden className="text-xs text-muted-foreground/50">·</span>
          <span className="shrink-0 text-xs text-muted-foreground">{identity.version}</span>
        </>
      )}
    </div>
  ) : null;

  const statusBadge = (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium leading-none", statusIntentClasses(identity.status.intent))}>
      <span className="size-1.5 shrink-0 rounded-full bg-[color:var(--dot)]" />
      {identity.status.label}
    </span>
  );

  const editingBadge = editMode ? (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2 py-1 text-sm font-medium leading-none text-primary">
      <Pencil className="h-2.5 w-2.5 animate-pencil-write" />
      Editing
    </span>
  ) : null;

  return (
    <div className={cn(headerIdentityPaddingClass, className)}>
      <div className="hidden sm:grid sm:min-w-0 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-4">
        {chipEl}
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex min-w-0 flex-col justify-center gap-0.5 leading-none">
              <div className="flex min-w-0 items-center gap-1.5">
                {namePrimary}
                {classificationText && (
                  <>
                    <span aria-hidden className="h-1 w-1 shrink-0 rounded-full bg-border" />
                    <span className="min-w-0 truncate text-xs text-muted-foreground">
                      {classificationText}
                    </span>
                  </>
                )}
              </div>
              {codeSecondary}
            </div>

            {statusBadge}
            {editingBadge}
            {identitySlot && <div className="flex min-w-0 items-center gap-2">{identitySlot}</div>}
          </div>

          <div className="ml-auto flex shrink-0 items-center justify-end gap-3">
            {actionLeadingSlot}
            {actionsSlot}
            {amountSummary && (
              <div className="flex min-w-0 shrink-0 flex-col items-end gap-0.5">
                <div className="flex flex-wrap items-baseline justify-end gap-2">
                  <span className="max-w-28 truncate text-xs font-medium leading-none text-muted-foreground">
                    {amountSummary.label}
                  </span>
                  {amountSummary.currency && (
                    <span className={cn("shrink-0 tabular-nums leading-none text-foreground", amountFontClass(amountSummary.amount))}>
                      {amountSummary.currency}
                    </span>
                  )}
                  <span className={cn("shrink-0 tabular-nums leading-none text-foreground", amountFontClass(amountSummary.amount))}>
                    {amountSummary.amount}
                  </span>
                </div>
                {amountSummary.subtext && (
                  <span className="min-w-0 max-w-[260px] break-words text-right text-xs text-muted-foreground">
                    {amountSummary.subtext}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 sm:hidden">
        <div className="flex min-w-0 items-center gap-2">
          {chipEl}
          <div className="flex-1" />
          <div className="flex shrink-0 items-center gap-1.5">
            {actionLeadingSlot}
            {mobileActionsSlot ?? actionsSlot}
          </div>
        </div>

        <div className="px-0.5 leading-none">{namePrimary}</div>

        <div className="flex flex-wrap items-center gap-2 px-0.5">
          {codeSecondary}
          {classificationText && <span className="max-w-full truncate text-xs text-muted-foreground">{classificationText}</span>}
          {statusBadge}
          {editingBadge}
          {identitySlot && <div className="flex min-w-0 items-center gap-2">{identitySlot}</div>}
        </div>

        {amountSummary && (
          <div className="flex min-w-0 flex-col gap-0.5 px-0.5">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="shrink-0 text-xs font-medium leading-none text-muted-foreground">
                {amountSummary.label}
              </span>
              {amountSummary.currency && (
                <span className={cn("shrink-0 tabular-nums leading-none text-foreground", amountFontClass(amountSummary.amount))}>
                  {amountSummary.currency}
                </span>
              )}
              <span className={cn("shrink-0 tabular-nums leading-none text-foreground", amountFontClass(amountSummary.amount))}>
                {amountSummary.amount}
              </span>
            </div>
            {amountSummary.subtext && <span className="break-words text-xs text-muted-foreground">{amountSummary.subtext}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
