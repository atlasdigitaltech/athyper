/**
 * Document edit-session ↔ EntityEditState adapter.
 *
 * Narrows a `useDocumentEditSession` return value to the guard surface
 * expected by `EditGuardContext` / `EntityWorkspaceShell` consumers
 * (unsaved-change prompts, ⌘S keyboard shortcut). Mirrors the shape
 * adapter pattern used in `runtime-descriptor-edit-workspace.tsx:450`.
 *
 * Rich behaviors — `fieldMask`, `sectionMask`, autosave + pause/resume,
 * SSE recovery, 409 conflict dialogs, pending lines bundle — are
 * intentionally NOT surfaced through this adapter. They belong to the
 * object-page consumer that owns the session, not to the generic guard
 * layer. Keeping the guard surface tiny avoids forcing every guard
 * consumer (LedgerDetailPage, MasterDetailPage, future workspaces) to
 * understand document-runtime concerns.
 */

import type { UseDocumentEditSessionReturn } from "@athyper/content-ui";
import type { EntityEditState } from "@athyper/runtime-shared/edit";

export function toEntityEditState(
  session: UseDocumentEditSessionReturn,
): EntityEditState {
  return {
    isDirty: session.isDirty,
    dirtyFields: Object.keys(session.pendingHeaderPatch),
    isSaving: session.saveStatus === "saving",
    save: async () => {
      const ok = await session.save();
      return ok ? { ok: true } : { ok: false };
    },
    discard: session.discard,
  };
}
