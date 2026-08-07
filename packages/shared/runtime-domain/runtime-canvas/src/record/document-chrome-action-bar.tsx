"use client";

import { useCallback, useState } from "react";
import {
  AlertCircle,
  Check,
  Loader2,
  RotateCcw,
  Save,
} from "lucide-react";
import { cn } from "@athyper/platform-theme/utils";
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@athyper/platform-ui/primitives";
import { DialogConfirmShell } from "@athyper/platform-ui/surfaces/shells";
import { useEditDraftContext } from "@athyper/content-ui";
import {
  headerPrimaryActionClass,
  headerSecondaryActionClass,
} from "../header/header-chrome";
import { useOptionalDocumentEditCoordinator } from "../document-runtime/document-edit-coordinator";
import { markDocumentEditPerformance } from "../document-runtime/document-edit-performance-marks";

/**
 * Document-runtime chrome action bar.
 *
 * Lives in the identity bar's `actionLeadingSlot`. Composes three signals
 * the screenshots-driven redesign keeps in one strip:
 *
 *   [ View | Edit pill ]   [ ✓ Saved | ● Unsaved | Saving… | error ]   [ Discard ] [ Save ]
 *
 * The pill is the single source of truth for mode. The save-status text is
 * ambient (no button) when there's nothing to act on; Discard / Save light
 * up only when dirty. Committed-state baseline reversal is rendered as a
 * separate, explicitly named business action.
 *
 * Reads `useEditDraftContext()` directly — must be rendered inside the
 * `EditDraftProvider` mounted by `DocumentObjectPageWorkspace`. In view
 * mode the context is still mounted but `isEditing` is false; we render
 * the pill only and skip the status + Discard + Save cluster.
 */

export type DocumentChromeMode = "view" | "edit";

export interface DocumentChromeActionBarProps {
  mode: DocumentChromeMode;
  /** URL the View side of the pill navigates to. */
  viewHref: string;
  /** URL the Edit side of the pill navigates to. */
  editHref: string;
  /**
   * When false, the pill is hidden entirely (no View|Edit toggle). Matches
   * the existing chrome behavior where the `__edit` action is omitted for
   * non-editable records.
   */
  canEdit: boolean;
  /**
   * Tooltip surfaced on the Edit side when the record is editable in
   * principle but blocked by lifecycle (e.g. terminal state). Shown only
   * in view mode; in edit mode the user is already past this gate.
   */
  editDisabledReason?: string;
  /**
   * Explicit domain operation for reversing committed state. It is never
   * invoked by the ordinary recovery-draft Discard button.
   */
  onRevertToBaseline?: (workspaceId: string, sourceTabId: string) => Promise<
    | { ok: true }
    | { ok: false; code?: string; message?: string }
  >;
  /**
   * Called after a successful baseline reversal. Typically wired to
   * `router.refresh()` so the post-revert record renders fresh data.
   */
  onRefreshRecord?: () => Promise<void> | void;
  onDeleteDraft?: () => Promise<{ ok: true } | { ok: false; message?: string }>;
  className?: string;
}

export function DocumentChromeActionBar({
  mode,
  viewHref,
  editHref,
  canEdit,
  editDisabledReason,
  onRevertToBaseline,
  onRefreshRecord,
  onDeleteDraft,
  className,
}: DocumentChromeActionBarProps) {
  const session = useEditDraftContext();
  const coordinator = useOptionalDocumentEditCoordinator();

  const isDirty   = Boolean(session?.isDirty);
  const isSaving  = session?.saveStatus === "saving";
  const isEditing = Boolean(session?.isEditing);
  const saveStatus = session?.saveStatus ?? "idle";
  const saveError  = session?.saveError ?? null;

  // Draft discard and committed-state reversal remain separate commands.
  const [confirmKind, setConfirmKind] = useState<"discard-draft" | "discard-navigate" | "revert-baseline" | "delete-provisional" | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [discarding,   setDiscarding]   = useState(false);

  // ── Navigation helpers ──────────────────────────────────────────────────
  const navigate = useCallback((href: string) => {
    if (typeof window === "undefined") return;
    window.location.assign(href);
  }, []);

  const handleViewClick = useCallback(() => {
    if (mode === "view") return;
    // Dirty in edit mode: confirm before throwing away unsaved changes.
    if (isDirty && !isSaving) {
      setConfirmError(null);
      setConfirmKind("discard-navigate");
      return;
    }
    navigate(viewHref);
  }, [mode, isDirty, isSaving, navigate, viewHref]);

  const handleEditClick = useCallback(() => {
    if (mode === "edit") return;
    if (!canEdit || editDisabledReason) return;
    markDocumentEditPerformance("edit-rsc-navigation-started");
    navigate(editHref);
  }, [mode, canEdit, editDisabledReason, navigate, editHref]);

  // ── Discard / Save handlers ─────────────────────────────────────────────
  const handleDiscardClick = useCallback(() => {
    if (!session) return;
    setConfirmError(null);
    setConfirmKind("discard-draft");
  }, [session]);

  const handleRevertToBaseline = useCallback(() => {
    if (!session || !onRevertToBaseline) return;
    setConfirmError(null);
    setConfirmKind("revert-baseline");
  }, [onRevertToBaseline, session]);

  const handleSaveClick = useCallback(() => {
    if (!session || !isDirty || isSaving) return;
    void session.save();
  }, [session, isDirty, isSaving]);

  const runConfirm = useCallback(async () => {
    if (!session || !confirmKind) return;

    if (confirmKind === "discard-navigate" || confirmKind === "discard-draft") {
      setDiscarding(true);
      setConfirmError(null);
      try {
        // Clear recovery state without changing the committed business record.
        await coordinator?.discardDraft();
        session.discard();
        setConfirmKind(null);
        if (confirmKind === "discard-navigate") navigate(viewHref);
      } catch (err) {
        setConfirmError(err instanceof Error ? err.message : String(err));
      } finally {
        setDiscarding(false);
      }
      return;
    }
    if (confirmKind === "delete-provisional") {
      if (!onDeleteDraft) return;
      setDiscarding(true);
      setConfirmError(null);
      try {
        const result = await onDeleteDraft();
        if (!result.ok) {
          setConfirmError(result.message ?? "Draft deletion failed.");
          return;
        }
        session.discard();
        await coordinator?.discardDraft().catch(() => undefined);
        setConfirmKind(null);
      } catch (err) {
        setConfirmError(err instanceof Error ? err.message : String(err));
      } finally {
        setDiscarding(false);
      }
      return;
    }
    if (!coordinator || !onRevertToBaseline) {
      setConfirmError("Baseline reversal is unavailable.");
      return;
    }
    setDiscarding(true);
    setConfirmError(null);
    try {
      const result = await coordinator.runWithWorkspace((workspaceId) =>
        onRevertToBaseline(workspaceId, coordinator.sourceTabId));
      if (!result.ok) {
        if (result.code === "NO_BASELINE_SNAPSHOT") {
          setConfirmError(result.message ?? "No submitted baseline exists for this document.");
          return;
        }
        setConfirmError(result.message ?? "Baseline reversal failed. Try again or contact support.");
        return;
      }
      session.discard();
      await coordinator.discardDraft();
      setConfirmKind(null);
      await onRefreshRecord?.();
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : String(err));
    } finally {
      setDiscarding(false);
    }
  }, [session, confirmKind, coordinator, onDeleteDraft, onRevertToBaseline, onRefreshRecord, navigate, viewHref]);

  // Hide the pill entirely when the record isn't editable AND we're not
  // already in edit mode (defensive — entering edit on a non-editable
  // record shouldn't happen but the View side still needs to be reachable).
  const showPill = canEdit || mode === "edit";

  // Draft discard is useful only while there are uncommitted local changes.
  const canDiscard = isEditing && !isSaving && isDirty;

  return (
    <div className={cn("flex min-w-0 items-center justify-end gap-1.5", className)}>
      {showPill && (
        <ModeButton
          mode={mode}
          canEdit={canEdit}
          editDisabledReason={mode === "view" ? editDisabledReason : undefined}
          onView={handleViewClick}
          onEdit={handleEditClick}
        />
      )}

      {isEditing && (
        <>
          <SaveStatusText
            status={saveStatus}
            isDirty={isDirty}
            errorMessage={saveError}
          />

          <button
            type="button"
            onClick={handleDiscardClick}
            disabled={!canDiscard}
            className={cn(
              headerSecondaryActionClass,
              "hidden gap-1.5 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-40 sm:inline-flex",
            )}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Discard
          </button>

          <button
            type="button"
            onClick={handleSaveClick}
            disabled={!isDirty || isSaving}
            className={cn(
              headerPrimaryActionClass,
              "whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-40",
            )}
          >
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {isSaving ? "Saving" : "Save"}
          </button>

          {onRevertToBaseline ? (
            <button
              type="button"
              onClick={handleRevertToBaseline}
              disabled={isSaving}
              className={cn(headerSecondaryActionClass, "hidden whitespace-nowrap lg:inline-flex")}
            >
              Revert to baseline
            </button>
          ) : null}

          {onDeleteDraft ? (
            <button
              type="button"
              onClick={() => {
                setConfirmError(null);
                setConfirmKind("delete-provisional");
              }}
              disabled={isSaving}
              className={cn(headerSecondaryActionClass, "hidden whitespace-nowrap lg:inline-flex")}
            >
              Delete draft
            </button>
          ) : null}
        </>
      )}

      <DialogConfirmShell
        open={confirmKind !== null}
        onOpenChange={(open) => { if (!open && !discarding) setConfirmKind(null); }}
        intent="destructive"
        title={confirmKind === "revert-baseline"
          ? "Revert committed changes?"
          : confirmKind === "delete-provisional"
            ? "Delete this provisional draft?"
            : "Discard unsaved changes?"}
        consequence={
          confirmError
            ? `${confirmError} — try again or cancel.`
            : confirmKind === "revert-baseline"
              ? "Committed header, line, pricing-component, and accounting-distribution changes since the last submitted baseline will be reversed. Allowed only in draft, rejected, or proforma status."
              : confirmKind === "delete-provisional"
                ? "The provisional document and its draft data will be permanently removed."
              : "All unsaved changes will be lost."
        }
        cancel={
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmKind(null)}
            disabled={discarding}
          >
            Cancel
          </Button>
        }
        confirm={
          <Button
            type="button"
            variant="destructive"
            onClick={() => { void runConfirm(); }}
            disabled={discarding}
          >
            {discarding
              ? (confirmKind === "revert-baseline" ? "Reverting…" : confirmKind === "delete-provisional" ? "Deleting…" : "Discarding…")
              : (confirmKind === "revert-baseline" ? "Revert to baseline" : confirmKind === "delete-provisional" ? "Delete draft" : "Discard")}
          </Button>
        }
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ModeButton — single contextual button.
//   view mode → "Edit"  (enter edit)
//   edit mode → "View"  (exit edit, with dirty-state confirm if needed)
// Text-only; sized to match the rest of the chrome buttons via
// headerSecondaryActionClass.
// ─────────────────────────────────────────────────────────────────────────────

function ModeButton({
  mode,
  canEdit,
  editDisabledReason,
  onView,
  onEdit,
}: {
  mode: DocumentChromeMode;
  canEdit: boolean;
  editDisabledReason?: string;
  onView: () => void;
  onEdit: () => void;
}) {
  if (mode === "edit") {
    return (
      <button
        type="button"
        onClick={onView}
        className={cn(headerSecondaryActionClass, "whitespace-nowrap")}
      >
        View
      </button>
    );
  }

  const editDisabled = !canEdit || Boolean(editDisabledReason);
  const editButton = (
    <button
      type="button"
      onClick={onEdit}
      disabled={editDisabled}
      className={cn(
        headerSecondaryActionClass,
        "whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-40",
      )}
    >
      Edit
    </button>
  );

  if (editDisabled && editDisabledReason) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="inline-flex cursor-not-allowed">
              {editButton}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {editDisabledReason}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return editButton;
}

// ─────────────────────────────────────────────────────────────────────────────
// SaveStatusText — ambient inline indicator. Never a button.
// ─────────────────────────────────────────────────────────────────────────────

function SaveStatusText({
  status,
  isDirty,
  errorMessage,
}: {
  status: "idle" | "saving" | "saved" | "saveFailed" | "conflict";
  isDirty: boolean;
  errorMessage: string | null;
}) {
  if (status === "saving") {
    return (
      <span className="hidden items-center gap-1 text-xs font-medium text-muted-foreground lg:inline-flex">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Saving…
      </span>
    );
  }
  if (status === "saveFailed") {
    return (
      <span
        role="alert"
        className="hidden items-center gap-1 truncate text-xs font-medium text-destructive lg:inline-flex"
        title={errorMessage ?? undefined}
      >
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        Save failed
      </span>
    );
  }
  if (status === "conflict") {
    return (
      <span
        role="alert"
        className="hidden items-center gap-1 text-xs font-medium text-warning lg:inline-flex"
      >
        <AlertCircle className="h-3.5 w-3.5" />
        Conflict — reload
      </span>
    );
  }
  if (isDirty) {
    return (
      <span className="hidden items-center gap-1 text-xs font-medium text-muted-foreground lg:inline-flex">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary" />
        Unsaved
      </span>
    );
  }
  // idle / saved → ambient reassurance
  return (
    <span className="hidden items-center gap-1 text-xs font-medium text-success lg:inline-flex">
      <Check className="h-3.5 w-3.5" />
      Saved
    </span>
  );
}
