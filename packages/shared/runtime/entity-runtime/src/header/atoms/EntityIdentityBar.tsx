"use client";

import { useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { AppWindow, ChevronLeft, Check, Copy, ExternalLink, Pencil } from "lucide-react";
import Link from "next/link";
import { cn } from "@athyper/theme/utils";
import { Badge, type BadgeProps } from "@athyper/ui/primitives";

import type { HeaderIdentity } from "../types";

interface AmountSummary {
  label: string;
  amount: string;
  currency?: string;
  subtext?: string;
}

// Scale font size by character length so trillions don't overflow and $1 looks bold.
function amountFontClass(amount: string): string {
  const len = amount.length;
  if (len <= 17) return "text-sm font-semibold";
  return "text-xs font-semibold";
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
  onBack,
  onTypeClick,
  className,
}: EntityIdentityBarProps) {
  const [copied, setCopied] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [contextCopied, setContextCopied] = useState<string | null>(null);

  const canCopy = identity.identifierAction !== "none";
  const typeLabel = identity.typeLabel.replace(/_/g, " ").toUpperCase();
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
    <div className="inline-flex h-[32px] shrink-0 items-center overflow-hidden rounded-md border border-border bg-foreground">
      <button
        onClick={onBack}
        aria-label="Go back"
        className="flex h-full w-9 items-center justify-center border-r border-r-ring bg-foreground text-background transition-colors hover:bg-foreground/85"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      {onTypeClick ? (
        <button
          type="button"
          onClick={onTypeClick}
          className="px-3 text-xs font-semibold tracking-wider text-background bg-foreground h-full flex items-center hover:bg-foreground/85 transition-colors"
        >
          {typeLabel}
        </button>
      ) : identity.typeHref ? (
        <Link
          href={identity.typeHref}
          className="px-3 text-xs font-semibold tracking-wider text-background bg-foreground h-full flex items-center hover:bg-foreground/85 transition-colors"
        >
          {typeLabel}
        </Link>
      ) : (
        <span className="px-3 text-xs font-semibold tracking-wider text-background bg-foreground h-full flex items-center">
          {typeLabel}
        </span>
      )}
    </div>
  ) : onTypeClick ? (
    <button
      type="button"
      onClick={onTypeClick}
      className="shrink-0 h-[32px] rounded-md border border-border bg-foreground text-background px-3 text-xs font-semibold tracking-wider flex items-center hover:bg-foreground/85 transition-colors"
    >
      {typeLabel}
    </button>
  ) : identity.typeHref ? (
    <Link
      href={identity.typeHref}
      className="shrink-0 h-[32px] rounded-md border border-border bg-foreground text-background px-3 text-xs font-semibold tracking-wider flex items-center hover:bg-foreground/85 transition-colors"
    >
      {typeLabel}
    </Link>
  ) : (
    <span className="shrink-0 h-[32px] rounded-md border border-border bg-foreground text-background px-3 text-xs font-semibold tracking-wider flex items-center">
      {typeLabel}
    </span>
  );

  // ── Name primary ──────────────────────────────────────────────────────────
  // When name === number (documents), renders as copyable so the user can copy
  // without a secondary code row appearing below.
  const namePrimary = identity.name && identity.name !== identity.number ? (
    <span className="text-sm font-semibold text-foreground truncate leading-snug">
      {identity.name}
    </span>
  ) : canCopy ? (
    <button
      type="button"
      onClick={handleCopyNumber}
      title="Copy to clipboard"
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground tabular-nums hover:text-foreground/70 transition-colors text-left"
    >
      {identity.name ?? identity.number}
      {copied && <Check className="h-3 w-3 flex-none text-muted-foreground" />}
    </button>
  ) : (
    <span className="text-sm font-semibold text-foreground tabular-nums">
      {identity.name ?? identity.number}
    </span>
  );

  // ── Code secondary — only when name is distinct from number ───────────────
  const codeSecondary = identity.name && identity.name !== identity.number ? (
    canCopy ? (
      <button
        type="button"
        onClick={handleCopyNumber}
        title="Copy to clipboard"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums hover:text-foreground/60 transition-colors text-left"
      >
        {identity.number}
        {copied && <Check className="h-2.5 w-2.5 flex-none" />}
      </button>
    ) : (
      <span className="text-xs text-muted-foreground tabular-nums">
        {identity.number}
      </span>
    )
  ) : null;

  // ── Status badge ──────────────────────────────────────────────────────────
  const statusBadge = (
    <Badge variant={statusBadgeVariant(identity.status.intent)} className="shrink-0 font-semibold">
      {identity.status.label}
    </Badge>
  );

  // ── Edit-mode indicator — shown only when actively editing ────────────────
  const editingBadge = editMode ? (
    <span className="inline-flex items-center gap-1.5 rounded border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs font-semibold leading-none text-primary shrink-0">
      <Pencil className="h-2.5 w-2.5" />
      Editing
    </span>
  ) : null;

  return (
    <div className={cn("px-4 py-3 sm:px-5 lg:px-[22px]", className)}>

      {/* ── sm+ (tablet / desktop) ── */}
      <div className="hidden sm:flex sm:items-center sm:gap-3 sm:min-w-0">
        {chipEl}

        {/* Name / code — immediately after chip */}
        <div
          className="flex flex-col min-w-0 shrink leading-none gap-0.5 max-w-[220px]"
          onContextMenu={handleIdentityContextMenu}
        >
          {namePrimary}
          {codeSecondary}
        </div>

        {identity.version && (
          <span className="text-2xs font-medium text-muted-foreground border border-border rounded px-1.5 py-0.5 shrink-0">
            {identity.version}
          </span>
        )}

        {statusBadge}
        {editingBadge}

        <div className="ml-auto flex items-center gap-4 min-w-0">
          {actionsSlot}
          {amountSummary && (
            <div className="flex flex-col items-end gap-0.5 min-w-0 shrink-0">
              <div className="flex items-baseline gap-2 flex-wrap justify-end">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-normal leading-none shrink-0">
                  TOTAL
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
                <span className="text-2xs text-muted-foreground text-right break-words min-w-0 max-w-[260px]">
                  {amountSummary.subtext}
                </span>
              )}
            </div>
          )}
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
            {mobileActionsSlot ?? actionsSlot}
          </div>
        </div>

        {/* Row 2: name */}
        <div className="px-0.5 leading-none" onContextMenu={handleIdentityContextMenu}>
          {namePrimary}
        </div>

        {/* Row 3: code + status */}
        <div className="flex items-center gap-2 px-0.5 flex-wrap">
          <span onContextMenu={handleIdentityContextMenu}>{codeSecondary}</span>
          {statusBadge}
          {editingBadge}
        </div>

        {/* Row 4: amount (documents / invoices) */}
        {amountSummary && (
          <div className="flex flex-col gap-0.5 min-w-0 px-0.5">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-normal leading-none shrink-0">
                TOTAL
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
              <span className="text-2xs text-muted-foreground break-words">{amountSummary.subtext}</span>
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
                <div className="px-3 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
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
