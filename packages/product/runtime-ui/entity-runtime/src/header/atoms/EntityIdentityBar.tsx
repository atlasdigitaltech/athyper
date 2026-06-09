"use client";

import { useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { AppWindow, ChevronLeft, Check, Copy, ExternalLink, Pencil } from "lucide-react";
import Link from "next/link";
import { cn } from "@athyper/theme/utils";
import { Badge, type BadgeProps } from "@athyper/ui/primitives";

import type { HeaderIdentity } from "../types";
import {
  headerIdentityPaddingClass,
  typeChipBackButtonClass,
  typeChipClass,
  typeChipLabelClass,
  typeChipStandaloneClass,
  typeChipStandaloneStaticClass,
  typeChipStaticLabelClass,
} from "./headerChrome";

interface AmountSummary {
  label: string;
  amount: string;
  currency?: string;
  subtext?: string;
}

// Scale font size by character length so trillions don't overflow and $1 looks bold.
function amountFontClass(amount: string): string {
  const len = amount.length;
  if (len <= 17) return "text-sm font-medium";
  return "text-xs font-medium";
}

function statusBadgeVariant(intent: HeaderIdentity["status"]["intent"]): BadgeProps["variant"] {
  switch (intent) {
    case "success":
      return "success";
    case "warning":
      return "warning";
    case "error":
      return "destructive";
    case "info":
      return "info";
    case "primary":
    case "accent":
      return "default";
    case "muted":
    case "neutral":
    default:
      return "muted";
  }
}

export interface EntityIdentityBarProps {
  identity: HeaderIdentity;
  /** Pre-composed action cluster for tablet/desktop (sm+). */
  actionsSlot?: ReactNode;
  /**
   * Pre-composed compact action cluster for mobile (< sm).
   * Rendered in row 1 of the stacked mobile layout next to the type chip.
   * When omitted, falls back to actionsSlot.
   */
  mobileActionsSlot?: ReactNode;
  /** Hero amount (e.g. invoice total) shown as two-row block in the top-right. */
  amountSummary?: AmountSummary;
  /** When true, shows the "Editing" badge next to the status badge. */
  editMode?: boolean;
  /** Inline contextual content rendered beside the status badge. */
  identitySlot?: ReactNode;
  /** Action content rendered immediately before the standard action cluster. */
  actionLeadingSlot?: ReactNode;
  onBack?: () => void;
  /**
   * When provided, the type chip renders as a button that calls this handler
   * instead of a Link. Used by edit pages to route the click through guardNavigate.
   */
  onTypeClick?: () => void;
  className?: string;
}

export function EntityIdentityBar({
  identity,
  actionsSlot,
  mobileActionsSlot,
  amountSummary,
  editMode = false,
  identitySlot,
  actionLeadingSlot,
  onBack,
  onTypeClick,
  className,
}: EntityIdentityBarProps) {
  const [copied, setCopied] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [contextCopied, setContextCopied] = useState<string | null>(null);

  const canCopy = identity.identifierAction !== "none";
  const typeLabel = identity.typeLabel.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const hasDistinctName = Boolean(identity.name && identity.name !== identity.number);
  const primaryText = identity.name ?? identity.number;
  const classificationText = identity.classification?.trim();
  const copyItems = [
    ...(identity.number ? [{ key: "code", label: "Code", value: identity.number }] : []),
    ...(identity.name && identity.name !== identity.number
      ? [{ key: "name", label: "Name", value: identity.name }]
      : []),
  ];

  const handleIdentityContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    setContextCopied(null);
    setContextMenu({
      x: Math.min(event.clientX, Math.max(16, window.innerWidth - 320)),
      y: Math.min(event.clientY, Math.max(16, window.innerHeight - 260)),
    });
  };

  const openCurrentRecord = (features?: string) => {
    window.open(window.location.href, "_blank", features ?? "noopener,noreferrer");
    setContextMenu(null);
  };

  const handleContextCopy = (key: string, value: string) => {
    void navigator.clipboard.writeText(value).then(() => {
      setContextCopied(key);
      setTimeout(() => {
        setContextCopied(null);
        setContextMenu(null);
      }, 1200);
    });
  };

  const handleCopyNumber = async () => {
    try {
      await navigator.clipboard.writeText(identity.number);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard write failed; no visual feedback needed
    }
  };

  // ── Chip (back arrow + type label) ────────────────────────────────────────
  const chipEl = onBack ? (
    <div className={typeChipClass}>
      <button
        onClick={onBack}
        aria-label="Go back"
        className={typeChipBackButtonClass}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      {onTypeClick ? (
        <button
          type="button"
          onClick={onTypeClick}
          className={typeChipLabelClass}
        >
          {typeLabel}
        </button>
      ) : identity.typeHref ? (
        <Link
          href={identity.typeHref}
          className={typeChipLabelClass}
        >
          {typeLabel}
        </Link>
      ) : (
        <span className={typeChipStaticLabelClass}>
          {typeLabel}
        </span>
      )}
    </div>
  ) : onTypeClick ? (
    <button
      type="button"
      onClick={onTypeClick}
      className={typeChipStandaloneClass}
    >
      {typeLabel}
    </button>
  ) : identity.typeHref ? (
    <Link
      href={identity.typeHref}
      className={typeChipStandaloneClass}
    >
      {typeLabel}
    </Link>
  ) : (
    <span className={typeChipStandaloneStaticClass}>
      {typeLabel}
    </span>
  );

  // ── Name primary ──────────────────────────────────────────────────────────
  // When name === number (documents), renders as copyable so the user can copy
  // without a secondary code row appearing below.
  const namePrimary = hasDistinctName ? (
    <span
      title={primaryText}
      className="block min-w-0 max-w-full truncate text-base font-medium leading-tight text-foreground"
    >
      {primaryText}
    </span>
  ) : canCopy ? (
    <button
      type="button"
      onClick={handleCopyNumber}
      title="Copy to clipboard"
      className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-left text-base font-medium leading-tight text-foreground tabular-nums transition-colors hover:text-foreground/70"
    >
      <span className="truncate">{primaryText}</span>
      {copied && <Check className="h-3 w-3 flex-none text-muted-foreground" />}
    </button>
  ) : (
    <span
      title={primaryText}
      className="block min-w-0 max-w-full truncate text-base font-medium leading-tight text-foreground tabular-nums"
    >
      {primaryText}
    </span>
  );

  // ── Code secondary — only when name is distinct from number ───────────────
  const codeSecondary = hasDistinctName ? (
    canCopy ? (
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
    )
  ) : null;

  // ── Status badge ──────────────────────────────────────────────────────────
  const statusBadge = (
    <Badge variant={statusBadgeVariant(identity.status.intent)} className="shrink-0 rounded-full px-3 py-1 text-sm font-medium leading-none">
      {identity.status.label}
    </Badge>
  );

  // ── Edit-mode indicator — shown only when actively editing ────────────────
  const editingBadge = editMode ? (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-sm font-medium leading-none text-primary animate-pulse">
      <Pencil className="h-2.5 w-2.5 animate-pencil-write" />
      Editing
    </span>
  ) : null;

  return (
    <div className={cn(headerIdentityPaddingClass, className)}>

      {/* ── sm+ (tablet / desktop) ── */}
      <div className="hidden sm:grid sm:min-w-0 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-4">
        {chipEl}
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">

        {/* Name / code — immediately after chip */}
        <div
          className="flex min-w-0 flex-col justify-center gap-0.5 leading-none"
          onContextMenu={handleIdentityContextMenu}
        >
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

        {identity.version && (
          <span className="shrink-0 rounded-full border border-border bg-muted/30 px-2 py-0.5 text-sm font-medium text-muted-foreground">
            {identity.version}
          </span>
        )}

        {statusBadge}
        {editingBadge}
        {identitySlot && (
          <div className="flex min-w-0 items-center gap-2">
            {identitySlot}
          </div>
        )}

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

      {/* ── mobile (< sm) ─────────────────────────────────────────────────
          Row 1: chip (back + type) | flex spacer | primary action | ⋯
          Row 2: entity name
          Row 3: entity code + status badge [+ editing badge]
          Row 4: amount summary (if present)                            */}
      <div className="sm:hidden flex flex-col gap-1.5">

        {/* Row 1 */}
        <div className="flex items-center gap-2 min-w-0">
          {chipEl}
          <div className="flex-1" />
          <div className="flex items-center gap-1.5 shrink-0">
            {actionLeadingSlot}
            {mobileActionsSlot ?? actionsSlot}
          </div>
        </div>

        {/* Row 2: name */}
        <div className="px-0.5 leading-none" onContextMenu={handleIdentityContextMenu}>
          {namePrimary}
        </div>

        {/* Row 3: code + status */}
        <div className="flex items-center gap-2 px-0.5 flex-wrap">
          {codeSecondary && <span onContextMenu={handleIdentityContextMenu}>{codeSecondary}</span>}
          {classificationText && (
            <span className="max-w-full truncate text-xs text-muted-foreground">
              {classificationText}
            </span>
          )}
          {identity.version && (
            <span className="shrink-0 rounded-full border border-border bg-muted/30 px-2 py-0.5 text-sm font-medium text-muted-foreground">
              {identity.version}
            </span>
          )}
          {statusBadge}
          {editingBadge}
          {identitySlot && (
            <div className="flex min-w-0 items-center gap-2">
              {identitySlot}
            </div>
          )}
        </div>

        {/* Row 4: amount (documents / invoices) */}
        {amountSummary && (
          <div className="flex flex-col gap-0.5 min-w-0 px-0.5">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="shrink-0 text-xs font-medium leading-none text-muted-foreground">
                {amountSummary.label}
              </span>
              {amountSummary.currency && (
                <span className={cn("tabular-nums text-foreground leading-none shrink-0", amountFontClass(amountSummary.amount))}>
                  {amountSummary.currency}
                </span>
              )}
              <span className={cn("tabular-nums text-foreground leading-none shrink-0", amountFontClass(amountSummary.amount))}>
                {amountSummary.amount}
              </span>
            </div>
            {amountSummary.subtext && (
              <span className="break-words text-xs text-muted-foreground">{amountSummary.subtext}</span>
            )}
          </div>
        )}
      </div>

      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setContextMenu(null)}
            onContextMenu={(event) => { event.preventDefault(); setContextMenu(null); }}
          />
          <div
            className="fixed z-50 min-w-[260px] max-w-[320px] rounded-lg border bg-popover py-1 shadow-md"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted"
              onClick={() => openCurrentRecord("noopener,noreferrer")}
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              Open in new tab
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted"
              onClick={() => openCurrentRecord("noopener,noreferrer,width=1280,height=800")}
            >
              <AppWindow className="h-3.5 w-3.5 shrink-0" />
              Open in new window
            </button>

            {canCopy && copyItems.length > 0 && (
              <>
                <div className="my-1 h-px bg-border" />
                <div className="px-3 pb-0.5 pt-1 text-xs font-mediumr text-muted-foreground/50">
                  Copy field
                </div>
                {copyItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-1 text-left transition-colors hover:bg-muted"
                    onClick={() => handleContextCopy(item.key, item.value)}
                  >
                    <span className="w-[90px] shrink-0 truncate text-xs text-muted-foreground">{item.label}</span>
                    {contextCopied === item.key ? (
                      <span className="flex items-center gap-1 text-xs text-success">
                        <Check className="h-3 w-3" />Copied!
                      </span>
                    ) : (
                      <span className="flex-1 truncate text-xs font-medium">{item.value}</span>
                    )}
                    {contextCopied !== item.key && (
                      <Copy className="h-3 w-3 shrink-0 text-muted-foreground/40" />
                    )}
                  </button>
                ))}
              </>
            )}
          </div>
        </>
      )}

    </div>
  );
}
