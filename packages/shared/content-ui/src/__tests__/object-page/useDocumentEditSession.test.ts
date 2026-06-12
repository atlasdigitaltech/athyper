import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "../utils/renderHook";
import { useDocumentEditSession } from "../../object-page/useDocumentEditSession";
import type {
  DocumentEditContext,
  EditSessionPatchBody,
  EditSessionPatchResponse,
} from "@athyper/api-contracts/edit-session";
import type {
  DocumentEditSessionSaveOutcome,
} from "../../object-page/useDocumentEditSession";
import type { DocumentAutosaveConfig } from "@athyper/api-contracts/edit-session";

function makeContext(overrides: Partial<DocumentEditContext> = {}): DocumentEditContext {
  return {
    recordId:       "rec-1",
    entityCode:     "purchase_order",
    status:         "draft",
    etag:           "12",
    canUpdate:      true,
    fieldMask:      {
      supplier_id: { editable: true },
      description: { editable: true },
    },
    sectionMask:    { __overview: { hasEditableFields: true, editableFieldCount: 2 } },
    ...overrides,
  };
}

function makeOkResponse(overrides: Partial<EditSessionPatchResponse> = {}): EditSessionPatchResponse {
  return {
    record: { id: "rec-1", data: {}, status: "draft" },
    etag:   "13",
    status: "draft",
    fieldMask: { supplier_id: { editable: true } },
    sectionMask: { __overview: { hasEditableFields: true, editableFieldCount: 1 } },
    ...overrides,
  };
}

type SaveFn = (body: EditSessionPatchBody, etag: string) => Promise<DocumentEditSessionSaveOutcome>;
type OnSaveSuccessFn = (response: EditSessionPatchResponse) => void;

function setup(overrides?: {
  context?: DocumentEditContext;
  loadContextImpl?: () => Promise<DocumentEditContext>;
  saveImpl?: SaveFn;
  onSaveSuccess?: OnSaveSuccessFn;
  autosave?: DocumentAutosaveConfig;
}) {
  const loadContext = overrides?.loadContextImpl
    ?? vi.fn(async () => overrides?.context ?? makeContext());
  const saveChanges: SaveFn = overrides?.saveImpl
    ?? vi.fn(async () => ({ type: "ok" as const, response: makeOkResponse() }));
  const onSaveSuccess = overrides?.onSaveSuccess;
  const autosave = overrides?.autosave;
  const hook = renderHook(() => useDocumentEditSession({
    enabled:       true,
    loadContext,
    saveChanges,
    onSaveSuccess,
    autosave,
  }));
  return { hook, loadContext, saveChanges };
}

describe("useDocumentEditSession", () => {
  describe("enterEdit / exitEdit lifecycle", () => {
    it("enterEdit() populates etag, mask, status and flips isEditing", async () => {
      const { hook } = setup();
      await act(async () => { await hook.result.current.enterEdit(); });
      expect(hook.result.current.isEditing).toBe(true);
      expect(hook.result.current.etag).toBe("12");
      expect(hook.result.current.status).toBe("draft");
      expect(hook.result.current.canUpdate).toBe(true);
      expect(Object.keys(hook.result.current.fieldMask).length).toBe(2);
    });

    it("enterEdit() failure sets contextError and stays out of edit mode", async () => {
      const { hook } = setup({
        loadContextImpl: async () => { throw new Error("Network down"); },
      });
      await act(async () => { await hook.result.current.enterEdit(); });
      expect(hook.result.current.isEditing).toBe(false);
      expect(hook.result.current.contextError).toBe("Network down");
    });

    it("enterEdit() with canUpdate=false sets contextError and skips edit mode", async () => {
      const { hook } = setup({
        context: makeContext({
          canUpdate:      false,
          disabledReason: "Permission denied",
        }),
      });
      await act(async () => { await hook.result.current.enterEdit(); });
      expect(hook.result.current.isEditing).toBe(false);
      expect(hook.result.current.contextError).toBe("Permission denied");
    });

    it("exitEdit() with no dirty state returns true and resets cleanly", async () => {
      const { hook } = setup();
      await act(async () => { await hook.result.current.enterEdit(); });
      const ok = await act(async () => hook.result.current.exitEdit());
      expect(ok).toBe(true);
      expect(hook.result.current.isEditing).toBe(false);
    });

    it("exitEdit({ discardDirty: false }) refuses when dirty (caller must prompt)", async () => {
      const { hook } = setup();
      await act(async () => { await hook.result.current.enterEdit(); });
      act(() => hook.result.current.setHeaderField("description", "Changed"));
      const ok = await act(async () => hook.result.current.exitEdit({ discardDirty: false }));
      expect(ok).toBe(false);
      expect(hook.result.current.isEditing).toBe(true);
      expect(hook.result.current.isDirty).toBe(true);
    });

    it("exitEdit({ discardDirty: true }) wipes pending state and exits", async () => {
      const { hook } = setup();
      await act(async () => { await hook.result.current.enterEdit(); });
      act(() => hook.result.current.setHeaderField("description", "Changed"));
      const ok = await act(async () => hook.result.current.exitEdit({ discardDirty: true }));
      expect(ok).toBe(true);
      expect(hook.result.current.isEditing).toBe(false);
      expect(hook.result.current.isDirty).toBe(false);
    });
  });

  describe("header field actions", () => {
    it("setHeaderField updates pendingHeaderPatch and clears matching fieldError", async () => {
      const { hook } = setup();
      await act(async () => { await hook.result.current.enterEdit(); });
      act(() => hook.result.current.setHeaderField("description", "New"));
      expect(hook.result.current.pendingHeaderPatch).toEqual({ description: "New" });
      expect(hook.result.current.dirtyCount).toBe(1);
      expect(hook.result.current.isDirty).toBe(true);
    });

    it("setHeaderField with the same value is a no-op (identity check)", async () => {
      const { hook } = setup();
      await act(async () => { await hook.result.current.enterEdit(); });
      act(() => hook.result.current.setHeaderField("description", "Same"));
      const firstPatch = hook.result.current.pendingHeaderPatch;
      act(() => hook.result.current.setHeaderField("description", "Same"));
      expect(hook.result.current.pendingHeaderPatch).toBe(firstPatch);
    });

    it("resetHeaderField removes from pendingHeaderPatch", async () => {
      const { hook } = setup();
      await act(async () => { await hook.result.current.enterEdit(); });
      act(() => hook.result.current.setHeaderField("description", "X"));
      act(() => hook.result.current.resetHeaderField("description"));
      expect(hook.result.current.pendingHeaderPatch).toEqual({});
      expect(hook.result.current.isDirty).toBe(false);
    });

    it("getFieldMask returns the entry from the mask or defaults to editable:true", async () => {
      const { hook } = setup();
      await act(async () => { await hook.result.current.enterEdit(); });
      expect(hook.result.current.getFieldMask("supplier_id").editable).toBe(true);
      // Field not in mask → default editable
      expect(hook.result.current.getFieldMask("unknown_field")).toEqual({ editable: true });
    });
  });

  describe("line bundle actions", () => {
    it("addLine appends and returns the temp index", async () => {
      const { hook } = setup();
      await act(async () => { await hook.result.current.enterEdit(); });
      let index = -1;
      act(() => { index = hook.result.current.addLine({ description: "New", quantity: 2 }); });
      expect(index).toBe(0);
      expect(hook.result.current.pendingLineCreates).toHaveLength(1);
      expect(hook.result.current.linesDirtyCount).toBe(1);
    });

    it("updateLine merges field deltas into pendingLineUpdates", async () => {
      const { hook } = setup();
      await act(async () => { await hook.result.current.enterEdit(); });
      act(() => hook.result.current.updateLine("line-1", { quantity: 5 }));
      act(() => hook.result.current.updateLine("line-1", { unit_price: 10 }));
      expect(hook.result.current.pendingLineUpdates["line-1"]).toEqual({ quantity: 5, unit_price: 10 });
    });

    it("updateLine on a line in pendingLineDeletes cancels the pending delete", async () => {
      const { hook } = setup();
      await act(async () => { await hook.result.current.enterEdit(); });
      act(() => hook.result.current.deleteLine("line-1"));
      expect(hook.result.current.pendingLineDeletes).toContain("line-1");
      act(() => hook.result.current.updateLine("line-1", { quantity: 7 }));
      expect(hook.result.current.pendingLineDeletes).not.toContain("line-1");
      expect(hook.result.current.pendingLineUpdates["line-1"]).toEqual({ quantity: 7 });
    });

    it("deleteLine wipes any pending update for the same line", async () => {
      const { hook } = setup();
      await act(async () => { await hook.result.current.enterEdit(); });
      act(() => hook.result.current.updateLine("line-1", { quantity: 9 }));
      act(() => hook.result.current.deleteLine("line-1"));
      expect(hook.result.current.pendingLineUpdates["line-1"]).toBeUndefined();
      expect(hook.result.current.pendingLineDeletes).toContain("line-1");
    });

    it("resetLine clears both updates and deletes for the line", async () => {
      const { hook } = setup();
      await act(async () => { await hook.result.current.enterEdit(); });
      act(() => hook.result.current.deleteLine("line-1"));
      act(() => hook.result.current.resetLine("line-1"));
      expect(hook.result.current.pendingLineDeletes).not.toContain("line-1");
      expect(hook.result.current.pendingLineUpdates["line-1"]).toBeUndefined();
      expect(hook.result.current.linesDirtyCount).toBe(0);
    });

    it("removePendingCreate drops the create at the given index", async () => {
      const { hook } = setup();
      await act(async () => { await hook.result.current.enterEdit(); });
      act(() => { hook.result.current.addLine({ a: 1 }); });
      act(() => { hook.result.current.addLine({ b: 2 }); });
      act(() => hook.result.current.removePendingCreate(0));
      expect(hook.result.current.pendingLineCreates).toEqual([{ b: 2 }]);
    });
  });

  describe("save", () => {
    it("save() with no pending state returns true without invoking callback", async () => {
      const saveChanges = vi.fn();
      const { hook } = setup({ saveImpl: saveChanges as never });
      await act(async () => { await hook.result.current.enterEdit(); });
      let result = false;
      await act(async () => { result = await hook.result.current.save(); });
      expect(result).toBe(true);
      expect(saveChanges).not.toHaveBeenCalled();
      expect(hook.result.current.saveStatus).toBe("saved");
    });

    it("save() success clears all dirty state and updates etag + mask", async () => {
      const onSaveSuccess = vi.fn();
      const { hook } = setup({ onSaveSuccess });
      await act(async () => { await hook.result.current.enterEdit(); });
      act(() => hook.result.current.setHeaderField("description", "Updated"));
      act(() => { hook.result.current.addLine({ a: 1 }); });
      await act(async () => { await hook.result.current.save(); });

      expect(hook.result.current.saveStatus).toBe("saved");
      expect(hook.result.current.etag).toBe("13");
      expect(hook.result.current.pendingHeaderPatch).toEqual({});
      expect(hook.result.current.pendingLineCreates).toEqual([]);
      expect(hook.result.current.isDirty).toBe(false);
      expect(onSaveSuccess).toHaveBeenCalledTimes(1);
    });

    it("save() with 409 conflict preserves all dirty state", async () => {
      const { hook } = setup({
        saveImpl: async () => ({
          type:        "conflict",
          currentEtag: "99",
          message:     "Stale",
        }),
      });
      await act(async () => { await hook.result.current.enterEdit(); });
      act(() => hook.result.current.setHeaderField("description", "Updated"));
      act(() => hook.result.current.updateLine("line-1", { qty: 3 }));
      await act(async () => { await hook.result.current.save(); });

      expect(hook.result.current.saveStatus).toBe("conflict");
      expect(hook.result.current.conflictEtag).toBe("99");
      expect(hook.result.current.pendingHeaderPatch).toEqual({ description: "Updated" });
      expect(hook.result.current.pendingLineUpdates["line-1"]).toEqual({ qty: 3 });
    });

    it("save() with 422 validation preserves dirty state and sets fieldErrors", async () => {
      const { hook } = setup({
        saveImpl: async () => ({
          type:        "validation",
          message:     "Bad fields",
          fieldErrors: { description: "Required", "line:line-1:qty": "Must be positive" },
        }),
      });
      await act(async () => { await hook.result.current.enterEdit(); });
      act(() => hook.result.current.setHeaderField("description", "X"));
      await act(async () => { await hook.result.current.save(); });

      expect(hook.result.current.saveStatus).toBe("saveFailed");
      expect(hook.result.current.fieldErrors["description"]).toBe("Required");
      expect(hook.result.current.fieldErrors["line:line-1:qty"]).toBe("Must be positive");
      expect(hook.result.current.pendingHeaderPatch).toEqual({ description: "X" });
    });

    it("save() with network error sets saveFailed + error message", async () => {
      const { hook } = setup({
        saveImpl: async () => ({ type: "error", message: "ECONNRESET" }),
      });
      await act(async () => { await hook.result.current.enterEdit(); });
      act(() => hook.result.current.setHeaderField("description", "X"));
      await act(async () => { await hook.result.current.save(); });

      expect(hook.result.current.saveStatus).toBe("saveFailed");
      expect(hook.result.current.saveError).toBe("ECONNRESET");
    });

    it("save() bundles header + lines into a single PATCH body", async () => {
      const saveChanges = vi.fn<SaveFn>(async () => ({ type: "ok" as const, response: makeOkResponse() }));
      const { hook } = setup({ saveImpl: saveChanges });
      await act(async () => { await hook.result.current.enterEdit(); });
      act(() => hook.result.current.setHeaderField("description", "H"));
      act(() => hook.result.current.updateLine("line-1", { qty: 5 }));
      act(() => hook.result.current.deleteLine("line-2"));
      act(() => { hook.result.current.addLine({ desc: "New" }); });
      await act(async () => { await hook.result.current.save(); });

      expect(saveChanges).toHaveBeenCalledTimes(1);
      const call = saveChanges.mock.calls[0];
      expect(call).toBeDefined();
      const [body, etag] = call!;
      expect(etag).toBe("12");
      expect(body).toEqual({
        header: { description: "H" },
        lines: {
          create: [{ desc: "New" }],
          update: [{ id: "line-1", data: { qty: 5 } }],
          delete: ["line-2"],
        },
      });
    });
  });

  describe("Phase 10 #3 — autosave", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    const autosaveCfg = (overrides?: Partial<DocumentAutosaveConfig>): DocumentAutosaveConfig => ({
      enabled:      true,
      debounceMs:   1500,
      pauseOnError: true,
      ...overrides,
    });

    it("autosave disabled (default): edits do NOT auto-trigger save", async () => {
      const saveChanges = vi.fn<SaveFn>(async () => ({ type: "ok" as const, response: makeOkResponse() }));
      const { hook } = setup({ saveImpl: saveChanges });
      await act(async () => { await hook.result.current.enterEdit(); });
      act(() => hook.result.current.setHeaderField("description", "X"));
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      expect(saveChanges).not.toHaveBeenCalled();
    });

    it("autosave enabled: edit + idle past debounceMs triggers save()", async () => {
      const saveChanges = vi.fn<SaveFn>(async () => ({ type: "ok" as const, response: makeOkResponse() }));
      const { hook } = setup({ saveImpl: saveChanges, autosave: autosaveCfg({ debounceMs: 1000 }) });
      await act(async () => { await hook.result.current.enterEdit(); });
      act(() => hook.result.current.setHeaderField("description", "X"));
      expect(saveChanges).not.toHaveBeenCalled();
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      expect(saveChanges).toHaveBeenCalledTimes(1);
    });

    it("rapid edits coalesce — only the last quiet period fires a single save", async () => {
      const saveChanges = vi.fn<SaveFn>(async () => ({ type: "ok" as const, response: makeOkResponse() }));
      const { hook } = setup({ saveImpl: saveChanges, autosave: autosaveCfg({ debounceMs: 1000 }) });
      await act(async () => { await hook.result.current.enterEdit(); });
      act(() => hook.result.current.setHeaderField("a", "1"));
      await act(async () => { await vi.advanceTimersByTimeAsync(500); });
      act(() => hook.result.current.setHeaderField("b", "2"));
      await act(async () => { await vi.advanceTimersByTimeAsync(500); });
      act(() => hook.result.current.setHeaderField("c", "3"));
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      expect(saveChanges).toHaveBeenCalledTimes(1);
    });

    it("save failure with pauseOnError=true halts further autosaves until manual save", async () => {
      const saveChanges = vi.fn<SaveFn>(async () => ({ type: "error" as const, message: "boom" }));
      const { hook } = setup({ saveImpl: saveChanges, autosave: autosaveCfg() });
      await act(async () => { await hook.result.current.enterEdit(); });

      act(() => hook.result.current.setHeaderField("a", "1"));
      await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
      expect(saveChanges).toHaveBeenCalledTimes(1);
      expect(hook.result.current.saveStatus).toBe("saveFailed");

      // Further edits should not re-trigger autosave (paused).
      act(() => hook.result.current.setHeaderField("b", "2"));
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      expect(saveChanges).toHaveBeenCalledTimes(1);
    });

    it("manual save() after failure clears pause and re-arms autosave", async () => {
      let nextResponse: DocumentEditSessionSaveOutcome = { type: "error", message: "first" };
      const saveChanges = vi.fn<SaveFn>(async () => nextResponse);
      const { hook } = setup({ saveImpl: saveChanges, autosave: autosaveCfg() });
      await act(async () => { await hook.result.current.enterEdit(); });

      // Fail once to enter paused state.
      act(() => hook.result.current.setHeaderField("a", "1"));
      await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
      expect(saveChanges).toHaveBeenCalledTimes(1);

      // Switch to success; manual save clears pause + succeeds.
      nextResponse = { type: "ok", response: makeOkResponse() };
      await act(async () => { await hook.result.current.save(); });
      expect(saveChanges).toHaveBeenCalledTimes(2);
      expect(hook.result.current.saveStatus).toBe("saved");

      // New edit re-arms autosave; debounce fires.
      act(() => hook.result.current.setHeaderField("b", "2"));
      await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
      expect(saveChanges).toHaveBeenCalledTimes(3);
    });

    it("exitEdit cancels pending autosave timer", async () => {
      const saveChanges = vi.fn<SaveFn>(async () => ({ type: "ok" as const, response: makeOkResponse() }));
      const { hook } = setup({ saveImpl: saveChanges, autosave: autosaveCfg() });
      await act(async () => { await hook.result.current.enterEdit(); });
      act(() => hook.result.current.setHeaderField("a", "1"));
      await act(async () => { await vi.advanceTimersByTimeAsync(500); });

      act(() => { hook.result.current.exitEdit({ discardDirty: true }); });

      // After exit, the pending timer is cancelled — even past debounceMs no save fires.
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      expect(saveChanges).not.toHaveBeenCalled();
    });

    it("pauseOnError=false: failures still mark saveFailed but autosave keeps firing", async () => {
      const saveChanges = vi.fn<SaveFn>(async () => ({ type: "error" as const, message: "x" }));
      const { hook } = setup({
        saveImpl: saveChanges,
        autosave: autosaveCfg({ pauseOnError: false }),
      });
      await act(async () => { await hook.result.current.enterEdit(); });

      act(() => hook.result.current.setHeaderField("a", "1"));
      await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
      expect(saveChanges).toHaveBeenCalledTimes(1);

      act(() => hook.result.current.setHeaderField("b", "2"));
      await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
      expect(saveChanges).toHaveBeenCalledTimes(2);
    });

    it("pauseAutosave() clears pending timer and blocks subsequent edits from re-scheduling", async () => {
      const saveChanges = vi.fn<SaveFn>(async () => ({ type: "ok" as const, response: makeOkResponse() }));
      const { hook } = setup({ saveImpl: saveChanges, autosave: autosaveCfg({ debounceMs: 1000 }) });
      await act(async () => { await hook.result.current.enterEdit(); });

      // Arm the timer.
      act(() => hook.result.current.setHeaderField("a", "1"));
      await act(async () => { await vi.advanceTimersByTimeAsync(500); });
      expect(saveChanges).not.toHaveBeenCalled();

      // Pause — the in-flight timer should be cancelled.
      act(() => hook.result.current.pauseAutosave());
      await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
      expect(saveChanges).not.toHaveBeenCalled();

      // Subsequent edits while paused should NOT re-arm the timer.
      act(() => hook.result.current.setHeaderField("b", "2"));
      await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
      expect(saveChanges).not.toHaveBeenCalled();
    });

    it("resumeAutosave() re-enables scheduling on the next edit", async () => {
      const saveChanges = vi.fn<SaveFn>(async () => ({ type: "ok" as const, response: makeOkResponse() }));
      const { hook } = setup({ saveImpl: saveChanges, autosave: autosaveCfg({ debounceMs: 1000 }) });
      await act(async () => { await hook.result.current.enterEdit(); });

      act(() => hook.result.current.pauseAutosave());
      act(() => hook.result.current.setHeaderField("a", "1"));
      await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
      expect(saveChanges).not.toHaveBeenCalled();

      // Resume + edit → debounce → save fires.
      act(() => hook.result.current.resumeAutosave());
      act(() => hook.result.current.setHeaderField("b", "2"));
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      expect(saveChanges).toHaveBeenCalledTimes(1);
    });
  });
});
