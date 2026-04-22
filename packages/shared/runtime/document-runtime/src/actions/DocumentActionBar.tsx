/**
 * @athyper/document-runtime — Document Action Bar
 *
 * Spec v1.2 §C.3: State-adaptive action bundle renderer.
 * Groups actions into primary (CTA), working (secondary), output (ghost),
 * and overflow (dropdown menu). Blocked reasons disable the primary CTA.
 *
 * Action codes must match entity_operation.permission_code values.
 */
"use client";

import { useState } from "react";
import {
  MoreHorizontal,
  Loader2,
  CheckCircle2,
  XCircle,
  type LucideIcon,
  CreditCard,
  Pencil,
  Copy,
  Printer,
  FileDown,
  Eye,
  ArrowRight,
  FileCheck,
  FileText,
  RotateCcw,
  Ban,
  Send,
  Shield,
  Users,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import {
  Button,
  Separator,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  Textarea,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@athyper/ui/primitives";
import { type ActionBundleItem } from "@athyper/api-contracts/documents";

// ── Types ─────────────────────────────────────────────────────────────────────

type ActionFeedback = { status: "success" | "error"; message: string } | null;

// ── Icon map ──────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  credit_card:        CreditCard,
  pencil:             Pencil,
  document_duplicate: Copy,
  printer:            Printer,
  document_arrow_down: FileDown,
  eye:                Eye,
  arrow_right:        ArrowRight,
  check_circle:       CheckCircle2,
  x_circle:           XCircle,
  shield:             Shield,
  users:              Users,
  document:           FileText,
  arrow_path:         ArrowRight,
  "file-check":       FileCheck,
  "file-text-dashed": FileText,
  "rotate-ccw":       RotateCcw,
  ban:                Ban,
  send:               Send,
};

function getIcon(key: string | null): LucideIcon | null {
  return key ? (ICON_MAP[key] ?? null) : null;
}

// ── ConfirmSheet ──────────────────────────────────────────────────────────────

function ConfirmSheet({
  action,
  loading,
  onConfirm,
  onCancel,
}: {
  action: ActionBundleItem | null;
  loading: boolean;
  onConfirm: (remarks: string) => void;
  onCancel: () => void;
}) {
  const [remarks, setRemarks] = useState("");

  if (!action) return null;

  return (
    <Sheet open={!!action} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{action.label}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 space-y-4 px-1 py-4">
          <p className="text-sm text-muted-foreground">
            {action.disabled_reason ?? `Confirm: ${action.label}`}
          </p>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Remarks (optional)</label>
            <Textarea
              placeholder="Add a note…"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const r = remarks;
              setRemarks("");
              onConfirm(r);
            }}
            disabled={loading}
          >
            {loading && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Confirm
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ── DocumentActionBar ─────────────────────────────────────────────────────────

export interface DocumentActionBarProps {
  actions: ActionBundleItem[];
  blockedReasons?: string[];
  /** Called when an action is dispatched.
   *  For actions with requires_confirmation, `remarks` carries the note text. */
  onAction: (actionCode: string, remarks?: string) => void | Promise<void>;
  loadingAction?: string | null;
  className?: string;
}

export function DocumentActionBar({
  actions,
  blockedReasons = [],
  onAction,
  loadingAction,
  className,
}: DocumentActionBarProps) {
  const [confirmAction, setConfirmAction] = useState<ActionBundleItem | null>(null);
  const [feedback, setFeedback] = useState<ActionFeedback>(null);

  const isBlocked = blockedReasons.length > 0;
  const primary  = actions.filter((a) => a.group === "primary");
  const working  = actions.filter((a) => a.group === "working");
  const output   = actions.filter((a) => a.group === "output");
  const overflow = actions.filter((a) => a.group === "overflow");

  async function handleClick(action: ActionBundleItem) {
    if (action.requires_confirmation) {
      setConfirmAction(action);
      return;
    }
    setFeedback(null);
    try {
      await onAction(action.action_code);
      setFeedback({ status: "success", message: `${action.label} completed` });
    } catch (err) {
      setFeedback({
        status: "error",
        message: err instanceof Error ? err.message : "Action failed",
      });
    }
  }

  async function handleConfirm(remarks: string) {
    if (!confirmAction) return;
    const action = confirmAction;
    setConfirmAction(null);
    setFeedback(null);
    try {
      await onAction(action.action_code, remarks);
      setFeedback({ status: "success", message: `${action.label} completed` });
    } catch (err) {
      setFeedback({
        status: "error",
        message: err instanceof Error ? err.message : "Action failed",
      });
    }
  }

  return (
    <>
      <div className={cn("flex items-center gap-2", className)}>
        {/* Inline feedback strip */}
        {feedback && (
          <span
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 text-xs",
              feedback.status === "success"
                ? "bg-success/10 text-success"
                : "bg-destructive/10 text-destructive",
            )}
          >
            {feedback.status === "success" ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <XCircle className="h-3.5 w-3.5 shrink-0" />
            )}
            {feedback.message}
          </span>
        )}

        {/* Primary CTA */}
        {primary.map((action) => {
          const Icon = getIcon(action.icon_key);
          const isLoading = loadingAction === action.action_code;
          return (
            <Button
              key={action.action_code}
              size="sm"
              disabled={action.is_disabled || isBlocked || isLoading}
              onClick={() => void handleClick(action)}
              title={isBlocked ? blockedReasons[0] : (action.disabled_reason ?? undefined)}
            >
              {isLoading ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : Icon ? (
                <Icon className="mr-1 h-3.5 w-3.5" />
              ) : null}
              {action.label}
            </Button>
          );
        })}

        {primary.length > 0 && working.length > 0 && (
          <Separator orientation="vertical" className="h-5" />
        )}

        {/* Working (secondary) actions */}
        {working.map((action) => {
          const Icon = getIcon(action.icon_key);
          return (
            <Button
              key={action.action_code}
              variant="outline"
              size="sm"
              disabled={action.is_disabled}
              onClick={() => void handleClick(action)}
            >
              {Icon && <Icon className="mr-1 h-3.5 w-3.5" />}
              {action.label}
            </Button>
          );
        })}

        {working.length > 0 && output.length > 0 && (
          <Separator orientation="vertical" className="h-5" />
        )}

        {/* Output (ghost) actions */}
        {output.map((action) => {
          const Icon = getIcon(action.icon_key);
          return (
            <Button
              key={action.action_code}
              variant="ghost"
              size="sm"
              disabled={action.is_disabled}
              onClick={() => void handleClick(action)}
              className="text-muted-foreground"
            >
              {Icon && <Icon className="mr-1 h-3.5 w-3.5" />}
              {action.label}
            </Button>
          );
        })}

        {/* Overflow dropdown — uses Radix DropdownMenu to avoid portal/z-index issues */}
        {overflow.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="More actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {overflow.map((action) => (
                <DropdownMenuItem
                  key={action.action_code}
                  disabled={action.is_disabled}
                  onClick={() => void handleClick(action)}
                  className={cn(action.is_destructive && "text-destructive focus:text-destructive")}
                >
                  {action.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Confirmation sheet */}
      <ConfirmSheet
        action={confirmAction}
        loading={loadingAction === confirmAction?.action_code}
        onConfirm={(remarks) => void handleConfirm(remarks)}
        onCancel={() => setConfirmAction(null)}
      />
    </>
  );
}
