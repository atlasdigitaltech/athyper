/**
 * @athyper/entity-runtime — ActionBar
 *
 * Renders entity operations as buttons.
 * Operations come from control.entity_operation via useEntityOperations().
 *
 * Primary actions   → prominent buttons
 * Toolbar actions   → secondary buttons
 * Overflow actions  → hidden in "more" dropdown
 *
 * Handler types:
 *   NAVIGATE → router.push (resolved URL)
 *   API      → POST /api/relay/api/records/{entityCode}/{id}/action/{code}
 *   MODAL    → ConfirmSheet slide-over with optional remarks + confirm/cancel
 *   INLINE   → reserved (future inline-edit mode)
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, MoreHorizontal, Settings2, XCircle } from "lucide-react";
import {
  Button,
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
import { getActionIcon } from "@athyper/icons/actions";
import { cn } from "@athyper/theme/utils";
import {
  resolveActionsForSurface,
  getPrimaryActions,
  getToolbarActions,
  getOverflowActions,
  type ResolvedAction,
} from "@athyper/metadata-client/operation-reader";
import { queryKeys } from "@athyper/api-contracts/query-keys";
import { type EntityOperation } from "@athyper/api-contracts/metadata";

// ── Types ─────────────────────────────────────────────────────────────────────

type ActionFeedback = { status: "success" | "error"; message: string } | null;

// ── ConfirmSheet ──────────────────────────────────────────────────────────────

interface ConfirmSheetProps {
  action: ResolvedAction | null;
  loading: boolean;
  onConfirm: (remarks: string) => void;
  onCancel: () => void;
}

function ConfirmSheet({ action, loading, onConfirm, onCancel }: ConfirmSheetProps) {
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
            {action.description ?? `Confirm: ${action.label}`}
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
            loading={loading}
          >
            Confirm
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ── ActionBar ─────────────────────────────────────────────────────────────────

export interface ActionBarProps {
  operations: EntityOperation[];
  surface: "LIST" | "DETAIL";
  entityCode: string;
  recordId?: string;
  className?: string;
  showSecondaryActions?: boolean;
}

export function ActionBar({
  operations,
  surface,
  entityCode,
  recordId,
  className,
  showSecondaryActions = true,
}: ActionBarProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [modalAction, setModalAction] = useState<ResolvedAction | null>(null);
  const [apiLoading, setApiLoading] = useState(false);
  const [feedback, setFeedback] = useState<ActionFeedback>(null);

  const actions = resolveActionsForSurface(operations, surface);
  const primary = getPrimaryActions(actions);
  const toolbar = getToolbarActions(actions);
  const overflow = getOverflowActions(actions);

  async function callApi(action: ResolvedAction, remarks?: string) {
    if (!recordId) return;
    setApiLoading(true);
    setFeedback(null);
    try {
      const code = action.permissionCode.split(".").pop() ?? action.permissionCode;
      const res = await fetch(`/api/relay/api/records/${entityCode}/${recordId}/action/${code}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remarks }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? res.statusText);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.entityList.byType(entityCode) });
      queryClient.invalidateQueries({ queryKey: queryKeys.entityDetail.byId(entityCode, recordId) });
      setFeedback({ status: "success", message: `${action.label} completed` });
    } catch (err) {
      setFeedback({
        status: "error",
        message: err instanceof Error ? err.message : "Action failed",
      });
    } finally {
      setApiLoading(false);
    }
  }

  function handleAction(action: ResolvedAction) {
    setFeedback(null);
    switch (action.handlerType) {
      case "NAVIGATE":
        if (action.handlerTarget) {
          router.push(
            action.handlerTarget
              .replace("{entityCode}", entityCode)
              .replace("{id}", recordId ?? ""),
          );
        } else if (action.permissionCode.endsWith(".create")) {
          router.push(`/master/${entityCode}/new`);
        } else if (action.permissionCode.endsWith(".edit") && recordId) {
          router.push(`/master/${entityCode}/${recordId}/edit`);
        }
        break;
      case "API":
        void callApi(action);
        break;
      case "MODAL":
        setModalAction(action);
        break;
      case "INLINE":
        // Reserved — no-op for now
        break;
    }
  }

  if (actions.length === 0) return null;

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
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <XCircle className="h-3.5 w-3.5" />
            )}
            {feedback.message}
          </span>
        )}

        {primary.map((action) => {
          const Icon = getActionIcon(action.icon ?? action.permissionCode.split(".").pop() ?? "create");
          return (
            <Button
              key={action.permissionCode}
              variant="primary"
              size="sm"
              onClick={() => handleAction(action)}
              disabled={apiLoading}
            >
              {apiLoading && action.handlerType === "API" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Icon size={14} />
              )}
              {action.label}
            </Button>
          );
        })}

        {showSecondaryActions && toolbar.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label="More options"
                disabled={apiLoading}
              >
                <Settings2 size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {toolbar.map((action) => {
                const Icon = getActionIcon(action.icon ?? action.permissionCode.split(".").pop() ?? "edit");
                return (
                  <DropdownMenuItem
                    key={action.permissionCode}
                    disabled={apiLoading}
                    onClick={() => handleAction(action)}
                    className="gap-2.5"
                  >
                    <Icon size={14} className="shrink-0 text-muted-foreground" />
                    {action.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {showSecondaryActions && overflow.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More actions">
                <MoreHorizontal size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {overflow.map((action) => (
                <DropdownMenuItem
                  key={action.permissionCode}
                  disabled={apiLoading}
                  onClick={() => handleAction(action)}
                >
                  {action.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* MODAL confirm sheet */}
      <ConfirmSheet
        action={modalAction}
        loading={apiLoading}
        onConfirm={(remarks) => {
          if (modalAction) {
            void callApi(modalAction, remarks);
            setModalAction(null);
          }
        }}
        onCancel={() => setModalAction(null)}
      />
    </>
  );
}
