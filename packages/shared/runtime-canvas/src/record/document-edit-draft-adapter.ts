import type { UseDocumentEditDraftReturn } from "@athyper/content-ui";
import type { EntityEditState } from "@athyper/runtime-shared";

/** Narrows the workspace draft controller to the generic unsaved-change guard. */
export function toEntityEditState(draft: UseDocumentEditDraftReturn): EntityEditState {
  return {
    isDirty: draft.isDirty,
    dirtyFields: Object.keys(draft.pendingHeaderPatch),
    isSaving: draft.saveStatus === "saving",
    save: async () => (await draft.save() ? { ok: true } : { ok: false }),
    discard: draft.discard,
  };
}

