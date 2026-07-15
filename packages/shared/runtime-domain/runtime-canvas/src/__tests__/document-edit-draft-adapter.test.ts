import { describe, expect, it, vi } from "vitest";
import type { UseDocumentEditDraftReturn } from "@athyper/content-ui";
import { toEntityEditState } from "../record/document-edit-draft-adapter";

/**
 * Builds a stub `UseDocumentEditDraftReturn` with the four properties the
 * adapter actually reads. Unread fields are intentionally narrowed to `null`
 * / no-op functions; the adapter must not depend on anything else.
 */
function stubSession(over: Partial<UseDocumentEditDraftReturn> = {}): UseDocumentEditDraftReturn {
  const base: Partial<UseDocumentEditDraftReturn> = {
    isEditing: true,
    isLoadingContext: false,
    contextError: null,
    etag: "v1",
    status: "draft",
    canUpdate: true,
    disabledReason: null,
    fieldMask: {},
    sectionMask: {},
    pendingHeaderPatch: {},
    dirtyCount: 0,
    pendingLineCreates: [],
    pendingLineUpdates: {},
    pendingLineDeletes: [],
    linesDirtyCount: 0,
    isDirty: false,
    fieldErrors: {},
    saveStatus: "idle",
    saveError: null,
    conflictEtag: null,
    enterEdit: vi.fn().mockResolvedValue(true),
    exitEdit: vi.fn().mockReturnValue(true),
    setHeaderField: vi.fn(),
    resetHeaderField: vi.fn(),
    discard: vi.fn(),
    save: vi.fn().mockResolvedValue(true),
    getFieldMask: () => ({ editable: true }),
    pauseAutosave: vi.fn(),
    resumeAutosave: vi.fn(),
    addLine: vi.fn().mockReturnValue(0),
    removePendingCreate: vi.fn(),
    updateLine: vi.fn(),
    deleteLine: vi.fn(),
    resetLine: vi.fn(),
  };
  return { ...base, ...over } as UseDocumentEditDraftReturn;
}

describe("toEntityEditState", () => {
  it("marks clean session as not dirty", () => {
    const state = toEntityEditState(stubSession({ isDirty: false, pendingHeaderPatch: {} }));
    expect(state.isDirty).toBe(false);
    expect(state.dirtyFields).toEqual([]);
  });

  it("surfaces dirty fields from pendingHeaderPatch keys", () => {
    const state = toEntityEditState(stubSession({
      isDirty: true,
      pendingHeaderPatch: { description: "x", amount_gross: 100 },
    }));
    expect(state.isDirty).toBe(true);
    expect(state.dirtyFields.sort()).toEqual(["amount_gross", "description"]);
  });

  it("maps saveStatus 'saving' → isSaving=true", () => {
    expect(toEntityEditState(stubSession({ saveStatus: "saving" })).isSaving).toBe(true);
    expect(toEntityEditState(stubSession({ saveStatus: "idle" })).isSaving).toBe(false);
    expect(toEntityEditState(stubSession({ saveStatus: "saved" })).isSaving).toBe(false);
    expect(toEntityEditState(stubSession({ saveStatus: "conflict" })).isSaving).toBe(false);
  });

  it("save() proxies session.save() and maps boolean → { ok }", async () => {
    const sessionSave = vi.fn().mockResolvedValue(true);
    const okState = toEntityEditState(stubSession({ save: sessionSave }));
    await expect(okState.save()).resolves.toEqual({ ok: true });
    expect(sessionSave).toHaveBeenCalledOnce();

    const failSave = vi.fn().mockResolvedValue(false);
    const failState = toEntityEditState(stubSession({ save: failSave }));
    await expect(failState.save()).resolves.toEqual({ ok: false });
  });

  it("discard() proxies session.discard()", () => {
    const sessionDiscard = vi.fn();
    toEntityEditState(stubSession({ discard: sessionDiscard })).discard();
    expect(sessionDiscard).toHaveBeenCalledOnce();
  });

  it("does NOT leak rich behaviors onto EntityEditState", () => {
    const state = toEntityEditState(stubSession());
    // Adapter exposes only the guard surface. Document-specific concerns
    // (fieldMask, pendingLineCreates, autosave control, SSE state) must
    // not be reachable through the EntityEditState the adapter returns.
    expect("fieldMask" in state).toBe(false);
    expect("pendingLineCreates" in state).toBe(false);
    expect("pauseAutosave" in state).toBe(false);
    expect("conflictEtag" in state).toBe(false);
  });
});
