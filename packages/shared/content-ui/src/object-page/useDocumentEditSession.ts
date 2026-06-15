"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DocumentAutosaveConfig,
  DocumentEditContext,
  EditSessionPatchBody,
  EditSessionPatchResponse,
  FieldMask,
  FieldMaskEntry,
  SectionMask,
} from "@athyper/api-contracts/edit-session";

/**
 * Coarse-grained state for the save chip and action-bar buttons.
 *
 * Distinct from React Query / network state — this drives UX affordances:
 * the header chip text, whether Save is enabled, whether a conflict prompt
 * appears, etc.
 */
export type DocumentSaveStatus =
  | "idle"
  | "saving"
  | "saved"
  | "saveFailed"
  | "conflict";

export interface DocumentEditSessionLoadCallback {
  (): Promise<DocumentEditContext>;
}

export interface DocumentEditSessionSaveResult {
  type: "ok";
  response: EditSessionPatchResponse;
}

export interface DocumentEditSessionConflictResult {
  type: "conflict";
  currentEtag?: string;
  message?: string;
}

export interface DocumentEditSessionValidationResult {
  type: "validation";
  message?: string;
  fieldErrors: Record<string, string>;
}

export interface DocumentEditSessionNetworkErrorResult {
  type: "error";
  message: string;
}

export type DocumentEditSessionSaveOutcome =
  | DocumentEditSessionSaveResult
  | DocumentEditSessionConflictResult
  | DocumentEditSessionValidationResult
  | DocumentEditSessionNetworkErrorResult;

export interface DocumentEditSessionSaveCallback {
  (body: EditSessionPatchBody, etag: string): Promise<DocumentEditSessionSaveOutcome>;
}

export interface UseDocumentEditSessionOptions {
  /** Master switch. When false, the hook is a no-op (isEditing always false). */
  enabled?: boolean;
  /** Fetch the edit-context envelope from the server. Called on `enterEdit()`. */
  loadContext: DocumentEditSessionLoadCallback;
  /** Send a bundled PATCH. Called on `save()`. */
  saveChanges: DocumentEditSessionSaveCallback;
  /** Called after a successful save with the fresh response. */
  onSaveSuccess?: (response: EditSessionPatchResponse) => void;
  /**
   * Phase 10 #3: opt-in autosave. When `enabled: true`, each dirty-state
   * mutation schedules a debounced save() after `debounceMs` of quiet.
   * On failure with `pauseOnError: true`, autosave halts until the next
   * manual save() clears the pause. Read per-entity from
   * `entity.display_config.autosave` via `readAutosaveConfig`.
   */
  autosave?: DocumentAutosaveConfig;
}

export interface UseDocumentEditSessionReturn {
  // ── Mode ──
  isEditing: boolean;
  isLoadingContext: boolean;
  contextError: string | null;

  // ── Server-truthed state ──
  /** Opaque concurrency token; sent on save as If-Match. Null before context loads. */
  etag: string | null;
  status: string | null;
  canUpdate: boolean;
  disabledReason: string | null;
  fieldMask: FieldMask;
  sectionMask: SectionMask;

  // ── Dirty state — header ──
  /** Field-name → pending value for header fields the user has changed. */
  pendingHeaderPatch: Record<string, unknown>;
  /** Number of dirty header fields. */
  dirtyCount: number;

  // ── Dirty state — lines (Phase 6) ──
  /** New lines queued for insertion. No server-assigned IDs yet. */
  pendingLineCreates: Record<string, unknown>[];
  /** Line ID → merged field deltas to apply on save. */
  pendingLineUpdates: Record<string, Record<string, unknown>>;
  /** Line IDs queued for deletion. */
  pendingLineDeletes: string[];
  /** Number of pending line operations (creates + updates + deletes). */
  linesDirtyCount: number;
  /** True if any header OR line change is pending. */
  isDirty: boolean;

  // ── Validation state ──
  fieldErrors: Record<string, string>;

  // ── Save status ──
  saveStatus: DocumentSaveStatus;
  saveError: string | null;
  /** When `saveStatus === "conflict"`, server's current etag (if reported). */
  conflictEtag: string | null;

  // ── Actions — header ──
  enterEdit: () => Promise<boolean>;
  exitEdit: (options?: { discardDirty?: boolean }) => boolean;
  setHeaderField: (name: string, value: unknown) => void;
  resetHeaderField: (name: string) => void;
  discard: () => void;
  save: () => Promise<boolean>;
  /**
   * Re-fetch the edit context (etag, fieldMask, sectionMask, status) without
   * leaving edit mode or discarding pending edits. Used by the 409 conflict
   * dialog so the user can retry Save with the server's latest etag while
   * preserving their in-progress changes.
   */
  refreshContext: () => Promise<boolean>;
  /** Lookup helper: returns the mask entry for a field, or a default `editable: true`. */
  getFieldMask: (name: string) => FieldMaskEntry;

  // ── Autosave control (Phase 12 #2) ──
  /**
   * Pause the autosave loop without exiting edit mode. Clears any pending
   * timer. Used by SSE recovery to prevent autosave from firing while the
   * recovery dialog is open (which would race with the user's resolution
   * and double-pop the reactive conflict dialog).
   */
  pauseAutosave: () => void;
  /** Resume autosave after a `pauseAutosave()` call. No-op if not paused. */
  resumeAutosave: () => void;

  // ── Actions — lines (Phase 6) ──
  /** Queue a new line for insertion on save. Returns the temp index for later removal. */
  addLine: (data: Record<string, unknown>) => number;
  /** Remove a queued create by its index (returned from addLine). */
  removePendingCreate: (index: number) => void;
  /** Merge field deltas into a pending update for an existing line. */
  updateLine: (lineId: string, fieldDeltas: Record<string, unknown>) => void;
  /** Mark an existing line for deletion. Clears any pending update for it. */
  deleteLine: (lineId: string) => void;
  /** Undo any pending update or delete for a line. No-op for unknown line IDs. */
  resetLine: (lineId: string) => void;
}

const DEFAULT_MASK_ENTRY: FieldMaskEntry = { editable: true };

/**
 * Document-level Edit Mode session — server-truthed field mask, etag-based
 * optimistic concurrency, dirty tracking, transactional save.
 *
 * The hook is transport-agnostic: it accepts `loadContext` and `saveChanges`
 * callbacks so the same code works for neon, mesh, and admin with their
 * different relay paths. The locked Phase-4 design decisions (single
 * transactional endpoint, etag in `If-Match`, every save refreshes mask)
 * are encoded in the callback contracts, not the hook.
 *
 * Phase 4 scope: header fields. Lines bundle wiring (`pendingLines` +
 * `addLine` / `updateLine` / `deleteLine`) is forward-declared in the
 * `EditSessionPatchBody` contract and lands in Phase 6 alongside virtual
 * row editing.
 *
 * @example
 * const session = useDocumentEditSession({
 *   enabled: isObjectPage,
 *   loadContext: () => fetchEditContext(entityCode, recordId),
 *   saveChanges: (body, etag) => patchEditSession(entityCode, recordId, body, etag),
 *   onSaveSuccess: () => router.refresh(),
 * });
 *
 * <Button disabled={!session.canUpdate} onClick={session.enterEdit}>Edit</Button>
 * {session.isEditing && (
 *   <FieldRow>
 *     {session.getFieldMask("supplier_id").editable
 *       ? <FieldRow.Edit><SupplierPicker value={...} onChange={(v) => session.setHeaderField("supplier_id", v)} /></FieldRow.Edit>
 *       : <FieldRow.Read reason={session.getFieldMask("supplier_id").reason}>{...}</FieldRow.Read>}
 *   </FieldRow>
 * )}
 */
export function useDocumentEditSession(
  options: UseDocumentEditSessionOptions,
): UseDocumentEditSessionReturn {
  const { enabled = true, loadContext, saveChanges, onSaveSuccess, autosave } = options;

  const [isEditing, setIsEditing] = useState(false);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);

  const [etag, setEtag] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [canUpdate, setCanUpdate] = useState(false);
  const [disabledReason, setDisabledReason] = useState<string | null>(null);
  const [fieldMask, setFieldMask] = useState<FieldMask>({});
  const [sectionMask, setSectionMask] = useState<SectionMask>({});

  const [pendingHeaderPatch, setPendingHeaderPatch] = useState<Record<string, unknown>>({});
  const [pendingLineCreates, setPendingLineCreates] = useState<Record<string, unknown>[]>([]);
  const [pendingLineUpdates, setPendingLineUpdates] = useState<Record<string, Record<string, unknown>>>({});
  const [pendingLineDeletes, setPendingLineDeletes] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // The functional updater passed to setPendingLineCreates runs during commit,
  // not synchronously inside the action call. So computing `addLine`'s return
  // value (the create's position in the array) by reading inside the updater
  // misses the current frame. Track length in a ref to make the return reliable
  // for callers within the same React batch.
  const pendingCreatesLengthRef = useRef(0);

  // Phase 10 #3: autosave timer + pause state. Kept in refs because the
  // timer fires outside the React render cycle; reading from useState
  // closures would see stale values.
  const autosaveConfigRef = useRef<DocumentAutosaveConfig | undefined>(autosave);
  autosaveConfigRef.current = autosave;
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosavePausedRef = useRef(false);
  // Ref to the latest save() function. Populated below (forward-declared).
  const saveRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false));

  // Declared above the actions that call them so the React Hook order is
  // legal. The actions reference these by closure; the refs above carry the
  // mutable state the helpers consume.
  const scheduleAutosave = useCallback(() => {
    const cfg = autosaveConfigRef.current;
    if (!cfg?.enabled) return;
    if (autosavePausedRef.current) return;
    if (autosaveTimerRef.current !== null) {
      clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      void saveRef.current();
    }, cfg.debounceMs);
  }, []);

  const cancelAutosave = useCallback(() => {
    if (autosaveTimerRef.current !== null) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
  }, []);

  // Phase 12 #2: external pause/resume so SSE recovery can park autosave
  // while the user resolves a status-changed-during-edit dialog. Pause
  // clears any pending timer in addition to flipping the flag, so a save
  // already queued for the next tick still gets cancelled.
  const pauseAutosave = useCallback(() => {
    autosavePausedRef.current = true;
    if (autosaveTimerRef.current !== null) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
  }, []);

  const resumeAutosave = useCallback(() => {
    autosavePausedRef.current = false;
  }, []);

  const [saveStatus, setSaveStatus] = useState<DocumentSaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflictEtag, setConflictEtag] = useState<string | null>(null);

  // Keep latest callbacks in a ref so the action callbacks below stay stable
  // and don't tear down React Query effects on consumer re-renders.
  const callbacksRef = useRef({ loadContext, saveChanges, onSaveSuccess });
  callbacksRef.current = { loadContext, saveChanges, onSaveSuccess };

  const dirtyCount = useMemo(
    () => Object.keys(pendingHeaderPatch).length,
    [pendingHeaderPatch],
  );
  const linesDirtyCount = useMemo(
    () => pendingLineCreates.length + Object.keys(pendingLineUpdates).length + pendingLineDeletes.length,
    [pendingLineCreates, pendingLineUpdates, pendingLineDeletes],
  );
  const isDirty = dirtyCount > 0 || linesDirtyCount > 0;

  const resetMaskState = useCallback(() => {
    setEtag(null);
    setStatus(null);
    setCanUpdate(false);
    setDisabledReason(null);
    setFieldMask({});
    setSectionMask({});
  }, []);

  const resetDirtyState = useCallback(() => {
    setPendingHeaderPatch({});
    setPendingLineCreates([]);
    setPendingLineUpdates({});
    setPendingLineDeletes([]);
    pendingCreatesLengthRef.current = 0;
    setFieldErrors({});
    setSaveStatus("idle");
    setSaveError(null);
    setConflictEtag(null);
  }, []);

  const enterEdit = useCallback(async (): Promise<boolean> => {
    if (!enabled) return false;
    if (isEditing) return true;

    setIsLoadingContext(true);
    setContextError(null);
    try {
      const ctx = await callbacksRef.current.loadContext();
      setEtag(ctx.etag);
      setStatus(ctx.status);
      setCanUpdate(ctx.canUpdate);
      setDisabledReason(ctx.disabledReason ?? null);
      setFieldMask(ctx.fieldMask);
      setSectionMask(ctx.sectionMask);

      if (!ctx.canUpdate) {
        setContextError(ctx.disabledReason ?? "Edit is not available for this record.");
        return false;
      }
      resetDirtyState();
      setIsEditing(true);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load edit context.";
      setContextError(message);
      return false;
    } finally {
      setIsLoadingContext(false);
    }
  }, [enabled, isEditing, resetDirtyState]);

  const refreshContext = useCallback(async (): Promise<boolean> => {
    if (!enabled || !isEditing) return false;
    setIsLoadingContext(true);
    setContextError(null);
    try {
      const ctx = await callbacksRef.current.loadContext();
      setEtag(ctx.etag);
      setStatus(ctx.status);
      setCanUpdate(ctx.canUpdate);
      setDisabledReason(ctx.disabledReason ?? null);
      setFieldMask(ctx.fieldMask);
      setSectionMask(ctx.sectionMask);
      setSaveStatus("idle");
      setSaveError(null);
      setConflictEtag(null);
      autosavePausedRef.current = false;
      return ctx.canUpdate;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to refresh edit context.";
      setContextError(message);
      return false;
    } finally {
      setIsLoadingContext(false);
    }
  }, [enabled, isEditing]);

  const exitEdit = useCallback(
    (opts?: { discardDirty?: boolean }): boolean => {
      if (!isEditing) return true;
      const discardDirty = opts?.discardDirty ?? false;
      if (isDirty && !discardDirty) return false; // caller should prompt
      cancelAutosave();
      autosavePausedRef.current = false;
      setIsEditing(false);
      resetDirtyState();
      resetMaskState();
      return true;
    },
    [isEditing, isDirty, cancelAutosave, resetDirtyState, resetMaskState],
  );

  const setHeaderField = useCallback(
    (name: string, value: unknown) => {
      setPendingHeaderPatch((prev) => {
        // Touching a previously-clean field — set it.
        // Touching a dirty field with a NEW value — update.
        // Setting a field back to baseline value would ideally clear it, but
        // we don't track baselines client-side. Use `resetHeaderField` for that.
        if (prev[name] === value) return prev;
        return { ...prev, [name]: value };
      });
      setFieldErrors((prev) => {
        if (!(name in prev)) return prev;
        const next = { ...prev };
        delete next[name];
        return next;
      });
      // Any edit clears prior save status.
      if (saveStatus !== "idle" && saveStatus !== "saving") {
        setSaveStatus("idle");
        setSaveError(null);
      }
      // Schedule autosave unconditionally. The functional updater above runs
      // during React commit, NOT synchronously, so a closure-captured
      // `mutated` flag would read stale. The save() it eventually triggers
      // bails when !isDirty, so a no-op set still results in a no-op save.
      scheduleAutosave();
    },
    [saveStatus, scheduleAutosave],
  );

  const resetHeaderField = useCallback((name: string) => {
    setPendingHeaderPatch((prev) => {
      if (!(name in prev)) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
    setFieldErrors((prev) => {
      if (!(name in prev)) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  const discard = useCallback(() => {
    resetDirtyState();
  }, [resetDirtyState]);

  // ── Line bundle actions (Phase 6) ────────────────────────────────────────
  // Edits are queued in client state and committed atomically with header
  // changes when `save()` is called. The server's /edit-session endpoint
  // executes the bundle inside a single DB transaction.

  const clearSaveStatusOnEdit = useCallback(() => {
    if (saveStatus !== "idle" && saveStatus !== "saving") {
      setSaveStatus("idle");
      setSaveError(null);
    }
  }, [saveStatus]);

  const addLine = useCallback(
    (data: Record<string, unknown>): number => {
      const index = pendingCreatesLengthRef.current;
      pendingCreatesLengthRef.current = index + 1;
      setPendingLineCreates((prev) => [...prev, data]);
      clearSaveStatusOnEdit();
      scheduleAutosave();
      return index;
    },
    [clearSaveStatusOnEdit, scheduleAutosave],
  );

  const removePendingCreate = useCallback(
    (index: number) => {
      setPendingLineCreates((prev) => {
        if (index < 0 || index >= prev.length) return prev;
        pendingCreatesLengthRef.current = prev.length - 1;
        return prev.slice(0, index).concat(prev.slice(index + 1));
      });
      clearSaveStatusOnEdit();
      scheduleAutosave();
    },
    [clearSaveStatusOnEdit, scheduleAutosave],
  );

  const updateLine = useCallback(
    (lineId: string, fieldDeltas: Record<string, unknown>) => {
      setPendingLineUpdates((prev) => {
        const existing = prev[lineId] ?? {};
        // Identity check — skip update if nothing actually changes.
        let changed = false;
        for (const [k, v] of Object.entries(fieldDeltas)) {
          if (existing[k] !== v) { changed = true; break; }
        }
        if (!changed) return prev;
        return { ...prev, [lineId]: { ...existing, ...fieldDeltas } };
      });
      // Updating a line removes any pending delete (you can't update and delete).
      setPendingLineDeletes((prev) => (prev.includes(lineId) ? prev.filter((id) => id !== lineId) : prev));
      // Clear per-line validation errors keyed by line:<id>:<field>
      setFieldErrors((prev) => {
        let next: Record<string, string> | null = null;
        for (const k of Object.keys(prev)) {
          if (k.startsWith(`line:${lineId}:`)) {
            if (!next) next = { ...prev };
            delete next[k];
          }
        }
        return next ?? prev;
      });
      clearSaveStatusOnEdit();
      scheduleAutosave();
    },
    [clearSaveStatusOnEdit, scheduleAutosave],
  );

  const deleteLine = useCallback(
    (lineId: string) => {
      setPendingLineDeletes((prev) => (prev.includes(lineId) ? prev : [...prev, lineId]));
      // Deleting wipes any pending update for the same line.
      setPendingLineUpdates((prev) => {
        if (!(lineId in prev)) return prev;
        const next = { ...prev };
        delete next[lineId];
        return next;
      });
      clearSaveStatusOnEdit();
      scheduleAutosave();
    },
    [clearSaveStatusOnEdit, scheduleAutosave],
  );

  const resetLine = useCallback((lineId: string) => {
    setPendingLineUpdates((prev) => {
      if (!(lineId in prev)) return prev;
      const next = { ...prev };
      delete next[lineId];
      return next;
    });
    setPendingLineDeletes((prev) => (prev.includes(lineId) ? prev.filter((id) => id !== lineId) : prev));
    scheduleAutosave();
  }, [scheduleAutosave]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!isEditing || !etag) return false;
    // Manual save (or autosave when not paused) entering this function — clear
    // any prior autosave pause so the next successful save resumes the loop.
    autosavePausedRef.current = false;
    // Cancel any pending autosave timer — we're saving right now.
    cancelAutosave();
    if (!isDirty) {
      // Nothing to send — treat as a successful no-op.
      setSaveStatus("saved");
      return true;
    }

    setSaveStatus("saving");
    setSaveError(null);
    setConflictEtag(null);

    // Build the bundled body. Empty bundle parts are omitted so the server
    // can short-circuit per-resource validation paths cleanly.
    const headerPart = Object.keys(pendingHeaderPatch).length > 0
      ? pendingHeaderPatch
      : undefined;
    const linesPart = linesDirtyCount > 0
      ? {
          ...(pendingLineCreates.length > 0 ? { create: pendingLineCreates } : {}),
          ...(Object.keys(pendingLineUpdates).length > 0
            ? { update: Object.entries(pendingLineUpdates).map(([id, data]) => ({ id, data })) }
            : {}),
          ...(pendingLineDeletes.length > 0 ? { delete: pendingLineDeletes } : {}),
        }
      : undefined;

    try {
      const outcome = await callbacksRef.current.saveChanges(
        {
          ...(headerPart ? { header: headerPart } : {}),
          ...(linesPart ? { lines: linesPart } : {}),
        },
        etag,
      );

      if (outcome.type === "ok") {
        const { response } = outcome;
        setEtag(response.etag);
        setStatus(response.status);
        setFieldMask(response.fieldMask);
        setSectionMask(response.sectionMask);
        setPendingHeaderPatch({});
        setPendingLineCreates([]);
        setPendingLineUpdates({});
        setPendingLineDeletes([]);
        pendingCreatesLengthRef.current = 0;
        setFieldErrors({});
        setSaveStatus("saved");
        callbacksRef.current.onSaveSuccess?.(response);
        return true;
      }

      // Phase 10 #3: on any non-ok outcome, pause autosave when
      // `pauseOnError: true` so we don't loop-spam the server. The next
      // manual save() call clears the pause (see save() entry above).
      const pauseOnError = autosaveConfigRef.current?.pauseOnError ?? true;

      if (outcome.type === "conflict") {
        // First-conflict auto-recovery: if the server reported the current
        // etag, retry the save once with it transparently. This collapses the
        // common "stale local state but no real conflicting edits" case
        // (HMR-preserved hook state, page open across a re-seed, race with
        // a fire-and-forget side-effect) into a single successful save.
        // Only fall through to the dialog when the retry itself conflicts —
        // that means another user genuinely modified the doc between our
        // refresh and our retry.
        const retryEtag = outcome.currentEtag;
        if (retryEtag && retryEtag !== etag) {
          setEtag(retryEtag);
          const retry = await callbacksRef.current.saveChanges(
            {
              ...(headerPart ? { header: headerPart } : {}),
              ...(linesPart ? { lines: linesPart } : {}),
            },
            retryEtag,
          );
          if (retry.type === "ok") {
            const { response } = retry;
            setEtag(response.etag);
            setStatus(response.status);
            setFieldMask(response.fieldMask);
            setSectionMask(response.sectionMask);
            setPendingHeaderPatch({});
            setPendingLineCreates([]);
            setPendingLineUpdates({});
            setPendingLineDeletes([]);
            pendingCreatesLengthRef.current = 0;
            setFieldErrors({});
            setSaveStatus("saved");
            callbacksRef.current.onSaveSuccess?.(response);
            return true;
          }
          if (retry.type === "validation") {
            setSaveStatus("saveFailed");
            setSaveError(retry.message ?? "Validation failed.");
            setFieldErrors(retry.fieldErrors);
            if (pauseOnError) autosavePausedRef.current = true;
            return false;
          }
          if (retry.type === "error") {
            setSaveStatus("saveFailed");
            setSaveError(retry.message);
            if (pauseOnError) autosavePausedRef.current = true;
            return false;
          }
          // retry.type === "conflict" — fall through to the dialog
        }
        setSaveStatus("conflict");
        setSaveError(outcome.message ?? "Document changed on the server.");
        setConflictEtag(outcome.currentEtag ?? null);
        if (pauseOnError) autosavePausedRef.current = true;
        return false;
      }

      if (outcome.type === "validation") {
        setSaveStatus("saveFailed");
        setSaveError(outcome.message ?? "Validation failed.");
        setFieldErrors(outcome.fieldErrors);
        if (pauseOnError) autosavePausedRef.current = true;
        return false;
      }

      setSaveStatus("saveFailed");
      setSaveError(outcome.message);
      if (pauseOnError) autosavePausedRef.current = true;
      return false;
    } catch (err) {
      setSaveStatus("saveFailed");
      setSaveError(err instanceof Error ? err.message : "Save failed.");
      if (autosaveConfigRef.current?.pauseOnError ?? true) autosavePausedRef.current = true;
      return false;
    }
  }, [
    isEditing, etag, isDirty, cancelAutosave,
    pendingHeaderPatch,
    linesDirtyCount, pendingLineCreates, pendingLineUpdates, pendingLineDeletes,
  ]);

  // Keep saveRef pointing at the latest save() so scheduled autosave timers
  // call the up-to-date implementation (with current state captured).
  saveRef.current = save;

  // Cleanup any pending autosave timer when the hook unmounts.
  useEffect(() => () => {
    if (autosaveTimerRef.current !== null) clearTimeout(autosaveTimerRef.current);
  }, []);

  const getFieldMask = useCallback(
    (name: string): FieldMaskEntry => fieldMask[name] ?? DEFAULT_MASK_ENTRY,
    [fieldMask],
  );

  return {
    isEditing,
    isLoadingContext,
    contextError,
    etag,
    status,
    canUpdate,
    disabledReason,
    fieldMask,
    sectionMask,
    pendingHeaderPatch,
    dirtyCount,
    pendingLineCreates,
    pendingLineUpdates,
    pendingLineDeletes,
    linesDirtyCount,
    isDirty,
    fieldErrors,
    saveStatus,
    saveError,
    conflictEtag,
    enterEdit,
    exitEdit,
    setHeaderField,
    resetHeaderField,
    discard,
    save,
    refreshContext,
    getFieldMask,
    pauseAutosave,
    resumeAutosave,
    addLine,
    removePendingCreate,
    updateLine,
    deleteLine,
    resetLine,
  };
}
