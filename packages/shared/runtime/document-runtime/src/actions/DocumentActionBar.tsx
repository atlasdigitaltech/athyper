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
  type LucideIcon,
  CreditCard,
  Pencil,
  Copy,
  Printer,
  FileDown,
  Eye,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Shield,
  Users,
  FileText,
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
} from "@athyper/ui/primitives";
import { type ActionBundleItem } from "@athyper/api-contracts/documents";

export interface DocumentActionBarProps {
  actions: ActionBundleItem[];
  blockedReasons?: string[];
  onAction: (actionCode: string) => void;
  loadingAction?: string | null;
  className?: string;
}

const ICON_MAP: Record<string, LucideIcon> = {
  credit_card: CreditCard,
  pencil: Pencil,
  document_duplicate: Copy,
  printer: Printer,
  document_arrow_down: FileDown,
  eye: Eye,
  arrow_right: ArrowRight,
  check_circle: CheckCircle2,
  x_circle: XCircle,
  shield: Shield,
  users: Users,
  document: FileText,
  arrow_path: ArrowRight,
};

function getIcon(key: string | null): LucideIcon | null {
  return key ? ICON_MAP[key] ?? null : null;
}

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
            Confirm: {action.label}
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
              onConfirm(remarks);
              setRemarks("");
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

export function DocumentActionBar({
  actions,
  blockedReasons = [],
  onAction,
  loadingAction,
  className,
}: DocumentActionBarProps) {
  const [confirmAction, setConfirmAction] = useState<ActionBundleItem | null>(null);
  const [showOverflow, setShowOverflow] = useState(false);

  const isBlocked = blockedReasons.length > 0;
  const primary = actions.filter((a) => a.group === "primary");
  const working = actions.filter((a) => a.group === "working");
  const output = actions.filter((a) => a.group === "output");
  const overflow = actions.filter((a) => a.group === "overflow");

  function handleClick(action: ActionBundleItem) {
    if (action.requires_confirmation) {
      setConfirmAction(action);
    } else {
      onAction(action.action_code);
    }
  }

  return (
    <>
      <div className={cn("flex items-center gap-2", className)}>
        {/* Primary CTA */}
        {primary.map((action) => {
          const Icon = getIcon(action.icon_key);
          const isLoading = loadingAction === action.action_code;

          return (
            <Button
              key={action.action_code}
              size="sm"
              disabled={action.is_disabled || isBlocked || isLoading}
              onClick={() => handleClick(action)}
              title={
                isBlocked
                  ? blockedReasons[0]
                  : action.disabled_reason ?? undefined
              }
              className="text-xs font-semibold"
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

        {/* Separator between primary and working */}
        {primary.length > 0 && working.length > 0 && (
          <Separator orientation="vertical" className="h-5" />
        )}

        {/* Working actions */}
        {working.map((action) => {
          const Icon = getIcon(action.icon_key);
          return (
            <Button
              key={action.action_code}
              variant="outline"
              size="sm"
              disabled={action.is_disabled}
              onClick={() => handleClick(action)}
              className="text-xs"
            >
              {Icon && <Icon className="mr-1 h-3.5 w-3.5" />}
              <span className="hidden xl:inline">{action.label}</span>
            </Button>
          );
        })}

        {/* Separator between working and output */}
        {working.length > 0 && output.length > 0 && (
          <Separator orientation="vertical" className="h-5" />
        )}

        {/* Output actions */}
        {output.map((action) => {
          const Icon = getIcon(action.icon_key);
          return (
            <Button
              key={action.action_code}
              variant="ghost"
              size="sm"
              disabled={action.is_disabled}
              onClick={() => handleClick(action)}
              className="text-xs text-muted-foreground"
            >
              {Icon && <Icon className="mr-1 h-3.5 w-3.5" />}
              <span className="hidden xl:inline">{action.label}</span>
            </Button>
          );
        })}

        {/* Overflow menu */}
        {overflow.length > 0 && (
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowOverflow(!showOverflow)}
              className="h-8 w-8"
              aria-label="More actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
            {showOverflow && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowOverflow(false)}
                />
                <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-md border bg-popover py-1 shadow-lg">
                  {overflow.map((action) => (
                    <button
                      key={action.action_code}
                      type="button"
                      disabled={action.is_disabled}
                      onClick={() => {
                        setShowOverflow(false);
                        handleClick(action);
                      }}
                      className={cn(
                        "w-full px-4 py-2 text-left text-sm transition-colors",
                        action.is_destructive
                          ? "font-medium text-destructive hover:bg-destructive/10"
                          : "text-popover-foreground hover:bg-accent/10",
                        action.is_disabled && "cursor-not-allowed opacity-50",
                      )}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Confirmation sheet */}
      <ConfirmSheet
        action={confirmAction}
        loading={loadingAction === confirmAction?.action_code}
        onConfirm={(remarks) => {
          if (confirmAction) {
            onAction(confirmAction.action_code);
            setConfirmAction(null);
          }
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </>
  );
}
