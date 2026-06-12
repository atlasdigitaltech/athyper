"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@athyper/ui/primitives";
import { Button } from "@athyper/ui/primitives";
import {
  DocumentObjectPage,
  EditSessionProvider,
  useDocumentChangeStream,
  useDocumentDirtyMap,
  useDocumentEditSession,
  useDocumentPageController,
  useLazyDocumentSections,
  usePinOnScroll,
  type DocumentChangeEvent,
  type DocumentEditSessionLoadCallback,
  type DocumentEditSessionSaveCallback,
  type DocumentSectionDescriptor,
} from "@athyper/content-ui";
import type {
  DocumentAutosaveConfig,
  EditSessionPatchResponse,
} from "@athyper/api-contracts/edit-session";
import type {
  MetaEntityRuntimeDescriptor,
  ProcessRuntimeState,
} from "@athyper/runtime-contracts";
import type { RuntimeRecordRow } from "@athyper/runtime-shared/core";
import { RuntimeRecordChrome } from "./runtime-record-chrome";
import type { RuntimeRecordChromeModel } from "./runtime-header-model";
import type { RuntimeCanvasFlags } from "../surfaces/types";

/**
 * Object-page workspace — sibling to `RuntimeRecordWorkspace`.
 *
 * `RuntimeRecordWorkspace` is the generic record shell: tabs are click-
 * driven and edit state is the simple `EntityEditState` contract from
 * `@athyper/runtime-shared`. That model works fine for masters and ledgers
 * but is too thin for document workflows that need scrollspy-synced tabs,
 * server-truthed field masks, etag concurrency, SSE recovery, and a
 * bundled lines transaction.
 *
 * This workspace composes the full Phase 4-12 stack from `@athyper/content-ui`:
 *
 *   - `useDocumentEditSession`   — etag-based concurrency, fieldMask + sectionMask, autosave
 *   - `useDocumentChangeStream`  — SSE recovery for status-changed-during-edit
 *   - `useDocumentPageController`+ `useDocumentScrollSpy` — scroll-synced tab activation
 *   - `useLazyDocumentSections`  — lazy section data gating
 *   - `usePinOnScroll`           — derived header mode (expanded → pinned past threshold)
 *   - `useDocumentDirtyMap`      — section-level dirty + error badges
 *
 * Section content is the consumer's responsibility — `renderSection` is
 * called per descriptor and the consumer wires its own queries, panels,
 * and sub-components. Children wrapped in `EditSessionProvider` see the
 * live session via `useEditSessionContext`, which is what `MassEditSheet`
 * (and any future per-line action sheet) keys off of.
 *
 * The two recovery dialogs (proactive SSE + reactive 409) are owned here
 * so consumers don't have to wire them in every route. The reactive
 * dialog is gated by `streamConflict === null` so the proactive SSE
 * dialog wins when both fire (Phase 12 #2 race fix).
 */

export interface DocumentObjectPageWorkspaceProps {
  contract: MetaEntityRuntimeDescriptor;
  record: RuntimeRecordRow;
  recordId: string;
  recordUuid: string;
  processState?: ProcessRuntimeState;
  chrome: RuntimeRecordChromeModel;

  /** Ordered list of sections to render, identical to the EntityHeader tab strip. */
  sections: DocumentSectionDescriptor<string>[];
  /** Render contents of a single section. Called per descriptor in `sections`. */
  renderSection: (descriptor: DocumentSectionDescriptor<string>) => ReactNode;

  // Edit-session glue — route owns transport, this component owns lifecycle.
  loadEditContext: DocumentEditSessionLoadCallback;
  saveEditSession: DocumentEditSessionSaveCallback;
  /** Relay URL for the per-record SSE stream. */
  streamUrl: string;
  autosave?: DocumentAutosaveConfig;
  onSaveSuccess?: (response: EditSessionPatchResponse) => void;
  /**
   * Called when the user resolves an SSE recovery dialog with "Reload".
   * Should refetch the record + re-enter edit mode.
   */
  onRefreshRecord: () => Promise<void> | void;

  /**
   * When true, the workspace fires `enterEdit()` on mount. Use on routes
   * where the URL itself conveys intent to edit (e.g. `/.../[id]/edit`).
   * When false (default), the consumer drives entry via an Edit affordance
   * in the chrome / header actions.
   */
  autoEnterEdit?: boolean;

  flags?: RuntimeCanvasFlags;
}

const PIN_ON_SCROLL_THRESHOLD = 96;

interface StreamConflictState {
  newStatus?: string;
  serverEtag?: string;
  actorId?: string;
}

export function DocumentObjectPageWorkspace({
  contract: _contract,
  recordId: _recordId,
  recordUuid: _recordUuid,
  record: _record,
  processState: _processState,
  chrome,
  sections,
  renderSection,
  autoEnterEdit,
  loadEditContext,
  saveEditSession,
  streamUrl,
  autosave,
  onSaveSuccess,
  onRefreshRecord,
  flags,
}: DocumentObjectPageWorkspaceProps) {
  // ── Edit session ──────────────────────────────────────────────────────────
  const editSession = useDocumentEditSession({
    enabled: true,
    loadContext: loadEditContext,
    saveChanges: saveEditSession,
    onSaveSuccess,
    autosave,
  });

  // Auto-enter edit when the URL conveys intent (e.g. `/.../[id]/edit`). The
  // ref gate ensures `enterEdit()` fires exactly once across re-renders even
  // if `autoEnterEdit` toggles. Idempotent on the hook side: a second call
  // while `isEditing` is true returns early.
  const autoEnterFiredRef = useRef(false);
  useEffect(() => {
    if (!autoEnterEdit) return;
    if (autoEnterFiredRef.current) return;
    autoEnterFiredRef.current = true;
    void editSession.enterEdit();
  }, [autoEnterEdit, editSession]);

  // ── Section controller + scrollspy ────────────────────────────────────────
  const sectionIds = useMemo(() => sections.map((s) => s.id), [sections]);
  const sectionsKey = useMemo(
    () => sections.map((s) => `${s.id}|${s.hash ?? ""}`).join(","),
    [sections],
  );

  const { sectionByHash, sectionById } = useMemo(() => {
    const byHash = new Map<string, string>();
    const byId = new Map<string, string>();
    for (const s of sections) {
      byHash.set(s.hash ?? s.id, s.id);
      byId.set(s.id, s.hash ?? s.id);
    }
    return { sectionByHash: byHash, sectionById: byId };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionsKey]);

  const pageController = useDocumentPageController({
    sectionIds,
    hashFor: (id) => sectionById.get(id) ?? id,
    idForHash: (hash) => sectionByHash.get(hash) ?? null,
  });

  const lazy = useLazyDocumentSections({
    sections,
    enabled: true,
    initialLoadedIds: pageController.activeSectionId
      ? [pageController.activeSectionId]
      : [],
  });

  // ── Pin-on-scroll → header mode ───────────────────────────────────────────
  const isHeaderPinned = usePinOnScroll({ threshold: PIN_ON_SCROLL_THRESHOLD });
  const headerMode = isHeaderPinned ? "pinned" : "expanded";

  // ── Dirty map → tab badges + jump-to-error ────────────────────────────────
  // Only header fields are surfaced as section badges here; lines-bundle
  // dirtiness shows up on the dedicated lines section through its own
  // descriptor's `hasEditableFields` signal.
  const dirtyMap = useDocumentDirtyMap({
    sections,
    pendingPatch: editSession.pendingHeaderPatch,
    fieldErrors: editSession.fieldErrors,
  });

  // ── SSE recovery ──────────────────────────────────────────────────────────
  const [streamConflict, setStreamConflict] = useState<StreamConflictState | null>(null);
  useDocumentChangeStream({
    url: streamUrl,
    enabled: editSession.isEditing && !!editSession.etag,
    onEvent: (event: DocumentChangeEvent) => {
      if (event.type === "record.statusChanged" && event.data.etag) {
        if (event.data.etag !== editSession.etag) {
          // Phase 12 #2 — park autosave while the recovery dialog is open
          // so a queued save doesn't race the user's resolution.
          editSession.pauseAutosave();
          setStreamConflict({
            newStatus: event.data.newStatus,
            serverEtag: event.data.etag,
            actorId: event.data.actorId,
          });
        }
      } else if (event.type === "record.deleted") {
        editSession.pauseAutosave();
        setStreamConflict({ actorId: event.data.actorId });
      }
    },
  });

  const handleRefreshAfterConflict = useCallback(async () => {
    await onRefreshRecord();
  }, [onRefreshRecord]);

  // ── Inject section badges (dirty / error) into the header tab model ───────
  const chromeWithBadges = useMemo(() => {
    const badged = chrome.header.tabs?.map((tab) => {
      const errorCount = dirtyMap.errorCountBySection[tab.id] ?? 0;
      if (errorCount > 0) {
        return { ...tab, badge: { type: "error" as const, count: errorCount } };
      }
      if (dirtyMap.dirtySectionIds.has(tab.id)) {
        return { ...tab, badge: { type: "dirty" as const } };
      }
      return tab;
    });
    if (!badged) return chrome;
    return { ...chrome, header: { ...chrome.header, tabs: badged } };
  }, [chrome, dirtyMap.dirtySectionIds, dirtyMap.errorCountBySection]);

  // ── Section render gate (lazy data) ───────────────────────────────────────
  const renderSectionGated = useCallback(
    (descriptor: DocumentSectionDescriptor<string>) => {
      if (!lazy.shouldLoad(descriptor.id)) return null;
      return renderSection(descriptor);
    },
    [lazy, renderSection],
  );

  // ── Section nav handlers ──────────────────────────────────────────────────
  const handleTabChange = useCallback(
    (id: string) => {
      lazy.markLoaded(id);
      pageController.scrollToSection(id, "tabClick");
    },
    [lazy, pageController],
  );

  return (
    <EditSessionProvider value={editSession}>
      <div className="flex flex-col gap-2.5">
        <RuntimeRecordChrome
          chrome={chromeWithBadges}
          editMode={editSession.isEditing}
          mode={headerMode}
          activeTab={pageController.activeSectionId}
          onActiveTabChange={handleTabChange}
          flags={flags}
        />

        <DocumentObjectPage
          sections={sections}
          registerSectionRef={pageController.registerSectionRef}
          renderSection={renderSectionGated}
        />
      </div>

      {/* Reactive 409 dialog — fires when save returns conflict.
          Phase 12 #2: suppress when the proactive SSE recovery dialog
          is already open. */}
      <Dialog
        open={editSession.saveStatus === "conflict" && streamConflict === null}
        onOpenChange={(open) => { if (!open) editSession.discard(); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Document changed on the server</DialogTitle>
            <DialogDescription>
              {editSession.saveError ?? "Another user updated this document while you were editing."}
              {" "}
              Reload to merge their changes, or discard yours and exit.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                editSession.discard();
                editSession.exitEdit({ discardDirty: true });
                void handleRefreshAfterConflict();
              }}
            >
              Discard my changes
            </Button>
            <Button
              onClick={async () => {
                editSession.discard();
                editSession.exitEdit({ discardDirty: true });
                await handleRefreshAfterConflict();
                await editSession.enterEdit();
              }}
            >
              Reload &amp; keep editing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Proactive SSE recovery dialog — fires before any save attempt. */}
      <Dialog
        open={streamConflict !== null}
        onOpenChange={(open) => {
          if (!open) {
            // Dismiss via X / overlay → resume autosave so the user can
            // keep editing. Discard / Reload buttons exit edit mode,
            // which clears the pause via exitEdit().
            editSession.resumeAutosave();
            setStreamConflict(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {streamConflict?.newStatus
                ? "This document was just updated"
                : "This document was just deleted"}
            </DialogTitle>
            <DialogDescription>
              {streamConflict?.newStatus
                ? `Another user moved this document to "${streamConflict.newStatus}" while you were editing. Your unsaved changes are preserved — reload to merge their version, or discard yours and exit.`
                : "Another user deleted this document. Your unsaved changes cannot be saved."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                editSession.discard();
                editSession.exitEdit({ discardDirty: true });
                setStreamConflict(null);
                void handleRefreshAfterConflict();
              }}
            >
              Discard my changes
            </Button>
            {streamConflict?.newStatus && (
              <Button
                onClick={async () => {
                  editSession.discard();
                  editSession.exitEdit({ discardDirty: true });
                  setStreamConflict(null);
                  await handleRefreshAfterConflict();
                  await editSession.enterEdit();
                }}
              >
                Reload &amp; keep editing
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </EditSessionProvider>
  );
}

